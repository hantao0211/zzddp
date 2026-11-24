// Synthetic files and API responses only; never upload to the production data service.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;
assert.ok(base.endsWith(':3443'));await mkdir(output,{recursive:true});
const date='2026-11-20',viewer={id:'11111111-1111-4111-8111-111111111111',name:'模拟孩子',role:'child',username:'qa'};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA5sAAAAASUVORK5CYII=','base64');
const task=(id,title)=>({id,subject:'数学',title,requirement:'完成'+title,format:'written',memoEvidence:[],evidence:[],missing:[],coverage:'none',writtenCompletion:null,reviewActivity:null});
const oralTask={...task('memo:task:2','背诵P55–56'),subject:'英语',format:'oral',completionToken:'a'.repeat(64),selfCompletion:{confirmedBy:viewer.name,confirmedAt:date+'T02:00:00Z',role:'child'}};
const tasks=[task('memo:task:0','数学P74'),task('memo:task:1','数学P75'),oralTask];
const taskScopeSources={[tasks[0].id]:{kind:'task',id:tasks[0].id,date,title:tasks[0].title,scope:'extracurricular',confirmed:true}};
const records=[{id:'memo',date,kind:'memo',createdAt:'',status:'processed',subjects:['数学'],note:'',aiMs:0,issues:[],files:[{id:'memo-file',name:'memo.png',size:png.length,stored:true,pages:[]}]}];
let pending=false,targetId=null,rejectNext=false;const submitted=[],errors=[];
const engine=process.env.SMOKE_BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true,args:engine===chromium?['--no-sandbox']:[]});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,colorScheme:process.env.SMOKE_COLOR_SCHEME||'light'});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assistant-api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,send=v=>route.fulfill({contentType:'application/json',body:JSON.stringify(v)});
  if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer});
  if(path.endsWith('/practice/exams'))return send({items:[],total:0,stage:{grade:4,semester:1}});
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/homework-context'))return send({date,entries:[],uncertainties:[],familyNotes:[]});
  if(path.endsWith('/reading/state'))return send(null);
  if(path.endsWith('/learning/state'))return send({date,pending,status:pending?'queued':'processed',note:'',dates:[date],writtenCompletionEnabled:true,quota:{calls:0,limit:60},processing:pending?{subjects:[],taskIds:targetId?[targetId]:[],memo:false,unclassified:!targetId,retrying:false}:undefined,uploads:records,taskScopeSources,report:{date,memoId:'memo',tasks,updatedAt:'',familyNotes:[],unclassified:[],unassigned:[],uncertainties:[]}});
  if(path.endsWith('/learning/uploads')){
   const input=request.postDataJSON();submitted.push(input);
   if(rejectNext){rejectNext=false;return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'作业清单已更新，请刷新后从对应作业上传。照片尚未提交。'})});}
   const id='synthetic-'+submitted.length,target=tasks.find(t=>t.id===input.targetTaskId);
   const upload={id,date,kind:input.kind,status:'uploading',createdAt:'',note:'',subjects:[],issues:[],aiMs:0,...(target?{target:{taskId:target.id,subject:target.subject,title:target.title,requirement:target.requirement,format:target.format}}:{}),files:input.files.map((f,i)=>({...f,id:id+'-file-'+i,stored:false,pages:[]}))};records.push(upload);return send(upload);
  }
  if(path.includes('/learning/files/')&&request.method()==='PUT'){for(const u of records)for(const f of u.files)if(path.endsWith(f.id))f.stored=true;return send({stored:true});}
  if(path.endsWith('/optional-page'))return route.fulfill({contentType:'image/png',body:png});
  const finish=path.match(/\/uploads\/([^/]+)\/finish$/);
  if(finish){
   const upload=records.find(record=>record.id===finish[1]);
   targetId=upload.target?.taskId??null;
   pending=targetId!==oralTask.id;
   upload.status=pending?'queued':'processed';
   if(targetId===oralTask.id){
    upload.files[0].pages=[{id:'optional-page',number:1}];
    oralTask.evidence=[{fileId:'optional-page',page:1,excerpt:'模拟背诵材料'}];
   }
   return send(upload);
  }
  throw Error('Unexpected mocked request '+path);
 });
 await page.goto(base+'/?studyDate='+date,{waitUntil:'networkidle'});
 const rows=page.locator('.hw-home-summary tbody tr');await rows.first().waitFor();
 async function choose(button,name){const chooser=page.waitForEvent('filechooser');await button.click();await(await chooser).setFiles({name,mimeType:'image/png',buffer:png});return page.getByRole('dialog',{name:'交作业',exact:true});}
 // Optional photos have a direct picker even after manual completion.
 const oralRow=rows.filter({hasText:oralTask.title});
 const optionalButton=oralRow.getByRole('button',{name:'为背诵P55–56选传照片',exact:true});
 for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});
   const fits=await optionalButton.evaluate(el=>el.getBoundingClientRect().right<=el.closest('td').getBoundingClientRect().right+1 && el.scrollWidth<=el.clientWidth+1);
   assert.ok(fits,'optional photo button must fit at '+width);
 }
 await page.setViewportSize({width:390,height:844});
 await oralRow.getByText('已完成（手动）',{exact:true}).waitFor();
 await page.locator('.hw-home-summary').screenshot({path:output+'/optional-home.png'});
 const optionalDialog=await choose(optionalButton,'oral.png');
 await optionalDialog.getByText('交到：英语 · 背诵P55–56',{exact:true}).waitFor();
 await optionalDialog.getByRole('button',{name:'确认上传',exact:true}).click();
 await optionalDialog.waitFor({state:'hidden'});
 assert.equal(submitted.at(-1).targetTaskId,oralTask.id);
 assert.ok(records.at(-1).files[0].stored);
 await oralRow.getByText('已收到1张',{exact:true}).waitFor();
 await oralRow.getByText('已完成（手动）',{exact:true}).waitFor();
 await oralRow.getByRole('button',{name:'查看背诵P55–56的完成情况'}).click();
 await page.getByRole('button',{name:'补传照片',exact:true}).click();
 await optionalDialog.getByText('交到：英语 · 背诵P55–56',{exact:true}).waitFor();
 const secondPicker=page.waitForEvent('filechooser');
 await optionalDialog.getByRole('button',{name:'选择照片',exact:true}).click();
 await (await secondPicker).setFiles({name:'extra.png',mimeType:'image/png',buffer:png});
 await optionalDialog.getByText('extra.png',{exact:false}).first().waitFor();
 await optionalDialog.getByRole('button',{name:'取消',exact:true}).click();
 assert.equal(submitted.length,1);
 // Destination is visible before sending; cancelling it must not leak into a general upload.
 let dialog=await choose(page.getByRole('button',{name:'为数学P74上传作业',exact:true}),'p74-cancel.png');
 await dialog.getByText('交到：数学 · 数学P74',{exact:true}).waitFor();await dialog.getByText('作业归属 · 课外',{exact:true}).waitFor();
 assert.equal(await dialog.getByRole('combobox',{name:'作业归属'}).count(),0);
 await dialog.getByRole('button',{name:'取消',exact:true}).click();
 dialog=await choose(page.locator('.hw-primary-actions').getByRole('button',{name:/^交作业/}),'mixed.png');
 assert.equal(await dialog.locator('.hw-upload-target').count(),0);
 const scope=dialog.getByRole('combobox',{name:'作业归属'});
 assert.equal(await scope.inputValue(),'curricular');
 await scope.selectOption('extracurricular');
 await dialog.getByRole('button',{name:'确认上传',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.equal(submitted.at(-1).targetTaskId,undefined);
 assert.equal(submitted.at(-1).scope,'extracurricular');
 // Explicit destination survives a server validation error and retry, with no silent fallback.
 dialog=await choose(page.getByRole('button',{name:'为数学P74上传作业',exact:true}),'p74.png');rejectNext=true;
 await dialog.getByRole('button',{name:'确认上传',exact:true}).click();await dialog.locator('form').getByRole('alert').waitFor();assert.equal(submitted.at(-1).targetTaskId,tasks[0].id);
 await dialog.getByRole('button',{name:'确认上传',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(submitted.at(-1).targetTaskId,tasks[0].id);
 assert.equal(submitted.at(-1).scope,undefined);
 await rows.filter({hasText:'数学P74'}).getByText('新照片整理中',{exact:true}).waitFor();assert.equal(await rows.filter({hasText:'数学P75'}).locator('.hw-row-updating').count(),0);
 // A second task is independently selectable even while the first task is processing.
 dialog=await choose(page.getByRole('button',{name:'为数学P75上传作业',exact:true}),'p75.png');await dialog.getByText('交到：数学 · 数学P75',{exact:true}).waitFor();
 assert.equal(await scope.inputValue(),'curricular');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/target-upload-${width}.png`,fullPage:true});}
 await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(errors,[]);
 console.log('TARGET_UPLOAD_UI_OK=true optional-picker,optional-receipt,manual-completion-preserved,optional-add-and-cancel,explicit-destination,ordinary-no-target,cancel-resets-target,validation-error-retry,pending-only-selected-task,next-task-available,mobile-tablet-desktop');
}finally{await browser.close();}
