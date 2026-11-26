// Isolated synthetic family. Refuse all other origins and data directories.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const base=process.env.SMOKE_BASE_URL, dir=process.env.PRACTICE_QA_DIRECTORY;
assert.equal(base,"https://127.0.0.1:3443");assert.ok(dir.endsWith("/xiaobu-practice-qa"));
const engines=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const browser=await engines[process.env.SMOKE_BROWSER].launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,colorScheme:process.env.SMOKE_COLOR_SCHEME||"light"});
  const post=async(path,data)=>{
    const res=await page.request.post(base+"/assistant-api/"+path,{headers:{Origin:base},data});
    assert.equal(res.status(),200,path);return res.json();
  };
  const code=(await readFile(dir+"/parent-setup-code","utf8")).trim(),password="Synthetic-growth-2026";
  await post("parent-setup",{setupCode:code,username:"qa-parent",name:"模拟家长",password});
  await post("admin/accounts",{username:"qa-child",name:"模拟孩子",role:"child",password});
  await post("session",{username:"qa-child",password});
  const state=await (await page.request.get(base+"/assistant-api/reading/state")).json(),today=state.today;
  const book=await post("reading/books",{title:"小树的四季"});
  await post("reading/logs",{id:randomUUID(),version:0,bookId:book.id,date:today,startPage:1,endPage:6,minutes:16,summary:"小树迎来了春天。"});
  const db=new DatabaseSync(dir+"/learning/homework.sqlite");
  const question={id:"qa-1",kind:"objective",label:"第1题",question:"1+1等于几？",verdict:"correct"};
  db.prepare("INSERT INTO grading_runs(id,date,primary_page_id,source,active,status,result,created_at,updated_at) VALUES('growth-qa',?,'p',?,1,'done',?,'','')").run(today,JSON.stringify({subject:"数学"}),JSON.stringify({scopeComplete:true,questions:[question]}));
  db.close();
  await page.goto(base+"/reading/?view=growth");
  async function checkPeriodButtons(group){
    const buttons=group.getByRole("button");
    await buttons.first().waitFor();
    assert.equal(await buttons.count(),3);
    const boxes=[];
    for(const [i,icon] of ["calendar-range","calendar-days","graduation-cap"].entries()){
      const symbol=buttons.nth(i).locator("svg.lucide-"+icon+"[aria-hidden=true]");
      assert.ok(await symbol.isVisible());
      const target=await buttons.nth(i).boundingBox();
      const face=await buttons.nth(i).locator(".recap-choice-face").boundingBox();
      assert.ok(target.height>=44 && face.height<=30);
      boxes.push(target);
    }
    assert.ok(boxes.every(box=>Math.abs(box.y-boxes[0].y)<1 && box.x>=0 && box.x+box.width<=320));
  }
  await page.setViewportSize({width:320,height:844});
  await checkPeriodButtons(page.locator(".recap-entries"));
  await page.locator(".growth-recap").screenshot({path:process.env.SMOKE_OUTPUT_DIR+"/entries.png"});
  await page.getByRole("button",{name:"周小结",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"我的成长小结"});
  await checkPeriodButtons(dialog.locator(".recap-periods"));
  for(const period of ["周","月","学期"]){
    await dialog.getByRole("button",{name:period+"小结",exact:true}).click();
    await dialog.getByText("1 题中答对 1 题",{exact:true}).waitFor();
    await dialog.locator(".recap-bookmark").getByText("16 分钟", {exact:true}).waitFor();
    await dialog.getByText("再读 14 分钟，就到 30 分钟啦。").waitFor();
    assert.equal(await dialog.getByRole("progressbar").getAttribute("value"), "16");
    assert.ok(await dialog.locator(".recap-postage img").evaluate(img => img.complete && img.naturalWidth > 0));
    assert.ok(await dialog.getByRole("button",{name:"下一"+period}).isDisabled());
    await dialog.getByRole("button",{name:"上一"+period}).click();
    await dialog.getByText("本期还没有可统计的答题记录。").waitFor();
    assert.equal(await dialog.getByRole("progressbar").count(), 0);
    await dialog.getByRole("button",{name:"回到本"+period}).click();
    await dialog.getByText("100%",{exact:true}).waitFor();
  }
  let report = {
    subjects: [
      {subject:"数学",judged:31,denominator:24,correct:18,pending:2},
      {subject:"语文",judged:18,denominator:18,correct:17,pending:0},
      {subject:"英语",judged:0,denominator:0,correct:0,pending:3}
    ],
    reading:{books:2,days:6,minutes:80,finished:1}, steps:12
  };
  await page.route("**/practice/growth-recap?**", route => route.fulfill({json:report}));
  await dialog.getByRole("button",{name:"月小结",exact:true}).click();
  await dialog.getByText("你读到了最后一页！").waitFor();
  await dialog.getByText("正确率待统计").waitFor();
  await dialog.getByText("再读 10 分钟，就到 90 分钟啦。").waitFor();
  for(const width of [320,390,1024]){
    await page.setViewportSize({width,height:844});
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    if(width===390)await dialog.screenshot({path:process.env.SMOKE_OUTPUT_DIR+"/recap.png"});
  }
  report={...report,reading:{books:0,days:0,minutes:0,finished:0}};
  await dialog.getByRole("button",{name:"周小结",exact:true}).click();
  await dialog.getByText("向 50 道作答出发，还差 1 道。").waitFor();
  report={...report, subjects:[]};
  await dialog.getByRole("button",{name:"学期小结",exact:true}).click();
  await dialog.getByText("你的努力留下了脚印").waitFor();
  await dialog.getByRole("button",{name:"返回成长"}).click();
  await dialog.waitFor({state:"hidden"});
  console.log("GROWTH_RECAP_OK",process.env.SMOKE_BROWSER);
} finally {await browser.close();}
