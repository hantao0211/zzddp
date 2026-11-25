import assert from "node:assert/strict";
import test from "node:test";
import { AIServiceError } from "../src/server/ai/provider";
import {inferLearningScope,emptyRetestStats,practiceWeight,PracticePaperSchema} from "../src/domain/practice";
test("course scope requires explicit evidence and keeps ambiguous tasks out of both pools",()=>{assert.equal(inferLearningScope("课外英语练习"),"extracurricular");assert.equal(inferLearningScope("课堂练习"),"curricular");assert.equal(inferLearningScope("英语U7练习"),"unknown");assert.equal(inferLearningScope("课内外综合练习"),"unknown");assert.equal(inferLearningScope("课内和课外"),"unknown");});
test("practice weighting balances repeated errors, spaced review and successful retests",()=>{const candidate={occurrences:1,lastDate:"2026-11-22",stats:emptyRetestStats()},today="2026-11-23",base=practiceWeight(candidate,today);assert.ok(practiceWeight({...candidate,occurrences:5},today)>base);assert.ok(practiceWeight({...candidate,lastDate:"2026-10-01"},today)>base);assert.ok(practiceWeight({...candidate,stats:{...candidate.stats,attempts:4,correct:4,consecutivePasses:2}},today)<base);});
test("practice papers enforce a short actual workload rather than a fixed question count",()=>{const q={id:"q",sourceMistakeIds:["m"],knowledgePoint:"模拟",question:"模拟完整题目",answer:"答案",explanation:"依据",estimatedMinutes:5};assert.equal(PracticePaperSchema.safeParse({title:"模拟练习",subject:"数学",questions:[q,q,q]}).success,true);assert.equal(PracticePaperSchema.safeParse({title:"太长",subject:"数学",questions:Array(8).fill(q)}).success,false);});

import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {DailyReportSchema, UploadInputSchema} from "../src/domain/homework";
import {HomeworkStore} from "../src/server/homework/store";
import { HomeworkHTTP } from "../src/server/homework/http";
import {ReadingStore} from "../src/server/reading/store";
import {studentProfile,saveStudentProfile} from "../src/server/reading/student-profile";
import {PracticeStore} from "../src/server/practice/store";
import {PracticeWorker,reconcilePractice} from "../src/server/practice/worker";
import { formatPracticeQuestionText } from "../src/domain/practice-question-text";
import {practiceDocument} from "../src/server/practice/document";
import type {PracticePaper,PracticeGrade} from "../src/domain/practice";
import type {StructuredAI} from "../src/server/ai/provider";
import type {Viewer} from "../src/domain/accounts";
const child:Viewer={id:randomUUID(),username:"child",name:"模拟孩子",role:"child"},parent:Viewer={id:randomUUID(),username:"parent",name:"模拟家长",role:"parent"};
function setup(){const dir=mkdtempSync(join(tmpdir(),"practice-test-"));let now=Date.parse("2026-11-23T10:00:00+08:00");const homework=new HomeworkStore(join(dir,"learning"),()=>now),reading=new ReadingStore(join(dir,"reading"),()=>now);saveStudentProfile(reading,{grade:4,semester:2,region:"模拟地区",school:"模拟学校"},parent.id);const store=new PracticeStore(homework,reading);const seed=(subject="数学",title="课堂练习",id=randomUUID())=>{const q={id,kind:"objective",label:"第1题",question:"1+1等于几？",studentAnswer:"3",expectedAnswer:"2",verdict:"wrong",confidence:"high",explanation:"1加1等于2。",knowledgePoints:["整数加法"],cause:"计算错误",causeExplanation:"可能需要重新核对计算。",nextStep:"再算一次。",evidence:[{fileId:"synthetic-page",page:1,excerpt:"模拟"}],sourcePartLabels:[],verification:"agreed"};homework.db.prepare("INSERT INTO grading_mistakes(id,first_date,last_date,subject,title,page_id,payload) VALUES(?,?,?,?,?,?,?)").run(id,reading.today(),reading.today(),subject,title,"synthetic-page",JSON.stringify(q));return id;};return{dir,homework,reading,store,seed,time:(day:string)=>now=Date.parse(day+"T10:00:00+08:00"),close(){homework.close();reading.close();rmSync(dir,{recursive:true,force:true});}};}
const jpeg=(n=1)=>Buffer.from([255,216,255,224,n,2,3,4]).toString("base64");

test("homework uploads have a curricular default and an explicit extracurricular choice", () => {
  const f = setup();
  try {
    const date = f.store.today();
    const files = [{ name: "模拟照片.jpg", size: 12, sha256: "a".repeat(64) }];
    const standard = f.homework.begin({ date, kind: "homework", files });
    assert.equal(standard.scopeSource?.scope, "curricular");
    assert.throws(() => f.homework.begin({ date, kind: "homework", files, scope: "extracurricular" }), /已有归属/);
    const extra = f.homework.begin({
      date, kind: "homework", scope: "extracurricular", files: [{ ...files[0], sha256: "b".repeat(64) }],
    });
    assert.equal(extra.scopeSource?.scope, "extracurricular");
    assert.equal(UploadInputSchema.safeParse({ date, kind: "memo", files, scope: "curricular" }).success, false);
    const memo = f.homework.begin({ date, kind: "memo", files });
    const assignments = ["普通练习", "课外拓展", "课内外综合"].map(title => ({
      subject: "数学", title, requirement: title, format: "written", evidence: [{ fileId: "memo", page: 1, excerpt: title }],
    }));
    f.homework.db.prepare("UPDATE uploads SET result=? WHERE id=?")
      .run(JSON.stringify({ date, readable: true, assignments, uncertainties: [] }), memo.id);
    assert.deepEqual(f.homework.scopes.entries(f.homework.upload(memo.id)!).map(source => source.scope), ["curricular", "extracurricular", "unknown"]);
    f.homework.db.prepare("DELETE FROM homework_source_scopes WHERE source_kind='memo-default' AND source_id=?").run(memo.id);
    assert.deepEqual(f.homework.scopes.entries(f.homework.upload(memo.id)!).map(source => source.scope), ["unknown", "extracurricular", "unknown"]);
    assert.equal(f.homework.begin({ date, kind: "memo", files }).id, memo.id);
    assert.equal(f.homework.scopes.entries(f.homework.upload(memo.id)!)[0].scope, "unknown");
  } finally { f.close(); }
});

