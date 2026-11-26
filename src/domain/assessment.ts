import { z } from "zod";
import { DaySchema } from "./calendar";
import { CauseSchema } from "./grading";
import { PracticeSubjectSchema } from "./practice";

import { milestoneKinds } from "./exam-milestones";

export const examKinds = ["随堂小测", "单元测验", "考试", ...milestoneKinds] as const;
const examFields = {
  title: z.string().trim().min(1).max(120), kind: z.enum(examKinds), date: DaySchema,
  subject: PracticeSubjectSchema, scope: z.enum(["curricular", "extracurricular"]),
  grade: z.number().int().min(1).max(6), semester: z.union([z.literal(1), z.literal(2)]),
  score: z.number().min(0).max(1000), maximum: z.number().positive().max(1000),
  unit: z.string().trim().max(100),
};
export const examMeta = z.object({
  title: examFields.title.nullable(), kind: examFields.kind.nullable(), date: DaySchema.nullable(),
  subject: examFields.subject.nullable(), scope: examFields.scope.nullable(), grade: examFields.grade.nullable(),
  semester: examFields.semester.nullable(), score: examFields.score.nullable(), maximum: examFields.maximum.nullable(),
  unit: examFields.unit.default(""),
}).strict().refine(v => v.score === null || v.maximum === null || v.score <= v.maximum);
export type ExamMeta = z.infer<typeof examMeta>;
export const emptyExam: ExamMeta = {title:null,kind:null,date:null,subject:null,scope:null,grade:null,semester:null,score:null,maximum:null,unit:""};
export function readExamHints(raw: unknown, today: string): Partial<ExamMeta> {
  if (!raw || typeof raw !== "object") return {};
  const hints = Object.entries(examFields).flatMap(([key, schema]) => {
    const parsed = schema.safeParse(Reflect.get(raw, key));
    if (key === "scope" && parsed.success && parsed.data === "extracurricular") {
      const evidence = Reflect.get(raw, "scopeEvidence");
      if (typeof evidence !== "string" || !evidence.trim()) return [];
    }
    return parsed.success && parsed.data !== "" && !(key === "date" && String(parsed.data) > today)
      ? [[key, parsed.data]] : [];
  });
  return Object.fromEntries(hints);
}
export const examManifest = z.object({
  scope: examFields.scope.optional(), meta: examMeta.optional(), pages: z.array(z.object({sha: z.string().regex(/^[0-9a-f]{64}$/), bytes: z.number().int().min(4).max(20*1024*1024)})).min(1).max(12),
}).refine(v => !v.meta || v.scope === undefined, "试卷归属不可重复填写").refine(v => new Set(v.pages.map(p => p.sha)).size === v.pages.length, "同一页照片重复");
export const observation = z.object({
  label: z.string().trim().min(1).max(180), question: z.string().trim().min(1).max(3500),
  studentAnswer: z.string().max(1200), teacherMark: z.string().max(500), correction: z.string().max(1200),
  expectedAnswer: z.string().max(1200), verdict: z.enum(["correct","wrong","uncertain","blank"]),
  confident: z.boolean(), knowledgePoints: z.array(z.string().min(1).max(100)).max(8),
  cause: CauseSchema, causeExplanation: z.string().max(600),
});
export const markedPage = z.object({ metadata: z.unknown().optional(), coverage: z.enum(["complete","partial"]), note: z.string().max(500), questions: z.array(observation).max(80) });
export type Observation = z.infer<typeof observation>;
export type ExamRecord = ExamMeta & {id:string; pages:number; done:number; status:string};
export type ExamPage = {id:string; number:number; status:string; note:string; coverage:string};
export type ExamQuestion = Observation & {id:string; pageId:string; revision:number; feedback?:ExamFeedback};
export type ExamDetail = {exam:ExamRecord; pages:ExamPage[]; questions:ExamQuestion[];savedChecks?:{id:string;pageId:string;subject:string;check:keyof typeof examReadingChecks}[]};
export const dimensionNames = {stage:"年级学期",source:"来源",form:"作答形式",scene:"任务场景",knowledge:"知识点",skill:"能力",cause:"可能错因",unit:"单元",state:"复测状态",difficulty:"难度"} as const;
export type Dimension = keyof typeof dimensionNames;
export type Tags = Record<Dimension,string[]>;
export const dimensions = Object.keys(dimensionNames) as Dimension[];
export type Analysis = {
  wrong:number; sources:number; known:number; partial:number; unknown:number; wrongRate:number|null;
  retestCorrect:number; retestKnown:number;
  trends:{period:string;wrong:number;known:number;partial:number;passes:number;retests:number}[];
  focus:{name:string;wrong:number;sources:number;latest:string;retests:number;passed:number}[];
};
export type TagRevision = {revision:number; tags:Partial<Tags>};
export const formNames = ["单选题","多选题","选择题","判断题","填空题","计算题","连线题","改错题","简答题","写作题","待分类"] as const;
export function classifyQuestion(label:string, question:string, points:string[], cause:string, stage:string, source:string, unit:string):Tags {
  const text=(label+" "+question).normalize("NFKC");
  const first=(rules:[RegExp,string][],fallback="待分类")=>rules.find(([pattern])=>pattern.test(text))?.[1]??fallback;
  const form=first([[/多选|多项选择/,"多选题"],[/单选|单项选择|只有一个.*正确/,"单选题"],[/选择题|选出|\bA[.、].*\bB[.、]/s,"选择题"],[/判断|对错|正误/,"判断题"],[/填空|填入|填上|写单词|_{2,}/,"填空题"],[/列式计算|竖式|计算题|脱式计算/,"计算题"],[/连线|配对/,"连线题"],[/改错|改病句/,"改错题"],[/简答|回答问题/,"简答题"],[/写作|作文|习作/,"写作题"]]);
  const scene=first([[/阅读理解|阅读短文|阅读下文/,"阅读理解"],[/完形填空/,"完形填空"],[/音标/,"看音标写词"],[/听写|默写|家默/,"听写默写"],[/应用题|解决问题/,"应用题"],[/实验探究/,"实验探究"]]);
  const skill=first([[/推理|推断|说明理由/,"推理"],[/写作|作文|表达|造句/,"表达"],[/运用|应用题|解决问题/,"运用"],[/理解|概括|解释/,"理解"],[/识别|辨认|音标/,"识别"]]);
  const aliases:Record<string,string>={"主谓一致性":"主谓一致","主语谓语一致":"主谓一致","拼读音标":"音标拼读","一般现在时态":"一般现在时","小数的加减法":"小数加减法","分数的加减法":"分数加减法","辨析近义词":"近义词辨析"};
  const knowledge=[...new Set(points.map(v=>v.normalize("NFKC").trim()).filter(Boolean).map(v=>aliases[v]??v))];
  if(!knowledge.length){
    const explicit=first([[/一般现在时/,"一般现在时"],[/音标/,"音标拼读"],[/主谓一致/,"主谓一致"],[/小数加减/,"小数加减法"],[/分数加减/,"分数加减法"],[/周长/,"周长"],[/近义词/,"近义词辨析"],[/修辞手法/,"修辞手法"],[/概括.*大意/,"概括大意"]],"");
    if(explicit)knowledge.push(explicit);
  }
  return {form:[form],scene:[scene],skill:[skill],knowledge:knowledge.length?knowledge:["待分类"],cause:[cause||"原因待确认"],stage:[stage||"待确认"],source:[source],unit:[unit||"待确认"],state:["暂无复测"],difficulty:["待确认"]};
}

