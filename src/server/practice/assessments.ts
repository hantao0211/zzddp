import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IncomingMessage } from "node:http";
import { z } from "zod";
import { examMeta, examManifest, markedPage, observation, type ExamMeta, type ExamRecord, type ExamPage, type ExamDetail, type Observation } from "../../domain/assessment";
import { detectMime } from "../homework/images";
import { HomeworkError } from "../homework/store";
import type { HomeworkExecution } from "../homework/execution";
import type { PracticeStore } from "./store";

const convert = promisify(execFile);
const digest = (v: string|Buffer) => createHash("sha256").update(v).digest("hex");
type StoredPage = ExamPage & {exam_id:string; sha:string; bytes:number; mime:string; attempts:number};
export class Assessments {
  readonly directory:string;
  constructor(readonly store:PracticeStore) {
    this.directory=join(store.directory,"assessments"); mkdirSync(this.directory,{recursive:true,mode:0o700});
    store.db.exec(`CREATE TABLE IF NOT EXISTS exams(id TEXT PRIMARY KEY,metadata TEXT NOT NULL,date TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS exam_dates ON exams(date DESC);
      CREATE TABLE IF NOT EXISTS exam_pages(id TEXT PRIMARY KEY,exam_id TEXT NOT NULL REFERENCES exams(id),number INTEGER NOT NULL,sha TEXT NOT NULL,bytes INTEGER NOT NULL,mime TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'awaiting',coverage TEXT NOT NULL DEFAULT 'partial',note TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,UNIQUE(exam_id,number));
      CREATE TABLE IF NOT EXISTS exam_questions(id TEXT PRIMARY KEY,page_id TEXT NOT NULL REFERENCES exam_pages(id),payload TEXT NOT NULL,verdict TEXT NOT NULL,revision INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS exam_questions_page ON exam_questions(page_id);
      CREATE TABLE IF NOT EXISTS exam_reviews(id INTEGER PRIMARY KEY,question_id TEXT NOT NULL,before_data TEXT,after_data TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL);
      UPDATE exam_pages SET status='failed',note='整理被中断，可从原照片重试。' WHERE status='running';`);
  }
  page(id:string) {
    const row=this.store.db.prepare("SELECT * FROM exam_pages WHERE id=?").get(id) as StoredPage|undefined;
    if(!row)throw new HomeworkError(404,"试卷页不存在。");return row;
  }
  list(offset:number,limit:number) {
    const db=this.store.db;
    const rows=db.prepare(`SELECT e.id,e.metadata,count(*) pages,sum(p.status='done') done,
      CASE WHEN sum(p.status='awaiting')>0 THEN '待补传' WHEN sum(p.status='failed')>0 THEN '需核对'
      WHEN sum(p.status!='done')>0 THEN '整理中' ELSE '已整理' END status FROM (SELECT * FROM exams ORDER BY date DESC,created_at DESC,id LIMIT ? OFFSET ?) e JOIN exam_pages p ON p.exam_id=e.id
      GROUP BY e.id ORDER BY e.date DESC,e.created_at DESC,e.id`).all(limit,offset) as {id:string;metadata:string;pages:number;done:number;status:string}[];
    return {items:rows.map(({metadata,...row})=>({...JSON.parse(metadata) as ExamMeta,...row})),total:Number(db.prepare("SELECT COUNT(*) n FROM exams").get()!.n)};
  }
  detail(id:string):ExamDetail {
    const row=this.store.db.prepare("SELECT metadata FROM exams WHERE id=?").get(id);
    if(!row)throw new HomeworkError(404,"找不到这份试卷。");
    const pages=this.store.db.prepare("SELECT id,number,status,note,coverage FROM exam_pages WHERE exam_id=? ORDER BY number").all(id) as ExamPage[];
    const done=pages.filter(p=>p.status==="done").length;
    const exam:ExamRecord={...JSON.parse(String(row.metadata)),id,pages:pages.length,done,status:done===pages.length?"已整理":"待整理"};
    const questions=this.store.db.prepare("SELECT q.id,q.page_id,q.revision,q.payload FROM exam_questions q JOIN exam_pages p ON q.page_id=p.id WHERE p.exam_id=? ORDER BY p.number,q.rowid").all(id);
    return {exam,pages,questions:questions.map(q=>({...JSON.parse(String(q.payload)),id:q.id,pageId:q.page_id,revision:q.revision}))};
  }
  reserve(input:unknown) {
    const {meta,pages}=examManifest.parse(input);
    if(meta.date>this.store.today())throw new HomeworkError(400,"请填写已经发生的测验日期。");
    const id=digest(JSON.stringify(pages.map(p=>p.sha)));
    return this.store.homework.transaction(()=>{
      const prior=this.store.db.prepare("SELECT metadata FROM exams WHERE id=?").get(id);
      if(prior&&prior.metadata!==JSON.stringify(meta))throw new HomeworkError(409,"这些原图已有档案，请在全部试卷中打开并修改资料。");
      if(!prior){
        const used=Number(this.store.db.prepare("SELECT COALESCE(sum(bytes),0) n FROM exam_pages").get()!.n);
        if(used+pages.reduce((sum,p)=>sum+p.bytes,0)>4*1024**3)throw new HomeworkError(507,"试卷原件空间不足，请联系家长。");
        this.store.db.prepare("INSERT INTO exams VALUES(?,?,?,?)").run(id,JSON.stringify(meta),meta.date,this.store.time());
        pages.forEach((p,i)=>this.store.db.prepare("INSERT INTO exam_pages(id,exam_id,number,sha,bytes) VALUES(?,?,?,?,?)").run(randomUUID(),id,i+1,p.sha,p.bytes));
      }
      return this.detail(id);
    });
  }
  editMeta(id:string,raw:unknown,actor:string){
    const {previous,meta}=z.object({previous:examMeta,meta:examMeta}).parse(raw);
    if(meta.date>this.store.today())throw new HomeworkError(400,"请核对测验日期。");
    return this.store.homework.transaction(()=>{
      const row=this.store.db.prepare("SELECT metadata FROM exams WHERE id=?").get(id);
      if(!row)throw new HomeworkError(404,"找不到这份试卷。");
      if(row.metadata===JSON.stringify(meta))return {saved:true};
      if(row.metadata!==JSON.stringify(previous))throw new HomeworkError(409,"资料刚被修改，请重新打开。");
      this.store.db.prepare("UPDATE exams SET metadata=?,date=? WHERE id=?").run(JSON.stringify(meta),meta.date,id);
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
    if(!p)return false;
    db.prepare("UPDATE exam_pages SET status='running',attempts=attempts+1 WHERE id=?").run(p.id);
    try {
      const meta=JSON.parse(String(db.prepare("SELECT metadata FROM exams WHERE id=?").get(p.exam_id)!.metadata)) as ExamMeta;
      const {stdout}=await convert("/usr/bin/convert",["-limit","memory","64MiB","-limit","map","128MiB","-limit","disk","512MiB",join(this.directory,p.id)+"[0]","-auto-orient","-resize","1800x2400>","-background","white","-alpha","remove","-strip","-quality","85","jpeg:-"],{encoding:"buffer",timeout:60000,maxBuffer:3*1024*1024});
      const ai=execution.forJob(undefined,undefined,{date:meta.date,title:"试卷整理："+meta.title,pageId:p.id,attempt:p.attempts+1});
      const result=await execution.cached("marked-page-v1:"+digest(JSON.stringify([p.sha,meta.subject])),()=>ai.run("read_marked_exam",markedPage,{subject:meta.subject},[{fileId:p.id,mimeType:"image/jpeg",base64:stdout.toString("base64")}]));
      this.savePage(p.id,result);
    } catch(e) {
      db.prepare("UPDATE exam_pages SET status='failed',note=? WHERE id=?").run(e instanceof HomeworkError?e.message:"识读未完成，原图已保存，可重试或手动补题。",p.id);
    }
    return true;
  }
  savePage(id:string,raw:unknown) {
    const result=markedPage.parse(raw);
    this.store.homework.transaction(()=>{
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
