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
  await page.getByRole("button",{name:"周小结",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"我的成长小结"});
  for(const period of ["周","月","学期"]){
    await dialog.getByRole("button",{name:period+"小结",exact:true}).click();
    await dialog.getByText("1 题中答对 1 题",{exact:true}).waitFor();
    await dialog.getByText(/共 16 分钟/).waitFor();
    assert.ok(await dialog.getByRole("button",{name:"下一"+period}).isDisabled());
    await dialog.getByRole("button",{name:"上一"+period}).click();
    await dialog.getByText("本期还没有可统计的答题记录。").waitFor();
    await dialog.getByRole("button",{name:"回到本"+period}).click();
    await dialog.getByText("100%",{exact:true}).waitFor();
  }
  for(const width of [320,390,1024]){
    await page.setViewportSize({width,height:844});
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    if(width===390)await dialog.screenshot({path:process.env.SMOKE_OUTPUT_DIR+"/recap.png"});
  }
  await dialog.getByRole("button",{name:"返回成长"}).click();
  await dialog.waitFor({state:"hidden"});
  console.log("GROWTH_RECAP_OK",process.env.SMOKE_BROWSER);
} finally {await browser.close();}
