import { z } from "zod";
import { PracticeSubjectSchema } from "./practice";
import type { ExamMeta } from "./assessment";

export const milestoneKinds = ["期中考试","期末考试","模拟考试","其他重要考试"] as const;
export type MilestoneKind = typeof milestoneKinds[number];
export function isMilestone(kind: string | null): kind is MilestoneKind {
  return milestoneKinds.some(k => k === kind);
}
const count = z.number().int().min(1).max(100000);
const band = z.object({label:z.string().trim().min(1).max(30),count:z.number().int().min(0).max(100000)}).strict();
export const cohortSchema = z.object({
  rank:count.nullable(), total:count.nullable(), average:z.number().min(0).max(1000).nullable(),
  bands:z.array(band).max(20),
}).strict().superRefine((c,ctx)=>{
  if(c.total!==null && ((c.rank??0)>c.total || c.bands.reduce((sum,b)=>sum+b.count,0)>c.total))
    ctx.addIssue({code:"custom",message:"名次和分数段人数不能超过参考人数。"});
  if(new Set(c.bands.map(b=>b.label)).size!==c.bands.length)
    ctx.addIssue({code:"custom",message:"同一个分数段只填写一次。"});
});
export const contextSchema=z.object({classroom:cohortSchema,year:cohortSchema}).strict();
export type ExamContext=z.infer<typeof contextSchema>;
export type Cohort=z.infer<typeof cohortSchema>;
const emptyCohort:Cohort={rank:null,total:null,average:null,bands:[]};
export const emptyContext:ExamContext={classroom:emptyCohort,year:emptyCohort};
export const metrics={percent:"得分率",classRank:"班级名次",yearRank:"年级名次"} as const;
export const goalSchema=z.object({
  subject:PracticeSubjectSchema,kind:z.enum(milestoneKinds),metric:z.enum(["percent","classRank","yearRank"]),
  target:z.number().positive().max(100000),points:z.number().int().min(0).max(1000),
  celebration:z.string().trim().max(120),
}).strict().refine(g=>g.metric==="percent"?g.target<=100:Number.isInteger(g.target));
export type GoalSpec=z.infer<typeof goalSchema>;
export type ExamNode=ExamMeta & {id:string;kind:MilestoneKind;revision:number;context:ExamContext;wrong:number};
export type MilestoneGoal=GoalSpec & {id:string;created:string;status:"active"|"earned"|"cancelled";earnedExam:string|null;actual:number|null};
export type MilestoneData={exams:ExamNode[];goals:MilestoneGoal[]};
export function percent(e:Pick<ExamMeta,"score"|"maximum">){
  return e.score!==null && e.maximum!==null && e.maximum>0 ? e.score/e.maximum*100 : null;
}
export function goalResult(goal:MilestoneGoal,exam:ExamNode){
  if(goal.status!=="active"||goal.subject!==exam.subject||goal.kind!==exam.kind||!exam.date||exam.date<goal.created)return null;
  const value=goal.metric==="percent"?percent(exam):exam.context[goal.metric==="classRank"?"classroom":"year"].rank;
  if(value===null)return null;
  return {value,reached:goal.metric==="percent"?exam.score!*100>=goal.target*exam.maximum!:value<=goal.target};
}
