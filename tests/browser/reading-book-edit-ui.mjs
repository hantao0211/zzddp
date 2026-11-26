// Synthetic book and reading log only. No production writes, catalog requests or AI calls.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base?.endsWith(':3443'));await mkdir(output,{recursive:true});
const viewer={id:'11111111-1111-4111-8111-111111111111',name:'模拟孩子',username:'qa-child',role:'child'},bookId='22222222-2222-4222-8222-222222222222';
let book={id:bookId,revision:'a'.repeat(64),title:'模拟书名（待更正）',author:'模拟作者',publisher:'模拟出版社',isbn:'',totalPages:241,catalogId:null,description:'',sourceUrl:'https://example.org/book',createdAt:'2026-11-22T00:00:00Z',finished:false,lastReadPage:48,uniquePages:22,minutes:25,logCount:1},failNext=true,conflictNext=false;
const log={id:'33333333-3333-4333-8333-333333333333',bookId,version:1,date:'2026-11-22',startPage:27,endPage:48,minutes:25,summary:'人物遇到困难后，和朋友一起想办法。',chapter:'',reflection:'',excerpt:'',imageId:null,actorId:viewer.id,backfilled:false,createdAt:'',updatedAt:'',reviewStatus:'done',canEdit:true,review:{summaryFeedback:'你把遇到的事情说明白了。',strengths:[],nextStep:'',followUpQuestion:'',expression:'clear',comparison:'insufficient_evidence',comparisonReason:'仅评价你的概括。',evidenceQuote:'',evidenceReadable:false,basis:'none',timingNote:'时长是阅读记录。'}};
let otherBook={...book,id:'55555555-5555-4555-8555-555555555555',title:'模拟探险故事',uniquePages:0,minutes:0,logCount:0,lastReadPage:0,shelfStatus:'unread'};
const state=()=>({today:'2026-11-23',viewer,books:[book,{...book,id:'44444444-4444-4444-8444-444444444444',title:'一本有很长很长书名的探险故事',totalPages:258,shelfStatus:'finished',finished:true,uniquePages:0,minutes:0,logCount:0,lastReadPage:0},otherBook],logs:[log],rules:{dailyPoints:2,backfillCounts:false,milestones:[]},stats:{days:1,minutes:25,pages:22,currentStreak:1,bestStreak:1,booksFinished:0},growth:{balance:2,earned:2,ledger:[]},wishes:[],rewards:[],redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false});
const writes=[],errors=[],browser=await (process.env.SMOKE_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
try{
 const page=await browser.newPage({ ignoreHTTPSErrors:true, colorScheme:process.env.SMOKE_COLOR_SCHEME || 'light',viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.on('pageerror',e=>errors.push(e.message));
 const mockApi=async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(path==='/assistant-api/status')return send({authenticated:true,available:true,accounts:true,viewer});
  if(path.endsWith('/reading/state'))return send(state());
  if(path.endsWith('/learning/state'))return send({date:'2026-11-23',status:'empty',pending:false,note:'',dates:[],quota:{calls:0,limit:100},uploads:[],report:null});
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/reading/logs')&&req.method()==='POST'){
   const saved=req.postDataJSON();
   assert.equal(saved.id,log.id);assert.equal(saved.version,log.version);
   Object.assign(log,saved,{version:saved.version+1});
   return send({log,book,pointsAdded:0});
  }
  if(path.endsWith('/books/'+otherBook.id+'/status') && req.method()==='POST'){
   otherBook={...otherBook,shelfStatus:req.postDataJSON().status}; return send(otherBook);
  }
  if(path.endsWith('/books/'+bookId+'/status') && req.method()==='POST'){
   book={...book,shelfStatus:req.postDataJSON().status}; return send(book);
  }
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
 };
 await page.route('**/assistant-api/**',mockApi);
 await page.goto(base+'/reading/',{waitUntil:'networkidle'});
 const openEntry=()=>page.locator('.reading-entry-trigger').click();
 const goBack=()=>page.getByRole('button',{name:'返回手帐',exact:true}).click();
 await page.locator('.reading-current-book').getByRole('heading',{name:book.title}).waitFor();
 assert.equal(await page.locator('.reading-entry-fields').count(),0);
 await page.locator('.reading-current-book').getByText(/上次读到第 48 页/).waitFor();
 await page.screenshot({path:output+'/reading-home.png'});
 const shelfToggle=page.locator('.reading-library > summary');
 const current=page.locator('.reading-current-book');
 const mainStatus=page.getByLabel(`《${book.title}》的阅读状态`);
 const otherStatus=page.getByLabel(`《${otherBook.title}》的阅读状态`);
 await shelfToggle.click();
 await mainStatus.selectOption('wanted');
 await current.getByText('想读 · 共 241 页',{exact:true}).waitFor();
 await otherStatus.selectOption('reading');
 await current.getByRole('heading',{name:otherBook.title}).waitFor();
 await openEntry();
 assert.equal(await page.getByLabel('正在读的书',{exact:true}).inputValue(),otherBook.id);
 assert.equal(await page.getByLabel('开始页',{exact:true}).inputValue(),'1');
 await goBack();
 await mainStatus.selectOption('reading');
 await current.getByRole('heading',{name:book.title}).waitFor();
 await shelfToggle.click();
 await openEntry();
 const entry=page.getByRole('dialog',{name:'阅读打卡',exact:true});
 await entry.waitFor();
 assert.equal(Math.round((await entry.boundingBox()).height),844);
 await page.getByRole('button',{name:'开始阅读计时',exact:true}).click();
 await goBack();
 await page.getByRole('button',{name:'返回阅读计时',exact:true}).click();
 await page.getByRole('button',{name:'结束计时并计入',exact:true}).click();
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:844});
  const reading=page.locator('.reading-entry-fields');await reading.waitFor();
  const measures=await reading.evaluate(el=>{
    const rect=sel=>el.querySelector(sel).getBoundingClientRect();
    return { width:innerWidth,book:rect('select').height,date:rect('input[type=date]').height,pages:rect('input[type=number]').height,
      formToSummary:Math.round(rect('#reading-summary').top-el.getBoundingClientRect().top),textarea:rect('#reading-summary').height,
      gap:getComputedStyle(el.querySelector('.reading-pages label')).rowGap,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  console.log('FORM_DENSITY',JSON.stringify(measures));
  assert.equal(measures.overflow,false);
  assert.deepEqual([measures.book,measures.date,measures.pages],[40,40,40]);
  const picker=reading.getByRole('combobox',{name:'正在读的书'});
  assert.equal(await picker.evaluate(el=>getComputedStyle(el).appearance),'none');
  await picker.selectOption(bookId);
  assert.equal(measures.gap,'3px');
  assert.ok(measures.textarea>=72,'Summary still fits three lines');
  if(width<=390)assert.ok(measures.formToSummary<=365,'Summary is visible earlier on phones');
  if(width===390){
    const date=reading.locator('input[type=date]');
    await date.fill('2026-11-21');
    assert.equal(await date.inputValue(),'2026-11-21');
    await date.blur();
    for(const [name,field] of [['book',picker],['date',date],['start-page',reading.getByLabel('开始页',{exact:true})]]){
      const png=await field.screenshot({path:output+'/field-'+name+'.png'});
      // Measure the painted text, excluding the border and picker/spinner icons.
      const offset=await page.evaluate(async encoded=>{
        const img=new Image();
        img.src='data:image/png;base64,'+encoded;
        await img.decode();
        const canvas=document.createElement('canvas');
        canvas.width=img.width;canvas.height=img.height;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0);
        const {data}=ctx.getImageData(0,0,img.width,img.height);
        const background=(2*img.width+Math.floor(img.width/2))*4;
        const rows=[];
        for(let y=3;y<img.height-3;y++){
          for(let x=8;x<img.width-28;x++){
            const at=(y*img.width+x)*4;
            const contrast=Math.max(...[0,1,2].map(c=>Math.abs(data[at+c]-data[background+c])));
            if(contrast>75){rows.push(y);break;}
          }
        }
        return rows.length ? (rows[0]+rows[rows.length-1]-(img.height-1))/2 : null;
      },png.toString('base64'));
      console.log('FIELD_INK_CENTER',name,offset);
      assert.ok(offset!==null && Math.abs(offset)<=2.5,name+' text should be vertically centered');
    }
    await page.screenshot({path:output+'/reading-checkin.png'});
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('开始页',{exact:true}).fill('49');await page.getByLabel('结束页',{exact:true}).fill('52');await page.getByLabel('时长（分钟）',{exact:true}).fill('12');await page.locator('#reading-summary').fill('还没提交的阅读概括。');
 await goBack();
 await page.locator('.reading-library > summary').click();
 const shelf=page.locator('.reading-books');
 await shelf.getByText('全258页 · 暂无打卡',{exact:true}).waitFor();
 const picker=shelf.getByLabel(`《${book.title}》的阅读状态`);
 const gridView=page.getByRole('button',{name:'方块视图',exact:true});
 const listView=page.getByRole('button',{name:'列表视图',exact:true});
 assert.equal(await listView.getAttribute('aria-pressed'),'true');
 assert.equal(await shelf.locator('.shelf-book-icon:visible').count(),3);
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:844});
  const rows=await shelf.locator('article').evaluateAll(items=>items.map(el=>Math.round(el.getBoundingClientRect().height)));
  assert.ok(rows.every(n=>n<=92),JSON.stringify({width,rows}));
  assert.ok((await picker.boundingBox()).height>=44);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width===390)await shelf.screenshot({path:output+'/compact-shelf.png'});
  console.log('SHELF_ROWS',width,rows);
  await gridView.click();assert.equal(await gridView.getAttribute('aria-pressed'),'true');
  const [first,second]=await shelf.locator('article').evaluateAll(items=>items.map(el=>el.getBoundingClientRect().toJSON()));
  assert.ok(second.left>first.right && Math.abs(second.top-first.top)<1);
  assert.ok(first.height/first.width<1.3 && first.height/first.width>=.98,JSON.stringify(first));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const cover=shelf.locator('.shelf-book-icon').first();
  await cover.scrollIntoViewIfNeeded();
  assert.ok(await cover.evaluate(el=>{
    const r=el.getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.shelf-book-open');
  }));
  if(width===390){
    const colors=await shelf.evaluate(el=>{
      const paper=document.createElement('span');paper.style.backgroundColor='var(--journal-paper)';el.append(paper);
      const bg=node=>getComputedStyle(node).backgroundColor;
      const cards=[...el.querySelectorAll('article')].map(card=>({fill:bg(card),cover:bg(card.querySelector('.shelf-book-icon'))}));
      const page=bg(paper);paper.remove();return {page,cards};
    });
    assert.ok(colors.cards.every(card=>card.fill!==colors.page && card.fill!==card.cover));
    assert.equal(new Set(colors.cards.map(card=>card.fill)).size,3);
    await page.locator('.reading-library').screenshot({path:output+'/shelf-grid.png'});
  }
  await listView.click();
 }
 await page.setViewportSize({width:390,height:844});
 await gridView.click();
 await picker.selectOption('wanted');
 await shelf.locator('.shelf-wanted').waitFor();
 await current.getByRole('heading',{name:otherBook.title}).waitFor();
 await current.getByText('未完成的打卡 · '+book.title,{exact:true}).waitFor();
 await page.getByRole('button',{name:`修改${book.title}的书籍信息`,exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'修改书籍信息',exact:true});await dialog.waitFor();assert.equal(await dialog.getByLabel('书名',{exact:true}).inputValue(),book.title);assert.equal(await dialog.getByLabel('总页数（选填）',{exact:true}).inputValue(),'241');
 for(const field of ['书名','总页数（选填）']) assert.equal((await dialog.getByLabel(field,{exact:true}).boundingBox()).height,40);
 await dialog.getByLabel('书名',{exact:true}).fill('更正后的模拟书名');await dialog.getByLabel('总页数（选填）',{exact:true}).fill('300');
 await dialog.getByRole('button',{name:'保存书籍信息',exact:true}).click();await dialog.locator('.form-error[role=alert]').filter({hasText:'模拟网络失败'}).waitFor();assert.equal(await dialog.getByLabel('书名',{exact:true}).inputValue(),'更正后的模拟书名');
 conflictNext=true;await dialog.getByRole('button',{name:'保存书籍信息',exact:true}).click();await dialog.getByRole('button',{name:'读取最新信息，保留我的填写',exact:true}).click();
 await dialog.locator('p[role=status]').filter({hasText:'已读取最新信息，请核对后再保存。'}).waitFor();assert.equal(await dialog.getByLabel('书名',{exact:true}).inputValue(),'更正后的模拟书名');assert.equal(await dialog.getByLabel('作者（选填）',{exact:true}).inputValue(),'家长更正的作者');
 await dialog.getByText('版本信息（选填）',{exact:true}).click();assert.equal(await dialog.getByRole('link',{name:'图书资料来源'}).getAttribute('href'),'https://example.org/book');await dialog.getByLabel('出版社',{exact:true}).fill('更正后的出版社');await dialog.getByLabel('ISBN',{exact:true}).fill('9780000000002');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await dialog.boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1);await page.screenshot({path:output+`/book-edit-${width}.png`});}
 await dialog.getByRole('button',{name:'保存书籍信息',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.locator('.reading-notice').filter({hasText:'书籍信息已更新，阅读记录和小脚步都保留了。'}).waitFor();await page.locator('.reading-books').getByRole('heading',{name:book.title,exact:true}).waitFor();await page.locator('.reading-books').getByText('已记录22 / 300页 · 25分钟',{exact:true}).waitFor();assert.equal(book.id,bookId);assert.equal(book.logCount,1);
 await page.getByRole('button',{name:'继续填写',exact:true}).click();
 assert.equal(await page.getByLabel('开始页',{exact:true}).inputValue(),'49');assert.equal(await page.getByLabel('结束页',{exact:true}).inputValue(),'52');assert.equal(await page.getByLabel('时长（分钟）',{exact:true}).inputValue(),'12');assert.equal(await page.locator('#reading-summary').inputValue(),'还没提交的阅读概括。');
 await page.reload({waitUntil:'networkidle'});await page.locator('.reading-library > summary').click();assert.equal(await gridView.getAttribute('aria-pressed'),'true');await listView.click();await page.getByRole('button',{name:`修改${book.title}的书籍信息`,exact:true}).click();await dialog.getByLabel('总页数（选填）',{exact:true}).fill('40');await dialog.getByRole('button',{name:'保存书籍信息',exact:true}).click();await dialog.locator('.form-error[role=alert]').filter({hasText:'48页'}).waitFor();assert.equal(await dialog.getByLabel('总页数（选填）',{exact:true}).inputValue(),'40');await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(book.totalPages,300);
 const desktop=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}});
 await desktop.route('**/assistant-api/**',mockApi);
 await desktop.goto(base+'/reading/');
 await desktop.locator('.reading-entry-trigger').click();
 const desktopForm=desktop.locator('.reading-entry-fields');
 await desktopForm.waitFor();
 const heights=await desktopForm.locator('select,input[type=date],input[type=number]').evaluateAll(fields=>fields.map(el=>el.getBoundingClientRect().height));
 assert.deepEqual(heights,[36,36,36,36,36]);
 await desktop.route('**/assistant-api/status',route=>route.fulfill({json:{authenticated:false,setupRequired:false}}));
 await desktop.goto(base+'/admin/');
 for(const name of ['登录名','密码']) {
   const input=desktop.getByLabel(name,{exact:true});
   await input.waitFor();
   assert.equal((await input.boundingBox()).height,36);
 }
 await page.getByRole('button',{name:'修改记录',exact:true}).first().click();
 const editEntry=page.getByRole('dialog',{name:'修改阅读记录'});
 assert.equal(await editEntry.locator('#reading-summary').inputValue(),log.summary);
 assert.equal(await editEntry.getByLabel('开始页',{exact:true}).inputValue(),'27');
 await editEntry.getByLabel('时长（分钟）',{exact:true}).fill('26');
 await editEntry.getByRole('button',{name:'保存修改',exact:true}).click();
 await editEntry.getByText('阅读修改已保存',{exact:true}).waitFor();
 await goBack();
 await page.getByRole('button',{name:'再记一次阅读',exact:true}).click();
 assert.equal(await page.locator('#reading-summary').inputValue(),'');
 assert.equal(await page.getByLabel('正在读的书',{exact:true}).inputValue(),otherBook.id);
 assert.equal(await page.getByLabel('开始页',{exact:true}).inputValue(),'1');
 await desktop.close();
 assert.equal(state().growth.balance,2);assert.deepEqual(errors,[]);assert.ok(writes.length>=4);console.log('READING_BOOK_EDIT_UI_OK=true child-pencil-entry,prefilled-metadata,save-retry-keeps-draft,concurrent-edit-merges-untouched-fields,all-five-fields,progress-and-reading-draft-preserved,reload,too-small-page-error,cancel,320-390-768-1280');
}finally{await browser.close();}
