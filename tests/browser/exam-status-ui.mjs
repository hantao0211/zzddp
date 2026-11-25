// Isolated preview with synthetic exam records.
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL;
assert.equal(base,"https://127.0.0.1:3443");
const date="2026-11-20";
const viewer={id:"11111111-1111-4111-8111-111111111111",name:"模拟孩子",role:"child",username:"qa"};
const states=["整理中","已整理","待补传","需核对"];
const icons=["clock-3","circle-check","upload","circle-alert"];
const exams=states.map((status,i)=>({id:String(i),date,subject:"数学",title:i?"模拟试卷"+i:"第一单元 运算关系与运算律",status,pages:1,done:i===1?1:0}));
const engine=process.env.SMOKE_BROWSER==="webkit"?webkit:chromium;
const browser=await engine.launch({headless:true,args:engine===chromium?["--no-sandbox"]:[]});
try{
  const page=await browser.newPage({viewport:{width:320,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,colorScheme:process.env.SMOKE_COLOR_SCHEME});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/assistant-api/**",route=>{
    const url=new URL(route.request().url());
    const send=data=>route.fulfill({contentType:"application/json",body:JSON.stringify(data)});
    if(url.pathname.endsWith("/status"))return send({authenticated:true,available:true,accounts:true,viewer});
    if(url.pathname.endsWith("/practice/exams"))return send({items:url.searchParams.has("latest")?exams.slice(0,1):exams,total:exams.length,stage:null});
    if(url.pathname.endsWith("/learning/state"))return send({date,pending:false,status:"processed",note:"",dates:[],quota:{calls:0,limit:60},uploads:[],report:null});
    if(url.pathname.endsWith("/reading/state"))return send(null);
    return send({items:[],date,entries:[],uncertainties:[],familyNotes:[]});
  });
  await page.goto(base+"/?studyDate="+date);
  const latest=page.locator(".exam-shelf > .exam-line");
  await latest.getByText("整理中").waitFor();
  const initial=await latest.evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.getByRole("button",{name:/全部试卷/}).click();
  const list=page.getByRole("dialog").locator(".exam-line");
  await list.nth(3).waitFor();
  const colors=[];
  for(let i=0;i<states.length;i++){
    const row=list.nth(i);
    await row.getByText(states[i],{exact:true}).waitFor();
    assert.equal(await row.locator("svg.lucide-"+icons[i]).count(),1);
    colors.push(await row.evaluate(el=>getComputedStyle(el).backgroundColor));
    assert.ok(await row.evaluate(el=>el.scrollWidth<=el.clientWidth));
  }
  assert.equal(new Set(colors).size,4);
  assert.equal(colors[0],initial);
  exams[0].status="已整理";
  await list.first().getByText("已整理",{exact:true}).waitFor({timeout:12000});
  assert.equal(await list.first().evaluate(el=>getComputedStyle(el).backgroundColor),colors[1]);
  await page.getByRole("button",{name:"关闭试卷档案"}).click();
  await latest.getByText("已整理").waitFor();
  assert.deepEqual(errors,[]);
  console.log("EXAM_STATE_COLORS_ICONS_AND_REFRESH_OK",process.env.SMOKE_BROWSER,colors);
}finally{await browser.close();}
