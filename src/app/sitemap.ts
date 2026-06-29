import type { MetadataRoute } from "next"

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: new URL("/", appUrl).toString(),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ]
}
