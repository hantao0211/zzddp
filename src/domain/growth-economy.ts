import { z } from "zod";
import { DaySchema } from "./calendar";

export const DEFAULT_OFFER_DAYS = 45;
export const OfferFields = {
  offerDays: z.number().int().min(1).max(366).default(DEFAULT_OFFER_DAYS),
  useDays: z.number().int().min(1).max(366).default(45),
  kind: z.enum(["fixed", "shopping"]).default("fixed"),
  valueCents: z.number().int().min(1).max(10000000).nullable().default(null),
  rateCents: z.number().int().min(1).max(100000).default(200),
  monthlyBudgetCents: z.number().int().min(1).max(10000000).nullable().default(null),
  monthLimit: z.number().int().min(1).max(100).nullable().default(null),
  yearLimit: z.number().int().min(1).max(1000).nullable().default(null),
};
export const OfferPolicySchema = z.object(OfferFields).strict();
export type OfferPolicy = z.infer<typeof OfferPolicySchema>;
export type RewardUsage = { monthCount:number; yearCount:number; monthCents:number; groupCents:number; remainingCents:number|null };
export type RewardContract = OfferPolicy & { title:string; description:string; cost:number; expiresOn:string|null; startsOn:string; version:number; active:boolean; changeReason?:string; changedAt?:string };
export const RedemptionInputSchema = z.object({id:z.string().uuid(),rewardId:z.string().uuid(),revision:z.string().regex(/^[a-f0-9]{64}$/).optional(),amountCents:z.number().int().min(1).max(10000000).optional()}).strict();
export type RedemptionInput = z.infer<typeof RedemptionInputSchema>;
export const addDays = (day:string,days:number) => new Date(Date.parse(day+"T00:00:00Z")+days*86400000).toISOString().slice(0,10);
export function weekOf(day:string){const date=new Date(day+"T00:00:00Z");return addDays(day,-((date.getUTCDay()+6)%7));}
export const money = (cents:number) => (cents/100).toLocaleString("zh-CN",{maximumFractionDigits:2});
export function shoppingCost(amount:number,previous:number,rate:number){return Math.ceil((previous+amount)/rate)-Math.ceil(previous/rate);}

export const ACTIVITY_KEYS = ["english-reading","housework","badminton","english-class"] as const;
export type ActivityKey = typeof ACTIVITY_KEYS[number];
export const ActivityRuleSchema=z.object({key:z.enum(ACTIVITY_KEYS),title:z.string().trim().min(1).max(60),points:z.number().int().min(0).max(100),enabled:z.boolean()}).strict();
export type ActivityRule=z.infer<typeof ActivityRuleSchema>;
export const DEFAULT_ACTIVITY_RULES:ActivityRule[]=[
 {key:"english-reading",title:"英语课外阅读",points:1,enabled:true},
 {key:"housework",title:"家庭小帮手",points:1,enabled:true},
 {key:"badminton",title:"羽毛球课",points:5,enabled:true},
 {key:"english-class",title:"英语线上课",points:5,enabled:true},
];
export const ActivityRulesSchema=z.object({rules:z.array(ActivityRuleSchema).length(4)}).strict().refine(v=>new Set(v.rules.map(r=>r.key)).size===4,"请保留四种活动且不要重复");
export const ActivityClaimSchema=z.object({id:z.string().uuid(),key:z.enum(ACTIVITY_KEYS),date:DaySchema,note:z.string().trim().max(300).default("")}).strict();
export type ActivityClaim={id:string;key:ActivityKey;title:string;points:number;date:string;period:string;note:string;status:"pending"|"approved"|"rejected";parentNote:string;createdAt:string};
export type ActivityState={rules:ActivityRule[];claims:ActivityClaim[];startOn:string};
export const weeklyActivity=(key:ActivityKey)=>key==="badminton"||key==="english-class";
export const activityPeriod=(key:ActivityKey,date:string)=>weeklyActivity(key)?weekOf(date):date;
