import { noteFailure } from "../diagnostics/events";
import {z} from "zod";
import {createReadStream} from "node:fs";
import type {IncomingMessage,ServerResponse} from "node:http";
import {isParent,type Viewer} from "../../domain/accounts";
import {PracticeSubjectSchema,LearningScopeSchema,type PracticePaper,type PracticeGrade,type LearningScope,type PracticeSubject,type PracticeCandidate} from "../../domain/practice";
import type {MistakeView,MistakeProvenance,GradedQuestion} from "../../domain/grading";
import {studentProfile} from "../reading/student-profile";
import {HomeworkError} from "../homework/store";
import {PracticeStore} from "./store";
import {CurriculumStore} from "./materials";
import {practiceDocument} from "./document";
const send=(res:ServerResponse,value:unknown)=>{res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify(value));};
async function body(request:IncomingMessage){if(request.headers["content-type"]?.split(";")[0]!=="application/json")throw new HomeworkError(415,"请求格式无效。");const parts:Buffer[]=[];let total=0;for await(const p of request){total+=p.length;if(total>8600000)throw new HomeworkError(413,"答卷图片太大，请压缩或分开上传。");parts.push(p);}try{return JSON.parse(Buffer.concat(parts).toString("utf8"));}catch{throw new HomeworkError(400,"资料信息不完整，请重试。");}}
function namedSource(title?: string): title is string {
  const name = title?.trim();
  return !!name && !["已上传作业", "作业照片／扫描件", "作业"].includes(name);
}

export class PracticeHTTP{
 readonly materials:CurriculumStore;
 private cachedMistakes=new Map<string,{stamp:string;page:ReturnType<PracticeHTTP["mistakePage"]>}>();
 private stamp(){const db=this.store.db;return String(db.prepare("SELECT total_changes() n").get()!.n)+":"+String(db.prepare("PRAGMA data_version").get()!.data_version);}

 constructor(readonly store:PracticeStore){this.materials=new CurriculumStore(store);}
 private homeworkProvenance(item: PracticeCandidate, pageId: string, date: string): MistakeProvenance {
  if (namedSource(item.assignmentTitle)) return { kind: "assignment", title: item.assignmentTitle.trim() };
  // A named historical assignment is still useful after the daily checklist changes.
  const runs = this.store.db.prepare(`SELECT r.source FROM grading_occurrences o
    JOIN grading_runs r ON r.id=o.run_id
    WHERE o.mistake_id=? AND r.primary_page_id=? AND r.date=? AND r.status='done'`)
    .all(item.id, pageId, date) as { source: string }[];
  const assignments = new Map<string, string>();
  for (const row of runs) {
    const source = JSON.parse(row.source) as { taskIds?: string[]; assigned?: boolean; subject?: string; title?: string };
    if (source.assigned && source.subject === item.subject && source.taskIds?.length === 1 && namedSource(source.title)) {
      assignments.set(source.taskIds[0], source.title.trim());
    }
  }
  if (assignments.size === 1) return { kind: "assignment", title: [...assignments.values()][0] };
  return { kind: "unmatched", title: namedSource(item.title) ? item.title.trim() : undefined };
 }

 mistakes(subject: PracticeSubject | undefined, scope: LearningScope | undefined, offset: number, limit = 30, params=new URLSearchParams()) {
  const key=JSON.stringify([subject,scope,offset,limit,params.toString()]),stamp=this.stamp();
  const cached=this.cachedMistakes.get(key);if(cached?.stamp===stamp)return cached.page;
  const page=this.mistakePage(subject,scope,offset,limit,params);
  if(!page.indexing){if(this.cachedMistakes.size>=8)this.cachedMistakes.clear();this.cachedMistakes.set(key,{stamp:this.stamp(),page});}
  return page;
 }
 private mistakePage(subject: PracticeSubject | undefined,scope:LearningScope|undefined,offset:number,limit:number,params:URLSearchParams){
  const result=this.store.analysis.query(this.store.candidates(subject),params,subject,scope);
  const items=result.list.sort((a,b)=>b.lastDate.localeCompare(a.lastDate)||a.id.localeCompare(b.id));
  return {total:items.length,options:result.options,analysis:result.analysis,indexing:result.indexing,items:items.slice(offset,offset+limit).map(item=>{
    const edits=result.edits.get(item.id);return {...this.mistakeView(item),tags:result.byId.get(item.id)?.tags,tagRevision:edits?.revision??0,manualTags:edits?.tags??{}};
  })};
 }

