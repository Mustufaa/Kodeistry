import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || "chrome", headless: true });
const errors = [];
const page = await browser.newPage({ colorScheme: "dark" });
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
try {
  await page.goto(base, { waitUntil: "networkidle", timeout: 120000 });
  const footer = page.getByRole("contentinfo", { name: "Kodeistry footer" });
  const cta = page.locator("[data-bottom-cta]");
  const stage = page.locator("[data-bug-stage]");
  const robot = page.locator("[data-robotic-bug]");
  const launcher = page.getByRole("button", { name: "Open Kody assistant" });
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await stage.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector("[data-robotic-bug]")?.dataset.renderer === "webgl");
    const stageBox = await stage.boundingBox();
    const robotBox = await robot.boundingBox();
    const canvasBox = await robot.locator("canvas").boundingBox();
    assert.ok(canvasBox.x >= robotBox.x - 1 && canvasBox.y >= robotBox.y - 1 && canvasBox.x + canvasBox.width <= robotBox.x + robotBox.width + 1 && canvasBox.y + canvasBox.height <= robotBox.y + robotBox.height + 1, `${width}: rendered robot stays within its container`);
    const headingBox = await page.locator("#bottom-cta-heading").boundingBox();
    assert.ok(!intersects(stageBox, headingBox), `${width}: animation and heading are separate`);
    assert.ok(width >= 1024 ? headingBox.x < stageBox.x : stageBox.y + stageBox.height <= headingBox.y, `${width}: CTA order`);
    for (const link of await cta.locator("a").all()) {
      const box = await link.boundingBox();
      assert.ok(!intersects(stageBox, box), `${width}: animation and CTA actions are separate`);
    }
    // Check the entire footer/CTA, including scroll positions where the floating widget could cover a link.
    const controls = [...await cta.locator("a, button:not([hidden])").all(), ...await footer.locator("a").all()];
    for (const link of controls) {
      await link.scrollIntoViewIfNeeded();
      const box = await link.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${width}: minimum touch target: ${await link.textContent()}`);
      assert.ok(box.x >= 0 && box.x + box.width <= width, `${width}: control fits viewport`);
      assert.ok(!intersects(box, await launcher.boundingBox()), `${width}: launcher does not cover link`);
    }
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth > innerWidth,
      elements: [...document.querySelectorAll("footer *, [data-bottom-cta] *")].filter(el => {
        if (el.closest("[data-robotic-bug]") || el.tagName === "svg" || el.closest("svg")) return false;
        const box = el.getBoundingClientRect();
        return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== "inline");
      }).map(el => el.tagName + "." + el.className)
    }));
    assert.deepEqual(overflow, { page: false, elements: [] }, `${width}: no horizontal overflow or clipped text`);
    await launcher.click();
    const panel = page.getByRole("dialog", { name: "Kody assistant" });
    await panel.waitFor({ state: "visible" });
    const panelBox = await panel.boundingBox();
    assert.ok(panelBox.x >= 0 && panelBox.x + panelBox.width <= width && panelBox.y >= 0 && panelBox.y + panelBox.height <= 900, `${width}: Kody fits viewport`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Open Kody assistant");
    console.log(`PASS responsive layout, touch targets, robot containment and Kody: ${width}px`);
  }
  // Keyboard follows the DOM order, and every footer link has an actual focus indicator.
  const links = await footer.locator("a").all();
  await links[0].focus();
  for (let index = 0; index < links.length; index++) {
    assert.equal(await links[index].evaluate(el => el === document.activeElement), true);
    const focus = await links[index].evaluate(el => ({ width: getComputedStyle(el).outlineWidth, style: getComputedStyle(el).outlineStyle }));
    assert.notEqual(focus.width, "0px"); assert.notEqual(focus.style, "none");
    if (index < links.length - 1) await page.keyboard.press("Tab");
  }
  const hrefs = await footer.locator("a").evaluateAll(els => els.map(el => el.getAttribute("href")));
  for (const href of new Set(hrefs)) {
    if (href.startsWith("#")) assert.equal(await page.locator(href).count(), 1);
    else if (href.startsWith("/")) assert.equal((await page.request.get(base + href)).status(), 200, href);
    else assert.ok(href.startsWith("https://") || href.startsWith("mailto:"));
  }
  await page.emulateMedia({ colorScheme: "light" });
  assert.equal(await footer.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(9, 9, 11)");
  assert.equal(await footer.locator("nav h2").first().evaluate(el => getComputedStyle(el).color), "rgb(244, 244, 245)");
  await page.emulateMedia({ colorScheme: "dark" });
  assert.match(await footer.textContent(), new RegExp(String(new Date().getFullYear())));
  await page.setViewportSize({ width: 1366, height: 900 });
  await stage.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const pose = () => robot.locator("canvas").evaluate(el => el.parentElement.style.transform);
  await page.waitForTimeout(15000);
  assert.equal(await robot.getAttribute("data-motion"), "running");
  const before = await pose();
  // A decorative scan may legitimately pause walking for 4.3 seconds.
  await page.waitForFunction(previous => document.querySelector("[data-robotic-bug] canvas")?.parentElement.style.transform !== previous, before, { timeout: 10000 });
  await page.getByRole("button", { name: "Pause animation" }).click();
  const paused = await pose(); await page.waitForTimeout(500); assert.equal(await pose(), paused);
  await page.getByRole("button", { name: "Resume animation" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const still = await pose(); await page.waitForTimeout(500); assert.equal(await pose(), still);
  assert.equal(await robot.getAttribute("data-motion"), "paused");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForFunction(() => document.querySelector("[data-robotic-bug]")?.dataset.motion === "running");
  await mkdir("test-results", { recursive: true });
  await cta.screenshot({ path: "test-results/cta-desktop.png" });
  await footer.screenshot({ path: "test-results/footer-desktop.png" });
  await page.setViewportSize({ width: 375, height: 900 });
  await cta.screenshot({ path: "test-results/cta-mobile.png" });
  await footer.screenshot({ path: "test-results/footer-mobile.png" });
  assert.deepEqual(errors, [], "No browser console or hydration errors");
  console.log("PASS keyboard order/focus, internal links, 15-second animation, pause/resume, reduced motion, console and hydration checks");
} finally {
  await browser.close();
}
