// Exercises the new book control against an isolated reading service.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const base=process.env.SMOKE_BASE_URL, directory=process.env.READING_QA_DIRECTORY;
assert.equal(base,"https://127.0.0.1:3443");
assert.ok(directory.endsWith("/xiaobu-reading-qa"));
const engines=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const browser=await engines[process.env.SMOKE_BROWSER].launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,colorScheme:process.env.SMOKE_COLOR_SCHEME||"light"});
 await page.goto(base+"/reading/");
 const setupCode=(await readFile(directory+"/parent-setup-code","utf8")).trim();
 const setup=await page.request.post(base+"/assistant-api/parent-setup",{headers:{Origin:base},data:{setupCode,username:"qa-parent",name:"模拟家长",password:"Synthetic-reading-2026"}});
 assert.equal(setup.status(),200);
 await page.reload();
 await page.getByRole("button",{name:"添加第一本书"}).click();
 const dialog=page.getByRole("dialog");
 await dialog.getByLabel("书名",{exact:true}).fill("书架验收");
 await dialog.getByLabel("书架状态").selectOption("wanted");
 await dialog.getByRole("button",{name:"加入我的书架"}).click();
 await dialog.waitFor({state:"hidden"});
 const library=page.locator(".reading-library");
 await library.locator("summary").click();
 const picker=library.getByRole("combobox",{name:"《书架验收》的阅读状态"});
 assert.equal(await picker.inputValue(),"wanted");
 for(const status of ["reading","finished","unread"]){
  const saved=page.waitForResponse(res=>res.url().endsWith("/status") && res.request().method()==="POST");
  await picker.selectOption(status);
  assert.equal((await saved).status(),200);
  await library.locator(".shelf-"+status).waitFor();
  assert.ok(await library.locator(".reading-shelf-status > svg").first().isVisible());
  await page.reload();
  await library.locator("summary").click();
  assert.equal(await picker.inputValue(),status);
 }
 const snapshot=await (await page.request.get(base+"/assistant-api/reading/state")).json();
 const log=await page.request.post(base+"/assistant-api/reading/logs",{headers:{Origin:base},data:{
  id:"01234567-89ab-4def-8123-456789abcdef",version:0,bookId:snapshot.books[0].id,date:snapshot.today,
  startPage:1,endPage:2,minutes:5,summary:"小主人公出发去看大海。"
 }});
 assert.equal(log.status(),200);
 await page.reload();
 await library.locator("summary").click();
 assert.equal(await picker.inputValue(),"reading");
 await picker.scrollIntoViewIfNeeded();
 assert.ok(await picker.evaluate(el=>{
  const box=el.getBoundingClientRect();
  return el===document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
 }));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log("READING_SHELF_OK",process.env.SMOKE_BROWSER);
} finally {await browser.close();}
