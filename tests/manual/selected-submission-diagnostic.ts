// Read-only metadata diagnosis. No image reads, model calls, queue changes or database writes.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { HomeworkStore } from "../../src/server/homework/store";
import { selectedSubmissionReport } from "../../src/server/homework/selected-submission";
import { DailyReportSchema } from "../../src/domain/homework";
const db=new DatabaseSync('/var/lib/private/xiaobu-assistant/learning/homework.sqlite',{readOnly:true});
try{
 const date='2026-11-20',raw=db.prepare('SELECT report FROM days WHERE date=?').get(date) as {report:string};
 const store=Object.assign(Object.create(HomeworkStore.prototype),{db,writtenCompletionEnabled:true}) as HomeworkStore;
 const result=selectedSubmissionReport(store,DailyReportSchema.parse(JSON.parse(raw.report)));
 const task=result.tasks.find(t=>t.title==='2#本订签')!;assert.ok(task?.selectedSubmission);assert.equal(task.coverage,'complete');assert.equal(task.writtenCompletion?.status,'done');assert.deepEqual(task.writtenCompletion.parts.map(p=>p.label),['订正','签字']);
 assert.equal((db.prepare('SELECT report FROM days WHERE date=?').get(date) as {report:string}).report,raw.report);
 console.log(JSON.stringify({date,title:task.title,received:task.coverage,completion:task.writtenCompletion.status,checked:task.writtenCompletion.parts.map(p=>p.label),selectedPages:task.selectedSubmission.pageIds.length,rawReportUnchanged:true,noAI:true,noImageReads:true}));
}finally{db.close();}
