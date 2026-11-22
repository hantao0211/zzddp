import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PagePreviews } from "../src/server/homework/page-previews";
import { HomeworkStore } from "../src/server/homework/store";
import { HomeworkHTTP } from "../src/server/homework/http";
import { AssistantStore } from "../src/server/assistant/store";
import { createAssistantServer } from "../src/server/assistant/server";
import { createHash, scryptSync } from "node:crypto";
import { request } from "node:http";

const pageId="11111111-1111-4111-8111-111111111111-p1";
test("previews share one conversion, persist across restart, invalidate when the source changes and leave source bytes intact",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"xiaobu-previews-"));let renders=0,active=0,maxActive=0;
 await mkdir(join(directory,"pages"));const source=join(directory,"pages",pageId+".jpg"),bytes=Buffer.alloc(4000,13);await writeFile(source,bytes);
 const renderer=async(_source:string,screen:string,thumb:string)=>{renders++;active++;maxActive=Math.max(maxActive,active);await new Promise<void>(r=>setImmediate(r));await writeFile(screen,Buffer.alloc(300,8));await writeFile(thumb,Buffer.alloc(100,4));active--;};
 try{
  const previews=new PagePreviews(directory,renderer);const [screen,thumb,again]=await Promise.all([previews.get(pageId,"screen"),previews.get(pageId,"thumb"),previews.get(pageId,"screen")]);assert.equal(screen,again);assert.equal(renders,1);assert.equal((await readFile(thumb)).length,100);assert.equal((await readFile(screen)).length,300);assert.deepEqual(await readFile(source),bytes);
  assert.equal(await new PagePreviews(directory,renderer).get(pageId,"thumb"),thumb);assert.equal(renders,1);
  await writeFile(source,Buffer.alloc(5000,7));const updated=await previews.get(pageId,"thumb");assert.notEqual(updated,thumb);assert.equal(renders,2);
  const ids=[2,3,4].map(n=>pageId.replace(/p1$/,'p'+n));for(const id of ids)await writeFile(join(directory,"pages",id+".jpg"),bytes);await Promise.all(ids.map(id=>previews.get(id,"screen")));assert.equal(maxActive,1);
  assert.deepEqual((await readdir(join(directory,"previews","v1"))).filter(n=>n.startsWith("render-")),[]);
  await assert.rejects(previews.get("../../originals/private","thumb"));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test("failed compression falls back to the readable page and backs off; an optimized file never grows the download",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"xiaobu-preview-fallback-"));await mkdir(join(directory,"pages"));const source=join(directory,"pages",pageId+".jpg");await writeFile(source,Buffer.alloc(200,2));let attempts=0;
 try{
  const failed=new PagePreviews(directory,async()=>{attempts++;throw Error("synthetic failure");});assert.equal(await failed.get(pageId,"thumb"),source);assert.equal(await failed.get(pageId,"screen"),source);assert.equal(attempts,1);
  const larger=new PagePreviews(directory,async(_input,screen,thumb)=>{await writeFile(screen,Buffer.alloc(300));await writeFile(thumb,Buffer.alloc(400));});assert.equal((await readFile(await larger.get(pageId,"thumb"))).length,200);assert.equal((await readFile(await larger.get(pageId,"screen"))).length,200);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test("optimized photo HTTP revalidates only after authentication, supports small downloads and preserves original downloads",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"xiaobu-preview-http-")),store=new HomeworkStore(join(directory,"learning")),auth=new AssistantStore(join(directory,"auth")),origin="https://family.test",salt="ac".repeat(16);
 let renders=0;Object.defineProperty(store,"previews",{value:new PagePreviews(store.directory,async(_source,screen,thumb)=>{renders++;await writeFile(screen,Buffer.alloc(300,5));await writeFile(thumb,Buffer.alloc(100,9));})});
 const server=createAssistantServer({origin,accessHash:salt+":"+scryptSync("synthetic",salt,32).toString("hex"),store:auth,homework:new HomeworkHTTP(store),ai:()=>{throw Error("Photo display must not call AI");}});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address();assert.ok(address&&typeof address!=="string");
 const send=(path:string,cookie="",etag="")=>new Promise<{status:number;headers:import("node:http").IncomingHttpHeaders;bytes:Buffer}>((resolve,reject)=>{const r=request({hostname:"127.0.0.1",port:address.port,path:"/assistant-api/learning/"+path,headers:{Host:"family.test","X-Forwarded-Proto":"https",Cookie:cookie,...(etag?{"If-None-Match":etag}:{})}},res=>{const chunks:Buffer[]=[];res.on("data",b=>chunks.push(b));res.on("end",()=>resolve({status:res.statusCode!,headers:res.headers,bytes:Buffer.concat(chunks)}));});r.on("error",reject);r.end();});
 try{
  const original=Buffer.alloc(6000,3),full=Buffer.alloc(4000,4),upload=store.begin({date:"2026-11-22",kind:"homework",files:[{name:"模拟照片.jpg",size:original.length,sha256:createHash("sha256").update(original).digest("hex")}]});const file=upload.files[0],id=file.id+"-p1";store.stored(file.id,"image/jpeg");store.setPages(file.id,[{id,file_id:file.id,number:1}]);await writeFile(join(store.directory,"originals",file.id),original);await writeFile(join(store.directory,"pages",id+".jpg"),full);
  assert.equal((await send(`pages/${id}?size=thumb`)).status,401);assert.equal(renders,0);
  const token=auth.createSession(),cookie="__Secure-xiaobu-assistant="+token;
  assert.equal((await send(`pages/${id}?size=invalid`,cookie)).status,400);assert.equal((await send(`pages/${pageId}?size=thumb`,cookie)).status,404);
  const thumb=await send(`pages/${id}?size=thumb`,cookie);assert.equal(thumb.status,200);assert.equal(thumb.bytes.length,100);assert.equal(thumb.headers["cache-control"],"private, no-cache");assert.equal(thumb.headers.vary,"Cookie");assert.equal(thumb.headers["content-type"],"image/jpeg");assert.equal(renders,1);
  const etag=String(thumb.headers.etag),cached=await send(`pages/${id}?size=thumb`,cookie,'"other", '+etag);assert.equal(cached.status,304);assert.equal(cached.bytes.length,0);assert.equal(renders,1);
  const screen=await send(`pages/${id}?size=screen&download=1`,cookie);assert.equal(screen.bytes.length,300);assert.match(String(screen.headers["content-disposition"]),/^attachment;/);assert.notEqual(screen.headers.etag,etag);assert.equal(renders,1);
  assert.deepEqual((await send(`pages/${id}`,cookie)).bytes,full);const raw=await send(`files/${file.id}`,cookie);assert.deepEqual(raw.bytes,original);assert.equal(raw.headers["cache-control"],"no-store");
  auth.logout(token);assert.equal((await send(`pages/${id}?size=thumb`,cookie,etag)).status,401);assert.deepEqual(await readFile(join(store.directory,"pages",id+".jpg")),full);assert.deepEqual(await readFile(join(store.directory,"originals",file.id)),original);
 }finally{await new Promise<void>(r=>{server.closeAllConnections();server.close(()=>r());});store.close();await rm(directory,{recursive:true,force:true});}
});
