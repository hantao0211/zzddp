// Synthetic dictation only; no family records or model calls.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base?.endsWith(':3443'));await mkdir(output,{recursive:true});
const date='2026-11-20',title='课外默写单词16个',requests=[],errors=[];let finished=false;
const task=()=>({id:'memo:task:0',subject:'英语',title,requirement:'默写16个单词并订正',format:'other',coverage:'complete',memoEvidence:[],missing:[],evidence:['first','second'].map(fileId=>({fileId,page:1,excerpt:'模拟8个单词'})),reviewActivity:null,writtenCompletion:finished?{version:'written-v2',status:'done',reason:'两张照片16项均已填写',parts:['first','second'].flatMap(fileId=>Array.from({length:8},(_,i)=>({label:`单词${i+1}`,status:'answered',evidence:{fileId,page:1,excerpt:'模拟作答'}})))}:null});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
try{const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/assistant-api/**',route=>{
 const request=route.request(),path=new URL(request.url()).pathname;requests.push(request.method());const send=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer:{id:'11111111-1111-4111-8111-111111111111',name:'模拟孩子',username:'qa',role:'child'}});
 if(path.endsWith('/reading/state'))return send(null);
 if(path.endsWith('/learning/state'))return send({date,status:'processed',pending:false,note:'',dates:[date],writtenCompletionEnabled:true,quota:{calls:0,limit:100},uploads:[{id:'memo',date,kind:'memo',status:'processed',createdAt:'',note:'',issues:[],subjects:['英语'],files:[]},{id:'photos',date,kind:'homework',status:'processed',createdAt:'',note:'',issues:[],subjects:['英语'],files:['first','second'].map(id=>({id:id+'-file',name:'synthetic.png',stored:true,size:1,pages:[{id,number:1}]}))}],report:{date,memoId:'memo',updatedAt:'',tasks:[task()],unclassified:[],unassigned:[],uncertainties:[],familyNotes:[]}});
 if(path.includes('/learning/pages/'))return route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0kAAAAASUVORK5CYII=','base64')});
 throw Error('Unexpected mock '+path);
 });
 await page.goto(base+'/?studyDate='+date,{waitUntil:'networkidle'});const row=page.locator('.hw-home-summary tbody tr').filter({hasText:title});await row.getByText('需检查',{exact:true}).waitFor();await row.getByText('已收到',{exact:true}).waitFor();assert.equal(await row.getByRole('button',{name:`确认${title}完成`,exact:true}).count(),0);
 await row.getByRole('button',{name:`查看${title}的完成情况`,exact:true}).click();const dialog=page.getByRole('dialog',{name:'这项作业的情况',exact:true});await dialog.getByText(/对应照片整理完成后，系统会自动检查/).waitFor();await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 finished=true;await page.reload();await row.getByText('已做完',{exact:true}).waitFor();for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/dictation-other-${width}.png`});}
 assert.ok(requests.every(method=>method==='GET'));assert.deepEqual(errors,[]);console.log('DICTATION_OTHER_UI_OK=true received-two-photos,needs-check-not-unknown,no-self-confirmation,clear-check-explanation,completed-result,320-390-768-1280,no-writes');
}finally{await browser.close();}
