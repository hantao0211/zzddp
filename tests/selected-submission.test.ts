import test from "node:test";
import assert from "node:assert/strict";
import { DailyReportSchema, type UploadTarget } from "../src/domain/homework";
import { selectedReportConclusion, identityOnlyConcern, type SelectedPage } from "../src/domain/selected-submission";
import { isWrittenTask } from "../src/domain/written-completion";
const report=()=>DailyReportSchema.parse({date:"2026-11-20",memoId:"memo",updatedAt:"",uncertainties:[],unassigned:[],tasks:[{id:"task",subject:"语文",title:"2#本订签",requirement:"订正并签字；2#本具体哪一本未写明。",format:"other",coverage:"uncertain",evidence:[],memoEvidence:[],missing:["本子编号不可见，无法确认归属。"],writtenCompletion:null}]});
function page(target:UploadTarget):SelectedPage {return {fileId:"page",page:1,readable:true,subject:"语文",book:null,printedPage:null,content:"底部订正行可见两遍词语。右下有手写签名及日期。",uncertainties:["无法确认本子编号。"],studyTrace:null,target};}
function fixture(){const r=report();return {r,p:page({...r.tasks[0],taskId:"task"})};}
test("selected readable work is received without cover/notebook identity; visible correction and signature finish only those requirements",()=>{
 const {r,p}=fixture(),before=JSON.stringify(r),out=selectedReportConclusion(r,[p]);const t=out.tasks[0];assert.equal(t.coverage,"complete");assert.deepEqual(t.missing,[]);assert.equal(t.writtenCompletion?.status,"done");assert.deepEqual(t.writtenCompletion?.parts.map(p=>p.label),["订正","签字"]);assert.ok(t.selectedSubmission);assert.equal(JSON.stringify(r),before);assert.equal(p.uncertainties.length,1);assert.equal(isWrittenTask(t),true);
 assert.deepEqual(selectedReportConclusion(out,[p]),out,"Projection is idempotent");
});
test("explicit destination is not proof of completion without visible requirements",()=>{
 for(const content of ["底部订正行：____。右下有手写签名。","底部订正行可见两遍词语。右下有签名栏：____。","只有词语作答。","底部订正行可见两遍词语。右下签名处为空白。","底部订正行空白。右下有手写签名。","底部有订正。另有第2题未订正。右下有手写签名。"]){const {r,p}=fixture();p.content=content;const t=selectedReportConclusion(r,[p]).tasks[0];assert.equal(t.coverage,"complete");assert.equal(t.writtenCompletion,null);}
 const {r,p}=fixture();assert.equal(selectedReportConclusion(r,[p],false).tasks[0].writtenCompletion,null);
});
test("wrong subject, explicit wrong page, unreadable work, concrete missing page and real blanks remain unresolved",()=>{
 for(const mode of ["subject","unreadable","wrong-page","missing-page","blank"]){const {r,p}=fixture();if(mode==="subject")p.subject="英语";if(mode==="unreadable")p.readable=false;if(mode.includes("page")){r.tasks[0].title=mode==="wrong-page"?"P74":"P74—75";p.target.title=r.tasks[0].title;p.printedPage=mode==="wrong-page"?"76":"74";}if(mode==="blank")r.tasks[0].missing=["本子第3题未作答。"];const t=selectedReportConclusion(r,[p]).tasks[0];assert.notEqual(t.coverage,"complete",mode);assert.equal(t.writtenCompletion,null);assert.ok(t.missing.length,mode);}
});
test("only the current exact destination is trusted; unrelated pages and superseded memo/task values do not change the report",()=>{
 for(const field of ["taskId","subject","title","requirement","format"] as const){const {r,p}=fixture();Object.assign(p.target,{[field]:field==="format"?"written":field==="subject"?"数学":"changed"});assert.deepEqual(selectedReportConclusion(r,[p]),r);}
 const {r,p}=fixture(),out=selectedReportConclusion(r,[p]);assert.equal(selectedReportConclusion(out,[]).tasks[0].selectedSubmission,undefined);assert.equal(selectedReportConclusion(out,[]).tasks[0].writtenCompletion,null);
});
test("identity filtering never discards a specific missing answer just because the sentence mentions a notebook",()=>{
 for(const s of ["缺少本子编号，无法确认是哪本。","未见本子编号。","不能确认是几号本。","本页未见书名或页眉，无法确定归属。","无法确认完整题号顺序。"] )assert.equal(identityOnlyConcern(s),true,s);
 for(const s of ["本子第1题被切掉了。","本子上的词条看不清。","本子第3题未作答。","本子第75页缺失。","本子中的答案被裁切，看不清。","作业内容不符，照片是作文而非默写。","未订正第3题。"] )assert.equal(identityOnlyConcern(s),false,s);
});
test("old identity-only scope doubts do not override answered parts, but real blank or unclear parts stay",()=>{
 for(const status of ["answered","blank","unclear"] as const){const {r,p}=fixture();r.tasks[0].writtenCompletion={version:"written-v2",status:"unclear",reason:"指定作业范围的照片还不完整，不能判断整项是否写完。",parts:[{label:"第1题",status,evidence:{fileId:p.fileId,page:1,excerpt:"已有作答检查"}}]};assert.equal(selectedReportConclusion(r,[p]).tasks[0].writtenCompletion?.status,status==="answered"?"done":"unclear");}
 const {r,p}=fixture();r.tasks[0].writtenCompletion={status:"unclear",reason:"指定作业范围的照片还不完整，不能判断整项是否写完。",parts:[{label:"第1题",status:"answered",evidence:{fileId:p.fileId,page:1,excerpt:"已有作答检查"}}]};p.uncertainties=["第2题答案被裁切，无法看清。"];assert.equal(selectedReportConclusion(r,[p]).tasks[0].writtenCompletion?.status,"unclear");
});
