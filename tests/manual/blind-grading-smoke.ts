// One paid check of generated printed examples only, never a child's photo or the family DB.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VisionAI, readAIConfiguration } from "../../src/server/ai/provider";
import { GradingVerificationSchema, GradingQuestionSchema } from "../../src/domain/grading";
import { blindGradingQuestions } from "../../src/domain/grading-verification";
async function main() {
 const path = process.env.BLIND_GRADING_SYNTHETIC_IMAGE || "";
 assert.ok(path.endsWith("/synthetic-blind-grading.png"));
 const seed = GradingQuestionSchema.parse({ label:"第1题：错误的预期词",question:"错误的抄录",studentAnswer:"错误识读",expectedAnswer:"错误参考",kind:"objective",verdict:"wrong",confidence:"medium",explanation:"误识",knowledgePoints:[],cause:"书写或单位",causeExplanation:"",nextStep:"",evidence:[{fileId:"synthetic-blind-page",page:1,excerpt:"不应传给复核的内容"}] });
 const other = {...seed,label:"第2题",id:"q2"}, questions = blindGradingQuestions([{...seed,id:"q1"},other]);
 const result = await new VisionAI(readAIConfiguration()).run("verify_homework_grading",GradingVerificationSchema,{source:{date:"2026-11-22",subject:"语文",title:"模拟词语抄写",assigned:true,requirements:["这是合成读图测试：编号1、2后的印刷文字代替学生提交的作答，不是待抄写的例字，也没有另一个空白答题区。只核对这两处已提交的文字；参考词语依次为当地和智慧"],primaryPageId:"synthetic-blind-page",pages:[{fileId:"synthetic-blind-page",page:1}]},questions},[{fileId:"synthetic-blind-page",mimeType:"image/png",base64:readFileSync(path).toString("base64")}]);
 assert.equal(result.checks.length,2);
 const first = result.checks.find(q=>q.questionId==="q1")!, second = result.checks.find(q=>q.questionId==="q2")!;
 assert.equal(first.verdict,"correct");assert.equal(first.studentAnswer.replace(/\s/g,""),"当地");
 assert.equal(second.verdict,"correct");assert.equal(second.studentAnswer.replace(/\s/g,""),"智慧");
 console.log("BLIND_GRADING_SYNTHETIC_AI_OK=true locator-alignment,fresh-transcription,no-previous-ocr-hints,two-printed-words,no-family-records");
}
void main().catch(error=>{console.error("BLIND_GRADING_SMOKE_FAILED",error instanceof assert.AssertionError?error.message:error?.code||"CHECK_ERROR");process.exitCode=1;});
