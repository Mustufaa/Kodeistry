import assert from "node:assert/strict";
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = process.env.TEST_BASE_URL ? 'local' : 'live';
const browser = await chromium.launch({channel:'chrome', headless:true});
try {
 await mkdir('test-results',{recursive:true});
 await Promise.all(['no-preference','reduce'].map(async reducedMotion=>{
  const page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(process.env.TEST_BASE_URL || 'https://kodeistry.onrender.com/',{waitUntil:'networkidle',timeout:120000});
  await page.waitForSelector('[data-robotic-bug] canvas',{timeout:60000});
  const samples=[];
  for(let i=0;i<35;i++){
   samples.push(await page.evaluate(()=>{
    const bug=document.querySelector('[data-robotic-bug]');
    const kody=document.querySelector('[aria-controls="kody-panel"]');
    return {motion:bug?.dataset.motion, renderer:bug?.dataset.renderer, mode:bug?.dataset.mode, bug:bug?.querySelector('canvas')?.parentElement.style.transform, phase:kody?.dataset.phase, away:kody?.dataset.away, kody:getComputedStyle(kody.querySelector('svg > g')).transform, hidden:document.hidden, reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
   }));
   await page.waitForTimeout(1000);
  }
  const summary={mode:reducedMotion,status:response.status(),title:await page.title(),bugPositions:new Set(samples.map(s=>s.bug)).size,kodyPoses:new Set(samples.map(s=>s.kody)).size,phases:[...new Set(samples.map(s=>s.phase))],first:samples[0],last:samples.at(-1),errors};
  console.log(JSON.stringify(summary));
  if (process.env.ASSERT_MOVEMENT === '1') {
   assert.ok(summary.bugPositions > 5, `${reducedMotion}: bug should keep moving`);
   assert.ok(summary.kodyPoses > 5, `${reducedMotion}: Kody should keep moving`);
   assert.deepEqual(errors, []);
  }
  await writeFile(`test-results/${output}-${reducedMotion}.json`,JSON.stringify({summary,samples},null,2));
  await page.screenshot({path:`test-results/${output}-${reducedMotion}.png`});
  await page.close();
 }));
} finally {await browser.close();}
