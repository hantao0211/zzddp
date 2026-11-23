// Synthetic book and reading log only. No production writes, catalog requests or AI calls.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base?.endsWith(':3443'));await mkdir(output,{recursive:true});
const viewer={id:'11111111-1111-4111-8111-111111111111',name:'模拟孩子',username:'qa-child',role:'child'},bookId='22222222-2222-4222-8222-222222222222';
let book={id:bookId,revision:'a'.repeat(64),title:'模拟书名（待更正）',author:'模拟作者',publisher:'模拟出版社',isbn:'',totalPages:241,catalogId:null,description:'',sourceUrl:null,createdAt:'2026-11-22T00:00:00Z',finished:false,uniquePages:22,minutes:25,logCount:1},failNext=true,conflictNext=false;
const log={id:'33333333-3333-4333-8333-333333333333',bookId,version:1,date:'2026-11-22',startPage:27,endPage:48,minutes:25,summary:'人物遇到困难后，和朋友一起想办法。',chapter:'',reflection:'',excerpt:'',imageId:null,actorId:viewer.id,backfilled:false,createdAt:'',updatedAt:'',reviewStatus:'done',canEdit:true,review:{summaryFeedback:'你把遇到的事情说明白了。',strengths:[],nextStep:'',followUpQuestion:'',expression:'clear',comparison:'insufficient_evidence',comparisonReason:'仅评价你的概括。',evidenceQuote:'',evidenceReadable:false,basis:'none',timingNote:'时长是阅读记录。'}};
const state=()=>({today:'2026-11-23',viewer,books:[book],logs:[log],rules:{dailyPoints:2,backfillCounts:false,milestones:[]},stats:{days:1,minutes:25,pages:22,currentStreak:1,bestStreak:1,booksFinished:0},growth:{balance:2,earned:2,ledger:[]},wishes:[],rewards:[],redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false});
const writes=[],errors=[],browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
try{
 const page=await browser.newPage({ colorScheme:process.env.SMOKE_COLOR_SCHEME || 'light',viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assistant-api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer});
  if(path.endsWith('/reading/state'))return send(state());
  if(path.endsWith('/learning/state'))return send({date:'2026-11-23',status:'empty',pending:false,note:'',dates:[],quota:{calls:0,limit:100},uploads:[],report:null});
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/books/'+bookId)){
   if(req.method()==='GET')return send(book);
   assert.equal(req.method(),'PATCH');const value=req.postDataJSON();writes.push(value);
   if(failNext){failNext=false;return send({error:'模拟网络失败，你的填写仍保留。'},503);}
   if(conflictNext){conflictNext=false;book={...book,revision:'c'.repeat(64),author:'家长更正的作者'};return send({code:'BOOK_UPDATED',error:'书籍信息刚更新过，请读取最新信息后再保存。'},409);}
   assert.equal(value.revision,book.revision);assert.ok(!('id' in value));assert.ok(!('finished' in value));
   if(value.totalPages!==null&&value.totalPages<48)return send({error:'已经记录到第48页，总页数不能少于48页。'},400);
   const {revision,...fields}=value;book={...book,...fields,revision:'d'.repeat(64)};return send(book);
  }
  throw Error('Unexpected mocked API '+path);
 });
 await page.goto(base+'/reading/',{waitUntil:'networkidle'});
 await page.getByLabel('开始页',{exact:true}).fill('49');await page.getByLabel('结束页',{exact:true}).fill('52');await page.getByLabel('时长（分钟）',{exact:true}).fill('12');await page.locator('#reading-summary').fill('还没提交的阅读概括。');
 await page.locator('.reading-library > summary').click();await page.getByRole('button',{name:`修改${book.title}的书籍信息`,exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'修改书籍信息',exact:true});await dialog.waitFor();assert.equal(await dialog.getByLabel('书名',{exact:true}).inputValue(),book.title);assert.equal(await dialog.getByLabel('总页数（选填）',{exact:true}).inputValue(),'241');
 await dialog.getByLabel('书名',{exact:true}).fill('更正后的模拟书名');await dialog.getByLabel('总页数（选填）',{exact:true}).fill('300');
 await dialog.getByRole('button',{name:'保存书籍信息',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'模拟网络失败'}).waitFor();assert.equal(await dialog.getByLabel('书名',{exact:true}).inputValue(),'更正后的模拟书名');
 conflictNext=true;await dialog.getByRole('button',{name:'保存书籍信息',exact:true}).click();await dialog.getByRole('button',{name:'读取最新信息，保留我的填写',exact:true}).click();
 await dialog.getByText('已读取最新信息，请核对后再保存。',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('书名',{exact:true}).inputValue(),'更正后的模拟书名');assert.equal(await dialog.getByLabel('作者（选填）',{exact:true}).inputValue(),'家长更正的作者');
 await dialog.getByText('版本信息（选填）',{exact:true}).click();await dialog.getByLabel('出版社',{exact:true}).fill('更正后的出版社');await dialog.getByLabel('ISBN',{exact:true}).fill('9780000000002');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await dialog.boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1);await page.screenshot({path:output+`/book-edit-${width}.png`});}
 await dialog.getByRole('button',{name:'保存书籍信息',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.getByText('书籍信息已更新，阅读记录和小脚步都保留了。',{exact:true}).waitFor();await page.locator('.reading-books').getByRole('heading',{name:book.title,exact:true}).waitFor();await page.locator('.reading-books').getByText('已记录22 / 300页 · 25分钟',{exact:true}).waitFor();assert.equal(book.id,bookId);assert.equal(book.logCount,1);
 assert.equal(await page.getByLabel('开始页',{exact:true}).inputValue(),'49');assert.equal(await page.getByLabel('结束页',{exact:true}).inputValue(),'52');assert.equal(await page.getByLabel('时长（分钟）',{exact:true}).inputValue(),'12');assert.equal(await page.locator('#reading-summary').inputValue(),'还没提交的阅读概括。');
 await page.reload({waitUntil:'networkidle'});await page.locator('.reading-library > summary').click();await page.getByRole('button',{name:`修改${book.title}的书籍信息`,exact:true}).click();await dialog.getByLabel('总页数（选填）',{exact:true}).fill('40');await dialog.getByRole('button',{name:'保存书籍信息',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'48页'}).waitFor();assert.equal(await dialog.getByLabel('总页数（选填）',{exact:true}).inputValue(),'40');await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(book.totalPages,300);
 assert.equal(state().growth.balance,2);assert.deepEqual(errors,[]);assert.ok(writes.length>=4);console.log('READING_BOOK_EDIT_UI_OK=true child-pencil-entry,prefilled-metadata,save-retry-keeps-draft,concurrent-edit-merges-untouched-fields,all-five-fields,progress-and-reading-draft-preserved,reload,too-small-page-error,cancel,320-390-768-1280');
}finally{await browser.close();}
