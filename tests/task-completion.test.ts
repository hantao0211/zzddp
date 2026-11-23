import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HomeworkStore } from "../src/server/homework/store";
import { HomeworkRewards } from "../src/server/homework/rewards";
import { ReadingStore } from "../src/server/reading/store";
import { HomeworkConversation } from "../src/server/homework/conversation";
import { DailyReportSchema } from "../src/domain/homework";
import { taskSubmission } from "../src/domain/task-submission";
import { homeworkSummary } from "../src/domain/homework-summary";
import type { Viewer } from "../src/domain/accounts";
const date="2026-11-22",child:Viewer={id:"synthetic-child",name:"模拟孩子",role:"child",username:"qa"};
function fixture(written=false){const root=mkdtempSync(join(tmpdir(),"xiaobu-self-complete-")),now=()=>Date.parse(date+'T12:00:00+08:00');let store=new HomeworkStore(join(root,"learning"),now);const reading=new ReadingStore(join(root,"reading"),now);
 const memo=store.begin({date,kind:"memo",files:[{name:"synthetic.png",size:1,sha256:"a".repeat(64)}]});const file=memo.files[0];store.stored(file.id,"image/png");store.setPages(file.id,[{id:file.id+'-p1',file_id:file.id,number:1}]);store.finalize(memo.id);const job=store.claim()!;
 const assignments=[{subject:"语文",title:"复习单元六",requirement:"复习单元六，无额外书面要求。",format:"other",evidence:[{fileId:file.id+'-p1',page:1,excerpt:"复习单元六"}]},...(written?[{subject:"数学",title:"数学练习册P74",requirement:"完成练习册P74",format:"written",evidence:[{fileId:file.id+'-p1',page:1,excerpt:"数学P74"}]}]:[])];
 store.recognized(job,{date,readable:true,assignments,uncertainties:[]},["语文"],false,0,"");store.db.exec("UPDATE jobs SET status='done'");store.bump(date);store.db.exec("UPDATE jobs SET status='done'");
 const report=DailyReportSchema.parse({date,memoId:memo.id,updatedAt:"",tasks:assignments.map((a,i)=>({...a,id:`${memo.id}:task:${i}`,memoEvidence:a.evidence,evidence:[],coverage:"none",missing:["没有上传照片"]})),unclassified:[],unassigned:[],uncertainties:[]});store.publish({id:-1,date,kind:"organize",upload_id:null,revision:store.revision(date),attempts:1},report,"processed","");
 return {get store(){return store;},reading,memo:memo.id,reopen(){store.close();store=new HomeworkStore(join(root,"learning"),now);},close(){store.close();reading.close();rmSync(root,{recursive:true,force:true});}};}
test("automatic submission choice excludes explicit written work, even if its old AI format is reading",()=>{
 for(const requirement of ["复习后写词语两遍","阅读并完成读后感","完成阅读理解","朗读后上传录音","复习单元六；需提交书面作业。"])assert.equal(taskSubmission({title:"今天的阅读",requirement,format:"reading"}),"written");
 for(const [title,requirement,format,want] of [["复习单元六","没有额外书面要求","other","self"],["朗读课文","朗读三遍","oral","self"],["阅读","阅读第10—20页","reading","self"],["复习","复习后抄写词语两遍","reading","written"],["课本","完成第2题","oral","written"],["家默","家默16词","other","written"],["看不清","原文不明","other","unknown"]])assert.equal(taskSubmission({title,requirement,format}),want);
});
test("self completion survives refresh/restart, is idempotent, can be undone, and never changes photos, jobs or AI usage",()=>{const f=fixture();try{
 const initial=f.store.snapshot(date),task=initial.report!.tasks[0],raw=f.store.db.prepare('select report from days where date=?').get(date),jobs=f.store.db.prepare('select count(*) as n from jobs').get(),quota=f.store.quota();assert.ok(task.completionToken);assert.equal(homeworkSummary(initial)!.rows[0].activity.text,"待完成");
 f.store.completions.set(date,task.id,task.completionToken!,true,child);f.store.completions.set(date,task.id,task.completionToken!,true,child);assert.equal(f.store.completions.revision(date),1);assert.equal(homeworkSummary(f.store.snapshot(date))!.rows[0].activity.text,"已完成");assert.equal(f.store.snapshot(date).report!.tasks[0].selfCompletion?.confirmedBy,child.name);
 f.reopen();assert.ok(f.store.snapshot(date).report!.tasks[0].selfCompletion);assert.deepEqual(f.store.db.prepare('select report from days where date=?').get(date),raw);assert.deepEqual(f.store.db.prepare('select count(*) as n from jobs').get(),jobs);assert.deepEqual(f.store.quota(),quota);
 f.store.completions.set(date,task.id,task.completionToken!,false,child);assert.equal(homeworkSummary(f.store.snapshot(date))!.rows[0].activity.text,"待完成");assert.equal(f.store.completions.revision(date),2);
 }finally{f.close();}});
