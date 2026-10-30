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
  assert.equal(await page.locator("[data-bottom-cta]").count(), 0);
  assert.equal(await page.getByText("Ship better code with AI-assisted PR reviews").count(), 0);
  const robot = page.locator("[data-robotic-bug]");
  const launcher = page.getByRole("button", { name: "Open Kody assistant" });
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForFunction(() => document.querySelector("[data-robotic-bug]")?.dataset.renderer === "webgl");
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const robotBox = await robot.boundingBox();
    const canvasBox = await robot.locator("canvas").boundingBox();
    assert.ok(canvasBox.x >= robotBox.x - 1 && canvasBox.y >= robotBox.y - 1 && canvasBox.x + canvasBox.width <= robotBox.x + robotBox.width + 1 && canvasBox.y + canvasBox.height <= robotBox.y + robotBox.height + 1, `${width}: rendered robot stays within its container`);
    assert.equal(await robot.locator("canvas").isVisible(), true);
    // The roaming decoration remains visible at the top and beside the footer.
    const controls = await footer.locator("a").all();
    for (const link of controls) {
      await link.scrollIntoViewIfNeeded();
      const box = await link.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${width}: minimum touch target: ${await link.textContent()}`);
      assert.ok(box.x >= 0 && box.x + box.width <= width, `${width}: control fits viewport`);
      assert.ok(!intersects(box, await launcher.boundingBox()), `${width}: launcher does not cover link`);
    }
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth > innerWidth,
      elements: [...document.querySelectorAll("footer *")].filter(el => {
        if (el.closest("[data-robotic-bug]") || el.tagName === "svg" || el.closest("svg")) return false;
        const box = el.getBoundingClientRect();
        return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== "inline");
      }).map(el => el.tagName + "." + el.className)
    }));
    assert.deepEqual(overflow, { page: false, elements: [] }, `${width}: no horizontal overflow or clipped text`);
    assert.equal(await robot.locator("canvas").isVisible(), true);
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
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.mouse.move(0, 0);
  const pose = () => robot.locator("canvas").evaluate(el => el.parentElement.style.transform);
  await page.waitForTimeout(15000);
  assert.equal(await robot.getAttribute("data-motion"), "running");
  const before = await pose();
  // A decorative scan may legitimately pause walking for 4.3 seconds.
  await page.waitForFunction(previous => document.querySelector("[data-robotic-bug] canvas")?.parentElement.style.transform !== previous, before, { timeout: 10000 });
  assert.equal(await page.getByRole("button", { name: /pause animation|resume animation/i }).count(), 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const motionSamples = [];
  // Observe real movement (including Kody's SVG), not just an animation name.
  for (let sample = 0; sample < 40; sample++) {
    motionSamples.push(await page.evaluate(() => ({
      bug: document.querySelector("[data-robotic-bug] canvas").parentElement.style.transform,
      kody: getComputedStyle(document.querySelector('[aria-controls="kody-panel"] svg > g')).transform,
    })));
    await page.waitForTimeout(500);
  }
  assert.ok(new Set(motionSamples.map(sample => sample.bug)).size > 5, "Bug keeps gentle automatic movement with reduced motion");
  assert.ok(new Set(motionSamples.map(sample => sample.kody)).size > 5, "Kody keeps gentle automatic movement with reduced motion");
  assert.equal(await robot.getAttribute("data-intensity"), "gentle");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForFunction(() => document.querySelector("[data-robotic-bug]")?.dataset.motion === "running");
  await mkdir("test-results", { recursive: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "test-results/roaming-desktop.png" });
  await footer.screenshot({ path: "test-results/footer-desktop.png" });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "test-results/roaming-mobile.png" });
  await footer.screenshot({ path: "test-results/footer-mobile.png" });
  // Simulate unavailable WebGL: the bug must still appear and move.
  const fallbackPage = await browser.newPage();
  await fallbackPage.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (String(kind).includes("webgl")) return null;
      return original.call(this, kind, ...args);
    };
  });
  await fallbackPage.goto(base, { waitUntil: "networkidle" });
  await fallbackPage.waitForFunction(() => document.querySelector("[data-robotic-bug]")?.dataset.renderer === "fallback");
  assert.equal(await fallbackPage.locator("[data-robot-fallback]").isVisible(), true);
  const fallbackPose = await fallbackPage.locator("[data-robot-fallback]").evaluate(el => el.parentElement.style.transform);
  await fallbackPage.waitForFunction(previous => document.querySelector("[data-robot-fallback]").parentElement.style.transform !== previous, fallbackPose);
  await fallbackPage.close();
  assert.deepEqual(errors, [], "No browser console or hydration errors");
  console.log("PASS keyboard order/focus, internal links, 15-second animation, no animation controls, reduced motion, Kody, console and hydration checks");
} finally {
  await browser.close();
}
