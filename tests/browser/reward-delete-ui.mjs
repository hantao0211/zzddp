// Visual review with invented fixtures only. No real family API writes or AI.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href),base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;
assert.ok(base);await mkdir(output,{recursive:true});
const engine=process.env.SMOKE_BROWSER==='webkit'?webkit:chromium,browser=await engine.launch({headless:true,args:engine===chromium?['--no-sandbox']:[]});
const viewer={id:'11111111-1111-4111-8111-111111111111',username:'synthetic-parent',name:'模拟家长',role:'parent'},id='22222222-2222-4222-8222-222222222222';
const book={id,title:'森林里的小小邮局',author:'模拟作者',isbn:'',publisher:'',totalPages:200,revision:'a'.repeat(64),lastReadPage:48,finished:false,minutes:25,uniquePages:22,logCount:1};
const reward=(id,title,cost,icon,extra={})=>({id,title,cost,icon,description:'这是虚构的奖励约定，和家长一起安排。',active:true,expiresOn:'2027-01-06',useDays:45,offerDays:45,kind:'fixed',version:1,revision:'a'.repeat(64),valueCents:null,rateCents:200,monthlyBudgetCents:null,monthLimit:null,yearLimit:null,...extra});
const data={today:'2026-11-24',viewer,books:[book,{...book,id:'55555555-5555-4555-8555-555555555555',title:'星星和月亮的故事',lastReadPage:15,uniquePages:15,author:'另一位模拟作者'}],logs:[{id:'33333333-3333-4333-8333-333333333333',version:1,bookId:id,date:'2026-11-23',startPage:27,endPage:48,minutes:25,summary:'小兔子第一次送信，和朋友一起找到了收信人。',chapter:'',reflection:'遇到困难时可以向朋友求助。',excerpt:'',imageId:null,reviewStatus:'done',canEdit:true,review:{summaryFeedback:'你说清楚了小兔子遇到的问题和解决办法。',strengths:['说出了故事的主要经过。'],nextStep:'下次可以再说说你最喜欢哪一段。',followUpQuestion:'',expression:'clear',comparison:'insufficient_evidence',comparisonReason:'没有提供原文，未核对故事细节。',evidenceQuote:'',evidenceReadable:true,basis:'none',timingNote:'不根据时长判断认真程度。'}}],rules:{dailyPoints:1,backfillCounts:false,milestones:[{days:3,points:1},{days:7,points:2},{days:14,points:5},{days:30,points:10}]},stats:{days:7,minutes:175,pages:98,currentStreak:7,bestStreak:7,booksFinished:0},growth:{balance:38,earned:48,ledger:[{id:'step1',date:'2026-11-23',points:1,label:'阅读打卡',kind:'daily'},{id:'step2',date:'2026-11-23',points:5,label:'羽毛球课程',kind:'activity'}]},wishes:[{id:'44444444-4444-4444-8444-444444444444',title:'一起去郊外野餐',description:'想找一个晴天，带着小点心去看花。',actorId:viewer.id,status:'pending',rewardId:null,note:'',canWithdraw:true}],rewards:[reward('shopping','日常购物卡',1,'shopping',{kind:'shopping',monthlyBudgetCents:10000,usage:{remainingCents:10000}}),reward('disney','迪士尼购物卡',30,'castle',{valueCents:35000,monthLimit:1}),reward('dinner','一起吃大餐',30,'meal'),reward('movie','一起看电影',10,'movie',{valueCents:5000,yearLimit:5})],redemptions:[],calendar:[{date:'2026-11-23',minutes:25,backfilled:false}],reviewBudget:{used:1,limit:20},homeworkRewardRules:{dailyPoints:1},hasMore:false,activities:{startOn:'2026-11-01',claims:[],rules:[{key:'english-reading',title:'英语课外阅读',points:1,enabled:true},{key:'housework',title:'帮助做家务',points:1,enabled:true},{key:'badminton',title:'羽毛球课程',points:5,enabled:true},{key:'english-class',title:'英语线上课',points:5,enabled:true}]},studentProfile:{grade:4,semester:1,region:'模拟地区',school:'模拟小学',revision:'b'.repeat(64),textbooks:{语文:{version:'模拟语文教材',scope:'第一单元'},数学:{version:'模拟数学教材',scope:'第一单元'},英语:{version:'模拟英语教材',scope:'第一单元'}}}};
const first='77777777-7777-4777-8777-777777777777',second='88888888-8888-4888-8888-888888888888',shopping='99999999-9999-4999-8999-999999999999';
data.rewards=[reward(first,'模拟电影',10,'movie',{description:'应删除的重复项',expiresOn:'2026-11-23'}),reward(second,'模拟电影',10,'movie',{revision:'b'.repeat(64),description:'应保留的电影'}),reward(shopping,'模拟购物卡',1,'shopping',{kind:'shopping',rateCents:200,monthlyBudgetCents:10000})];
data.redemptions=[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',rewardTitle:'模拟电影',cost:10,status:'pending',createdAt:'2026-11-24T01:00:00Z',updatedAt:'2026-11-24T01:00:00Z',version:1,description:'原兑换约定',kind:'fixed',useDays:45}];
const originalContract=JSON.stringify(data.redemptions),removed=new Set(),deletes=[],errors=[];let mode='stale',release,role='parent';
try{
 const page=await browser.newPage({isMobile:true,hasTouch:true,viewport:{width:390,height:844},ignoreHTTPSErrors:true});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assistant-api/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname,send=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)}),who={...viewer,role};
 if(path.endsWith('/status'))return send({authenticated:true,accounts:true,available:true,viewer:who});
 if(path.endsWith('/reading/state'))return send({...data,viewer:who,rewards:data.rewards.filter(r=>!removed.has(r.id))});
 if(path.endsWith('/learning/state'))return send({date:data.today,status:'empty',pending:false,dates:[],uploads:[],report:null});
 if(path.endsWith('/memories'))return send({items:[]});
 const match=path.match(/\/reading\/rewards\/([a-f0-9-]{36})$/);if(match&&req.method()==='DELETE'){
  const id=match[1],input=req.postDataJSON();deletes.push({id,...input});if(mode==='stale')return send({error:'商品已更新，请关闭确认框，刷新后再删除。'},409);if(mode==='fail')return send({error:'模拟暂时无法删除。'},503);
  if(mode==='slow')await new Promise(resolve=>release=resolve);
  const alreadyDeleted=removed.has(id);removed.add(id);if(mode==='lost'){await route.abort('failed');return;}return send({id,deleted:true,alreadyDeleted});
 }
 throw Error('Unexpected reward-delete mock '+req.method()+' '+path);
 });
 const open=async()=>{await page.goto(base+'/reading/?view=manage',{waitUntil:'networkidle'});await page.getByRole('navigation',{name:'阅读与奖励导航'}).getByRole('button',{name:'商品兑换',exact:true}).click();await page.getByRole('heading',{name:'家庭商品与本期约定',exact:true}).waitFor();};
 await open();const section=page.locator('section').filter({has:page.getByRole('heading',{name:'家庭商品与本期约定',exact:true})}).last();
 const movieRows=section.locator('article.economy-row').filter({hasText:'模拟电影'});assert.equal(await movieRows.count(),2);
 for(const scheme of ['light','dark']){
  await page.emulateMedia({colorScheme:scheme});
  const colors=async button=>button.evaluate(el=>[getComputedStyle(el).backgroundColor,getComputedStyle(el).color]);
  assert.deepEqual(await colors(movieRows.first().getByRole('button',{name:'更换模拟电影图标'})),['rgb(128, 86, 108)','rgb(255, 253, 247)']);
  for(const [index,label] of [[0,'开新一期'],[1,'编辑商品约定']]){
   assert.deepEqual(await colors(movieRows.nth(index).getByRole('button',{name:label})),['rgb(187, 83, 110)','rgb(255, 253, 247)']);
  }
  for (const width of [320,390,1280]) {
   await page.setViewportSize({width,height:844});
   for (const row of await movieRows.all()) {
    const bounds=await row.locator('.economy-actions button').evaluateAll(buttons=>buttons.map(b=>{
     const {y,height,width,right}=b.getBoundingClientRect();
     return {y,height,width,right};
    }));
    assert.equal(bounds.length,4);
    assert.ok(bounds.every(b=>Math.abs(b.y-bounds[0].y)<1 && b.width>=44 && b.height>=44 && b.right<=width));
    assert.ok((await row.boundingBox()).height < 140);
   }
  }
  await page.setViewportSize({width:390,height:844});
  await movieRows.nth(1).screenshot({path:output+'/reward-actions-'+scheme+'.png'});
 }
 await movieRows.first().getByRole('button',{name:'删除模拟电影',exact:true}).tap();let dialog=page.getByRole('dialog',{name:'删除这个商品？',exact:true});await dialog.getByText('应删除的重复项',{exact:true}).waitFor();await dialog.getByRole('button',{name:'保留商品',exact:true}).tap();assert.equal(deletes.length,0);assert.equal(await movieRows.count(),2);
 await movieRows.first().getByRole('button',{name:'删除模拟电影',exact:true}).tap();await dialog.getByRole('button',{name:'确认删除',exact:true}).tap();await dialog.locator('.form-error[role=alert]').filter({hasText:'商品已更新'}).waitFor();assert.equal(removed.size,0);assert.equal(await movieRows.count(),2);await dialog.getByRole('button',{name:'保留商品',exact:true}).tap();
 mode='fail';await movieRows.first().getByRole('button',{name:'删除模拟电影',exact:true}).tap();await dialog.getByRole('button',{name:'确认删除',exact:true}).tap();await dialog.locator('.form-error[role=alert]').filter({hasText:'模拟暂时无法删除'}).waitFor();assert.equal(removed.size,0);
 mode='slow';const before=deletes.length;await dialog.getByRole('button',{name:'确认删除',exact:true}).evaluate(button=>{button.click();button.click();});while(!release)await page.waitForTimeout(20);assert.equal(deletes.length,before+1);assert.ok(await dialog.getByRole('button',{name:'正在删除…',exact:true}).isDisabled());assert.ok(await dialog.getByRole('button',{name:'保留商品',exact:true}).isDisabled());release();await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>[...document.querySelectorAll('article.economy-row')].filter(el=>el.textContent.includes('模拟电影')&&el.querySelector('button[aria-label="删除模拟电影"]')).length===1);assert.equal(removed.has(first),true);assert.equal(removed.has(second),false);assert.equal(JSON.stringify(data.redemptions),originalContract);
 await page.getByRole('link',{name:'打开学习空间'}).tap();await page.locator('.study-shell:visible').getByRole('button',{name:'心愿商城',exact:true}).first().tap();await page.getByRole('button',{name:'查看模拟电影详情',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'查看模拟电影详情',exact:true}).count(),1);
 await page.locator('.study-shell:visible').getByRole('button',{name:'家长设置',exact:true}).first().tap();await page.getByRole('heading',{name:'家庭商品与本期约定',exact:true}).waitFor();const shopRow=section.locator('article.economy-row').filter({hasText:'模拟购物卡'});await shopRow.getByRole('button',{name:'编辑商品约定',exact:true}).tap();assert.equal(await page.getByLabel('商品名称',{exact:true}).inputValue(),'模拟购物卡');await shopRow.getByRole('button',{name:'删除模拟购物卡',exact:true}).tap();
 for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.ok(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.width>=280;}));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===390)await page.screenshot({path:output+'/reward-delete-'+scheme+'.png',fullPage:true});}}
 mode='lost';await dialog.getByRole('button',{name:'确认删除',exact:true}).tap();await dialog.locator('.form-error[role=alert]').waitFor();assert.equal(removed.has(shopping),true);mode='ok';await dialog.getByRole('button',{name:'确认删除',exact:true}).tap();await dialog.waitFor({state:'hidden'});assert.equal(deletes.filter(d=>d.id===shopping).length,2);assert.equal(await page.getByLabel('商品名称',{exact:true}).inputValue(),'');assert.equal(JSON.stringify(data.redemptions),originalContract);
 role='child';await page.goto(base+'/reading/?view=mall',{waitUntil:'networkidle'});assert.equal(await page.getByRole('button',{name:/删除商品|删除模拟/}).count(),0);assert.equal(await page.getByRole('button',{name:'查看模拟电影详情',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'查看模拟购物卡详情',exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('REWARD_DELETE_UI_OK=true parent-only,cancel,stale-version,server-failure,synchronous-double-click-lock,ambiguous-network-retry,only-selected-duplicate-hidden,editing-draft-cleared,original-contracts-preserved,mall-updated,light-dark-320-390-1280');
}finally{await browser.close();}