test("mistakes inherit their exact source, while question edits and other assignments stay independent", () => {
  const f = setup();
  try {
    const date = f.store.today();
    const ids = ["old1", "old2", "old3", "fresh", "neighbor"].map(() => f.seed("数学", "已上传作业"));
    const upload = f.homework.begin({ date, kind: "homework", scope: "extracurricular",
      files: [{ name: "模拟课外.jpg", size: 12, sha256: "b".repeat(64) }] });
    f.homework.setPages(upload.files[0].id, [{ id: "fresh-page", file_id: upload.files[0].id, number: 1 }]);
    const link = f.homework.db.prepare("UPDATE grading_mistakes SET page_id=? WHERE id=?");
    ids.forEach((id, index) => link.run(["old-page", "old-page", "old-page2", "fresh-page", "neighbor-page"][index], id));
    const task = (id: string, title: string, pages: string[]) => ({
      id, title, subject: "数学", requirement: title, format: "written", memoEvidence: [], coverage: "complete",
      evidence: pages.map(fileId => ({ fileId, page: 1, excerpt: "模拟" })), missing: [],
    });
    const report = DailyReportSchema.parse({ date, memoId: null, updatedAt: "", uncertainties: [], unassigned: [],
      tasks: [task("old", "原作业", ["old-page", "old-page2"]), task("neighbor", "课外模拟作业", ["neighbor-page"])] });
    f.homework.db.prepare("INSERT INTO days(date,report) VALUES(?,?)").run(date, JSON.stringify(report));
    const getScopes = () => ids.map(id => f.store.candidates("数学").find(candidate => candidate.id === id)?.scope);
    assert.deepEqual(getScopes(), ["unknown", "unknown", "unknown", "extracurricular", "extracurricular"]);
    assert.deepEqual(f.store.selectSources("数学"), []);
    const source = f.store.candidates().find(item => item.id === ids[0])!.scopeSource!;
    assert.equal(source.title, "原作业");
    const numberOfJobs = f.homework.db.prepare("SELECT count(*) AS n FROM jobs").get();
    f.homework.scopes.set(source, "curricular");
    assert.deepEqual(getScopes(), ["curricular", "curricular", "curricular", "extracurricular", "extracurricular"]);
    f.store.classify(ids[0], "extracurricular", parent);
    assert.deepEqual(getScopes(), ["extracurricular", "curricular", "curricular", "extracurricular", "extracurricular"]);
    const items = new PracticeHTTP(f.store).mistakes("数学", "extracurricular", 0).items;
    const corrected = items.find(item => item.id === ids[0])!;
    assert.equal(corrected.scopeSource, undefined, "Manual classification stays independent of the source assignment");
    assert.deepEqual(corrected.provenance, { kind: "assignment", title: "原作业" });
    assert.equal(corrected.pageId, "old-page");
    assert.deepEqual(items.find(item => item.id === ids[3])?.provenance, { kind: "unmatched", title: undefined });
    assert.deepEqual(new Set(f.store.selectSources("数学").map(item => item.id)), new Set(ids.slice(1, 3)));
    assert.deepEqual(f.homework.db.prepare("SELECT count(*) AS n FROM jobs").get(), numberOfJobs);
  } finally { f.close(); }
});

test("mistake provenance can recover a unique named assignment from historical grading", () => {
  const f = setup();
  try {
    const id = f.seed("数学", "已上传作业");
    const date = f.store.today();
    const addRun = (runId: string, taskId: string, title: string) => {
      f.homework.db.prepare(`INSERT INTO grading_runs(id,date,primary_page_id,source,active,status,created_at,updated_at)
        VALUES(?,?,?,?,0,'done',?,?)`).run(runId, date, "synthetic-page",
          JSON.stringify({ subject: "数学", assigned: true, title, taskIds: [taskId] }), date, date);
      f.homework.db.prepare("INSERT INTO grading_occurrences VALUES(?,?,?)").run(id, runId, "q1");
    };
    const http = new PracticeHTTP(f.store);
    addRun("old-one", "old-task", "模拟校本练习");
    assert.deepEqual(http.mistakes("数学", undefined, 0).items[0].provenance, { kind: "assignment", title: "模拟校本练习" });
    addRun("old-two", "another-task", "模拟另一项练习");
    assert.deepEqual(http.mistakes("数学", undefined, 0).items[0].provenance, { kind: "unmatched", title: undefined });
  } finally { f.close(); }
});
function fakeAI(mode:"correct"|"wrong"|"uncertain"|"blank"="correct"){const calls:string[]=[];let passes=0;const ai:StructuredAI={async run(task,schema,metadata:any){calls.push(task);if(task==="generate_practice")return schema.parse({title:"模拟15分钟练习",subject:metadata.subject,questions:[1,2,3].map(n=>({id:"q"+n,sourceMistakeIds:[metadata.mistakes[0].id],knowledgePoint:"整数加法",question:`${n}+0等于几？`,answer:String(n),explanation:"加0不变。",estimatedMinutes:5}))});if(task==="verify_practice")return schema.parse({approved:true,checks:metadata.candidate.questions.map((q:any)=>({questionId:q.id,correct:true,reason:"已独立计算。"}))});if(task==="grade_practice"){passes++;return schema.parse({scopeComplete:true,note:"",answers:metadata.questions.map((q:any,i:number)=>({questionId:q.id,studentAnswer:mode==="blank"?"":String(mode==="wrong"&&i===0?8:mode==="uncertain"&&passes%2===0&&i===0?9:i+1),expectedAnswer:String(i+1),verdict:mode==="blank"?"blank":mode==="wrong"&&i===0?"wrong":"correct",confidence:"high",explanation:"模拟解答依据。",evidenceIds:[metadata.pages[0]]}))});}throw Error("Unexpected AI task "+task);}};return{ai,calls};}

