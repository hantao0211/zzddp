import {saveStudentProfile} from "./student-profile";
import { installFamilyPlan } from "./family-plan";
import { RedemptionInputSchema } from "../../domain/growth-economy";
import { chatPhotos } from "../assistant/photos";
import type {IncomingMessage,ServerResponse} from "node:http";
import {z} from "zod";
import {DaySchema} from "../../domain/calendar";
import {isParent,type Viewer} from "../../domain/accounts";
import {ReadingStore,BookEditConflict} from "./store";
import {HomeworkError} from "../homework/store";
import {lookupBooks} from "./catalog";
import {parseBookQuery,BookQueryError} from "../../domain/book-query";
import {TutorAnswerSchema} from "../../domain/ai-contracts";
import type {ChatInput} from "../../domain/assistant";
import {AIServiceError,type StructuredAI} from "../ai/provider";
const send=(r:ServerResponse,value:unknown)=>{r.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});r.end(JSON.stringify(value));};
export class ReadingHTTP{
 private lookups=0;
 constructor(readonly store:ReadingStore,private lookup=lookupBooks){}
 async handle(req:IncomingMessage,res:ServerResponse,viewer:Viewer,body:()=>Promise<unknown>){const url=new URL(req.url!,"http://internal"),path=url.pathname.replace("/assistant-api/reading","");
 try{
 if(path==="/state"&&req.method==="GET"){send(res,this.store.snapshot(viewer));return;}
 if(path==="/logs"&&req.method==="GET"){const bookId=url.searchParams.get("bookId"),date=url.searchParams.get("date"),offset=Number(url.searchParams.get("offset")||0);if((bookId&&!z.string().uuid().safeParse(bookId).success)||(date&&!DaySchema.safeParse(date).success)||!Number.isSafeInteger(offset)||offset<0||offset>20000)throw new HomeworkError(400,"阅读筛选条件无效。");const where="WHERE (? IS NULL OR book_id=?) AND (? IS NULL OR date=?)",args=[bookId,bookId,date,date];const rows=this.store.db.prepare(`SELECT id FROM logs ${where} ORDER BY date DESC,rowid DESC LIMIT 100 OFFSET ?`).all(...args,offset) as {id:string}[];const total=(this.store.db.prepare(`SELECT COUNT(*) AS n FROM logs ${where}`).get(...args) as {n:number}).n;send(res,{items:rows.map(r=>this.store.log(r.id,viewer)),total});return;}
 if(path==="/lookup"&&req.method==="POST"){
  const v=z.object({query:z.string().trim().min(2).max(100)}).strict().parse(await body());
  try{parseBookQuery(v.query);}catch(e){if(e instanceof BookQueryError){send(res,{items:[],status:"invalid_query",note:e.message});return;}throw e;}
  if(this.lookups>=2)throw new HomeworkError(429,"正在查书，请稍等。");
  this.store.reserveLookup();this.lookups++;
  try{const items=await this.lookup(v.query);this.store.cache(items);send(res,{items,status:items.length?"found":"not_found",note:items.length?"选一本填入，再核对版本；留空的信息可以自己补充。":"暂没查到这本书，试试完整书名，或直接填写下方书名添加。"});}
  catch{send(res,{items:[],status:"unavailable",note:"暂时连不上图书资料服务，已尝试备用来源。可稍后重试，或直接填写下方书名添加。"});}
  finally{this.lookups--;}return;
 }

 if(path==="/books"&&req.method==="POST"){send(res,this.store.addBook(await body(),viewer.id));return;}
 const bookInfo=path.match(/^\/books\/([a-f0-9-]{36})$/);if(bookInfo){if(req.method==="GET"){send(res,this.store.book(bookInfo[1]));return;}if(req.method==="PATCH"){send(res,this.store.editBook(bookInfo[1],await body(),viewer.id));return;}}
 const book=path.match(/^\/books\/([a-f0-9-]{36})\/finished$/);if(book&&req.method==="POST"){const v=z.object({finished:z.boolean()}).strict().parse(await body());send(res,this.store.finishBook(book[1],v.finished,viewer.id));return;}
 if(path==="/logs"&&req.method==="POST"){send(res,this.store.save(await body(),viewer));return;}
 const log=path.match(/^\/logs\/([a-f0-9-]{36})(?:\/(retry))?$/);if(log){if(req.method==="GET"&&!log[2]){send(res,this.store.log(log[1],viewer));return;}if(req.method==="POST"&&log[2]){z.object({}).strict().parse(await body());send(res,this.store.retry(log[1],viewer));return;}}
 const image=path.match(/^\/images\/([a-f0-9-]{36})$/);if(image&&req.method==="GET"){const data=this.store.image(image[1]);res.writeHead(200,{"Content-Type":data.mime,"Content-Length":data.bytes.length,"Content-Disposition":"inline","Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin"});res.end(data.bytes);return;}
 if(path==="/redemptions"&&req.method==="POST"){const v=RedemptionInputSchema.parse(await body());send(res,this.store.redeem(v.id,v.rewardId,viewer,{revision:v.revision,amountCents:v.amountCents}));return;}
 if(path==="/activities"&&req.method==="POST"){send(res,this.store.activities.submit(await body(),viewer));return;}
 const activity=path.match(/^\/activities\/([a-f0-9-]{36})$/);if(activity&&req.method==="PATCH"){const v=z.object({status:z.enum(["approved","rejected"]),note:z.string().trim().max(300).default("")}).strict().parse(await body());send(res,this.store.activities.decide(activity[1],v.status,v.note,viewer));return;}
 if(path==="/wishes"&&req.method==="POST"){send(res,this.store.submitWish(await body(),viewer));return;}
 const wish=path.match(/^\/wishes\/([a-f0-9-]{36})(?:\/(withdraw))?$/);if(wish){if(req.method==="POST"&&wish[2]){z.object({}).strict().parse(await body());send(res,this.store.withdrawWish(wish[1],viewer));return;}if(req.method==="PATCH"&&!wish[2]){send(res,this.store.decideWish(wish[1],await body(),viewer));return;}}
 if(!isParent(viewer))throw new HomeworkError(403,"奖励规则和兑换审批需要家长处理。");
 if(path==="/student-profile"&&req.method==="PATCH"){send(res,saveStudentProfile(this.store,await body(),viewer.id));return;}
 if(path==="/economy/setup"&&req.method==="POST"){z.object({}).strict().parse(await body());send(res,installFamilyPlan(this.store,viewer.id));return;}
 if(path==="/activity-rules"&&req.method==="PATCH"){send(res,this.store.activities.setRules(await body(),viewer));return;}
 const offerHistory=path.match(/^\/rewards\/([a-f0-9-]{36})\/history$/);if(offerHistory&&req.method==="GET"){send(res,{items:this.store.shop.history(offerHistory[1])});return;}
 if(path==="/homework-rules"&&req.method==="PATCH"){send(res,this.store.setHomeworkRewardRules(await body(),viewer));return;}
 if(path==="/rules"&&req.method==="PATCH"){send(res,this.store.setRules(await body(),viewer.id));return;}
 const reward=path.match(/^\/rewards(?:\/([a-f0-9-]{36}))?$/);if(reward&&req.method===(reward[1]?"PATCH":"POST")){send(res,this.store.saveReward(await body(),viewer.id,reward[1]));return;}
 const redemption=path.match(/^\/redemptions\/([a-f0-9-]{36})$/);if(redemption&&req.method==="PATCH"){const v=z.object({status:z.enum(["approved","rejected","fulfilled"])}).strict().parse(await body());send(res,this.store.decide(redemption[1],v.status,viewer.id));return;}
 throw new HomeworkError(404,"没有找到这个阅读功能。");
 }catch(e){if(res.headersSent){res.destroy();return;}res.writeHead(e instanceof HomeworkError?e.status:e instanceof z.ZodError?400:503,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify({...(e instanceof BookEditConflict?{code:e.code}:{}),error:e instanceof HomeworkError?e.message:e instanceof z.ZodError?"请检查必填内容、数字范围和文字长度后重试。":"阅读服务暂时不可用，已有记录保留，请稍后重试。"}));}}
 async answer(ai:StructuredAI,input:ChatInput,viewer:Viewer){const photos=chatPhotos(input);const sourceMaterialIds=[...(input.readingLogId?[input.readingLogId]:[]),...photos.images.map(p=>p.fileId)];const log=input.readingLogId?this.store.log(input.readingLogId,viewer):null,book=log?this.store.book(log.bookId):null;const state=this.store.snapshot(viewer);const result=await ai.run("reading_dialogue",TutorAnswerSchema,{question:input.question,history:input.history,reading:log?{id:log.id,date:log.date,startPage:log.startPage,endPage:log.endPage,minutes:log.minutes,summary:log.summary,reflection:log.reflection,review:log.review,book:{title:book!.title,author:book!.author,isbn:book!.isbn}}:null,progress:state.stats,points:state.growth.balance,rules:state.rules,homeworkRewardRules:state.homeworkRewardRules,chatPhotos:photos.metadata,sourceMaterialIds,systemHelp:"每个页签问号可打开可翻页图文教程。成长页可记录英语课外阅读、家务、羽毛球课、英语线上课，孩子提交需家长确认，家长记录直接到账；家务每天合计一次，课程每周各一次。商城显示本期价格、次数及期限，日常购物卡填写实际金额，按当月累计金额扣小脚步。商品本期上架和兑换后的使用期分别默认45天，生效期间不可改价，到期可开新一期；已兑换保留原约定，同意后开始计算使用期，过期未兑现自动结算返还。家长可调整之后的活动规则。阅读页可添加书、填页码/分钟、计时、语音概括、选填原文或一张照片。修改书籍信息：展开“我的书架”，点该书的铅笔“修改信息”，修改书名、作者、总页数、出版社或ISBN，再保存。已有阅读记录和小脚步保留，不需要重新添加书。保存后后台AI评价，打卡不等待AI。底部或侧边“成长”页可看小脚步、申请兑换；孩子可以在“成长”里点“我要许愿”，不扣小脚步；家长点设置图标（电脑侧边“家长设置”）审批心愿并定价，通过后自动加入家庭商城，孩子攒够小脚步再申请兑换。未通过会有家长说明，待审批心愿可自己撤回。家长审批并兑现，孩子不能配置奖励或审批心愿。聊天不会执行记录修改、发小脚步或兑换。没有原文不能核对情节，不以时长判断认真程度；不剧透。chatPhotos.pages列出的对话图片是本轮实际提供的图片，可结合原文回答；其余原图未重新提供时只能使用已存评价。对话图片不自动成为阅读打卡记录，不更新阅读评价或积分。"},photos.images);if(result.sourceMaterialIds.some(id=>!sourceMaterialIds.includes(id)))throw new AIServiceError("INVALID_SOURCE",false,"阅读回答引用无效。");return result;}
}
