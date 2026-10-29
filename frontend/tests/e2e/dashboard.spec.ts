import { expect, test, type Page } from "@playwright/test";

// Synthetic, local-test-only responses. Nothing in this file is imported by the app.
const user={id:1,full_name:"UI Test Owner",email:"ui-test@example.invalid",is_verified:true,auth_provider:"email",onboarding_tenant_id:1};
const team={id:1,name:"Responsive test workspace",slug:"ui-test",role:"OWNER",workspace_type:"ORGANIZATION"};
const repo={id:1,tenant_id:1,github_installation_id:1,github_repository_id:1,owner:"ui-test",name:"long-repository-name-for-layout-testing",full_name:"ui-test/long-repository-name-for-layout-testing",private:true,default_branch:"feature/long-branch-name-for-layout-testing",is_active:true};
const finding={id:1,review_id:1,repository_id:1,repository_name:repo.full_name,pull_request_number:1,commit_sha:"0123456789abcdef",filename:"src/long/path/to/example.ts",line:10,severity:"high",category:"bug",message:"Local test finding used to check narrow table layouts",status:"open",verification_status:"OPEN",triage_status:"ACTIVE",created_at:"2026-01-01T00:00:00Z"};
const analytics={
  start_date:"2026-01-01",end_date:"2026-01-30",timeframe:"30d",
  summary:{reviews:1,pull_requests:1,repositories:1,findings:1,critical:0,high:1,medium:0,low:0,info:0,security:0,bugs:1,performance:0,quality:0,open:1,resolved:0,dismissed:0,actionable:1},
  comparison:{label:"Previous period",has_sufficient_data:false},
  trend:[{date:"2026-01-01",label:"Jan 1",total:1,critical:0,high:1,medium:0,low:0,info:0}],
  severity:[{name:"high",count:1}],status:[{name:"open",count:1}],categories:[{name:"bug",count:1}],
  repositories:[{name:repo.full_name,count:1}],critical_findings:[],recently_resolved:[],
};
async function fixtures(page:Page) {
  const unexpected:string[]=[];
  await page.route("**/api/**",async route=>{
    const path=new URL(route.request().url()).pathname.replace(/^.*\/api/,"");
    const headers={"access-control-allow-origin":new URL(page.url()).origin,"access-control-allow-credentials":"true"};
    let body:unknown;
    if(path==="/auth/me") body=user;
    else if(path==="/tenants/") body=[team];
    else if(path==="/onboarding/status") body={authenticated:true,user,workspace:team,github:{connected:true},repositories:{count:1,synced:true},onboarding_complete:true,next_step:"dashboard"};
    else if(path==="/tenants/1/access") body={role:"OWNER",repository_ids:[1]};
    else if(path==="/tenants/1/dashboard") body={user,workspace:team,repositories_count:1,reviews_count:1,repositories:[{...repo,reviews_count:1,findings_count:1}],recent_reviews:[]};
    else if(path==="/tenants/1/repositories") body=[repo];
    else if(path==="/tenants/1/analytics") body=analytics;
    else if(path==="/tenants/1/findings") body=[finding];
    else if(path==="/tenants/1/reviews" || path==="/tenants/1/repositories/1/reviews") body=[];
    else {unexpected.push(path);body={detail:"No local fixture for "+path};}
    await route.fulfill({status:body&&unexpected.at(-1)===path?501:200,contentType:"application/json",headers,body:JSON.stringify(body)});
  });
  return unexpected;
}
test.beforeEach(async({baseURL})=>{
  expect(["127.0.0.1","localhost"]).toContain(new URL(baseURL!).hostname);
});
for(const width of [320,360,375,390,414,430,768,1024,1280,1440,1920,2560]) {
  test(`authenticated layout fixtures at ${width}px, portrait and landscape`,async({page})=>{
    const unexpected=await fixtures(page);
    const errors:string[]=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error") errors.push(m.text());});
    for(const height of [900,390]) {
      await page.setViewportSize({width,height});
      for(const route of ["/dashboard","/repositories","/repositories/1","/reviews","/findings","/analytics","/analytics/reports","/secret-scanner","/settings","/settings/appearance","/settings/assistant"]) {
        await page.goto(route);
        await expect(page.locator("main h1").first()).toBeVisible();
        await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
      }
    }
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}
test("dashboard drawer scrolls in landscape, traps focus and closes at desktop breakpoint",async({page})=>{
  await fixtures(page);
  await page.setViewportSize({width:640,height:320});
  await page.goto("/dashboard");
  const opener=page.getByRole("button",{name:"Open navigation",exact:true});
  await opener.click();
  const drawer=page.getByRole("dialog",{name:"Primary navigation",exact:true});
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link",{name:"GitHub",exact:true}).scrollIntoViewIfNeeded();
  await expect(drawer.getByRole("link",{name:"GitHub",exact:true})).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await opener.click();
  await page.setViewportSize({width:1280,height:720});
  await expect(drawer).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.body).position)).not.toBe("fixed");
});
test("repository API failure presents a retry and recovery",async({page})=>{
  await fixtures(page);
  let failing=true;
  await page.route("**/api/tenants/1/repositories",route=>route.fulfill({status:failing?503:200,contentType:"application/json",body:JSON.stringify(failing?{detail:"Test outage"}:[repo])}));
  await page.goto("/repositories");
  await expect(page.getByRole("alert")).toContainText("load repositories",{timeout:20000});
  failing=false;
  await page.getByRole("button",{name:"Try again",exact:true}).click();
  await expect(page.getByRole("link",{name:repo.full_name,exact:true})).toBeVisible();
});
