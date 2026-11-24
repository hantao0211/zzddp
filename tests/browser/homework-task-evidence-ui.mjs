// Synthetic data only: no production records, original images, AI calls or writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium, webkit } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL, output = process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(':3443')); await mkdir(output, { recursive: true });
const date = '2026-11-20', viewer = { id:'11111111-1111-4111-8111-111111111111', role:'child', name:'模拟孩子', username:'qa-child' };
const ev = (fileId, excerpt) => ({ fileId, page:1, excerpt });
const task = { id:'memo:task:0', subject:'语文', title:'2号本订正签字', requirement:'订正词语并签字。', format:'other', coverage:'partial', evidence:[ev('work-a-page','词语1—23，底部有订正'),ev('work-b-page','右下角有签字')], memoEvidence:[ev('memo-page','2号本订签')], missing:['照片没有本子编号，顶部边缘看不清。'], reviewActivity:null, writtenCompletion:null };
const upload = (id,kind) => ({ id,date,kind,status:'processed',note:'',createdAt:'',subjects:['语文'],aiMs:0,issues:[],files:[{id:id+'-file',name:id+'.png',size:100,stored:true,pages:[{id:id+'-page',number:1}]}] });
const uploads = [upload('memo','memo'),upload('work-a','homework'),upload('work-b','homework'),upload('other-task','homework')];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA5sAAAAASUVORK5CYII=','base64');
const errors=[],writes=[],photoRequests=[];let failThumb=false;
const engine=process.env.SMOKE_BROWSER==='webkit'?webkit:chromium;
const browser = await engine.launch({headless:true,args:engine===chromium?['--no-sandbox']:[]});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,colorScheme:process.env.SMOKE_COLOR_SCHEME||'light'});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assistant-api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(request.method()!=='GET')writes.push(path);
  const send=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer});
  if(path.endsWith('/reading/state'))return send(null);
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.includes('/learning/pages/')){photoRequests.push(path+url.search);if(failThumb&&url.searchParams.get('size')==='thumb'){failThumb=false;return route.fulfill({status:503,contentType:'application/json',body:'{}'});}return route.fulfill({contentType:'image/png',body:png});}
  if(path.endsWith('/learning/state'))return send({date:url.searchParams.get('date')||date,status:'processed',note:'',pending:false,dates:[date],quota:{calls:0,limit:100},uploads,report:{date,memoId:'memo',updatedAt:'',tasks:[task],uncertainties:[],unassigned:[],unclassified:[],familyNotes:[]}});
  throw Error('Unexpected mock API '+path);
 });
 await page.goto(base+'/?studyDate='+date,{waitUntil:'networkidle'});
 const status=()=>page.getByRole('dialog',{name:'这项作业的情况',exact:true});
 const open=()=>page.getByRole('button',{name:'查看2号本订正签字的照片情况',exact:true}).click();
 await page.getByText('对应待确认',{exact:true}).waitFor();assert.equal(photoRequests.length,0);
 await open();await status().getByText('照片没有本子编号，顶部边缘看不清。',{exact:true}).waitFor();
 assert.match(await status().innerText(),/不等于确实缺页或作业没做/);
 assert.equal(await status().getByRole('img').count(),2);assert.equal(await status().getByRole('img',{name:/other-task/}).count(),0);
 const first=status().getByRole('button',{name:'查看照片1大图',exact:true}).first();
 await status().getByRole('img').first().scrollIntoViewIfNeeded();await status().getByRole('img').first().evaluate(img=>img.complete?null:new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;}));assert.ok(await status().getByRole('img').first().evaluate(img=>img.naturalWidth>0));
 assert.ok((await status().getByRole('img').first().getAttribute('src')).endsWith('?size=thumb'));assert.ok(photoRequests.every(url=>url.includes('?size=thumb')));
 const download=status().getByRole('link',{name:'下载图片',exact:true}).first();assert.ok((await download.getAttribute('href')).endsWith('?size=screen&download=1'));
 const viewerDialog=page.getByRole('dialog',{name:'照片预览',exact:true});
 const closePhoto=viewerDialog.getByRole('button',{name:'关闭照片',exact:true});
 const originalUrl=page.url();
 let popups=0;page.on('popup',()=>popups++);
 await first.tap();
 await viewerDialog.getByRole('img').waitFor();
 assert.ok((await viewerDialog.getByRole('img').getAttribute('src')).endsWith('/work-a-page'));
 assert.equal(await closePhoto.evaluate(button=>document.activeElement===button),true);
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:585});
  const box=await closePhoto.boundingBox();
  assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=585&&box.height>=44);
 }
 await page.setViewportSize({width:390,height:585});
 await viewerDialog.getByRole('button',{name:'放大看细节',exact:true}).tap();
 const stage=viewerDialog.locator('.photo-viewer-stage');
 assert.ok(await stage.evaluate(el=>el.scrollWidth>el.clientWidth&&el.scrollHeight>el.clientHeight));
 await stage.evaluate(el=>el.scrollTo(180,240));
 assert.equal(await stage.evaluate(el=>el.scrollTop),240);
 await closePhoto.tap();
 await viewerDialog.waitFor({state:'hidden'});
 assert.ok(await status().isVisible());
 assert.ok(await first.evaluate(button=>document.activeElement===button));
 assert.equal(await page.evaluate(()=>document.body.style.position),'fixed');
 await first.tap();
 await viewerDialog.waitFor();
 await page.keyboard.press('Escape');
 await viewerDialog.waitFor({state:'hidden'});
 assert.ok(await status().isVisible(),"Escape closes only the top photo");
 await page.route('**/learning/pages/work-b-page',route=>route.fulfill({status:503,headers:{'cache-control':'no-store'},body:'not available'}),{times:1});
 await status().getByRole('button',{name:'查看照片2大图',exact:true}).tap();
 await viewerDialog.getByRole('alert').waitFor();
 assert.ok(await closePhoto.isVisible());
 const retry = viewerDialog.getByRole('button',{name:'重试',exact:true});
 assert.ok(await retry.evaluate(el=>el.matches('.button.primary:enabled')));
 assert.ok((await retry.boundingBox()).height >= 44);
 await retry.tap();
 await viewerDialog.getByRole('img').waitFor();
 await closePhoto.tap();
 assert.equal(page.url(),originalUrl);
 assert.equal(popups,0);
 failThumb=true;await status().getByRole('img').first().evaluate(img=>{img.src+='&retry-test=1';});await page.waitForFunction(()=>document.querySelector('.task-photo-preview img')?.getAttribute('src')==='/assistant-api/learning/pages/work-a-page');assert.ok(photoRequests.includes('/assistant-api/learning/pages/work-a-page'));
 // The open window follows the latest task, rather than retaining the row object from the first click.
 task.missing=['更新后：第3题右侧被裁切，内容无法看清。'];
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await status().getByText(task.missing[0],{exact:true}).waitFor();assert.equal(await status().getByText('照片没有本子编号，顶部边缘看不清。',{exact:true}).count(),0);
 await status().locator('.task-status-requirement summary').click();await status().getByText(task.requirement,{exact:true}).waitFor();
 await status().locator('.task-status-memo summary').click();await status().getByText('2号本订签',{exact:true}).waitFor();
 assert.equal(await status().getByRole('link',{name:'下载原件',exact:true}).count(),3);
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const box=await status().boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1);
  assert.ok(await status().evaluate(d=>d.scrollWidth<=d.clientWidth));
  await status().getByRole('heading',{name:'语文 · 2号本订正签字',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:output+`/task-evidence-${width}.png`});
 }
 await status().getByRole('button',{name:'关闭',exact:true}).click();
 // If no concrete cause was recorded, the UI says so and does not invent a missing page.
 task.evidence=[];task.missing=[];task.coverage='uncertain';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText('待匹配',{exact:true}).waitFor();await open();await status().getByText(/没有说明具体缺哪一页/).waitFor();assert.equal(await status().getByRole('img').count(),0);
 await status().getByRole('button',{name:'查看当天全部上传',exact:true}).click();await status().waitFor({state:'hidden'});await page.getByRole('heading',{name:'历史资料',exact:true}).waitFor();
 await page.locator('.hw-file-row').nth(1).click();const fileDialog=page.getByRole('dialog',{name:'作业照片／扫描件',exact:true});await fileDialog.getByRole('img').waitFor();assert.ok((await fileDialog.getByRole('img').first().getAttribute('src')).endsWith('?size=screen'));assert.ok((await fileDialog.getByRole('link',{name:'下载图片',exact:true}).first().getAttribute('href')).endsWith('?size=screen&download=1'));await fileDialog.getByRole('button',{name:'查看第1页高清图片',exact:true}).tap();await viewerDialog.getByRole('img').waitFor();assert.ok((await viewerDialog.getByRole('img').getAttribute('src')).endsWith('/work-a-page'));await closePhoto.tap();await viewerDialog.waitFor({state:'hidden'});assert.ok(await fileDialog.isVisible());await fileDialog.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('button',{name:'返回首页',exact:true}).click();await open();
 // Date changes and repeat opens cannot leave the old task evidence on screen.
 await status().getByRole('button',{name:'关闭',exact:true}).click();for(let i=0;i<3;i++){await open();await status().waitFor();await status().getByRole('button',{name:'关闭',exact:true}).click();}
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log('TASK_EVIDENCE_UI_OK=true same-page-photo,zoom,pinned-close,nested-dialog,escape,retry,focus-restore,exact-cause,matched-thumbnails,private-original-and-download,memo-evidence,no-unrelated-photos,live-dialog-updates,no-invented-missing-page,all-uploads-fallback,repeat-open,320-390-768-1280,no-writes');
}finally{await browser.close();}
