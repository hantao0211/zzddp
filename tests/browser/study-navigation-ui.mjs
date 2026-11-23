// Responsive interaction checks with invented records only; no AI or production data.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base.endsWith(':3443'));await mkdir(output,{recursive:true});
const uuid='11111111-1111-4111-8111-111111111111',bookId='22222222-2222-4222-8222-222222222222';
let holdReads=false;const pendingReads=[];let documentRequests=0;
const viewer={id:uuid,name:'模拟孩子',username:'synthetic-child',role:'child'};
const reading={today:'2026-11-20',viewer,books:[{id:bookId,title:'模拟阅读书',author:'模拟作者',isbn:'',publisher:'',totalPages:100,catalogId:null,description:'',sourceUrl:null,createdAt:'2026-11-20T00:00:00Z',finished:false,minutes:20,uniquePages:12,logCount:1}],logs:[],rules:{dailyPoints:2,backfillCounts:false,milestones:[{days:3,points:3},{days:7,points:10}]},stats:{days:3,minutes:20,pages:12,currentStreak:3,bestStreak:3,booksFinished:0},growth:{balance:9,earned:9,ledger:[]},wishes:[],rewards:[],redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false};
const task=(id,subject,title)=>({id,subject,title,requirement:'模拟练习要求',format:'written',coverage:'complete',memoEvidence:[],evidence:[],missing:[],reviewActivity:null,writtenCompletion:{status:'done',reason:'模拟题目均已填写',parts:[]}});
const engine=process.env.SMOKE_BROWSER==='webkit'?webkit:chromium;
const touch=process.env.SMOKE_TOUCH==='1';
const activate=locator=>touch?locator.tap():locator.click();
const browser=await engine.launch({headless:true,args:engine===chromium?['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']:[]});
try{const page=await browser.newPage({colorScheme:process.env.SMOKE_COLOR_SCHEME||'light',viewport:{width:390,height:844},...(touch?{isMobile:true,hasTouch:true}:{}),ignoreHTTPSErrors:true}),errors=[],dialogs=[];page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documentRequests++;});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.type());void d.accept();});
 await page.route('**/assistant-api/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname;const json=v=>route.fulfill({contentType:'application/json',body:JSON.stringify(v)});
  if(path.endsWith('/status'))return json({authenticated:true,accounts:true,viewer,available:true,speech:true});
  if(path.endsWith('/reading/state')){if(holdReads)await new Promise(resolve=>pendingReads.push(resolve));return json(reading);}
  if(path.endsWith('/homework-context'))return json({date:'2026-11-19',revision:1,hasMaterials:false,availableDates:[],pending:false,entries:[],uncertainties:[],familyNotes:[]});
  if(path.endsWith('/memories'))return json({items:[]});
  if(path.endsWith('/learning/state')){const date=url.searchParams.get('date'),tasks=[task('math','数学','数学练习册 P32'),{...task('chinese','语文','语文预习'),format:'reading',writtenCompletion:null,reviewActivity:{status:'marked',reason:'模拟圈画'}},task('english','英语','英语抄写')];return json({date,status:'processed',pending:false,note:'模拟记录',dates:[date],quota:{calls:0,limit:60},reviewPolicy:{version:'review-traces-v1',description:'按痕迹判断'},writtenCompletionEnabled:true,uploads:['memo','homework'].map(kind=>({id:kind,date,kind,status:'processed',createdAt:'2026-11-20T00:00:00Z',subjects:['数学','语文','英语'],files:[{id:kind+'-file',stored:true,pages:[],name:'synthetic.jpg',size:100,mimeType:'image/jpeg'}],aiMs:0,issues:[],note:'模拟照片'})),report:{date,memoId:'memo',tasks:[...tasks,...Array.from({length:6},(_,i)=>task('extra-'+i,'英语','补充练习 '+(i+1)))],unclassified:[],unassigned:[],uncertainties:[],familyNotes:[],updatedAt:'2026-11-20T00:00:00Z'},grading:{enabled:true,pending:0,failed:0,pages:1,finished:1,incomplete:0,correct:8,wrong:2,blank:0,uncertain:0,feedback:0,tasks:{}}});}
  throw Error('Unexpected synthetic endpoint '+path);
 });
 await page.goto(base+'/?studyDate=2026-11-19',{waitUntil:'networkidle'});await page.locator('.hw-home-summary tbody tr').first().waitFor();

 // Exercise real touch input, including the first tap and the dark-mode hover trap.
 // A narrow viewport alone still sends mouse clicks and misses this regression.
 if(touch){
  const nav=page.getByRole('navigation',{name:'底部学习导航',exact:true});
  const select=label=>label==='作业'?nav.getByRole('link',{name:label,exact:true}):nav.getByLabel(label,{exact:true});
  for(const scheme of ['light','dark']){
   await page.emulateMedia({colorScheme:scheme});
   assert.equal(await page.evaluate(()=>matchMedia('(hover:hover) and (pointer:fine)').matches),false);
   const inactive=select('课外阅读');
   const before=await inactive.evaluate(el=>getComputedStyle(el).backgroundColor);
   await inactive.hover();
   assert.equal(await inactive.evaluate(el=>getComputedStyle(el).backgroundColor),before,'Touch devices must not leave a second tab highlighted by hover');
   const rounds=[];
   for(let i=0;i<4;i++)for(const [label,heading] of [['课外阅读','我的阅读手帐'],['成长与奖励','我的小脚步'],['作业','我的小步手帐']]){
    const started=Date.now();await select(label).tap();
    await page.getByRole('heading',{name:heading,exact:true}).waitFor({timeout:1500});
    assert.equal(await nav.locator('[aria-current="page"]').count(),1,'Only the displayed page may be selected');
    assert.equal(await select(label).getAttribute('aria-current'),'page');
    assert.equal(await select(label).evaluate(el=>getComputedStyle(el).touchAction),'manipulation');
    rounds.push(Date.now()-started);
   }
   console.log('SINGLE_TAP_NAVIGATION_OK='+process.env.SMOKE_BROWSER+' '+scheme+' 12-switches max-ms='+Math.max(...rounds));
  }
  await page.emulateMedia({colorScheme:process.env.SMOKE_COLOR_SCHEME||'light'});
 }

 const overview=page.getByRole('region',{name:'作业概况',exact:true});
 assert.equal(await overview.locator('tbody tr').count(),3,'The home journal starts with a short overview');
 await overview.getByText('共9项 · 9项已完成',{exact:true}).waitFor();
 const expand=page.getByRole('button',{name:'展开其余6项作业',exact:true});
 assert.equal(await expand.getAttribute('aria-expanded'),'false');await expand.click();
 assert.equal(await overview.locator('tbody tr').count(),9);
 await page.getByRole('button',{name:'查看补充练习 6的完成情况',exact:true}).click();
 const status=page.getByRole('dialog',{name:'这项作业的情况',exact:true});await status.waitFor();
 await status.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('button',{name:'收起作业',exact:true}).click();
 assert.equal(await overview.locator('tbody tr').count(),3);
 const garden=page.getByRole('region',{name:'手帐花园',exact:true});
 const decorate=garden.getByRole('button',{name:'装饰我的花盆',exact:true});
 const stickers=garden.getByRole('group',{name:'选择花盆贴纸',exact:true});
 assert.equal(await decorate.getAttribute('aria-expanded'),'false');assert.equal(await stickers.count(),0);
 const actionsY=(await page.locator('.hw-primary-actions').boundingBox()).y+await page.evaluate(()=>scrollY);
 await decorate.click();assert.equal((await page.locator('.hw-primary-actions').boundingBox()).y+await page.evaluate(()=>scrollY),actionsY,'Decorations must not move homework actions');
 await stickers.getByRole('button',{name:'选择星星贴纸',exact:true}).click();
 await garden.getByRole('img',{name:'花盆贴着星星贴纸',exact:true}).waitFor();assert.equal(await decorate.getAttribute('aria-expanded'),'false');
 await page.reload({waitUntil:'networkidle'});await garden.getByRole('img',{name:'花盆贴着星星贴纸',exact:true}).waitFor();
 assert.equal(await decorate.getAttribute('aria-expanded'),'false');await decorate.click();
 assert.equal(await stickers.getByRole('button',{name:'选择星星贴纸',exact:true}).getAttribute('aria-pressed'),'true');
 await page.keyboard.press('Escape');assert.equal(await decorate.getAttribute('aria-expanded'),'false');assert.equal(await decorate.evaluate(el=>el===document.activeElement),true);
 await decorate.click();await page.getByRole('heading',{name:'我的小步手帐',exact:true}).click();assert.equal(await decorate.getAttribute('aria-expanded'),'false');
 await decorate.click();await stickers.getByRole('button',{name:'选择花朵贴纸',exact:true}).click();
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 console.log('JOURNAL_OVERVIEW_UI_OK=true real-total-and-completed-counts,three-row-overview,expand-all-nine,status-dialog-for-extra-row,collapse,sticker-persistence');
 for(const width of [320,390,768,900,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const quote=await garden.locator('h2').evaluate(el=>({height:el.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(el).lineHeight)}));assert.ok(quote.height<=quote.lineHeight*2+1,'Garden message keeps the reference two-line layout');assert.ok((await garden.boundingBox()).height>=150&&(await garden.boundingBox()).height<=214,'Full flower stays visible without a separate picker row');assert.ok((await page.locator('.hw-primary-actions').boundingBox()).y<410,'Uploads stay near the top');assert.ok((await overview.locator('tbody tr').first().boundingBox()).y<610,'Homework is visible without scrolling');await decorate.click();const pickerBox=await stickers.boundingBox();assert.ok(pickerBox.x>=0&&pickerBox.x+pickerBox.width<=width);await page.screenshot({path:output+`/home-picker-${width}.png`});await page.keyboard.press('Escape');await page.locator('.hw-simple-heading h1').click();const note=await page.locator('.study-home-companion').boundingBox(),summary=await overview.boundingBox();assert.ok(note.y>=summary.y+summary.height,'Reading and little steps belong BELOW the journal list');if(width>=900)assert.ok((await page.locator('.hw-main').boundingBox()).width<=880,'Desktop journal keeps the selected compact reading width');const nav=page.getByRole('navigation',{name:width>=900?'主要学习导航':'底部学习导航',exact:true});assert.ok(await nav.isVisible());assert.equal(await nav.getByRole('button',{name:'小助手',exact:true}).count(),1);for(const control of await nav.locator('a,button').all()){const b=await control.boundingBox();assert.ok(b.width>=40&&b.height>=40);}assert.equal(await page.getByRole('button',{name:'小助手',exact:true}).count(),1);await page.screenshot({path:output+`/home-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__studyDocument='same-document');await activate(page.getByRole('link',{name:'课外阅读',exact:true}));assert.equal(await page.evaluate(()=>window.__studyDocument),'same-document');await page.getByLabel('正在读的书',{exact:true}).waitFor();assert.ok(page.url().includes('studyDate=2026-11-19'));await page.goto(base+'/reading/?view=manage&studyDate=2026-11-19',{waitUntil:'networkidle'});await page.getByLabel('正在读的书',{exact:true}).waitFor();assert.ok(!page.url().includes('view=manage'),'A child must return to reading from a stale parent settings URL');
 await page.getByLabel('开始页',{exact:true}).fill('13');await page.getByLabel('结束页',{exact:true}).fill('18');await page.getByLabel('时长（分钟）',{exact:true}).fill('17');await page.locator('#reading-summary').fill('我读到一个有趣的故事，还想再说说人物为什么这样做。');
 await page.getByRole('button',{name:'开始阅读计时',exact:true}).click();await activate(page.getByRole('button',{name:'成长与奖励',exact:true}));assert.ok(page.url().includes('view=growth'));await activate(page.getByRole('button',{name:'课外阅读',exact:true}));assert.equal(await page.locator('#reading-summary').inputValue(),'我读到一个有趣的故事，还想再说说人物为什么这样做。');assert.equal(await page.getByLabel('时长（分钟）',{exact:true}).inputValue(),'17');await page.getByRole('button',{name:'结束计时并计入',exact:true}).waitFor();assert.deepEqual(dialogs,[],'Same-page navigation must never discard a draft or trigger a leave warning');
 await page.goBack();await page.getByRole('heading',{name:'我的小脚步',exact:true}).waitFor();await page.goForward();await page.locator('#reading-summary').waitFor();assert.ok((await page.locator('#reading-summary').inputValue()).includes('有趣的故事'));
 for(const width of [320,390,768,900,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/reading-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'小助手',exact:true}).click();await page.locator('#assistant-question').waitFor();await page.locator('#assistant-question').fill('我想聊聊这本书。');const log=await page.locator('.assistant-messages').boundingBox(),dialog=await page.locator('.assistant-dialog').boundingBox();assert.ok(log.height>dialog.height*.45,'Conversation has most of the dialog');await page.getByRole('button',{name:'关闭小助手',exact:true}).click();await page.getByRole('button',{name:'小助手',exact:true}).click();assert.equal(await page.locator('#assistant-question').inputValue(),'我想聊聊这本书。');await page.setViewportSize({width:390,height:430});await page.waitForTimeout(100);assert.ok((await page.locator('.assistant-messages').boundingBox()).height>=120);await page.screenshot({path:output+'/assistant-short-viewport.png'});await page.getByRole('button',{name:'关闭小助手',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await activate(page.getByRole('button',{name:'成长与奖励',exact:true}));await page.getByRole('button',{name:'我要许愿',exact:true}).waitFor();for(const width of [320,390,768,900,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/growth-${width}.png`,fullPage:true});}

 // Delayed APIs must not block menu changes or cause extra document downloads.
 await page.setViewportSize({width:390,height:844});
 const beforeDocuments=documentRequests;
 await page.evaluate(()=>window.__studyDocument='retained');
 holdReads=true;
 await page.waitForRequest(r=>new URL(r.url()).pathname.endsWith('/reading/state'));
 await activate(page.getByRole('link',{name:'作业',exact:true}));
 await page.getByRole('heading',{name:'作业进展',exact:true}).waitFor();
 await activate(page.getByRole('link',{name:'课外阅读',exact:true}));
 assert.equal(await page.locator('#reading-summary').inputValue(),'我读到一个有趣的故事，还想再说说人物为什么这样做。');
 await page.getByRole('button',{name:'结束计时并计入',exact:true}).waitFor();
 const durations=[];
 for(let i=0;i<8;i++){
  const started=Date.now();
  await activate(page.getByRole('button',{name:'成长与奖励',exact:true}));
  await page.getByRole('heading',{name:'我的小脚步',exact:true}).waitFor();
  await activate(page.getByRole('link',{name:'作业',exact:true}));
  await page.getByRole('heading',{name:'作业进展',exact:true}).waitFor();
  await activate(page.getByRole('link',{name:'课外阅读',exact:true}));
  await page.locator('#reading-summary').waitFor();
  durations.push(Date.now()-started);
 }
 assert.equal(await page.evaluate(()=>window.__studyDocument),'retained');
 assert.equal(documentRequests,beforeDocuments,'All three spaces must share one document, including companion links');
 await page.waitForTimeout(5200); // Cross a polling interval while the original request is still pending.
 assert.equal(pendingReads.length,1,'Repeated menu clicks must not stack background requests');
 await page.goBack();await page.getByRole('heading',{name:'作业进展',exact:true}).waitFor();
 await page.goForward();await page.locator('#reading-summary').waitFor();
 assert.equal(await page.locator('#reading-summary').inputValue(),'我读到一个有趣的故事，还想再说说人物为什么这样做。');
 holdReads=false;pendingReads.splice(0).forEach(resolve=>resolve());
 await page.getByRole('button',{name:'小助手',exact:true}).click();
 assert.equal(await page.locator('#assistant-question').inputValue(),'我想聊聊这本书。');
 await page.getByRole('button',{name:'关闭小助手',exact:true}).click();
 await activate(page.getByRole('link',{name:'作业',exact:true}));
 await page.getByRole('button',{name:'小助手',exact:true}).click();
 assert.equal(await page.locator('#assistant-question').inputValue(),'我想聊聊这本书。','Assistant draft survives a switch to homework');
 await page.getByRole('button',{name:'关闭小助手',exact:true}).click();
 await activate(page.getByRole('link',{name:'课外阅读',exact:true}));
 assert.deepEqual(dialogs,[]);
 // A new login session clears all retained private drafts, even in the hidden space.
 await page.evaluate(()=>window.dispatchEvent(new Event('xiaobu:session-changed')));
 await page.getByLabel('正在读的书',{exact:true}).waitFor();
 assert.equal(await page.locator('#reading-summary').inputValue(),'');
 console.log('MENU_SWITCH_NO_RELOAD_OK=true slow-api,24-switches,no-duplicate-poll,draft-timer-chat-preserved,session-clears-private-drafts max-three-switch-round-ms='+Math.max(...durations));
 assert.equal(await page.getByRole('button',{name:'家长设置',exact:true}).count(),0);assert.deepEqual(errors,[]);console.log('STUDY_NAVIGATION_UI_OK=true stable-mobile-desktop-navigation,real-statuses,draft-and-timer-preserved,back-forward,selected-date-preserved,assistant-conversation-space,short-viewport,no-child-admin-controls');
}finally{await browser.close();}
