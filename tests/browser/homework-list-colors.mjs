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
const luminance = color => {
  const [r,g,b] = color.match(/\d+/g).map(Number).map(n => n/255)
    .map(n => n<=.04045 ? n/12.92 : ((n+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b;
};
const uploads = ["processed","recognizing","queued","needs_rescan","failed"].map((status,i) => ({
  id:i ? "qa-upload-"+i : "qa-memo", kind:i ? "homework" : "memo",
  status, subjects:["英语"], files:[], issues:[], date:"2026-11-20"
}));
try {
  const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});
  await page.route("**/assistant-api/**", route => {
    const url = new URL(route.request().url());
    const date = url.searchParams.get("date");
    const send = data => route.fulfill({json:data});
    if (url.pathname.endsWith("/status")) return send({authenticated:true,available:true,viewer:{id:"qa",name:"模拟",role:"parent"}});
    if (url.pathname.endsWith("/learning/state")) return send({
      date,status:"processed",pending:false,dates:[date],quota:{calls:0,limit:60},
      uploads,
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
      return [css.backgroundColor,css.color];
    }));
    assert.equal(colors.length,6);
    for (const [background,foreground] of colors) {
      const bg=luminance(background), fg=luminance(foreground);
      assert.ok((Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05) >= 4.5);
      if (scheme==="dark") assert.ok(bg < .12);
    }
    const rows = page.locator(".hw-file-row");
    // A theme switch transitions the button surface; measure its settled color.
    await rows.evaluateAll(nodes=>Promise.all(nodes.flatMap(node=>node.getAnimations().map(animation=>animation.finished))));
    assert.deepEqual(await rows.locator(".hw-upload-status").allTextContents(),
      ["已整理","AI识别中","排队中","需要补拍或调整","整理未完成"]);
    const uploadColors = await rows.locator(".hw-upload-status").evaluateAll(labels => labels.map(label => {
      const style = getComputedStyle(label);
      return [style.backgroundColor,style.color];
    }));
    for (const [index,row] of (await rows.all()).entries()) {
      const rowBg = await row.evaluate(el=>getComputedStyle(el).backgroundColor);
      const bg=luminance(rowBg), fg=luminance(uploadColors[index][1]);
      assert.ok((Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)>=4.5, [scheme,index,rowBg,uploadColors[index][1]].join(" "));
    }
    assert.ok(uploadColors.every(([bg]) => bg==="rgba(0, 0, 0, 0)"));
    assert.equal(new Set(uploadColors.map(([,fg])=>fg)).size,4);
    await rows.first().click();
    const detail = page.getByRole("dialog");
    const tag = detail.locator(".hw-upload-status");
    assert.equal(await tag.textContent(),"已整理");
    assert.deepEqual(await tag.evaluate(el=>[getComputedStyle(el).backgroundColor,getComputedStyle(el).color]),uploadColors[0]);
    await detail.getByRole("button",{name:"关闭",exact:true}).click();
    assert.equal(new Set([colors[1][0],colors[3][0],colors[5][0]]).size,3);
    assert.equal(await list.locator(".hw-task-count").evaluate(el=>getComputedStyle(el).backgroundColor),"rgba(0, 0, 0, 0)");
    assert.ok(await list.evaluate(el=>el.scrollWidth<=el.clientWidth));
  }
  console.log("CHECKLIST_COLORS_OK");
} finally {await browser.close();}
