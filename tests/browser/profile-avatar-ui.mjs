// Responsive interaction checks with invented records only; no AI or production data.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base.endsWith(':3443'));await mkdir(output,{recursive:true});
const uuid='11111111-1111-4111-8111-111111111111',bookId='22222222-2222-4222-8222-222222222222';
let holdReads=false;const pendingReads=[];let documentRequests=0;
const viewer={id:uuid,name:'模拟孩子',username:'synthetic-child',role:'child',avatar:'rabbit'};
const reading={today:'2026-11-20',viewer,books:[{id:bookId,title:'模拟阅读书',author:'模拟作者',isbn:'',publisher:'',totalPages:100,catalogId:null,description:'',sourceUrl:null,createdAt:'2026-11-20T00:00:00Z',finished:false,minutes:20,uniquePages:12,logCount:1}],logs:[],rules:{dailyPoints:2,backfillCounts:false,milestones:[{days:3,points:3},{days:7,points:10}]},stats:{days:3,minutes:20,pages:12,currentStreak:3,bestStreak:3,booksFinished:0},growth:{balance:9,earned:9,ledger:[]},wishes:[],rewards:[],redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false};
const task=(id,subject,title)=>({id,subject,title,requirement:'模拟练习要求',format:'written',coverage:'complete',memoEvidence:[],evidence:[],missing:[],reviewActivity:null,writtenCompletion:{status:'done',reason:'模拟题目均已填写',parts:[]}});
const people={child:{...viewer},parent:{id:'parent-id',name:'模拟妈妈',username:'qa-parent',role:'parent',avatar:'mom'},admin:{id:'admin-id',name:'模拟爸爸',username:'qa-admin',role:'admin',avatar:'dad'}};
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
try{
 for(const colorScheme of ['light','dark']){
  let current='child',fail=false,documents=0;const errors=[],writes=[];
  people.child.avatar='rabbit';people.parent.avatar='mom';people.admin.avatar='dad';
  const context=await browser.newContext({colorScheme,locale:'zh-CN',viewport:{width:390,height:844}});
  await context.route('**/assistant-api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,user=people[current],json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
   if(path.endsWith('/status'))return json({authenticated:true,accounts:true,viewer:user,available:true,speech:false});
   if(path.endsWith('/reading/state'))return json({...reading,viewer:user});
   if(path.endsWith('/learning/state'))return json({date:url.searchParams.get('date'),status:'empty',pending:false,note:'',uploads:[],report:null,dates:[],quota:{calls:0,limit:100}});
   if(path.endsWith('/profile/avatar')){assert.equal(req.method(),'PATCH');const value=req.postDataJSON();assert.deepEqual(Object.keys(value),['avatar']);writes.push({...value,actor:current});if(fail)return json({error:'模拟保存失败，请重试。'},503);user.avatar=value.avatar;return json(user);}
   throw Error('Unexpected avatar test endpoint '+path);
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;});
  const header=()=>page.locator('.study-account:visible');
  const dialog=page.getByRole('dialog',{name:'选择我的表情',exact:true});
  const open=async()=>{await header().locator('summary').click();await header().getByRole('button',{name:'换个表情',exact:true}).click();await dialog.waitFor();};
  const avatar=label=>header().getByRole('img',{name:'头像：'+label,exact:true});
  await page.goto(base+'/?studyDate=2026-11-24',{waitUntil:'networkidle'});await avatar('小兔').waitFor();
  await page.getByRole('link',{name:'课外阅读',exact:true}).click();const draft=page.locator('.reading-app textarea').first();await draft.fill('我要保留的阅读概括。');await page.getByRole('button',{name:'开始阅读计时',exact:true}).click();const docs=documents;
  await open();assert.equal(await dialog.getByRole('button',{pressed:true}).count(),1);await dialog.getByRole('button',{name:'小猫',exact:true}).click();fail=true;await dialog.getByRole('button',{name:'就用这个',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByRole('button',{name:'小猫',exact:true}).getAttribute('aria-pressed'),'true');
  fail=false;await dialog.getByRole('button',{name:'就用这个',exact:true}).click();await dialog.waitFor({state:'detached'});await avatar('小猫').waitFor();assert.equal(await draft.inputValue(),'我要保留的阅读概括。');await page.getByRole('button',{name:'结束计时并计入',exact:true}).waitFor();assert.equal(documents,docs,'Changing an avatar does not reload or reset reading drafts');
  await page.getByRole('link',{name:'作业',exact:true}).filter({visible:true}).click();await avatar('小猫').waitFor();
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});await open();assert.equal(await dialog.getByRole('button',{pressed:true}).count(),1);assert.equal(await dialog.getByRole('button',{name:'小猫',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await dialog.locator('.profile-avatar-choice').count(),18);const b=await dialog.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));for(const button of await dialog.locator('.profile-avatar-choice').all()){const b=await button.boundingBox();assert.ok(b.width>=44&&b.height>=44);}await page.screenshot({path:output+`/avatar-${colorScheme}-${width}.png`});await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});}
  await page.reload({waitUntil:'networkidle'});await avatar('小猫').waitFor();
  current='parent';await page.goto(base+'/?studyDate=2026-11-24',{waitUntil:'networkidle'});await avatar('妈妈').waitFor();await open();await dialog.getByRole('button',{name:'酷酷墨镜',exact:true}).click();await dialog.getByRole('button',{name:'就用这个',exact:true}).click();await dialog.waitFor({state:'detached'});await avatar('酷酷墨镜').waitFor();assert.equal(people.child.avatar,'cat');
  current='admin';await page.goto(base+'/?studyDate=2026-11-24',{waitUntil:'networkidle'});await avatar('爸爸').waitFor();await open();await dialog.getByRole('button',{name:'小花',exact:true}).click();await dialog.getByRole('button',{name:'就用这个',exact:true}).click();await dialog.waitFor({state:'detached'});await avatar('小花').waitFor();
  current='child';const second=await context.newPage();await second.goto(base+'/?studyDate=2026-11-24',{waitUntil:'networkidle'});await second.locator('.study-account:visible').getByRole('img',{name:'头像：小猫',exact:true}).waitFor();await second.close();assert.equal(people.parent.avatar,'cool');assert.equal(people.admin.avatar,'flower');assert.deepEqual(errors,[]);assert.equal(writes.length,4);await context.close();
 }
 console.log('PROFILE_AVATAR_UI_OK=true eighteen-options,child-parent-admin,account-isolation,shared-pages,device-reload,error-retry,draft-timer-preserved,light-dark,320-390-768-1280,no-ai');
}finally{await browser.close();}
