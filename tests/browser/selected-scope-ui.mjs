// Synthetic finished checks only. Every API is mocked; images are generated one-pixel fixtures.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base?.endsWith(':3443'));await mkdir(output,{recursive:true});
const date='2026-11-20',titles=['课外英语习题（除默写部分）','课外默写单词16个'],ev=fileId=>({fileId,page:1,excerpt:'模拟作答'});
const tasks=titles.map((title,i)=>({id:`memo:task:${i}`,subject:'英语',title,requirement:i?'默写16个单词':'完成本次英语习题',format:i?'other':'written',coverage:'complete',missing:[],memoEvidence:[],reviewActivity:null,evidence:[ev(`task-${i}-a`),ev(`task-${i}-b`)],selectedSubmission:{version:'selected-destination-v1',pageIds:[`task-${i}-a`,`task-${i}-b`],note:'已按指定作业接收。'},writtenCompletion:{version:'written-v2',status:'done',reason:'对应范围的作答均已填写，答案对错另看批改。',parts:Array.from({length:i?16:22},(_,n)=>({label:`第${n+1}项`,status:'answered',evidence:ev(`task-${i}-${n%2?'b':'a'}`)}))}}));
const uploads=[{id:'memo',date,kind:'memo',status:'processed',subjects:['英语'],files:[],createdAt:'',note:'',issues:[]},...tasks.map((task,i)=>({id:`work-${i}`,date,kind:'homework',status:'processed',subjects:['英语'],createdAt:'',note:'',issues:[],files:['a','b'].map(part=>({id:`file-${i}-${part}`,name:'synthetic.png',size:1,stored:true,pages:[{id:`task-${i}-${part}`,number:1}]}))}))];
const errors=[],writes=[],browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.on('pageerror',e=>errors.push(e.message));await page.route('**/assistant-api/**',route=>{
  const req=route.request(),path=new URL(req.url()).pathname;if(req.method()!=='GET')writes.push(path);const send=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer:{id:'11111111-1111-4111-8111-111111111111',name:'模拟孩子',role:'child',username:'qa'}});
  if(path.endsWith('/reading/state'))return send(null);
  if(path.includes('/learning/pages/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA5sAAAAASUVORK5CYII=','base64')});
  if(path.endsWith('/learning/state'))return send({date,status:'processed',pending:false,note:'',writtenCompletionEnabled:true,dates:[date],quota:{calls:100,limit:100},uploads,report:{date,memoId:'memo',updatedAt:'',tasks,unclassified:[],unassigned:[],uncertainties:[],familyNotes:[]}});
  throw Error('Unexpected mock '+path);
 });
 await page.goto(base+'/?studyDate='+date,{waitUntil:'networkidle'});
 const summary=page.getByRole('region',{name:'作业概况'});await summary.getByText('已做完',{exact:true}).first().waitFor();assert.equal(await summary.getByText('已收到',{exact:true}).count(),2);assert.equal(await summary.getByText('已做完',{exact:true}).count(),2);assert.equal(await summary.getByRole('button',{name:/上传作业$/}).count(),0);
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/selected-scope-home-${width}.png`});}
 for(const title of titles){await page.getByRole('button',{name:`查看${title}的完成情况`,exact:true}).click();const dialog=page.getByRole('dialog',{name:'这项作业的情况',exact:true});await dialog.getByRole('region',{name:'这项作业对应的照片'}).getByRole('img').first().waitFor();assert.equal(await dialog.getByRole('region',{name:'这项作业对应的照片'}).getByRole('img').count(),2);assert.equal(await dialog.locator('.task-status-concerns').count(),0);assert.doesNotMatch(await dialog.innerText(),/对应待确认|AI未判清|U7/);await dialog.getByRole('button',{name:'关闭',exact:true}).click();}
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);console.log('SELECTED_SCOPE_UI_OK=true both-received-and-done,two-photos-each,no-unrelated-U7-concerns,no-upload-request,exhausted-quota-does-not-hide-existing-checks,320-390-768-1280,no-writes');
}finally{await browser.close();}
