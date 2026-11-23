// Isolated mocked family settings. No production account, model calls or learning records.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base.endsWith(':3443'));await mkdir(output,{recursive:true});
let role='admin',limit=100,failNext=false;const writes=[],errors=[];
const viewer=()=>({id:'11111111-1111-4111-8111-111111111111',username:'synthetic',name:'模拟家长',role});
const usage=()=>({day:'2026-11-22',total:60,tracked:4,untracked:56,returned:2,failed:1,running:0,interrupted:1,phases:[{phase:'inspection',calls:2},{phase:'verification',calls:1},{phase:'organization',calls:1}],assignments:[{date:'2026-11-20',title:'数学 P74',calls:3,failed:1},{date:'2026-11-20',title:'当天作业',calls:1,failed:0}],recent:[{id:4,date:'2026-11-20',title:'当天作业',phase:'organization',attempt:1,startedAt:'2026-11-22T04:10:00Z',status:'interrupted',reason:''},{id:3,date:'2026-11-20',title:'数学 P74',phase:'verification',attempt:2,startedAt:'2026-11-22T04:09:00Z',status:'failed',reason:'AI返回格式无法使用'},{id:2,date:'2026-11-20',title:'数学 P74',phase:'inspection',attempt:2,startedAt:'2026-11-22T04:08:00Z',status:'returned',reason:''},{id:1,date:'2026-11-20',title:'数学 P74',phase:'inspection',attempt:1,startedAt:'2026-11-22T04:07:00Z',status:'returned',reason:''}]});
const overview=()=>({viewer:viewer(),days:[],memories:[],knowledge:{rules:[],corrections:[],history:[]},legacyAccess:false,limits:{chat:100,asr:30,tts:40},usage:{chat:0,asr:0,tts:0},day:'2026-11-22',service:{provider:'synthetic',model:'synthetic-model'},features:{autoGrading:true,writtenCompletion:true},homeworkQuota:{day:'2026-11-22',calls:60,limit},homeworkUsage:usage()});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assistant-api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,send=v=>route.fulfill({contentType:'application/json',body:JSON.stringify(v)});
  if(path.endsWith('/status'))return send({authenticated:true,accounts:true,setupRequired:false,viewer:viewer()});
  if(path.endsWith('/admin/overview'))return send(overview());
  if(path.endsWith('/admin/accounts')){assert.equal(role,'admin');return send({items:[]});}
  if(path.endsWith('/admin/homework-quota')){assert.equal(request.method(),'PATCH');assert.notEqual(role,'child');const body=request.postDataJSON();writes.push(body);assert.deepEqual(Object.keys(body),['dailyCalls']);assert.equal(typeof body.dailyCalls,'number');if(failNext){failNext=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'模拟保存暂未成功'})});}limit=body.dailyCalls;return send(overview().homeworkQuota);}
  throw Error('Unexpected synthetic endpoint '+path);
 });
 async function openSettings(){await page.goto(base+'/admin/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'家庭设置',exact:true}).click();await page.getByRole('region',{name:'作业每日AI额度',exact:true}).waitFor();}
 await openSettings();const panel=page.getByRole('region',{name:'作业每日AI额度',exact:true}),input=panel.getByLabel('每日AI调用上限',{exact:true});
 assert.equal(await input.inputValue(),'100');await panel.getByText('今天已用',{exact:false}).waitFor();
 await input.fill('0');await panel.getByRole('button',{name:'保存作业额度',exact:true}).click();assert.equal(writes.length,0,'Invalid numbers must not be sent');
 await input.fill('200');failNext=true;await panel.getByRole('button',{name:'保存作业额度',exact:true}).click();await page.getByText('模拟保存暂未成功',{exact:true}).waitFor();assert.equal(await input.inputValue(),'200');
 await panel.getByRole('button',{name:'保存作业额度',exact:true}).click();await page.getByText('已保存',{exact:true}).waitFor();assert.equal(limit,200);assert.match(await panel.innerText(),/60\s*\/\s*200/);
 role='parent';await openSettings();assert.equal(await input.inputValue(),'200');assert.equal(await page.getByRole('button',{name:'家庭账号',exact:true}).count(),0);assert.equal(await page.getByRole('heading',{name:'小助手每日额度',exact:true}).count(),0);
 await input.fill('300');await panel.getByRole('button',{name:'保存作业额度',exact:true}).click();await page.getByText('已保存',{exact:true}).waitFor();assert.equal(limit,300);
 await panel.getByText('今天的调用明细',{exact:true}).click();await panel.getByText('用在了哪些检查',{exact:true}).waitFor();assert.match(await panel.innerText(),/有 56 次旧记录/);assert.match(await panel.innerText(),/记录后的 4 次/);
 await panel.getByText('按作业查看',{exact:true}).click();await panel.getByText('数学 P74',{exact:true}).waitFor();
 await panel.getByText('最近50次调用',{exact:true}).click();await panel.getByText('AI返回格式无法使用',{exact:true}).waitFor();assert.match(await panel.innerText(),/任务第 2 轮处理/);assert.match(await panel.innerText(),/处理中断/);
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/parent-quota-${width}.png`,fullPage:true});}
 await openSettings();assert.equal(await input.inputValue(),'300');
 role='child';await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{name:'这里需要家长账号',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'家庭设置',exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('HOMEWORK_QUOTA_UI_OK=true usage-ledger,legacy-gap,phase-breakdown,assignment-breakdown,failed-and-interrupted-calls,parent-only,default-100,used-count-preserved,parent-can-edit,child-no-settings,admin-only-settings-preserved,invalid-input,error-keeps-input,refresh-persists,mobile-tablet-desktop');
}finally{await browser.close();}
