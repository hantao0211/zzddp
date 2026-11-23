// Actual read path, opened read-only: no constructors, queue changes, model calls or image reads.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {HomeworkStore} from "../../src/server/homework/store";
import {GradingStore} from "../../src/server/homework/grading-store";
import {TaskCompletions} from "../../src/server/homework/task-completions";
import {readReviewPolicy} from "../../src/domain/review-policy";
import {homeworkSummary} from "../../src/domain/homework-summary";
import {homeworkTaskDetail} from "../../src/domain/homework-task-detail";
const db=new DatabaseSync('/var/lib/private/xiaobu-assistant/learning/homework.sqlite',{readOnly:true});
try{
 const digest=()=>createHash('sha256').update(JSON.stringify((db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string}[]).map(({name})=>[name,db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]))).digest('hex');
 const before=digest(),store=Object.assign(Object.create(HomeworkStore.prototype),{db,now:Date.now,writtenCompletionEnabled:true,autoGradingEnabled:true,reviewPolicy:readReviewPolicy({ASSISTANT_REVIEW_TRACE_POLICY:'1'})}) as HomeworkStore;
 Object.assign(store,{grading:Object.assign(Object.create(GradingStore.prototype),{store}),completions:Object.assign(Object.create(TaskCompletions.prototype),{store})});
 const snapshot=store.snapshot('2026-11-20'),summary=homeworkSummary(snapshot)!;
 const titles=['课外英语习题（除默写部分）','课外默写单词16个'];
 const results=titles.map((title,index)=>{const row=summary.rows.find(row=>row.title===title)!,task=snapshot.report!.tasks.find(task=>task.title===title)!,detail=homeworkTaskDetail(snapshot,task);
  assert.ok(row);assert.equal(row.photo.text,'已收到');assert.equal(row.activity.text,'已做完');assert.equal(task.evidence.length,2);assert.equal(task.writtenCompletion?.parts.length,index===0?22:16);assert.equal(detail.homework.photos.length,2);assert.deepEqual(detail.concerns,[]);assert.deepEqual(detail.parts,[]);
  return {title,photo:row.photo.text,activity:row.activity.text,photos:detail.homework.photos.length,answered:task.writtenCompletion?.parts.length};
 });
 assert.equal(digest(),before,'Readonly diagnosis must not change any stored data');
 console.log(JSON.stringify({results,allDatabaseTablesUnchanged:true,noModelCalls:true,noImageReads:true}));
}finally{db.close();}
