// Synthetic state only. Browser history can navigate outside an open modal on mobile.
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL;
assert.equal(base,"https://127.0.0.1:3443");
const engine=process.env.SMOKE_BROWSER==="webkit"?webkit:chromium;
const browser=await engine.launch({headless:true,args:engine===chromium?["--no-sandbox"]:[]});
try {
 const page=await browser.newPage({isMobile:true,hasTouch:true,viewport:{width:390,height:844},ignoreHTTPSErrors:true});
 const viewer={id:"fixture",role:"child",name:"模拟孩子",username:"child"};
 const date="2026-11-25";
 const data={viewer,today:date,books:[{id:"test-book",title:"测试读物",author:"",lastReadPage:100}],logs:[],calendar:[],rules:{dailyPoints:1,milestones:[]},stats:{currentStreak:0},growth:{balance:0,earned:0,ledger:[]},wishes:[],redemptions:[],rewards:[],reviewBudget:{used:0,limit:20}};
 const errors=[];page.setDefaultTimeout(9000);page.on("pageerror",e=>{errors.push(e.message);console.error(e.message);});
 await page.route("**/assistant-api/**",route=>{
   const path=new URL(route.request().url()).pathname;
   const result=path.endsWith("/status")?{available:true,authenticated:true,accounts:true,viewer}:path.endsWith("/reading/state")?data:path.endsWith("/learning/state")?{date,status:"empty",uploads:[],report:null,pending:false,dates:[]}:null;
   return route.fulfill({contentType:"application/json",body:JSON.stringify(result)});
 });
 await page.goto(base+"/reading/?studyDate="+date);
 const summary=page.locator("#reading-summary");
 await summary.fill("小兔子把信送到了。");
 const nav=()=>page.getByRole("navigation",{name:"底部学习导航"});
 await nav().getByRole("link",{name:"课业",exact:true}).tap();
 await page.getByRole("button",{name:"课业使用教程",exact:true}).tap();
 await page.waitForFunction(()=>!!document.querySelector("dialog:modal") && document.body.style.position==="fixed");
 await page.evaluate(()=>history.back());
 await page.waitForURL("**/reading/**");
 await summary.waitFor();
 const timer=page.getByRole("button",{name:"开始阅读计时",exact:true});
 await timer.scrollIntoViewIfNeeded();
 const state=await page.evaluate(()=>({hiddenModal:!!document.querySelector("[hidden] dialog:modal"),bodyPosition:document.body.style.position}));
 console.log("reading after Back",state);
 assert.equal(state.hiddenModal,false,"The inactive page is still blocking touch on Reading");
 await timer.tap({timeout:4000});
 await page.getByRole("button",{name:"结束计时并计入",exact:true}).tap();
 assert.equal(await summary.inputValue(),"小兔子把信送到了。");
 await nav().getByRole("link",{name:"课业",exact:true}).tap();
 await page.getByRole("button",{name:"关闭教程",exact:true}).tap();
 await page.waitForFunction(()=>document.body.style.position!=="fixed");
 assert.deepEqual(errors,[]);
 console.log("PASS real touch, reading timer, navigation and draft after modal history back");
} finally {await browser.close();}
