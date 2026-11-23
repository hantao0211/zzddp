// Real APIs against an isolated synthetic family; no live family data or paid AI.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR,dir=process.env.READING_QA_DIRECTORY;
assert.ok(base.endsWith(':3443'));assert.ok(dir.endsWith('/xiaobu-reading-qa'));await mkdir(output,{recursive:true});
const engine=process.env.SMOKE_BROWSER==='webkit'?webkit:chromium,browser=await engine.launch({headless:true,args:engine===chromium?['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']:[]});
const password='Synthetic-growth-2026';let errors=[];
async function api(page,path,method='GET',body){return page.evaluate(async({path,method,body})=>{const r=await fetch('/assistant-api/'+path,{method,credentials:'same-origin',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return{status:r.status,data:await r.json()};},{path,method,body});}
async function refresh(page){await page.reload({waitUntil:'domcontentloaded'});}
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());
 await page.route('**/assistant-api/learning/**',r=>r.fulfill({json:{date:'2026-11-23',status:'empty',pending:false,dates:[],uploads:[],report:null}}));
 await page.route('**/assistant-api/homework-context*',r=>r.fulfill({json:{date:'2026-11-23',revision:1,hasMaterials:false,availableDates:[],pending:false,entries:[],uncertainties:[],familyNotes:[]}}));
 await page.route('**/assistant-api/memories',r=>r.fulfill({json:{items:[]}}));
 await page.goto(base+'/reading/',{waitUntil:'domcontentloaded'});
 const setupCode=(await readFile(dir+'/parent-setup-code','utf8')).trim();assert.equal((await api(page,'parent-setup','POST',{setupCode,username:'qa-admin',name:'模拟家长',password})).status,200);
 for(const role of ['parent','child'])assert.equal((await api(page,'admin/accounts','POST',{username:'qa-'+role,name:'模拟'+role,role,password})).status,200);
 assert.equal((await api(page,'reading/economy/setup','POST',{})).status,200);
 assert.equal((await api(page,'reading/student-profile','PATCH',{grade:4,semester:2,region:'模拟地区',school:'模拟学校'})).status,200);
 const book=(await api(page,'reading/books','POST',{title:'模拟故事书',totalPages:100})).data;
 await api(page,'reading/logs','POST',{id:crypto.randomUUID(),version:0,bookId:book.id,date:(await api(page,'reading/state')).data.today,startPage:1,endPage:22,minutes:25,summary:'主人公遇到困难后主动向朋友求助。'});
 await api(page,'session','DELETE');assert.equal((await api(page,'session','POST',{username:'qa-child',password})).status,200);await refresh(page);
 await page.getByLabel('开始页',{exact:true}).waitFor();assert.equal(await page.getByLabel('开始页',{exact:true}).inputValue(),'23');
 for(const topic of ['阅读','成长','作业']){
  if(topic==='成长')await page.locator('.study-bottom-nav:visible .study-nav-item').filter({hasText:'成长'}).tap();
  if(topic==='作业')await page.getByRole('link',{name:'作业',exact:true}).last().tap();
  await page.getByRole('button',{name:topic+'使用教程',exact:true}).tap();const d=page.locator('.study-tutorial');await d.waitFor();
  await d.locator('img').evaluate(img=>img.decode());assert.equal(await d.getByRole('button',{name:'上一页',exact:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.body.style.position),'fixed');
  await d.getByRole('button',{name:'下一页',exact:true}).tap();await d.locator('img').evaluate(img=>img.decode());assert.equal(await d.getByRole('button',{name:'下一页',exact:true}).isDisabled(),true);
  await d.locator('.study-tutorial-body').dispatchEvent('touchstart',{touches:[{identifier:1,clientX:80,clientY:250}]});await d.locator('.study-tutorial-body').dispatchEvent('touchend',{changedTouches:[{identifier:1,clientX:240,clientY:252}]});await d.getByText('1 / 2',{exact:true}).waitFor();
  for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});const b=await d.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/tutorial-${topic}-${scheme}-${width}.png`});}}
  await d.getByRole('button',{name:'关闭教程',exact:true}).tap();await d.waitFor({state:'hidden'});assert.notEqual(await page.evaluate(()=>document.body.style.position),'fixed');await page.setViewportSize({width:390,height:844});
 }
 console.log('TUTORIAL_PAGES_OK');
 await page.getByRole('button',{name:'小助手',exact:true}).last().tap();await page.locator('#assistant-question').fill('模拟未发送草稿');
 await page.getByRole('button',{name:'小步使用教程',exact:true}).tap();const help=page.locator('.study-tutorial');await help.locator('img').evaluate(img=>img.decode());await page.keyboard.press('Escape');await help.waitFor({state:'hidden'});assert.equal(await page.locator('#assistant-question').inputValue(),'模拟未发送草稿');assert.equal(await page.locator('.assistant-dialog[open]').count(),1);assert.equal(await page.evaluate(()=>document.body.style.position),'fixed');await page.getByRole('button',{name:'关闭小助手',exact:true}).tap();
 await page.locator('.study-bottom-nav:visible .study-nav-item').filter({hasText:'成长'}).last().tap();
 console.log('NESTED_TUTORIAL_OK');
 const house=page.locator('.economy-grid article').filter({hasText:'家庭小帮手'});await house.getByRole('button',{name:'记录完成',exact:true}).tap();const entry=page.locator('dialog[open]');await entry.getByLabel('做了什么（选填）',{exact:true}).fill('叠衣服');await entry.getByRole('button',{name:'请家长确认',exact:true}).tap();await entry.waitFor({state:'hidden'});await house.getByRole('button',{name:'等家长确认',exact:true}).waitFor();assert.equal((await api(page,'reading/state')).data.growth.balance,1);
 const parentContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true}),parent=await parentContext.newPage();parent.on('pageerror',e=>errors.push(e.message));parent.on('dialog',d=>void d.accept());await parent.goto(base+'/reading/',{waitUntil:'domcontentloaded'});await api(parent,'session','POST',{username:'qa-parent',password});await parent.goto(base+'/reading/?view=manage',{waitUntil:'domcontentloaded'});await parent.getByRole('button',{name:'确认完成',exact:true}).tap();await parent.getByRole('button',{name:'确认完成',exact:true}).waitFor({state:'hidden'});
 for(const key of ['badminton','english-class','english-reading'])assert.equal((await api(parent,'reading/activities','POST',{id:crypto.randomUUID(),key,date:(await api(parent,'reading/state')).data.today})).status,200);
 await refresh(page);await house.getByRole('button',{name:'本期已到账',exact:true}).waitFor();assert.equal((await api(page,'reading/state')).data.growth.balance,13);
 const shop=page.locator('.reading-rewards article').filter({hasText:'日常购物卡'});await shop.getByRole('button',{name:'填写购物金额',exact:true}).tap();const exchange=page.locator('dialog[open]');await exchange.getByLabel('本次实际购物金额（元）',{exact:true}).fill('4.00');await exchange.getByRole('button',{name:'确认申请兑换',exact:true}).tap();await exchange.waitFor({state:'hidden'});let state=(await api(page,'reading/state')).data;assert.equal(state.growth.balance,11);assert.equal(state.redemptions[0].amountCents,400);
 const movie=page.locator('.reading-rewards article').filter({hasText:'一起看电影'});await movie.getByRole('button',{name:'申请兑换',exact:true}).tap();await page.locator('dialog[open]').getByRole('button',{name:'确认申请兑换',exact:true}).tap();await movie.getByRole('button',{name:'本月名额已用完',exact:true}).waitFor();assert.equal((await api(page,'reading/state')).data.growth.balance,1);
 await refresh(parent);await parent.getByRole('button',{name:'同意兑换',exact:true}).first().tap();await parent.getByText(/使用截至/).waitFor();
 assert.equal(await parent.getByRole('button',{name:'开新一期',exact:true}).count(),0);assert.equal(await parent.getByText('约定生效中',{exact:true}).count(),4);
 for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});await parent.emulateMedia({colorScheme:scheme});for(const width of [320,390,768,1280]){for(const [p,name]of [[page,'growth'],[parent,'parent']]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} overflows ${width}`);await p.screenshot({path:output+`/${name}-${scheme}-${width}.png`,fullPage:true});}}}
 for(const topic of ['home','reading','growth','assistant'])for(const i of [1,2]){const r=await page.request.get(base+`/tutorials/${topic}-${i}.png`);assert.equal(r.status(),200);}
 const avatar=page.locator('.study-bottom-nav .xiaobu-mascot').first();assert.ok(await avatar.evaluate(img=>img.complete&&img.naturalWidth>0));assert.deepEqual(errors,[]);await parentContext.close();
 console.log('GROWTH_TUTORIALS_UI_OK=true real-api,activity-approval,daily-weekly-caps,shopping-money,movie-quota,locked-prices,approval-validity,8-images,4-tutorials,swipe,nested-escape,scroll-lock,draft-preserved,rabbit,light-dark,320-390-768-1280');
}finally{await browser.close();}
