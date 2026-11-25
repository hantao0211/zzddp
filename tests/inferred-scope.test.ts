import { verifiedClues } from "../src/server/homework/feedback-lessons";
import { LearnedMemories } from "../src/server/homework/memory";
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
 function record(kind:"memo"|"homework", day=date, title="家默"){
  const upload=store.begin({date:day,kind,files:[{name:"synthetic.png",size:1,sha256:(kind==="memo"?"a":"b").repeat(64)}]}),file=upload.files[0],page=file.id+"-p1";store.stored(file.id,"image/png");store.setPages(file.id,[{id:page,file_id:file.id,number:1}]);store.finalize(upload.id);const job=store.claim()!;
  store.recognized(job,kind==="memo"?{date:day,readable:true,assignments:[{subject:"语文",title,requirement:title+"，具体内容未写明",format:"written",evidence:[{fileId:page,page:1,excerpt:"家默"}]}],uncertainties:[]}:{pages:[{...pages[0],fileId:page}]},["语文"],false,0,"");store.db.exec("UPDATE jobs SET status='done'");return {upload,page};
 }
 const memo=record("memo"),work=record("homework"),rawExtraction=store.upload(work.upload.id)!.result;
 const worker=new HomeworkWorker(store,()=>({async run(name,schema,input){calls++;const data=input as any;if(name==="organize_homework"){assert.equal(data.candidates[0].inferFromSubmittedWork,true);assert.match(data.scopePolicy,/推断/);return schema.parse({readable:true,subjects:["语文"],matches:[{taskId:data.candidates[0].id,coverage:"partial",missing:[concern],evidence:[{fileId:work.page,page:1,excerpt:"已有默写作答"}]}],unassigned:[],uncertainties:[]});}assert.equal(name,"assess_written_completion");assert.equal(data.inferFromSubmittedWork,true);return schema.parse({scopeComplete:false,reason:"词语总数未写明",parts:[{label:"词语1",status:"answered",evidence:{fileId:work.page,page:1,excerpt:"已填写"}}]});}}),{async convert(){return[];},images(){return[{fileId:work.page,mimeType:"image/png",base64:"synthetic"}];}});
 try{
  store.bump(date);await worker.tick();assert.equal(calls,2);const fresh=store.snapshot(date);assert.equal(fresh.report!.tasks[0].writtenCompletion?.status,"done");assert.ok(fresh.report!.tasks[0].inferredScope);assert.equal(store.upload(work.upload.id)!.result,rawExtraction);
  const oldTask=task();oldTask.requirement=fresh.report!.tasks[0].requirement;oldTask.id=memo.upload.id+":task:0";oldTask.evidence=oldTask.evidence.map(e=>({...e,fileId:work.page}));oldTask.writtenCompletion!.parts=oldTask.writtenCompletion!.parts.map(p=>({...p,evidence:{...p.evidence,fileId:work.page}}));
  const old={...fresh.report!,tasks:[oldTask]};store.db.prepare("UPDATE days SET report=? WHERE date=?").run(JSON.stringify(old),date);const raw=store.db.prepare("SELECT report FROM days WHERE date=?").get(date),quota=store.quota(),jobs=store.db.prepare("SELECT * FROM jobs").all();
  const projected=store.snapshot(date),row=homeworkSummary(projected)!.rows[0];assert.equal(row.activity.text,"已做完");assert.equal(row.photo.text,"已收到");assert.equal(row.inferred,true);assert.equal(homeworkTaskDetail(projected,projected.report!.tasks[0]).concerns.length,0);assert.equal(isHomeworkDayComplete(projected),true);
  assert.deepEqual(store.db.prepare("SELECT report FROM days WHERE date=?").get(date),raw);assert.deepEqual(store.quota(),quota);assert.deepEqual(store.db.prepare("SELECT * FROM jobs").all(),jobs);assert.equal(calls,2);
  const id = projected.report!.tasks[0].id, token = projected.completionFeedback![id].token;
  const child = {id:"child",username:"child",name:"孩子",role:"child" as const};
  const parent = {...child,id:"parent",role:"parent" as const};
  const input = {date,taskId:id,token,previousId:null,confirm:false,reason:"correction" as const,note:"底下一行是订正"};
  assert.throws(()=>store.feedback.submit({...input,confirm:true},child),/家长/);
  const posted = store.feedback.submit(input,child);
  assert.deepEqual(store.feedback.submit(input,child),posted);
  assert.equal(store.snapshot(date).completionFeedback![id].latest?.status,"pending");
  assert.equal(new LearnedMemories(store).list().length,0);
  let inspected = 0;
  const recheck = new HomeworkWorker(store,()=>({async run(name,schema,value){
    assert.equal(name,"assess_written_completion");
    const data = value as any;assert.deepEqual(data.feedback,{reason:"这是订正练习",note:input.note});
    inspected++;
    return schema.parse({scopeComplete:true,reason:"末行是订正，首行已作答。",verifiedClues:[{method:"correction",cue:"另起一行重写词语",label:"末行订正",fileId:work.page,page:1}],parts:[{label:"末行订正",status:"answered",evidence:{fileId:work.page,page:1,excerpt:"与打叉处的词对应，末行重写"}}]});
  }}),{async convert(){return[];},images(){return [];}});
  try {await recheck.tick();} finally {recheck.stop();}
  const reviewed = store.snapshot(date);
  assert.equal(inspected,1);assert.equal(reviewed.completionFeedback![id].latest?.status,"reviewed");
  assert.match(reviewed.report!.tasks[0].feedbackFinding!,/末行是订正/);
  assert.equal(reviewed.report!.tasks[0].reviewedFeedbackId,posted.id);
  assert.throws(()=>store.feedback.submit({...input,confirm:true},parent),/刷新/);
  store.feedback.submit({...input,previousId:posted.id,confirm:true},parent);
  assert.equal(homeworkSummary(store.snapshot(date))!.rows[0].activity.text,"已做完（家长确认）");
  const convention = {date,taskId:id,token,trigger:"听写订正",quote:"我们家听写订正通常写在本页最后一行。"};
  assert.throws(()=>store.feedback.teach(convention,child),/家长/);
  assert.throws(()=>store.feedback.teach({...convention,quote:"这张照片上的两个词写在最后一行。"},parent));
  store.feedback.teach(convention,parent);store.feedback.teach(convention,parent);
  assert.deepEqual(new LearnedMemories(store).forJudgment("homework_completion",["语文"],"新的听写订正"),[{convention:convention.quote,subject:"语文"}]);
  assert.equal(new LearnedMemories(store).list().length,1);
  const lesson = reviewed.completionFeedback![id].latest?.learned?.[0];
  assert.match(lesson || "",/另起一行重写词语/);
  const memories = new LearnedMemories(store);
  const [entry] = memories.catalog().photoChecks!;
  assert.equal(entry.excerpt,"与打叉处的词对应，末行重写");
  assert.equal(entry.date,date);
  const original = reviewed.report!.tasks[0];
  assert.deepEqual(store.feedback.lessons.recall({...original,subject:"英语"},"new"),[]);
  assert.deepEqual(store.feedback.lessons.recall({...original,title:"练习册"},"new"),[]);
  const tomorrow = "2026-11-21";
  record("memo",tomorrow,"单元听写");
  const next = record("homework",tomorrow);
  let recalls=0;
  const nextWorker = new HomeworkWorker(store,()=>({async run(name,schema,input) {
    const data = input as any;
    const evidence = {fileId:next.page,page:1,excerpt:"指定的词旁空白"};
    if(name==="organize_homework") return schema.parse({readable:true,subjects:["语文"],matches:[{
      taskId:data.candidates[0].id,coverage:"complete",missing:[],evidence:[evidence]}],unassigned:[],uncertainties:[]});
    assert.equal(name,"assess_written_completion");
    assert.equal(data.feedback,undefined);
    assert.deepEqual(data.priorPhotoChecks,[lesson]);
    assert.equal(data.pages[0].fileId,next.page);
    assert.ok(!JSON.stringify(data.priorPhotoChecks).includes(inputNote));
    recalls++;
    return schema.parse({scopeComplete:true,reason:"另有一个指定词确实空着。",parts:[{label:"指定词",status:"blank",evidence}]});
  }}),{async convert(){return[];},images(){return [];}});
  const inputNote=input.note;
  try {store.bump(tomorrow);await nextWorker.tick();} finally {nextWorker.stop();}
  assert.equal(recalls,1);
  const inspectedNext=store.snapshot(tomorrow).report!.tasks[0];
  assert.equal(inspectedNext.writtenCompletion?.status,"incomplete");
  assert.deepEqual(inspectedNext.referencedChecks,[lesson]);
  memories.revoke(entry.id);
  assert.deepEqual(store.feedback.lessons.recall(inspectedNext,"new"),[]);
  const changed=structuredClone(old);changed.tasks[0].requirement="另一份作业";
  store.db.prepare("UPDATE days SET report=? WHERE date=?").run(JSON.stringify(changed),date);
  assert.notEqual(store.snapshot(date).completionFeedback![id]?.token,token);
  assert.throws(()=>store.feedback.submit(input,child),/更新/);
 }finally{worker.stop();store.close();rmSync(directory,{recursive:true,force:true});}
});

