import assert from "node:assert/strict";
import test from "node:test";
import { fetchSecuritySource, parseGithub, parseKev } from "../lib/security-feed.ts";

const kev = (overrides = {}) => ({
  cveID: "CVE-2026-12345", vulnerabilityName: "Vendor issue", shortDescription: "Advisory summary",
  dateAdded: "2026-10-01", knownRansomwareCampaignUse: "Unknown", ...overrides,
});
const ghsa = (overrides = {}) => ({
  ghsa_id: "GHSA-abcd-1234-efgh", cve_id: "CVE-2026-12345", summary: "Package vulnerability",
  published_at: "2026-10-02T00:00:00Z", severity: "high", withdrawn_at: null, type: "reviewed", ...overrides,
});

test("CISA sorts by catalog addition, deduplicates, and labels only confirmed ransomware use", () => {
  const items = parseKev({ vulnerabilities: [kev(), kev(), kev({ cveID: "CVE-2025-99999", dateAdded: "2026-10-03", knownRansomwareCampaignUse: "Known" })] });
  assert.equal(items.length, 2);
  assert.equal(items[0].reference, "CVE-2025-99999");
  assert.equal(items[0].kind, "ransomware");
  assert.equal(items[1].kind, "exploited");
  assert.equal(items[0].severity, null, "do not invent severity for CISA entries");
});

test("GitHub excludes withdrawn/unreviewed entries and builds safe URLs from validated IDs", () => {
  const items = parseGithub([ghsa({ html_url: "javascript:alert(1)" }), ghsa(), ghsa({ ghsa_id: "GHSA-aaaa-bbbb-cccc", withdrawn_at: "2026-10-03" }), ghsa({ type: "unreviewed" })]);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://github.com/advisories/GHSA-abcd-1234-efgh");
  assert.equal(items[0].severity, "high");
});

test("invalid IDs, dates, and upstream shapes fail validation", () => {
  assert.throws(() => parseKev({ vulnerabilities: [kev({ cveID: "../unsafe" })] }));
  assert.throws(() => parseGithub([ghsa({ published_at: "invalid" })]));
  assert.throws(() => parseGithub({ message: "Rate limit exceeded" }));
});

test("public fetch uses fixed hosts, no credentials, timeout, and normalized output", async () => {
  const result = await fetchSecuritySource(1, async (url, options) => {
    assert.ok(url.startsWith("https://api.github.com/advisories?"));
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    return new Response(JSON.stringify([ghsa()]));
  });
  assert.equal(result.items.length, 1);
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
});

test("fetch rejects errors, invalid JSON, and oversized payloads", async () => {
  await assert.rejects(fetchSecuritySource(1, async () => new Response("rate limit", { status: 429 })));
  await assert.rejects(fetchSecuritySource(0, async () => new Response("not JSON")));
  await assert.rejects(fetchSecuritySource(0, async () => new Response("x".repeat(6_000_001))));
});
