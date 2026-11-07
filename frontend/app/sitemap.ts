import type { MetadataRoute } from "next"

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/login", "/privacidade", "/termos"].map((p) => ({ url: `${BASE}${p}`, changeFrequency: "monthly", priority: p === "" ? 1 : 0.5 }))
}
