import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || "chrome", headless: true });
try {
  for (const width of [375, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.clock.install({ time: new Date("2026-10-30T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-30T00:00:01Z"));
    await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:3000", { waitUntil: "networkidle" });
    const launcher = page.getByRole("button", { name: "Open Kody assistant" });
    // Focus/blur restarts a complete ten-second idle period after hydration.
    await launcher.focus(); await launcher.blur();
    const away = () => launcher.getAttribute("data-away");
    const finishSlide = () => launcher.evaluate(el => el.getAnimations().forEach(animation => {
      if (animation.effect.getTiming().iterations !== Infinity) animation.finish();
    }));
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.clock.fastForward(9999); assert.equal(await away(), "false");
      await page.clock.fastForward(1); assert.equal(await away(), "true");
      await finishSlide();
      assert.ok((await launcher.boundingBox()).x >= width, "launcher leaves the viewport");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, "no horizontal overflow");
      await page.clock.fastForward(4999); assert.equal(await away(), "true");
      await page.clock.fastForward(1); assert.equal(await away(), "false");
      await finishSlide();
      const box = await launcher.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, "launcher returns inside the viewport");
    }
    await launcher.focus(); await page.clock.fastForward(30000);
    assert.equal(await away(), "false", "keyboard focus keeps Kody available");
    await launcher.click(); await page.clock.fastForward(30000);
    assert.equal(await away(), "false", "open chat keeps Kody available");
    await page.keyboard.press("Escape");
    await launcher.hover(); await page.clock.fastForward(30000);
    assert.equal(await away(), "false", "hover keeps Kody available");
    await page.mouse.move(0, 0); await launcher.blur();
    await page.clock.fastForward(10000); assert.equal(await away(), "true", "idle cycle restarts");
    // Keyboard users can bring the offscreen launcher back immediately.
    await launcher.focus(); assert.equal(await away(), "false");
    console.log(`PASS ${width}px: 10 seconds visible / 5 seconds away, repeat, focus, hover, chat and overflow`);
    await page.close();
  }
} finally { await browser.close(); }
