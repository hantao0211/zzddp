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
const grading = { enabled:true, correct:76, wrong:12, blank:0, uncertain:29, feedback:13, finished:1, failed:0, pending:0, incomplete:0, tasks:{} };
const task=(id,subject,title)=>({id,subject,title,requirement:'模拟练习要求',format:'written',coverage:'complete',memoEvidence:[],evidence:[],missing:[],reviewActivity:null,writtenCompletion:{status:'done',reason:'模拟题目均已填写',parts:[]}});
const engine=process.env.SMOKE_BROWSER==='webkit'?webkit:chromium;
const touch=process.env.SMOKE_TOUCH==='1';
const activate=locator=>touch?locator.tap():locator.click();
const browser=await engine.launch({headless:true,args:engine===chromium?['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']:[]});
try{const page=await browser.newPage({colorScheme:process.env.SMOKE_COLOR_SCHEME||'light',viewport:{width:390,height:844},...(touch?{isMobile:true,hasTouch:true}:{}),ignoreHTTPSErrors:true}),errors=[],dialogs=[];page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documentRequests++;});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.type());void d.accept();});
 await page.route('**/assistant-api/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname;const json=v=>route.fulfill({contentType:'application/json',body:JSON.stringify(v)});
  if(path.endsWith('/status'))return json({authenticated:true,accounts:true,viewer,available:true,speech:true});
  if(path.endsWith('/practice/exams'))return json({items:[],total:0,stage:{grade:4,semester:1}});
  if(path.endsWith('/reading/state')){if(holdReads)await new Promise(resolve=>pendingReads.push(resolve));return json(reading);}
  if(path.endsWith('/homework-context'))return json({date:'2026-11-19',revision:1,hasMaterials:false,availableDates:[],pending:false,entries:[],uncertainties:[],familyNotes:[]});
  if(path.endsWith('/memories'))return json({items:[]});
  if(path.endsWith('/learning/grading'))return json({summary:grading,batches:[]});
  if(path.endsWith('/learning/mistakes'))return json({total:0,items:[]});
  if(path.endsWith('/learning/practice/state'))return json({today:'2026-11-19',viewer,profile:null,subjects:[],items:[]});
  if(path.endsWith('/learning/practice/materials'))return json({items:[]});
  if(path.endsWith('/learning/state')){const date=url.searchParams.get('date'),tasks=[task('math','数学','数学练习册 P32'),{...task('chinese','语文','语文预习'),format:'reading',writtenCompletion:null,reviewActivity:{status:'marked',reason:'模拟圈画'}},task('english','英语','英语抄写')];return json({date,status:'processed',pending:false,note:'模拟记录',dates:[date],grading,homeworkReward:{eligible:true,earned:true,points:1},quota:{calls:0,limit:60},reviewPolicy:{version:'review-traces-v1',description:'按痕迹判断'},writtenCompletionEnabled:true,uploads:['memo','homework'].map(kind=>({id:kind,date,kind,status:'processed',createdAt:'2026-11-20T00:00:00Z',subjects:['数学','语文','英语'],files:[{id:kind+'-file',stored:true,pages:[],name:'synthetic.jpg',size:100,mimeType:'image/jpeg'}],aiMs:0,issues:[],note:'模拟照片'})),report:{date,memoId:'memo',tasks:[...tasks,...Array.from({length:6},(_,i)=>task('extra-'+i,'英语','补充练习 '+(i+1)))],unclassified:[],unassigned:[],uncertainties:[],familyNotes:[],updatedAt:'2026-11-20T00:00:00Z'}});}
  throw Error('Unexpected synthetic endpoint '+path);
 });
 await page.goto(base+'/?studyDate=2026-11-19',{waitUntil:'networkidle'});await page.locator('.hw-home-summary tbody tr').first().waitFor();

 // Exercise real touch input, including the first tap and the dark-mode hover trap.
 // A narrow viewport alone still sends mouse clicks and misses this regression.
 if(touch){
  const nav=page.getByRole('navigation',{name:'底部学习导航',exact:true});
  const select=label=>label==='课业'?nav.getByRole('link',{name:label,exact:true}):nav.getByLabel(label,{exact:true});
  for(const scheme of ['light','dark']){
   await page.emulateMedia({colorScheme:scheme});
   assert.equal(await page.evaluate(()=>matchMedia('(hover:hover) and (pointer:fine)').matches),false);
   const inactive=select('课外阅读');
   const before=await inactive.evaluate(el=>getComputedStyle(el).backgroundColor);
   await inactive.hover();
   assert.equal(await inactive.evaluate(el=>getComputedStyle(el).backgroundColor),before,'Touch devices must not leave a second tab highlighted by hover');
   const rounds=[];
   for(let i=0;i<4;i++)for(const [label,heading] of [['课外阅读','我的阅读手帐'],['成长与奖励','我的小脚步'],['心愿商城','我的心愿商城'],['课业','我的课业手账']]){
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
 await decorate.click();await page.getByRole('heading',{name:'我的课业手账',exact:true}).click();assert.equal(await decorate.getAttribute('aria-expanded'),'false');
 await decorate.click();await stickers.getByRole('button',{name:'选择花朵贴纸',exact:true}).click();
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 console.log('JOURNAL_OVERVIEW_UI_OK=true real-total-and-completed-counts,three-row-overview,expand-all-nine,status-dialog-for-extra-row,collapse,sticker-persistence');
 for(const width of [320,390,768,900,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const quote=await garden.locator('.journal-motto-line').evaluateAll(lines=>lines.map(line=>line.getBoundingClientRect().toJSON()));assert.equal(quote.length,2,'Garden message keeps two lines');assert.ok(quote[0].bottom<=quote[1].top,'The two motto lines have distinct baselines');assert.ok((await garden.boundingBox()).height>=150&&(await garden.boundingBox()).height<=214,'Full flower stays visible without a separate picker row');const gardenBox=await garden.boundingBox(), uploads=await page.locator('.hw-primary-actions').boundingBox(), firstTask=await overview.locator('tbody tr').first().boundingBox();assert.ok(uploads.y>=gardenBox.y+gardenBox.height&&uploads.y-gardenBox.y-gardenBox.height<=30,'Uploads follow the garden without an extra row');assert.ok(firstTask.y-uploads.y<240,'The first task stays near the upload actions');await decorate.click();const pickerBox=await stickers.boundingBox();assert.ok(pickerBox.x>=0&&pickerBox.x+pickerBox.width<=width);await page.screenshot({path:output+`/home-picker-${width}.png`});await page.keyboard.press('Escape');await page.locator('.hw-simple-heading h1').click();const note=await page.locator('.home-study-tools').boundingBox(),summary=await overview.boundingBox();assert.ok(note.y>=summary.y+summary.height,'Study tools are grouped directly below the homework list');if(width>=900)assert.ok((await page.locator('.hw-main').boundingBox()).width<=880,'Desktop journal keeps the selected compact reading width');const nav=page.getByRole('navigation',{name:width>=900?'主要学习导航':'底部学习导航',exact:true});assert.ok(await nav.isVisible());assert.equal(await nav.getByRole('button',{name:'问问小步',exact:true}).count(),0);for(const control of await nav.locator('a,button').all()){const b=await control.boundingBox();assert.ok(b.width>=40&&b.height>=40);}assert.equal(await page.getByRole('button',{name:'问问小步',exact:true}).count(),1);await page.screenshot({path:output+`/home-${width}.png`,fullPage:true});}
 const tools = page.getByRole('region',{name:'批改与练习',exact:true});
 const targets = [['查看批改','批改结果'],['我的错题本','错题本'],['15分钟小练习','课内小练习'],['课程资料库','课程资料库']];
 const amounts = tools.locator('.home-study-rewards .reading-token');
 await tools.getByText('已批改130题 · 12道错题 · 29题待确认',{exact:true}).waitFor();
 for (const width of [320,390,720,1280]) {
  await page.setViewportSize({width,height:844});
  const tiles = await tools.locator('.home-study-entry').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
  assert.equal(tiles.length,4);
  assert.ok(tiles.every(tile=>tile.height>=44&&tile.left>=0&&tile.right<=width));
  assert.equal(new Set(tiles.map(tile=>tile.top)).size, width<=720?2:1);
  const tokens=await amounts.evaluateAll(nodes=>nodes.map(node=>{
   const style=getComputedStyle(node), icon=node.querySelector('svg').getBoundingClientRect();
   return [style.fontSize,style.fontWeight,icon.width,getComputedStyle(node.querySelector('small')).fontSize];
  }));
  assert.deepEqual(tokens[0],tokens[1]);
  const quote=await garden.locator('h2').evaluate(el=>[...el.querySelectorAll('.journal-motto-line')].map(line=>Math.round(line.scrollWidth-line.clientWidth)));
  assert.ok(quote.every(overflow=>overflow<=1),'Motto lines fit the available width');
  const tilts=await garden.locator('.journal-motto-glyph').evaluateAll(parts=>parts.map(p=>parseFloat(getComputedStyle(p).rotate)));
  assert.deepEqual(tilts,[-5,0,0,4,-6,5,5,-4,-7,8,-3,13]);
  const relativeGap=await garden.locator('.journal-motto-line').first().evaluate(line=>{
    const style=getComputedStyle(line);return parseFloat(style.columnGap)/parseFloat(style.fontSize);
  });
  const expectedGap = width >= 900 ? 0.07 : 0.03;
  assert.ok(Math.abs(relativeGap - expectedGap) < 0.001, 'Desktop lettering has a little more room');
  const ends=await garden.locator('.journal-motto-line').evaluateAll(lines=>lines.map(line=>line.lastElementChild.getBoundingClientRect().right));
  assert.ok(Math.abs(ends[0]-ends[1])<3,'The two motto lines should end together');
  const quoteSizes=await garden.locator('.journal-motto-line').last().locator('span').evaluateAll(parts=>parts.map(part=>[getComputedStyle(part).fontSize,getComputedStyle(part).color]));
  assert.equal(new Set(quoteSizes.map(([size])=>size)).size,3);
  assert.equal(new Set(quoteSizes.map(([,color])=>color)).size,3);
 }
 await page.setViewportSize({width:390,height:844});
 for (const [button, region] of targets) {
  assert.equal(await tools.getByRole('button',{name:button,exact:true}).count(),1);
  await activate(tools.getByRole('button',{name:button,exact:true}));
  await page.getByRole('region',{name:region,exact:true}).waitFor();
  await page.getByRole('button',{name:'返回首页',exact:true}).click();
 }
 const stalk=page.locator('.journal-flower-stalk');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await stalk.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('.journal-flower-stalk')?.getAnimations().length);
 const breeze=await stalk.evaluate(el=>{
  const pot=el.parentElement.querySelector('.journal-pot');
  const original=pot.getBoundingClientRect();
  const wind=el.getAnimations()[0];
  if(!wind)return null;
  wind.pause(); wind.currentTime=0;
  const angle=()=>{const matrix=new DOMMatrix(getComputedStyle(el).transform);return Math.atan2(matrix.b,matrix.a)*180/Math.PI;};
  const start=angle();
  wind.currentTime=768;
  const left=angle();
  wind.currentTime=1760;
  const right=angle();
  wind.currentTime=2528;
  const rebound=angle();
  wind.currentTime=3200;
  const settled=angle();
  const still=pot.getBoundingClientRect();
  wind.play();
  return {start,left,right,rebound,settled,potStill:original.x===still.x&&original.y===still.y,iterations:wind.effect.getTiming().iterations};
 });
 assert.ok(breeze&&breeze.potStill&&breeze.iterations===1);
 assert.ok(Math.abs(breeze.start)<.1&&Math.abs(breeze.left+8)<.1&&Math.abs(breeze.right-6.5)<.1&&Math.abs(breeze.rebound+1.8)<.1&&Math.abs(breeze.settled)<.1);
 const flower=page.locator('.journal-flower');
 const face=flower.locator('.journal-flower-face');
 await page.waitForFunction(()=>document.querySelector('.journal-flower-face')?.dataset.expression,{},{timeout:6000});
 const firstFace=await face.getAttribute('data-expression');
 assert.ok(['blink','doubleBlink','wink'].includes(firstFace));
 await page.waitForFunction(previous=>document.querySelector('.journal-flower-face')?.dataset.expression!==previous,firstFace,{timeout:6000});
 const secondFace=await face.getAttribute('data-expression');
 await page.waitForFunction(previous=>document.querySelector('.journal-flower-face')?.dataset.expression!==previous,secondFace,{timeout:6000});
 assert.equal(new Set([firstFace,secondFace,await face.getAttribute('data-expression')]).size,3,'Every cycle includes the wink');
 const leafMotion=await flower.evaluate(el=>[...el.querySelectorAll('.journal-leaf-blade')].map(blade=>{
  const animation=blade.getAnimations()[0];
  if(!animation)return null;
  animation.pause();
  const delay=animation.effect.getTiming().delay;
  animation.currentTime=delay+450;
  return {delay,tilt:new DOMMatrix(getComputedStyle(blade).transform).b};
 }));
 assert.ok(leafMotion[0]?.tilt>.09 && leafMotion[1]?.tilt<-.09 && leafMotion[0].delay<leafMotion[1].delay);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await stalk.evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.equal(await flower.getAttribute('data-playing'),null);
 assert.equal(await flower.locator('.journal-leaf-blade').evaluateAll(blades=>blades.flatMap(b=>b.getAnimations()).length),0);
 await face.evaluate(svg=>{
  const [left,right]=svg.querySelectorAll('[data-feature=eye]');
  const [leftArc,rightArc]=svg.querySelectorAll('[data-eyelid=laugh]');
  const wink=svg.querySelector('[data-eyelid=wink]');
  const opacity=node=>Number(getComputedStyle(node).opacity);
  const check=(expected,label)=>{
   const actual=[left,right,leftArc,rightArc,wink].map(opacity);
   if(actual.some((n,i)=>Math.abs(n-expected[i])>.02))throw Error(label+': '+actual);
  };
  const resting=[0,0,1,1,0], open=[1,1,0,0,0];
  check(resting,'Reduced motion idle');
  svg.pauseAnimations();
  for(const [pose,checkpoints] of [
   ['blink',[[.12,open],[.4,open],[.78,resting],[1.1,open],[1.87,open]]],
   ['doubleBlink',[[.12,open],[.4,open],[.70,resting],[.90,open],[1.08,resting],[1.4,open]]],
   ['wink',[[.12,open],[.4,open],[.96,[1,0,0,0,1]],[1.5,open]]],
  ]){
   const t=svg.getCurrentTime()+3;
   svg.setCurrentTime(t);
   svg.querySelectorAll('[data-pose="'+pose+'"]').forEach(a=>a.beginElement());
   for(const [time,expected] of checkpoints){svg.setCurrentTime(t+time);check(expected,pose+' '+time);}
   svg.setCurrentTime(t+2.1);check(resting,pose+' settles');
  }
  svg.unpauseAnimations();
 });
 await flower.screenshot({path:output+'/flower-face.png'});
 const illustrations=[
  ['课外阅读','tab-book','tab-book-page','journal-turn-page',.35],
  ['成长与奖励','tab-sprout','tab-sprout-shoot','journal-sprout-grow',.76],
  ['心愿商城','tab-gift','tab-gift-lid','journal-open-gift',.55],
 ];
 const nav=page.getByRole('navigation',{name:'底部学习导航',exact:true});
 for (const [label,kind,moving,name,previewFrame] of illustrations) {
  await activate(nav.getByLabel(label,{exact:true}));
  const illustration=page.locator('.study-tab-illustration.'+kind);
  const part=illustration.locator('.'+moving);
  await illustration.waitFor();
  assert.equal(await illustration.getAttribute('aria-hidden'),'true');
  assert.equal(await part.evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await illustration.scrollIntoViewIfNeeded();
  await page.waitForFunction(selector=>document.querySelector(selector)?.getAnimations().length,'.'+moving);
  assert.equal(await part.evaluate(el=>getComputedStyle(el).animationName),name);
  const firstStart=await page.waitForFunction(sel=>document.querySelector(sel)?.getAnimations()[0]?.startTime,'.'+moving);
  let previousStart=await firstStart.jsonValue();
  for(let replay=0;replay<2;replay++){
   const next=await page.waitForFunction(({selector,previous})=>{
    const start=document.querySelector(selector)?.getAnimations()[0]?.startTime;
    return start!=null && start>previous+1000 ? start : false;
   },{selector:'.'+moving,previous:previousStart},{timeout:8500});
   const nextStart=await next.jsonValue();
   const elapsed=nextStart-previousStart;
   assert.ok(elapsed>=2800&&elapsed<=6750,'Random replay interval (ms): '+elapsed);
   previousStart=nextStart;
  }
  await page.evaluate(()=>{
   Object.defineProperty(document,'hidden',{configurable:true,value:true});
   document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await part.evaluate(el=>el.getAnimations().length),0);
  await page.evaluate(()=>{
   delete document.hidden;
   document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await part.evaluate(el=>el.getAnimations().length),0,'No immediate catch-up after returning');
  await page.waitForFunction(sel=>document.querySelector(sel)?.getAnimations().length,'.'+moving,{timeout:8500});
  if(kind==='tab-book'){
   await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
   await page.waitForFunction(()=>!document.querySelector('.tab-book').hasAttribute('data-playing'));
   await illustration.scrollIntoViewIfNeeded();
   assert.equal(await part.evaluate(el=>el.getAnimations().length),0);
   await page.waitForFunction(sel=>document.querySelector(sel)?.getAnimations().length,'.'+moving,{timeout:8500});
  }
  const timing=await part.evaluate((el,frame)=>{
   const effect=el.getAnimations()[0];
   const {delay,duration,iterations}=effect.effect.getTiming();
   effect.pause();
   effect.currentTime=delay+duration*.05;
   const start=getComputedStyle(el).transform;
   effect.currentTime=delay+duration*frame;
   const peak=getComputedStyle(el).transform;
   const spark=el.parentElement.querySelector('.tab-gift-sparks')?.getAnimations()[0];
   if(spark) { spark.pause(); spark.currentTime=delay+duration*frame; }
   return {start,peak,iterations};
  },previewFrame);
  assert.equal(timing.iterations,1);
  assert.notEqual(timing.start,timing.peak);
  for (const width of [320,390,1280]) {
   await page.setViewportSize({width,height:844});
   const box=await illustration.boundingBox();
   assert.ok(box.width===34&&box.height===34&&box.x>=0&&box.x+box.width<=width);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(width===390)await page.screenshot({path:output+`/illustration-${kind}.png`});
  }
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(sel=>!document.querySelector(sel).hasAttribute('data-playing'),'.'+kind);
  assert.ok(await illustration.evaluate(el=>el.getAnimations({subtree:true}).length===0));
 }
 await activate(nav.getByRole('link',{name:'课业',exact:true}));
 await page.emulateMedia({reducedMotion:'no-preference'});
 console.log('HOME_STUDY_TOOLS_OK=true one-entry-per-feature,route-testing,two-mobile-columns,matching-rewards,aligned-three-size-motto,pot-still,book-page-sprout-gift,two-real-replays,background-and-scroll-pause,four-tabs-reduced-motion');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__studyDocument='same-document');await activate(page.getByRole('link',{name:'课外阅读',exact:true}));assert.equal(await page.evaluate(()=>window.__studyDocument),'same-document');await page.getByLabel('正在读的书',{exact:true}).waitFor();assert.ok(page.url().includes('studyDate=2026-11-19'));await page.goto(base+'/reading/?view=manage&studyDate=2026-11-19',{waitUntil:'networkidle'});await page.getByLabel('正在读的书',{exact:true}).waitFor();assert.ok(!page.url().includes('view=manage'),'A child must return to reading from a stale parent settings URL');
 await page.getByLabel('开始页',{exact:true}).fill('13');await page.getByLabel('结束页',{exact:true}).fill('18');await page.getByLabel('时长（分钟）',{exact:true}).fill('17');await page.locator('#reading-summary').fill('我读到一个有趣的故事，还想再说说人物为什么这样做。');
 await page.getByRole('button',{name:'开始阅读计时',exact:true}).click();await activate(page.getByRole('button',{name:'成长与奖励',exact:true}));assert.ok(page.url().includes('view=growth'));await activate(page.getByRole('button',{name:'课外阅读',exact:true}));assert.equal(await page.locator('#reading-summary').inputValue(),'我读到一个有趣的故事，还想再说说人物为什么这样做。');assert.equal(await page.getByLabel('时长（分钟）',{exact:true}).inputValue(),'17');await page.getByRole('button',{name:'结束计时并计入',exact:true}).waitFor();assert.deepEqual(dialogs,[],'Same-page navigation must never discard a draft or trigger a leave warning');
 await page.goBack();await page.getByRole('heading',{name:'我的小脚步',exact:true}).waitFor();await page.goForward();await page.locator('#reading-summary').waitFor();assert.ok((await page.locator('#reading-summary').inputValue()).includes('有趣的故事'));
 for(const width of [320,390,768,900,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/reading-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'问问小步',exact:true}).click();await page.locator('#assistant-question').waitFor();await page.locator('#assistant-question').fill('我想聊聊这本书。');const log=await page.locator('.assistant-messages').boundingBox(),dialog=await page.locator('.assistant-dialog').boundingBox();assert.ok(log.height>dialog.height*.45,'Conversation has most of the dialog');await page.getByRole('button',{name:'关闭小助手',exact:true}).click();await page.getByRole('button',{name:'问问小步',exact:true}).click();assert.equal(await page.locator('#assistant-question').inputValue(),'我想聊聊这本书。');await page.setViewportSize({width:390,height:430});await page.waitForTimeout(100);assert.ok((await page.locator('.assistant-messages').boundingBox()).height>=120);await page.screenshot({path:output+'/assistant-short-viewport.png'});await page.getByRole('button',{name:'关闭小助手',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await activate(page.getByRole('button',{name:'心愿商城',exact:true}));await page.getByRole('button',{name:'我要许愿',exact:true}).waitFor();for(const width of [320,390,768,900,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/growth-${width}.png`,fullPage:true});}

 // Delayed APIs must not block menu changes or cause extra document downloads.
 await page.setViewportSize({width:390,height:844});
 const beforeDocuments=documentRequests;
 await page.evaluate(()=>window.__studyDocument='retained');
 holdReads=true;
 await page.waitForRequest(r=>new URL(r.url()).pathname.endsWith('/reading/state'));
 await activate(page.getByRole('link',{name:'课业',exact:true}));
 await page.getByRole('heading',{name:'作业进展',exact:true}).waitFor();
 await activate(page.getByRole('link',{name:'课外阅读',exact:true}));
 assert.equal(await page.locator('#reading-summary').inputValue(),'我读到一个有趣的故事，还想再说说人物为什么这样做。');
 await page.getByRole('button',{name:'结束计时并计入',exact:true}).waitFor();
 const durations=[];
 for(let i=0;i<8;i++){
  const started=Date.now();
  await activate(page.getByRole('button',{name:'成长与奖励',exact:true}));
  await page.getByRole('heading',{name:'我的小脚步',exact:true}).waitFor();
  await activate(page.getByRole('link',{name:'课业',exact:true}));
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
 await page.getByRole('button',{name:'问问小步',exact:true}).click();
 assert.equal(await page.locator('#assistant-question').inputValue(),'我想聊聊这本书。');
 await page.getByRole('button',{name:'关闭小助手',exact:true}).click();
 await activate(page.getByRole('link',{name:'课业',exact:true}));
 await page.getByRole('button',{name:'问问小步',exact:true}).click();
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
