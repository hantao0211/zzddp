// Server-side synthetic paper only: no production stores, child photos or model calls.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, copyFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { HomeworkStore } from "../../src/server/homework/store";
import { ServerImages } from "../../src/server/homework/images";

async function main() {
 const root=await mkdtemp(join(tmpdir(),"xiaobu-preview-smoke-")),exec=promisify(execFile);
 const digest=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
 const store=new HomeworkStore(join(root,"learning"));
 try {
  const source=join(root,"synthetic-paper.jpg"),ppm=join(root,"paper.ppm"),width=2400,height=3200;
  const header=Buffer.from(`P6\n${width} ${height}\n255\n`),pixels=Buffer.alloc(width*height*3);let seed=931;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   let shade=215+(seed%35);
   // Repeated pencil-like strokes on ruled paper, plus a gentle photographic texture.
   if(y%96===80)shade=160;
   if(x>150&&x<width-150&&y>120&&y<height-120&&y%96<44&&x%78<50&&(x%78<7||y%96<7||y%96>35))shade=50+(seed%50);
   const i=(y*width+x)*3;pixels[i]=shade;pixels[i+1]=shade;pixels[i+2]=shade;
  }
  await writeFile(ppm,Buffer.concat([header,pixels]));await exec('/usr/bin/convert',[ppm,'-quality','96',source]);
  const original=await readFile(source);const upload=store.begin({date:"2026-11-22",kind:"homework",files:[{name:"synthetic-paper.jpg",size:original.length,sha256:digest(original)}]});const file=store.file(upload.files[0].id)!;
  await copyFile(source,join(store.directory,"originals",file.id));store.stored(file.id,"image/jpeg");file.mime="image/jpeg";
  const pipeline=new ServerImages(store),pages=await pipeline.convert(file);assert.equal(pages.length,1);const full=await readFile(join(store.directory,"pages",pages[0].id+".jpg"));const modelBefore=pipeline.images(pages)[0].base64;
  const [screen,thumb]=await Promise.all([store.previews.get(pages[0].id,"screen"),store.previews.get(pages[0].id,"thumb")]);
  const dimensions=async(p:string)=>(await exec('/usr/bin/identify',['-format','%w %h',p])).stdout.trim().split(' ').map(Number);
  assert.ok(Math.max(...await dimensions(thumb))<=480);assert.ok(Math.max(...await dimensions(screen))<=1600);
  const screenBytes=(await stat(screen)).size,thumbBytes=(await stat(thumb)).size;
  assert.ok(screenBytes<full.length);assert.ok(thumbBytes<screenBytes);
  assert.equal(digest(await readFile(join(store.directory,"originals",file.id))),digest(original));assert.equal(digest(await readFile(join(store.directory,"pages",pages[0].id+".jpg"))),digest(full));assert.equal(pipeline.images(pages)[0].base64,modelBefore);
  console.log(JSON.stringify({syntheticOnly:true,originalBytes:original.length,aiPageBytes:full.length,screenBytes,thumbBytes,screenReductionPercent:Math.round(100*(1-screenBytes/full.length)),thumbReductionPercent:Math.round(100*(1-thumbBytes/full.length)),originalAndAIPageUnchanged:true}));
 }finally{store.close();await rm(root,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
