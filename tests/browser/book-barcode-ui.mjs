// Synthetic book and reading log only. No production writes, catalog requests or AI calls.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR;assert.ok(base?.endsWith(':3443'));await mkdir(output,{recursive:true});
const viewer={id:'11111111-1111-4111-8111-111111111111',name:'模拟家长',role:'parent'};
const state=()=>({today:'2026-11-26',viewer,books:[],logs:[],rules:{dailyPoints:2,backfillCounts:false,milestones:[]},stats:{days:0,minutes:0,pages:0,currentStreak:0,bestStreak:0,booksFinished:0},growth:{balance:0,earned:0,ledger:[]},wishes:[],rewards:[],redemptions:[],calendar:[],reviewBudget:{used:0,limit:20},hasMore:false});
const queries=[];
const errors=[],browser=await (process.env.SMOKE_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
try{
 const page=await browser.newPage({ ignoreHTTPSErrors:true, colorScheme:process.env.SMOKE_COLOR_SCHEME || 'light',viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.on('pageerror',e=>errors.push(e.message));
 const mockApi=async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(path.endsWith('/status'))return send({authenticated:true,available:true,accounts:true,viewer});
  if(path.endsWith('/reading/state'))return send(state());
  if(path.endsWith('/learning/state'))return send({date:'2026-11-23',status:'empty',pending:false,note:'',dates:[],quota:{calls:0,limit:100},uploads:[],report:null});
  if(path.endsWith('/memories'))return send({items:[]});
  if(path.endsWith('/reading/lookup')){
    const body=req.postDataJSON();
    assert.deepEqual(Object.keys(body),["query"]);queries.push(body.query);
    return send({status:"found",note:"请选择版本",items:[{id:"sample",title:"模拟书",isbn:"9780306406157",publisher:"模拟出版社",author:"模拟作者",totalPages:100}]});
  }
  throw Error('Unexpected mocked API '+path);
 };
 await page.route('**/assistant-api/**',mockApi);
 await page.goto(base+'/reading/',{waitUntil:'networkidle'});


 await page.getByRole("button",{name:"添加第一本书"}).click();
 const dialog=page.getByRole("dialog"),photo=dialog.getByLabel("书背条码照片");
 const chooser=page.waitForEvent("filechooser");
 await dialog.getByRole("button",{name:"拍书背查 ISBN"}).click();
 assert.equal((await chooser).isMultiple(),false);
 // Synthetic EAN-13 9780306406157, including quiet zones. Also exercise a sideways photo.
 const patterns=["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
 const right=d=>patterns[d].replace(/[01]/g,n=>n==="0"?"1":"0");
 const code="9780306406157";
 const left=[...code.slice(1,7)].map((d,i)=>"LGGLGL"[i]==="L"?patterns[d]:[...right(d)].reverse().join("")).join("");
 const bars="101"+left+"01010"+[...code.slice(7)].map(right).join("")+"101";
 for(const mode of ["blank","sideways","upright"]){
   const base64=await page.evaluate(({bars,mode})=>{
     const canvas=document.createElement("canvas");canvas.width=canvas.height=480;
     const ctx=canvas.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,480,480);
     if(mode==="sideways"){ctx.translate(480,0);ctx.rotate(Math.PI/2);}
     ctx.fillStyle="black";
     if(mode!=="blank")[...bars].forEach((b,i)=>{if(b==="1")ctx.fillRect(50+i*4,200,4,70);});
     return canvas.toDataURL().split(",")[1];
   },{bars,mode});
   await photo.setInputFiles({name:"book.png",mimeType:"image/png",buffer:Buffer.from(base64,"base64")});
   if(mode==="blank"){
     await dialog.getByRole("alert").filter({hasText:"没有读到 ISBN"}).waitFor();
     assert.deepEqual(queries,[]);
   }else{
     await dialog.getByRole("button",{name:/模拟书.*模拟作者/}).click();
     assert.equal(await dialog.getByLabel("书名或ISBN",{exact:true}).inputValue(),code);
     assert.equal(await dialog.getByLabel("书名",{exact:true}).inputValue(),"模拟书");
   }
 }
 assert.deepEqual(queries,[code,code]);
 assert.deepEqual(errors,[]);
 console.log("BOOK_SCAN_OK",process.env.SMOKE_BROWSER);
} finally {await browser.close();}
