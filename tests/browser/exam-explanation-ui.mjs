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
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:engine===webkit?320:390,height:844},isMobile:true,hasTouch:true,colorScheme:engine===webkit?"dark":"light"}),errors=[];
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
 assert.equal(await dialog.locator('input:not([type=file])').count(),0);
 assert.equal(await dialog.getByLabel("试卷归属").inputValue(),"");
 const selection=engine===webkit?"extracurricular":"";
 if(selection)await dialog.getByLabel("试卷归属").selectOption(selection);
 const photos=await page.evaluate(()=>["#fff","#eee"].map(color=>{const c=document.createElement("canvas");c.width=100;c.height=90;const ctx=c.getContext("2d");ctx.fillStyle=color;ctx.fillRect(0,0,100,90);return c.toDataURL("image/png").split(",")[1];}));
 await dialog.locator("input[type=file]").setInputFiles(photos.map((p,i)=>({name:"page-"+i+".png",mimeType:"image/png",buffer:Buffer.from(p,"base64")})));
 await dialog.getByRole("button",{name:"上传并整理错题"}).click();
 await dialog.getByText("已收录 2 道错题",{exact:true}).waitFor({timeout:30000});
 const archive=await api("learning/practice/exams");
 assert.equal(archive.data.items[0].scope,selection||"curricular");
 await dialog.getByRole("button",{name:"错题 2",exact:true}).click();
 assert.equal(await dialog.locator(".exam-qrow").count(),2);
 await dialog.locator(".exam-qrow").first().click();
 await dialog.getByRole("button",{name:"手动核对"}).click();
 await dialog.locator('select[name="verdict"]').waitFor();
 assert.equal(await dialog.getByLabel("孩子原答").isVisible(),false);
 await dialog.getByRole("button",{name:"取消",exact:true}).click();
 await dialog.getByRole("button",{name:"查看原卷",exact:true}).click();
 await page.getByRole("dialog",{name:"照片预览"}).getByRole("button",{name:"关闭照片"}).click();
 await dialog.getByRole("button",{name:"向小步说明",exact:true}).click();
 await dialog.getByRole("textbox",{name:"向小步说明"}).fill("请看答案下面的勾。");
 await dialog.getByRole("button",{name:"请小步看原卷"}).click();
 await dialog.getByText("小步的回复",{exact:true}).waitFor({timeout:25000});
 await page.screenshot({path:process.env.SMOKE_OUTPUT_DIR+"/exam-explanation.png"});
 assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 await dialog.getByRole("button",{name:"下次也这样看"}).click();
 await dialog.getByRole("button",{name:"停用这条方法"}).waitFor();
 await dialog.getByRole("button",{name:"采用这次修改"}).click();
 await dialog.locator(".exam-question-text .v-correct").waitFor();
 await dialog.getByRole("button",{name:"返回题目"}).click();
 await dialog.getByText("已收录 1 道错题",{exact:true}).waitFor();
 await dialog.getByRole("button",{name:"关闭试卷档案"}).click();
 assert.equal((await api("session","POST",{username:"exam-child",password})).status,200);
 await page.reload();await page.locator(".exam-shelf .exam-line").first().click();
 await dialog.locator(".exam-qrow").first().click();
 assert.equal(await dialog.getByRole("button",{name:"手动核对"}).count(),0);
 await dialog.getByRole("button",{name:"向小步说明",exact:true}).click();
 await dialog.getByRole("textbox",{name:"向小步说明"}).fill("请看看孩子的订正。");
 await dialog.getByRole("button",{name:"请小步看原卷"}).click();
 await dialog.getByText("请看看孩子的订正。",{exact:true}).waitFor();
 assert.equal(await dialog.getByRole("button",{name:"采用这次修改"}).count(),0);
 assert.deepEqual(errors,[]);
 console.log("EXAM_EXPLANATION_PARENT_CHILD_REAL_HTTP_AND_MOBILE_LAYOUT_OK",process.env.SMOKE_BROWSER);
}catch(error){
 for(const context of browser.contexts())for(const page of context.pages()){
   console.error((await page.locator("dialog[open]").first().textContent({timeout:2000}).catch(()=>"no open dialog")).slice(-1200));
 }
 throw error;
}finally{await browser.close();}
