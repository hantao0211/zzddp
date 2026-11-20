// Real HTTP authorization against an isolated empty account database; no family files or AI.
import assert from 'node:assert/strict';
import {mkdir,readFile}from'node:fs/promises';
import {pathToFileURL}from'node:url';
const {chromium}=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base=process.env.SMOKE_BASE_URL,output=process.env.SMOKE_OUTPUT_DIR,directory=process.env.ADMIN_QA_DIRECTORY;
assert.ok(base?.endsWith(':3443'));assert.ok(directory?.endsWith('/xiaobu-admin-qa'));await mkdir(output,{recursive:true});
const setupCode=(await readFile(directory+'/parent-setup-code','utf8')).trim();
const password='Synthetic-user-2026';
function requests(page){
 const call=async(url,method='GET',options={})=>{
  const result=await page.evaluate(async({url,method,data})=>{const r=await fetch(url,{method,credentials:'same-origin',...(data===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});return{status:r.status,data:await r.json()};},{url,method,data:options.data});
  return{status:()=>result.status,json:async()=>result.data};
 };
 return{get:url=>call(url),post:(url,options)=>call(url,'POST',options),patch:(url,options)=>call(url,'PATCH',options)};
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP 14.103.24.55 127.0.0.1']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage(),errors=[];
 const api=requests(page);
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(base+'/admin/',{waitUntil:'networkidle'});
 await page.getByLabel('一次性开通码',{exact:true}).fill(setupCode);
 await page.getByLabel('家长登录名',{exact:true}).fill('aa');await page.getByLabel('称呼',{exact:true}).fill('模拟管理员');await page.getByLabel('设置密码（至少8位）',{exact:true}).fill(password);
 await page.getByRole('button',{name:'建立家长管理员账号',exact:true}).click();
 await page.getByRole('navigation',{name:'家长管理导航'}).waitFor();
 assert.equal((await api.post(base+'/assistant-api/parent-setup',{headers:{Origin:base},data:{setupCode,username:'repeat',name:'模拟',password}})).status(),409);
 await page.getByRole('button',{name:'家庭账号',exact:true}).click();
 async function create(username,name,role){const form=page.locator('.admin-create');await form.getByLabel('登录名',{exact:true}).fill(username);await form.getByLabel('称呼',{exact:true}).fill(name);await form.getByLabel('密码',{exact:true}).fill(password);await form.getByLabel('角色',{exact:true}).selectOption(role);await form.getByRole('button',{name:'建立账号',exact:true}).click();await page.getByRole('form',{name:'编辑账号 '+username,exact:true}).waitFor();}
 await create('child','模拟孩子','child');await create('pp','模拟家长','parent');
 const legacy=await browser.newContext(),legacyPage=await legacy.newPage();await legacyPage.goto(base+'/admin/',{waitUntil:'networkidle'});const legacyApi=requests(legacyPage);
 const old=await legacyApi.post(base+'/assistant-api/session',{headers:{Origin:base},data:{code:'81746290'}});assert.equal(old.status(),200);
 assert.equal((await legacyApi.get(base+'/assistant-api/admin/overview')).status(),403);
 await page.getByRole('button',{name:'家庭设置',exact:true}).click();
 for(const [name,value]of [['问答（今天已用0次）','7'],['语音输入（今天已用0次）','8'],['回答朗读（今天已用0次）','9']])await page.getByLabel(name,{exact:true}).fill(value);
 await page.getByRole('button',{name:'保存每日额度',exact:true}).click();await page.waitForTimeout(150);
 assert.equal((await(await api.get(base+'/assistant-api/admin/overview')).json()).limits.chat,7);
 await page.getByRole('button',{name:'关闭旧访问码',exact:true}).click();await page.getByRole('button',{name:'开启旧访问码',exact:true}).waitFor();
 assert.equal((await(await legacyApi.get(base+'/assistant-api/status')).json()).authenticated,false);await legacy.close();
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Management must fit narrow screens');}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/parent-settings-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'退出账号',exact:true}).click();
 async function login(username,pass=password){await page.getByLabel('登录名',{exact:true}).fill(username);await page.getByLabel('密码',{exact:true}).fill(pass);await page.getByRole('button',{name:'登录',exact:true}).click();}
 await login('pp');await page.getByRole('navigation',{name:'家长管理导航'}).waitFor();assert.equal(await page.getByRole('button',{name:'家庭账号',exact:true}).count(),0);assert.equal((await api.get(base+'/assistant-api/admin/accounts')).status(),403);
 await page.getByRole('button',{name:'修改密码',exact:true}).click();
 const nextPassword='Changed-synthetic-2026';
 await page.getByLabel('当前密码',{exact:true}).fill(password);await page.getByLabel('新密码',{exact:true}).fill(nextPassword);await page.getByLabel('再次输入新密码',{exact:true}).fill('Mismatch-synthetic-2026');
 await page.getByRole('button',{name:'保存新密码',exact:true}).click();await page.getByText('两次新密码不一致，请检查。',{exact:true}).waitFor();
 await page.getByLabel('再次输入新密码',{exact:true}).fill(nextPassword);
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Password form must fit narrow screens');}
 await page.getByRole('button',{name:'保存新密码',exact:true}).click();await page.getByRole('heading',{name:'家长登录',exact:true}).waitFor();
 assert.equal((await api.post(base+'/assistant-api/session',{data:{username:'pp',password}})).status(),401);
 await login('pp',nextPassword);await page.getByRole('navigation',{name:'家长管理导航'}).waitFor();
 await page.getByRole('button',{name:'退出账号',exact:true}).click();await login('child');await page.getByRole('heading',{name:'这里需要家长账号',exact:true}).waitFor();assert.equal((await api.get(base+'/assistant-api/admin/overview')).status(),403);
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'拍备忘录',exact:false}).waitFor();assert.equal(await page.getByRole('link',{name:'家长管理',exact:true}).count(),0);
 await page.screenshot({path:output+'/child-home-mobile.png',fullPage:true});
 assert.equal((await api.patch(base+'/assistant-api/admin/limits',{headers:{Origin:base},data:{chat:5000,asr:5000,tts:5000}})).status(),403);
 assert.deepEqual(errors,[]);
 console.log('ADMIN_ACCOUNTS_UI_OK=true server-bootstrap,real-login,create-child-parent,quota-save,legacy-revoke,parent-admin-boundary,child-denied,normal-upload-entry,mobile-desktop');
 await context.close();
}finally{await browser.close();}
