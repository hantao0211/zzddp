import { record, failureCode } from "../diagnostics/events";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IncomingMessage } from "node:http";
import { z } from "zod";
import { examReadingChecks, examReread, emptyExam, readExamHints, examMeta, examManifest, markedPage, observation, type ExamMeta, type ExamRecord, type ExamPage, type ExamDetail, type Observation } from "../../domain/assessment";
import { AIServiceError, type AIImage, type StructuredAI } from "../ai/provider";
import { detectMime } from "../homework/images";
import { HomeworkError } from "../homework/store";
import type { HomeworkExecution } from "../homework/execution";
import type { PracticeStore } from "./store";

const convert = promisify(execFile);
const digest = (v: string|Buffer) => createHash("sha256").update(v).digest("hex");
type StoredPage = ExamPage & {exam_id:string; sha:string; bytes:number; mime:string; attempts:number};
function examStatus(states:string[]){
  if(states.includes("running"))return "整理中";
  if(states.includes("queued"))return "等待识读";
  if(states.includes("awaiting"))return "待补传";
  if(states.includes("failed"))return "识读未完成";
  return "已整理";
}

export class Assessments {
  readonly directory:string;
  constructor(readonly store:PracticeStore) {
    this.directory=join(store.directory,"assessments"); mkdirSync(this.directory,{recursive:true,mode:0o700});
    store.db.exec(`CREATE TABLE IF NOT EXISTS exams(id TEXT PRIMARY KEY,metadata TEXT NOT NULL,date TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS exam_photo_intakes(exam_id TEXT PRIMARY KEY REFERENCES exams(id), upload_day TEXT NOT NULL, locked TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS exam_page_hints(page_id TEXT PRIMARY KEY REFERENCES exam_pages(id), hints TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS exam_dates ON exams(date DESC);
      CREATE TABLE IF NOT EXISTS exam_pages(id TEXT PRIMARY KEY,exam_id TEXT NOT NULL REFERENCES exams(id),number INTEGER NOT NULL,sha TEXT NOT NULL,bytes INTEGER NOT NULL,mime TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'awaiting',coverage TEXT NOT NULL DEFAULT 'partial',note TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,UNIQUE(exam_id,number));
      CREATE TABLE IF NOT EXISTS exam_questions(id TEXT PRIMARY KEY,page_id TEXT NOT NULL REFERENCES exam_pages(id),payload TEXT NOT NULL,verdict TEXT NOT NULL,revision INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS exam_questions_page ON exam_questions(page_id);
      CREATE TABLE IF NOT EXISTS exam_reviews(id INTEGER PRIMARY KEY,question_id TEXT NOT NULL,before_data TEXT,after_data TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS exam_explanations (
        id TEXT PRIMARY KEY, question_id TEXT NOT NULL REFERENCES exam_questions(id), revision INTEGER NOT NULL,
        note TEXT NOT NULL, actor TEXT NOT NULL, status TEXT NOT NULL, result TEXT, learned_subject TEXT);
      CREATE INDEX IF NOT EXISTS exam_explanation_question ON exam_explanations(question_id);
      CREATE INDEX IF NOT EXISTS exam_explanation_work ON exam_explanations(status);
      UPDATE exam_explanations SET status='failed' WHERE status='running';
      UPDATE exam_pages SET status='failed',note='整理被中断，可从原照片重试。' WHERE status='running';`);
  }
  page(id:string) {
    const row=this.store.db.prepare("SELECT * FROM exam_pages WHERE id=?").get(id) as StoredPage|undefined;
    if(!row)throw new HomeworkError(404,"试卷页不存在。");return row;
  }
  list(offset:number,limit:number) {
    const db=this.store.db;
    const rows=db.prepare(`SELECT e.id,e.metadata,count(*) pages,sum(p.status='done') done,
      group_concat(p.status) states, min(CASE WHEN p.status='failed' THEN p.number END) firstFailedPage FROM (SELECT * FROM exams ORDER BY date DESC,created_at DESC,id LIMIT ? OFFSET ?) e JOIN exam_pages p ON p.exam_id=e.id
      GROUP BY e.id ORDER BY e.date DESC,e.created_at DESC,e.id`).all(limit,offset) as {id:string;metadata:string;pages:number;done:number;states:string;firstFailedPage:number|null}[];
    return {items:rows.map(({metadata,states,...row})=>({...JSON.parse(metadata) as ExamMeta,...row,status:examStatus(states.split(","))})),total:Number(db.prepare("SELECT COUNT(*) n FROM exams").get()!.n)};
  }
  detail(id:string):ExamDetail {
    const row=this.store.db.prepare("SELECT metadata FROM exams WHERE id=?").get(id);
    if(!row)throw new HomeworkError(404,"找不到这份试卷。");
    const pages=this.store.db.prepare("SELECT id,number,status,note,coverage FROM exam_pages WHERE exam_id=? ORDER BY number").all(id) as ExamPage[];
    const done=pages.filter(p=>p.status==="done").length;
    const exam:ExamRecord={...JSON.parse(String(row.metadata)),id,pages:pages.length,done,status:examStatus(pages.map(p=>p.status))};
    const questions=this.store.db.prepare("SELECT q.id,q.page_id,q.revision,q.payload,f.id feedback_id,f.revision feedback_revision,f.note,f.status,f.result,f.learned_subject FROM exam_questions q JOIN exam_pages p ON q.page_id=p.id LEFT JOIN exam_explanations f ON f.rowid=(SELECT max(rowid) FROM exam_explanations WHERE question_id=q.id) WHERE p.exam_id=? ORDER BY p.number,q.rowid").all(id);
    const savedChecks=this.store.db.prepare("SELECT f.id,q.page_id pageId,f.learned_subject subject,json_extract(f.result,'$.check') AS method FROM exam_explanations f JOIN exam_questions q ON q.id=f.question_id JOIN exam_pages p ON p.id=q.page_id WHERE p.exam_id=? AND f.learned_subject IS NOT NULL ORDER BY f.rowid").all(id).map(row=>({id:String(row.id),pageId:String(row.pageId),subject:String(row.subject),check:row.method as keyof typeof examReadingChecks}));
    return {exam,pages,savedChecks,questions:questions.map(q=>({...JSON.parse(String(q.payload)),id:q.id,pageId:q.page_id,revision:q.revision,feedback:q.feedback_id?{
      id:q.feedback_id,revision:q.feedback_revision,note:q.note,status:q.status,result:q.result?JSON.parse(String(q.result)):null,learned:!!q.learned_subject
    }:undefined}))};
  }
  reserve(input:unknown) {
    const {meta: supplied,scope,pages}=examManifest.parse(input);
    const meta=supplied??{...emptyExam,scope:scope??"curricular"};
    if(meta.date && meta.date>this.store.today())throw new HomeworkError(400,"请填写已经发生的测验日期。");
    const id=digest(JSON.stringify(pages.map(p=>p.sha)));
    return this.store.homework.transaction(()=>{
      const prior=this.store.db.prepare("SELECT metadata FROM exams WHERE id=?").get(id);
      if(prior&&supplied&&prior.metadata!==JSON.stringify(meta))throw new HomeworkError(409,"这些原图已有档案，请在全部试卷中打开并修改资料。");
      if(prior && scope){
        const intake=this.store.db.prepare("SELECT locked FROM exam_photo_intakes WHERE exam_id=?").get(id);
        const alreadySelected=intake ? (JSON.parse(String(intake.locked)) as string[]).includes("scope") : true;
        if(!alreadySelected || JSON.parse(String(prior.metadata)).scope!==scope)
          throw new HomeworkError(409,"这些照片已经上传，请在原试卷的「试卷资料」中核对归属。");
      }
      if(!prior){
        const used=Number(this.store.db.prepare("SELECT COALESCE(sum(bytes),0) n FROM exam_pages").get()!.n);
        if(used+pages.reduce((sum,p)=>sum+p.bytes,0)>4*1024**3)throw new HomeworkError(507,"试卷原件空间不足，请联系家长。");
        this.store.db.prepare("INSERT INTO exams VALUES(?,?,?,?)").run(id,JSON.stringify(meta),meta.date??this.store.today(),this.store.time());
        if(!supplied)this.store.db.prepare("INSERT INTO exam_photo_intakes(exam_id,upload_day,locked) VALUES(?,?,?)").run(id,this.store.today(),JSON.stringify(scope?["scope"]:[]));
        pages.forEach((p,i)=>this.store.db.prepare("INSERT INTO exam_pages(id,exam_id,number,sha,bytes) VALUES(?,?,?,?,?)").run(randomUUID(),id,i+1,p.sha,p.bytes));
      }
      return this.detail(id);
    });
  }
  editMeta(id:string,raw:unknown,actor:string){
    const {previous,meta}=z.object({previous:examMeta,meta:examMeta}).parse(raw);
    if(meta.date && meta.date>this.store.today())throw new HomeworkError(400,"请核对测验日期。");
    return this.store.homework.transaction(()=>{
      const row=this.store.db.prepare("SELECT metadata FROM exams WHERE id=?").get(id);
      if(!row)throw new HomeworkError(404,"找不到这份试卷。");
      if(row.metadata===JSON.stringify(meta))return {saved:true};
      if(row.metadata!==JSON.stringify(previous))throw new HomeworkError(409,"资料刚被修改，请重新打开。");
      const intake=this.store.db.prepare("SELECT locked,upload_day FROM exam_photo_intakes WHERE exam_id=?").get(id);
      if(intake){
        const locked=new Set<string>(JSON.parse(String(intake.locked)));
        for(const key of Object.keys(previous) as (keyof ExamMeta)[])if(previous[key]!==meta[key])locked.add(key);
        this.store.db.prepare("UPDATE exam_photo_intakes SET locked=? WHERE exam_id=?").run(JSON.stringify([...locked]),id);
      }
      this.store.db.prepare("UPDATE exams SET metadata=?,date=COALESCE(?,date) WHERE id=?").run(JSON.stringify(meta),meta.date??intake?.upload_day??null,id);
      this.store.db.prepare("INSERT INTO exam_reviews(question_id,before_data,after_data,actor,created_at) VALUES(?,?,?,?,?)").run(id,String(row.metadata),JSON.stringify(meta),actor,this.store.time());
      return {saved:true};
    });
  }
  async receive(id:string,req:IncomingMessage) {
    const page=this.page(id);
    if(page.status!=="awaiting"){req.resume();return {saved:true};}
    if(Number(req.headers["content-length"])!==page.bytes)throw new HomeworkError(400,"照片大小不匹配。");
    const parts:Buffer[]=[];let total=0;
    for await(const chunk of req){total+=chunk.length;if(total>page.bytes)throw new HomeworkError(413,"照片过大。");parts.push(Buffer.from(chunk));}
    const bytes=Buffer.concat(parts);
    if(total!==page.bytes||digest(bytes)!==page.sha)throw new HomeworkError(400,"照片未完整上传，请重试。");
    const mime=detectMime(bytes);
    if(!["image/jpeg","image/png","image/webp"].includes(mime))throw new HomeworkError(415,"请选择 JPG、PNG 或 WebP 格式的试卷照片。");
    const path=join(this.directory,id);writeFileSync(path+".part",bytes,{mode:0o600});renameSync(path+".part",path);
    this.store.db.prepare("UPDATE exam_pages SET mime=?,status='queued' WHERE id=? AND status='awaiting'").run(mime,id);
    return {saved:true};
  }
  photo(id:string){const p=this.page(id);if(!p.mime)throw new HomeworkError(404,"该页尚未上传。");return {mime:p.mime,bytes:readFileSync(join(this.directory,id))};}
  retry(id:string){const page=this.page(id);if(page.status!=="failed")throw new HomeworkError(409,"当前页面没有失败任务。");this.store.db.prepare("UPDATE exam_pages SET status='queued',note='' WHERE id=?").run(id);return {saved:true};}
  async tick(execution:HomeworkExecution) {
    const db=this.store.db;
    const p=db.prepare("SELECT * FROM exam_pages WHERE status='queued' ORDER BY rowid LIMIT 1").get() as StoredPage|undefined;
    if(!p)return this.processExplanation(execution);
    db.prepare("UPDATE exam_pages SET status='running',attempts=attempts+1 WHERE id=?").run(p.id);
    try {
      const meta=JSON.parse(String(db.prepare("SELECT metadata FROM exams WHERE id=?").get(p.exam_id)!.metadata)) as ExamMeta;
      const image=await this.aiImage(p.id);
      const ai=execution.forJob(undefined,undefined,{date:meta.date??this.store.today(),title:"试卷整理："+(meta.title??"已批试卷"),pageId:p.id,attempt:p.attempts+1});
      const readingChecks=this.readingChecks(meta.subject);
      const context={subject:meta.subject,readingChecks};
      const key=digest(JSON.stringify([p.sha,meta.subject,readingChecks]));
      const previousCutoff=p.attempts>0 && db.prepare(`SELECT 1 FROM homework_ai_calls WHERE page_id=?
        AND task='read_marked_exam' AND error_code IN ('INCOMPLETE_RESPONSE','EXAM_OUTPUT_LIMIT','EXAM_STOP_UNKNOWN') LIMIT 1`).get(p.id);
      const result=previousCutoff
        ? await this.readPageInGroups(execution,ai,image,key,context)
        : await execution.cached("marked-page-v4:"+key,()=>ai.run("read_marked_exam",markedPage,context,[image]));
      this.savePage(p.id,result);
      record({ event: "exam.process", ref: p.id.slice(0, 8), attempt: p.attempts + 1 });
    } catch(e) {
      record({ event: "exam.process", error: true, attempt: p.attempts + 1, ref: p.id.slice(0, 8), code: failureCode(e) });
      const again=p.attempts===0 && e instanceof AIServiceError && e.retryable;
      const split=e instanceof AIServiceError && ["EXAM_OUTPUT_LIMIT","EXAM_STOP_UNKNOWN","INCOMPLETE_RESPONSE"].includes(e.code);
      const reason=e instanceof AIServiceError && e.code.startsWith("EXAM_")?e.message:"";
      const note=again?(split?"正在准备按题号分组识读。":"正在用原图重新识读本页。"):e instanceof HomeworkError?e.message:reason+"原图已保存，可由家长重试本页。";
      db.prepare("UPDATE exam_pages SET status=?,note=? WHERE id=?").run(again?"queued":"failed",note,p.id);
    }
    return true;
  }
  private async readPageInGroups(execution:HomeworkExecution,ai:StructuredAI,image:AIImage,key:string,context:object) {
    const pageKey="marked-groups-v1:"+key;
    const outline=await execution.cached(pageKey+":index",async()=>{
      const target=z.object({label:z.string().trim().min(1).max(180),anchor:z.string().trim().min(1).max(160)});
      const index=await ai.run("index_exam_page",z.object({
        targets:z.array(target).min(1).max(80),coverage:z.enum(["complete","partial"]),note:z.string().max(500)
      }),context,[image]);
      if(new Set(index.targets.map(t=>t.label.normalize("NFKC"))).size!==index.targets.length)
        throw new AIServiceError("EXAM_INDEX_CONFLICT",true,"题目目录有重复编号，尚未合并本页。");
      return index;
    });
    const questions:Observation[]=[];
    let coverage=outline.coverage;
    let metadata:unknown;
    const notes=new Set([outline.note]);
    for(let offset=0;offset<outline.targets.length;offset+=5){
      const targets=outline.targets.slice(offset,offset+5);
      this.store.db.prepare("UPDATE exam_pages SET note=? WHERE id=? AND status='running'")
        .run(`正在分组识读，已读 ${offset}/${outline.targets.length} 道题。`,image.fileId);
      const group=await execution.cached(pageKey+":"+digest(JSON.stringify(targets)),async()=>{
        const result=await ai.run("read_marked_exam",markedPage,{...context,targets},[image]);
        const byLabel=new Map(result.questions.map(q=>[q.label,q]));
        if(result.questions.length!==targets.length || targets.some(t=>!byLabel.has(t.label)))
          throw new AIServiceError("EXAM_GROUP_MISMATCH",true,"本组回复的题号与卷面目录未对齐。");
        return {...result,questions:targets.map(t=>byLabel.get(t.label)!)};
      });
      questions.push(...group.questions);
      metadata??=group.metadata;
      if(group.coverage==="partial")coverage="partial";
      notes.add(group.note);
    }
    return {questions,metadata,coverage,note:[...notes].filter(Boolean).join(" ").slice(0,500)};
  }
  private async aiImage(pageId:string) {
    const {stdout}=await convert("/usr/bin/convert",["-limit","memory","64MiB","-limit","map","128MiB","-limit","disk","512MiB",join(this.directory,pageId)+"[0]","-auto-orient","-resize","1800x2400>","-background","white","-alpha","remove","-strip","-quality","85","jpeg:-"],{encoding:"buffer",timeout:60000,maxBuffer:3*1024*1024});
    return {fileId:pageId,mimeType:"image/jpeg" as const,base64:stdout.toString("base64")};
  }
  readingChecks(subject:ExamMeta["subject"]){
    if(!subject)return [];
    const rows=this.store.db.prepare("SELECT DISTINCT json_extract(result,'$.check') AS method FROM exam_explanations WHERE learned_subject=? ORDER BY method").all(subject);
    return rows.map(row=>examReadingChecks[row.method as keyof typeof examReadingChecks]).filter(Boolean);
  }
  explain(pageId:string,raw:unknown,actor:string){
    const input=z.object({requestId:z.string().uuid(),questionId:z.string().max(64),revision:z.number().int().positive(),note:z.string().trim().min(1).max(500)}).parse(raw);
    const db=this.store.db;
    const q=db.prepare("SELECT revision FROM exam_questions WHERE id=? AND page_id=?").get(input.questionId,pageId);
    if(!q)throw new HomeworkError(404,"找不到要解释的题目。");
    const old=db.prepare("SELECT * FROM exam_explanations WHERE id=?").get(input.requestId);
    if(old?.question_id===input.questionId && old.note===input.note && old.actor===actor)return {saved:true};
    if(old||q.revision!==input.revision)throw new HomeworkError(409,"题目记录已更新，请重新打开。");
    if(db.prepare("SELECT 1 FROM exam_explanations WHERE question_id=? AND status IN ('queued','running')").get(input.questionId))throw new HomeworkError(409,"小步正在看这道题的原卷。");
    db.prepare("INSERT INTO exam_explanations(id,question_id,revision,note,actor,status) VALUES(?,?,?,?,?,'queued')").run(input.requestId,input.questionId,input.revision,input.note,actor);
    return {saved:true};
  }
  learn(pageId:string,raw:unknown){
    const {id,enabled}=z.object({id:z.string().uuid(),enabled:z.boolean()}).parse(raw);
    const db=this.store.db;
    const row=db.prepare("SELECT f.result,e.metadata FROM exam_explanations f JOIN exam_questions q ON q.id=f.question_id JOIN exam_pages p ON p.id=q.page_id JOIN exams e ON e.id=p.exam_id WHERE f.id=? AND p.id=?").get(id,pageId);
    if(!row)throw new HomeworkError(404,"找不到这次说明。");
    const subject=(JSON.parse(String(row.metadata)) as ExamMeta).subject;
    const result=row.result?examReread.parse(JSON.parse(String(row.result))):null;
    if(enabled&&(!subject||!result?.located||!result.check||!result.evidence))throw new HomeworkError(400,"请先补充科目，并核实原卷依据。");
    db.prepare("UPDATE exam_explanations SET learned_subject=? WHERE id=?").run(enabled?subject:null,id);
    return {saved:true};
  }
  private async processExplanation(execution:HomeworkExecution){
    const db=this.store.db;
    const row=db.prepare("SELECT f.id,f.question_id,f.note,f.revision,q.payload,q.revision current_revision,p.id page_id,e.metadata FROM exam_explanations f JOIN exam_questions q ON q.id=f.question_id JOIN exam_pages p ON p.id=q.page_id JOIN exams e ON e.id=p.exam_id WHERE f.status='queued' ORDER BY f.rowid LIMIT 1").get() as {id:string;question_id:string;note:string;revision:number;current_revision:number;payload:string;page_id:string;metadata:string}|undefined;
    if(!row)return false;
    db.prepare("UPDATE exam_explanations SET status='running' WHERE id=?").run(row.id);
    try{
      if(row.current_revision!==row.revision)throw new HomeworkError(409,"题目已更新。");
      const meta=JSON.parse(row.metadata) as ExamMeta;
      const ai=execution.forJob(undefined,undefined,{date:meta.date??this.store.today(),title:"试卷说明复读",pageId:row.page_id,runId:row.id});
      const result=await ai.run("explain_exam_reading",examReread,{subject:meta.subject,questionId:row.question_id,original:JSON.parse(row.payload),familyNote:row.note,readingChecks:this.readingChecks(meta.subject)},[await this.aiImage(row.page_id)]);
      if(result.questionId!==row.question_id)throw new HomeworkError(422,"原图定位未对应。");
      if(!result.located||!result.evidence){result.check=null;result.change=null;}
      if(result.change&&!result.change.teacherMark.trim())result.change.verdict="uncertain";
      db.prepare("UPDATE exam_explanations SET status='done',result=? WHERE id=?").run(JSON.stringify(result),row.id);
    }catch(e){
      record({event:"exam.explain",error:true,code:failureCode(e)});
      db.prepare("UPDATE exam_explanations SET status='failed' WHERE id=?").run(row.id);
    }
    return true;
  }
  private mergePageHints(pageId:string,raw:unknown){
    const db=this.store.db,examId=this.page(pageId).exam_id;
    const intake=db.prepare("SELECT i.locked,i.upload_day,e.metadata FROM exam_photo_intakes i JOIN exams e ON e.id=i.exam_id WHERE i.exam_id=?").get(examId);
    if(!intake)return;
    db.prepare("INSERT OR REPLACE INTO exam_page_hints VALUES(?,?)").run(pageId,JSON.stringify(readExamHints(raw,this.store.today())));
    const pages=db.prepare("SELECT hints FROM exam_page_hints h JOIN exam_pages p ON p.id=h.page_id WHERE p.exam_id=?").all(examId).map(r=>JSON.parse(String(r.hints)) as Partial<ExamMeta>);
    const locked=new Set<string>(JSON.parse(String(intake.locked)));
    const merged=JSON.parse(String(intake.metadata)) as ExamMeta;
    for(const key of Object.keys(emptyExam) as (keyof ExamMeta)[]){
      if(locked.has(key))continue;
      const values=new Set(pages.map(p=>p[key]).filter(v=>v!=null));
      if(key==="scope"){
        merged.scope=values.has("extracurricular")?"extracurricular":"curricular";
        continue;
      }
      Object.assign(merged,{[key]:values.size===1?[...values][0]:emptyExam[key]});
    }
    if(merged.score!==null && merged.maximum!==null && merged.score>merged.maximum){
      if(!locked.has("score"))merged.score=null;
      if(!locked.has("maximum"))merged.maximum=null;
    }
    db.prepare("UPDATE exams SET metadata=?,date=COALESCE(?,date) WHERE id=?").run(JSON.stringify(examMeta.parse(merged)),merged.date??intake.upload_day,examId);
  }
  savePage(id:string,raw:unknown) {
    const result=markedPage.parse(raw);
    this.store.homework.transaction(()=>{
      this.mergePageHints(id,result.metadata);
      const seen=new Set<string>();
      const manual=this.store.db.prepare("SELECT payload FROM exam_questions WHERE page_id=?").all(id).map(r=>JSON.parse(String(r.payload)) as Observation);
      result.questions.forEach((item,i)=>{
        const key=item.label.normalize("NFKC")+"|"+item.question.trim();
        if(seen.has(key)||manual.some(q=>q.label===item.label&&q.question===item.question))return;
        seen.add(key);
        const value:Observation={...item,verdict:item.confident&&item.teacherMark.trim()?item.verdict:"uncertain"};
        this.store.db.prepare("INSERT OR IGNORE INTO exam_questions VALUES(?,?,?,?,1)").run(digest(id+":"+i),id,JSON.stringify(value),value.verdict);
      });
      this.store.db.prepare("UPDATE exam_pages SET status='done',coverage=?,note=? WHERE id=?").run(result.questions.length?result.coverage:"partial",result.note,id);
    });
  }
  review(pageId:string,raw:unknown,actor:string) {
    const {id,revision,value}=z.object({id:z.string().regex(/^[a-f0-9-]{36,64}$/),revision:z.number().int().min(0),value:observation}).parse(raw);
    const page=this.page(pageId);if(!["done","failed"].includes(page.status))throw new HomeworkError(409,"请等待该页整理完成。");
    return this.store.homework.transaction(()=>{
      const old=this.store.db.prepare("SELECT * FROM exam_questions WHERE id=?").get(id);
      if(old?.page_id===pageId && old.payload===JSON.stringify(value))return {saved:true};
      if((old && old.page_id!==pageId)||Number(old?.revision??0)!==revision)throw new HomeworkError(409,"这道题刚被更新，请重新打开核对。");
      this.store.db.prepare("INSERT INTO exam_questions VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,verdict=excluded.verdict,revision=excluded.revision").run(id,pageId,JSON.stringify(value),value.verdict,revision+1);
      this.store.db.prepare("INSERT INTO exam_reviews(question_id,before_data,after_data,actor,created_at) VALUES(?,?,?,?,?)").run(id,old?String(old.payload):null,JSON.stringify(value),actor,this.store.time());
      return {saved:true};
    });
  }
}
