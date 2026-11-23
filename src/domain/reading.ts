import {RewardIconSchema} from "./reward-icons";
import {z} from "zod";
import {OfferFields,type RewardUsage,type ActivityState} from "./growth-economy";
import {DaySchema} from "./calendar";
import type {HomeworkRewardRules} from "./homework-reward";
const text=(n:number)=>z.string().trim().max(n);
export const BookInputSchema=z.object({title:text(150).min(1),author:text(150).default(""),isbn:text(20).default(""),publisher:text(150).default(""),totalPages:z.number().int().min(1).max(20000).nullable().default(null),catalogId:text(80).nullable().default(null)}).strict();
export type BookInput=z.infer<typeof BookInputSchema>;
export const BookEditSchema=BookInputSchema.omit({catalogId:true}).extend({revision:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const ReadingLogSchema=z.object({id:z.string().uuid(),version:z.number().int().min(0),bookId:z.string().uuid(),date:DaySchema,startPage:z.number().int().min(1).max(20000),endPage:z.number().int().min(1).max(20000),minutes:z.number().int().min(1).max(720),summary:text(3000).min(2),chapter:text(200).default(""),reflection:text(2000).default(""),excerpt:text(12000).default(""),image:z.string().max(2800000).optional(),keepImage:z.boolean().default(true),separateSession:z.boolean().optional()}).strict().refine(v=>v.endPage>=v.startPage,{message:"结束页不能小于开始页"});
export type ReadingLogInput=z.infer<typeof ReadingLogSchema>;
export const ReadingRulesSchema=z.object({dailyPoints:z.number().int().min(0).max(100),backfillCounts:z.boolean(),milestones:z.array(z.object({days:z.number().int().min(2).max(365),points:z.number().int().min(1).max(1000)}).strict()).max(8)}).strict().refine(v=>new Set(v.milestones.map(m=>m.days)).size===v.milestones.length,{message:"连续天数不能重复"});
export type ReadingRules=z.infer<typeof ReadingRulesSchema>;
export const DEFAULT_READING_RULES:ReadingRules={dailyPoints:2,backfillCounts:false,milestones:[{days:3,points:3},{days:7,points:10},{days:14,points:20},{days:30,points:50}]};
export const ReadingReviewSchema=z.object({summaryFeedback:text(900).min(1),strengths:z.array(text(200).min(1)).max(3),nextStep:text(300),followUpQuestion:text(200),expression:z.enum(["clear","developing"]),comparison:z.enum(["consistent","possible_mismatch","insufficient_evidence"]),comparisonReason:text(700),evidenceQuote:text(500),evidenceReadable:z.boolean()}).strict();
export type ReadingReview=z.infer<typeof ReadingReviewSchema>&{basis:"provided_excerpt"|"provided_image"|"none";timingNote:string};
export type ReadingBook=BookInput&{id:string;revision:string;finished:boolean;description:string;sourceUrl:string|null;createdAt:string;minutes:number;uniquePages:number;logCount:number;lastReadPage:number|null};
export type ReadingLog={id:string;version:number;bookId:string;date:string;startPage:number;endPage:number;minutes:number;summary:string;chapter:string;reflection:string;excerpt:string;imageId:string|null;actorId:string;backfilled:boolean;createdAt:string;updatedAt:string;reviewStatus:"queued"|"running"|"done"|"failed";review:ReadingReview|null;canEdit:boolean};
export const RewardInputSchema=z.object({title:text(80).min(1),description:text(500).default(""),cost:z.number().int().min(1).max(100000),icon:RewardIconSchema.optional(),active:z.boolean().default(true),expiresOn:DaySchema.nullable().default(null),...OfferFields,revision:z.string().regex(/^[a-f0-9]{64}$/).optional(),changeReason:text(500).min(1).optional(),requestId:z.string().uuid().optional()}).strict();
export type Reward=Omit<z.infer<typeof RewardInputSchema>,"revision"|"requestId"|"changeReason">&{id:string;revision:string;version:number;startsOn:string;legacy:boolean;usage:RewardUsage;changeReason?:string;changedAt?:string};
export const WishInputSchema=z.object({id:z.string().uuid(),title:text(80).min(1),description:text(500).default("")}).strict();
export const WishDecisionSchema=z.discriminatedUnion("status",[
 z.object({status:z.literal("approved"),title:text(80).min(1),description:text(500).default(""),cost:z.number().int().min(1).max(100000),expiresOn:DaySchema.nullable().default(null),...OfferFields,note:text(300).default("")}).strict(),
 z.object({status:z.literal("declined"),note:text(300).min(1)}).strict()
]);
export type Wish={id:string;title:string;description:string;actorId:string;status:"pending"|"approved"|"declined"|"withdrawn";rewardId:string|null;note:string;createdAt:string;updatedAt:string;canWithdraw:boolean};
export type Redemption={id:string;rewardTitle:string;cost:number;status:"pending"|"approved"|"fulfilled"|"rejected"|"expired";createdAt:string;updatedAt:string;description?:string;version?:number;kind?:"fixed"|"shopping";amountCents?:number;valueCents?:number|null;useDays?:number;useUntil?:string|null;refundedPoints?:number};
export type ReadingState={studentProfile?:import("./student-profile").StudentProfileView|null;activities?:ActivityState;homeworkRewardRules?:HomeworkRewardRules;today:string;viewer:{id:string;role:string;name:string;avatar?:import("./avatars").AvatarId;legacy?:boolean};books:ReadingBook[];logs:ReadingLog[];rules:ReadingRules;stats:{days:number;minutes:number;pages:number;currentStreak:number;bestStreak:number;booksFinished:number};growth:{balance:number;earned:number;ledger:{id:string;date:string;points:number;label:string;kind:string}[]};rewards:Reward[];wishes:Wish[];redemptions:Redemption[];calendar:{date:string;backfilled:boolean;minutes:number}[];reviewBudget:{used:number;limit:number};hasMore:boolean};
export type CatalogBook={id:string;title:string;author:string;isbn:string;publisher:string;totalPages:number|null;description:string;sourceUrl:string};
export const previousDay=(day:string)=>new Date(Date.parse(day+"T00:00:00Z")-86400000).toISOString().slice(0,10);
export function streaks(dates:string[],today:string){const ordered=[...new Set(dates)].filter(d=>d<=today).sort();let run=0,best=0,previous="";for(const date of ordered){run=previous===previousDay(date)?run+1:1;best=Math.max(best,run);previous=date;}return{currentStreak:previous===today||previous===previousDay(today)?run:0,bestStreak:best};}
export function uniquePages(ranges:{startPage:number;endPage:number}[]){let total=0,end=0;for(const r of [...ranges].sort((a,b)=>a.startPage-b.startPage)){total+=Math.max(0,r.endPage-Math.max(end,r.startPage-1));end=Math.max(end,r.endPage);}return total;}

/** A date-only deadline includes that whole Shanghai day. Existing requests keep their status. */
export function rewardExpired(reward:Pick<Reward,"expiresOn">,today:string){return !!reward.expiresOn&&reward.expiresOn<today;}
/** Continue from the last reading session, rather than the count of distinct pages read. */
export function nextReadingPages(book?:Pick<ReadingBook,"lastReadPage"|"totalPages">){
 const page=Math.min(book?.totalPages||20000,(book?.lastReadPage||0)+1);
 return {startPage:page,endPage:page};
}
