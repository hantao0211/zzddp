import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {HomeworkStore} from "../src/server/homework/store";
import {DailyReportSchema,type DailyReport} from "../src/domain/homework";
import {homeworkSummary} from "../src/domain/homework-summary";
import {homeworkTaskDetail} from "../src/domain/homework-task-detail";
const date="2026-11-20",routingNote="指定交给其他作业的照片未用作本项依据。";
function fixture(grading=false){
 const root=mkdtempSync(join(tmpdir(),"xiaobu-selected-cache-"));let clock=Date.parse(date+'T12:00:00+08:00');const store=new HomeworkStore(root,()=>clock,null,true,grading);
 const assignments=[{subject:"英语",title:"课外英语习题（除默写部分）",requirement:"完成英语习题，未写明具体页码",format:"written"},{subject:"英语",title:"课外默写单词16个",requirement:"默写16个单词并订正",format:"other"}];
 function record(kind:"memo"|"homework",seed:string,count=1,targetTaskId?:string){
  clock++;store.db.exec("UPDATE jobs SET status='done'");
  const u=store.begin({date,kind,targetTaskId,files:Array.from({length:count},(_,i)=>({name:`${seed}-${i}.png`,size:1,sha256:createHash('sha256').update(seed+i).digest('hex')}))});
  for(const file of u.files){store.stored(file.id,"image/png");store.setPages(file.id,[{id:file.id+'-p1',file_id:file.id,number:1}]);}
  store.finalize(u.id);const job=store.claim()!;assert.equal(job.upload_id,u.id);
  const pages=u.files.map(f=>f.id+'-p1'),evidence=(id:string)=>[{fileId:id,page:1,excerpt:"模拟已填写"}];
  store.recognized(job,kind==="memo"?{date,readable:true,assignments:assignments.map(a=>({...a,evidence:evidence(pages[0])})),uncertainties:[]}:{pages:pages.map(fileId=>({fileId,subject:"英语",readable:true,book:seed,printedPage:null,content:"模拟已填写",uncertainties:[]}))},["英语"],false,0,"");store.db.exec("UPDATE jobs SET status='done'");return pages;
 }
 const memo=record("memo","memo"),memoId=store.uploads(date)[0].id;
 const report=DailyReportSchema.parse({date,memoId,updatedAt:"",tasks:assignments.map((a,i)=>({...a,id:`${memoId}:task:${i}`,coverage:"none",missing:[],memoEvidence:[{fileId:memo[0],page:1,excerpt:"模拟备忘录"}],evidence:[]})),unassigned:[],uncertainties:[]});
 const publish=(value:DailyReport)=>store.publish({id:-1,date,revision:store.revision(date),kind:"organize",upload_id:null,attempts:1},value,"processed","");publish(report);
 const unrelated=record("homework","U7-knowledge")[0],exercise=record("homework","Night-animals",2,report.tasks[0].id),dictation=record("homework","dictation",2,report.tasks[1].id);
 const part=(fileId:string,i:number,status="answered")=>({label:`第${i+1}题`,status,evidence:{fileId,page:1,excerpt:"模拟作答"}});
 const evidence=(ids:string[])=>ids.map(fileId=>({fileId,page:1,excerpt:"模拟对应照片"}));
 report.tasks[0]={...report.tasks[0],coverage:"complete",evidence:evidence([...exercise,unrelated]),writtenCompletion:{version:"written-v2",status:"unclear",reason:"另一本练习有看不清的作答",parts:[...exercise.flatMap(p=>[part(p,0)]),part(unrelated,0,"unclear")] as any}};
 report.tasks[1]={...report.tasks[1],coverage:"partial",missing:[routingNote],evidence:evidence(dictation),writtenCompletion:{version:"written-v2",status:"unclear",reason:"指定作业范围的照片还不完整，不能判断整项是否写完。",parts:dictation.flatMap(p=>Array.from({length:8},(_,i)=>part(p,i))) as any}};
 publish(report);
 const cache=(task:DailyReport["tasks"][number],ids:string[],single:boolean,value:unknown)=>{const key=(single?"written-completion:single-page-v1:":"written-completion:v2:")+createHash('sha256').update(JSON.stringify({title:task.title,requirement:task.requirement,subject:task.subject,pages:ids.map(fileId=>({fileId,page:1,printedPage:null}))})).digest('hex');store.db.prepare('INSERT OR REPLACE INTO analysis_cache(key,result) VALUES(?,?)').run(key,JSON.stringify(value));return key;};
 const exerciseKeys=exercise.map(p=>cache(report.tasks[0],[p],true,{scopeComplete:true,reason:"本页均已填写",parts:[part(p,0)]}));
 const dictationKey=cache(report.tasks[1],dictation,false,{scopeComplete:true,reason:"两页16项均已填写",parts:report.tasks[1].writtenCompletion!.parts});
 // Exhausted quota must not stop a read from reusing already validated checks.
 store.db.prepare('INSERT INTO budget(day,calls) VALUES(?,100) ON CONFLICT(day) DO UPDATE SET calls=100').run(date);
 const digest=()=>JSON.stringify((store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string}[]).map(({name})=>[name,store.db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
 return {store,report,publish,exercise,dictation,unrelated,exerciseKeys,dictationKey,digest,close(){store.close();rmSync(root,{recursive:true,force:true});}};
}
test("selected scope reuses its complete page checks, removes unrelated unclear work and routing artifacts without any writes or calls",()=>{
 const f=fixture();try{
  const before=f.digest(),state=f.store.snapshot(date),[exercise,dictation]=state.report!.tasks;
  assert.deepEqual(exercise.evidence.map(e=>e.fileId),f.exercise);assert.equal(exercise.writtenCompletion?.status,"done");assert.equal(exercise.writtenCompletion?.parts.length,2);
  assert.equal(dictation.coverage,"complete");assert.deepEqual(dictation.missing,[]);assert.equal(dictation.writtenCompletion?.status,"done");assert.equal(dictation.writtenCompletion?.parts.length,16);
  assert.ok(homeworkSummary(state)!.rows.every(r=>r.photo.text==="已收到"&&r.activity.text==="已做完"));
  assert.equal(homeworkTaskDetail(state,exercise).homework.photos.length,2);assert.equal(homeworkTaskDetail(state,dictation).concerns.length,0);
  assert.equal(f.digest(),before,"Reads must preserve reports, original extraction, jobs, caches and quota");
 }finally{f.close();}
});
test("missing single-page checks do not inherit another worksheet's completion",()=>{
 const f=fixture();try{f.store.db.prepare('DELETE FROM analysis_cache WHERE key=?').run(f.exerciseKeys[1]);const task=f.store.snapshot(date).report!.tasks[0];assert.deepEqual(task.evidence.map(e=>e.fileId),f.exercise);assert.equal(task.writtenCompletion,null);}finally{f.close();}
});
test("grading uses the same selected photos as the visible task and excludes stale automatically borrowed worksheets",()=>{
 const f=fixture(true);try{
  const before=f.store.quota(),batches=f.store.grading.results(date).batches;
  assert.equal(batches.length,4);assert.ok(!batches.some(b=>b.primaryPageId===f.unrelated));
  const exercise=f.store.db.prepare("SELECT source FROM grading_runs WHERE active=1").all() as {source:string}[];
  assert.deepEqual(new Set(exercise.map(r=>JSON.parse(r.source)).filter(s=>s.taskIds.includes(f.report.tasks[0].id)).map(s=>s.primaryPageId)),new Set(f.exercise));
  f.publish(f.report);assert.equal(f.store.grading.results(date).batches.length,4);
  assert.deepEqual(f.store.quota(),before,"Scope repair must not call AI or reset the budget");
 }finally{f.close();}
});
test("parent retry retires a historical wrong-scope failure without deleting any archived work or requeueing it",()=>{
 const f=fixture(true);try{
  const base=f.store.db.prepare("SELECT source FROM grading_runs WHERE active=1 LIMIT 1").get() as {source:string};
  const source={...JSON.parse(base.source),primaryPageId:f.unrelated,pages:[f.store.page(f.unrelated)],taskIds:[f.report.tasks[0].id]};
  f.store.db.prepare("INSERT INTO grading_runs(id,date,primary_page_id,source,status,attempts,created_at,updated_at) VALUES('legacy-wrong-scope',?,?,?,'failed',3,'old','old')").run(date,f.unrelated,JSON.stringify(source));
  const old=f.store.db.prepare("SELECT * FROM grading_runs WHERE id!='legacy-wrong-scope' ORDER BY id").all(),quota=f.store.quota();
  assert.equal(f.store.grading.summary(date).failed,1);assert.equal(f.store.grading.retry(date),0);
  assert.equal(f.store.grading.summary(date).failed,0);
  const legacy=f.store.db.prepare("SELECT active,status,attempts,source FROM grading_runs WHERE id='legacy-wrong-scope'").get()!;
  assert.equal(legacy.active,0);assert.equal(legacy.status,'failed');assert.equal(legacy.attempts,3);assert.equal(legacy.source,JSON.stringify(source));
  assert.deepEqual(f.store.db.prepare("SELECT * FROM grading_runs WHERE id!='legacy-wrong-scope' ORDER BY id").all(),old);
  assert.deepEqual(f.store.quota(),quota);assert.equal(f.store.grading.reconcileSelectedScope(date),0);
 }finally{f.close();}
});
test("incomplete scope, a real blank answer and invalid cache evidence never become done",()=>{
 for(const mode of ["scope","blank","forged","missing"]){const f=fixture();try{
  const row=f.store.db.prepare('SELECT result FROM analysis_cache WHERE key=?').get(f.dictationKey) as {result:string};const value=JSON.parse(row.result);
  if(mode==="scope")value.scopeComplete=false;if(mode==="blank")value.parts[0].status="blank";if(mode==="forged")value.parts[0].evidence.fileId=f.unrelated;
  f.store.db.prepare('UPDATE analysis_cache SET result=? WHERE key=?').run(JSON.stringify(value),f.dictationKey);
  if(mode==="missing"){f.report.tasks[1].missing.push("第2页第3项未作答。");f.publish(f.report);}
  const task=f.store.snapshot(date).report!.tasks[1];assert.notEqual(task.writtenCompletion?.status,"done",mode);if(mode==="blank")assert.equal(task.writtenCompletion?.status,"incomplete");if(mode==="missing")assert.ok(task.missing.includes("第2页第3项未作答。"));
 }finally{f.close();}}
});

test("old memo checks are removed on read only when the remaining photo evidence supports completion", () => {
  const f = fixture();
  try {
    const task = f.report.tasks[1];
    const prior = task.writtenCompletion!;
    prior.parts.push({ label:"备忘录上的完成勾选", status:"blank", evidence:prior.parts[0].evidence });
    prior.status = "incomplete";
    task.coverage = "complete";
    task.missing = [];
    f.publish(f.report);
    const cache = { scopeComplete:true, reason:"有清单标记", parts:prior.parts };
    const update = f.store.db.prepare("UPDATE analysis_cache SET result=? WHERE key=?");
    update.run(JSON.stringify(cache), f.dictationKey);
    const before = f.digest();
    const snapshot = f.store.snapshot(date);
    assert.equal(homeworkSummary(snapshot)!.rows[1].activity.text, "已做完");
    assert.deepEqual(homeworkTaskDetail(snapshot, snapshot.report!.tasks[1]).parts, []);
    assert.equal(f.digest(), before);
    update.run(JSON.stringify({...cache, scopeComplete:false}), f.dictationKey);
    assert.equal(f.store.snapshot(date).report!.tasks[1].writtenCompletion?.status, "unclear");
  } finally { f.close(); }
});
