// Synthetic book and reading log only. No production writes, catalog requests or AI calls.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base?.endsWith(':3443'));await mkdir(output,{recursive:true});
const viewer={id:'11111111-1111-4111-8111-111111111111',name:'模拟孩子',username:'qa-child',role:'child'},bookId='22222222-2222-4222-8222-222222222222';
let book={id:bookId,revision:'a'.repeat(64),title:'模拟书名（待更正）',author:'模拟作者',publisher:'模拟出版社',isbn:'',totalPages:241,catalogId:null,description:'',sourceUrl:null,createdAt:'2026-11-22T00:00:00Z',finished:false,uniquePages:22,minutes:25,logCount:1};
const log={id:'33333333-3333-4333-8333-333333333333',bookId,version:1,date:'2026-11-22',startPage:27,endPage:48,minutes:25,summary:'人物遇到困难后，和朋友一起想办法。',chapter:'',reflection:'',excerpt:'',imageId:null,actorId:viewer.id,backfilled:false,createdAt:'',updatedAt:'',reviewStatus:'done',canEdit:true,review:{summaryFeedback:'你把遇到的事情说明白了。',strengths:[],nextStep:'',followUpQuestion:'',expression:'clear',comparison:'insufficient_evidence',comparisonReason:'仅评价你的概括。',evidenceQuote:'',evidenceReadable:false,basis:'none',timingNote:'时长是阅读记录。'}};
const state=()=>({today:'2026-11-23',viewer,books:[book],logs:[log],rules:{dailyPoints:2,backfillCounts:false,milestones:[]},stats:{days:1,minutes:25,pages:22,currentStreak:1,bestStreak:1,booksFinished:0},growth:{balance:2,earned:2,ledger:[]},wishes:[],rewards:[],redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false});
const lookups=[],created=[],errors=[],browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
let mode='unavailable';
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assistant-api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer});
  if(path.endsWith('/reading/state'))return send(state());
  if(path.endsWith('/learning/state'))return send({date:'2026-11-23',status:'empty',pending:false,note:'',dates:[],quota:{calls:0,limit:100},uploads:[],report:null});
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/reading/lookup')){
   lookups.push(req.postDataJSON());await new Promise(r=>setTimeout(r,200));
   if(mode==='unavailable')return send({items:[],status:mode,note:'暂时连不上图书资料服务，已尝试备用来源。可稍后重试，或直接填写下方书名添加。'});
   if(mode==='not_found')return send({items:[],status:mode,note:'暂没查到这本书，试试完整书名，或直接填写下方书名添加。'});
   return send({items:[{id:'ol_work_OL123W',title:'模拟查到的书',author:'模拟作者',isbn:'',publisher:'',totalPages:null,description:'',sourceUrl:'https://openlibrary.org/works/OL123W'}],status:'found',note:'选一本填入，再核对版本；留空的信息可以自己补充。'});
  }
  if(path.endsWith('/reading/books')&&req.method()==='POST'){created.push(req.postDataJSON());return send({...book,...req.postDataJSON()});}
  throw Error('Unexpected mocked API '+path);
 });
 await page.goto(base+'/reading/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'添加书籍',exact:true}).click();
 const dialog=page.locator('dialog.reading-dialog');await dialog.waitFor();await dialog.locator('.reading-catalog > summary').click();const query=dialog.getByLabel('书名或ISBN',{exact:true});
 await query.fill('01-2024-1017');await dialog.getByRole('button',{name:'查找',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'未通过ISBN校验'}).waitFor();assert.equal(lookups.length,0);
 await query.fill('模拟书名');await dialog.getByRole('button',{name:'查找',exact:true}).click();await dialog.getByRole('button',{name:'正在查找…',exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:'加入我的书架',exact:true}).isDisabled(),false);await dialog.getByRole('status').filter({hasText:'已尝试备用来源'}).waitFor();
 mode='not_found';await dialog.getByRole('button',{name:'查找',exact:true}).click();await dialog.getByRole('status').filter({hasText:'暂没查到'}).waitFor();
 mode='found';await dialog.getByRole('button',{name:'查找',exact:true}).click();await dialog.locator('.reading-search-results button').click();assert.equal(await dialog.getByLabel('书名',{exact:true}).inputValue(),'模拟查到的书');assert.equal(await dialog.getByLabel('总页数（选填）',{exact:true}).inputValue(),'');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/catalog-${width}.png`});}
 // A failed subsequent search clears previous results, keeps the selected/manual book draft.
 mode='unavailable';await query.fill('其他模拟书名');await dialog.getByRole('button',{name:'查找',exact:true}).click();await dialog.getByRole('status').filter({hasText:'已尝试备用来源'}).waitFor();assert.equal(await dialog.getByLabel('书名',{exact:true}).inputValue(),'模拟查到的书');
 await dialog.getByLabel('书名',{exact:true}).fill('手动填写的模拟书名');await dialog.getByRole('button',{name:'加入我的书架',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(created.length,1);assert.equal(created[0].title,'手动填写的模拟书名');assert.equal(created[0].catalogId,null);assert.equal(lookups.length,4);assert.deepEqual(errors,[]);
 console.log('BOOK_CATALOG_UI_OK=true invalid-isbn-no-request,distinct-outage-and-empty-feedback,retry,loading-state,select-result,manual-add-after-outage,320-390-768-1280');
}finally{await browser.close();}
