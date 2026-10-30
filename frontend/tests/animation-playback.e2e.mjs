import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || "chrome", headless: true });
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
try {
  await mkdir("test-results", { recursive: true });
  await Promise.all([375, 1366].map(async width => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 640, hasTouch: width < 640 });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("[data-robotic-bug]")?.dataset.renderer === "webgl");
    const robot = page.locator("[data-robotic-bug]");
    assert.equal(await page.getByRole("button", { name: /pause animation|resume animation|play animation/i }).count(), 0);
    const samples = [];
    // Actual elapsed browser time: detect startup-only movement and recurring stalls.
    for (let second = 0; second < Number(process.env.PATROL_SECONDS || 120); second++) {
      const sample = await robot.locator("canvas").evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return { pose: canvas.parentElement.style.transform, x: rect.x, y: rect.y, size: rect.width, mode: canvas.closest("[data-robotic-bug]").dataset.mode };
      });
      assert.ok(sample.x >= -10 && sample.y >= -10 && sample.x + sample.size <= width + 10 && sample.y + sample.size <= 910, "full projected footprint remains visible");
      assert.equal(await robot.locator("canvas").count(), 1);
      samples.push(sample);
      await page.waitForTimeout(1000);
      if (second % 10 === 9) {
        assert.ok(new Set(samples.slice(-10).map(item => item.pose)).size >= 4, `${width}: stalled at ${second}s`);
        console.log(`PASS ${width}px patrol seconds ${second - 9}-${second + 1}`);
      }
    }
    if (width > 640) {
      for (const [x, y] of [[1,450],[width-1,450],[width/2,1],[width/2,899]]) {
        await page.mouse.move(x, y);
        await page.waitForFunction(() => ["following", "locked"].includes(document.querySelector("[data-robotic-bug]").dataset.mode));
        await page.waitForTimeout(3200);
        assert.ok(!["following", "locked"].includes(await robot.getAttribute("data-mode")));
      }
    } else {
      await page.dispatchEvent("body", "pointermove", { pointerType: "touch", clientX: 10, clientY: 10 });
      assert.notEqual(await robot.getAttribute("data-mode"), "following");
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(1000);
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
    const pose = () => robot.locator("canvas").evaluate(el => el.parentElement.style.transform);
    const hidden = await pose(); await page.waitForTimeout(1000); assert.equal(await pose(), hidden);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForFunction(previous => document.querySelector("[data-robotic-bug] canvas").parentElement.style.transform !== previous, hidden, { timeout: 10000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => document.querySelector("[data-robotic-bug]").dataset.motion === "reduced").catch(async error => { console.log(await page.evaluate(() => ({ media: matchMedia("(prefers-reduced-motion: reduce)").matches, hidden: document.hidden, motion: document.querySelector("[data-robotic-bug]").dataset.motion }))); throw error; });
    const still = await pose(); await page.waitForTimeout(500); assert.equal(await pose(), still);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.screenshot({ path: `test-results/robot-patrol-${width}.png` });
    assert.equal(await robot.evaluate(el => getComputedStyle(el).pointerEvents), "none");
    assert.deepEqual(errors, []);
    await page.close();
  }));
} finally { await browser.close(); }
