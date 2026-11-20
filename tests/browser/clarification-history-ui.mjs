// Invented explanation history only; real family records and photos are never requested.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL, output=process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(':3443')); await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
const history='复七就等于复习第27课（模拟旧说明）';
const current='原文为复27，之前漏识别数字2；这是本次识字纠正，不是课号替换规则。';
try {
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const notes=date=>[{id:'old',date,entryId:'memo:entry:0',title:'复习第27课',requirement:history,userQuote:history,current:false,createdAt:''},{id:'new',date,entryId:'memo:entry:0',title:'复习第27课',requirement:current,userQuote:'孩子原文写的是复27。',current:true,createdAt:'',canUndo:true}];
 await page.route('**/assistant-api/**',async route=>{
  const url=new URL(route.request().url()), path=url.pathname,date=url.searchParams.get('date')||'2026-11-15';
  const send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(path.endsWith('/status'))return send({authenticated:true,available:true,speech:true});
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/homework-context'))return send({date,revision:2,availableDates:[date],hasMaterials:true,pending:false,status:'processed',note:'',taskCount:1,unclassifiedCount:0,entries:[],uncertainties:[],familyNotes:notes(date)});
  if(path.endsWith('/learning/state'))return send({date,status:'processed',pending:false,note:'',dates:[date],quota:{calls:0,limit:60},uploads:[{id:'memo',kind:'memo',date,createdAt:'',status:'processed',note:'模拟备忘录',subjects:['语文'],files:[{id:'file',name:'synthetic.png',size:1,stored:true,pages:[]}],issues:[]}],report:{date,memoId:'memo',updatedAt:'',familyNotes:notes(date),tasks:[{id:'t',subject:'语文',title:'复习第27课',requirement:current,format:'other',memoEvidence:[],evidence:[],coverage:'complete',missing:[],reviewActivity:{status:'marked',reason:'模拟圈画'},writtenCompletion:null}],unclassified:[],unassigned:[],uncertainties:[]}});
  throw new Error('Unexpected API '+path);
 });
 await page.goto(base,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'查看详情',exact:true}).click();
 const home=page.locator('.hw-family-notes');
 assert.ok((await home.innerText()).includes(current)); assert.ok(!(await home.innerText()).includes(history));
 await home.getByText('查看较早的说明（以当前理解为准）',{exact:true}).click(); assert.ok((await home.innerText()).includes(history));
 await home.getByText('查看较早的说明（以当前理解为准）',{exact:true}).click();
 for(const width of [320,390,768]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 }
 await page.setViewportSize({width:390,height:844}); await home.screenshot({path:output+'/current-notes.png'});
 await page.goto(base+'/?assistant=1',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'更多功能',exact:true}).click();
 await page.getByText('当前有 1 项补充说明',{exact:true}).click();
 const chat=page.locator('.assistant-saved-notes');
 assert.ok((await chat.innerText()).includes(current)); assert.ok(!(await chat.innerText()).includes(history));
 await chat.getByText('查看较早的说明（以当前理解为准）',{exact:true}).click(); assert.ok((await chat.innerText()).includes(history));
 assert.equal(await chat.getByRole('button',{name:'撤销这次说明',exact:true}).count(),1);
 assert.deepEqual(errors,[]);
 console.log('CLARIFICATION_HISTORY_UI_OK=true current-conclusion,collapsed-original-history,assistant-current-only-count,undo-retained,no-overflow');
} finally{await browser.close();}
