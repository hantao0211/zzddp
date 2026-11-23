import {z} from "zod";
import {createReadStream} from "node:fs";
import type {IncomingMessage,ServerResponse} from "node:http";
import {isParent,type Viewer} from "../../domain/accounts";
import {PracticeSubjectSchema,LearningScopeSchema,type PracticePaper,type LearningScope,type PracticeSubject} from "../../domain/practice";
import type {MistakeView,GradedQuestion} from "../../domain/grading";
import {studentProfile} from "../reading/student-profile";
import {HomeworkError} from "../homework/store";
import {PracticeStore} from "./store";
import {CurriculumStore} from "./materials";
import {practiceDocument} from "./document";
const send=(res:ServerResponse,value:unknown)=>{res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify(value));};
async function body(request:IncomingMessage){if(request.headers["content-type"]?.split(";")[0]!=="application/json")throw new HomeworkError(415,"请求格式无效。");const parts:Buffer[]=[];let total=0;for await(const p of request){total+=p.length;if(total>8600000)throw new HomeworkError(413,"答卷图片太大，请压缩或分开上传。");parts.push(p);}try{return JSON.parse(Buffer.concat(parts).toString("utf8"));}catch{throw new HomeworkError(400,"资料信息不完整，请重试。");}}
export class PracticeHTTP{
 readonly materials:CurriculumStore;
 constructor(readonly store:PracticeStore){this.materials=new CurriculumStore(store);}
 mistakes(subject:PracticeSubject|undefined,scope:LearningScope|undefined,offset:number){const items=this.store.candidates(subject).filter(c=>!scope||c.scope===scope).sort((a,b)=>b.lastDate.localeCompare(a.lastDate));return{total:items.length,items:items.slice(offset,offset+30).map(c=>{let question:GradedQuestion,pageId="",date=c.lastDate,imageUrl:string|undefined;
 if(c.origin==="homework"){const r=this.store.db.prepare("SELECT payload,page_id,first_date FROM grading_mistakes WHERE id=?").get(c.id) as {payload:string;page_id:string;first_date:string};question=JSON.parse(r.payload);pageId=r.page_id;date=r.first_date;}
 else{const r=this.store.db.prepare("SELECT * FROM practice_mistakes WHERE id=?").get(c.id) as {practice_id:string;question_id:string};const result=this.store.db.prepare("SELECT result FROM practice_results WHERE practice_id=? AND question_id=?").get(r.practice_id,r.question_id) as {result:string};const answer=JSON.parse(result.result);pageId=answer.evidenceIds?.[0]||"";imageUrl=pageId?"/assistant-api/learning/practice/photos/"+pageId:undefined;question={id:c.id,kind:"objective",label:"小练习复测题",question:c.question,studentAnswer:answer.studentAnswer,expectedAnswer:c.answer,verdict:"wrong",confidence:"high",explanation:answer.explanation,knowledgePoints:c.knowledgePoints,cause:"原因待确认",causeExplanation:"",nextStep:"先订正这道题，之后用变式练习再核对。",evidence:pageId?[{fileId:pageId,page:null,excerpt:"小练习答卷"}]:[],sourcePartLabels:[],verification:"agreed"};}
 return{id:c.id,date,lastDate:c.lastDate,subject:c.subject,title:c.title,pageId,occurrences:c.occurrences,question,scope:c.scope,retest:c.stats,origin:c.origin,imageUrl} satisfies MistakeView;
 })};}
 async handle(req:IncomingMessage,res:ServerResponse,viewer:Viewer){const url=new URL(req.url!,"http://internal"),path=url.pathname.replace("/assistant-api/learning/practice","");try{
 if(path==="/state"&&req.method==="GET"){const candidates=this.store.candidates();send(res,{today:this.store.today(),viewer:{id:viewer.id,role:viewer.role},profile:studentProfile(this.store.reading),subjects:(["语文","数学","英语"] as const).map(subject=>({subject,curricular:candidates.filter(c=>c.subject===subject&&c.scope==="curricular").length,extracurricular:candidates.filter(c=>c.subject===subject&&c.scope==="extracurricular").length,unknown:candidates.filter(c=>c.subject===subject&&c.scope==="unknown").length,rewardEligible:this.store.rewards.eligible(subject,this.store.today())})),items:this.store.list()});return;}
 if(path==="/generate"&&req.method==="POST"){const v=z.object({subject:PracticeSubjectSchema}).strict().parse(await body(req));send(res,this.store.create(v.subject,viewer));return;}
 if(path==="/materials"&&req.method==="GET"){send(res,{items:this.materials.list()});return;}
 const indexed=path.match(/^\/materials\/([a-f0-9-]{36})\/pages$/);if(indexed&&req.method==="GET"){const offset=Number(url.searchParams.get("offset")||0);if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new HomeworkError(400,"分页位置无效。");send(res,this.materials.pages(indexed[1],offset));return;}
 const photo=path.match(/^\/photos\/([a-f0-9-]{36})$/);if(photo&&req.method==="GET"){const p=this.store.photo(photo[1]);res.writeHead(200,{"Content-Type":"image/jpeg","Content-Length":p.bytes.length,"Cache-Control":"private, no-cache","Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin"});res.end(p.bytes);return;}
 const file=path.match(/^\/files\/([a-f0-9-]{36})$/);if(file&&req.method==="GET"){const f=this.materials.file(file[1]);if(!f.stored)throw new HomeworkError(404,"原件尚未完整保存。");res.writeHead(200,{"Content-Type":f.mime,"Content-Length":f.bytes,"Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(f.name).replace(/['()*]/g,c=>"%"+c.charCodeAt(0).toString(16)),"Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin"});const stream=createReadStream(this.materials.path(f.id));stream.on("error",()=>res.destroy());res.on("close",()=>stream.destroy());stream.pipe(res);return;}
 const item=path.match(/^\/items\/([a-f0-9-]{36})(?:\/(submit|retry|document|complete|answers)(?:\/([^/]+))?)?$/);
 if(item){const id=item[1],action=item[2];if(!action&&req.method==="GET"){send(res,this.store.view(id));return;}
 if(action==="submit"&&req.method==="POST"){send(res,this.store.submit(id,await body(req),viewer));return;}
 if(action==="document"&&req.method==="GET"){const r=this.store.row(id);if(!r.paper)throw new HomeworkError(409,"练习尚未通过校验，请稍等。");const answers=url.searchParams.get("answers")==="1";if(answers&&!isParent(viewer))throw new HomeworkError(403,"参考答案由家长单独保存，练习结果可在批改后查看。");res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; sandbox allow-modals","Cache-Control":"private, no-store"});const paper=JSON.parse(r.paper) as PracticePaper;if(answers&&r.result){const result=JSON.parse(r.result);paper.questions=paper.questions.map(q=>{const correction=result.answers.find((a:any)=>a.questionId===q.id&&a.explanation.startsWith("家长核对：")&&a.expectedAnswer.trim());return correction?{...q,answer:correction.expectedAnswer,explanation:correction.explanation}:q;});}res.end(practiceDocument(paper,this.store.view(id).profileLabel,r.date,answers));return;}
 if(action==="retry"&&req.method==="POST"){z.object({}).strict().parse(await body(req));send(res,this.store.retry(id,viewer));return;}
 if(action==="complete"&&req.method==="POST"){const v=z.object({reason:z.string().trim().min(1).max(500)}).strict().parse(await body(req));send(res,this.store.manualComplete(id,v.reason,viewer));return;}
 if(action==="answers"&&item[3]&&req.method==="PATCH"){send(res,this.store.reviewAnswer(id,decodeURIComponent(item[3]),await body(req),viewer));return;}}
 if(!isParent(viewer))throw new HomeworkError(403,"资料整理和课内外分类需要家长确认。");
 const scope=path.match(/^\/scopes\/(.+)$/);if(scope&&req.method==="PATCH"){const id=decodeURIComponent(scope[1]);if(id.length>150)throw new HomeworkError(400,"错题标识无效。");const v=z.object({scope:LearningScopeSchema}).strict().parse(await body(req));send(res,this.store.classify(id,v.scope,viewer));return;}
 if(path==="/materials"&&req.method==="POST"){send(res,this.materials.save(await body(req),viewer.id));return;}
 const editPage=path.match(/^\/materials\/([a-f0-9-]{36})\/pages\/([a-f0-9-]{36})\/(\d{1,4})$/);if(editPage&&req.method==="PATCH"){send(res,this.materials.editPage(editPage[1],editPage[2],Number(editPage[3]),await body(req),viewer.id));return;}
 const reserve=path.match(/^\/materials\/([a-f0-9-]{36})\/files$/);if(reserve&&req.method==="POST"){send(res,this.materials.reserve(reserve[1],await body(req)));return;}
 if(file&&req.method==="PUT"){send(res,await this.materials.receive(file[1],req));return;}
 const index=path.match(/^\/files\/([a-f0-9-]{36})\/index$/);if(index&&req.method==="POST"){send(res,this.materials.index(index[1],await body(req)));return;}
 const retry=path.match(/^\/index-jobs\/([a-f0-9-]{36})\/retry$/);if(retry&&req.method==="POST"){z.object({}).strict().parse(await body(req));send(res,this.materials.retry(retry[1]));return;}
 throw new HomeworkError(404,"没有找到这个小练习功能。");
 }catch(e){if(res.headersSent){res.destroy();return;}res.writeHead(e instanceof HomeworkError?e.status:e instanceof z.ZodError?400:503,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify({error:e instanceof HomeworkError?e.message:e instanceof z.ZodError?"请检查学科、分类、页码范围和必填内容。":"小练习暂时未完成，已有题目和原件保留，请稍后再试。"}));}}
}
