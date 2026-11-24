// Synthetic data only: a saved edit must be visible while the old report is rechecked.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(':3443'));await mkdir(output,{recursive:true});
const date='2026-11-20',viewer={id:'11111111-1111-4111-8111-111111111111',name:'模拟家长',username:'qa-parent',role:'parent'};
let revision=1,phase='original',completed=false,retries=0;
let entry={subject:'英语',title:'英语练习',requirement:'完成今天的英语练习',format:'written'};
const errors=[],id='memo:task:0',rowTitle=()=>entry.title;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assistant-api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  const send=v=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(v)});
  if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer});
  if(path.endsWith('/reading/state'))return send(null);
  if(path.endsWith('/learning/state')){
   const editing=['pending','failed','self'].includes(phase),pending=['pending','self'].includes(phase);
   return send({date,status:phase==='failed'?'failed':pending?'queued':'processed',pending,dates:[date],note:'',writtenCompletionEnabled:true,quota:{calls:0,limit:100},...(editing?{memoEdits:[id]}:{}),
    uploads:[{id:'memo',date,kind:'memo',status:'processed',createdAt:'',note:'',issues:[],subjects:['英语','数学'],files:[{id:'memo-file',name:'synthetic.png',stored:true,size:1,pages:[]}]}],
    report:{date,memoId:'memo',updatedAt:'',uncertainties:[],unassigned:[],unclassified:[],familyNotes:[],tasks:[{id,...entry,memoEvidence:[],evidence:[],missing:[],coverage:editing?'none':'complete',writtenCompletion:editing?null:{version:'written-v2',status:'done',reason:'模拟旧检查',parts:[]},reviewActivity:null,...(phase==='self'?{completionToken:'a'.repeat(64),...(completed?{selfCompletion:{confirmedAt:'',confirmedBy:viewer.name,role:'parent'}}:{})}:{})},{id:'memo:task:1',subject:'数学',title:'数学P75',requirement:'完成第75页',format:'written',memoEvidence:[],evidence:[],missing:[],coverage:'complete',writtenCompletion:{version:'written-v2',status:'done',reason:'模拟已填写',parts:[]},reviewActivity:null}]}});
  }
  if(path.endsWith('/homework-context'))return send({date,revision,pending:phase==='pending',entries:[{entryId:'memo:entry:0',...entry}],uncertainties:[],familyNotes:[]});
  if(path.endsWith('/memo-entries/update')){const body=req.postDataJSON();assert.equal(body.revision,revision);entry=body.entry;revision++;phase=entry.format==='oral'?'self':'pending';return send({id:'33333333-3333-4333-8333-333333333333',date,title:entry.title,requirement:entry.requirement,userQuote:'模拟修改',createdAt:''});}
  if(path.endsWith('/retry-day')){assert.equal(req.postDataJSON().date,date);retries++;phase='pending';return send({ok:true});}
  if(path.endsWith('/learning/task-completion')){const body=req.postDataJSON();assert.equal(body.taskId,id);assert.equal(body.token,'a'.repeat(64));completed=body.completed;return send({completed});}
  throw Error('Unexpected mocked API '+path);
 });
 await page.goto(base+'/?studyDate='+date,{waitUntil:'networkidle'});
 const row=()=>page.locator('.hw-home-summary tbody tr').filter({hasText:rowTitle()});
 await row().getByRole('button',{name:'修改英语练习',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'修改备忘录清单',exact:true});
 await editor.getByLabel('作业名称',{exact:true}).fill('英语练习（除默写部分）');
 await editor.getByRole('button',{name:'保存并重新整理',exact:true}).click();await editor.waitFor({state:'hidden'});
 await row().getByText('重新检查中',{exact:true}).waitFor();
 assert.equal(await row().getByText('已做完',{exact:true}).count(),0);
 assert.equal(await row().getByText('新照片整理中',{exact:true}).count(),0);
 await row().getByText('按新要求检查中',{exact:true}).waitFor();
 await page.locator('.hw-home-summary tbody tr').filter({hasText:'数学P75'}).getByText('已做完',{exact:true}).waitFor();
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:output+`/memo-recheck-${width}.png`});
 }
 phase='failed';await page.reload();await row().getByText('待重试',{exact:true}).waitFor();
 await page.getByRole('button',{name:'重新检查',exact:true}).click();
 await row().getByText('重新检查中',{exact:true}).waitFor();assert.equal(retries,1);
 phase='finished';await page.reload();await row().getByText('已做完',{exact:true}).waitFor();
 await row().getByRole('button',{name:`修改${entry.title}`,exact:true}).click();
 await editor.getByLabel('作业名称',{exact:true}).fill('朗读课文');
 await editor.getByLabel('作业具体要求',{exact:true}).fill('朗读课文三遍，无需提交书面。');
 await editor.getByLabel('作业形式',{exact:true}).selectOption('oral');
 await editor.getByRole('button',{name:'保存并重新整理',exact:true}).click();await editor.waitFor({state:'hidden'});
 await row().getByRole('button',{name:'确认朗读课文完成',exact:true}).click();
 await row().getByText('已完成（手动）',{exact:true}).waitFor();assert.equal(completed,true);
 assert.deepEqual(errors,[]);
 console.log('MEMO_RECHECK_UI_OK=true immediate-title,pending-not-old-done,correct-spinner-wording,other-subject-preserved,failed-original-photo-retry,nonwritten-confirm-during-recheck,320-390-768-1280');
}finally{await browser.close();}
