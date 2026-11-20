import { chatPhotos } from "../assistant/photos";
import type {IncomingMessage,ServerResponse} from "node:http";
import {z} from "zod";
import {DaySchema} from "../../domain/calendar";
import {isParent,type Viewer} from "../../domain/accounts";
import {ReadingStore} from "./store";
import {HomeworkError} from "../homework/store";
import {lookupBooks} from "./catalog";
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
 if(path==="/lookup"&&req.method==="POST"){const v=z.object({query:z.string().trim().min(2).max(100)}).strict().parse(await body());if(this.lookups>=2)throw new HomeworkError(429,"正在查书，请稍等。");this.store.reserveLookup();this.lookups++;try{const items=await this.lookup(v.query);this.store.cache(items);send(res,{items,note:items.length?"请核对作者、出版社和ISBN，确保版本一致。":"暂没找到，可以手动添加。"});}catch{send(res,{items:[],note:"图书资料服务暂时不可用，可以直接填写书名添加，不影响阅读记录。"});}finally{this.lookups--;}return;}
 if(path==="/books"&&req.method==="POST"){send(res,this.store.addBook(await body(),viewer.id));return;}
 const book=path.match(/^\/books\/([a-f0-9-]{36})\/finished$/);if(book&&req.method==="POST"){const v=z.object({finished:z.boolean()}).strict().parse(await body());send(res,this.store.finishBook(book[1],v.finished,viewer.id));return;}
 if(path==="/logs"&&req.method==="POST"){send(res,this.store.save(await body(),viewer));return;}
 const log=path.match(/^\/logs\/([a-f0-9-]{36})(?:\/(retry))?$/);if(log){if(req.method==="GET"&&!log[2]){send(res,this.store.log(log[1],viewer));return;}if(req.method==="POST"&&log[2]){z.object({}).strict().parse(await body());send(res,this.store.retry(log[1],viewer));return;}}
 const image=path.match(/^\/images\/([a-f0-9-]{36})$/);if(image&&req.method==="GET"){const data=this.store.image(image[1]);res.writeHead(200,{"Content-Type":data.mime,"Content-Length":data.bytes.length,"Content-Disposition":"inline","Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin"});res.end(data.bytes);return;}
 if(path==="/redemptions"&&req.method==="POST"){const v=z.object({id:z.string().uuid(),rewardId:z.string().uuid()}).strict().parse(await body());send(res,this.store.redeem(v.id,v.rewardId,viewer));return;}
 if(path==="/wishes"&&req.method==="POST"){send(res,this.store.submitWish(await body(),viewer));return;}
 const wish=path.match(/^\/wishes\/([a-f0-9-]{36})(?:\/(withdraw))?$/);if(wish){if(req.method==="POST"&&wish[2]){z.object({}).strict().parse(await body());send(res,this.store.withdrawWish(wish[1],viewer));return;}if(req.method==="PATCH"&&!wish[2]){send(res,this.store.decideWish(wish[1],await body(),viewer));return;}}
 if(!isParent(viewer))throw new HomeworkError(403,"奖励规则和兑换审批需要家长处理。");
 if(path==="/rules"&&req.method==="PATCH"){send(res,this.store.setRules(await body(),viewer.id));return;}
 const reward=path.match(/^\/rewards(?:\/([a-f0-9-]{36}))?$/);if(reward&&req.method===(reward[1]?"PATCH":"POST")){send(res,this.store.saveReward(await body(),viewer.id,reward[1]));return;}
 const redemption=path.match(/^\/redemptions\/([a-f0-9-]{36})$/);if(redemption&&req.method==="PATCH"){const v=z.object({status:z.enum(["approved","rejected","fulfilled"])}).strict().parse(await body());send(res,this.store.decide(redemption[1],v.status,viewer.id));return;}
 throw new HomeworkError(404,"没有找到这个阅读功能。");
 }catch(e){if(res.headersSent){res.destroy();return;}res.writeHead(e instanceof HomeworkError?e.status:e instanceof z.ZodError?400:503,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify({error:e instanceof HomeworkError?e.message:e instanceof z.ZodError?"请检查必填内容、数字范围和文字长度后重试。":"阅读服务暂时不可用，已有记录保留，请稍后重试。"}));}}
 async answer(ai:StructuredAI,input:ChatInput,viewer:Viewer){const photos=chatPhotos(input);const sourceMaterialIds=[...(input.readingLogId?[input.readingLogId]:[]),...photos.images.map(p=>p.fileId)];const log=input.readingLogId?this.store.log(input.readingLogId,viewer):null,book=log?this.store.book(log.bookId):null;const state=this.store.snapshot(viewer);const result=await ai.run("reading_dialogue",TutorAnswerSchema,{question:input.question,history:input.history,reading:log?{id:log.id,date:log.date,startPage:log.startPage,endPage:log.endPage,minutes:log.minutes,summary:log.summary,reflection:log.reflection,review:log.review,book:{title:book!.title,author:book!.author,isbn:book!.isbn}}:null,progress:state.stats,points:state.growth.balance,rules:state.rules,chatPhotos:photos.metadata,sourceMaterialIds,systemHelp:"阅读页可添加书、填页码/分钟、计时、语音概括、选填原文或一张照片。保存后后台AI评价，打卡不等待AI。底部或侧边“成长”页可看小脚步、申请兑换；孩子可以在“成长”里点“我要许愿”，不扣小脚步；家长点设置图标（电脑侧边“家长设置”）审批心愿并定价，通过后自动加入家庭商城，孩子攒够小脚步再申请兑换。未通过会有家长说明，待审批心愿可自己撤回。家长审批并兑现，孩子不能配置奖励或审批心愿。聊天不会执行记录修改、发小脚步或兑换。没有原文不能核对情节，不以时长判断认真程度；不剧透。chatPhotos.pages列出的对话图片是本轮实际提供的图片，可结合原文回答；其余原图未重新提供时只能使用已存评价。对话图片不自动成为阅读打卡记录，不更新阅读评价或积分。"},photos.images);if(result.sourceMaterialIds.some(id=>!sourceMaterialIds.includes(id)))throw new AIServiceError("INVALID_SOURCE",false,"阅读回答引用无效。");return result;}
}
