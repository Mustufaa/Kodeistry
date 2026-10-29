import type { Metadata } from "next";

const origin = new URL(process.env.SITE_URL || "https://kodeistry.onrender.com");
if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
  throw new Error("SITE_URL must be an HTTP(S) origin without a path, credentials, query, or fragment.");
}
export const siteUrl = origin.origin;
export const siteDescription = "Automate GitHub pull request reviews with Kodeistry. Detect bugs, security vulnerabilities, and code quality issues using AI-powered code analysis.";
export const homeTitle = "Kodeistry | AI Code Review Tool for GitHub Pull Requests";
export const absoluteUrl = (path: string) => new URL(path, siteUrl + "/").toString();

export function publicMetadata(path: string, title: string, description: string): Metadata {
  const fullTitle = path === "/" ? title : title + " | Kodeistry";
  return {
    title: { absolute: fullTitle }, description,
    alternates: { canonical: absoluteUrl(path) },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website", locale: "en_US", siteName: "Kodeistry",
      title: fullTitle, description, url: absoluteUrl(path),
      images: [{ url: absoluteUrl("/social-image"), width: 1200, height: 630, alt: "Kodeistry — AI code review for GitHub pull requests" }],
    },
    twitter: {
      card: "summary_large_image", title: fullTitle, description,
      images: [{ url: absoluteUrl("/social-image"), alt: "Kodeistry — AI code review for GitHub pull requests" }],
    },
  };
}
export function privateMetadata(title: string): Metadata {
  return { title, description: title + " in Kodeistry. Sign in to access your account and authorized workspace.", robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export function breadcrumbData(path: string, title: string) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: title, item: absoluteUrl(path) },
    ],
  };
}
export const productData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": absoluteUrl("/#organization"), name: "Kodeistry", url: absoluteUrl("/"), logo: absoluteUrl("/brand/kodeistry-black.png") },
    { "@type": "WebSite", "@id": absoluteUrl("/#website"), name: "Kodeistry", url: absoluteUrl("/"), inLanguage: "en", publisher: { "@id": absoluteUrl("/#organization") } },
    { "@type": "SoftwareApplication", "@id": absoluteUrl("/#software"), name: "Kodeistry", url: absoluteUrl("/"), applicationCategory: "DeveloperApplication", operatingSystem: "Web", description: siteDescription, publisher: { "@id": absoluteUrl("/#organization") }, featureList: ["AI pull request reviews", "Inline GitHub review comments", "Security and code quality findings", "Review history and analytics", "CSV reports", "Fix suggestions and prompts"] },
  ],
};
