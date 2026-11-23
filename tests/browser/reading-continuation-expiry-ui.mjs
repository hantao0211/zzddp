// Invented reading and shop records only. Every family API is intercepted.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base.endsWith(':3443'));await mkdir(output,{recursive:true});
const engine=process.env.SMOKE_BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true,args:engine===chromium?['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']:[]});
let role='child',posts=[],rewardSaved;
const id='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
let books=[{id,title:'模拟故事书',author:'模拟作者',totalPages:200,revision:'a'.repeat(64),lastReadPage:48,finished:false,uniquePages:22,minutes:25,logCount:1},{id:second,title:'模拟科普书',author:'',totalPages:100,revision:'b'.repeat(64),lastReadPage:73,finished:false,uniquePages:73,minutes:30,logCount:1}];
let logs=[{id:'33333333-3333-4333-8333-333333333333',version:1,bookId:id,date:'2026-11-22',startPage:27,endPage:48,minutes:25,summary:'模拟旧阅读概括。',chapter:'',reflection:'',excerpt:'',imageId:null,reviewStatus:'queued',review:null,canEdit:true}];
let rewards=[{id:'expired',title:'已经结束的模拟电影',description:'模拟活动',cost:1,active:true,expiresOn:'2026-11-22'},{id:'today',title:'今天截止的模拟电影',description:'模拟活动',cost:1,active:true,expiresOn:'2026-11-23'},{id:'always',title:'长期模拟野餐',description:'模拟活动',cost:1,active:true,expiresOn:null}];
let wishes=[{id:'44444444-4444-4444-8444-444444444444',title:'想去看模拟电影',description:'一个虚构心愿',actorId:id,status:'pending',rewardId:null,note:'',canWithdraw:true}];
const viewer=()=>({id,name:role==='child'?'模拟孩子':'模拟家长',role,username:'synthetic-'+role});
const state=()=>({today:'2026-11-23',viewer:viewer(),books,logs,rules:{dailyPoints:2,backfillCounts:false,milestones:[]},stats:{days:1,minutes:25,pages:22,currentStreak:1,bestStreak:1,booksFinished:0},growth:{balance:10,earned:10,ledger:[]},wishes,rewards,redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false});
try{
 const page=await browser.newPage({isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());
 await page.route('**/assistant-api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname,send=(v,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
  if(path.endsWith('/status'))return send({authenticated:true,accounts:true,available:true,viewer:viewer()});
  if(path.endsWith('/reading/state'))return send(state());
  if(path.endsWith('/learning/state'))return send({date:'2026-11-23',status:'empty',pending:false,dates:[],uploads:[],report:null});
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/reading/logs')&&req.method()==='POST'){
   const input=req.postDataJSON();posts.push(input);const previous=logs.find(l=>l.id===input.id),log={...input,version:input.version+1,canEdit:true,reviewStatus:'queued',review:null};
   logs=previous?logs.map(l=>l.id===input.id?log:l):[log,...logs];
   if(!previous)books=books.map(b=>b.id===input.bookId?{...b,lastReadPage:input.endPage}:b);
   return send({log,book:books.find(b=>b.id===input.bookId),pointsAdded:0});
  }
  if(path.endsWith('/reading/rewards')&&req.method()==='POST'){rewardSaved=req.postDataJSON();rewards=[{id:'new-reward',...rewardSaved},...rewards];return send(rewards[0]);}
  if(path.endsWith('/reading/rewards/new-reward')&&req.method()==='PATCH'){rewardSaved=req.postDataJSON();rewards=rewards.map(r=>r.id==='new-reward'?{id:r.id,...rewardSaved}:r);return send(rewards[0]);}
  if(path.includes('/reading/wishes/')&&req.method()==='PATCH'){const input=req.postDataJSON();assert.equal(input.expiresOn,'2026-12-05');wishes=wishes.map(w=>({...w,status:'approved',rewardId:'wish-reward',canWithdraw:false}));rewards.push({id:'wish-reward',title:input.title,cost:input.cost,description:input.description,active:true,expiresOn:input.expiresOn});return send(wishes[0]);}
  throw Error('Unexpected mock API '+req.method()+' '+path);
 });
 await page.goto(base+'/reading/',{waitUntil:'networkidle'});
 const start=page.getByLabel('开始页',{exact:true}),end=page.getByLabel('结束页',{exact:true});
 assert.equal(await start.inputValue(),'49');assert.equal(await end.inputValue(),'49');await page.getByText('上次读到第48页，页码可按本次阅读调整。',{exact:true}).waitFor();
 await page.getByLabel('正在读的书',{exact:true}).selectOption(second);assert.equal(await start.inputValue(),'74');
 await page.getByLabel('正在读的书',{exact:true}).selectOption(id);await start.fill('45');await end.fill('68');await page.getByLabel('时长（分钟）',{exact:true}).fill('20');await page.locator('#reading-summary').fill('新的模拟阅读概括。');
 await page.waitForTimeout(5200);assert.equal(await start.inputValue(),'45','Polling must preserve an intentional rereading page');
 await page.getByRole('button',{name:'完成阅读打卡',exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[type=number]').value==='69');assert.equal(posts[0].startPage,45);
 await page.getByText('查看阅读历史',{exact:true}).click();const old=page.locator('.reading-history .reading-record').filter({hasText:'27—48页'});await old.getByRole('button',{name:'修改记录',exact:true}).click();assert.equal(await start.inputValue(),'27');assert.equal(await end.inputValue(),'48');await end.fill('46');await page.getByRole('button',{name:'保存修改',exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[type=number]').value==='69');
 await page.getByRole('button',{name:'成长与奖励',exact:true}).tap();
 const expired=page.locator('.reading-rewards article').filter({hasText:'已经结束的模拟电影'}),today=page.locator('.reading-rewards article').filter({hasText:'今天截止的模拟电影'});
 assert.equal(await expired.getByRole('button',{name:'本期已到期',exact:true}).isDisabled(),true);assert.equal(await today.getByRole('button',{name:'申请兑换',exact:true}).isEnabled(),true);
 for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/reward-expiry-${scheme}-${width}.png`,fullPage:true});}}
 role='parent';await page.goto(base+'/reading/?view=manage',{waitUntil:'networkidle'});
 await page.getByText('上架新商品',{exact:true}).click();await page.getByLabel('商品名称',{exact:true}).fill('模拟限时电影');await page.getByLabel('本期申请截至',{exact:true}).fill('2026-12-01');await page.getByRole('button',{name:'确认约定并上架',exact:true}).click();await page.getByText('新一期已上架，价格和期限已约定。',{exact:true}).waitFor();assert.equal(rewardSaved.expiresOn,'2026-12-01');
 const manage=page.locator('article.economy-row').filter({hasText:'模拟限时电影'});await manage.getByText('约定生效中',{exact:true}).waitFor();assert.equal(await manage.getByRole('button',{name:'开新一期',exact:true}).count(),0);
 for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/reward-settings-${scheme}-${width}.png`,fullPage:true});}}
 await page.getByRole('button',{name:'看看心愿',exact:true}).click();const dialog=page.locator('.reading-wish-dialog');await dialog.getByLabel('兑换截止日期（选填）',{exact:true}).fill('2026-12-05');await dialog.getByRole('button',{name:'通过并加入商城',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(rewards.find(r=>r.id==='wish-reward').expiresOn,'2026-12-05');
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'课外阅读',exact:true}).tap();assert.equal(await start.inputValue(),'69');assert.deepEqual(errors,[]);
 console.log('READING_CONTINUATION_EXPIRY_UI_OK=true initial-continuation,switch-books,rereading-draft-polling,save-next-page,edit-old-does-not-rewind,expired-disabled,today-inclusive,parent-save-locked-offer,wish-deadline,reload,light-dark-320-390-768-1280');
}finally{await browser.close();}
