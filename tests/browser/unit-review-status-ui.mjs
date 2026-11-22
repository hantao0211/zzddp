// Synthetic legacy record only. Displaying an existing trace conclusion must not start AI work.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base.endsWith(':3443'));await mkdir(output,{recursive:true});
const date='2026-11-20',concern='未写明复习页码、课文或方式，无法判断指定范围是否收齐。';
const task={id:'unit',subject:'语文',title:'复习单元六',requirement:'复习单元六，未写明具体页码或方式。',format:'other',coverage:'uncertain',missing:[concern],evidence:Array.from({length:5},(_,i)=>({fileId:'synthetic-page-'+i,page:1,excerpt:'第六单元课文及批注'+i})),memoEvidence:[],reviewActivity:{status:'marked',reason:'课文上有圈画、拼音和旁批；没有完整课后题答案。'},writtenCompletion:null};
const uploads=[{id:'work',date,kind:'homework',status:'processed',createdAt:'',note:'',subjects:['语文'],aiMs:0,issues:[],files:task.evidence.map(e=>({id:e.fileId+'-file',name:e.fileId+'.png',size:1,stored:true,pages:[{id:e.fileId,number:1}]}))}];
const errors=[],writes=[];const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA5sAAAAASUVORK5CYII=','base64');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
try{const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/assistant-api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;const send=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});if(req.method()!=='GET')writes.push(path);if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer:{id:'synthetic-child',role:'child',username:'qa',name:'模拟孩子'}});if(path.endsWith('/reading/state'))return send(null);if(path.endsWith('/learning/state'))return send({date,status:'processed',note:'',pending:false,dates:[date],uploads,report:{date,memoId:null,updatedAt:'',tasks:[task],uncertainties:[concern],unassigned:[],unclassified:[],familyNotes:[]},quota:{calls:0,limit:100},reviewPolicy:{version:'review-traces-v1',description:'按学习痕迹判断'}});if(path.includes('/learning/pages/'))return route.fulfill({contentType:'image/png',body:png});throw Error('Unexpected mock '+path);});
 await page.goto(base+'/?studyDate='+date,{waitUntil:'networkidle'});
 const row=page.locator('.hw-home-summary tbody tr');await row.getByText('已收到',{exact:true}).waitFor();await row.getByText('已做',{exact:true}).waitFor();
 await row.getByRole('button',{name:'查看复习单元六的完成情况',exact:true}).click();const dialog=page.getByRole('dialog',{name:'这项作业的情况',exact:true});
 assert.equal(await dialog.getByText('AI记录的具体疑点',{exact:true}).count(),0);assert.equal(await dialog.getByText('等匹配',{exact:true}).count(),0);assert.equal(await dialog.getByText(concern,{exact:true}).count(),0);
 await dialog.getByText('已对应照片 · 5张',{exact:true}).waitFor();await dialog.getByText(/不需要补充复习方式/).waitFor();
 await dialog.getByRole('button',{name:'展开其余1张照片',exact:true}).click();assert.equal(await dialog.getByRole('img').count(),5);
 await dialog.locator('.task-status-completion summary').click();await dialog.getByText(task.reviewActivity.reason,{exact:true}).waitFor();
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await dialog.getByRole('heading',{name:'语文 · 复习单元六',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:output+`/unit-review-${width}.png`});}
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();task.missing=['第77页未拍到'];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await row.getByText('已关联',{exact:true}).waitFor();await row.getByText('已做',{exact:true}).waitFor();await row.getByRole('button',{name:'查看复习单元六的照片情况',exact:true}).click();await dialog.getByText('第77页未拍到',{exact:true}).waitFor();
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);console.log('UNIT_REVIEW_UI_OK=true legacy-scope-only-resolved,known-trace-not-waiting,five-originals,concrete-missing-page-retained,phone-tablet-desktop,no-writes');
}finally{await browser.close();}
