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
const ActivityKeySchema = z.union([z.enum(ACTIVITY_KEYS), z.string().uuid()]);
export type ActivityKey = z.infer<typeof ActivityKeySchema>;
export const activityIconLabels = {
  book: "阅读", home: "家务", sport: "运动", screen: "网课",
  pencil: "书写", palette: "绘画", music: "音乐", sparkles: "星光",
} as const;
export type ActivityIconId = keyof typeof activityIconLabels;
const ActivityIconSchema = z.enum(Object.keys(activityIconLabels) as ActivityIconId[]);
export const ActivityRuleSchema=z.object({key:ActivityKeySchema,icon:ActivityIconSchema.optional(),title:z.string().trim().min(1).max(60),points:z.number().int().min(0).max(100),enabled:z.boolean(),frequency:z.enum(["daily","weekly"]).optional(),description:z.string().trim().max(100).optional()}).strict().refine(r=>r.key!=="housework"||r.frequency!=="weekly","家务每天合计一次");
export type ActivityRule=z.infer<typeof ActivityRuleSchema>;
export const DEFAULT_ACTIVITY_RULES:ActivityRule[]=[
 {key:"english-reading",title:"英语课外阅读",points:1,enabled:true},
 {key:"housework",title:"家庭小帮手",points:1,enabled:true},
 {key:"badminton",title:"羽毛球课",points:5,enabled:true},
 {key:"english-class",title:"英语线上课",points:5,enabled:true},
];
export const ActivityRulesSchema=z.object({rules:z.array(ActivityRuleSchema)}).strict().refine(v=>new Set(v.rules.map(r=>r.key)).size===v.rules.length,"活动编号不能重复");
export const ActivityClaimSchema=z.object({id:z.string().uuid(),key:ActivityKeySchema,date:DaySchema,note:z.string().trim().max(300).default("")}).strict();
export type ActivityClaim={id:string;key:ActivityKey;title:string;points:number;date:string;period:string;note:string;status:"pending"|"approved"|"rejected";parentNote:string;createdAt:string};
export type ActivityState={rules:ActivityRule[];claims:ActivityClaim[];startOn:string};
export const weeklyActivity=(rule:ActivityRule)=>rule.frequency ? rule.frequency==="weekly" : rule.key==="badminton"||rule.key==="english-class";
export const activityPeriod=(rule:ActivityRule,date:string)=>weeklyActivity(rule)?weekOf(date):date;
export const ActivityChangeSchema=z.object({before:ActivityRuleSchema.nullable(),after:ActivityRuleSchema.nullable()}).strict()
 .refine(v=>!!(v.before||v.after)&&(!v.before||!v.after||v.before.key===v.after.key),"请选择一项活动");
