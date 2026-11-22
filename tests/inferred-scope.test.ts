import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DailyReportSchema, type DailyReport, type ExtractedHomework } from "../src/domain/homework";
import { inferTaskScope, inferredReportScope, mayInferScope } from "../src/domain/inferred-scope";
import { HomeworkStore } from "../src/server/homework/store";
import { HomeworkWorker } from "../src/server/homework/worker";
import { homeworkSummary } from "../src/domain/homework-summary";
import { homeworkTaskDetail } from "../src/domain/homework-task-detail";
import { isHomeworkDayComplete } from "../src/domain/homework-reward";

const date="2026-11-20",concern="未写明默写内容，无法核对是否覆盖全部家默词条；仅有13个编号词语，是否完整不确定。";
function task(title="家默",missing=concern):DailyReport["tasks"][number] {return DailyReportSchema.parse({date,memoId:"memo",updatedAt:"",tasks:[{id:"memo:task:0",title,subject:"语文",requirement:title==="家默"?"语文第3项，已勾选完成；具体默写内容未写明。":"语文第4项；未写明L19具体指第19课、第19页还是练习编号。",format:"written",memoEvidence:[],evidence:[{fileId:"page-a",page:1,excerpt:"可见本次作答"}],coverage:"partial",missing:[missing],writtenCompletion:{version:"written-v2",status:"unclear",reason:"指定作业范围的照片还不完整，不能判断整项是否写完。",parts:Array.from({length:13},(_,i)=>({label:`第${i+1}项`,status:"answered",evidence:{fileId:"page-a",page:1,excerpt:"已有填写"}}))}}],uncertainties:[],unassigned:[]}).tasks[0];}
const pages:ExtractedHomework["pages"]=[{fileId:"page-a",subject:"语文",readable:true,book:"模拟练习",printedPage:"50",content:"已有作答",studyTrace:null,uncertainties:[]}];
test("unspecified dictation count and a speculative continuation page use the observed work, without modifying the memo",()=>{
 assert.equal(mayInferScope({...task("练L19"),requirement:"语文第4项，已勾选完成，旁注“已完成，最后一题已给参考”；未写明L19具体指第19课、第19页还是练习编号。"}),true);
 for(const t of [task(),task("练L19","“L19”所指不明；第50页练习二后仍见空白横线及页面下部空白，是否有后续题页未拍到无法确认。")]){
  const before=structuredClone(t),result=inferTaskScope(t,pages);assert.equal(result.coverage,"complete");assert.equal(result.writtenCompletion?.status,"done");assert.deepEqual(result.missing,[]);assert.match(result.inferredScope!.note,/未写明/);assert.equal(result.requirement,t.requirement);assert.deepEqual(t,before);assert.deepEqual(inferTaskScope(result,pages),result);
 }
 const raw=DailyReportSchema.parse({date,memoId:"memo",updatedAt:"",tasks:[task()],uncertainties:[concern,"日期由上传时选择"],unassigned:[]});assert.deepEqual(inferredReportScope(raw,pages).uncertainties,["日期由上传时选择"]);
});
test("real blank answers and unreadable handwriting remain incomplete or unclear inside the inferred scope",()=>{
 for(const [status,want]of[["blank","incomplete"],["unclear","unclear"]]as const){const t=task();t.writtenCompletion!.parts[2].status=status;const result=inferTaskScope(t,pages);assert.equal(result.writtenCompletion?.status,want);assert.equal(result.writtenCompletion?.parts[2].status,status);assert.equal(result.coverage,"complete");}
});
test("explicit page, question and word-count requirements stay authoritative; real crop/mismatch/unknown pages never become complete",()=>{
 for(const title of ["数学P74","家默16个单词","单词16个","默写十三个词语","练习第12—13页","完成第1至3题"]){assert.equal(mayInferScope({...task(),title,requirement:title}),false,title);}
 assert.equal(mayInferScope({...task(),requirement:"旁注“默写16个词语”"}),false);
 for(const message of["第50页第2题被裁切，看不清题干。","缺少第51页照片。","照片与本项内容不符，无法对应。","第3题没有作答。"]){const t=task("家默",message);assert.equal(inferTaskScope(t,pages),t);}
 const t=task();assert.equal(inferTaskScope(t,[]),t);assert.equal(inferTaskScope(t,[{...pages[0],readable:false}]),t);assert.equal(inferTaskScope(t,[{...pages[0],subject:"数学"}]),t);assert.equal(inferTaskScope({...t,writtenCompletion:null},pages).inferredScope,undefined);
 t.writtenCompletion!.reason="题目关键部分被裁切，看不清全题。";assert.equal(inferTaskScope(t,pages),t);
});
test("new organization and read-time old results apply the same scope policy, with no extra model calls or source mutations",async()=>{
 const directory=mkdtempSync(join(tmpdir(),"xiaobu-inferred-scope-")),store=new HomeworkStore(directory,Date.now,null,true);let calls=0;
 function record(kind:"memo"|"homework"){
  const upload=store.begin({date,kind,files:[{name:"synthetic.png",size:1,sha256:(kind==="memo"?"a":"b").repeat(64)}]}),file=upload.files[0],page=file.id+"-p1";store.stored(file.id,"image/png");store.setPages(file.id,[{id:page,file_id:file.id,number:1}]);store.finalize(upload.id);const job=store.claim()!;
  store.recognized(job,kind==="memo"?{date,readable:true,assignments:[{subject:"语文",title:"家默",requirement:"家默，具体内容未写明",format:"written",evidence:[{fileId:page,page:1,excerpt:"家默"}]}],uncertainties:[]}:{pages:[{...pages[0],fileId:page}]},["语文"],false,0,"");store.db.exec("UPDATE jobs SET status='done'");return {upload,page};
 }
 const memo=record("memo"),work=record("homework"),rawExtraction=store.upload(work.upload.id)!.result;
 const worker=new HomeworkWorker(store,()=>({async run(name,schema,input){calls++;const data=input as any;if(name==="organize_homework"){assert.equal(data.candidates[0].inferFromSubmittedWork,true);assert.match(data.scopePolicy,/推断/);return schema.parse({readable:true,subjects:["语文"],matches:[{taskId:data.candidates[0].id,coverage:"partial",missing:[concern],evidence:[{fileId:work.page,page:1,excerpt:"已有默写作答"}]}],unassigned:[],uncertainties:[]});}assert.equal(name,"assess_written_completion");assert.equal(data.inferFromSubmittedWork,true);return schema.parse({scopeComplete:false,reason:"词语总数未写明",parts:[{label:"词语1",status:"answered",evidence:{fileId:work.page,page:1,excerpt:"已填写"}}]});}}),{async convert(){return[];},images(){return[{fileId:work.page,mimeType:"image/png",base64:"synthetic"}];}});
 try{
  store.bump(date);await worker.tick();assert.equal(calls,2);const fresh=store.snapshot(date);assert.equal(fresh.report!.tasks[0].writtenCompletion?.status,"done");assert.ok(fresh.report!.tasks[0].inferredScope);assert.equal(store.upload(work.upload.id)!.result,rawExtraction);
  const oldTask=task();oldTask.id=memo.upload.id+":task:0";oldTask.evidence=oldTask.evidence.map(e=>({...e,fileId:work.page}));oldTask.writtenCompletion!.parts=oldTask.writtenCompletion!.parts.map(p=>({...p,evidence:{...p.evidence,fileId:work.page}}));
  const old={...fresh.report!,tasks:[oldTask]};store.db.prepare("UPDATE days SET report=? WHERE date=?").run(JSON.stringify(old),date);const raw=store.db.prepare("SELECT report FROM days WHERE date=?").get(date),quota=store.quota(),jobs=store.db.prepare("SELECT * FROM jobs").all();
  const projected=store.snapshot(date),row=homeworkSummary(projected)!.rows[0];assert.equal(row.activity.text,"已做完");assert.equal(row.photo.text,"已收到");assert.equal(row.inferred,true);assert.equal(homeworkTaskDetail(projected,projected.report!.tasks[0]).concerns.length,0);assert.equal(isHomeworkDayComplete(projected),true);
  assert.deepEqual(store.db.prepare("SELECT report FROM days WHERE date=?").get(date),raw);assert.deepEqual(store.quota(),quota);assert.deepEqual(store.db.prepare("SELECT * FROM jobs").all(),jobs);assert.equal(calls,2);
 }finally{worker.stop();store.close();rmSync(directory,{recursive:true,force:true});}
});
