// Invented records only; gestures use real Chromium touch input, not production data.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base.endsWith(':3443'));await mkdir(output,{recursive:true});
const uuid='11111111-1111-4111-8111-111111111111',bookId='22222222-2222-4222-8222-222222222222';
let holdReads=false;const pendingReads=[];let documentRequests=0;
const viewer={id:uuid,name:'模拟孩子',username:'synthetic-child',role:'child'};
const reading={today:'2026-11-20',viewer,books:[{id:bookId,title:'模拟阅读书',author:'模拟作者',isbn:'',publisher:'',totalPages:100,catalogId:null,description:'',sourceUrl:null,createdAt:'2026-11-20T00:00:00Z',finished:false,minutes:20,uniquePages:12,logCount:1}],logs:[],rules:{dailyPoints:2,backfillCounts:false,milestones:[{days:3,points:3},{days:7,points:10}]},stats:{days:3,minutes:20,pages:12,currentStreak:3,bestStreak:3,booksFinished:0},growth:{balance:9,earned:9,ledger:[]},wishes:[],rewards:[],redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false};
const task=(id,subject,title)=>({id,subject,title,requirement:'模拟练习要求',format:'written',coverage:'complete',memoEvidence:[],evidence:[],missing:[],reviewActivity:null,writtenCompletion:{status:'done',reason:'模拟题目均已填写',parts:[]}});

