import test from "node:test";
import assert from "node:assert/strict";
import { DailyReportSchema, type ExtractedHomework } from "../src/domain/homework";
import { inferTaskMeaning } from "../src/domain/inferred-meaning";
import { inferredReportScope } from "../src/domain/inferred-scope";
const page:ExtractedHomework["pages"][number]={fileId:"practice-page",subject:"语文",readable:true,book:"模拟语文练习",printedPage:"48—49",content:"第48—49页。第19课《模拟星球》（课题带*）。以下是本课配套练习。",studyTrace:null,uncertainties:[]};
function report(){return DailyReportSchema.parse({date:"2026-11-20",memoId:"memo",updatedAt:"",tasks:[{id:"memo:task:0",subject:"语文",title:"练L19",requirement:"练L19；未写明具体所指",format:"written",coverage:"partial",missing:["L19所指不明，是否有后续页无法确认。"],memoEvidence:[],evidence:[{fileId:page.fileId,page:1,excerpt:"本次练习"}],writtenCompletion:{version:"written-v2",status:"unclear",reason:"范围不明",parts:[{label:"题1",status:"answered",evidence:{fileId:page.fileId,page:1,excerpt:"已填写"}}]}}],uncertainties:[],unassigned:[]});}
test("L19 becomes the evidenced lesson and title, while the original memo and completion evidence remain unchanged",()=>{
 const raw=report(),before=structuredClone(raw),resolved=inferredReportScope(raw,[page]),task=resolved.tasks[0];
 assert.equal(task.inferredMeaning?.number,19);assert.equal(task.inferredMeaning?.title,"模拟星球");assert.equal(task.inferredMeaning?.displayTitle,"第19课《模拟星球》练习");assert.equal(task.inferredMeaning?.evidence[0].excerpt,"第19课《模拟星球》");assert.equal(task.inferredMeaning?.evidence[0].fileId,page.fileId);assert.equal(task.title,"练L19");assert.equal(task.requirement,raw.tasks[0].requirement);assert.equal(task.writtenCompletion?.status,"done");assert.deepEqual(raw,before);assert.deepEqual(inferredReportScope(resolved,[page]),resolved);
});
test("a lesson abbreviation alone, an unrelated page, unreadable text and competing lesson titles never establish meaning",()=>{
 const raw=report().tasks[0];for(const pages of [[],[{...page,content:"第19页《模拟星球》"}],[{...page,content:"第20课《其他课文》"}],[{...page,readable:false}],[{...page,subject:"数学" as const}],[{...page,content:"第19课《模拟星球》，另有第19课《其他课文》"}]])assert.equal(inferTaskMeaning(raw,pages).inferredMeaning,undefined);
 assert.equal(inferTaskMeaning({...raw,title:"练L20"},[page]).inferredMeaning,undefined);
 assert.equal(inferTaskMeaning({...raw,evidence:[{...raw.evidence[0],fileId:"other-page"}]},[page]).inferredMeaning,undefined);
});
test("matching Chinese lesson numbers work for other lessons; meaning is independent of whether work is finished",()=>{
 for(const [n,cn]of[[7,"七"],[19,"十九"],[20,"二十"]]as const){const raw={...report().tasks[0],title:`练L${n}`,requirement:"完成第48页",writtenCompletion:null};const inferred=inferTaskMeaning(raw,[{...page,content:`第${cn}课《模拟课文》`}]);assert.equal(inferred.inferredMeaning?.number,n);assert.equal(inferred.writtenCompletion,null);assert.equal(inferred.coverage,"partial");assert.equal(inferred.requirement,raw.requirement);}
});
