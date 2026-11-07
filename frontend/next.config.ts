import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV !== "production"

/**
 * Content-Security-Policy (F7). O navegador só fala com o próprio site (o BFF fala com a API no servidor) e com o Stripe
 * (Elements/3DS). `'unsafe-inline'` em script/style é necessário enquanto não houver CSP por nonce (limitação do Next com
 * páginas estáticas); `'unsafe-eval'` só em desenvolvimento (HMR). Próximo passo de endurecimento: CSP com nonce.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.stripe.com https://m.stripe.network${isDev ? " ws: http://localhost:*" : ""}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ")

const nextConfig: NextConfig = {
  // Imagem Docker enxuta (F9): gera .next/standalone com o server.js mínimo.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self), interest-cohort=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        ],
      },
    ]
  },
}

export default nextConfig