test("a missing handwritten number alone does not establish that an assigned dictation word was left blank", () => {
  const reportTask = task();
  const part = reportTask.writtenCompletion!.parts[2];
  part.label = "编号7默写词（页面未出现编号7）";
  part.status = "blank";
  const result = inferTaskScope(reportTask, pages);
  assert.equal(result.writtenCompletion?.status, "done");
  assert.equal(result.writtenCompletion!.parts.length,12);
  assert.equal(inferTaskScope({...reportTask,requirement:"对照老师给的词表"},pages).writtenCompletion?.status,"unclear");
  const noAnswers = {...reportTask,writtenCompletion:{...reportTask.writtenCompletion!,parts:[part]}};
  assert.equal(inferTaskScope(noAnswers,pages).writtenCompletion?.status,"unclear");
  part.label="默写编号跳号，无法确认是否漏词";part.status="unclear";
  assert.equal(inferTaskScope(reportTask,pages).writtenCompletion?.status,"done");
  part.status="blank";
  assert.deepEqual(inferTaskScope(result, pages), result);
  part.label = "印刷词表第7题作答处";
  assert.equal(inferTaskScope(reportTask, pages).writtenCompletion?.status, "incomplete");
});

test("a marked first attempt and two separate unnumbered rewrites on the same page explain completion without changing correctness",()=>{
  const t = task();
  t.writtenCompletion!.parts[4].label = "编号5默写词（旁有×标记）";
  t.evidence.push({...t.evidence[0],excerpt:"另起一行写有两处“测试”，无编号"});
  assert.match(inferTaskScope(t,pages).writtenCompletion!.reason,/第5项旁有叉，另起一行写了两遍“测试”，与订正练习相符/);
  t.writtenCompletion!.parts[4].label = "编号5默写词";
  assert.doesNotMatch(inferTaskScope(t,pages).writtenCompletion!.reason,/与订正练习相符/);
});

test("only photo-supported, identifiable observations become reusable checking experience",()=>{
  const evidence = {fileId:"photo",page:1,excerpt:"原答旁有叉，下一行重复写词"};
  const item = {fileId:"photo",page:1,label:"末行",method:"correction" as const,cue:"另起一行重复写词"};
  const value = {scopeComplete:true,reason:"末行为订正",parts:[{label:"末行",status:"answered" as const,evidence}],verifiedClues:[item]};
  assert.deepEqual(verifiedClues(value),[{...item,excerpt:evidence.excerpt}]);
  for (const changes of [{label:"另一题"},{fileId:"另一页"},{page:2},{cue:"以后都直接判完成"}]) {
    assert.deepEqual(verifiedClues({...value,verifiedClues:[{...item,...changes}]}),[]);
  }
  assert.deepEqual(verifiedClues({...value,parts:[{...value.parts[0],status:"unclear"}]}),[]);
  assert.deepEqual(verifiedClues({...value,verifiedClues:[]}),[]);
});
