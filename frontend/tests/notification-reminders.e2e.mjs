import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// API fixtures exercise UI behavior; backend authorization is not mocked as a security test.
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || "chrome", headless: true });
try {
  for (const width of [375, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let failure = false;
    let release;
    const ready = new Promise(resolve => { release = resolve; });
    let findings = [
      { id: 1, review_id: 42, repository_name: "team/service", pull_request_number: 7, severity: "high", category: "bug", status: "open", verification_status: "OPEN", triage_status: "ACTIVE", created_at: "2026-10-29T12:00:00Z", message: "PRIVATE SOURCE CONTENT" },
      { id: 2, review_id: 43, repository_name: "team/service", pull_request_number: 8, severity: "critical", category: "security", status: "open", verification_status: "OPEN", triage_status: "ACTIVE", created_at: "2026-10-29T12:00:00Z" },
      { id: 3, status: "resolved" },
      { id: 4, status: "open", verification_status: "RESOLVED", triage_status: "ACTIVE" },
      { id: 5, status: "open", verification_status: "OPEN", triage_status: "DISMISSED" },
    ];
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      let json = [];
      if (path.endsWith("/auth/me")) json = { id: 1, full_name: "Test User", email: "test@example.com", onboarding_tenant_id: 1 };
      else if (path.endsWith("/onboarding/status")) json = { onboarding_complete: true };
      else if (/\/tenants\/$/.test(path)) json = [{ id: 1, name: "Test team", role: "OWNER" }];
      else if (path.endsWith("/access")) json = { role: "OWNER", repository_ids: [1] };
      else if (path.endsWith("/findings")) {
        assert.equal(url.searchParams.get("status"), "open");
        assert.equal(url.searchParams.get("timeframe"), "12m");
        await ready;
        if (failure) return route.fulfill({ status: 500, json: { detail: "Unavailable" } });
        json = findings;
      }
      await route.fulfill({ json });
    });
    await page.goto((process.env.TEST_BASE_URL || "http://127.0.0.1:3000") + "/reviews");
    const bell = page.getByRole("button", { name: /^Notifications/ });
    await bell.click();
    const dialog = page.getByRole("dialog", { name: "Bug & issue reminders" });
    await expect(dialog.getByRole("status", { name: "Loading issue reminders" })).toBeVisible();
    release();
    await expect(dialog.getByText("2 open issues", { exact: true })).toBeVisible();
    await expect(dialog.locator("li").first()).toContainText("critical security");
    await expect(dialog.locator('a[href="/reviews/42"]')).toBeVisible();
    assert.equal(await dialog.getByText("PRIVATE SOURCE CONTENT").count(), 0);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(bell).toBeFocused();
    await expect(bell).toHaveAccessibleName("Notifications: 2 open issues");
    await bell.click();
    failure = true;
    await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Couldn't load issue reminders.", { timeout: 20000 });
    await expect(dialog.locator("li")).toHaveCount(0);
    failure = false;
    findings = [];
    await dialog.getByRole("button", { name: "Retry" }).click();
    await expect(dialog.getByText("No open issues", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bell).toHaveAccessibleName("Notifications");
    console.log(`PASS ${width}px: loading, actual findings, priority, filtering, safe previews, links, focus, overflow, error, retry, empty state`);
    await page.close();
  }
} finally {
  await browser.close();
}