test("a stale requirement, another day, and a written task cannot reuse a completion token",()=>{const f=fixture(true);try{
 const [task,written]=f.store.snapshot(date).report!.tasks;assert.equal(written.completionToken,undefined);assert.throws(()=>f.store.completions.set(date,written.id,task.completionToken!,true,child),/要求已更新/);assert.throws(()=>f.store.completions.set('2026-11-21',task.id,task.completionToken!,true,child),/要求已更新/);
 const context=new HomeworkConversation(f.store);const entry=context.context(date).entries[0];context.editEntry({requestId:crypto.randomUUID(),date,revision:f.store.revision(date),entryId:entry.entryId,entry:{subject:entry.subject,title:entry.title,requirement:"复习后抄写词语两遍",format:"written"}},child.id);
 assert.throws(()=>f.store.completions.set(date,task.id,task.completionToken!,true,child),/要求已更新/);assert.equal(f.store.snapshot(date).report!.tasks[0].completionToken,undefined);
 }finally{f.close();}});
test("self confirmation notifies the reward checker after an earlier incomplete check; repeated confirmation never duplicates reward",()=>{const f=fixture();try{
 const rewards=new HomeworkRewards(f.store,f.reading);rewards.tick();assert.equal(f.reading.balance(),0);const task=f.store.snapshot(date).report!.tasks[0];f.store.completions.set(date,task.id,task.completionToken!,true,child);rewards.tick();rewards.tick();assert.equal(f.reading.balance(),1);f.store.completions.set(date,task.id,task.completionToken!,false,child);f.store.completions.set(date,task.id,task.completionToken!,true,child);rewards.tick();assert.equal(f.reading.balance(),1);
 }finally{f.close();}});
test("history requirement options are optional, bounded and selected by the user, not silently applied to AI context",()=>{const f=fixture();try{const context=new HomeworkConversation(f.store);assert.equal(context.context(date).requirementOptions,undefined);const options=context.context(date,undefined,true).requirementOptions!;assert.ok(options.length>0&&options.length<=20);assert.equal(options[0].title,"复习单元六");}finally{f.close();}});

test("editing a nonwritten requirement keeps a usable button during recheck and never reuses an old confirmation",()=>{const f=fixture();try{
 const before=f.store.snapshot(date),task=before.report!.tasks[0];
 f.store.completions.set(date,task.id,task.completionToken!,true,child);
 const context=new HomeworkConversation(f.store),state=context.context(date),{entryId,...entry}=state.entries[0];
 context.editEntry({requestId:crypto.randomUUID(),date,revision:state.revision,entryId,entry:{...entry,title:"朗读课文",requirement:"朗读课文三遍，无需提交书面。",format:"oral"}},child.id);
 const pending=f.store.snapshot(date),updated=pending.report!.tasks[0],row=homeworkSummary(pending)!.rows[0];
 assert.equal(pending.pending,true);assert.deepEqual(pending.memoEdits,[task.id]);
 assert.equal(updated.title,"朗读课文");assert.ok(updated.completionToken);assert.notEqual(updated.completionToken,task.completionToken);
 assert.equal(updated.selfCompletion,undefined);assert.equal(row.selfTask,true);assert.equal(row.activity.text,"待完成");
 assert.throws(()=>f.store.completions.set(date,task.id,task.completionToken!,true,child),/要求已更新/);
 f.store.completions.set(date,task.id,updated.completionToken!,true,child);
 assert.equal(homeworkSummary(f.store.snapshot(date))!.rows[0].activity.text,"已完成");
 assert.equal(JSON.parse((f.store.db.prepare('SELECT report FROM days WHERE date=?').get(date) as {report:string}).report).tasks[0].title,task.title);
 }finally{f.close();}});
