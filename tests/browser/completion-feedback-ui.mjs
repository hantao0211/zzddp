// Synthetic family. Exercise the normal task detail in a narrow mobile viewport.
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL;
assert.ok(base.endsWith(":3443"));
const engine=process.env.SMOKE_BROWSER==="webkit"?webkit:chromium;
const browser=await engine.launch({headless:true,args:engine===chromium?["--no-sandbox"]:[]});
const date="2026-11-25", token="a".repeat(64);
const evidence={fileId:"page",page:1,excerpt:"模拟作答"};
const task={id:"t",subject:"语文",title:"模拟听写",requirement:"听写",format:"written",coverage:"complete",missing:[],evidence:[evidence],memoEvidence:[],writtenCompletion:{version:"written-v2",status:"unclear",reason:"有一处待复查",parts:[{label:"第一处",status:"unclear",evidence}]}};
try {
 for(const role of ["child","parent"]) {
  const page=await browser.newPage({viewport:{width:375,height:800},isMobile:true,hasTouch:true,colorScheme:process.env.SMOKE_COLOR_SCHEME,ignoreHTTPSErrors:true});
  let latest,submitted,savedRule;
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/assistant-api/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    const send=value=>route.fulfill({contentType:"application/json",body:JSON.stringify(value)});
    if(path.endsWith("/status")) return send({authenticated:true,available:true,accounts:true,viewer:{id:role,role,username:role,name:"模拟账号"}});
    if(path.endsWith("/completion-feedback/convention")){savedRule=route.request().postDataJSON();return send({saved:true});}
    if(path.endsWith("/completion-feedback")){submitted=route.request().postDataJSON();latest={id:"receipt",reason:submitted.reason,note:submitted.note,status:submitted.confirm?"confirmed":"pending"};return send({id:latest.id});}
    if(path.endsWith("/learning/state")) return send({date,status:"processed",pending:latest?.status==="pending",quota:{calls:0,limit:100},writtenCompletionEnabled:true,dates:[date],
      uploads:[{id:"upload",date,kind:"homework",status:"processed",subjects:["语文"],issues:[],files:[{id:"file",name:"模拟作业.jpg",stored:true,pages:[{id:"page",number:1}]}]}],
      completionFeedback:{t:{token,latest}},report:{date,memoId:"memo",updatedAt:"",tasks:[task],unclassified:[],unassigned:[],uncertainties:[],familyNotes:[]}});
    if(path.includes("/pages/"))return route.fulfill({contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA5sAAAAASUVORK5CYII=","base64")});
    return send(null);
  });
  await page.goto(base+"/?studyDate="+date);
  await page.getByRole("button",{name:"查看模拟听写的完成情况",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByRole("button",{name:"这里判错了"}).click();
  await dialog.getByLabel("哪里看错了？").selectOption("correction");
  await dialog.getByLabel("补充一句（选填）").fill("另起一行重写了两遍");
  if(role==="parent"){
    await dialog.getByText("让小步记住今后的约定",{exact:true}).click();
    await dialog.getByLabel("适用场景").fill("听写");
    await dialog.getByLabel("这门课今后怎么判断？").fill("我们家听写订正通常写在末行。");
    await dialog.getByRole("button",{name:"保存家庭约定"}).click();
    await dialog.getByText(/已记住，可在家长管理/).waitFor();
    assert.equal(savedRule.trigger,"听写");
  }else{
    assert.equal(await dialog.getByRole("button",{name:"我已核对，确认写完"}).count(),0);
    assert.equal(await dialog.getByText("让小步记住今后的约定").count(),0);
  }
  await dialog.getByRole("button",{name:role==="parent"?"我已核对，确认写完":"请小步重看原图"}).click();
  await dialog.getByText(role==="parent"?"家长已确认写完":"小步正在重看原图",{exact:true}).waitFor();
  assert.equal(submitted.taskId,"t");assert.equal(submitted.reason,"correction");assert.equal(submitted.confirm,role==="parent");
  if(role==="child") {
    latest={...latest,status:"reviewed",learned:["看到另起一行重写时，核对原答和订正。"]};
    await page.reload();
    await page.getByRole("button",{name:"查看模拟听写的完成情况",exact:true}).click();
    await dialog.getByText("小步学到了",{exact:true}).waitFor();
    await dialog.getByText(latest.learned[0],{exact:true}).waitFor();
  }
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log("PASS child requests original-photo review; parent confirms completion and saves future convention");
} finally {await browser.close();}