test("only classified curricular mistakes can generate; a date and subject own one persistent paper",async()=>{const f=setup();try{const id=f.seed("数学","英语课外拓展"),unknown=f.seed("英语","U7练习");assert.throws(()=>f.store.create("数学",child),/课内错题/);assert.throws(()=>f.store.classify(unknown,"curricular",child),/家长/);f.store.classify(id,"curricular",parent);const paper=f.store.create("数学",child);assert.equal(f.store.create("数学",parent).id,paper.id);assert.equal(f.store.candidates("英语")[0].scope,"unknown");const provider=fakeAI(),worker=new PracticeWorker(f.store,()=>provider.ai);await worker.tick();assert.equal(f.store.view(paper.id).status,"ready");assert.deepEqual(provider.calls,["generate_practice","verify_practice"]);assert.ok(!("answer" in f.store.view(paper.id).paper!.questions[0]));assert.equal(await worker.tick(),false);}finally{f.close();}});
test("actual completed work earns two regardless of correctness, exactly once, and updates retest statistics",async()=>{const f=setup();try{const source=f.seed(),provider=fakeAI("wrong"),worker=new PracticeWorker(f.store,()=>provider.ai),paper=f.store.create("数学",child);await worker.tick();f.store.submit(paper.id,{photos:[{name:"模拟答卷",image:jpeg()}]},child);const version=f.store.row(paper.id).version;f.store.submit(paper.id,{photos:[{name:"换个名字",image:jpeg()}]},child);assert.equal(f.store.row(paper.id).version,version);await worker.tick();assert.equal(f.store.view(paper.id).status,"graded");assert.equal(f.reading.balance(),2);assert.equal(f.store.view(paper.id).rewarded,2);f.store.syncRewards();assert.equal(f.reading.balance(),2);assert.equal(f.reading.snapshot(child).growth.earned,2);const stats=f.store.stats(source,"curricular");assert.equal(stats.attempts,3);assert.equal(stats.correct,2);assert.equal(stats.wrong,1);assert.equal(stats.passRate,67);assert.equal(f.store.candidates().filter(c=>c.origin==="practice").length,1);f.store.submit(paper.id,{photos:[{name:"重传",image:jpeg()}]},child);assert.equal(f.reading.balance(),2);assert.equal(provider.calls.length,4);assert.throws(()=>f.store.submit(paper.id,{photos:[{name:"另一张",image:jpeg(2)}]},child),/已完成批改/);}finally{f.close();}});
test("unclear or blank answers never become wrong retests; parents can confirm real completion without changing verdicts",async()=>{const f=setup();try{const source=f.seed(),provider=fakeAI("uncertain"),worker=new PracticeWorker(f.store,()=>provider.ai),paper=f.store.create("数学",child);await worker.tick();f.store.submit(paper.id,{photos:[{name:"模拟答卷",image:jpeg()}]},child);await worker.tick();assert.equal(f.reading.balance(),0);assert.equal(f.store.view(paper.id).result!.answers[0].verdict,"uncertain");assert.equal(f.store.stats(source,"curricular").attempts,2);assert.equal(f.store.stats(source,"curricular").uncertain,1);assert.throws(()=>f.store.manualComplete(paper.id,"实际完成",child),/家长/);f.store.manualComplete(paper.id,"家长看过完整答卷，实际都写了。",parent);f.store.manualComplete(paper.id,"再次确认",parent);assert.equal(f.reading.balance(),2);assert.equal(f.store.view(paper.id).result!.answers[0].verdict,"uncertain");assert.equal((f.store.db.prepare("SELECT COUNT(*) AS n FROM practice_manual_reviews").get() as any).n,1);}finally{f.close();}});
test("new uploads replace the grading set and preserve history; incomplete attempts do not inflate rates",async()=>{const f=setup();try{const source=f.seed(),blank=fakeAI("blank"),worker=new PracticeWorker(f.store,()=>blank.ai),paper=f.store.create("数学",child);await worker.tick();f.store.submit(paper.id,{photos:[{name:"空白",image:jpeg()}]},child);await worker.tick();assert.equal(f.reading.balance(),0);f.store.submit(paper.id,{photos:[{name:"补齐",image:jpeg(2)}]},child);assert.equal(f.store.currentPhotos(f.store.row(paper.id)).length,1);assert.equal(f.store.photos(paper.id).length,2);const correct=fakeAI(),second=new PracticeWorker(f.store,()=>correct.ai);await second.tick();assert.equal(f.reading.balance(),2);assert.equal(f.store.stats(source,"curricular").attempts,3);assert.equal((f.store.db.prepare("SELECT COUNT(*) AS n FROM practice_history").get() as any).n,2);}finally{f.close();}});
test("different old papers completed on the same day share the subject reward cap, even after restart reconciliation",async()=>{const f=setup();try{f.seed();const provider=fakeAI(),worker=new PracticeWorker(f.store,()=>provider.ai),old=f.store.create("数学",child);await worker.tick();f.time("2026-11-24");const current=f.store.create("数学",child);await worker.tick();f.store.submit(old.id,{photos:[{name:"旧答卷",image:jpeg()}]},child);await worker.tick();assert.equal(f.reading.balance(),2);assert.throws(()=>f.store.submit(current.id,{photos:[{name:"复用同图",image:jpeg()}]},child),/另一份练习/);f.store.submit(current.id,{photos:[{name:"新答卷",image:jpeg(2)}]},child);await worker.tick();assert.equal(f.reading.balance(),2);assert.equal(f.store.view(current.id).rewarded,0);assert.equal(f.store.rewards.credit(old.id,"数学",f.reading.today(),child.id),2);assert.equal(f.reading.balance(),2);}finally{f.close();}});
test("practice question layout restores option and answer lines without flattening existing paragraphs", () => {
  assert.equal(formatPracticeQuestionText("选出正确句子。 A. Option one B. Option two C. Option three 你的答案：______"),
    "选出正确句子。\nA. Option one\nB. Option two\nC. Option three\n你的答案：______");
  assert.equal(formatPracticeQuestionText("读句子。\r\n（1） 第一题 （2） 第二题 作答区： （1） ____ （2） ____"),
    "读句子。\n（1） 第一题\n（2） 第二题\n作答区：\n（1） ____\n（2） ____");
  assert.equal(formatPracticeQuestionText("The first number is 2.5. Mr. A. came to class."), "The first number is 2.5. Mr. A. came to class.");
  assert.equal(formatPracticeQuestionText("题干\n\n另一段"), "题干\n\n另一段");
});

