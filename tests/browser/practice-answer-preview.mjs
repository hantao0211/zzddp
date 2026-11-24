// Isolated UI regression with synthetic practice data.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium, webkit } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL;
assert.equal(base, 'https://127.0.0.1:3443');
const engine = process.env.SMOKE_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch({headless:true, args:engine === chromium ? ['--no-sandbox'] : []});
const date = '2026-11-24';
const questions = Array.from({length:3}, (_, i) => ({
  id:'q' + i, question:'模拟选择题 ' + (i+1) + '\nA. first\nB. second', estimatedMinutes:5,
  answer:'核对用答案 ' + (i+1), explanation:'核对用解析 ' + (i+1)
}));
const paper = {subject:'英语', title:'模拟英语练习', questions};
const item = {id:'11111111-1111-4111-8111-111111111112', subject:paper.subject, date, status:'ready', profileLabel:'4年级上学期',
  sources:[], photos:[], rewarded:0, rewardEligible:true, paper:{...paper, questions:questions.map(({answer, explanation, ...q}) => q)}};
try {
 for (const role of ['parent','child']) {
  const page = await browser.newPage({viewport:{width:390,height:680}, hasTouch:true, isMobile:true, ignoreHTTPSErrors:true,
    colorScheme:process.env.SMOKE_COLOR_SCHEME || 'light'});
  const viewer = {role, name:'模拟账号', id:'11111111-1111-4111-8111-111111111111'};
  let answerRequests=0, downloads=0, popups=0;
  page.on('download', () => downloads++);
  page.on('popup', () => popups++);
  await page.route('**/assistant-api/**', async route => {
   const url=new URL(route.request().url()), path=url.pathname;
   const send=(value, status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
   if(path.endsWith('/document')) {
    answerRequests++;
    assert.equal(url.searchParams.get('answers'),'1');assert.equal(url.searchParams.get('format'),'json');
    if(role==='child') return send({error:'需要家长账号'},403);
    if(answerRequests===1) return send({error:'模拟读取失败'},503);
    return send(paper);
   }
   if(path.endsWith('/status')) return send({authenticated:true,available:true,accounts:true,viewer});
   if(path.endsWith('/practice/state')) return send({today:date,viewer,profile:{grade:4,semester:1},subjects:[{subject:'英语',curricular:1,unknown:0,rewardEligible:true}],items:[item]});
   if(path.endsWith('/learning/state')) return send({date,dates:[date],pending:false,status:'idle',quota:{calls:0,limit:100},uploads:[],report:null});
   if(path.endsWith('/practice/exams')) return send({items:[],total:0,stage:{grade:4,semester:1}});
   return send({items:[]});
  });
  await page.goto(base+'/?studyDate='+date);
  await page.getByRole('button',{name:/15分钟小练习/}).first().click();
  await page.getByRole('button',{name:'打开今日练习'}).click();
  const entry=page.getByRole('button',{name:'查看参考答案',exact:true});
  assert.equal(answerRequests,0);
  if(role==='child') {
   assert.equal(await entry.count(),0);
   assert.equal(await page.getByText('核对用答案 1',{exact:false}).count(),0);
  } else {
   await entry.click();
   const preview=page.getByRole('dialog',{name:'参考答案预览'});
   await preview.getByRole('alert').waitFor();
   assert.equal(await preview.getByRole('button',{name:'打印／另存PDF'}).isEnabled(),false);
   await preview.getByRole('button',{name:'重新加载答案'}).click();
   await preview.getByText('核对用答案 1',{exact:false}).last().waitFor();
   const body=preview.getByRole('region',{name:'参考答案'});
   for(const width of [320,390,1280]) {
    await page.setViewportSize({width,height:600});
    assert.equal(await body.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    await body.evaluate(el=>el.scrollTop=el.scrollHeight);
    assert.ok(await preview.getByRole('button',{name:'返回练习'}).isVisible());
   }
   assert.equal(await body.locator('article').count(),3);
   assert.ok((await body.innerText()).includes('核对用解析 3'));
   await page.emulateMedia({media:'print'});
   const print=page.locator('.practice-print-output');
   assert.ok(await print.isVisible());
   assert.ok((await print.innerText()).includes('核对用答案 3'));
   assert.equal(await page.locator('.practice-dialog').isVisible(),false);
   await page.emulateMedia({media:'screen'});
   await preview.getByRole('button',{name:'返回练习'}).click();
   assert.ok(await entry.evaluate(el=>document.activeElement===el));
   assert.equal(await page.locator('.practice-print-host').count(),0);
   await entry.click();
   await preview.getByText('核对用答案 1',{exact:false}).last().waitFor();
   await page.keyboard.press('Escape');
   await preview.waitFor({state:'hidden'});
   assert.ok(await entry.isVisible());
  }
  assert.equal(downloads,0); assert.equal(popups,0);
  await page.close();
 }
 console.log('ANSWER_PREVIEW_OK parent read, retry, print, return; child hidden; mobile and desktop');
} finally { await browser.close(); }
