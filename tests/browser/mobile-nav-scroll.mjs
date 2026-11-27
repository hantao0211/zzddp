// Synthetic book and reading log only. No production writes, catalog requests or AI calls.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base?.endsWith(':3443'));await mkdir(output,{recursive:true});
const viewer={id:'11111111-1111-4111-8111-111111111111',name:'模拟家长',username:'qa-parent',role:'parent'},bookId='22222222-2222-4222-8222-222222222222';
let book={id:bookId,revision:'a'.repeat(64),title:'模拟书名（待更正）',author:'模拟作者',publisher:'模拟出版社',isbn:'',totalPages:241,catalogId:null,description:'',sourceUrl:null,createdAt:'2026-11-22T00:00:00Z',finished:false,lastReadPage:48,uniquePages:22,minutes:25,logCount:1};
const log={id:'33333333-3333-4333-8333-333333333333',bookId,version:1,date:'2026-11-22',startPage:27,endPage:48,minutes:25,summary:'人物遇到困难后，和朋友一起想办法。',chapter:'',reflection:'',excerpt:'',imageId:null,actorId:viewer.id,backfilled:false,createdAt:'',updatedAt:'',reviewStatus:'done',canEdit:true,review:{summaryFeedback:'你把遇到的事情说明白了。',strengths:[],nextStep:'',followUpQuestion:'',expression:'clear',comparison:'insufficient_evidence',comparisonReason:'仅评价你的概括。',evidenceQuote:'',evidenceReadable:false,basis:'none',timingNote:'时长是阅读记录。'}};
const state=()=>({today:'2026-11-23',viewer,books:[book],logs:[log],rules:{dailyPoints:2,backfillCounts:false,milestones:[]},stats:{days:1,minutes:25,pages:22,currentStreak:1,bestStreak:1,booksFinished:0},growth:{balance:2,earned:2,ledger:[]},wishes:[],rewards:[],redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false});
const errors=[],browser=await (process.env.SMOKE_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
try{
 const page=await browser.newPage({ ignoreHTTPSErrors:true, colorScheme:process.env.SMOKE_COLOR_SCHEME || 'light',viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.on('pageerror',e=>errors.push(e.message));
 const mockApi=async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer});
  if(path.endsWith('/reading/state'))return send(state());
  if(path.endsWith('/learning/state'))return send({date:'2026-11-23',status:'empty',pending:false,note:'',dates:[],quota:{calls:0,limit:100},uploads:[],report:null});
  if(path.endsWith('/practice/exams'))return send({items:[],total:0,stage:{grade:4,semester:1}});
  if(path.endsWith('/memories'))return send({items:[]});
  throw Error('Unexpected mocked API '+path);
 };
 await page.route('**/assistant-api/**',mockApi);
 await page.goto(base+'/reading/',{waitUntil:'networkidle'});

 const nav=page.getByRole("navigation",{name:"底部学习导航"});
 await nav.waitFor();
 async function check(step) {
   const bounds=await nav.evaluate(el=>{
     const viewport=window.visualViewport, box=el.getBoundingClientRect();
     return { left:box.left-viewport.offsetLeft, right:box.right-viewport.offsetLeft-viewport.width,
       bottom:box.bottom-viewport.height-viewport.offsetTop,
       buttons:[...el.children].every(node=>{
         const r=node.getBoundingClientRect();
         return r.top>=viewport.offsetTop && r.height>=40 && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest(".study-nav-item")===node;
       }),scrollX:window.scrollX };
   });
   assert.ok(Math.abs(bounds.left)<2 && Math.abs(bounds.right)<2 && Math.abs(bounds.bottom)<2 && bounds.buttons,step+JSON.stringify(bounds));
 }
 for(const width of [390,320]) {
   await page.setViewportSize({width,height:760});
   await page.locator(".reading-entry-trigger").click();
   await page.getByRole("button",{name:"返回手帐",exact:true}).click();
   for(const position of [0,0.5,1]) {
     await page.evaluate(f=>window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f),position);
     await page.waitForTimeout(80);
     await check("scroll "+width+" "+position);
   }
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=1,"horizontal overflow: "+overflow);
 }
 // Mobile browser chrome, the keyboard and zoom can resize or pan the visual
 // viewport without resizing the layout viewport. WebKit automation has no
 // browser toolbar, so replay those geometry events against the real page.
 await page.evaluate(()=>{
   const v=visualViewport;
   for(const [key,value] of Object.entries({scale:1.25,width:285,height:530,offsetTop:38,offsetLeft:11}))
     Object.defineProperty(v,key,{configurable:true,get:()=>value});
   v.dispatchEvent(new Event("resize")); v.dispatchEvent(new Event("scroll"));
 });
 await check("visible viewport after pan");
 await page.evaluate(()=>{
   for(const key of ["scale","width","height","offsetTop","offsetLeft"])delete visualViewport[key];
   visualViewport.dispatchEvent(new Event("resize"));
 });
 await check("restored");
 await nav.getByText("成长",{exact:true}).click();
 await page.getByRole("heading",{name:"我的小脚步",exact:true}).waitFor();
 await check("growth tab");
 await nav.getByText("商城",{exact:true}).click();
 await page.getByRole("heading",{name:"我的心愿商城",exact:true}).waitFor();
 await page.evaluate(()=>{
   Object.defineProperty(visualViewport,"height",{configurable:true,get:()=>530});
   window.dispatchEvent(new Event("pageshow"));
 });
 const layout=await nav.evaluate(el=>({
   bottom:el.getBoundingClientRect().bottom,
   height:innerHeight,
   top:el.parentElement.querySelector(".study-workspace").getBoundingClientRect().top,
   overscroll:getComputedStyle(document.documentElement).overscrollBehaviorY,
 }));
 assert.ok(Math.abs(layout.bottom-layout.height)<2 && layout.top>=0 && layout.top<16,JSON.stringify(layout));
 assert.equal(layout.overscroll,"none");
 await page.evaluate(()=>{delete visualViewport.height; visualViewport.dispatchEvent(new Event("resize"));});
 await check("restored mall");
 await page.getByRole("button",{name:"我要许愿"}).click();
 const wish=page.locator("dialog[open]");
 await wish.getByLabel("我的心愿",{exact:true}).focus();
 await page.evaluate(()=>{
   Object.defineProperty(visualViewport,"height",{configurable:true,get:()=>500});
   visualViewport.dispatchEvent(new Event("resize"));
 });
 assert.equal(Math.round((await nav.boundingBox()).y+(await nav.boundingBox()).height),500);
 await wish.getByRole("button",{name:/关闭/}).click();
 await page.waitForFunction(()=>!document.querySelector(".study-bottom-nav[data-visual-anchor]"));
 assert.ok(await nav.evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-innerHeight)<2));
 await page.evaluate(()=>{delete visualViewport.height; visualViewport.dispatchEvent(new Event("resize"));});
 await nav.getByText("课业",{exact:true}).click();
 await page.waitForURL(url=>url.pathname==="/");
 await check("home tab");
 assert.deepEqual(errors,[]);
 console.log("NAV_SCROLL_OK",process.env.SMOKE_BROWSER);
} finally { await browser.close(); }