 private mistakeView(item: PracticeCandidate): MistakeView {
  const base = {
    id: item.id, subject: item.subject, title: item.title, lastDate: item.lastDate, occurrences: item.occurrences,
    scope: item.scope, scopeSource: item.scopeSource, retest: item.stats, origin: item.origin,
  };
  if(item.origin==="exam"){
    const row=this.store.db.prepare("SELECT q.payload,p.number FROM exam_questions q JOIN exam_pages p ON p.id=q.page_id WHERE q.id=?").get(item.id)!;
    const q=JSON.parse(String(row.payload)) as import("../../domain/assessment").Observation;
    const pageId=item.pageId!;
    return {...base,date:item.lastDate,pageId,imageUrl:"/assistant-api/learning/practice/exam-pages/"+pageId+"/photo",provenance:{kind:"exam",title:item.title},
      question:{...q,id:item.id,verdict:"wrong",kind:"objective",verification:"agreed",confidence:"high",explanation:q.teacherMark,nextStep:q.correction?"卷面订正："+q.correction:"请对照原卷核对。",sourcePartLabels:[],evidence:[{fileId:pageId,page:Number(row.number),excerpt:q.teacherMark||"家长核对原卷"}]}};
  }
  if (item.origin === "homework") {
    const row = this.store.db.prepare("SELECT payload,page_id,first_date FROM grading_mistakes WHERE id=?")
      .get(item.id) as { payload: string; page_id: string; first_date: string };
    return { ...base, date: row.first_date, pageId: row.page_id, question: JSON.parse(row.payload),
      provenance: this.homeworkProvenance(item, row.page_id, row.first_date) };
  }

  const row = this.store.db.prepare(`SELECT r.result,t.paper FROM practice_mistakes m
    JOIN practice_results r ON r.practice_id=m.practice_id AND r.question_id=m.question_id
    JOIN practice_tasks t ON t.id=m.practice_id WHERE m.id=?`).get(item.id) as { result: string; paper: string | null };
  const answer = JSON.parse(row.result);
  const pageId = answer.evidenceIds?.[0] || "";
  const title = row.paper ? (JSON.parse(row.paper) as PracticePaper).title : item.title;
  const question: GradedQuestion = {
    id: item.id, kind: "objective", label: "小练习复测题", question: item.question, studentAnswer: answer.studentAnswer,
    expectedAnswer: item.answer, verdict: "wrong", confidence: "high", explanation: answer.explanation,
    knowledgePoints: item.knowledgePoints, cause: "原因待确认", causeExplanation: "", nextStep: "先订正这道题，之后用变式练习再核对。",
    evidence: pageId ? [{ fileId: pageId, page: null, excerpt: "小练习答卷" }] : [], sourcePartLabels: [], verification: "agreed",
  };
  return { ...base, date: item.lastDate, pageId, imageUrl: pageId ? "/assistant-api/learning/practice/photos/" + pageId : undefined,
    question, provenance: { kind: "practice", title } };
 }