test("the mistake endpoint bounds each page and keeps same-day pages disjoint", async () => {
  const f = setup();
  for (let n = 0; n < 21; n++) f.seed("数学", "课堂练习");
  f.seed("英语", "课堂练习");
  f.seed("数学", "课外拓展");
  const homework = new HomeworkHTTP(f.homework, undefined, new PracticeHTTP(f.store));
  const server = createServer((req, res) => void homework.handle(req, res, parent));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const endpoint = `http://127.0.0.1:${address.port}/assistant-api/learning/mistakes?subject=数学&scope=curricular`;
    const pages = await Promise.all([0, 10, 20].map(async offset => {
      const response = await fetch(`${endpoint}&limit=10&offset=${offset}`);
      assert.equal(response.status, 200);
      return await response.json() as { total: number; items: { id: string }[] };
    }));
    assert.deepEqual(pages.map(page => page.total), [21, 21, 21]);
    assert.deepEqual(pages.map(page => page.items.length), [10, 10, 1]);
    assert.equal(new Set(pages.flatMap(page => page.items.map(item => item.id))).size, 21);
    const legacy = await fetch(endpoint);
    assert.equal((await legacy.json()).items.length, 21);
    assert.equal((await fetch(endpoint + "&limit=31")).status, 400);
  } finally {
    server.close();
    f.close();
  }
});

test("print documents escape all supplied text and never leak answers in a child question sheet",()=>{const paper:PracticePaper={title:'<script>bad</script>',subject:"数学",questions:[{id:"q",sourceMistakeIds:["m"],knowledgePoint:"加法",question:'1+1？<img onerror="bad">',answer:"SECRET-ANSWER",explanation:"SECRET-SOLUTION",estimatedMinutes:5}]};const plain=practiceDocument(paper,"4年级第2学期","2026-11-23");assert.ok(!plain.includes('<script>'));assert.ok(plain.includes('&lt;img'));assert.ok(!plain.includes("SECRET-ANSWER"));assert.ok(practiceDocument(paper,"模拟阶段","2026-11-23",true).includes("SECRET-ANSWER"));});

test("parent correction preserves original AI result and audit, and a later retest updates the original source chain",async()=>{const f=setup();try{const root=f.seed(),provider=fakeAI("wrong"),worker=new PracticeWorker(f.store,()=>provider.ai),p=f.store.create("数学",child);await worker.tick();f.store.submit(p.id,{photos:[{name:"答卷",image:jpeg()}]},child);await worker.tick();const original=(f.store.db.prepare("SELECT result FROM practice_history WHERE practice_id=?").get(p.id) as any).result;assert.throws(()=>f.store.reviewAnswer(p.id,"q1",{verdict:"correct",studentAnswer:"1",expectedAnswer:"1",reason:"核对"},child),/家长/);f.store.reviewAnswer(p.id,"q1",{verdict:"correct",studentAnswer:"1",expectedAnswer:"1",reason:"家长逐字核对原答卷"},parent);assert.equal((f.store.db.prepare("SELECT result FROM practice_history WHERE practice_id=?").get(p.id) as any).result,original);assert.equal(f.store.stats(root,"curricular").passRate,100);assert.equal(f.reading.balance(),2);assert.equal((f.store.db.prepare("SELECT COUNT(*) AS n FROM practice_manual_reviews").get() as any).n,1);
 f.store.reviewAnswer(p.id,"q1",{verdict:"wrong",studentAnswer:"8",expectedAnswer:"1",reason:"核对更正"},parent);const derived=f.store.candidates().find(c=>c.origin==="practice")!;assert.ok(f.store.sourceChain([derived.id]).includes(root));assert.equal(new Set(f.store.sourceChain([derived.id,root])).size,2);
 }finally{f.close();}});
