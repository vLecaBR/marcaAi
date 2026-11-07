import type { MetadataRoute } from "next"

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")

/** Indexa só o site público; áreas logadas e páginas por uid (dados do paciente) ficam fora dos buscadores. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/settings", "/onboarding", "/booking/", "/api/"] }],
    sitemap: `${BASE}/sitemap.xml`,
  }
}