 async handle(req:IncomingMessage,res:ServerResponse,viewer:Viewer){const url=new URL(req.url!,"http://internal"),path=url.pathname.replace("/assistant-api/learning/practice","");try{
 if(path==="/milestones" && req.method==="GET"){send(res,this.store.milestones.snapshot());return;}
 if(path==="/exams" && req.method==="GET"){
   const offset=Number(url.searchParams.get("offset")??0);
   if(!Number.isSafeInteger(offset)||offset<0)throw new HomeworkError(400,"分页无效。");
   const profile=studentProfile(this.store.reading);
   send(res,{...this.store.exams.list(offset,url.searchParams.get("latest")==="1"?1:10),stage:profile?{grade:profile.grade,semester:profile.semester}:null});return;
 }
 const exam=path.match(/^\/exams\/([a-f0-9]{64})$/);
 if(exam&&req.method==="GET"){send(res,this.store.exams.detail(exam[1]));return;}
 const examPage=path.match(/^\/exam-pages\/([a-f0-9-]{36})\/(photo|retry|review|explain|learn)$/);
 if(examPage&&examPage[2]==="photo"&&req.method==="GET"){
   const photo=this.store.exams.photo(examPage[1]);res.writeHead(200,{"Content-Type":photo.mime,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});res.end(photo.bytes);return;
 }
 if(path==="/exams"&&req.method==="POST"){send(res,this.store.exams.reserve(await body(req)));return;}
 if(examPage&&examPage[2]==="photo"&&req.method==="PUT"){send(res,await this.store.exams.receive(examPage[1],req));return;}
 if(examPage&&req.method==="POST"&&examPage[2]==="explain"){send(res,this.store.exams.explain(examPage[1],await body(req),viewer.id));return;}
 if(examPage&&req.method==="POST"&&examPage[2]==="learn"&&isParent(viewer)){send(res,this.store.exams.learn(examPage[1],await body(req)));return;}
 if(examPage&&req.method==="POST"&&isParent(viewer)){
   send(res,examPage[2]==="review"?this.store.exams.review(examPage[1],await body(req),viewer.id):examPage[2]==="retry"?this.store.exams.retry(examPage[1]):(()=>{throw new HomeworkError(404,"未知操作");})());return;
 }
 if (path === "/state" && req.method === "GET") {
  const today = this.store.today();
  const candidates = this.store.candidates();
  const subjects = PracticeSubjectSchema.options.map(subject => {
    const mistakes = candidates.filter(item => item.subject === subject);
    const pending = mistakes.filter(item => item.scope === "unknown");
    const sources = pending.flatMap(item => item.scopeSource ? [item.scopeSource] : []);
    const pendingSources = [...new Map(sources.map(source => [source.id, source])).values()].slice(0, 10);
    return { subject, curricular: mistakes.filter(item => item.scope === "curricular").length,
      extracurricular: mistakes.filter(item => item.scope === "extracurricular").length, unknown: pending.length,
      ...(pendingSources.length ? { pendingSources } : {}), rewardEligible: this.store.rewards.eligible(subject, today) };
  });
  send(res, { today, viewer: { id: viewer.id, role: viewer.role }, profile: studentProfile(this.store.reading), subjects, items: this.store.list() });
  return;
 }
 if(path==="/generate"&&req.method==="POST"){const v=z.object({subject:PracticeSubjectSchema}).strict().parse(await body(req));send(res,this.store.create(v.subject,viewer));return;}
 if(path==="/materials"&&req.method==="GET"){send(res,{items:this.materials.list()});return;}
 const indexed=path.match(/^\/materials\/([a-f0-9-]{36})\/pages$/);if(indexed&&req.method==="GET"){const offset=Number(url.searchParams.get("offset")||0);if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new HomeworkError(400,"分页位置无效。");send(res,this.materials.pages(indexed[1],offset));return;}
 const photo=path.match(/^\/photos\/([a-f0-9-]{36})$/);if(photo&&req.method==="GET"){const p=this.store.photo(photo[1]);res.writeHead(200,{"Content-Type":"image/jpeg","Content-Length":p.bytes.length,"Cache-Control":"private, no-cache","Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin"});res.end(p.bytes);return;}
 const file=path.match(/^\/files\/([a-f0-9-]{36})$/);if(file&&req.method==="GET"){const f=this.materials.file(file[1]);if(!f.stored)throw new HomeworkError(404,"原件尚未完整保存。");res.writeHead(200,{"Content-Type":f.mime,"Content-Length":f.bytes,"Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(f.name).replace(/['()*]/g,c=>"%"+c.charCodeAt(0).toString(16)),"Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin"});const stream=createReadStream(this.materials.path(f.id));stream.on("error",()=>res.destroy());res.on("close",()=>stream.destroy());stream.pipe(res);return;}
 const item=path.match(/^\/items\/([a-f0-9-]{36})(?:\/(submit|retry|document|complete|answers)(?:\/([^/]+))?)?$/);
 if(item){const id=item[1],action=item[2];if(!action&&req.method==="GET"){send(res,this.store.view(id));return;}
 if(action==="submit"&&req.method==="POST"){send(res,this.store.submit(id,await body(req),viewer));return;}
 if(action==="document"&&req.method==="GET"){
  const answers=url.searchParams.get("answers")==="1";
  if(answers&&!isParent(viewer))throw new HomeworkError(403,"参考答案仅供家长查看。");
  const row=this.store.row(id);
  if(!row.paper)throw new HomeworkError(409,"练习尚未通过校验，请稍等。");
  const paper=JSON.parse(row.paper) as PracticePaper;
  if(answers&&row.result){
   const result=JSON.parse(row.result) as PracticeGrade;
   paper.questions=paper.questions.map(question=>{
    const correction=result.answers.find(answer=>answer.questionId===question.id&&answer.explanation.startsWith("家长核对：")&&answer.expectedAnswer.trim());
    return correction?{...question,answer:correction.expectedAnswer,explanation:correction.explanation}:question;
   });
  }
  res.setHeader("Cache-Control","private, no-store");
  if(answers&&url.searchParams.get("format")==="json"){send(res,paper);return;}
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; sandbox allow-modals"});
  res.end(practiceDocument(paper,this.store.view(id).profileLabel,row.date,answers));return;
 }
 if(action==="retry"&&req.method==="POST"){z.object({}).strict().parse(await body(req));send(res,this.store.retry(id,viewer));return;}
 if(action==="complete"&&req.method==="POST"){const v=z.object({reason:z.string().trim().min(1).max(500)}).strict().parse(await body(req));send(res,this.store.manualComplete(id,v.reason,viewer));return;}
 if(action==="answers"&&item[3]&&req.method==="PATCH"){send(res,this.store.reviewAnswer(id,decodeURIComponent(item[3]),await body(req),viewer));return;}}
 if(!isParent(viewer))throw new HomeworkError(403,"资料整理和课内外分类需要家长确认。");
 const context=path.match(/^\/milestones\/([a-f0-9]{64})\/context$/);
 if(context&&req.method==="PATCH"){this.store.milestones.saveContext(context[1],await body(req));send(res,{saved:true});return;}
 if(path==="/milestone-goals"&&req.method==="POST"){this.store.milestones.saveGoal(await body(req));send(res,{saved:true});return;}
 const goal=path.match(/^\/milestone-goals\/([a-f0-9-]{36})$/);
 if(goal&&req.method==="POST"){this.store.milestones.settle(goal[1],await body(req),viewer.id);send(res,{saved:true});return;}
 if(exam&&req.method==="PATCH"){send(res,this.store.exams.editMeta(exam[1],await body(req),viewer.id));return;}
 const tag=path.match(/^\/tags\/([^/]+)$/);if(tag&&req.method==="PATCH"){send(res,this.store.analysis.saveEdit(decodeURIComponent(tag[1]),await body(req),viewer.id));return;}
 const scope=path.match(/^\/scopes\/(.+)$/);if(scope&&req.method==="PATCH"){const id=decodeURIComponent(scope[1]);if(id.length>150)throw new HomeworkError(400,"错题标识无效。");const v=z.object({scope:LearningScopeSchema}).strict().parse(await body(req));send(res,this.store.classify(id,v.scope,viewer));return;}
 if(path==="/materials"&&req.method==="POST"){send(res,this.materials.save(await body(req),viewer.id));return;}
 const editPage=path.match(/^\/materials\/([a-f0-9-]{36})\/pages\/([a-f0-9-]{36})\/(\d{1,4})$/);if(editPage&&req.method==="PATCH"){send(res,this.materials.editPage(editPage[1],editPage[2],Number(editPage[3]),await body(req),viewer.id));return;}
 const reserve=path.match(/^\/materials\/([a-f0-9-]{36})\/files$/);if(reserve&&req.method==="POST"){send(res,this.materials.reserve(reserve[1],await body(req)));return;}
 if(file&&req.method==="PUT"){send(res,await this.materials.receive(file[1],req));return;}
 const index=path.match(/^\/files\/([a-f0-9-]{36})\/index$/);if(index&&req.method==="POST"){send(res,this.materials.index(index[1],await body(req)));return;}
 const retry=path.match(/^\/index-jobs\/([a-f0-9-]{36})\/retry$/);if(retry&&req.method==="POST"){z.object({}).strict().parse(await body(req));send(res,this.materials.retry(retry[1]));return;}
 throw new HomeworkError(404,"没有找到这个小练习功能。");
 }catch(e){noteFailure(res, e);if(res.headersSent){res.destroy();return;}res.writeHead(e instanceof HomeworkError?e.status:e instanceof z.ZodError?400:503,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify({error:e instanceof HomeworkError?e.message:e instanceof z.ZodError?"请检查学科、分类、页码范围和必填内容。":"小练习暂时未完成，已有题目和原件保留，请稍后再试。"}));}}
}
