// Visual review with invented fixtures only. No real family API writes or AI.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href),base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;
assert.ok(base&&/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base),'Use an isolated loopback QA server');await mkdir(output,{recursive:true});
const schemes=process.env.SMOKE_COLOR_SCHEME?[process.env.SMOKE_COLOR_SCHEME]:['light','dark'];assert.ok(schemes.every(s=>s==='light'||s==='dark'));
const engine=process.env.SMOKE_BROWSER==='webkit'?webkit:chromium,browser=await engine.launch({headless:true,args:engine===chromium?['--no-sandbox']:[]});
const viewer={id:'11111111-1111-4111-8111-111111111111',username:'synthetic-parent',name:'模拟家长',role:'parent'},id='22222222-2222-4222-8222-222222222222';
const book={id,title:'森林里的小小邮局',author:'模拟作者',isbn:'',publisher:'',totalPages:200,revision:'a'.repeat(64),lastReadPage:48,finished:false,minutes:25,uniquePages:22,logCount:1};
const reward=(id,title,cost,icon,extra={})=>({id,title,cost,icon,description:'这是虚构的奖励约定，和家长一起安排。',active:true,expiresOn:'2027-01-06',useDays:45,offerDays:45,kind:'fixed',version:1,revision:'a'.repeat(64),valueCents:null,rateCents:200,monthlyBudgetCents:null,monthLimit:null,yearLimit:null,...extra});
const data={today:'2026-11-24',viewer,books:[book,{...book,id:'55555555-5555-4555-8555-555555555555',title:'星星和月亮的故事',lastReadPage:15,uniquePages:15,author:'另一位模拟作者'}],logs:[{id:'33333333-3333-4333-8333-333333333333',version:1,bookId:id,date:'2026-11-23',startPage:27,endPage:48,minutes:25,summary:'小兔子第一次送信，和朋友一起找到了收信人。',chapter:'',reflection:'遇到困难时可以向朋友求助。',excerpt:'',imageId:null,reviewStatus:'done',canEdit:true,review:{summaryFeedback:'你说清楚了小兔子遇到的问题和解决办法。',strengths:['说出了故事的主要经过。'],nextStep:'下次可以再说说你最喜欢哪一段。',followUpQuestion:'',expression:'clear',comparison:'insufficient_evidence',comparisonReason:'没有提供原文，未核对故事细节。',evidenceQuote:'',evidenceReadable:true,basis:'none',timingNote:'不根据时长判断认真程度。'}}],rules:{dailyPoints:1,backfillCounts:false,milestones:[{days:3,points:1},{days:7,points:2},{days:14,points:5},{days:30,points:10}]},stats:{days:7,minutes:175,pages:98,currentStreak:7,bestStreak:7,booksFinished:0},growth:{balance:38,earned:48,ledger:[{id:'step1',date:'2026-11-23',points:1,label:'阅读打卡',kind:'daily'},{id:'step2',date:'2026-11-23',points:5,label:'羽毛球课程',kind:'activity'}]},wishes:[{id:'44444444-4444-4444-8444-444444444444',title:'一起去郊外野餐',description:'想找一个晴天，带着小点心去看花。',actorId:viewer.id,status:'pending',rewardId:null,note:'',canWithdraw:true}],rewards:[reward('shopping','日常购物卡',1,'shopping',{kind:'shopping',monthlyBudgetCents:10000,usage:{remainingCents:10000}}),reward('disney','迪士尼购物卡',30,'castle',{valueCents:35000,monthLimit:1}),reward('dinner','一起吃大餐',30,'meal'),reward('movie','一起看电影',10,'movie',{valueCents:5000,yearLimit:5})],redemptions:[],calendar:[{date:'2026-11-23',minutes:25,backfilled:false}],reviewBudget:{used:1,limit:20},homeworkRewardRules:{dailyPoints:1},hasMore:false,activities:{startOn:'2026-11-01',claims:[],rules:[{key:'english-reading',title:'英语课外阅读',points:1,enabled:true},{key:'housework',title:'帮助做家务',points:1,enabled:true},{key:'badminton',title:'羽毛球课程',points:5,enabled:true},{key:'english-class',title:'英语线上课',points:5,enabled:true}]},studentProfile:{grade:4,semester:1,region:'模拟地区',school:'模拟小学',revision:'b'.repeat(64),textbooks:{语文:{version:'模拟语文教材',scope:'第一单元'},数学:{version:'模拟数学教材',scope:'第一单元'},英语:{version:'模拟英语教材',scope:'第一单元'}}}};

