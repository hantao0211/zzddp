// Synthetic reading records and mocked APIs only. No real data or AI calls.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(':3443'));await mkdir(output,{recursive:true});
const viewer={id:'11111111-1111-4111-8111-111111111111',name:'模拟孩子',username:'qa-child',role:'child'},bookId='22222222-2222-4222-8222-222222222222';
const book={id:bookId,revision:'a'.repeat(64),title:'模拟书名（待更正）',author:'模拟作者',publisher:'模拟出版社',isbn:'',totalPages:241,catalogId:null,description:'',sourceUrl:null,createdAt:'2026-11-22T00:00:00Z',finished:false,uniquePages:22,minutes:25,logCount:1};
const log={id:'33333333-3333-4333-8333-333333333333',bookId,version:1,date:'2026-11-22',startPage:27,endPage:48,minutes:25,summary:'人物遇到困难后，和朋友一起想办法。',chapter:'',reflection:'',excerpt:'',imageId:null,actorId:viewer.id,backfilled:false,createdAt:'',updatedAt:'',reviewStatus:'done',canEdit:true,review:{summaryFeedback:'你把遇到的事情说明白了。',strengths:[],nextStep:'',followUpQuestion:'',expression:'clear',comparison:'insufficient_evidence',comparisonReason:'仅评价你的概括。',evidenceQuote:'',evidenceReadable:false,basis:'none',timingNote:'时长是阅读记录。'}};
const state=()=>({today:'2026-11-23',viewer,books:[book],logs:[log],rules:{dailyPoints:2,backfillCounts:false,milestones:[]},stats:{days:1,minutes:25,pages:22,currentStreak:1,bestStreak:1,booksFinished:0},growth:{balance:2,earned:2,ledger:[]},wishes:[],rewards:[],redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false});

const errors=[],writes=[];
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
function contrast(a,b){const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const [x,y]=[lum(a),lum(b)].sort((x,y)=>x-y);return (y+.05)/(x+.05);}
const rgb=s=>s.match(/[\d.]+/g).map(Number);
async function settle(page){await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));}
async function field(page,locator,mode){
 const styles=await locator.evaluate(el=>{const s=getComputedStyle(el),p=getComputedStyle(el,'::placeholder');return{bg:s.backgroundColor,color:s.color,placeholder:p.color,scheme:s.colorScheme};});
 const bg=rgb(styles.bg);assert.ok(contrast(rgb(styles.color),bg)>=4.5,'Input text contrast');
 assert.ok(contrast(rgb(styles.placeholder),bg)>=4.5,'Input placeholder contrast');
 assert.equal(styles.scheme,mode);assert.ok(mode==='dark'?Math.max(...bg.slice(0,3))<90:Math.min(...bg.slice(0,3))<245,'Fields use paper tones instead of white');
}
async function audit(page,label){const values=await page.evaluate(()=>{
 const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number);
 const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const result=[];for(const el of document.querySelectorAll('body *')){
  if(!el.checkVisibility()||el.closest('[aria-hidden=true], [disabled]')||!Array.from(el.childNodes).some(n=>n.nodeType===3&&n.textContent.trim()))continue;
  const style=getComputedStyle(el);if(style.opacity!=='1')continue;
  let bg=[255,255,255,1];for(let p=el;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length===3||c[3]===1){bg=c;break;}}
  const color=rgb(style.color);if(color.length<3)continue;const [x,y]=[lum(color),lum(bg)].sort((a,b)=>a-b),ratio=(y+.05)/(x+.05);
  if(ratio<4.5)result.push({tag:el.tagName,cls:el.className,text:el.textContent.trim().slice(0,35),ratio:Math.round(ratio*100)/100});
 }return result.slice(0,20);
 });assert.deepEqual(values,[],label+' text must remain readable');}
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'light'});
 page.on('pageerror',e=>errors.push(e.message));let authenticated=true;
 await page.route('**/assistant-api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,send=v=>route.fulfill({contentType:'application/json',body:JSON.stringify(v)});
  if(req.method()!=='GET')writes.push(path);
  if(path.endsWith('/status'))return send({authenticated,available:true,accounts:true,viewer:authenticated?viewer:null,speech:true});
  if(path.endsWith('/reading/state'))return send(state());
  if(path.endsWith('/learning/state'))return send({date:'2026-11-23',status:'empty',pending:false,note:'',dates:[],quota:{calls:0,limit:100},uploads:[],report:null});
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/homework-context'))return send({date:'2026-11-23',revision:1,hasMaterials:false,pending:false,entries:[],uncertainties:[],familyNotes:[],availableDates:[]});
  throw Error('Unexpected mock '+path);
 });
 await page.goto(base+'/reading/',{waitUntil:'networkidle'});
 const summary=page.locator('#reading-summary');await summary.fill('主题切换后，保留我正在写的阅读概括。');
 await page.getByLabel('开始页',{exact:true}).fill('49');
 for(const mode of ['light','dark']){
  await page.emulateMedia({colorScheme:mode});await settle(page);
  await field(page,summary,mode);await field(page,page.getByLabel('开始页',{exact:true}),mode);
  await field(page,page.getByLabel('正在读的书',{exact:true}),mode);
  assert.equal(await summary.inputValue(),'主题切换后，保留我正在写的阅读概括。');
  assert.equal(await page.getByLabel('开始页',{exact:true}).inputValue(),'49');
  await summary.focus();const focused=await summary.evaluate(el=>getComputedStyle(el).backgroundColor);await page.getByRole('heading',{name:'我的阅读手帐',exact:true}).click();assert.notEqual(focused,await summary.evaluate(el=>getComputedStyle(el).backgroundColor));
  for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:output+`/reading-${mode}-${width}.png`});
  }
  await audit(page,'reading '+mode);
  await page.getByRole('button',{name:'添加书籍',exact:true}).click();const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'添加书籍',exact:true})});await dialog.waitFor();
  await field(page,dialog.getByLabel('书名',{exact:true}),mode);
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});await page.screenshot({path:output+`/book-dialog-${mode}-${width}.png`});}
  await audit(page,'dialog '+mode);await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 }
 await page.emulateMedia({colorScheme:'light'});await settle(page);assert.equal(await summary.inputValue(),'主题切换后，保留我正在写的阅读概括。');
 await page.goto(base+'/?assistant=1',{waitUntil:'networkidle'});
 for(const mode of ['light','dark']){await page.emulateMedia({colorScheme:mode});await settle(page);await field(page,page.locator('#assistant-question'),mode);await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+`/assistant-${mode}-390.png`});await audit(page,'assistant '+mode);}
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.emulateMedia({colorScheme:'dark'});await settle(page);await page.screenshot({path:output+'/home-dark-390.png'});
 await page.emulateMedia({media:'print'});assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'light');await page.emulateMedia({media:'screen'});
 authenticated=false;await page.goto(base+'/admin/',{waitUntil:'networkidle'});
 for(const mode of ['light','dark']){await page.emulateMedia({colorScheme:mode});await settle(page);await field(page,page.getByLabel('登录名',{exact:true}),mode);await page.screenshot({path:output+`/admin-login-${mode}-390.png`});await audit(page,'admin '+mode);}
 assert.equal(writes.length,0,'Changing the system theme never submits drafts');assert.deepEqual(errors,[]);
 console.log('SYSTEM_THEME_UI_OK=true system-live-switch,no-reload,draft-preserved,paper-fields,contrast,focus,book-dialog,assistant,admin,print-light,no-writes,320-390-768-1280');
}finally{await browser.close();}
