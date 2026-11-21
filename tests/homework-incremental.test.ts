import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {z} from "zod";
import type {Subject} from "../src/domain/contracts";
import type {AITask} from "../src/domain/ai-contracts";
import {ExtractedHomeworkSchema} from "../src/domain/homework";
import {homeworkSummary} from "../src/domain/homework-summary";
import {HomeworkStore} from "../src/server/homework/store";
import {HomeworkWorker} from "../src/server/homework/worker";
import type {StructuredAI,AIImage} from "../src/server/ai/provider";
const date="2026-11-20",hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fixture(written=false){
 const dir=mkdtempSync(join(tmpdir(),"xiaobu-incremental-"));let now=Date.parse(date+"T04:00:00Z");
 const store=new HomeworkStore(dir,()=>now,null,written),calls:{task:AITask;input:any;images:AIImage[]}[]=[];
 let hook:((input:any)=>Promise<void>)|undefined,unreadable:Subject|undefined;
 const ai:StructuredAI={async run<T>(task:AITask,schema:z.ZodType<T>,input:unknown,images:AIImage[]=[]){
  const value=input as any;calls.push({task,input:value,images});
  if(task==="assess_written_completion")return schema.parse({scopeComplete:true,reason:"模拟书面题均有作答",parts:value.pages.map((p:any,index:number)=>({label:"第"+(index+1)+"部分",status:"answered",evidence:{fileId:p.fileId,page:p.page,excerpt:"模拟手写"}}))});
  assert.equal(task,"organize_homework");await hook?.(value);
  return schema.parse({readable:unreadable!==value.candidates[0].subject,subjects:[...new Set(value.candidates.map((t:any)=>t.subject))],matches:value.candidates.map((t:any)=>({taskId:t.id,coverage:"complete",evidence:value.extractedPages.filter((p:any)=>p.subject===t.subject).map((p:any)=>({fileId:p.fileId,page:1,excerpt:"模拟作答"})),missing:[]})).filter((m:any)=>m.evidence.length),unassigned:[],uncertainties:[]});
 }};
 const pipeline={async convert(){throw Error("Seeded records need no conversion");},images(pages:{id:string}[]){return pages.map(p=>({fileId:p.id,mimeType:"image/jpeg" as const,base64:"synthetic"}));}};
 let worker=new HomeworkWorker(store,()=>ai,pipeline);
 function seed(kind:"memo"|"homework",subject:Subject|null,seed:string){
  now+=1000;
  const upload=store.begin({date,kind,files:[{name:seed+".png",size:1,sha256:hash(seed)}]});
  store.stored(upload.files[0].id,"image/png");store.finalize(upload.id);
  const job=store.claim()!;assert.equal(job.upload_id,upload.id);const file=store.files(upload.id)[0],id=file.id+"-p1";store.setPages(file.id,[{id,file_id:file.id,number:1}]);
  const result=kind==="memo"?{date,readable:true,assignments:(["数学","英语","语文"] as Subject[]).map(s=>({subject:s,title:s+"练习",requirement:s+"第1页",format:"written",evidence:[{fileId:id,page:1,excerpt:s}]})),uncertainties:[]}:{pages:[{fileId:id,readable:true,subject,book:"模拟作业",printedPage:seed,content:"模拟作答",uncertainties:[],studyTrace:null}]};
  store.recognized(job,result,subject?[subject]:[],false,1,"");return {uploadId:upload.id,pageId:id};
 }
 async function drain(){for(let i=0;i<20;i++)if(!await worker.tick())return;throw Error("Queue did not drain");}
 return {store,calls,seed,drain,ai,worker:()=>worker,restart(){worker.stop();worker=new HomeworkWorker(store,()=>ai,pipeline);},setHook(value:typeof hook){hook=value;},setUnreadable(subject:Subject){unreadable=subject;},cleanup(){worker.stop();store.close();rmSync(dir,{recursive:true,force:true});}};
}
test("supplemental math uploads reuse all other subjects across worker restart, and pending UI keeps prior judgements",async()=>{
 const f=fixture();try{
  f.seed("memo",null,"memo");f.seed("homework","语文","chinese");f.seed("homework","数学","math-1");f.seed("homework","英语","english");await f.drain();
  assert.equal(f.calls.length,3);const previous=f.store.snapshot(date).report!;const english=previous.tasks.find(t=>t.subject==="英语")!;
  f.calls.length=0;f.restart();const added=f.seed("homework","数学","math-2");
  const pending=f.store.snapshot(date);assert.equal(pending.pending,true);assert.deepEqual(pending.processing?.subjects,["数学"]);assert.ok(!pending.processing?.memo);
  const rows=homeworkSummary(pending)!.rows;assert.ok(rows.every(r=>r.photo.text==="已收到"));assert.equal(rows.find(r=>r.subject==="数学")!.updating,true);assert.equal(rows.find(r=>r.subject==="英语")!.updating,false);
  await f.drain();assert.equal(f.calls.length,1);assert.ok(f.calls[0].input.candidates.every((t:any)=>t.subject==="数学"));assert.equal(f.calls[0].input.extractedPages.length,2);
  const report=f.store.snapshot(date).report!;assert.deepEqual(report.tasks.find(t=>t.subject==="英语"),english);assert.ok(report.organizedUploadIds?.includes(added.uploadId));
 }finally{f.cleanup();}
});
test("a legacy whole-day cache primes unchanged subject scopes without paid reanalysis",async()=>{
 const f=fixture();try{
  f.seed("memo",null,"memo");f.seed("homework","语文","chinese");f.seed("homework","数学","math-1");f.seed("homework","英语","english");await f.drain();
  const report=f.store.snapshot(date).report!,defaults=report.tasks.map(t=>({id:t.id,subject:t.subject,title:t.title,requirement:t.requirement,format:t.format,memoEvidence:t.memoEvidence,writtenCompletion:null,coverage:"none",evidence:[],reviewActivity:null,missing:["尚未收到可对应的作业材料。"]}));
  const pages=f.store.uploads(date).filter(u=>u.kind==="homework").flatMap(u=>ExtractedHomeworkSchema.parse(JSON.parse(u.result!)).pages);
  f.store.db.exec("DELETE FROM analysis_cache WHERE key LIKE 'organize:%'");
  const key="organize:v3:"+hash({tasks:defaults,homework:pages,reviewPolicy:null,writtenCompletionEnabled:false});
  const result={readable:true,subjects:["数学","英语","语文"],matches:report.tasks.map(t=>({taskId:t.id,coverage:t.coverage,evidence:t.evidence,missing:t.missing})),unassigned:[],uncertainties:[]};
  f.store.db.prepare("INSERT INTO analysis_cache(key,result) VALUES(?,?)").run(key,JSON.stringify(result));
  f.calls.length=0;f.seed("homework","数学","math-2");await f.drain();assert.equal(f.calls.length,1);assert.equal(f.calls[0].input.candidates[0].subject,"数学");
 }finally{f.cleanup();}
});
test("one unreadable subject does not invalidate another subject's coverage",async()=>{
 const f=fixture();try{
  f.seed("memo",null,"memo");f.seed("homework","数学","math");f.seed("homework","英语","english");f.setUnreadable("英语");await f.drain();
  const tasks=f.store.snapshot(date).report!.tasks;assert.equal(tasks.find(t=>t.subject==="数学")!.coverage,"complete");assert.equal(tasks.find(t=>t.subject==="英语")!.coverage,"uncertain");
 }finally{f.cleanup();}
});
test("unknown subjects receive a conservative joint pass, without guessing a subject",async()=>{
 const f=fixture();try{
  f.seed("memo",null,"memo");f.seed("homework","数学","math");f.seed("homework",null,"unreadable");await f.drain();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].input.candidates.length,3);assert.equal(f.calls[0].input.extractedPages.length,2);assert.equal(f.store.snapshot(date).status,"needs_rescan");
 }finally{f.cleanup();}
});
test("a new upload supersedes parallel organization before later stages and reuses completed scopes",async()=>{
 const f=fixture();try{
  f.seed("memo",null,"memo");f.seed("homework","数学","math");f.seed("homework","英语","english");
  let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
  f.setHook(async()=>{entered();await gate;});const current=f.worker().tick();await waiting;
  f.store.bump(date);release();await current;assert.equal(f.calls.length,2);assert.equal(f.store.snapshot(date).report,null,"Obsolete partial results must not replace the current report");
  f.setHook(undefined);await f.drain();assert.equal(f.calls.length,2,"The completed scope is cached and reused by the latest job");assert.equal(f.store.snapshot(date).status,"processed");
 }finally{f.cleanup();}
});
test("continuous uploads coalesce obsolete queued organizations and do not leave a day stuck pending",async()=>{
 const f=fixture();try{
  f.seed("memo",null,"memo");for(let i=0;i<8;i++)f.store.bump(date);
  assert.equal((f.store.db.prepare("SELECT COUNT(*) n FROM jobs WHERE kind='organize' AND status='queued'").get() as {n:number}).n,1);
  await f.drain();assert.equal(f.store.snapshot(date).pending,false);
 }finally{f.cleanup();}
});

