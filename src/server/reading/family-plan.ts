import type {ReadingStore} from "./store";
import {RewardInputSchema} from "../../domain/reading";
import {DEFAULT_ACTIVITY_RULES} from "../../domain/growth-economy";
/** Explicit setup only: never run implicitly on a database migration or a state read. */
export function installFamilyPlan(store:ReadingStore,actor:string){return store.transaction(()=>{
 const previous=store.db.prepare("SELECT value FROM settings WHERE key='family_plan_v1'").get() as {value:string}|undefined;
 if(previous)return{...JSON.parse(previous.value),alreadyInstalled:true};
 const offers=[
 {title:"一起看电影",description:"一张电影票，参考票价50元；一起商量电影和时间。每月最多一次，每年最多五次。",cost:10,valueCents:5000,monthLimit:1,yearLimit:5},
 {title:"一起吃大餐",description:"想兑换时和家长商量餐厅与时间，不要求每月兑换。",cost:30},
 {title:"迪士尼购物卡",description:"迪士尼购物，单次最高350元，每月一次。此额度独立于日常购物额度。",cost:30,valueCents:35000,monthLimit:1},
 {title:"日常购物卡",description:"每个小脚步对应2元，按实际购物金额扣除；每月累计最多100元。同一期同月按累计金额取整，分次购物不多扣。",cost:1,kind:"shopping" as const,rateCents:200,monthlyBudgetCents:10000}
 ];
 const ids=offers.map(v=>store.shop.write(RewardInputSchema.parse({...v,offerDays:45,useDays:45}),actor).id);
 const upsert=(key:string,value:unknown)=>store.db.prepare("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key,JSON.stringify(value));
 upsert("rules",{...store.rules(),dailyPoints:1});upsert("homework_reward_rules",{dailyPoints:1});store.db.prepare("INSERT OR IGNORE INTO settings VALUES('activity_rules',?)").run(JSON.stringify({rules:DEFAULT_ACTIVITY_RULES}));
 store.db.prepare("INSERT OR IGNORE INTO settings VALUES('activity_start',?)").run(store.today());
 const result={installedOn:store.today(),rewardIds:ids};upsert("family_plan_v1",result);store.audit(actor,"install-authorized-family-plan","family-plan-v1");return{...result,alreadyInstalled:false};
});}