test("blank retests remain separate from uncertain and excluded from confirmed pass rates",async()=>{const f=setup();try{const source=f.seed(),ai=fakeAI("blank"),worker=new PracticeWorker(f.store,()=>ai.ai),p=f.store.create("数学",child);await worker.tick();f.store.submit(p.id,{photos:[{name:"空白答卷",image:jpeg()}]},child);await worker.tick();const s=f.store.stats(source,"curricular");assert.equal(s.blank,3);assert.equal(s.uncertain,0);assert.equal(s.passRate,null);assert.equal(s.lastVerdict,"blank");assert.equal(f.reading.balance(),0);}finally{f.close();}});
test("failed generation requires parent retry, remains bounded, and never publishes unverified questions",async()=>{const f=setup();try{f.seed();const good=fakeAI(),bad:StructuredAI={async run(task,schema,metadata,images){if(task==="verify_practice")return schema.parse({approved:false,checks:[]});return good.ai.run(task,schema,metadata,images);}},worker=new PracticeWorker(f.store,()=>bad),p=f.store.create("数学",child);await worker.tick();assert.equal(f.store.view(p.id).status,"failed");assert.equal(f.store.view(p.id).paper,null);assert.equal(await worker.tick(),false);assert.throws(()=>f.store.retry(p.id,child),/家长/);f.store.retry(p.id,parent);await worker.tick();assert.equal(f.store.view(p.id).retryAllowed,false);assert.throws(()=>f.store.retry(p.id,parent),/上限/);assert.equal(good.calls.length,2);assert.equal(f.reading.balance(),0);}finally{f.close();}});
test("invalid grading is not cached; a parent retry can recover without a new upload",async()=>{const f=setup();try{f.seed();const good=fakeAI();let malformed=true;const ai:StructuredAI={async run(task,schema,metadata,images){const v:any=await good.ai.run(task,schema,metadata,images);if(task==="grade_practice"&&malformed)v.answers[0].questionId="invented";return v;}},worker=new PracticeWorker(f.store,()=>ai),p=f.store.create("数学",child);await worker.tick();f.store.submit(p.id,{photos:[{name:"答卷",image:jpeg()}]},child);await worker.tick();assert.equal(f.store.view(p.id).status,"failed");malformed=false;f.store.retry(p.id,parent);await worker.tick();assert.equal(f.store.view(p.id).status,"graded");assert.equal(f.reading.balance(),2);assert.equal(f.store.photos(p.id).length,1);}finally{f.close();}});
import {CurriculumStore} from "../src/server/practice/materials";
import {PracticeHTTP} from "../src/server/practice/http";
import {createServer,type IncomingMessage} from "node:http";
import {Readable} from "node:stream";
function materialDraft(scope="curricular"){return{id:randomUUID(),subject:"数学",scope,kind:"textbook",grade:4,semester:2,title:"模拟学校教材",version:"待核对",unit:"第一单元",content:"仅根据提供的范围复习"};}
function incoming(bytes:Buffer){const request=Readable.from([bytes.subarray(0,3),bytes.subarray(3)]) as IncomingMessage;request.headers={"content-length":String(bytes.length),"content-type":"application/octet-stream"};return request;}
test("curriculum saves originals idempotently, indexes only selected pages and respects classification and grade",async()=>{const f=setup();try{const m=new CurriculumStore(f.store),draft=materialDraft(),saved=m.save(draft,parent.id);assert.equal(m.save(draft,parent.id).revision,saved.revision);assert.throws(()=>m.save({...draft,title:"另一标题"},parent.id),/刚被更新/);const id=randomUUID(),bytes=Buffer.from(jpeg(),"base64");m.reserve(saved.id,{id,name:"模拟原件.jpg",bytes:bytes.length});await m.receive(id,incoming(bytes));assert.deepEqual(readFileSync(m.path(id)),bytes);assert.equal(m.file(id).stored,1);const job=m.index(id,{first:1,last:1});assert.equal(m.index(id,{first:1,last:1}).id,job.id);assert.throws(()=>m.index(id,{first:1,last:9}));assert.throws(()=>m.index(id,{first:2,last:2}),/照片只有一页/);assert.equal(m.context("数学",4,2).length,1);m.save({...draft,scope:"extracurricular",revision:saved.revision},parent.id);assert.equal(m.context("数学",4,2).length,0);assert.equal(m.context("数学",3,2).length,0);assert.equal(m.file(id).stored,1);}finally{f.close();}});
test("indexed page corrections retain original text, require a current revision, and do not overwrite other pages",()=>{const f=setup();try{const m=new CurriculumStore(f.store),d=materialDraft(),saved=m.save(d,parent.id),file=randomUUID();m.reserve(d.id,{id:file,name:"模拟.pdf",bytes:10});f.store.db.prepare("INSERT INTO curriculum_pages VALUES(?,?,?,?,?,?)").run(d.id,file,2,"识别原文","第一单元",JSON.stringify(["整数"]));const page=m.pages(d.id).items[0];m.editPage(d.id,file,2,{text:"核对后的原文",unit:"第一单元",knowledgePoints:["整数加法"],revision:page.revision},parent.id);assert.equal(m.pages(d.id).items[0].text,"核对后的原文");assert.throws(()=>m.editPage(d.id,file,2,{text:"过期覆盖",unit:"",knowledgePoints:[],revision:page.revision},parent.id),/刚被更新/);assert.equal((f.store.db.prepare("SELECT COUNT(*) AS n FROM curriculum_page_edits").get() as any).n,1);}finally{f.close();}});
test("practice HTTP enforces parent permissions, hides answers, and validates pagination and raw uploads",async()=>{const f=setup(),http=new PracticeHTTP(f.store),server=createServer((req,res)=>void http.handle(req,res,req.headers["x-test-role"]==="parent"?parent:child));await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const base=`http://127.0.0.1:${(server.address() as any).port}/assistant-api/learning/practice/`,call=(path:string,method="GET",value?:unknown,role="child")=>fetch(base+path,{method,headers:{"x-test-role":role,...(value===undefined?{}:{"Content-Type":"application/json"})},body:value===undefined?undefined:JSON.stringify(value)});try{const source=f.seed(),worker=new PracticeWorker(f.store,()=>fakeAI().ai),p=f.store.create("数学",child);await worker.tick();assert.equal((await call("state")).status,200);const item=await(await call("items/"+p.id)).json();assert.ok(!("answer" in item.paper.questions[0]));assert.equal((await call(`items/${p.id}/document?answers=1`)).status,403);assert.equal((await call(`items/${p.id}/document?answers=1`,"GET",undefined,"parent")).status,200);const answerPath=`items/${p.id}/document?answers=1&format=json`;
 assert.equal((await call(answerPath)).status,403);
 const response=await call(answerPath,"GET",undefined,"parent");assert.equal(response.status,200);assert.match(response.headers.get("cache-control")??"",/no-store/);
 const answers=await response.json();assert.ok(answers.questions[0].answer);assert.ok(answers.questions[0].explanation);
 assert.equal((await call("materials","POST",materialDraft())).status,403);assert.equal((await call("scopes/"+source,"PATCH",{scope:"extracurricular"})).status,403);assert.equal((await call("scopes/"+source,"PATCH",{scope:"unknown"},"parent")).status,200);const d=materialDraft();assert.equal((await call("materials","POST",d,"parent")).status,200);assert.equal((await call(`materials/${d.id}/pages?offset=-1`)).status,400);assert.equal((await call("generate","POST",{subject:"体育"})).status,400);assert.equal((await call("files/"+randomUUID(),"PUT",{},"parent")).status,404);assert.equal((await call(`items/${p.id}/complete`,"POST",{reason:"未做"})).status,403);assert.equal(f.reading.balance(),0);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));f.close();}});

import {SYSTEM_HELP} from "../src/domain/system-help";
test("system help retains structured existing workflows and accurately describes practice availability",()=>{assert.equal(typeof SYSTEM_HELP,"object");assert.ok(SYSTEM_HELP.workflows.length>10);assert.match(SYSTEM_HELP.practiceAndCurriculum,/2个小脚步/);assert.ok(!SYSTEM_HELP.unavailable.includes("真实针对练习自动发布"));});
test("parent downgrading a wrong result to uncertain removes it from the verified practice mistake pool",async()=>{const f=setup();try{f.seed();const ai=fakeAI("wrong"),worker=new PracticeWorker(f.store,()=>ai.ai),p=f.store.create("数学",child);await worker.tick();f.store.submit(p.id,{photos:[{name:"答卷",image:jpeg()}]},child);await worker.tick();assert.equal(f.store.candidates().filter(c=>c.origin==="practice").length,1);f.store.reviewAnswer(p.id,"q1",{verdict:"uncertain",studentAnswer:"",expectedAnswer:"1",reason:"原字迹不足以判错"},parent);assert.equal(f.store.candidates().filter(c=>c.origin==="practice").length,0);assert.equal(f.store.view(p.id).result!.answers[0].verdict,"uncertain");assert.equal(f.reading.balance(),2);}finally{f.close();}});
test("source reclassification during AI generation prevents publishing an extracurricular question set",async()=>{const f=setup();try{const id=f.seed(),provider=fakeAI(),p=f.store.create("数学",child);const ai:StructuredAI={async run(task,schema,metadata,images){const result=await provider.ai.run(task,schema,metadata,images);if(task==="verify_practice")f.store.classify(id,"extracurricular",parent);return result;}};await new PracticeWorker(f.store,()=>ai).tick();assert.equal(f.store.view(p.id).status,"failed");assert.equal(f.store.view(p.id).paper,null);assert.match(f.store.view(p.id).note,/归属/);assert.throws(()=>f.store.retry(p.id,parent),/课内错题/);}finally{f.close();}});
test("parent confirmation requires actual answers and removes stale AI pending notes",async()=>{const f=setup();try{f.seed();const ai=fakeAI("uncertain"),worker=new PracticeWorker(f.store,()=>ai.ai),p=f.store.create("数学",child);await worker.tick();f.store.submit(p.id,{photos:[{name:"答卷",image:jpeg()}]},child);await worker.tick();assert.throws(()=>f.store.reviewAnswer(p.id,"q1",{verdict:"correct",studentAnswer:"",expectedAnswer:"1",reason:"核对"},parent),/实际作答/);f.store.reviewAnswer(p.id,"q1",{verdict:"correct",studentAnswer:"1",expectedAnswer:"1",reason:"核对完成"},parent);assert.equal(f.store.view(p.id).note,"家长已核对更正本次结果。");assert.equal(f.reading.balance(),2);}finally{f.close();}});

