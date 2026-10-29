# SEO, GEO, and AEO operations

## Render configuration

Public SEO content is generated at build time. Configure these values on the frontend Render Docker service, then rebuild:

| Variable | Value / behavior |
| --- | --- |
| SITE_URL | https://kodeistry.onrender.com (default). Use the actual public frontend origin, without a path, query, or credentials. |
| GOOGLE_SITE_VERIFICATION | Optional override using the real token from Search Console. The previously supplied token remains the default. |
| BING_SITE_VERIFICATION | Optional real Bing meta-tag token. No tag is emitted when unset. |
| NEXT_PUBLIC_API_URL | Existing backend API URL; preserve its current value. |

The Dockerfile declares the SEO values as build arguments. Render passes service environment variables as Docker build arguments. These values are public metadata, not credentials. Do not place backend secrets in the frontend. A runtime-only change will not update prerendered metadata: rebuild after changes.

Preview/staging deployments must not advertise the production identity as their own. Configure the correct SITE_URL and restrict staging access at the hosting layer. The public pages in this repository are intentionally indexable.

## Google Search Console

1. Deploy the frontend and check the homepage source for the real google-site-verification tag. Keep the tag after verification.
2. Open https://search.google.com/search-console and add the **URL-prefix** property https://kodeistry.onrender.com/. The meta-tag method verifies a URL-prefix property. A Domain property requires DNS verification, which is usually unavailable for a shared onrender.com subdomain.
3. Choose the HTML tag method and click Verify. The configured token must belong to that property/account.
4. Submit https://kodeistry.onrender.com/sitemap.xml through Sitemaps.
5. Inspect the homepage, /docs, /faq, and the feature pages with URL Inspection. Run the live test, check the selected canonical and indexing permission, and request indexing for representative pages if appropriate.
6. Monitor Pages, Sitemaps, Core Web Vitals, and Performance reports after Google has collected data. Track queries, impressions, clicks, and which public pages are indexed.

Verification and sitemap submission have not been performed by this implementation.

## Bing Webmaster Tools

1. Open https://www.bing.com/webmasters and add the frontend URL, or import the verified property from Google Search Console.
2. For manual meta-tag verification, copy the actual msvalidate.01 value into BING_SITE_VERIFICATION on Render, rebuild, check page source, then complete verification.
3. Submit the same sitemap URL. Use URL Inspection and Site Scan, then monitor Search Performance and indexing reports.

## Crawling policy

- Only the nine public HTML routes appear in the generated sitemap: home, three feature guides, how-it-works, docs, FAQ, privacy, and terms.
- Public pages explicitly enable indexing. The root default is noindex so a new route is not accidentally indexable.
- Authentication, invitation, onboarding, dashboard, repository, review, findings, analytics, team, settings, and scanner routes inherit noindex metadata. They also receive X-Robots-Tag response headers.
- robots.txt allows crawling of those shells so search engines can see noindex. It disallows the frontend API namespace. It does not block Next.js assets or public content.
- This does not secure a URL. Existing backend authentication, tenant membership, and repository authorization remain essential and unchanged.
- The separate backend origin is not controlled by the frontend robots.txt. Its API routes remain absent from the sitemap. Consider an API-origin X-Robots-Tag policy as a separate backend deployment task.
- Sitemap entries have no fabricated last-modified timestamp. Update the explicit public route catalog when publishing a real page.

## Structured data and AI discovery

The homepage describes Organization, WebSite, and SoftwareApplication. Inner public pages have BreadcrumbList, and /faq has FAQPage generated from the same questions and answers visible to visitors. JSON-LD escapes less-than signs before inclusion in HTML. No ratings, reviews, prices, customer counts, or awards are invented.

These schemas describe the product; they do not guarantee rich results. Software rich-result validators may report missing commercial/rating properties that this product has not verified. Do not invent those values to suppress warnings. Do not assume FAQ search-result eligibility.

The optional /llms.txt summarizes public facts and links to public docs. It is not an indexing protocol guarantee. Standard crawlable HTML, clear source descriptions, useful content, and consistent identity remain the foundation for AI discovery.

## Repeatable validation

From frontend, run:

```powershell
npm.cmd run build
npm.cmd run lint
New-Item -ItemType Directory -Force .next/standalone/public, .next/standalone/.next/static
Copy-Item -Path public/* -Destination .next/standalone/public -Recurse -Force
Copy-Item -Path .next/static/* -Destination .next/standalone/.next/static -Recurse -Force
$env:PORT = "3000"
$env:HOSTNAME = "127.0.0.1"
node .next/standalone/server.js
```

In another terminal:

```powershell
python scripts/verify-seo.py http://127.0.0.1:3000 https://kodeistry.onrender.com
```

The HTTP checker validates all public pages without authentication, route-specific titles, descriptions, canonicals, social tags, JSON-LD shape, visible FAQ/schema parity, image attributes, heading order, internal links/anchors, all private route noindex responses, 404 status, slash redirect, robots, sitemap, llms.txt, the PNG social image, and image optimization.

For existing backend tests, use an isolated database rather than production credentials:

```powershell
$env:DATABASE_URL = 'sqlite+aiosqlite:///:memory:'
python -m pytest -q -p no:cacheprovider
```

Use the browser at 320, 375, 768, and 1440px to check horizontal overflow, mobile menu access, keyboard focus/skip links, light/dark theme, and Kody. Turn on reduced motion: the hero stays at its completed frame, the robot uses a slower patrol without pointer chasing or scan effects, and Kody stops its continuous animations. Check that animations resume if the preference changes.

Run Lighthouse or PageSpeed Insights on the deployed URL and track field LCP, INP, and CLS through Search Console. Build/HTML checks are not Web Vitals measurements. Test real OAuth and an authorized test-repository pull request separately; an HTML check does not prove live installation/webhook/provider behavior.

## Product source-of-truth map

| Public statement | Repository evidence |
| --- | --- |
| Trigger events, signature checking, connected repo lookup, stale-head protection | backend/app/api/github.py |
| Added-line-only review input | backend/app/services/diff_service.py and review_service.py |
| AI prompt and configured provider behavior | backend/app/services/gemini_service.py |
| Finding fields/categories | backend/app/schemas/review.py |
| App permissions and setup | docs/github-app-setup.md |
| Repository authorization | backend/app/core/repository_access.py |
| Scanner availability | frontend/app/(dashboard)/secret-scanner/page.tsx |
| Kody limits | backend/app/knowledge/kodeistry.md and docs/kody.md |

## References

- [Next.js metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [Google ownership verification](https://support.google.com/webmasters/answer/9008080)
- [Google AI features guidance](https://developers.google.com/search/docs/appearance/ai-features)
- [Google robots/noindex guidance](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Bing site verification](https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b)
- [Schema Markup Validator](https://validator.schema.org/)
- [Google Rich Results Test](https://search.google.com/test/rich-results)
