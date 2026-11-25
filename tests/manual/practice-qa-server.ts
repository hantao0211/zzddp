// Synthetic family only. This server refuses every paid AI task and live state path.
import {join} from "node:path";
import {randomUUID,scryptSync} from "node:crypto";
import {Accounts} from "../../src/server/assistant/accounts";
import {AssistantStore} from "../../src/server/assistant/store";
import {createAssistantServer} from "../../src/server/assistant/server";
import {ReadingStore} from "../../src/server/reading/store";
import {ReadingHTTP} from "../../src/server/reading/http";
import {HomeworkStore} from "../../src/server/homework/store";
import {HomeworkConversation} from "../../src/server/homework/conversation";
import {ServerImages} from "../../src/server/homework/images";
import {HomeworkHTTP} from "../../src/server/homework/http";
import {PracticeStore} from "../../src/server/practice/store";
import {PracticeHTTP} from "../../src/server/practice/http";
import {PracticeWorker} from "../../src/server/practice/worker";
import type {StructuredAI} from "../../src/server/ai/provider";
const directory=process.env.PRACTICE_QA_DIRECTORY||"";if(!directory.endsWith("/xiaobu-practice-qa"))throw Error("Refuse non-QA state");
const accounts=new Accounts(directory),reading=new ReadingStore(join(directory,"reading")),homework=new HomeworkStore(join(directory,"learning"),Date.now,null,false,true),practice=new PracticeStore(homework,reading),salt="ab".repeat(16);
if(!(homework.db.prepare("SELECT count(*) AS n FROM grading_mistakes").get() as any).n)for(const subject of ["语文","数学","英语"])for(const title of ["课堂练习","课外拓展","未分类练习"]){const id=randomUUID(),q={id,kind:"objective",label:subject+title+"第1题",question:"模拟：1加1等于几？",studentAnswer:"3",expectedAnswer:"2",verdict:"wrong",confidence:"high",explanation:"加法计算。",knowledgePoints:["模拟知识点"],cause:"计算错误",causeExplanation:"核对计算。",nextStep:"再试一次。",evidence:[],sourcePartLabels:[],verification:"agreed"};homework.db.prepare("INSERT INTO grading_mistakes(id,first_date,last_date,subject,title,page_id,payload) VALUES(?,?,?,?,?,?,?)").run(id,reading.today(),reading.today(),subject,title,"synthetic-page",JSON.stringify(q));}
const day = reading.today();
const legacyPage = "synthetic-legacy-page";
const legacyTitle = "模拟往期练习";
if (!homework.db.prepare("SELECT 1 FROM days WHERE date=?").get(day)) {
  const task = { id: "synthetic-legacy-task", title: legacyTitle, subject: "语文", requirement: "做完两题",
    format: "written", coverage: "complete", memoEvidence: [], evidence: [{ fileId: legacyPage, page: 1, excerpt: "模拟" }], missing: [] };
  const report = { date: day, memoId: null, tasks: [task], uncertainties: [], unassigned: [], updatedAt: "" };
  homework.db.prepare("INSERT INTO days(date,report,status) VALUES(?,?,'processed')").run(day, JSON.stringify(report));
  const template = homework.db.prepare("SELECT payload FROM grading_mistakes WHERE subject='语文' LIMIT 1").get() as { payload: string };
  const seed = homework.db.prepare("INSERT INTO grading_mistakes(id,first_date,last_date,subject,title,page_id,payload) VALUES(?,?,?,?,?,?,?)");
  for (const number of [1, 2]) {
    const id = randomUUID();
    const question = { ...JSON.parse(template.payload), id, label: `模拟往期练习第${number}题` };
    seed.run(id, day, day, "语文", legacyTitle, legacyPage, JSON.stringify(question));
  }
}
const ai:StructuredAI={async run(task,schema,metadata:any){if(task==="explain_exam_reading")return schema.parse({questionId:metadata.questionId,located:true,reply:"红勾在答案下方，题号旁是另一处标记。",evidence:"第1题答案行下方有勾。",check:"marks",change:{question:metadata.original.question,studentAnswer:"A",teacherMark:"作答下方有勾",correction:"",verdict:"correct"}});if(task==="read_marked_exam")return schema.parse({coverage:"complete",note:"模拟老师已批试卷。",metadata:{title:"模拟英语期中考",subject:"英语",grade:4,kind:"考试"},questions:["wrong","correct","uncertain"].map((verdict,i)=>({label:"单选题 第"+(i+1)+"题",question:"模拟阅读理解，选出正确的近义词。",studentAnswer:"A",teacherMark:i===2?"":"模拟老师"+(i?"勾":"叉"),correction:i===0?"B":"",expectedAnswer:"",verdict,confident:i!==2,knowledgePoints:["近义词辨析"],cause:"原因待确认",causeExplanation:""}))});if(task==="generate_practice")return schema.parse({title:metadata.subject+"模拟15分钟练习",subject:metadata.subject,questions:[1,2,3].map(n=>({id:"q"+n,sourceMistakeIds:[metadata.mistakes[0].id],knowledgePoint:"模拟知识点",question:`模拟题${n}：${n}+0等于几？`+(n===1?" A. 1 B. 2 C. 3 你的答案：____":n===2?" （1） 写答案 （2） 写过程 作答区： （1） ____ （2） ____":""),answer:String(n),explanation:"加0不变。",estimatedMinutes:5}))});if(task==="verify_practice")return schema.parse({approved:true,checks:metadata.candidate.questions.map((q:any)=>({questionId:q.id,correct:true,reason:"独立计算核对。"}))});if(task==="grade_practice")return schema.parse({scopeComplete:true,note:"模拟批改：最后一题字迹待核对。",answers:metadata.questions.map((q:any,i:number)=>({questionId:q.id,studentAnswer:String(i===0?8:i+1),expectedAnswer:String(i+1),verdict:i===2?"uncertain":i===0?"wrong":"correct",confidence:i===2?"low":"high",explanation:i===2?"字迹需要家长核对。":"加0不变，核对原答案。",evidenceIds:[metadata.pages[0]]}))});if(task==="index_curriculum")return schema.parse({subject:metadata.subject,unit:"模拟第一单元",pages:metadata.pages.map((p:any)=>({page:p.page,text:"模拟所选原件：整数加法，先理解数位再计算。"})),knowledgePoints:["整数加法"],uncertainties:[]});throw Error("QA refuses unrelated task "+task);}};
const worker=new PracticeWorker(practice,()=>ai);worker.start();
const server=createAssistantServer({origin:"https://127.0.0.1:3443",accessHash:salt+":"+scryptSync("81746290",salt,32).toString("hex"),accounts,store:new AssistantStore(directory),reading:new ReadingHTTP(reading),learning:new HomeworkConversation(homework,new ServerImages(homework)),homework:new HomeworkHTTP(homework,undefined,new PracticeHTTP(practice)),ai:()=>ai});server.listen(3105,"127.0.0.1");for(const signal of["SIGTERM","SIGINT"] as const)process.on(signal,()=>{worker.stop();server.close(()=>process.exit(0));});
