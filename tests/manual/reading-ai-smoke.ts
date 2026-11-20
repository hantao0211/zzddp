// Run only with configured AI and an isolated synthetic directory. No real child records.
import {ReadingStore} from "../../src/server/reading/store";
import {ReadingWorker} from "../../src/server/reading/worker";
import {VisionAI,readAIConfiguration} from "../../src/server/ai/provider";
import {randomUUID} from "node:crypto";
import assert from "node:assert/strict";
async function main(){
const directory=process.env.READING_AI_QA_DIRECTORY||"";if(!directory.endsWith("/reading-ai-qa"))throw Error("Refuse non-QA directory");
const store=new ReadingStore(directory),viewer={id:randomUUID(),username:"synthetic",name:"模拟孩子",role:"child" as const};
const book=store.addBook({title:"一次合作的小故事（自编测试片段）",totalPages:10},viewer.id);
const input={id:randomUUID(),version:0,bookId:book.id,date:store.today(),startPage:1,endPage:2,minutes:10,summary:"小兔子自己搬不动萝卜，请小熊帮忙，最后一起把萝卜搬回家了。"};
const worker=new ReadingWorker(store,()=>new VisionAI(readAIConfiguration()));
try{
 store.save(input,viewer);await worker.tick();const first=store.log(input.id,viewer);assert.equal(first.reviewStatus,"done");assert.equal(first.review!.comparison,"insufficient_evidence");assert.equal(first.review!.basis,"none");
 store.save({...input,version:1,excerpt:"小兔子找到一个大萝卜，它使劲搬了好几次，都没有搬动。小兔子请小熊来帮忙。它们一起抬起萝卜，搬回了小兔子的家。小兔子谢谢小熊，并邀请它一起吃萝卜。"},viewer);await worker.tick();const second=store.log(input.id,viewer);assert.equal(second.reviewStatus,"done");assert.equal(second.review!.basis,"provided_excerpt");assert.ok(second.review!.evidenceQuote);assert.equal(store.balance(),2);
 console.log(JSON.stringify({realReadingAI:true,withoutTextNotVerified:true,providedExcerptCited:true,feedbackSaved:true,pointsUnaffected:true,paidSyntheticReviewCalls:2}));
}finally{worker.stop();store.close();}

}
void main().catch(e=>{console.error(e);process.exitCode=1;});