export const examReadingChecks = {
  marks: "核对批注指向的题号和作答位置",
  answers: "区分孩子的初答、订正和老师的笔迹",
  layout: "按题号及版面核对题干和对应作答",
} as const;
const answerMark = z.object({
  position:z.string().trim().min(1).max(80),
  handwriting:z.string().trim().max(160),
  mark:z.enum(["tick","cross","unclear","unmarked","blank"]),
});
export const examReread = z.object({
  answerMarks:z.array(answerMark).max(80).optional(),
  questionId: z.string(), located: z.boolean(), reply: z.string().trim().min(1).max(200),
  evidence: z.string().trim().max(200), check: z.enum(["marks","answers","layout"]).nullable(),
  change: observation.pick({question:true,studentAnswer:true,teacherMark:true,correction:true,verdict:true}).nullable(),
});
export type ExamFeedback = {
  id:string; revision:number; note:string; status:"queued"|"running"|"done"|"failed";
  result:z.infer<typeof examReread>|null; learned:boolean;
};

type RereadResult = z.infer<typeof examReread>;
export function printedBlankCount(question:string){
  return question.normalize("NFKC").match(/\(\s*\)|_{2,}/g)?.length??0;
}

export function checkRereadEvidence(result:RereadResult,originalQuestion:string):RereadResult {
  const {change,answerMarks}=result;
  if(!result.located||!result.evidence)return {...result,check:null,change:null};
  if(!change&&!answerMarks?.length)return result;

  const expected=Math.max(printedBlankCount(originalQuestion),printedBlankCount(change?.question??""));
  if(!answerMarks && expected<2)return result; // Historical single-answer records.
  if(!answerMarks?.length || answerMarks.length<expected ||
    new Set(answerMarks.map(a=>a.position)).size!==answerMarks.length){
    return {...result,reply:"这次回复缺少逐处核对的记录，原判保留。",evidence:"",change:null,check:null};
  }
  const labels={tick:"勾",cross:"叉",unclear:"标记不清",unmarked:"未见批注",blank:"老师标为漏答"};
  const evidence=answerMarks.map(a=>a.position+"："+labels[a.mark]).join("；");
  const handwriting=answerMarks.map(a=>a.position+"："+(a.handwriting||"原答看不清")).join("；");
  const reading=answerMarks.map(a=>a.position+"："+(a.handwriting||"原答看不清")+"（"+labels[a.mark]+"）").join("；").slice(0,200);
  if(!change)return answerMarks.length>1?{...result,evidence:evidence.slice(0,200),reply:reading}:result;
  const verdict=answerMarks.some(a=>a.mark==="cross")?"wrong":
    answerMarks.every(a=>a.mark==="blank")?"blank":
    answerMarks.some(a=>a.mark==="blank")?"wrong":
    answerMarks.every(a=>a.mark==="tick")?"correct":"uncertain";
  return {...result,evidence:evidence.slice(0,200),
    reply:(answerMarks.length>1||verdict!==change.verdict)?reading:result.reply,
    change:{...change,studentAnswer:handwriting.slice(0,1200),teacherMark:evidence.slice(0,500),verdict}};
}
