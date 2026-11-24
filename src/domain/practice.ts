import {z} from "zod";
import type { HomeworkScopeSource } from "./homework-scope";
export const PracticeSubjectSchema=z.enum(["语文","数学","英语"]);
export type PracticeSubject=z.infer<typeof PracticeSubjectSchema>;
export const LearningScopeSchema=z.enum(["curricular","extracurricular","unknown"]);
export type LearningScope=z.infer<typeof LearningScopeSchema>;
export const scopeLabels:Record<LearningScope,string>={curricular:"课内",extracurricular:"课外",unknown:"待分类"};
/** Absence of a 课外 label is not evidence that a task is curricular. */
export function inferLearningScope(text: string, fallback: LearningScope = "unknown"): LearningScope {
  if (/课内外|校内外/.test(text)) return "unknown";
  const extra = /课外|校外|培训班|兴趣班|extracurricular/i.test(text);
  const inside = /课内|校内|课堂|学校练习/i.test(text);
  if (extra && inside) return "unknown";
  return extra ? "extracurricular" : inside ? "curricular" : fallback;
}
export type RetestStats={attempts:number;correct:number;wrong:number;blank:number;uncertain:number;rounds:number;passRate:number|null;lastDate:string|null;lastVerdict:"correct"|"wrong"|"blank"|"uncertain"|null;passedRounds:number;consecutivePasses:number};
export const emptyRetestStats=():RetestStats=>({attempts:0,correct:0,wrong:0,blank:0,uncertain:0,rounds:0,passRate:null,lastDate:null,lastVerdict:null,passedRounds:0,consecutivePasses:0});
export function practiceWeight(candidate:{occurrences:number;lastDate:string;stats:RetestStats},today:string){const s=candidate.stats,gap=Math.max(0,(Date.parse(today)-Date.parse(s.lastDate||candidate.lastDate))/86400000),difficulty=1-(s.correct+1)/(s.attempts+2);return Math.max(.2,1+Math.min(5,candidate.occurrences)*.6+difficulty*3+Math.min(3,gap/7)-Math.min(2,s.consecutivePasses)*.7);}
const QuestionSchema=z.object({id:z.string().min(1).max(60),sourceMistakeIds:z.array(z.string().min(1).max(100)).min(1).max(3),knowledgePoint:z.string().min(1).max(200),question:z.string().min(1).max(3000),answer:z.string().min(1).max(1500),explanation:z.string().min(1).max(2000),estimatedMinutes:z.number().int().min(1).max(8)}).strict();
export const PracticePaperSchema=z.object({title:z.string().min(1).max(120),subject:PracticeSubjectSchema,questions:z.array(QuestionSchema).min(3).max(8)}).strict().refine(v=>{const minutes=v.questions.reduce((n,q)=>n+q.estimatedMinutes,0);return minutes>=12&&minutes<=18;},"练习需接近15分钟");
export type PracticePaper=z.infer<typeof PracticePaperSchema>;
export const PracticeAnswerSchema=z.object({questionId:z.string().min(1).max(60),studentAnswer:z.string().max(2500),expectedAnswer:z.string().max(1500),verdict:z.enum(["correct","wrong","blank","uncertain"]),confidence:z.enum(["high","medium","low"]),explanation:z.string().max(1400),evidenceIds:z.array(z.string().max(100)).max(4)}).strict();
export const PracticeGradeSchema=z.object({scopeComplete:z.boolean(),note:z.string().max(1500),answers:z.array(PracticeAnswerSchema).max(8)}).strict();
export type PracticeAnswer=z.infer<typeof PracticeAnswerSchema>;
export type PracticeGrade=z.infer<typeof PracticeGradeSchema>;
export type PracticeStatus="queued"|"generating"|"ready"|"grading"|"graded"|"failed";
export type PracticeView={id:string;date:string;subject:PracticeSubject;scope:"curricular";status:PracticeStatus;stage:string;note:string;attempts:number;paper:Omit<PracticePaper,"questions">&{questions:Omit<PracticePaper["questions"][number],"answer"|"explanation">[]}|null;result:PracticeGrade|null;photos:{id:string;name:string}[];rewarded:number;rewardEligible:boolean;retryAllowed:boolean;profileLabel:string;sources:{id:string;title:string;question:string;knowledgePoints:string[];photoUrl:string|null}[]};
export type PracticeCandidate={id:string;subject:PracticeSubject;title:string;question:string;answer:string;knowledgePoints:string[];occurrences:number;lastDate:string;scope:LearningScope;stats:RetestStats;weight:number;origin:"homework"|"practice";scopeSource?:HomeworkScopeSource};
export type CurriculumMaterial={id:string;subject:PracticeSubject;scope:LearningScope;kind:"textbook"|"school-exercise"|"other";grade:number;semester:1|2;title:string;version:string;unit:string;content:string;files:{id:string;name:string;mime:string;bytes:number}[];createdAt:string;revision:string};
export const CurriculumInputSchema=z.object({id:z.string().uuid(),subject:PracticeSubjectSchema,scope:LearningScopeSchema,kind:z.enum(["textbook","school-exercise","other"]),grade:z.number().int().min(1).max(6),semester:z.union([z.literal(1),z.literal(2)]),title:z.string().trim().min(1).max(150),version:z.string().trim().max(100).default(""),unit:z.string().trim().max(150).default(""),content:z.string().trim().max(16000).default(""),revision:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();

export const CurriculumIndexSchema=z.object({subject:PracticeSubjectSchema.nullable(),unit:z.string().max(150),pages:z.array(z.object({page:z.number().int().min(1).max(2000),text:z.string().max(12000)}).strict()).min(1).max(8),knowledgePoints:z.array(z.string().max(150)).max(30),uncertainties:z.array(z.string().max(300)).max(20)}).strict();
