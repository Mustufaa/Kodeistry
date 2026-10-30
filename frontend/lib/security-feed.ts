import { z } from "zod";

export type SecurityUpdate = {
  id: string;
  title: string;
  summary: string;
  source: "CISA KEV" | "GitHub Advisories";
  kind: "exploited" | "ransomware" | "advisory";
  publishedAt: string;
  url: string;
  reference: string;
  severity: string | null;
};
export type SecurityFeed = {
  items: SecurityUpdate[];
  sources: { name: string; available: boolean; checkedAt: string | null }[];
};

const text = z.string().min(1).max(4000);
const cve = z.string().regex(/^CVE-\d{4}-\d{4,}$/);
const date = z.string().refine(value => Number.isFinite(Date.parse(value)));
const kevSchema = z.object({
  vulnerabilities: z.array(z.object({
    cveID: cve, vulnerabilityName: text, shortDescription: text,
    dateAdded: date, knownRansomwareCampaignUse: z.string(),
  })),
});
const githubSchema = z.array(z.object({
  ghsa_id: z.string().regex(/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i),
  cve_id: cve.nullable(), summary: text, published_at: date,
  severity: z.enum(["unknown", "low", "medium", "high", "critical"]),
  withdrawn_at: z.string().nullable(), type: z.string(),
}));

export function parseKev(input: unknown): SecurityUpdate[] {
  const unique = new Map<string, SecurityUpdate>();
  for (const item of kevSchema.parse(input).vulnerabilities) {
    unique.set(item.cveID, {
      id: "cisa:" + item.cveID, reference: item.cveID, title: item.vulnerabilityName,
      summary: item.shortDescription, source: "CISA KEV",
      kind: item.knownRansomwareCampaignUse === "Known" ? "ransomware" : "exploited",
      publishedAt: new Date(item.dateAdded).toISOString(), severity: null,
      url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=" + item.cveID,
    });
  }
  return [...unique.values()].sort(newestFirst).slice(0, 30);
}

export function parseGithub(input: unknown): SecurityUpdate[] {
  const unique = new Map<string, SecurityUpdate>();
  for (const item of githubSchema.parse(input)) {
    if (item.withdrawn_at || item.type !== "reviewed") continue;
    unique.set(item.ghsa_id, {
      id: "github:" + item.ghsa_id, reference: item.cve_id ?? item.ghsa_id,
      title: item.summary, summary: "Newly published, GitHub-reviewed software security advisory.",
      source: "GitHub Advisories", kind: "advisory", severity: item.severity,
      publishedAt: new Date(item.published_at).toISOString(),
      url: "https://github.com/advisories/" + item.ghsa_id,
    });
  }
  return [...unique.values()].sort(newestFirst).slice(0, 30);
}

export function newestFirst(a: SecurityUpdate, b: SecurityUpdate) {
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id);
}

// Fixed public sources only: never forward session cookies, tokens, or user-supplied URLs.
export const securitySources = [
  { name: "CISA KEV", url: "https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json", parse: parseKev },
  { name: "GitHub Advisories", url: "https://api.github.com/advisories?type=reviewed&is_withdrawn=false&per_page=30&sort=published&direction=desc", parse: parseGithub },
] as const;

export async function fetchSecuritySource(index: number, fetcher: typeof fetch = fetch) {
  const source = securitySources[index];
  if (!source) throw new Error("Unknown security source");
  const response = await fetcher(source.url, {
    headers: { Accept: "application/json", "User-Agent": "Kodeistry-Security-Updates" },
    signal: AbortSignal.timeout(12000), redirect: "error",
  });
  if (!response.ok) throw new Error("Security feed unavailable");
  const body = await response.text();
  if (body.length > 6_000_000) throw new Error("Security feed too large");
  return { items: source.parse(JSON.parse(body)), checkedAt: new Date().toISOString() };
}
