import {defaultRewardIcon,RewardIconInputSchema} from "../../domain/reward-icons";
import { createHash,randomUUID } from "node:crypto";
import type { ReadingStore } from "./store";
import { RewardInputSchema,type Reward,type Redemption } from "../../domain/reading";
import { OfferPolicySchema,DEFAULT_OFFER_DAYS,addDays,shoppingCost,type RewardContract,type RedemptionInput,type RewardUsage } from "../../domain/growth-economy";
import {isParent,type Viewer} from "../../domain/accounts";
import {z} from "zod";
import { HomeworkError } from "../homework/store";
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
type BaseReward={id:string;title:string;description:string;cost:number;active:number;expires_on:string|null};
type Version={version:number;data:string;revision:string;request_hash:string};
type ContractRow={redemption_id:string;reward_id:string;version:number;data:string;amount_cents:number;period:string;approved_on:string|null;use_until:string|null;refunded_points:number|null};
type RedemptionRow={id:string;reward_id:string;reward_title:string;cost:number;status:Redemption["status"];actor:string;created_at:string;updated_at:string};
const activeStatuses="('pending','approved','fulfilled')";

export class FamilyShop {
 constructor(private store:ReadingStore){store.db.exec(`
  CREATE TABLE IF NOT EXISTS deleted_rewards(reward_id TEXT PRIMARY KEY,revision TEXT NOT NULL,actor_id TEXT NOT NULL,deleted_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS reward_appearance(reward_id TEXT PRIMARY KEY,icon TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS reward_policies(reward_id TEXT PRIMARY KEY,version INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS reward_policy_versions(reward_id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,revision TEXT NOT NULL,request_hash TEXT NOT NULL,PRIMARY KEY(reward_id,version));
  CREATE TABLE IF NOT EXISTS redemption_contracts(redemption_id TEXT PRIMARY KEY,reward_id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,amount_cents INTEGER NOT NULL,period TEXT NOT NULL,approved_on TEXT,use_until TEXT,refunded_points INTEGER);
  CREATE INDEX IF NOT EXISTS redemption_contract_period ON redemption_contracts(reward_id,period);
 `);}
 private ensureAvailable(id:string){if(this.store.db.prepare("SELECT 1 FROM deleted_rewards WHERE reward_id=?").get(id))throw new HomeworkError(409,"商品已删除，请刷新商城。已兑换的奖励仍按原约定处理。");}
 remove(id:string,value:unknown,viewer:Viewer){
  if(!isParent(viewer))throw new HomeworkError(403,"删除商品需要家长处理。");
  const {revision}=z.object({revision:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(value),s=this.store;
  return s.transaction(()=>{
   const previous=s.db.prepare("SELECT revision FROM deleted_rewards WHERE reward_id=?").get(id) as {revision:string}|undefined;
   if(previous){if(previous.revision!==revision)throw new HomeworkError(409,"商品删除时的版本与这次确认不一致，请刷新查看。");return{id,deleted:true,alreadyDeleted:true};}
   const reward=this.reward(id);if(reward.revision!==revision)throw new HomeworkError(409,"商品已更新，请关闭确认框，刷新后再删除。");
   s.db.prepare("INSERT INTO deleted_rewards VALUES(?,?,?,?)").run(id,revision,viewer.id,s.time());s.audit(viewer.id,"delete-reward",id);
   return{id,deleted:true,alreadyDeleted:false};
  });
 }
 private version(id:string){return this.store.db.prepare("SELECT v.* FROM reward_policies p JOIN reward_policy_versions v ON p.reward_id=v.reward_id AND p.version=v.version WHERE p.reward_id=?").get(id) as Version|undefined;}
 private base(id:string){return this.store.db.prepare("SELECT r.*,d.expires_on FROM rewards r LEFT JOIN reward_deadlines d ON d.reward_id=r.id WHERE r.id=?").get(id) as BaseReward|undefined;}
 private groupCents(id:string,period:string,version:number){return (this.store.db.prepare(`SELECT COALESCE(SUM(c.amount_cents),0) AS n FROM redemption_contracts c JOIN redemptions r ON r.id=c.redemption_id WHERE c.reward_id=? AND c.period=? AND c.version=? AND r.status IN ${activeStatuses}`).get(id,period,version) as {n:number}).n;}
 private usage(id:string,version:number,budget:number|null):RewardUsage{
  const month=this.store.today().slice(0,7),year=month.slice(0,4);
  // Contract periods use Shanghai dates; legacy request dates use their stored UTC instant.
  const rows=this.store.db.prepare(`SELECT r.created_at,c.period,c.amount_cents FROM redemptions r LEFT JOIN redemption_contracts c ON c.redemption_id=r.id WHERE r.reward_id=? AND r.status IN ${activeStatuses}`).all(id) as {created_at:string;period:string|null;amount_cents:number|null}[];
  let monthCount=0,yearCount=0,monthCents=0;
  for(const row of rows){const day=row.period||new Date(Date.parse(row.created_at)+8*3600000).toISOString().slice(0,7);if(day.slice(0,4)===year)yearCount++;if(day===month){monthCount++;monthCents+=row.amount_cents||0;}}
  return{monthCount,yearCount,monthCents,groupCents:this.groupCents(id,month,version),remainingCents:budget===null?null:Math.max(0,budget-monthCents)};
 }
 reward(id:string):Reward {
  const base=this.base(id);if(!base)throw new HomeworkError(404,"奖励不存在。");
  const stored=this.version(id),defaults=OfferPolicySchema.parse({});
  const contract:RewardContract=stored?JSON.parse(stored.data):{...defaults,title:base.title,description:base.description,cost:base.cost,active:!!base.active,startsOn:"",expiresOn:base.expires_on,version:0};
  const appearance=this.store.db.prepare("SELECT icon FROM reward_appearance WHERE reward_id=?").get(id) as {icon:Reward["icon"]}|undefined;
  return{id,...contract,icon:appearance?.icon||defaultRewardIcon(contract.title),revision:stored?.revision||hash(contract),legacy:!stored,usage:this.usage(id,contract.version,contract.monthlyBudgetCents)};
 }
 list():Reward[]{return(this.store.db.prepare("SELECT r.id FROM rewards r WHERE NOT EXISTS (SELECT 1 FROM deleted_rewards d WHERE d.reward_id=r.id) ORDER BY r.rowid DESC").all() as {id:string}[]).map(r=>this.reward(r.id));}
 history(id:string){this.reward(id);return(this.store.db.prepare("SELECT data FROM reward_policy_versions WHERE reward_id=? ORDER BY version DESC").all(id) as {data:string}[]).map(r=>JSON.parse(r.data) as RewardContract);}
 setIcon(id:string,value:unknown,actor:string){const {icon}=RewardIconInputSchema.parse(value);return this.store.transaction(()=>{this.ensureAvailable(id);this.reward(id);this.store.db.prepare("INSERT INTO reward_appearance VALUES(?,?) ON CONFLICT(reward_id) DO UPDATE SET icon=excluded.icon").run(id,icon);this.store.audit(actor,"change-reward-icon",id);return this.reward(id);});}
 save(value:unknown,actor:string,id?:string){const v=RewardInputSchema.parse(value);return this.store.transaction(()=>this.write(v,actor,id));}
 /** Called inside the wish/setup transaction as well as the normal editor transaction. */
 write(v:ReturnType<typeof RewardInputSchema.parse>,actor:string,id?:string):Reward {
  const s=this.store,key=id||v.requestId||randomUUID(),old=this.base(key)?this.reward(key):undefined,last=this.version(key),fingerprint=hash(v);
  this.ensureAvailable(key);
  if(id&&!old)throw new HomeworkError(404,"奖励不存在。");
  if(last?.request_hash===fingerprint)return this.reward(key);
  if(old){
   if(v.revision!==old.revision)throw new HomeworkError(409,"商品已更新，请读取最新约定后再保存。你的填写保留。");
   if((!old.expiresOn||old.expiresOn>=s.today())&&!v.changeReason?.trim())throw new HomeworkError(409,"本期约定仍有效；家长可以更正价格或期限，请填写更正原因。已兑换记录保持原约定。");
  }else if((s.db.prepare("SELECT COUNT(*) AS n FROM rewards r WHERE NOT EXISTS (SELECT 1 FROM deleted_rewards d WHERE d.reward_id=r.id)").get() as {n:number}).n>=100)throw new HomeworkError(409,"最多设置100项奖励。");
  const expiresOn=v.expiresOn||addDays(s.today(),v.offerDays-1);
  if(expiresOn<s.today())throw new HomeworkError(400,"新一期的截止日期不能早于今天。");
  if(v.kind==="shopping"&&!v.monthlyBudgetCents)throw new HomeworkError(400,"请设置购物卡的每月金额上限。");
  const {revision:_revision,requestId:_requestId,changeReason,icon,...input}=v;
  const contract:RewardContract={...input,expiresOn,startsOn:s.today(),version:(old?.version||0)+1,...(old&&changeReason?{changeReason,changedAt:s.time()}:{})};
  if(old?.legacy){const{id:_id,revision:_r,legacy:_l,usage:_u,icon:_icon,...original}=old;s.db.prepare("INSERT OR IGNORE INTO reward_policy_versions VALUES(?,?,?,?,?)").run(key,0,JSON.stringify(original),hash(original),"legacy-snapshot");}
  s.db.prepare("INSERT INTO rewards(id,title,description,cost,active) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,cost=excluded.cost,active=excluded.active").run(key,v.title,v.description,v.cost,Number(v.active));
  s.db.prepare("INSERT INTO reward_deadlines VALUES(?,?) ON CONFLICT(reward_id) DO UPDATE SET expires_on=excluded.expires_on").run(key,expiresOn);
  s.db.prepare("INSERT INTO reward_policy_versions VALUES(?,?,?,?,?)").run(key,contract.version,JSON.stringify(contract),hash(contract),fingerprint);
  s.db.prepare("INSERT INTO reward_policies VALUES(?,?) ON CONFLICT(reward_id) DO UPDATE SET version=excluded.version").run(key,contract.version);
  if(icon)s.db.prepare("INSERT INTO reward_appearance VALUES(?,?) ON CONFLICT(reward_id) DO UPDATE SET icon=excluded.icon").run(key,icon);
  s.audit(actor,old?changeReason?"correct-reward-offer":"renew-reward-offer":"publish-reward-offer",key+":"+contract.version);return this.reward(key);
 }
 redeem(input:RedemptionInput,viewer:Viewer){this.expire();const s=this.store;return s.transaction(()=>{
  const old=s.db.prepare("SELECT * FROM redemptions WHERE id=?").get(input.id) as RedemptionRow|undefined;
  if(old){const c=s.db.prepare("SELECT amount_cents FROM redemption_contracts WHERE redemption_id=?").get(input.id) as {amount_cents:number}|undefined;if(old.reward_id!==input.rewardId||old.actor!==viewer.id||(c&&c.amount_cents!==(input.amountCents||0)))throw new HomeworkError(409,"兑换请求与原记录不一致。");return{saved:true};}
  this.ensureAvailable(input.rewardId);
  const r=this.reward(input.rewardId);
  if(!r.active||r.expiresOn&&r.expiresOn<s.today())throw new HomeworkError(409,"本期商品已到期或暂不可兑换，小脚步没有扣除。");
  if(!r.legacy&&input.revision!==r.revision)throw new HomeworkError(409,"商品已有新一期，请先查看本期价格再申请。小脚步没有扣除。");
  if(r.monthLimit!==null&&r.usage.monthCount>=r.monthLimit)throw new HomeworkError(409,"本月这项奖励的名额已用完，下个月还可以再期待。");
  if(r.yearLimit!==null&&r.usage.yearCount>=r.yearLimit)throw new HomeworkError(409,"今年这项奖励的名额已用完，小脚步可以留给其他心愿。");
  const amount=r.kind==="shopping"?input.amountCents:0;
  if(r.kind==="shopping"&&(!amount||amount<1))throw new HomeworkError(400,"请填写本次实际购物金额。");
  if(r.kind!=="shopping"&&input.amountCents!==undefined)throw new HomeworkError(400,"这是一项固定小脚步奖励，不需要填写购物金额。");
  if(r.kind==="shopping"&&r.monthlyBudgetCents!==null&&r.usage.monthCents+amount!>r.monthlyBudgetCents)throw new HomeworkError(409,"这次购物超过本月额度，请调整金额或和家长商量。");
  const cost=r.kind==="shopping"?shoppingCost(amount!,r.usage.groupCents,r.rateCents):r.cost;
  if(s.balance()<cost)throw new HomeworkError(409,"小脚步还不够，继续积累就好。");
  const time=s.time();s.db.prepare("INSERT INTO redemptions VALUES(?,?,?,?,?,?,?,?)").run(input.id,r.id,r.title,cost,"pending",viewer.id,time,time);
  const {id:_id,revision:_revision,legacy:_legacy,usage:_usage,...contract}=r;
  if(!r.legacy)s.db.prepare("INSERT INTO redemption_contracts VALUES(?,?,?,?,?,?,NULL,NULL,NULL)").run(input.id,r.id,r.version,JSON.stringify(contract),amount||0,s.today().slice(0,7));
  s.award("redeem:"+input.id,s.today(),-cost,"申请兑换："+r.title,"redeem",viewer.id);s.audit(viewer.id,"request-reward",input.id);return{saved:true,cost};
 });}
 private closeWithin(row:RedemptionRow,status:"rejected"|"expired",actor:string){
  const s=this.store,c=s.db.prepare("SELECT * FROM redemption_contracts WHERE redemption_id=?").get(row.id) as ContractRow|undefined;
  let refund=row.cost;
  if(c){const offer=JSON.parse(c.data) as RewardContract;if(offer.kind==="shopping"){const total=this.groupCents(c.reward_id,c.period,c.version);refund=Math.ceil(total/offer.rateCents)-Math.ceil((total-c.amount_cents)/offer.rateCents);}}
  s.db.prepare("UPDATE redemptions SET status=?,updated_at=? WHERE id=?").run(status,s.time(),row.id);
  if(c)s.db.prepare("UPDATE redemption_contracts SET refunded_points=? WHERE redemption_id=?").run(refund,row.id);
  s.award("refund:"+row.id,s.today(),refund,"返还兑换小脚步："+row.reward_title,"refund",actor);s.audit(actor,"reward:"+status,row.id);
 }
 expire(){const s=this.store;const rows=s.db.prepare("SELECT r.* FROM redemptions r JOIN redemption_contracts c ON c.redemption_id=r.id WHERE r.status='approved' AND c.use_until<?").all(s.today()) as RedemptionRow[];if(!rows.length)return;s.transaction(()=>{for(const row of rows){const current=s.db.prepare("SELECT * FROM redemptions WHERE id=? AND status='approved'").get(row.id) as RedemptionRow|undefined;if(current)this.closeWithin(current,"expired","system");}});}
 decide(id:string,status:"approved"|"rejected"|"fulfilled",actor:string){this.expire();const s=this.store;return s.transaction(()=>{
  const row=s.db.prepare("SELECT * FROM redemptions WHERE id=?").get(id) as RedemptionRow|undefined;if(!row)throw new HomeworkError(404,"兑换记录不存在。");if(row.status===status)return{saved:true};
  if(!(row.status==="pending"&&(status==="approved"||status==="rejected")||row.status==="approved"&&(status==="fulfilled"||status==="rejected")))throw new HomeworkError(409,"兑换状态已变化，请刷新查看。");
  if(status==="rejected")this.closeWithin(row,status,actor);
  else {s.db.prepare("UPDATE redemptions SET status=?,updated_at=? WHERE id=?").run(status,s.time(),id);
   if(status==="approved"){const c=s.db.prepare("SELECT data FROM redemption_contracts WHERE redemption_id=?").get(id) as {data:string}|undefined;if(c)s.db.prepare("UPDATE redemption_contracts SET approved_on=?,use_until=? WHERE redemption_id=?").run(s.today(),addDays(s.today(),(JSON.parse(c.data) as RewardContract).useDays-1),id);}
   s.audit(actor,"reward:"+status,id);
  }return{saved:true};
 });}
 redemptions():Redemption[]{this.expire();const s=this.store;return(s.db.prepare("SELECT * FROM redemptions ORDER BY rowid DESC LIMIT 100").all() as RedemptionRow[]).map(r=>{const c=s.db.prepare("SELECT * FROM redemption_contracts WHERE redemption_id=?").get(r.id) as ContractRow|undefined;const snapshot=c?JSON.parse(c.data) as RewardContract:null;return{id:r.id,rewardTitle:r.reward_title,cost:r.cost,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,...(c&&snapshot?{description:snapshot.description,version:c.version,kind:snapshot.kind,amountCents:c.amount_cents,valueCents:snapshot.valueCents,useDays:snapshot.useDays,useUntil:c.use_until,refundedPoints:c.refunded_points??undefined}:{})};});}
}
