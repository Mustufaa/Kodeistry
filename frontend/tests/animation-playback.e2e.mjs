import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || "chrome", headless: true });
try {
  const pages = await Promise.all([375, 1366].map(async width => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:3000", { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("[data-robotic-bug]")?.dataset.motion === "running");
    return { page, width, samples: [] };
  }));
  // A separate check for each ten-second window catches a freeze after startup.
  for (let sample = 0; sample < 60; sample++) {
    await Promise.all(pages.map(async entry => {
      entry.samples.push(await entry.page.evaluate(() => ({
        bug: document.querySelector("[data-robotic-bug] canvas").parentElement.style.transform,
        kody: getComputedStyle(document.querySelector('[aria-controls="kody-panel"] svg > g')).transform,
      })));
    }));
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  for (const { width, samples } of pages) {
    for (let start = 0; start < 60; start += 20) {
      const window = samples.slice(start, start + 20);
      const bug = new Set(window.map(sample => sample.bug)).size;
      const kody = new Set(window.map(sample => sample.kody)).size;
      assert.ok(bug > 5, `${width}px: bug stalled during seconds ${start / 2}-${start / 2 + 10}`);
      assert.ok(kody > 10, `${width}px: Kody stalled during seconds ${start / 2}-${start / 2 + 10}`);
      console.log(`PASS ${width}px, seconds ${start / 2}-${start / 2 + 10}: bug ${bug} positions, Kody ${kody} poses`);
    }
  }
} finally { await browser.close(); }
