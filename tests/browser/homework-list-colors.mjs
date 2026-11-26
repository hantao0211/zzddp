// Synthetic checklist with the same photo coverage and different displayed outcomes.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { chromium, webkit } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const engine = process.env.SMOKE_BROWSER === "webkit" ? webkit : chromium;
const browser = await engine.launch({headless:true, args:engine === chromium ? ["--no-sandbox"] : []});
const base = process.env.SMOKE_BASE_URL;
assert.equal(base, "https://127.0.0.1:3443");
const tasks = ["语文","数学","英语"].map((subject,i) => ({
  id:String(i),subject,title:i ? "练习册" : "复习",format:i ? "written" : "reading",
  requirement:"按课堂要求完成",coverage:"complete",memoEvidence:[],evidence:[],missing:[],
  ...(i ? {} : {selfCompletion:{role:"child",confirmedBy:"test",confirmedAt:"2026-11-20"}})
}));
const counts = {correct:0,wrong:0,passedWithNote:1,blank:0,feedback:0,uncertain:0,failed:0,pending:0,incomplete:0};
try {
  const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});
  await page.route("**/assistant-api/**", route => {
    const url = new URL(route.request().url());
    const date = url.searchParams.get("date");
    const send = data => route.fulfill({json:data});
    if (url.pathname.endsWith("/status")) return send({authenticated:true,available:true,viewer:{id:"qa",name:"模拟",role:"parent"}});
    if (url.pathname.endsWith("/learning/state")) return send({
      date,status:"processed",pending:false,dates:[date],quota:{calls:0,limit:60},
      uploads:[{id:"qa-memo",kind:"memo",status:"processed",subjects:[],files:[],issues:[]}],
      report:{date,memoId:"qa-memo",tasks,unclassified:[],unassigned:[],uncertainties:[],familyNotes:[]},
      grading:{...counts,enabled:true,pages:2,finished:2,tasks:{"1":counts,"2":{...counts,wrong:1}}}
    });
    if (url.pathname.endsWith("/reading/state")) return send(null);
    return send({items:[],total:0});
  });
  await page.goto(base);
  await page.getByRole("button",{name:"查看详情",exact:true}).click();
  const list = page.locator(".hw-task-card");
  await list.getByText("1题通过但存疑",{exact:true}).waitFor();
  assert.deepEqual(await list.locator(".hw-task-status").allTextContents(),["已完成（手动）","1题通过但存疑","1道错题"]);
  for (const scheme of ["dark","light"]) {
    await page.emulateMedia({colorScheme:scheme});
    const colors = await list.evaluate(el => Array.from(el.querySelectorAll(".subject-icon,.hw-task-status"), badge => {
      const css = getComputedStyle(badge);
      const luminance = color => {
        const channels = color.match(/\d+/g).slice(0,3).map(n => Number(n)/255).map(n => n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4);
        return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
      };
      return [luminance(css.backgroundColor),luminance(css.color),css.backgroundColor];
    }));
    assert.equal(colors.length,6);
    for (const [bg,fg] of colors) {
      assert.ok((Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05) >= 4.5);
      if (scheme==="dark") assert.ok(bg < .12);
    }
    assert.equal(new Set([colors[1][2],colors[3][2],colors[5][2]]).size,3);
    assert.equal(await list.locator(".hw-task-count").evaluate(el=>getComputedStyle(el).backgroundColor),"rgba(0, 0, 0, 0)");
    assert.ok(await list.evaluate(el=>el.scrollWidth<=el.clientWidth));
  }
  console.log("CHECKLIST_COLORS_OK");
} finally {await browser.close();}
