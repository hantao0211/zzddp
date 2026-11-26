// Invented family records only; intercept every family API.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base.endsWith(':3443'));await mkdir(output,{recursive:true});
const engine=process.env.SMOKE_BROWSER==='webkit'?webkit:chromium,browser=await engine.launch({headless:true,args:engine===chromium?['--no-sandbox']:[]});
const viewer={id:'11111111-1111-4111-8111-111111111111',name:'模拟家长',username:'qa-parent',role:'parent'};
const book={id:'22222222-2222-4222-8222-222222222222',title:'模拟阅读删除书',author:'',totalPages:200,revision:'a'.repeat(64),lastReadPage:79,finished:false,minutes:40,uniquePages:31,logCount:2};
const makeLog=(id,startPage)=>({id,version:1,bookId:book.id,date:'2026-11-23',startPage,endPage:79,minutes:20,summary:'这是一段虚构的阅读概括。',chapter:'',reflection:'',excerpt:'',imageId:null,reviewStatus:'queued',review:null,canEdit:true});
const duplicate=makeLog('33333333-3333-4333-8333-333333333333',79),original=makeLog('44444444-4444-4444-8444-444444444444',49);
let logs=[duplicate,original],deletes=[],hold,mode='slow';
const state=()=>({today:'2026-11-23',viewer,books:[book],logs,rules:{dailyPoints:1,backfillCounts:false,milestones:[]},stats:{days:logs.length?1:0,minutes:logs.length*20,pages:logs.length?31:0,currentStreak:logs.length?1:0,bestStreak:logs.length?1:0,booksFinished:0},growth:{balance:10,earned:10,ledger:[]},wishes:[],rewards:[],redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false});
try{
 const page=await browser.newPage({isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/assistant-api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,send=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  if(path.endsWith('/status'))return send({authenticated:true,accounts:true,available:true,viewer});
  if(path.endsWith('/reading/state'))return send(state());
  if(path.endsWith('/learning/state'))return send({date:'2026-11-23',status:'empty',pending:false,dates:[],uploads:[],report:null});
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/reading/logs')&&req.method()==='GET')return send({items:logs,total:logs.length});
  if(path.includes('/reading/logs/')&&req.method()==='DELETE'){
   deletes.push({id:path.split('/').at(-1),value:req.postDataJSON()});
   if(mode==='slow')await new Promise(resolve=>hold=resolve);
   if(mode==='reject')return send({error:'模拟网络繁忙，记录仍保留。'},503);
   const id=path.split('/').at(-1),alreadyDeleted=!logs.some(log=>log.id===id);logs=logs.filter(log=>log.id!==id);book.logCount=logs.length;book.minutes=logs.length*20;book.lastReadPage=logs.length?79:null;book.uniquePages=logs.length?31:0;
   if(mode==='lost')return route.abort('failed');
   return send({deleted:true,id,date:'2026-11-23',book,alreadyDeleted});
  }
  throw Error('Unexpected endpoint '+req.method()+' '+path);
 });
 await page.goto(base+'/reading/',{waitUntil:'networkidle'});
 const latest=page.locator('.study-reading-main>section').filter({has:page.getByRole('heading',{name:'最近一次阅读',exact:true})}).locator('.reading-record').first();
 await latest.getByRole('button',{name:'删除记录',exact:true}).tap();let dialog=page.getByRole('dialog',{name:'删除这条阅读记录？',exact:true});await dialog.getByText('2026-11-23 · 79—79页 · 20分钟',{exact:true}).waitFor();
 for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/delete-confirm-${scheme}-${width}.png`});}}
 await dialog.getByRole('button',{name:'保留记录',exact:true}).tap();assert.equal(deletes.length,0);await latest.getByRole('button',{name:'删除记录',exact:true}).tap();dialog=page.getByRole('dialog',{name:'删除这条阅读记录？',exact:true});
 await dialog.getByRole('button',{name:'确认删除',exact:true}).evaluate(el=>{el.click();el.click();});await dialog.getByRole('button',{name:'正在删除…',exact:true}).waitFor();assert.equal(deletes.length,1);assert.equal(logs.length,2);
 const toast=page.locator('.study-operation-feedback');await toast.getByText('正在删除阅读记录…',{exact:true}).waitFor();assert.equal(await toast.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
 mode='reject';hold();await dialog.locator('p.form-error').filter({hasText:'模拟网络繁忙，记录仍保留。'}).waitFor();assert.equal(logs.length,2);
 mode='normal';await dialog.getByRole('button',{name:'确认删除',exact:true}).tap();await dialog.waitFor({state:'detached'});try{await latest.getByText('2026-11-23 · 49—79页 · 20分钟',{exact:true}).waitFor({timeout:5000});}catch(error){console.log('DELETE_DEBUG='+JSON.stringify({logs,deletes,errors,text:await page.locator('body').innerText()}));await page.screenshot({path:output+'/delete-debug.png',fullPage:true});throw error;}assert.equal(logs.length,1);assert.equal(deletes[0].id,duplicate.id);assert.deepEqual(deletes[0].value,{version:1});
 await latest.getByRole('button',{name:'修改记录',exact:true}).tap();assert.equal(await page.getByLabel('开始页',{exact:true}).inputValue(),'49');await page.getByRole('button',{name:'删除这条记录',exact:true}).tap();dialog=page.getByRole('dialog',{name:'删除这条阅读记录？',exact:true});await dialog.getByText('2026-11-23 · 49—79页 · 20分钟',{exact:true}).waitFor();
 mode='lost';await dialog.getByRole('button',{name:'确认删除',exact:true}).tap();await dialog.locator('p.form-error').filter({hasText:/未收到服务器确认/}).waitFor();assert.equal(logs.length,0);
 mode='normal';await dialog.getByRole('button',{name:'确认删除',exact:true}).tap();await dialog.waitFor({state:'detached'});await page.getByText('第一次打卡后，这里会留下阅读脚印。',{exact:true}).waitFor();await page.locator('.reading-entry-trigger').click();assert.equal(await page.getByLabel('开始页',{exact:true}).inputValue(),'1');assert.equal(await page.locator('#reading-summary').inputValue(),'');assert.equal(book.minutes,0);assert.equal(state().growth.balance,10);
 await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.reading-record').count(),0);assert.deepEqual(errors,[]);
 console.log('READING_DELETE_UI_OK=true confirm-cancel,slow-double-click,visible-feedback,retry-failure,lost-response-idempotence,latest-and-edit-entry,progress-reset,light-dark-320-390');
}finally{await browser.close();}
