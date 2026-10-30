import { unstable_cache } from "next/cache";
import { fetchSecuritySource, newestFirst, securitySources, type SecurityFeed } from "@/lib/security-feed";

// Public intelligence only; this route never accesses a tenant or repository.
// Cache successful sources independently so an outage cannot erase the other feed.
const loaders = securitySources.map((source, index) =>
  unstable_cache(() => fetchSecuritySource(index), ["security-updates-v1", source.name], { revalidate: 900 }),
);

export async function GET() {
  const results = await Promise.allSettled(loaders.map(load => load()));
  const feed: SecurityFeed = {
    items: results.flatMap(result => result.status === "fulfilled" ? result.value.items : []).sort(newestFirst),
    sources: results.map((result, index) => ({
      name: securitySources[index].name,
      available: result.status === "fulfilled",
      checkedAt: result.status === "fulfilled" ? result.value.checkedAt : null,
    })),
  };
  return Response.json(feed, {
    status: feed.sources.some(source => source.available) ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
