import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || "chrome", headless: true });
try {
  await mkdir("test-results", { recursive: true });
  for (const width of [375, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const requests = [];
    await page.route("**/chat", async route => { requests.push(route.request().postDataJSON()); await route.fulfill({ json: { reply: "Conversation preserved." } }); });
    await page.clock.install({ time: new Date("2026-10-30T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-30T00:00:01Z"));
    await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:3000", { waitUntil: "networkidle" });
    const launcher = page.locator('[aria-controls="kody-panel"]');
    const phase = () => launcher.getAttribute("data-phase");
    const finish = () => launcher.evaluate(el => el.getAnimations({ subtree: true }).forEach(animation => { if (animation.effect.getTiming().iterations !== Infinity) animation.finish(); }));
    await launcher.focus(); await launcher.blur();
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.clock.fastForward(9999); assert.equal(await phase(), "visible");
      await page.clock.fastForward(1); assert.equal(await phase(), "dismantling");
      // Inspect each real timeline stage without a flaky screenshot timer.
      for (const [name, time] of [["shutdown",250],["separation",750],["fragments",1200],["disappearance",1700]]) {
        await launcher.evaluate((el, time) => el.getAnimations({ subtree: true }).forEach(animation => {
          if (animation.effect.getTiming().iterations !== Infinity) { animation.pause(); animation.currentTime = time; }
        }), time);
        if (cycle === 0) await page.screenshot({ path: `test-results/kody-${width}-${name}.png` });
      }
      await finish(); assert.equal(await phase(), "hidden");
      assert.equal(await launcher.isVisible(), false);
      assert.equal(await launcher.evaluate(el => el.inert), true);
      const hit = await page.evaluate(() => document.elementFromPoint(innerWidth - 40, innerHeight - 40)?.closest('[aria-controls="kody-panel"]') !== null);
      assert.equal(hit, false, "no invisible launcher blocks page");
      await page.clock.fastForward(4999); assert.equal(await phase(), "hidden");
      await page.clock.fastForward(1); assert.equal(await phase(), "assembling");
      await finish(); assert.equal(await phase(), "visible");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    }
    await launcher.focus(); await page.clock.fastForward(30000); assert.equal(await phase(), "visible");
    await launcher.click();
    await page.locator("#kody-message").fill("Remember this conversation");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await page.getByText("Conversation preserved.", { exact: true }).waitFor();
    for (let index = 0; index < 5; index++) {
      await page.getByRole("button", { name: "Close Kody assistant" }).click();
      await launcher.click();
      assert.equal(await page.getByText("Remember this conversation", { exact: true }).count(), 1);
    }
    await page.locator("#kody-message").fill("Follow up");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[role="log"] p').length >= 5);
    assert.ok(requests[1].history.some(item => item.content === "Remember this conversation"));
    await page.keyboard.press("Escape");
    await page.clock.runFor(32);
    await page.mouse.move(0,0); await launcher.blur(); await page.clock.fastForward(10000);
    assert.equal(await phase(), "dismantling");
    await launcher.focus(); assert.equal(await phase(), "assembling");
    await finish(); assert.equal(await phase(), "visible");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await launcher.blur(); await page.clock.fastForward(10000);
    assert.equal(await launcher.evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.effect.getTiming().iterations !== Infinity).length), 1);
    assert.equal(await launcher.locator('svg > g').first().evaluate(el => getComputedStyle(el).animationPlayState), "paused", "gentle idle pauses during the visibility transition");
    await finish(); assert.equal(await phase(), "hidden");
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px Kody stages, 10/5 timing, reassembly, cancellation, history, API payload, repeated chat, reduced motion, overflow`);
    await page.close();
  }
} finally { await browser.close(); }
