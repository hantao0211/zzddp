// Synthetic data only: no production records, original images, AI calls or writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL, output = process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(':3443')); await mkdir(output, { recursive: true });
const date = '2026-11-20', viewer = { id:'11111111-1111-4111-8111-111111111111', role:'child', name:'模拟孩子', username:'qa-child' };
const ev = (fileId, excerpt) => ({ fileId, page:1, excerpt });
const task = { id:'memo:task:0', subject:'语文', title:'2号本订正签字', requirement:'订正词语并签字。', format:'other', coverage:'partial', evidence:[ev('work-a-page','词语1—23，底部有订正'),ev('work-b-page','右下角有签字')], memoEvidence:[ev('memo-page','2号本订签')], missing:['照片没有本子编号，顶部边缘看不清。'], reviewActivity:null, writtenCompletion:null };
const upload = (id,kind) => ({ id,date,kind,status:'processed',note:'',createdAt:'',subjects:['语文'],aiMs:0,issues:[],files:[{id:id+'-file',name:id+'.png',size:100,stored:true,pages:[{id:id+'-page',number:1}]}] });
const uploads = [upload('memo','memo'),upload('work-a','homework'),upload('work-b','homework'),upload('other-task','homework')];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA5sAAAAASUVORK5CYII=','base64');
const errors=[],writes=[];
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
 task.coverage='complete';task.missing=[];task.selectedSubmission={version:'selected-destination-v1',pageIds:['work-a-page','work-b-page'],note:'已按上传时指定的作业接收并做基本检查，没有明显归属冲突；不需要补拍封面或本子编号。'};task.writtenCompletion={version:'written-v2',status:'done',reason:'已看到订正内容和手写签名，按“订正并签字”记为已完成；答案对错另看批改。',parts:[{label:'订正',status:'answered',evidence:ev('work-a-page','页底有订正')},{label:'签字',status:'answered',evidence:ev('work-b-page','右下手写签名')}]};
 uploads[1].issues=[{pageId:'work-a-page',message:'本页未见本子编号，无法确定是哪本。'}];uploads[2].issues=[{pageId:'work-b-page',message:'顶部有裁切，无法确认完整题号顺序。'}];
 await page.route('**/assistant-api/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname;if(req.method()!=='GET')writes.push(path);const send=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer});if(path.endsWith('/reading/state'))return send(null);if(path.endsWith('/memories'))return send({items:[]});if(path.includes('/learning/pages/'))return route.fulfill({contentType:'image/png',body:png});if(path.endsWith('/learning/state'))return send({date,status:'processed',note:'',pending:false,dates:[date],quota:{calls:0,limit:100},uploads,report:{date,memoId:'memo',updatedAt:'',tasks:[task],uncertainties:[],unassigned:[],unclassified:[],familyNotes:[]}});throw Error('Unexpected mock '+path);
 });
 await page.goto(base+'/?studyDate='+date,{waitUntil:'networkidle'});await page.locator('.hw-home-summary').getByText('已做完',{exact:true}).waitFor();await page.getByRole('button',{name:'查看2号本订正签字的完成情况',exact:true}).click();const dialog=page.getByRole('dialog',{name:'这项作业的情况',exact:true});await dialog.getByText(task.selectedSubmission.note,{exact:true}).waitFor();assert.equal(await dialog.locator('.task-status-concerns').count(),0);assert.equal(await dialog.locator('.task-photo-issue').count(),0);assert.equal(await dialog.getByRole('img').count(),2);assert.equal(await dialog.getByText('本页未见本子编号，无法确定是哪本。',{exact:true}).isVisible(),false);
 const details=dialog.locator('.task-photo-notes').first();await details.locator('summary').click();await details.getByText('本页未见本子编号，无法确定是哪本。',{exact:true}).waitFor();await details.locator('summary').click();
 await dialog.getByText(task.writtenCompletion.reason,{exact:true}).scrollIntoViewIfNeeded();await dialog.getByText(task.writtenCompletion.reason,{exact:true}).waitFor();
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});await dialog.evaluate(d=>d.scrollTop=0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/selected-accepted-${width}.png`});}
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 // A real unfinished requirement remains visible even for a selected destination.
 task.writtenCompletion={version:'written-v2',status:'incomplete',reason:'第3题还没有订正。',parts:[{label:'第3题订正',status:'blank',evidence:ev('work-a-page','订正位置空白')}]};await page.evaluate(()=>dispatchEvent(new Event('focus')));await page.locator('.hw-home-summary').getByText('未做',{exact:true}).waitFor();await page.getByRole('button',{name:'查看2号本订正签字的完成情况',exact:true}).click();await dialog.getByText('第3题还没有订正。',{exact:true}).scrollIntoViewIfNeeded();await dialog.getByText('第3题还没有订正。',{exact:true}).waitFor();assert.ok((await dialog.innerText()).includes('第3题订正'));assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);console.log('SELECTED_SUBMISSION_UI_OK=true clear-receipt,correct-signature-completion,notes-collapsed-but-retained,real-blank-preserved,no-writes,320-390-768-1280');
}finally{await browser.close();}
