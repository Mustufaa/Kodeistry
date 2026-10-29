import type { MetadataRoute } from "next";
import { publicPages } from "@/lib/public-content";
import { absoluteUrl } from "@/lib/seo";

// Generated from the explicit public route catalog; no account data or invented dates.
export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages.map(({ path }) => ({ url: absoluteUrl(path) }));
}
