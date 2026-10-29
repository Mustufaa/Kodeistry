import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // Let crawlers read noindex on auth/dashboard shells. Blocking those paths
    // would prevent them from seeing the indexing directive.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/api$"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