test("marked exams retain independent pages, scoped mistakes, teacher evidence and dated statistics",()=>{
  const f=setup();
  try {
    const {store}=f, exams=store.exams, http=new PracticeHTTP(store);
    const meta={title:"模拟测验",grade:4,semester:1,subject:"英语",kind:"单元测验",scope:"curricular",date:f.store.today(),score:9,maximum:10,unit:"U2"} as const;
    const manifest={meta,pages:[{sha:"a".repeat(64),bytes:100},{sha:"b".repeat(64),bytes:100}]};
    const exam=exams.reserve(manifest);
    assert.equal(exams.reserve(manifest).exam.id,exam.exam.id);
    const template={label:"单选题 第1题",question:"阅读理解，选择正确答案。",studentAnswer:"A",teacherMark:"老师画叉",expectedAnswer:"B",correction:"订正为B",verdict:"wrong",confident:true,knowledgePoints:["近义词辨析"],cause:"原因待确认",causeExplanation:""} as const;
    const result={coverage:"complete",note:"",questions:[template,{...template,label:"第2题",verdict:"correct",teacherMark:"老师画勾"},{...template,label:"第3题",teacherMark:""}]};
    const page=exam.pages[0].id;
    exams.savePage(page,result);exams.savePage(page,result);
    assert.equal(exams.detail(exam.exam.id).questions.length,3);
    assert.equal(http.mistakes(undefined,undefined,0).analysis.wrongRate,null,"missing second page excludes whole paper rate");
    exams.savePage(exam.pages[1].id,{coverage:"complete",note:"",questions:[{...template,label:"第4题",verdict:"correct",teacherMark:"老师画勾"}]});
    const filter=new URLSearchParams("form=单选题&form=填空题&scene=阅读理解&source=单元测验");
    const first=http.mistakes("英语","curricular",0,10,filter);
    assert.equal(first.total,1);assert.equal(first.items[0].provenance?.title,meta.title);
    const analysis=http.mistakes("英语","curricular",0).analysis;
    assert.equal(analysis.known,3);assert.equal(analysis.wrongRate,33);assert.equal(analysis.unknown,1);assert.equal(analysis.sources,1);
    const id=first.items[0].id;
    assert.equal(store.selectSources("英语")[0].id,id);
    assert.ok(first.items[0].imageUrl?.includes(page));
    store.analysis.saveEdit(id,{revision:0,tags:{knowledge:["主谓一致"]}},parent.id);
    assert.equal(http.mistakes("英语",undefined,0,10,new URLSearchParams("knowledge=主谓一致")).total,1);
    assert.deepEqual(store.selectSources("英语")[0].knowledgePoints,["主谓一致"]);
    assert.throws(()=>store.analysis.saveEdit(id,{revision:0,tags:{}},parent.id));
    exams.editMeta(exam.exam.id,{previous:meta,meta:{...meta,scope:"extracurricular"}},parent.id);
    assert.equal(store.selectSources("英语").length,0);
    exams.review(page,{id,revision:1,value:{...template,verdict:"correct",teacherMark:"家长核对老师画勾"}},parent.id);
    assert.equal(http.mistakes("英语",undefined,0).total,0);
    assert.equal(exams.detail(exam.exam.id).questions.find(q=>q.id===id)?.correction,"订正为B");
    assert.equal(store.db.prepare("SELECT count(*) n FROM exam_reviews").get()?.n,2);
    assert.equal(store.db.prepare("SELECT count(*) n FROM uploads").get()?.n,0);
  } finally {f.close();}
});

test("a truncated exam page retries once while page and archive status follow real work",async t=>{
  const f=setup();
  try{
    const exams=f.store.exams;
    const paper=exams.reserve({pages:["a","b"].map(c=>({sha:c.repeat(64),bytes:100}))});
    const [one,two]=paper.pages;
    const result={coverage:"complete",note:"",questions:[]};
    exams.savePage(two.id,result);
    f.store.db.prepare("UPDATE exam_pages SET status='queued' WHERE id=?").run(one.id);
    t.mock.method(exams as unknown as {aiImage:(id:string)=>unknown},"aiImage",async(id:string)=>({fileId:id,mimeType:"image/jpeg",base64:jpeg()}));
    const targets=Array.from({length:7},(_,i)=>({label:String(i+1),anchor:"第"+(i+1)+"题"}));
    const calls:string[]=[];
    const worker=new PracticeWorker(f.store,()=>({async run(task,schema,metadata,images){
      assert.equal(images?.[0].fileId,one.id);
      check("整理中");
      if(task==="index_exam_page"){
        calls.push("index");
        return schema.parse({targets,coverage:"complete",note:""});
      }
      const group=(metadata as {targets?:Array<{label:string,targetId:number}>}).targets;
      if(!group){
        calls.push("full");
        throw new AIServiceError("INCOMPLETE_RESPONSE",true,"legacy incomplete");
      }
      const start=group[0].label;
      calls.push(start);
      const questions=group.map(({label})=>({label,question:"模拟题"+label,studentAnswer:"1",teacherMark:"勾",
        expectedAnswer:"",correction:"",verdict:"correct",confident:true,knowledgePoints:[],cause:"原因待确认",causeExplanation:""}));
      if(start==="6" && calls.length===4)questions.pop();
      const groups=questions.map(({label,...q})=>({targetId:Number(label),questions:[{...q,part:""}]}));
      if(start==="6" && groups.length===2)groups[1].questions=[{...groups[1].questions[0],part:"(1)"},{...groups[1].questions[0],part:"(2)"}];
      return schema.parse({...result,groups});
    }}));
    function check(status:string){
      assert.equal(exams.detail(paper.exam.id).exam.status,status);
      assert.equal(exams.list(0,10).items[0].status,status);
    }
    await worker.tick();check("等待识读");
    await worker.tick();check("识读未完成");
    await worker.tick();assert.deepEqual(calls,["full","index","1","6"]);
    assert.equal(exams.detail(paper.exam.id).questions.length,0);
    assert.equal(exams.list(0,10).items[0].firstFailedPage,1);
    exams.retry(one.id);check("等待识读");
    await worker.tick();check("已整理");
    assert.deepEqual(calls,["full","index","1","6","6"]);
    assert.deepEqual(exams.detail(paper.exam.id).questions.map(q=>q.label),[...targets.slice(0,6).map(t=>t.label),"7 · (1)","7 · (2)"]);
    assert.equal(exams.page(two.id).attempts,0);
  }finally{f.close();}
});

