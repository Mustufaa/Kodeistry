import { expect, test, type Page } from "@playwright/test";

const widths = [320,360,375,390,414,430,768,1024,1280,1440,1920,2560];
const publicRoutes = ["/","/features/ai-code-review","/features/github-integration","/features/security-analysis","/how-it-works","/docs","/faq","/privacy","/terms"];
const authRoutes = ["/login","/register","/forgot-password","/reset-password","/verify-email","/invite"];

async function noOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}
test.beforeEach(async ({ page, baseURL }) => {
  // These are local-only UI tests; never send registration, chat or fixture
  // traffic to a deployed service.
  expect(["localhost","127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await page.route("**/api/**", route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
});
for(const width of widths) {
  for(const orientation of ["portrait","landscape"]) {
    test(`public and auth routes: ${width}px ${orientation}`, async ({page}) => {
      await page.emulateMedia({reducedMotion:"reduce"});
      await page.setViewportSize({width,height:orientation==="portrait"?900:390});
      const errors: string[]=[];
      page.on("pageerror",error=>errors.push(error.message));
      page.on("console",message=>{if(message.type()==="error") errors.push(message.text());});
      for(const route of [...publicRoutes,...authRoutes]) {
        await page.goto(route);
        await expect(page.locator("h1").first()).toBeVisible();
        await noOverflow(page);
      }
      expect(errors).toEqual([]);
    });
  }
}
test("mobile navigation traps focus, closes with Escape, restores focus and scroll",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  const opener=page.getByRole("button",{name:"Open navigation",exact:true});
  await opener.click();
  const menu=page.getByRole("dialog",{name:"Mobile navigation",exact:true});
  await expect(menu).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.body).position)).toBe("fixed");
  for(let i=0;i<12;i++) {
    await page.keyboard.press("Tab");
    await expect.poll(()=>menu.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.body).position)).not.toBe("fixed");
  await opener.click();
  await page.getByRole("navigation",{name:"Mobile navigation",exact:true}).getByRole("link",{name:"Docs",exact:true}).click();
  await expect(page).toHaveURL(/\/docs$/);
  await noOverflow(page);
});
test("Kody fits narrow and keyboard-height viewports; closing restores focus",async({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.goto("/login");
  const launcher=page.getByRole("button",{name:"Open Kody assistant",exact:true});
  await launcher.click();
  const panel=page.getByRole("dialog",{name:"Kody assistant"});
  await expect(panel).toBeVisible();
  for(const height of [568,320,240,568]) {
    await page.setViewportSize({width:320,height});
    await expect.poll(async()=>{
      const box=await panel.boundingBox();
      return !!box && box.x>=0 && box.y>=0 && box.x+box.width<=321 && box.y+box.height<=height+1;
    }).toBe(true);
    await expect(page.getByRole("textbox",{name:"Message Kody",exact:true})).toBeVisible();
    await noOverflow(page);
  }
  await page.getByRole("button",{name:"Close Kody assistant",exact:true}).click();
  await expect(launcher).toBeFocused();
});
test("login and registration fit the reported laptop viewport",async({page})=>{
  await page.setViewportSize({width:1366,height:640});
  for(const route of ["/login","/register"]) {
    await page.goto(route);
    await noOverflow(page);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight<=window.innerHeight+1)).toBe(true);
  }
});
test("robot moves for 60s, fully exits and re-enters, including resize",async({page})=>{
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.setViewportSize({width:1280,height:800});
  await page.goto("/");
  const overlay=page.locator("[data-robotic-bug]");
  await expect(overlay).toHaveAttribute("data-renderer","webgl",{timeout:20000});
  const samples: {x:number;y:number;phase:string;cycles:number;outside:boolean}[]=[];
  // Observe rendered geometry at real wall-clock intervals, not screenshot similarity.
  const start=Date.now();
  let resized=false;
  while(Date.now()-start<61000) {
    const elapsed=Date.now()-start;
    if(elapsed>30000 && !resized) {await page.setViewportSize({width:390,height:844});resized=true;}
    samples.push(await overlay.evaluate(el=>{
      const body=el.querySelector("[data-bug-body]")!;
      const r=body.getBoundingClientRect();
      return {x:r.x,y:r.y,phase:(el as HTMLElement).dataset.phase??"",cycles:Number((el as HTMLElement).dataset.cycles??0),
        outside:r.right<=0||r.left>=innerWidth||r.bottom<=0||r.top>=innerHeight};
    }));
    await page.waitForTimeout(200);
  }
  expect(samples.some(s=>s.phase==="waiting")).toBe(true);
  expect(samples.filter(s=>s.phase==="waiting").every(s=>s.outside)).toBe(true);
  expect(samples.some((s,i)=>i>0&&samples[i-1].phase==="waiting"&&s.phase==="entering")).toBe(true);
  for(const second of [10,20,30]) {
    const slice=samples.slice(second*5,second*5+20);
    expect(new Set(slice.map(s=>`${s.x},${s.y},${s.phase}`)).size).toBeGreaterThan(1);
  }
  expect(samples.at(-1)!.cycles).toBeGreaterThan(1);
  await noOverflow(page);
});
test("reduced motion disables continuous bug movement and reacts live",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  const overlay=page.locator("[data-robotic-bug]");
  await expect(overlay).toHaveAttribute("data-motion","reduced");
  await expect(overlay).toHaveAttribute("data-renderer","static");
  await expect(page.locator("[data-bug-body] svg")).toBeVisible();
  await page.emulateMedia({reducedMotion:"no-preference"});
  await expect(overlay).toHaveAttribute("data-renderer","webgl",{timeout:20000});
  await page.emulateMedia({reducedMotion:"reduce"});
  await expect(overlay).toHaveAttribute("data-renderer","static");
  await expect(page.locator("[data-bug-body] svg")).toBeVisible();
});
