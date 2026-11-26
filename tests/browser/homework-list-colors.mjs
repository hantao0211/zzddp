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
const uploads = ["processed","recognizing","queued","needs_rescan","failed","processed"].map((status,i) => ({
  id:i ? "qa-upload-"+i : "qa-memo", kind:i ? "homework" : "memo",
  status, subjects:["英语"], files:[], issues:[], note:"保留在详情里的整理说明", date:"2026-11-20"
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
    const paper = await list.evaluate(el=>getComputedStyle(el).backgroundColor);
    const colors = await list.locator(".hw-task-status").evaluateAll(labels=>labels.map(label=>getComputedStyle(label).color));
    assert.equal(new Set(colors).size,3);
    const rows = page.locator(".hw-file-row");
    assert.equal(await rows.count(),5);
    assert.ok(!(await rows.first().innerText()).includes("保留在详情"));
    assert.ok((await rows.first().boundingBox()).height<=64);
    await page.getByRole("button",{name:"下一页资料"}).click();
    assert.equal(await rows.count(),1);
    await rows.first().click();
    const file = page.getByRole("dialog",{name:"作业照片／扫描件"});
    await file.getByText("保留在详情里的整理说明").waitFor();
    assert.equal(Math.round((await file.boundingBox()).height),844);
    await file.getByRole("button",{name:"返回列表"}).click();
    assert.equal(await rows.count(),1);
    await page.getByRole("button",{name:"上一页资料"}).click();
    await list.locator(".hw-task").first().click();
    await page.getByRole("dialog",{name:"这项作业的情况"}).getByRole("button",{name:"返回列表"}).click();
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
      assert.equal(rowBg,"rgba(0, 0, 0, 0)");
      const bg=luminance(paper), fg=luminance(uploadColors[index][1]);
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

    assert.equal(await list.locator(".hw-task-count").evaluate(el=>getComputedStyle(el).backgroundColor),"rgba(0, 0, 0, 0)");
    assert.ok(await list.evaluate(el=>el.scrollWidth<=el.clientWidth));
  }
  for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator(".hw-archive").screenshot({path:process.env.SMOKE_OUTPUT_DIR+"/received-"+width+".png"});
  }
  await page.getByRole("button",{name:"历史资料",exact:true}).click();
  await page.getByLabel("资料科目").selectOption("数学");
  await page.getByText("这个科目当天没有资料。").waitFor();
  await page.getByLabel("资料科目").selectOption("英语");
  await page.getByRole("button",{name:"下一页资料"}).click();
  await page.locator(".hw-file-row").click();
  await page.getByRole("dialog").getByRole("button",{name:"返回列表"}).click();
  assert.equal(await page.getByLabel("资料科目").inputValue(),"英语");
  assert.equal(await page.locator(".hw-file-row").count(),1);
  console.log("CHECKLIST_AND_UPLOAD_LIST_OK");
} finally {await browser.close();}