test("photos alone admit marked mistakes before metadata and preserve edits as later pages arrive",()=>{
  const f=setup();
  try {
    const {store}=f, exams=store.exams, http=new PracticeHTTP(store);
    const manifest={pages:["1","2","3"].map(c=>({sha:c.repeat(64),bytes:100}))};
    const {exam,pages}=exams.reserve(manifest);
    assert.equal(exam.subject,null);
    const marked={label:"添括号 第3题",question:"给算式添上括号",studentAnswer:"",teacherMark:"该题右侧有叉",expectedAnswer:"",correction:"",verdict:"wrong",confident:true,knowledgePoints:["运算顺序"],cause:"原因待确认",causeExplanation:""};
    const page={coverage:"complete",note:"",questions:[marked]};
    exams.savePage(pages[1].id,{...page,metadata:{date:"无日期",grade:17,score:"不详"}});
    const book=http.mistakes(undefined,undefined,0);
    assert.equal(book.total,1);assert.equal(book.items[0].subject,"科目待补充");
    assert.equal(book.items[0].scope,"curricular");assert.equal(book.items[0].date,"");
    assert.equal(http.mistakes("语文",undefined,0).total,0);
    assert.equal(http.mistakes(undefined,undefined,0,10,new URLSearchParams("grain=week")).analysis.trends[0].period,"测验日期待补充");
    exams.savePage(pages[0].id,{...page,questions:[],metadata:{title:"小练习",subject:"数学",grade:4}});
    assert.equal(http.mistakes("数学",undefined,0).total,1);
    const {id,pages:_count,done,status,...previous}=exams.detail(exam.id).exam;
    assert.equal(previous.maximum,null);assert.equal(previous.semester,null);
    exams.editMeta(id,{previous,meta:{...previous,title:"家长核对的名称"}},parent.id);
    exams.savePage(pages[2].id,{...page,questions:[],metadata:{title:"另一个标题",grade:5}});
    const saved=exams.reserve(manifest);
    assert.equal(saved.exam.title,"家长核对的名称");assert.equal(saved.exam.grade,null);
    assert.equal(saved.questions.length,1);assert.equal(saved.questions[0].pageId,pages[1].id);
  }finally{f.close();}
});

test("exam photo scope honors selection and merges clear source evidence across pages",()=>{
  const f=setup();
  try{
    const exams=f.store.exams, manifest={pages:["1","2"].map(c=>({sha:c.repeat(64),bytes:40}))};
    const page={coverage:"complete",note:"",questions:[]};
    const outside={scope:"extracurricular",scopeEvidence:"星星校外辅导班单元测验"};
    const auto=exams.reserve(manifest);
    assert.equal(auto.exam.scope,"curricular");
    exams.savePage(auto.pages[1].id,{...page,metadata:{scope:"extracurricular"}});
    assert.equal(exams.detail(auto.exam.id).exam.scope,"curricular");
    exams.savePage(auto.pages[1].id,{...page,metadata:outside});
    exams.savePage(auto.pages[0].id,{...page,metadata:{scope:"curricular"}});
    assert.equal(exams.reserve(manifest).exam.scope,"extracurricular");
    for(const [index,scope] of ["curricular","extracurricular"].entries()){
      const input={scope,pages:[{sha:String(index+3).repeat(64),bytes:40}]};
      const paper=exams.reserve(input);
      exams.savePage(paper.pages[0].id,{...page,metadata:scope==="curricular"?outside:{scope:"curricular"}});
      assert.equal(exams.reserve(input).exam.scope,scope);
      assert.throws(()=>exams.reserve({...input,scope:scope==="curricular"?"extracurricular":"curricular"}),/已经上传/);
    }
  }finally{f.close();}
});