test("supplemental pages inspect only changed written work and keep other subjects' completed results",async()=>{
 const f=fixture(true);try{
  f.seed("memo",null,"memo");const chinese=f.seed("homework","语文","chinese");f.seed("homework","数学","math-1");await f.drain();
  const before=f.store.snapshot(date).report!.tasks.find(t=>t.subject==="语文")!;assert.equal(before.writtenCompletion?.status,"done");
  f.calls.length=0;f.seed("homework","数学","math-2");await f.drain();
  assert.deepEqual(f.calls.map(c=>c.task),["organize_homework","assess_written_completion"]);
  assert.equal(f.calls[1].images.length,2);assert.ok(f.calls[1].images.every(i=>i.fileId!==chinese.pageId));
  assert.deepEqual(f.store.snapshot(date).report!.tasks.find(t=>t.subject==="语文"),before);
 }finally{f.cleanup();}
});


test("contradictory completeness and an omitted subject label remain conservative without retrying the whole day",async()=>{
 const f=fixture();try{
  f.seed("memo",null,"memo");f.seed("homework","数学","math");f.seed("homework","英语","english");
  const run=f.ai.run.bind(f.ai);f.ai.run=async<T>(task:AITask,schema:z.ZodType<T>,input:unknown,images:AIImage[]=[])=>{
    const result=await run(task,schema,input,images) as any;
    if((input as any).candidates[0].subject==="英语"){result.subjects=[];result.matches[0].missing=["缺少第2页"];}
    return schema.parse(result);
  };
  await f.drain();const snapshot=f.store.snapshot(date);assert.equal(snapshot.pending,false);assert.equal(snapshot.status,"processed");
  assert.equal(snapshot.report!.tasks.find(t=>t.subject==="数学")!.coverage,"complete");assert.equal(snapshot.report!.tasks.find(t=>t.subject==="英语")!.coverage,"partial");
  assert.equal(f.calls.length,2);
 }finally{f.cleanup();}
});
test("a claimed complete oral task is retained as uncertain rather than causing a retry or false completion",async()=>{
 const f=fixture();try{
  const memo=f.seed("memo",null,"memo");f.seed("homework","英语","english");
  const value=JSON.parse(f.store.upload(memo.uploadId)!.result!);value.assignments.find((a:any)=>a.subject==="英语").format="oral";
  f.store.db.prepare("UPDATE uploads SET result=? WHERE id=?").run(JSON.stringify(value),memo.uploadId);
  await f.drain();const snapshot=f.store.snapshot(date);assert.equal(snapshot.pending,false);assert.equal(snapshot.status,"processed");
  assert.equal(snapshot.report!.tasks.find(t=>t.subject==="英语")!.coverage,"uncertain");assert.equal(f.calls.length,1);
 }finally{f.cleanup();}
});


test("a contradictory completeness flag cannot turn another subject's page into partial evidence",async()=>{
 const f=fixture();try{
  f.seed("memo",null,"memo");const math=f.seed("homework","数学","math");f.seed("homework",null,"unknown");
  const run=f.ai.run.bind(f.ai);f.ai.run=async<T>(task:AITask,schema:z.ZodType<T>,input:unknown,images:AIImage[]=[])=>{
    const result=await run(task,schema,input,images) as any;
    result.matches.push({taskId:(input as any).candidates.find((t:any)=>t.subject==="英语").id,coverage:"complete",missing:["缺少另一页"],evidence:[{fileId:math.pageId,page:1,excerpt:"错误科目的页面"}]});
    return schema.parse(result);
  };
  await f.worker().tick();assert.equal(f.store.snapshot(date).report,null);assert.equal(f.store.snapshot(date).status,"retrying");
 }finally{f.cleanup();}
});
