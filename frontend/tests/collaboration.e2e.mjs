// UI contract tests use API fixtures; backend persistence and sockets are tested in pytest.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || "chrome", headless: true });
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
try {
  for (const width of [375, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 850 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    let messages = [], noticeRead = false, failSend = true, failHistory = false, delayHistory = false, failNotice = false, delayNotice = false;
    const sentIds = [], sockets = [];
    const channel = { id: 1, name: "general", kind: "team", revision: 0, unread: 0, last_read_id: 0 };
    const sync = () => JSON.stringify({ type: "sync", channels: [channel], unread: noticeRead ? 0 : 1, notification_revision: 1, participants: [] });
    await page.routeWebSocket("**/collaboration/ws", ws => {
      sockets.push(ws);
      ws.onMessage(message => {
        const data = JSON.parse(String(message));
        if (data.ticket) ws.send(sync());
      });
    });
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url()), path = url.pathname, method = route.request().method();
      const json = data => route.fulfill({ json: data });
      if (path.endsWith("/auth/me")) return json({ id: 1, full_name: "Test Owner", email: "owner@example.com", is_verified: true, onboarding_tenant_id: 1 });
      if (path.endsWith("/auth/csrf")) return json({ csrf_token: "fixture-csrf" });
      if (path.endsWith("/onboarding/status")) return json({ onboarding_complete: true, next_step: "dashboard" });
      if (path === "/api/tenants" || path === "/api/tenants/") return json([{ id: 1, name: "Test team", role: "OWNER" }]);
      if (path.endsWith("/access")) return json({ role: "OWNER", repository_ids: [1] });
      if (path.endsWith("/dashboard")) return json({ repositories_count: 1, reviews_count: 0, repositories: [], recent_reviews: [] });
      if (path.endsWith("/analytics")) return json({ summary: { open: 0, critical: 0, findings: 0 }, severity: [], trend: [], critical_findings: [] });
      if (path.endsWith("/repositories")) return json([{ id: 1, full_name: "team/repo" }]);
      if (path.endsWith("/ticket")) return json({ ticket: "fixture-ticket" });
      if (path.endsWith("/channels")) return json(method === "GET" ? [channel] : { id: 1 });
      if (path.endsWith("/people")) return json([{ id: 1, full_name: "Test Owner" }, { id: 2, full_name: "Teammate" }]);
      if (path.endsWith("/notifications/unread-count")) return json({ count: noticeRead ? 0 : 1 });
      if (/\/notifications\/(?:\d+\/read|read-all)$/.test(path)) { noticeRead = true; return route.fulfill({ status: 204 }); }
      if (path.endsWith("/notifications")) {
        if (delayNotice) await new Promise(r => setTimeout(r, 800));
        if (failNotice) return route.fulfill({ status: 503, json: { detail: "Notifications unavailable" } });
        return json({ items: url.searchParams.get("unread") === "true" && noticeRead ? [] : [{ id: 1, event_type: "review_completed", title: "PR review completed", message: "team/repo · PR #1", href: "/reviews/1", created_at: new Date().toISOString(), read_at: noticeRead ? new Date().toISOString() : null }], next_cursor: null });
      }
      if (path.endsWith("/messages") && method === "GET") {
        if (delayHistory) await new Promise(r => setTimeout(r, 800));
        if (failHistory) return route.fulfill({ status: 503, json: { detail: "Temporarily unavailable" } });
        return json({ items: [...messages].reverse(), next_cursor: null });
      }
      if (path.endsWith("/messages") && method === "POST") {
        const body = route.request().postDataJSON(); sentIds.push(body.client_id);
        if (failSend) { failSend = false; return route.fulfill({ status: 503, json: { detail: "Send failed. Try again." } }); }
        const item = { ...body, id: 1, channel_id: 1, sender_id: 1, sender: "Test Owner", created_at: new Date().toISOString(), edited_at: null, deleted_at: null };
        messages.push(item); return json(item);
      }
      if (path.endsWith("/read")) return route.fulfill({ status: 204 });
      return json({});
    });
    await page.goto(base + "/dashboard", { waitUntil: "domcontentloaded", timeout: 120000 });
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    const launcher = page.getByRole("button", { name: /^Team chat/ });
    await expect(launcher).toBeVisible();
    const launchBox = await launcher.boundingBox();
    const reviewBox = await page.getByRole("link", { name: "Run Review" }).boundingBox();
    assert.ok(launchBox.y > reviewBox.y + reviewBox.height);
    const kody = page.locator('[aria-controls="kody-panel"]');
    if (await kody.isVisible()) {
      const kb = await kody.boundingBox();
      assert.ok(launchBox.x + launchBox.width <= kb.x, "launchers do not overlap");
    }
    await launcher.click();
    const dialog = page.getByRole("dialog", { name: "Team Chat" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    assert.equal(Math.round(box.width), width < 640 ? width : 410);
    assert.equal(Math.round(box.y), 0, "portal escapes sticky header");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(launcher).toBeFocused();
    await launcher.click();
    delayHistory = true;
    await page.getByRole("button", { name: "general", exact: true }).click();
    await expect(page.getByRole("status", { name: "Loading messages" })).toBeVisible();
    await expect(page.getByText("Start the conversation", { exact: true })).toBeVisible();
    delayHistory = false;
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    await composer.fill("@Tea");
    await page.getByRole("button", { name: "Teammate", exact: true }).click();
    await expect(composer).toHaveValue("@Teammate ");
    await composer.fill("<script>window.chatInjected=true</script>");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry message" })).toBeVisible();
    await page.getByRole("button", { name: "Retry message" }).click();
    await expect(page.getByRole("button", { name: "Retry message" })).toBeHidden();
    await expect(page.getByText("<script>window.chatInjected=true</script>", { exact: true })).toHaveCount(1);
    assert.equal(sentIds[0], sentIds[1], "retry preserves client message id");
    assert.equal(await page.evaluate(() => window.chatInjected), undefined, "message is rendered as text");
    assert.ok((await composer.boundingBox()).y + (await composer.boundingBox()).height <= 850);
    await page.setViewportSize({ width, height: 450 });
    await expect.poll(async () => Math.round((await dialog.boundingBox()).height)).toBe(450);
    assert.ok((await composer.boundingBox()).y + (await composer.boundingBox()).height <= 450);
    await page.setViewportSize({ width, height: 850 });
    // Reconnect resynchronizes without duplicating the persisted message.
    sockets.at(-1).close({ code: 4000, reason: "test reconnect" });
    await expect.poll(() => sockets.length, { timeout: 10000 }).toBeGreaterThan(1);
    await expect(page.getByText("<script>window.chatInjected=true</script>", { exact: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    delayNotice = true;
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await expect(page.getByRole("status", { name: "Loading notifications" })).toBeVisible();
    await expect(page.getByText("PR review completed", { exact: true })).toBeVisible();
    delayNotice = false;
    await page.getByRole("button", { name: "Mark all read" }).click();
    await page.getByRole("button", { name: "Unread", exact: true }).click();
    await expect(page.getByText("You're all caught up")).toBeVisible();
    await page.keyboard.press("Escape");
    failNotice = true;
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await expect(page.getByText("Could not load notifications.")).toBeVisible({ timeout: 20000 });
    failNotice = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByText("You're all caught up")).toBeVisible();
    await page.keyboard.press("Escape");
    // Backend outage renders an error and exposes retry after React Query's bounded retries.
    failHistory = true;
    await launcher.click();
    await expect(page.getByText("Messages could not be loaded.")).toBeVisible({ timeout: 20000 });
    failHistory = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByText("<script>window.chatInjected=true</script>", { exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    console.log("PASS " + width + "px: portal layout, focus/Escape, launcher spacing, loading/error states, mentions, safe rendering, idempotent retry, reconnect, notification read state");
    await page.close();
  }
} finally { await browser.close(); }
