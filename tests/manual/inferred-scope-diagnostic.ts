// Read-only report/extraction metadata only, no child image reads or model calls.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { inferredReportScope } from "../../src/domain/inferred-scope";
import { DailyReportSchema, ExtractedHomeworkSchema } from "../../src/domain/homework";
const db=new DatabaseSync("/var/lib/private/xiaobu-assistant/learning/homework.sqlite",{readOnly:true});
try{
 const date="2026-11-20",row=db.prepare("SELECT report FROM days WHERE date=?").get(date) as {report:string};
 const allowed=new Set((db.prepare("SELECT p.id FROM pages p JOIN files f ON f.id=p.file_id JOIN uploads u ON u.id=f.upload_id WHERE u.date=? AND u.kind='homework' AND f.stored=1").all(date) as {id:string}[]).map(p=>p.id));
 const pages=(db.prepare("SELECT result FROM uploads WHERE date=? AND kind='homework' AND result IS NOT NULL").all(date) as {result:string}[]).flatMap(r=>ExtractedHomeworkSchema.parse(JSON.parse(r.result)).pages).filter(p=>allowed.has(p.fileId));
 const report=inferredReportScope(DailyReportSchema.parse(JSON.parse(row.report)),pages);
 const tasks=report.tasks.filter(t=>["家默","练L19"].includes(t.title));assert.equal(tasks.length,2);
 for(const task of tasks){assert.ok(task.inferredScope);assert.equal(task.writtenCompletion?.status,"done");}
 assert.equal((db.prepare("SELECT report FROM days WHERE date=?").get(date) as {report:string}).report,row.report);
 console.log(JSON.stringify({readOnly:true,noImageReads:true,noAI:true,tasks:tasks.map(t=>({title:t.title,coverage:t.coverage,completion:t.writtenCompletion?.status,checkedParts:t.writtenCompletion?.parts.length,inferred:!!t.inferredScope})),rawReportUnchanged:true}));
}finally{db.close();}
