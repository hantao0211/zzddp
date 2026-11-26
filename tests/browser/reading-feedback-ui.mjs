// Isolated invented records. No production mutations or AI calls.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base.endsWith(':3443'));await mkdir(output,{recursive:true});
const engine=process.env.SMOKE_BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true,args:engine===chromium?['--no-sandbox']:[]});
const id='11111111-1111-4111-8111-111111111111',bookId='22222222-2222-4222-8222-222222222222';
const viewer={id,name:'模拟孩子',role:'child',username:'synthetic-child'};
const book={id:bookId,title:'模拟故事书',author:'模拟作者',totalPages:200,revision:'a'.repeat(64),lastReadPage:48,finished:false,uniquePages:22,minutes:25,logCount:1};
const reading={today:'2026-11-23',viewer,books:[book],logs:[],rules:{dailyPoints:1,backfillCounts:false,milestones:[]},stats:{days:1,minutes:25,pages:22,currentStreak:1,bestStreak:1,booksFinished:0},growth:{balance:10,earned:10,ledger:[]},wishes:[],rewards:[],redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false};
let posts=[],mode='slow',release,brokenRefresh=false;const rows=new Map();
try {
 const page=await browser.newPage({isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assistant-api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,send=(v,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
  if(path.endsWith('/status'))return send({authenticated:true,accounts:true,available:true,viewer});
  if(path.endsWith('/reading/state'))return brokenRefresh?send({error:'模拟列表刷新失败'},503):send(reading);
  if(path.endsWith('/learning/state'))return send({date:'2026-11-23',status:'empty',pending:false,dates:[],uploads:[],report:null});
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/reading/logs')&&req.method()==='POST'){
   const input=req.postDataJSON();posts.push(input);
   if(mode==='slow')await new Promise(resolve=>release=resolve);
   if(mode==='reject')return send({error:'模拟校验未通过，请检查页码。'},400);
   let log=rows.get(input.id);
   if(!log||input.version>0){log={...input,version:input.version+1,canEdit:true,reviewStatus:'queued',review:null,imageId:null};rows.set(input.id,log);reading.logs=[log,...reading.logs.filter(l=>l.id!==log.id)];book.lastReadPage=log.endPage;}
   if(mode==='lost')return route.abort('failed');
   return send({log,book,pointsAdded:posts.length===1?1:0});
  }
  if(path.endsWith('/reading/books')&&req.method()==='POST')return send({error:'模拟书籍保存失败，请稍后重试。'},503);
  throw Error('Unexpected mock endpoint '+req.method()+' '+path);
 });
 await page.goto(base+'/reading/',{waitUntil:'networkidle'});
 await page.locator('.reading-entry-trigger').click();
 const form=page.locator('.reading-checkin form'),start=page.getByLabel('开始页',{exact:true}),end=page.getByLabel('结束页',{exact:true}),minutes=page.getByLabel('时长（分钟）',{exact:true}),summary=page.locator('#reading-summary');
 await start.waitFor();assert.equal(await start.inputValue(),'49');await end.fill('79');await minutes.fill('20');await summary.fill('这是一段模拟的阅读概括。');
 const save=page.getByRole('button',{name:'完成阅读打卡',exact:true});await save.scrollIntoViewIfNeeded();
 await form.evaluate(el=>{el.requestSubmit();el.requestSubmit();});
 await page.getByRole('button',{name:'正在保存，请稍候…',exact:true}).waitFor();assert.equal(posts.length,1);assert.equal(await start.isDisabled(),true);
 const toast=page.locator('.study-operation-feedback');await toast.getByText('正在保存阅读，请稍候…',{exact:true}).waitFor();
 assert.equal(await toast.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;}),true);
 assert.equal(await page.locator('.reading-save-receipt').count(),0);
 // Saving is successful even if the subsequent list refresh fails.
 brokenRefresh=true;mode='normal';release();const receipt=page.locator('.reading-save-receipt');await receipt.getByText('阅读打卡成功，已保存',{exact:true}).waitFor();
 assert.match(await receipt.innerText(),/49—79页 · 20分钟/);assert.equal(await page.getByRole('button',{name:'已保存',exact:true}).isDisabled(),true);assert.equal(await summary.inputValue(),'这是一段模拟的阅读概括。');
 await page.waitForTimeout(700);assert.equal(await receipt.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),true);
 assert.equal(await page.getByRole('button',{name:'已保存',exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(117, 101, 116)');
 await form.evaluate(el=>el.requestSubmit());assert.equal(posts.length,1);brokenRefresh=false;
 assert.equal(posts.length,1);
 await receipt.getByRole('button',{name:'修改这次记录',exact:true}).tap();assert.equal(await start.inputValue(),'49');await minutes.fill('21');await page.getByRole('button',{name:'保存修改',exact:true}).tap();await receipt.getByText('阅读修改已保存',{exact:true}).waitFor();assert.equal(rows.size,1);assert.equal(posts[1].id,posts[0].id);assert.equal(posts[1].version,1);
 await receipt.getByRole('button',{name:'再记一次阅读',exact:true}).tap();assert.equal(await start.inputValue(),'80');assert.equal(await summary.inputValue(),'');assert.equal(await minutes.inputValue(),'');
 await end.fill('90');await minutes.fill('10');await summary.fill('另一次独立的模拟阅读。');mode='reject';await page.getByRole('button',{name:'完成阅读打卡',exact:true}).tap();await page.locator('.reading-save-error').getByText('模拟校验未通过，请检查页码。',{exact:true}).waitFor();assert.equal(await summary.inputValue(),'另一次独立的模拟阅读。');assert.equal(await page.getByRole('button',{name:'完成阅读打卡',exact:true}).isEnabled(),true);
 const retryId=posts.at(-1).id;
 mode='lost';await page.getByRole('button',{name:'完成阅读打卡',exact:true}).tap();await page.locator('.reading-save-error').getByText(/未收到服务器确认/).waitFor();assert.equal(rows.size,2);assert.equal(posts.at(-1).id,retryId);
 mode='normal';await page.getByRole('button',{name:'完成阅读打卡',exact:true}).tap();await receipt.getByText('阅读打卡成功，已保存',{exact:true}).waitFor();assert.equal(rows.size,2);assert.equal(posts.at(-1).id,retryId);assert.equal(posts.at(-1).separateSession,true);
 for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await receipt.scrollIntoViewIfNeeded();await page.screenshot({path:output+`/reading-receipt-${scheme}-${width}.png`});}}
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'返回手帐',exact:true}).click();await page.getByRole('button',{name:'添加书籍',exact:true}).tap();const dialog=page.locator('dialog[open]');await dialog.getByLabel('书名',{exact:true}).fill('模拟新书');await dialog.getByRole('button',{name:'加入我的书架',exact:true}).tap();await toast.getByText('模拟书籍保存失败，请稍后重试。',{exact:true}).waitFor();assert.equal(await toast.evaluate(el=>el.matches(':popover-open')),true,'Feedback must be above native dialogs');
 assert.equal(await toast.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),true,'The dialog backdrop must not cover or dim feedback');const rect=await toast.boundingBox();assert.ok(rect.y>=0&&rect.y+rect.height<844);await page.screenshot({path:output+'/dialog-feedback.png'});await toast.getByRole('button',{name:'关闭操作提示',exact:true}).tap();await toast.waitFor({state:'detached'});await dialog.getByRole('button',{name:'关闭',exact:true}).tap();
 assert.deepEqual(errors,[]);console.log('READING_FEEDBACK_UI_OK=true slow-double-submit,visible-pending,ack-before-refresh,durable-receipt,edit-canonical,next-session,lost-response-retry,modal-top-layer,light-dark-320-390-768-1280');
}finally{await browser.close();}