test("homework classification preserves the original stage, skips duplicate attempts and keeps old wrong-only evidence out of rates",()=>{
  const f=setup();
  try{
    const {store}=f;
    const profile=studentProfile(f.reading)!;
    saveStudentProfile(f.reading,{...profile,semester:1},parent.id);
    const id=f.seed("英语","课内 U1"),db=store.db;
    const q=JSON.parse(String(db.prepare("SELECT payload FROM grading_mistakes WHERE id=?").get(id)!.payload));
    const day=store.today(),source={title:"课内 U1",subject:"英语",primaryPageId:"synthetic-page",date:day,taskIds:["task"]};
    const result={version:"grading-v2",scopeComplete:true,note:"",questions:[{...q,label:"单项选择 第1题"},{...q,id:"q2",label:"判断题 第2题",verdict:"correct"}]};
    for(const run of ["one","two"]){
      db.prepare("INSERT INTO grading_runs(id,date,primary_page_id,source,status,result,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(run,day,"synthetic-page",JSON.stringify(source),"done",JSON.stringify(result),day,day);
      db.prepare("INSERT INTO grading_occurrences VALUES(?,?,?)").run(id,run,q.id);
    }
    const http=new PracticeHTTP(store),slice=()=>http.mistakes("英语",undefined,0);
    assert.equal(slice().analysis.known,2);assert.equal(slice().analysis.wrongRate,50);
    assert.deepEqual(slice().items[0].tags?.stage,["4年级上学期"]);
    saveStudentProfile(f.reading,{...studentProfile(f.reading)!,grade:5},parent.id);
    db.prepare("UPDATE grading_runs SET result=? WHERE id='two'").run(JSON.stringify({...result,note:"仅更正说明"}));
    assert.deepEqual(slice().items[0].tags?.stage,["4年级上学期"]);
    assert.equal(db.prepare("SELECT count(*) n FROM analysis_grade_history").get()?.n,1);
    f.seed("英语","课外历史");assert.equal(slice().analysis.wrongRate,null);
  }finally{f.close();}
});

test("exam explanations use the selected photo, keep the verdict independent and scope learned checks to future papers",async t=>{
  const f=setup();
  try{
    const exams=f.store.exams;
    const meta={title:"模拟卷",subject:"数学",date:f.store.today(),unit:"",kind:null,scope:null,grade:null,semester:null,score:null,maximum:null};
    const paper=(sha:string,subject:string)=>exams.reserve({meta:{...meta,subject},pages:[{sha:sha.repeat(64),bytes:100}]});
    const first=paper("a","数学"),pageId=first.pages[0].id;
    const value={label:"三（2）",question:"模拟题",studentAnswer:"两种写法",teacherMark:"题号旁有红字",expectedAnswer:"",correction:"",verdict:"uncertain",confident:false,knowledgePoints:[],cause:"原因待确认",causeExplanation:""};
    exams.savePage(pageId,{coverage:"partial",note:"",questions:[value]});
    const question=()=>exams.detail(first.exam.id).questions[0];
    const q=question(),cmd={requestId:randomUUID(),questionId:q.id,revision:q.revision,note:"看看答案下边的勾。"};
    exams.explain(pageId,cmd,child.id);exams.explain(pageId,cmd,child.id);
    assert.throws(()=>exams.explain(pageId,{...cmd,requestId:randomUUID()},child.id),/正在看/);
    t.mock.method(exams as unknown as {aiImage:(id:string)=>unknown},"aiImage",async(id:string)=>({fileId:id,mimeType:"image/jpeg",base64:jpeg()}));
    const seen:string[][]=[];
    const ai:StructuredAI={async run(task,schema,raw,images){
      const input=raw as {questionId:string;familyNote:string;readingChecks:string[]};
      if(task==="explain_exam_reading"){
        assert.equal(input.familyNote,cmd.note);assert.equal(images?.[0].fileId,pageId);
        return schema.parse({questionId:q.id,located:true,reply:"红勾在这题作答下方。",evidence:"第2小题答案下方有勾。",check:"marks",change:{...value,verdict:"correct",teacherMark:"作答下方有勾"}});
      }
      assert.equal(task,"read_marked_exam");seen.push(input.readingChecks);
      assert.ok(!JSON.stringify(input).includes(cmd.note));
      return schema.parse({coverage:"partial",note:"",questions:[]});
    }};
    const worker=new PracticeWorker(f.store,()=>ai);await worker.tick();
    const feedback=question().feedback!;
    assert.equal(feedback.status,"done");assert.equal(question().verdict,"uncertain");
    assert.deepEqual(exams.readingChecks("数学"),[]);
    exams.learn(pageId,{id:feedback.id,enabled:true});
    const next=async(sha:string,subject:string)=>{const page=paper(sha,subject).pages[0];f.store.db.prepare("UPDATE exam_pages SET status='queued' WHERE id=?").run(page.id);await worker.tick();};
    await next("b","数学");await next("c","语文");
    exams.learn(pageId,{id:feedback.id,enabled:false});await next("d","数学");
    assert.deepEqual(seen,[["核对批注指向的题号和作答位置"],[],[]]);
    exams.review(pageId,{id:q.id,revision:1,value:{...value,...feedback.result!.change,confident:true}},parent.id);
    assert.equal(question().verdict,"correct");
    assert.throws(()=>exams.explain(pageId,{...cmd,requestId:randomUUID()},child.id),/已更新/);
  }finally{f.close();}
});

test("milestones keep partial distributions, protect revisions, and credit an achieved goal exactly once",()=>{
  const f=setup();
  try{
    const {exams,milestones}=f.store;
    const meta={title:"数学期中",kind:"期中考试",date:f.store.today(),subject:"数学",scope:"curricular",grade:4,semester:1,score:108,maximum:120,unit:""};
    const paper=exams.reserve({meta,pages:[{sha:"b".repeat(64),bytes:30}]}).exam.id;
    exams.reserve({meta:{...meta,title:"期末复习",kind:"随堂小测"},pages:[{sha:"c".repeat(64),bytes:30}]});
    const current=()=>milestones.snapshot().exams[0];
    assert.equal(milestones.snapshot().exams.length,1);
    const context={...current().context,classroom:{rank:4,total:36,average:91.5,bands:[{label:"100 分及以上",count:5}]}};
    milestones.saveContext(paper,{context,revision:0});milestones.saveContext(paper,{context,revision:0});
    assert.equal(current().context.year.rank,null);assert.equal(current().revision,1);
    assert.throws(()=>milestones.saveContext(paper,{revision:0,context:{...context,classroom:{...context.classroom,rank:2}}}),/已更新/);
    assert.throws(()=>milestones.saveContext(paper,{revision:1,context:{...context,classroom:{...context.classroom,total:3}}}));
    const goal={subject:"数学",kind:"期中考试",metric:"percent",target:90,points:5,celebration:"去公园野餐"},id=randomUUID(),balance=f.reading.balance();
    milestones.saveGoal({id,goal});milestones.saveGoal({id,goal});
    assert.equal(f.reading.balance(),balance);
    const confirm={action:"confirm",examId:paper};
    const missed=randomUUID();milestones.saveGoal({id:missed,goal:{...goal,target:90.01}});
    assert.throws(()=>milestones.settle(missed,confirm,parent.id),/不能确认/);
    milestones.settle(id,confirm,parent.id);milestones.settle(id,confirm,parent.id);
    assert.equal(f.reading.balance(),balance+5);assert.equal(f.reading.earnedSteps(f.store.today()),5);
    assert.equal(milestones.snapshot().goals.find(g=>g.id===id)?.actual,90);
    const rank=randomUUID();milestones.saveGoal({id:rank,goal:{...goal,metric:"yearRank",target:10,points:0}});
    assert.throws(()=>milestones.settle(rank,confirm,parent.id),/不能确认/);
    const better=randomUUID();milestones.saveGoal({id:better,goal:{...goal,metric:"classRank",target:5,points:0}});
    milestones.settle(better,confirm,parent.id);assert.equal(f.reading.balance(),balance+5);
    milestones.settle(rank,{action:"cancel"},parent.id);assert.equal(milestones.snapshot().goals.find(g=>g.id===rank)?.status,"cancelled");
  }finally{f.close();}
});