data.logs[0].bookStreak=3;
const records=Array.from({length:12},(_,i)=>({...data.logs[0],id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,date:i<10?'2026-11-23':'2026-11-21',bookStreak:i===0?3:i===1?1:i===10?10:2,summary:`第${i+1}次虚构阅读。`}));
const queries=[],writes=[],errors=[];
try {
 const page=await browser.newPage({isMobile:true,hasTouch:true,viewport:{width:390,height:900},ignoreHTTPSErrors:true});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assistant-api/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname,send=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
  if(req.method()!=='GET'){writes.push(path);throw Error('No family writes permitted');}
  if(path.endsWith('/status'))return send({authenticated:true,accounts:true,available:true,viewer});
  if(path.endsWith('/reading/state'))return send(data);
  if(path.endsWith('/reading/logs')){const offset=Number(url.searchParams.get('offset')||0);queries.push(url.searchParams.toString());return send({items:records.slice(offset,offset+10),total:records.length});}
  if(path.endsWith('/learning/state'))return send({date:data.today,status:'empty',pending:false,dates:[],uploads:[],report:null,quota:{calls:0,limit:100}});
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/homework-context'))return send({date:data.today,revision:1,hasMaterials:false,pending:false,entries:[],uncertainties:[],familyNotes:[],availableDates:[]});
  throw Error('Unexpected endpoint '+path);
 });
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.locator('.journal-garden h2').waitFor();
 const navigate=async(index,width)=>{const target=page.locator(width<900?'.study-bottom-nav:visible .study-nav-item':'.study-sidebar:visible nav .study-nav-item').nth(index);if(width<900)await target.tap();else await target.click();try{await page.waitForFunction(title=>[...document.querySelectorAll('.hw-simple-heading h1,.reading-heading h1')].some(el=>el.getBoundingClientRect().width>0&&el.textContent===title),titles[index],{timeout:10000});}catch(e){await page.screenshot({path:output+'/navigation-failure.png'});console.log('NAVIGATION_FAILURE',width,index,await page.evaluate(()=>({url:location.href,titles:[...document.querySelectorAll('h1')].map(el=>({text:el.textContent,visible:el.getBoundingClientRect().width>0})),navigation:[...document.querySelectorAll('.study-nav-item[aria-current]')].map(el=>el.textContent)})));throw e;}};
 const titles=['我的课业手账','我的阅读手帐','我的小脚步','我的心愿商城'];
 for(const scheme of schemes){await page.emulateMedia({colorScheme:scheme});for(const width of [320,359,360,374,390,428,600,768,899,900,1280]){
  await page.setViewportSize({width,height:900});const headingStyles=[];
  for(let index=0;index<4;index++){
   await navigate(index,width);const heading=page.locator(index===0?'.hw-simple-heading h1':'.reading-heading h1');assert.equal(await heading.innerText(),titles[index]);
   headingStyles.push(await heading.evaluate(el=>{const s=getComputedStyle(el);return [s.fontSize,s.fontWeight,s.lineHeight,s.letterSpacing];}));
   assert.equal(headingStyles[index][0],width<=359?'21px':width<=600?'24px':'27px');
   const brand=page.locator(width<900?'.study-brand-mobile:visible':'.study-sidebar:visible .study-brand');assert.equal(await brand.evaluate(el=>getComputedStyle(el).fontSize),width<=360?'18px':width<900?'20px':'21px');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`page overflow ${width} ${index}`);
   if(width<900){const a=await brand.boundingBox(),b=await page.locator('.study-topbar-actions:visible').boundingBox();assert.ok(a.x+a.width<=b.x+1,`brand/tools overlap ${width} ${index}`);}
   if(index===1){
    const badge=page.locator('.reading-record-heading > .reading-book-streak').first();assert.equal(await badge.innerText(),'连读3天');assert.ok((await badge.getAttribute('aria-label')).includes('2026-11-23'));
    assert.equal(await page.locator('.reading-heading .reading-streak').innerText(),'连续7天'); // Global and per-book counts are distinct.
    const rect=await badge.boundingBox();assert.ok(rect.width>60&&rect.height<32);assert.equal(await badge.locator('svg').count(),1);
    const contrast=await badge.evaluate(el=>{const s=getComputedStyle(el),rgb=x=>x.match(/[\d.]+/g).slice(0,3).map(Number),lum=v=>v.map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0),a=lum(rgb(s.color)),b=lum(rgb(s.backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});assert.ok(contrast>=4.5,`badge contrast ${contrast}`);
    if(width===390||width===320||width===1280){await heading.scrollIntoViewIfNeeded();await page.screenshot({path:output+`/reading-${scheme}-${width}.png`});await page.locator(".reading-record-heading").first().screenshot({path:output+`/recent-${scheme}-${width}.png`});}
   }
   if(index===0&&(width===390||width===320||width===1280)){await heading.scrollIntoViewIfNeeded();await page.screenshot({path:output+`/home-${scheme}-${width}.png`});}
  }
  assert.ok(headingStyles.every(s=>JSON.stringify(s)===JSON.stringify(headingStyles[0])),`title mismatch ${width}`);
 }}
 await page.setViewportSize({width:390,height:900});await navigate(1,390);
 const history=page.locator('.reading-history');await history.locator(':scope > summary').click();await history.locator('.reading-history-entry').first().waitFor();
 assert.equal(await history.locator('.reading-history-entry').count(),10);assert.equal(await history.locator('.reading-record').count(),0);
 assert.equal(await history.locator('.reading-history-meta .reading-book-streak').first().innerText(),'连读3天');assert.equal(await history.locator('.reading-history-meta .status-indicator').first().innerText(),'已打卡');
 await history.locator('.reading-history-entry > summary').first().click();await history.locator('.reading-record').waitFor();assert.equal(await history.locator('.reading-record-heading > .reading-book-streak').innerText(),'连读3天');
 await history.locator('.reading-history-entry > summary').nth(1).click();await history.locator('.reading-record-heading > .status-indicator').waitFor();assert.equal(await history.locator('.reading-record').count(),1);
 await history.getByRole('button',{name:'下一页',exact:true}).click();await history.getByText('共12条阅读记录 · 第2/2页',{exact:true}).waitFor();assert.equal(await history.locator('.reading-history-entry').count(),2);assert.equal(await history.locator('.reading-record').count(),0);assert.equal(await history.locator('.reading-history-meta .reading-book-streak').first().innerText(),'连读10天');
 for(const scheme of schemes){await page.emulateMedia({colorScheme:scheme});for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});await history.locator('.reading-history-entry').first().scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+`/history-${scheme}-${width}.png`});}}
 assert.ok(queries.some(q=>q.includes('offset=10')));assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log('BOOK_STREAK_TITLES_OK=true full-history-badge,first-day,as-of-date,paging,lazy-details,global-count-distinct,unified-titles,larger-brand,no-overflow,light-dark-320-359-360-374-390-428-600-768-899-900-1280,no-writes');
}finally{await browser.close();}
