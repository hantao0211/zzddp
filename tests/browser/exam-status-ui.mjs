// Isolated preview with synthetic exam records.
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL;
assert.equal(base,"https://127.0.0.1:3443");
const date="2026-11-20";
const viewer={id:"11111111-1111-4111-8111-111111111111",name:"模拟孩子",role:"child",username:"qa"};
const states=["整理中","已整理","待补传","识读未完成","等待识读"];
const labels=["正在识读","已整理","待补传","识读已停止","等待识读"];
const icons=["file-text","circle-check","upload","circle-alert","clock-3"];
const exams=states.map((status,i)=>({id:String(i),date,subject:"数学",title:i?"模拟试卷"+i:"第一单元 运算关系与运算律",status,pages:i===3?2:1,done:i===1||i===3?1:0,firstFailedPage:i===3?1:null}));
const engine=process.env.SMOKE_BROWSER==="webkit"?webkit:chromium;
const browser=await engine.launch({headless:true,args:engine===chromium?["--no-sandbox"]:[]});
try{
  const context=await browser.newContext({viewport:{width:320,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,colorScheme:process.env.SMOKE_COLOR_SCHEME});
  let page=await context.newPage();
  const errors=[];
  const pages=[
    {id:"first-page",number:1,status:"failed",note:"原图已保存，可重试本页。",coverage:"partial"},
    {id:"second-page",number:2,status:"done",note:"",coverage:"complete"}
  ];
  const questions=Array.from({length:24},(_,i)=>({id:"q"+i,pageId:"second-page",label:String(i+1),question:"模拟填空题",verdict:i<3?"uncertain":"correct"}));
  let retries=0;
  page.on("pageerror",e=>errors.push(e.message));
  await page.context().route("**/assistant-api/**",route=>{
    const url=new URL(route.request().url());
    const send=data=>route.fulfill({contentType:"application/json",body:JSON.stringify(data)});
    if(url.pathname.endsWith("/status"))return send({authenticated:true,available:true,accounts:true,viewer});
    if(url.pathname.endsWith("/practice/exams"))return send({items:url.searchParams.has("latest")?exams.slice(0,1):exams,total:exams.length,stage:null});
    if(url.pathname.endsWith("/practice/exams/3"))return send({exam:exams[3],pages,questions});
    if(url.pathname.endsWith("/exam-pages/first-page/retry") && route.request().method()==="POST"){
      retries++;pages[0].status="queued";pages[0].note="";return send({saved:true});
    }
    if(url.pathname.endsWith("/learning/state"))return send({date,pending:false,status:"processed",note:"",dates:[],quota:{calls:0,limit:60},uploads:[],report:null});
    if(url.pathname.endsWith("/reading/state"))return send(null);
    return send({items:[],date,entries:[],uncertainties:[],familyNotes:[]});
  });
  await page.goto(base+"/?studyDate="+date);
  const latest=page.locator(".exam-shelf > .exam-line");
  await latest.getByText("正在识读").waitFor();
  const initial=await latest.evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.getByRole("button",{name:/全部试卷/}).click();
  const list=page.getByRole("dialog").locator(".exam-line");
  await list.nth(3).waitFor();
  const colors=[];
  for(let i=0;i<states.length;i++){
    const row=list.nth(i);
    await row.getByText(labels[i],{exact:true}).waitFor();
    assert.equal(await row.locator("svg.lucide-"+icons[i]).count(),1);
    colors.push(await row.evaluate(el=>getComputedStyle(el).backgroundColor));
    assert.ok(await row.evaluate(el=>el.scrollWidth<=el.clientWidth));
  }
  assert.equal(new Set(colors).size,4);
  assert.equal(colors[0],initial);
  await list.nth(3).getByText(/共2页，已完成1页.*第1页未读完/).waitFor();
  const scanner=list.first().locator(".exam-scan-icon");
  const motion=()=>scanner.evaluate(el=>getComputedStyle(el,"::after").animationName);
  assert.equal(await motion(),"exam-read-page");
  for(const row of (await list.all()).slice(1))assert.equal(await row.locator(".exam-scan-icon").count(),0);
  await page.emulateMedia({reducedMotion:"reduce"});assert.equal(await motion(),"none");
  exams[4].status="已整理";
  exams[0].status="已整理";
  await list.first().getByText("已整理",{exact:true}).waitFor({timeout:12000});
  assert.equal(await scanner.count(),0);
  assert.equal(await list.first().evaluate(el=>getComputedStyle(el).backgroundColor),colors[1]);
  exams[3].status="已整理";exams[3].done=1;
  await list.nth(3).getByText("已整理",{exact:true}).waitFor({timeout:22000});
  await page.getByRole("button",{name:"关闭试卷档案"}).click();
  await latest.getByText("已整理").waitFor();
  exams[3].status="识读未完成";
  for (const role of ["child","parent"]) {
    viewer.role=role;
    if(role==="parent"){
      page=await page.context().newPage();
      page.on("pageerror",e=>errors.push(e.message));
      await page.goto(base+"/?studyDate="+date);
    }
    await page.getByRole("button",{name:/全部试卷/}).click();
    await page.getByRole("dialog").locator(".exam-line").nth(3).click();
    const modal=page.getByRole("dialog",{name:"试卷档案"});
    const failed=modal.locator(".exam-sheet").first();
    await failed.getByText("识读已停止",{exact:true}).waitFor();
    const actions=failed.locator(".exam-recovery-actions");
    if (role==="child") {
      assert.equal(await actions.count(),0);
      continue;
    }
    const body=modal.locator(":scope > .reading-dialog-body");
    const header=modal.locator(":scope > header");
    for (const [width,height,full] of [[320,670,true],[390,844,true],[844,390,true],[1024,844,false]]) {
      await page.setViewportSize({width,height});
      const bounds=await modal.boundingBox();
      if(full){assert.equal(bounds.y,0);assert.equal(bounds.height,height);assert.equal(bounds.width,width);}
      else assert.ok(bounds.width<width && bounds.height<height);
      const headerBefore=await header.boundingBox();
      await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});
      assert.ok(await body.evaluate(el=>el.scrollTop>0));
      assert.deepEqual(await header.boundingBox(),headerBefore);
      for(const filter of ["待核对 3","错题 0","全部 24"]) {
        await modal.getByRole("button",{name:filter,exact:true}).click();
        if(filter==="错题 0")await modal.getByText("没有已收录的错题。").waitFor();
        if(width===390 && filter==="错题 0" && process.env.SMOKE_OUTPUT_DIR){
          await modal.screenshot({path:process.env.SMOKE_OUTPUT_DIR+"/exam-empty-fullscreen.png"});
        }
        assert.deepEqual(await modal.boundingBox(),bounds);
        assert.deepEqual(await header.boundingBox(),headerBefore);
      }
    }
    const retry=actions.getByRole("button",{name:"重试本页"}),add=actions.getByRole("button",{name:"手动补题"});
    for(const width of [320,390,1024]){
      await page.setViewportSize({width,height:844});
      const a=await retry.boundingBox(),b=await add.boundingBox();
      assert.ok(a && b && Math.abs(a.y-b.y)<1 && b.x-a.x-a.width>=8);
      assert.ok(a.height>=44 && b.height>=44 && b.x+b.width<=width);
      if(width===390 && process.env.SMOKE_OUTPUT_DIR)await modal.screenshot({path:process.env.SMOKE_OUTPUT_DIR+"/page-actions.png"});
    }
    await add.click();
    await modal.getByRole("heading",{name:"补录题目",level:2}).waitFor();
    await modal.getByRole("button",{name:"取消",exact:true}).click();
    assert.ok(await add.evaluate(el=>el===document.activeElement));
    await retry.click();
    await failed.getByText("等待识读",{exact:true}).waitFor();
    assert.equal(retries,1);
  }
  assert.deepEqual(errors,[]);
  console.log("EXAM_STATE_COLORS_ICONS_AND_REFRESH_OK",process.env.SMOKE_BROWSER,colors);
}finally{await browser.close();}
