// Synthetic records and upload bytes only. Verify that AI progress never blocks the next upload.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base.endsWith(':3443'));await mkdir(output,{recursive:true});
const date='2026-11-20',viewer={id:'11111111-1111-4111-8111-111111111111',name:'模拟孩子',username:'qa',role:'child'};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA5sAAAAASUVORK5CYII=','base64');
const records=new Map(),errors=[];let count=0,pending=false,scoped=false,finished=false;
function upload(id,kind){return {id,date,kind,createdAt:date+'T01:00:00Z',status:'processed',subjects:[],note:'模拟原件',aiMs:1,issues:[],files:[{id:id+'-file',stored:true,name:'synthetic.png',size:png.length,pages:[]}]};}
for(const [id,kind]of [['memo','memo'],['chinese','homework'],['math','homework']])records.set(id,upload(id,kind));
const task=(id,subject,title,done)=>({id,subject,title,requirement:title,format:'written',memoEvidence:[],evidence:[],missing:[],coverage:done?'complete':'none',reviewActivity:null,writtenCompletion:done?{version:'written-v2',status:'done',reason:'模拟题目均已填写',parts:[]}:null});
function state(){return {date,pending,status:pending?'queued':'processed',note:'模拟状态',dates:[date],writtenCompletionEnabled:true,quota:{calls:0,limit:60},processing:pending?{memo:false,subjects:scoped?['英语']:[],unclassified:!scoped,retrying:false}:undefined,uploads:[...records.values()],report:{date,memoId:'memo',updatedAt:date+'T01:00:00Z',tasks:[task('chinese','语文','语文练习',true),task('math','数学','数学练习',true),task('english','英语','英语练习',finished)],uncertainties:[],unassigned:[],unclassified:[],familyNotes:[]}};}
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assistant-api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;const send=v=>route.fulfill({contentType:'application/json',body:JSON.stringify(v)});
  if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer});
  if(path.endsWith('/reading/state'))return send(null);
  if(path.endsWith('/learning/state'))return send(state());
  if(path.endsWith('/learning/uploads')){const input=req.postDataJSON();assert.equal(input.kind,'homework');const id=`22222222-2222-4222-8222-${String(++count).padStart(12,'0')}`;const u={...upload(id,'homework'),status:'uploading',files:input.files.map((f,i)=>({...f,id:`33333333-3333-4333-8333-${String(count*10+i).padStart(12,'0')}`,stored:false,pages:[]}))};records.set(id,u);return send(u);}
  if(path.includes('/learning/files/')&&req.method()==='PUT'){for(const u of records.values())for(const f of u.files)if(path.endsWith(f.id))f.stored=true;return send({stored:true});}
  const finish=path.match(/\/uploads\/([^/]+)\/finish$/);if(finish){const u=records.get(finish[1]);u.status='queued';pending=true;return send(u);}
  throw Error('Unexpected synthetic request '+path);
 });
 await page.goto(base+'/?studyDate='+date,{waitUntil:'networkidle'});
 const rows=()=>page.locator('.hw-home-summary tbody tr');await rows().first().waitFor();
 const row=subject=>rows().filter({hasText:subject+'练习'});
 assert.ok((await row('语文').innerText()).includes('已做完'));assert.ok((await row('数学').innerText()).includes('已做完'));
 async function submit(name){
  const picker=page.waitForEvent('filechooser');await page.locator('.hw-primary-actions').getByRole('button',{name:/^交作业/}).click();await(await picker).setFiles({name,mimeType:'image/png',buffer:png});
  const dialog=page.getByRole('dialog',{name:'交作业',exact:true});await dialog.getByRole('button',{name:'确认上传',exact:true}).click();await dialog.waitFor({state:'hidden'});
 }
 await submit('english-first.png');assert.equal(count,1);
 await page.locator('.hw-summary-processing').waitFor();
 assert.equal(await page.locator('.hw-row-updating').count(),0,'Unknown new photos must not mark every task as updating');
 for(const subject of ['语文','数学']){assert.ok((await row(subject).innerText()).includes('已做完'));assert.ok(!(await row(subject).innerText()).includes('整理中'));}
 // The first photo remains queued, but another photo can be selected and submitted immediately.
 await submit('english-second.png');assert.equal(count,2);assert.equal(pending,true);
 scoped=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await row('英语').getByText('新照片整理中',{exact:true}).waitFor();assert.equal(await page.locator('.hw-row-updating').count(),1);assert.equal(await row('英语').getByRole('button',{name:'为英语练习上传作业',exact:true}).count(),0,'Do not ask the child to upload again while the matching photo is processing');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/pending-preserves-results-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'查看英语练习的完成情况',exact:true}).click();await page.getByRole('dialog',{name:'这项作业的情况',exact:true}).getByText(/新照片还在整理/).first().waitFor();await page.getByRole('button',{name:'关闭',exact:true}).click();
 finished=true;pending=false;for(const u of records.values())u.status='processed';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.waitForFunction(()=>!document.querySelector('.hw-row-updating'));
 for(const subject of ['语文','数学','英语'])assert.ok((await row(subject).innerText()).includes('已做完'));
 assert.deepEqual(errors,[]);console.log('INCREMENTAL_UPLOAD_UI_OK=true upload-next-while-pending,old-judgements-preserved,unknown-scope-no-all-busy,only-affected-subject-updating,completion-refresh,mobile-tablet-desktop');
}finally{await browser.close();}
