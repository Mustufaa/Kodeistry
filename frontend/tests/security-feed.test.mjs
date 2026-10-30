import assert from "node:assert/strict";
import test from "node:test";
import { fetchSecuritySource, parseKev } from "../lib/security-feed.ts";

const kev = (overrides = {}) => ({
  cveID: "CVE-2026-12345", vulnerabilityName: "Vendor issue", shortDescription: "Advisory summary",
  dateAdded: "2026-10-01", knownRansomwareCampaignUse: "Unknown", ...overrides,
});

test("CISA sorts by catalog addition, deduplicates, and labels only confirmed ransomware use", () => {
  const items = parseKev({ vulnerabilities: [kev(), kev(), kev({ cveID: "CVE-2025-99999", dateAdded: "2026-10-03", knownRansomwareCampaignUse: "Known" })] });
  assert.equal(items.length, 2);
  assert.equal(items[0].reference, "CVE-2025-99999");
  assert.equal(items[0].kind, "ransomware");
  assert.equal(items[1].kind, "exploited");
  assert.equal(items[0].severity, null, "do not invent severity for CISA entries");
});


test("invalid IDs, dates, and upstream shapes fail validation", () => {
  assert.throws(() => parseKev({ vulnerabilities: [kev({ cveID: "../unsafe" })] }));
  assert.throws(() => parseKev({ vulnerabilities: [kev({ dateAdded: "invalid" })] }));
  assert.throws(() => parseKev({ message: "Unavailable" }));
});

test("public fetch uses fixed hosts, no credentials, timeout, and normalized output", async () => {
  const result = await fetchSecuritySource(0, async (url, options) => {
    assert.ok(url.startsWith("https://raw.githubusercontent.com/cisagov/kev-data/"));
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    return new Response(JSON.stringify({ vulnerabilities: [kev()] }));
  });
  assert.equal(result.items.length, 1);
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
});

test("fetch rejects errors, invalid JSON, and oversized payloads", async () => {
  await assert.rejects(fetchSecuritySource(0, async () => new Response("rate limit", { status: 429 })));
  await assert.rejects(fetchSecuritySource(0, async () => new Response("not JSON")));
  await assert.rejects(fetchSecuritySource(0, async () => new Response("x".repeat(6_000_001))));
});
