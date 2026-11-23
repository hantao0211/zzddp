// Invented family records and mocked writes only. Never calls AI or a production data endpoint.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base.endsWith(':3443'));await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
try {
 for(const colorScheme of ['light','dark']) {
  let weekdays=[1],overrides={},failSave=false;const writes=[],errors=[];
  const viewer={id:'11111111-1111-4111-8111-111111111111',name:'模拟孩子',username:'qa-child',role:'child'};
  const plan=date=>{const hasWork=date==='2026-11-30',override=overrides[date]??null;return {weekdays,override,hasWork,noHomework:!hasWork&&(override??weekdays.includes(new Date(date+'T00:00:00Z').getUTCDay())),source:hasWork?'work':override!==null?'date':'weekly'};};
  const context=await browser.newContext({colorScheme,viewport:{width:390,height:844},locale:'zh-CN'});
  await context.route('**/assistant-api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,json=(v,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
   if(path.endsWith('/status'))return json({authenticated:true,accounts:true,viewer,available:true,speech:false});
   if(path.endsWith('/reading/state'))return json({today:'2026-11-23',viewer,books:[],logs:[],rules:{dailyPoints:2,backfillCounts:false,milestones:[]},stats:{days:0,minutes:0,pages:0,currentStreak:0,bestStreak:0,booksFinished:0},growth:{balance:0,earned:0,ledger:[]},wishes:[],rewards:[],redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false});
   if(path.endsWith('/learning/state')){const date=url.searchParams.get('date');return json({date,dayPlan:plan(date),status:'empty',pending:false,note:'',dates:[],quota:{calls:0,limit:100},report:null,uploads:date==='2026-11-30'?[{id:'memo',date,kind:'memo',status:'processed',createdAt:'',subjects:['数学'],files:[{id:'memo-file',stored:true,pages:[],name:'synthetic.jpg',size:10}],aiMs:0,issues:[],note:'模拟资料'}]:[],homeworkReward:{points:1,eligible:true,earned:false}});}
   if(path.endsWith('/learning/day-plan')){const v=req.postDataJSON();writes.push(v);if(failSave)return json({error:'模拟保存未完成，请重试。'},503);if(v.weekdays)weekdays=v.weekdays;if(v.noHomework===null)delete overrides[v.date];else if(v.noHomework!==undefined)overrides[v.date]=v.noHomework;return json(plan(v.date));}
   throw Error('Unexpected endpoint '+path);
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const visit=async date=>{await page.goto(base+'/?studyDate='+date,{waitUntil:'networkidle'});await page.getByRole('heading',{name:'作业进展',exact:true}).waitFor();};
  const region=page.getByRole('region',{name:'作业概况',exact:true});
  await visit('2026-11-24');await region.getByRole('heading',{name:'作业待上传',exact:true}).waitFor();
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/waiting-${colorScheme}-${width}.png`});}
  await region.getByRole('button',{name:'今天没有作业',exact:true}).click();await region.getByRole('heading',{name:'今天是无作业日',exact:true}).waitFor();assert.equal(writes.at(-1).date,'2026-11-24');
  assert.equal(await page.getByText('当天作业全部做完，攒',{exact:true}).count(),0);
  await page.reload({waitUntil:'networkidle'});await region.getByRole('heading',{name:'今天是无作业日',exact:true}).waitFor();
  await region.getByRole('button',{name:'今天有作业，改一下',exact:true}).click();await region.getByRole('heading',{name:'作业待上传',exact:true}).waitFor();
  await visit('2026-11-23');await region.getByRole('heading',{name:'今天是无作业日',exact:true}).waitFor();
  await page.getByRole('button',{name:'无作业日设置',exact:true}).click();const dialog=page.getByRole('dialog',{name:'无作业日安排',exact:true});await dialog.waitFor();
  await dialog.getByLabel('周一',{exact:true}).uncheck();await dialog.getByLabel('周二',{exact:true}).check();
  failSave=true;await dialog.getByRole('button',{name:'保存安排',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.ok(await dialog.getByLabel('周二',{exact:true}).isChecked());
  failSave=false;await dialog.getByRole('button',{name:'保存安排',exact:true}).click();await dialog.waitFor({state:'detached'});await region.getByRole('heading',{name:'作业待上传',exact:true}).waitFor();
  // A separate device sees the same shared configuration.
  const second=await context.newPage();await second.goto(base+'/?studyDate=2026-12-01',{waitUntil:'networkidle'});await second.getByRole('heading',{name:'今天是无作业日',exact:true}).waitFor();await second.close();
  await visit('2026-11-24');await region.getByRole('heading',{name:'作业待上传',exact:true}).waitFor(); // Explicit single-date exception still wins.
  await page.getByRole('button',{name:'无作业日设置',exact:true}).click();await dialog.waitFor();await dialog.getByRole('combobox').selectOption('auto');await dialog.getByRole('button',{name:'保存安排',exact:true}).click();await dialog.waitFor({state:'detached'});await region.getByRole('heading',{name:'今天是无作业日',exact:true}).waitFor();
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'无作业日设置',exact:true}).click();await dialog.waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const b=await dialog.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+1);await page.screenshot({path:output+`/settings-${colorScheme}-${width}.png`});await dialog.getByRole('button',{name:'关闭',exact:true}).click();}
  await visit('2026-11-30');await region.getByText('备忘录：已上传',{exact:false}).waitFor();assert.equal(await region.getByRole('heading',{name:'今天是无作业日',exact:true}).count(),0);
  await page.getByRole('button',{name:'无作业日设置',exact:true}).click();await dialog.waitFor();assert.ok(await dialog.locator('select').isDisabled());await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  assert.deepEqual(errors,[]);assert.ok(writes.length>=5);await context.close();
 }
 console.log('HOMEWORK_CALENDAR_UI_OK=true empty-progress,default-monday,date-override,weekly-settings,shared-devices,reload,error-retry,existing-work,light-dark,320-390-768-1280,no-ai');
} finally {await browser.close();}
