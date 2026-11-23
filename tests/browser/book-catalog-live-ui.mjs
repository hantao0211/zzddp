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
const errors=[],browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
const title=process.env.SMOKE_CATALOG_TITLE,isbn=process.env.SMOKE_CATALOG_ISBN;assert.ok(title&&isbn);
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.on('pageerror',e=>errors.push(e.message));let created;
 await page.route('**/assistant-api/**',async route=>{
  const path=new URL(route.request().url()).pathname,send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer});
  if(path.endsWith('/reading/state'))return send(state());
  if(path.endsWith('/learning/state'))return send({date:'2026-11-23',status:'empty',pending:false,note:'',dates:[],quota:{calls:0,limit:100},uploads:[],report:null});
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/reading/lookup')||path.endsWith('/reading/books')){
   const response=await route.fetch({url:'http://127.0.0.1:3106'+path});assert.equal(response.status(),200);const data=await response.json();
   if(path.endsWith('/lookup')){assert.equal(data.status,'found');assert.ok(data.items.length>0);assert.ok(data.items.every(b=>b.id.startsWith('xinhua_')&&b.sourceUrl.startsWith('https://item.xhsd.com/items/')));}
   else created=data;
   return route.fulfill({response});
  }
  throw Error('Unexpected catalog QA API '+path);
 });
 await page.goto(base+'/reading/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'添加书籍',exact:true}).click();const dialog=page.locator('dialog.reading-dialog');await dialog.locator('.reading-catalog > summary').click();
 await dialog.getByLabel('书名或ISBN',{exact:true}).fill(title);await dialog.getByRole('button',{name:'查找',exact:true}).click();await dialog.locator('.reading-search-results button').first().waitFor();assert.ok((await dialog.locator('.reading-search-results').textContent()).includes('魔法石'));await page.screenshot({path:output+'/xinhua-title-390.png'});
 await dialog.getByLabel('书名或ISBN',{exact:true}).fill(isbn);await dialog.getByRole('button',{name:'查找',exact:true}).click();await dialog.locator('.reading-search-results button').first().click();await dialog.getByRole('status').filter({hasText:'这是套装书目'}).waitFor();assert.equal(await dialog.getByLabel('总页数（选填）',{exact:true}).inputValue(),'');await page.screenshot({path:output+'/xinhua-set-390.png'});
 await dialog.getByRole('button',{name:'加入我的书架',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(created.isbn,isbn);assert.equal(created.totalPages,null);assert.ok(created.sourceUrl.startsWith('https://item.xhsd.com/items/'));assert.deepEqual(errors,[]);
 console.log('PUBLIC_CATALOG_LIVE_UI_OK=true actual-title-and-isbn-search,source-bound-metadata,collection-note,add-to-isolated-qa-shelf,no-family-records-or-AI-used');
}finally{await browser.close();}
