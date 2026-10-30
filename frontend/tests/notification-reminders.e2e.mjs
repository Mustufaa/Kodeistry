import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || "chrome", headless: true });
try {
  for (const width of [375, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let failure = false;
    let release;
    let userId = 1;
    const ready = new Promise(resolve => { release = resolve; });
    let items = [
      { id: "cisa:CVE-2026-12345", title: "Vendor ransomware vulnerability", summary: "Confirmed public advisory.", source: "CISA KEV", kind: "ransomware", reference: "CVE-2026-12345", publishedAt: "2026-10-29T12:00:00Z", severity: null, url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=CVE-2026-12345" },
      { id: "github:GHSA-abcd-1234-efgh", title: "<script>alert(1)</script> Package issue", summary: "Newly published advisory.", source: "GitHub Advisories", kind: "advisory", reference: "GHSA-abcd-1234-efgh", severity: "high", publishedAt: "2026-10-29T11:00:00Z", url: "https://github.com/advisories/GHSA-abcd-1234-efgh" },
    ];
    let partial = false;
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      let json = [];
      if (path.endsWith("/auth/me")) json = { id: userId, full_name: "Test User", email: "test@example.com", onboarding_tenant_id: 1 };
      else if (path.endsWith("/onboarding/status")) json = { onboarding_complete: true };
      else if (/\/tenants\/$/.test(path)) json = [{ id: 1, name: "Test team", role: "OWNER" }];
      else if (path.endsWith("/access")) json = { role: "OWNER", repository_ids: [1] };
      else if (path.endsWith("/security-updates")) {
        await ready;
        if (failure) return route.fulfill({ status: 503, json: { items: [], sources: [] } });
        json = { items, sources: [{ name: "CISA KEV", available: true, checkedAt: "2026-10-30T12:00:00Z" }, { name: "GitHub Advisories", available: !partial, checkedAt: partial ? null : "2026-10-30T12:00:00Z" }] };
      } else if (path.endsWith("/findings")) throw new Error("Notification bell must not request repository findings");
      await route.fulfill({ json });
    });
    const url = (process.env.TEST_BASE_URL || "http://127.0.0.1:3000") + "/reviews";
    await page.goto(url);
    const bell = page.getByRole("button", { name: /^Notifications/ });
    await bell.click();
    const dialog = page.getByRole("dialog", { name: "Security updates" });
    await expect(dialog.getByRole("status", { name: "Loading security updates" })).toBeVisible();
    release();
    await expect(dialog.locator("li")).toHaveCount(2);
    await expect(dialog.getByText("Known ransomware use", { exact: true })).toBeVisible();
    assert.equal(await dialog.locator("script").count(), 0);
    await expect(dialog.getByRole("link", { name: /Package issue/ })).toHaveAttribute("rel", "noopener noreferrer");
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(bell).toBeFocused();
    await expect(bell).toHaveAccessibleName("Notifications: 2 unread security updates");
    await bell.click();
    await dialog.getByRole("button", { name: "Mark as read", exact: true }).first().click();
    await expect(bell).toHaveAccessibleName("Notifications: 1 unread security updates");
    await dialog.getByRole("button", { name: "Mark all read" }).click();
    await dialog.getByRole("button", { name: "Unread (0)", exact: true }).click();
    await expect(dialog.getByText("You're all caught up")).toBeVisible();
    await page.reload();
    await bell.click();
    await expect(dialog.locator("li")).toHaveCount(2);
    await expect(bell).toHaveAccessibleName("Notifications");
    failure = true;
    await dialog.getByRole("button", { name: "Refresh security updates" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Refresh failed.", { timeout: 15000 });
    failure = false;
    partial = true;
    await dialog.getByRole("button", { name: "Retry" }).click();
    await expect(dialog.getByText(/GitHub Advisories temporarily unavailable/)).toBeVisible();
    userId = 2;
    await page.reload();
    await expect(bell).toHaveAccessibleName("Notifications: 2 unread security updates");
    await bell.click();
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("Storage blocked"); }; });
    await dialog.getByRole("button", { name: "Mark all read" }).click();
    await expect(bell).toHaveAccessibleName("Notifications");
    await page.keyboard.press("Escape");
    items = [];
    await bell.click();
    await expect(dialog.getByText("No security updates available", { exact: true })).toBeVisible();
    console.log(`PASS ${width}px: feed, loading, read/unread persistence, account isolation, safe text/links, keyboard, overflow, error/retry, partial source, empty state`);
    await page.close();
  }
} finally {
  await browser.close();
}
