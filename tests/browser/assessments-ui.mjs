// Isolated, disposable family and simulated recognition. No production account or AI calls.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,dir=process.env.PRACTICE_QA_DIRECTORY;
assert.equal(base,"https://127.0.0.1:3443");assert.ok(dir.endsWith("/xiaobu-practice-qa"));
const engine=process.env.SMOKE_BROWSER==="webkit"?webkit:chromium;
const browser=await engine.launch({headless:true,args:engine===chromium?["--no-sandbox"]:[]});
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:engine===webkit?"dark":"light"}),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base);
 const api=(path,method="GET",body)=>page.evaluate(async({path,method,body})=>{
  const response=await fetch("/assistant-api/"+path,{method,...(body===undefined?{}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json()};
 },{path,method,body});
 const password="Synthetic-assessment-1",code=(await readFile(dir+"/parent-setup-code","utf8")).trim();
 assert.equal((await api("parent-setup","POST",{setupCode:code,username:"exam-admin",name:"模拟家长",password})).status,200);
 await api("admin/accounts","POST",{username:"exam-child",name:"模拟孩子",role:"child",password});
 await api("reading/student-profile","PATCH",{grade:4,semester:1,school:"",region:""});
 await page.reload();await page.getByRole("heading",{name:"我的课业手账"}).waitFor();
 await page.getByRole("button",{name:"上传试卷",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"试卷档案"});
 await dialog.getByLabel("试卷名称").fill("模拟英语期中考");await dialog.getByLabel("科目").selectOption("英语");
 await dialog.getByLabel("类型").selectOption("考试");await dialog.locator("select[name=grade]").selectOption("4");
 await dialog.locator("select[name=semester]").selectOption("1");
 const photos=await page.evaluate(()=>["#fff","#eee"].map(color=>{const c=document.createElement("canvas");c.width=100;c.height=90;const ctx=c.getContext("2d");ctx.fillStyle=color;ctx.fillRect(0,0,100,90);return c.toDataURL("image/png").split(",")[1];}));
 await dialog.locator("input[type=file]").setInputFiles(photos.map((p,i)=>({name:"page-"+i+".png",mimeType:"image/png",buffer:Buffer.from(p,"base64")})));
 await dialog.getByRole("button",{name:"保存并识读试卷"}).click();
 await dialog.getByRole("heading",{name:"第 2 页 · 已整理"}).waitFor({timeout:30000});
 await dialog.getByRole("button",{name:"查看原卷"}).first().click();
 await page.getByRole("button",{name:"关闭照片"}).click();
 assert.equal(await dialog.locator("summary").filter({hasText:"待核对"}).count(),2);
 await dialog.getByRole("button",{name:"关闭试卷档案"}).click();
 await page.getByRole("button",{name:"我的错题本",exact:true}).click();
 const book=page.getByRole("region",{name:"错题本",exact:true});
 await book.getByText("题型、阶段与更多筛选",{exact:true}).click();
 await book.getByRole("button",{name:"考试",exact:true}).click();
 await book.getByText("我的错题本 · 2题",{exact:true}).waitFor();
 await book.locator("summary").filter({hasText:"薄弱项与长期趋势"}).click();
 await book.getByText(/已核验原作答错误率 50%/).waitFor();
 await book.locator(".mistake-toggle").first().click();
 await book.locator("summary").filter({hasText:"分类标签与依据"}).click();
 await book.getByRole("button",{name:"校正本题标签"}).click();
 await book.locator('.question-tags input[name="knowledge"]').fill("模拟词义辨析");await book.getByRole("button",{name:"保存标签",exact:true}).click();
 await book.locator('.question-tags').getByText(/模拟词义辨析/).first().waitFor();
 const list=await api("learning/practice/exams");const detail=(await api("learning/practice/exams/"+list.data.items[0].id)).data;
 assert.equal(detail.questions.length,6);
 await api("session","DELETE");await api("session","POST",{username:"exam-child",password});
 assert.equal((await api("learning/practice/exam-pages/"+detail.pages[0].id+"/review","POST",{})).status,403);
 await page.reload();await page.getByRole("heading",{name:"我的课业手账"}).waitFor();
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);console.log("EXAM_UPLOAD_REVIEW_FILTER_ANALYSIS_OK "+process.env.SMOKE_BROWSER);
}finally{await browser.close();}
