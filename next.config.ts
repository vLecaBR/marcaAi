import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],
  typescript: {
    // !! AVISO !!
    // Ignoramos o typechecking na Vercel para acelerar o build e evitar erros de falta de memória (OOM) no plano Hobby (1GB RAM).
    // O GitHub Actions já é responsável por rodar o TypeScript e testes.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Ignora ESLint no build da Vercel pelo mesmo motivo acima.
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }
        ],
      },
    ];
  },
};

export default nextConfig;