let reads=0,failNext=false,slowNext=false,stallNext=false,releaseStall;const writes=[],errors=[];
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true,configurable:true});const interval=window.setInterval;window.setInterval=(handler,delay,...args)=>interval(handler,Math.max(60000,delay),...args);});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assistant-api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(req.method()!=='GET')writes.push(path);
  const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer});
  if(path.endsWith('/reading/state'))return send(reading);
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/homework-context'))return send({date:'2026-11-20',revision:1,hasMaterials:true,availableDates:[],pending:false,entries:[{entryId:'memo:entry:0',subject:'数学',title:'数学练习册 P32',requirement:'模拟练习要求',format:'written'}],uncertainties:[],familyNotes:[],requirementOptions:[]});
  if(path.endsWith('/learning/state')){
   reads++;if(stallNext){stallNext=false;await new Promise(resolve=>releaseStall=resolve);}if(slowNext){slowNext=false;await new Promise(resolve=>setTimeout(resolve,650));}
   if(failNext){failNext=false;return send({error:'模拟网络中断'},503);}
   const date=url.searchParams.get('date');return send({date,status:'processed',pending:false,note:'',dates:[date],quota:{calls:0,limit:100},uploads:[{id:'memo',date,kind:'memo',status:'processed',createdAt:'',note:'',aiMs:0,subjects:['数学'],issues:[],files:[]}],report:{date,memoId:'memo',updatedAt:'',tasks:Array.from({length:14},(_,i)=>task('task-'+i,'数学','数学练习册 P'+(32+i))),unclassified:[],unassigned:[],uncertainties:[],familyNotes:[]}});
  }
  throw Error('Unexpected mock '+path);
 });
 console.log('phase open');await page.goto(base+'/?studyDate=2026-11-20',{waitUntil:'networkidle'});
 const refresh=()=>page.getByRole('button',{name:'刷新学习记录',exact:true});await refresh().waitFor();
 // A record refresh keeps the document and selected date; rapid clicks share one refresh.
 await page.evaluate(()=>window.__retainedDocument='retained');slowNext=true;
 await refresh().click();assert.ok(await refresh().isDisabled());
 await page.getByRole('status').filter({hasText:'已更新'}).waitFor();assert.equal(await page.evaluate(()=>window.__retainedDocument),'retained');assert.ok(page.url().includes('studyDate=2026-11-20'));
 failNext=true;await refresh().click();await page.getByRole('status').filter({hasText:'刷新未完成'}).waitFor();await refresh().click();await page.getByRole('status').filter({hasText:'已更新'}).waitFor();
 const cdp=await context.newCDPSession(page);
 async function swipe(x,y,endX,endY){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(endX-x)*i/10,y:y+(endY-y)*i/10}]});await page.waitForTimeout(18);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(120);}
 // Pull at the root top refreshes only after release past the threshold.
 await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});
 const pulledBefore=reads;await swipe(12,150,12,325);assert.ok(reads>pulledBefore,'Standalone downward gesture must fetch new records');await page.getByRole('status').filter({hasText:'已更新'}).waitFor();
 // Short, horizontal, upward, cancelled and multi-touch gestures never refresh.
 let n=reads;await swipe(12,150,12,195);await swipe(12,150,180,160);assert.equal(reads,n);
 await page.evaluate(()=>{const t=new Touch({identifier:1,target:document.body,clientX:10,clientY:100});document.body.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[t]}));const moved=new Touch({identifier:1,target:document.body,clientX:10,clientY:280});document.body.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[moved]}));document.body.dispatchEvent(new TouchEvent('touchcancel',{bubbles:true,touches:[]}));});assert.equal(reads,n);
 // Opening a real status dialog halfway down a long page locks and then restores the page.
 // Focused fields, scrolling below the top, nested lists and multiple fingers are not pull refresh.
 n=reads;await page.evaluate(()=>window.scrollTo({top:250,behavior:'instant'}));await swipe(12,300,12,420);assert.equal(reads,n);
 await page.evaluate(()=>{const field=document.querySelector('input[type=date]');field.focus();window.scrollTo({top:0,behavior:'instant'});});await swipe(12,150,12,325);assert.equal(reads,n);await page.evaluate(()=>document.activeElement.blur());
 await page.evaluate(()=>{const list=document.createElement('div');list.id='qa-nested-list';list.style.cssText='position:fixed;top:150px;left:5px;width:70px;height:150px;overflow:auto;background:white;z-index:200';list.textContent='模拟列表内容。'.repeat(300);document.body.append(list);});await swipe(35,270,35,175);assert.equal(reads,n);assert.ok(await page.locator('#qa-nested-list').evaluate(e=>e.scrollTop>0));await page.locator('#qa-nested-list').evaluate(e=>e.remove());
 await page.evaluate(()=>{const target=document.body,t=(id,y)=>new Touch({identifier:id,target,clientX:10+id*30,clientY:y});target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[t(1,100)]}));target.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[t(1,280),t(2,280)]}));target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[]}));});assert.equal(reads,n);
 await page.evaluate(()=>{const target=document.body,t=(id,y)=>new Touch({identifier:id,target,clientX:10+id*30,clientY:y});target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[t(1,100)]}));target.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[t(1,280)]}));target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[t(1,280),t(2,280)]}));target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[t(1,280)]}));target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[]}));});assert.equal(reads,n);
 console.log('phase modals');await page.getByRole('button',{name:'展开其余11项作业',exact:true}).click();const open=page.getByRole('button',{name:'查看数学练习册 P39的完成情况',exact:true});await open.scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);assert.ok(before>100);await open.click();
 const dialog=page.getByRole('dialog',{name:'这项作业的情况',exact:true});await dialog.waitFor();await page.waitForFunction(()=>document.body.style.position==='fixed');assert.equal(await page.evaluate(()=>document.body.style.top),`-${before}px`);
 // A long synthetic block tests both boundaries and real content scrolling in this same dialog.
 await dialog.evaluate(d=>{const p=document.createElement('p');p.textContent='模拟长说明。'.repeat(600);d.querySelector('.dialog-body').append(p);});
 const box=await dialog.boundingBox();const cx=box.x+box.width/2,cy=Math.min(650,box.y+box.height-50);
 await swipe(cx,cy,cx,cy-230);assert.ok(await dialog.evaluate(d=>d.scrollTop>0));
 for(const edge of ['top','bottom']){await dialog.evaluate((d,edge)=>d.scrollTop=edge==='top'?0:d.scrollHeight,edge);await swipe(cx,edge==='top'?300:650,cx,edge==='top'?520:350);assert.equal(await page.evaluate(()=>document.body.style.top),`-${before}px`);assert.equal(await page.evaluate(()=>scrollY),0);}
 // The backdrop and nested dialogs cannot release the original page lock.
 await swipe(5,200,5,390);
 await page.evaluate(()=>{const d=document.createElement('dialog');d.id='nested-qa';d.textContent='模拟第二层弹窗';document.body.append(d);d.showModal();});await page.waitForTimeout(50);
 await page.evaluate(()=>{const d=document.querySelector('#nested-qa');d.close();d.remove();});await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>document.body.style.position),'fixed');
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.waitForFunction(()=>document.body.style.position!=='fixed');assert.equal(await page.evaluate(()=>scrollY),before);
 // Repeated real editor openings restore the same position and retain editable inputs.
 console.log('phase editor');const edit=page.getByRole('button',{name:'修改数学练习册 P39',exact:true});
 for(let i=0;i<3;i++){await edit.click();const editor=page.getByRole('dialog',{name:'修改备忘录清单',exact:true});await editor.waitFor();await page.waitForFunction(()=>document.body.style.position==='fixed');await editor.getByLabel('作业具体要求',{exact:true}).fill('模拟编辑内容');if(i===1)await page.keyboard.press('Escape');else await editor.getByRole('button',{name:'关闭修改清单',exact:true}).click();await page.waitForFunction(()=>document.body.style.position!=='fixed');assert.equal(await page.evaluate(()=>scrollY),before);}
 // Assistant chat, settings and text entry scroll independently; closing preserves its draft.
 await page.getByRole('button',{name:'问问小步',exact:true}).click();await page.locator('#assistant-question').fill('保留这句问题');await page.getByRole('button',{name:'更多功能',exact:true}).click();await swipe(250,600,250,300);assert.equal(await page.evaluate(()=>document.body.style.position),'fixed');await page.getByRole('button',{name:'关闭小助手',exact:true}).click();await page.waitForFunction(()=>document.body.style.position!=='fixed');assert.equal(await page.evaluate(()=>scrollY),before);
 await page.getByRole('button',{name:'问问小步',exact:true}).click();assert.equal(await page.locator('#assistant-question').inputValue(),'保留这句问题');await page.getByRole('button',{name:'关闭小助手',exact:true}).click();
 console.log('phase reading');
 // Pull refreshing reading records preserves the unsaved summary and running timer.
 await page.getByRole('link',{name:'课外阅读',exact:true}).click();await page.locator('#reading-summary').fill('这是尚未保存的阅读概括。');await page.getByLabel('时长（分钟）',{exact:true}).fill('17');await page.getByRole('button',{name:'开始阅读计时',exact:true}).click();
 await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});await swipe(12,140,12,315);await page.getByRole('status').filter({hasText:'已更新'}).waitFor();assert.equal(await page.locator('#reading-summary').inputValue(),'这是尚未保存的阅读概括。');assert.equal(await page.getByLabel('时长（分钟）',{exact:true}).inputValue(),'17');await page.getByRole('button',{name:'结束计时并计入',exact:true}).waitFor();
 await page.getByRole('button',{name:'成长与奖励',exact:true}).click();await page.getByRole('button',{name:'我要许愿',exact:true}).click();await page.getByRole('dialog',{name:'许一个小心愿',exact:true}).waitFor();await page.waitForFunction(()=>document.body.style.position==='fixed');await page.getByRole('button',{name:'关闭心愿窗口',exact:true}).click();await page.waitForFunction(()=>document.body.style.position!=='fixed');
 // Book picker uses the same lock. Capture compact layouts and accessible refresh target.
 await page.getByRole('button',{name:'课外阅读',exact:true}).click();await page.getByRole('button',{name:'添加书籍',exact:true}).click();await page.locator('.reading-dialog').waitFor();await page.waitForFunction(()=>document.body.style.position==='fixed');await page.locator('.reading-dialog').getByRole('button',{name:'关闭',exact:true}).click();await page.waitForFunction(()=>document.body.style.position!=='fixed');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const b=await refresh().boundingBox();assert.ok(b.width>=44&&b.height>=44);await page.screenshot({path:output+`/refresh-${width}.png`});}
 // Browser tabs keep Safari's native pull gesture instead of intercepting it twice.
 await page.evaluate(()=>Object.defineProperty(navigator,'standalone',{value:false,configurable:true}));await page.getByRole('link',{name:'课业',exact:true}).click();await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));n=reads;await swipe(12,150,12,325);assert.equal(reads,n);
 // A stalled request aborts, exposes a retry and cannot overwrite a later successful read.
 await page.clock.install();stallNext=true;await refresh().click();await page.waitForFunction(()=>document.querySelector('.study-refresh-status').dataset.state==='loading');await page.clock.fastForward(20020);await page.getByRole('status').filter({hasText:'刷新未完成'}).waitFor();assert.equal(await refresh().isDisabled(),false);releaseStall();await refresh().click();await page.getByRole('status').filter({hasText:'已更新'}).waitFor();
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);console.log('MODAL_REFRESH_UI_OK=true real-touch,edges,backdrop,nesting,restore-position,editor,assistant,book,wish,standalone-pull,threshold,cancel,multi-touch,focused-field,nested-list,below-top,escape,timeout-retry,tab-native,manual-refresh,error-retry,draft-timer-date-preserved,no-AI-or-writes,320-390-768-1280');
}finally{await browser.close();}
