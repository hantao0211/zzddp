import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {ReadingStore} from "../src/server/reading/store";
import {addDays,weekOf,ActivityClaimSchema} from "../src/domain/growth-economy";
import type {Viewer} from "../src/domain/accounts";
const child:Viewer={id:randomUUID(),name:"模拟孩子",username:"child",role:"child"},parent:Viewer={id:randomUUID(),name:"模拟家长",username:"parent",role:"parent"};
function fixture(){const dir=mkdtempSync(join(tmpdir(),"growth-test-"));let now=Date.parse("2026-11-23T10:00:00+08:00");const store=new ReadingStore(dir,()=>now);store.award("test",store.today(),100,"测试余额","test",parent.id);return{store,time:(day:string)=>{now=Date.parse(day.includes('T')?day:day+"T10:00:00+08:00");},close(){store.close();rmSync(dir,{force:true,recursive:true});}};}
const offer={title:"模拟电影",description:"一张模拟电影票",cost:10,monthLimit:1,yearLimit:5};
test("new offers promise an inclusive 45 days, lock every material term, then renew with history",()=>{const f=fixture();try{
 const r=f.store.saveReward(offer,parent.id);assert.equal(r.expiresOn,addDays("2026-11-23",44));assert.equal(r.useDays,45);assert.equal(r.version,1);
 assert.equal(f.store.saveReward(offer,parent.id,r.id).revision,r.revision);
 for(const change of [{cost:11},{description:"换了一张票"},{expiresOn:"2026-11-24"},{active:false},{monthLimit:2},{useDays:1}])assert.throws(()=>f.store.saveReward({...offer,...change,revision:r.revision},parent.id,r.id),/约定仍有效/);
 f.time(addDays(r.expiresOn!,1));assert.throws(()=>f.store.saveReward({...offer,cost:12},parent.id,r.id),/已更新/);
 const next=f.store.saveReward({...offer,cost:12,revision:r.revision},parent.id,r.id);assert.equal(next.version,2);assert.equal(f.store.shop.history(r.id).length,2);assert.equal(f.store.shop.history(r.id)[1].cost,10);
}finally{f.close();}});
test("stale quote and period limits reject before spending, including a renewal in the same month",()=>{const f=fixture();try{
 const r=f.store.saveReward({...offer,offerDays:1},parent.id),id=randomUUID();
 assert.throws(()=>f.store.shop.redeem({id,rewardId:r.id},child),/新一期/);assert.equal(f.store.balance(),100);
 f.store.redeem(id,r.id,child);assert.equal(f.store.balance(),90);f.store.redeem(id,r.id,child);assert.equal(f.store.balance(),90);
 assert.throws(()=>f.store.redeem(randomUUID(),r.id,child),/本月/);
 f.time("2026-11-24");const next=f.store.saveReward({...offer,revision:r.revision,cost:12},parent.id,r.id);
 assert.throws(()=>f.store.shop.redeem({id:randomUUID(),rewardId:r.id,revision:r.revision},child),/新一期/);
 assert.throws(()=>f.store.redeem(randomUUID(),next.id,child),/本月/);assert.equal(f.store.balance(),90);
 f.store.decide(id,"rejected",parent.id);f.store.redeem(randomUUID(),next.id,child);assert.equal(f.store.balance(),88);
}finally{f.close();}});
test("redemption snapshots survive repricing; use days start at approval and expiry refunds once",()=>{const f=fixture();try{
 const r=f.store.saveReward({...offer,offerDays:1,useDays:45},parent.id),id=randomUUID();f.store.redeem(id,r.id,child);
 f.time("2026-11-24");f.store.saveReward({...offer,cost:30,description:"新一期内容",revision:r.revision},parent.id,r.id);
 f.time("2026-11-25");f.store.decide(id,"approved",parent.id);let saved=f.store.redemptions()[0];assert.equal(saved.cost,10);assert.equal(saved.description,offer.description);assert.equal(saved.useUntil,addDays("2026-11-25",44));
 f.time(saved.useUntil!);assert.equal(f.store.redemptions()[0].status,"approved");f.time(addDays(saved.useUntil!,1));assert.equal(f.store.snapshot(child).redemptions[0].status,"expired");assert.equal(f.store.balance(),100);f.store.snapshot(child);assert.equal(f.store.balance(),100);
 assert.throws(()=>f.store.decide(id,"fulfilled",parent.id),/状态/);
}finally{f.close();}});
test("fulfilled rewards keep their history and are never expired or refunded",()=>{const f=fixture();try{const r=f.store.saveReward({...offer,useDays:1},parent.id),id=randomUUID();f.store.redeem(id,r.id,child);f.store.decide(id,"approved",parent.id);f.store.decide(id,"fulfilled",parent.id);f.time("2027-01-01");assert.equal(f.store.redemptions()[0].status,"fulfilled");assert.equal(f.store.balance(),90);}finally{f.close();}});
test("shopping totals use cents, round only cumulative amounts, and refunds cannot mint free purchases",()=>{const f=fixture();try{
 const r=f.store.saveReward({title:"日常购物卡",cost:1,kind:"shopping",rateCents:200,monthlyBudgetCents:10000},parent.id),a=randomUUID(),b=randomUUID();
 f.store.redeem(a,r.id,child,{revision:r.revision,amountCents:100});assert.equal(f.store.balance(),99);
 f.store.redeem(b,r.id,child,{revision:r.revision,amountCents:100});assert.equal(f.store.balance(),99);
 f.store.decide(a,"rejected",parent.id);assert.equal(f.store.balance(),99);assert.equal(f.store.redemptions().find(r=>r.id===a)?.refundedPoints,0);
 f.store.decide(b,"rejected",parent.id);assert.equal(f.store.balance(),100);f.store.decide(b,"rejected",parent.id);assert.equal(f.store.balance(),100);
 f.store.redeem(randomUUID(),r.id,child,{revision:r.revision,amountCents:9999});assert.equal(f.store.balance(),50);
 assert.throws(()=>f.store.redeem(randomUUID(),r.id,child,{revision:r.revision,amountCents:2}),/额度/);
 assert.equal(f.store.balance(),50);assert.equal(f.store.shop.reward(r.id).usage.monthCents,9999);
}finally{f.close();}});
test("monthly money and yearly counts follow Shanghai boundaries and retain independent periods",()=>{const f=fixture();try{
 f.time("2026-11-30T23:59:00+08:00");const r=f.store.saveReward({title:"购物",cost:1,kind:"shopping",monthlyBudgetCents:10000},parent.id);f.store.redeem(randomUUID(),r.id,child,{revision:r.revision,amountCents:10000});
 f.time("2026-12-01T00:01:00+08:00");assert.equal(f.store.shop.reward(r.id).usage.monthCents,0);f.store.redeem(randomUUID(),r.id,child,{revision:r.revision,amountCents:10000});assert.equal(f.store.balance(),0);
}finally{f.close();}});
test("activity claims snapshot points, require parent approval, enforce daily shared housework and weekly classes",()=>{const f=fixture();try{
 const id=randomUUID(),claim={id,key:"housework",date:f.store.today(),note:"整理衣服"};f.store.activities.submit(claim,child);assert.equal(f.store.balance(),100);
 assert.equal(f.store.activities.submit(claim,child).id,id);assert.throws(()=>f.store.activities.submit({...claim,id:randomUUID(),note:"又扫地"},child),/已经记录/);
 assert.throws(()=>f.store.activities.decide(id,"approved","",child),/家长/);f.store.activities.decide(id,"approved","",parent);f.store.activities.decide(id,"approved","",parent);assert.equal(f.store.balance(),101);
 const course={id:randomUUID(),key:"badminton",date:f.store.today(),note:""};f.store.activities.submit(course,parent);assert.equal(f.store.balance(),106);
 f.time("2026-11-24");assert.throws(()=>f.store.activities.submit({...course,id:randomUUID(),date:f.store.today()},child),/已经记录/);assert.equal(f.store.balance(),106);
 f.store.activities.submit({...claim,id:randomUUID(),date:f.store.today()},parent);assert.equal(f.store.balance(),107);
 assert.equal(weekOf("2026-11-29"),"2026-11-23");assert.equal(weekOf("2026-11-30"),"2026-11-30");
 assert.throws(()=>f.store.activities.submit({...course,id:randomUUID(),date:"2026-12-01"},child),/提前/);
 assert.equal(ActivityClaimSchema.safeParse({...claim,points:100}).success,false);
}finally{f.close();}});
test("activity rule changes never alter a pending promise or award the same event twice",()=>{const f=fixture();try{
 const c=f.store.activities.submit({id:randomUUID(),key:"english-reading",date:f.store.today()},child);
 const rules=f.store.activities.state().rules.map(r=>({...r,points:20}));assert.throws(()=>f.store.activities.setRules({rules},child),/家长/);f.store.activities.setRules({rules},parent);
 f.store.activities.decide(c.id,"approved","",parent);assert.equal(f.store.balance(),101);assert.equal(f.store.snapshot(child).growth.earned,1);
}finally{f.close();}});

test("explicit family setup preserves old promises and all balances, installs agreed limits, and is idempotent",async()=>{const {installFamilyPlan}=await import("../src/server/reading/family-plan");const f=fixture();try{
 const old=randomUUID();f.store.db.prepare("INSERT INTO rewards VALUES(?,?,?,7,1)").run(old,"原长期商品","原约定");
 const previous=f.store.db.prepare("SELECT * FROM rewards").all(),balance=f.store.balance(),rules=f.store.rules();
 const first=installFamilyPlan(f.store,parent.id),second=installFamilyPlan(f.store,parent.id);
 assert.equal(first.alreadyInstalled,false);assert.equal(second.alreadyInstalled,true);assert.deepEqual(first.rewardIds,second.rewardIds);assert.equal(f.store.rewards().length,5);assert.equal(f.store.balance(),balance);
 assert.deepEqual(f.store.db.prepare("SELECT * FROM rewards WHERE id=?").all(old),previous);assert.equal(f.store.shop.reward(old).expiresOn,null);
 assert.equal(f.store.rules().dailyPoints,1);assert.deepEqual(f.store.rules().milestones,rules.milestones);
 const movie=f.store.rewards().find(r=>r.title==="一起看电影")!;assert.equal(movie.cost,10);assert.equal(movie.monthLimit,1);assert.equal(movie.yearLimit,5);
 const disney=f.store.rewards().find(r=>r.title==="迪士尼购物卡")!;assert.equal(disney.cost,30);assert.equal(disney.valueCents,35000);
 const shopping=f.store.rewards().find(r=>r.kind==="shopping")!;assert.equal(shopping.rateCents,200);assert.equal(shopping.monthlyBudgetCents,10000);
 for(const r of f.store.rewards().filter(r=>!r.legacy)){assert.equal(r.useDays,45);assert.equal(r.expiresOn,addDays(f.store.today(),44));}
}finally{f.close();}});

test("learning profiles preserve the provided stage, allow pending textbooks, and protect concurrent edits",async()=>{const{studentProfile,saveStudentProfile}=await import("../src/server/reading/student-profile");const f=fixture();try{
 assert.equal(studentProfile(f.store),null);const input={grade:4,semester:2,region:"上海宝山区",school:"模拟学校"};const first=saveStudentProfile(f.store,input,parent.id);assert.equal(first.textbooks.英语.version,"");assert.equal(f.store.snapshot(child).studentProfile?.grade,4);
 assert.equal(saveStudentProfile(f.store,input,parent.id).revision,first.revision);assert.throws(()=>saveStudentProfile(f.store,{...input,grade:5},parent.id),/刚更新/);
 const next=saveStudentProfile(f.store,{...input,grade:5,revision:first.revision},parent.id);assert.equal(next.grade,5);assert.equal(f.store.balance(),100);
}finally{f.close();}});
test("parents can correct a live offer with a reason and current revision; existing redemptions retain original price and use period",()=>{const f=fixture();try{const r=f.store.saveReward({...offer,useDays:45},parent.id),id=randomUUID();f.store.redeem(id,r.id,child);const next=f.store.saveReward({...offer,cost:8,useDays:20,expiresOn:addDays(f.store.today(),20),revision:r.revision,changeReason:"原价格填错，已说明"},parent.id,r.id);assert.equal(next.cost,8);assert.equal(next.useDays,20);assert.equal(next.version,2);assert.equal(next.changeReason,"原价格填错，已说明");assert.equal(f.store.shop.history(r.id)[1].cost,10);assert.equal(f.store.saveReward({...offer,cost:8,useDays:20,expiresOn:addDays(f.store.today(),20),revision:r.revision,changeReason:"原价格填错，已说明"},parent.id,r.id).version,2);assert.throws(()=>f.store.saveReward({...offer,cost:7,revision:r.revision,changeReason:"过期页面"},parent.id,r.id),/已更新/);f.store.decide(id,"approved",parent.id);const prior=f.store.redemptions().find(v=>v.id===id)!;assert.equal(prior.cost,10);assert.equal(prior.useDays,45);assert.equal(prior.useUntil,addDays(f.store.today(),44));assert.equal(f.store.balance(),90);}finally{f.close();}});
test("correcting the monthly limit to optional keeps spent monthly usage and snapshots original legacy terms",()=>{const f=fixture();try{const r=f.store.saveReward({...offer,monthLimit:1},parent.id),id=randomUUID();f.store.redeem(id,r.id,child);const next=f.store.saveReward({...offer,monthLimit:null,revision:r.revision,changeReason:"次数只是可选上限"},parent.id,r.id);assert.equal(next.monthLimit,null);assert.equal(next.usage.monthCount,1);f.store.redeem(randomUUID(),r.id,child);assert.equal(f.store.balance(),80);const legacy=randomUUID();f.store.db.prepare("INSERT INTO rewards VALUES(?,?,?,7,1)").run(legacy,"原长期商品","保留原内容");const old=f.store.shop.reward(legacy);const changed=f.store.saveReward({title:old.title,cost:6,revision:old.revision,changeReason:"纠正误填定价"},parent.id,legacy);assert.equal(changed.cost,6);const history=f.store.shop.history(legacy);assert.equal(history.length,2);assert.equal(history[1].cost,7);assert.equal(history[1].description,"保留原内容");assert.equal(history[1].expiresOn,null);}finally{f.close();}});
import {applyApprovedMealCorrection} from "../src/server/reading/meal-correction";
test("the explicitly approved meal correction changes only the preset offer, once, without repricing existing requests",()=>{const f=fixture();try{const meal=f.store.saveReward({title:"每月一次大餐",description:"每月一次，一起挑选喜欢的餐厅，具体餐厅与家长商量。",cost:30,monthLimit:1},parent.id);f.store.db.prepare("INSERT INTO settings VALUES('family_plan_v1',?)").run(JSON.stringify({rewardIds:[randomUUID(),meal.id]}));const id=randomUUID();f.store.redeem(id,meal.id,child);const before=f.store.balance();const correction=applyApprovedMealCorrection(f.store);assert.equal(correction.changed,true);const next=f.store.shop.reward(meal.id);assert.equal(next.monthLimit,null);assert.equal(next.cost,30);assert.equal(next.title,"一起吃大餐");assert.equal(next.expiresOn,meal.expiresOn);assert.equal(f.store.balance(),before);assert.equal(f.store.redemptions()[0].cost,30);assert.equal(applyApprovedMealCorrection(f.store).alreadyApplied,true);assert.equal(f.store.shop.reward(meal.id).version,2);}finally{f.close();}});
import {ReadingHTTP} from '../src/server/reading/http';
import {createServer} from 'node:http';
test('children can read offer correction history while only parents can change live terms',async()=>{const f=fixture(),http=new ReadingHTTP(f.store),server=createServer((req,res)=>void http.handle(req,res,child,async()=>({})));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));try{const r=f.store.saveReward(offer,parent.id);f.store.saveReward({...offer,cost:8,revision:r.revision,changeReason:'更正误填'},parent.id,r.id);const url=`http://127.0.0.1:${(server.address() as any).port}/assistant-api/reading/rewards/${r.id}`;const read=await fetch(url+'/history');assert.equal(read.status,200);const result=await read.json();assert.equal(result.items.length,2);assert.equal(result.items[0].changeReason,'更正误填');const write=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:offer.title,cost:1,changeReason:'孩子尝试改价'})});assert.equal(write.status,403);assert.equal(f.store.shop.reward(r.id).cost,8);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));f.close();}});

test('reward icons persist without changing a quote, usage, balance or existing redemption promise',()=>{const f=fixture();try{
 const r=f.store.saveReward({...offer,icon:'movie'},parent.id),id=randomUUID();f.store.redeem(id,r.id,child);
 const contracts=f.store.db.prepare('SELECT * FROM reward_policy_versions').all(),redemption=f.store.redemptions(),balance=f.store.balance();
 const changed=f.store.shop.setIcon(r.id,{icon:'star'},parent.id);assert.equal(changed.icon,'star');assert.equal(changed.revision,r.revision);assert.equal(changed.version,r.version);assert.equal(changed.usage.monthCount,1);
 assert.deepEqual(f.store.db.prepare('SELECT * FROM reward_policy_versions').all(),contracts);assert.deepEqual(f.store.redemptions(),redemption);assert.equal(f.store.balance(),balance);
 const reopened=new ReadingStore(f.store.directory);try{assert.equal(reopened.shop.reward(r.id).icon,'star');}finally{reopened.close();}
 assert.throws(()=>f.store.shop.setIcon(r.id,{icon:'star',cost:1},parent.id));assert.throws(()=>f.store.shop.setIcon(r.id,{icon:'arbitrary-svg'},parent.id));assert.throws(()=>f.store.shop.setIcon(randomUUID(),{icon:'star'},parent.id),/不存在/);
}finally{f.close();}});
test('icon defaults distinguish existing offers and do not rewrite original reward rows',()=>{const f=fixture();try{
 for(const [title,icon] of [['日常购物卡','shopping'],['迪士尼购物卡','castle'],['一起吃大餐','meal'],['一起看电影','movie']]){const id=randomUUID();f.store.db.prepare('INSERT INTO rewards VALUES(?,?,?,7,1)').run(id,title,'旧约定');const before=f.store.db.prepare('SELECT * FROM rewards WHERE id=?').get(id);const r=f.store.shop.reward(id);assert.equal(r.icon,icon);f.store.shop.setIcon(id,{icon:'book'},parent.id);assert.deepEqual(f.store.db.prepare('SELECT * FROM rewards WHERE id=?').get(id),before);assert.equal(f.store.shop.reward(id).revision,r.revision);}
}finally{f.close();}});
test('only parents can change reward appearance; icon-only endpoint rejects commercial terms',async()=>{const f=fixture(),http=new ReadingHTTP(f.store);let viewer=child,input:unknown={icon:'star'};const server=createServer((req,res)=>void http.handle(req,res,viewer,async()=>input));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));try{
 const r=f.store.saveReward(offer,parent.id),url=`http://127.0.0.1:${(server.address() as any).port}/assistant-api/reading/rewards/${r.id}/icon`;
 assert.equal((await fetch(url,{method:'PATCH'})).status,403);viewer=parent;assert.equal((await fetch(url,{method:'PATCH'})).status,200);assert.equal(f.store.shop.reward(r.id).icon,'star');input={icon:'book',cost:1};assert.equal((await fetch(url,{method:'PATCH'})).status,400);assert.equal(f.store.shop.reward(r.id).cost,10);assert.equal(f.store.shop.reward(r.id).revision,r.revision);
}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));f.close();}});

test("manual product deletion hides the offer, preserves contracts and currency, and cannot be revived by stale writes",()=>{const f=fixture();try{
 const requestId=randomUUID(),input={...offer,monthLimit:null,yearLimit:null,requestId},r=f.store.saveReward(input,parent.id),pending=randomUUID(),approved=randomUUID(),fulfilled=randomUUID();
 for(const id of [pending,approved,fulfilled])f.store.redeem(id,r.id,child);
 f.store.decide(approved,"approved",parent.id);f.store.decide(fulfilled,"approved",parent.id);f.store.decide(fulfilled,"fulfilled",parent.id);
 const rows=(table:string)=>f.store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),before=Object.fromEntries(["rewards","reward_policies","reward_policy_versions","reward_deadlines","reward_appearance","redemptions","redemption_contracts","ledger"].map(t=>[t,rows(t)]));
 assert.throws(()=>f.store.shop.remove(r.id,{revision:r.revision},child),/家长/);assert.throws(()=>f.store.shop.remove(r.id,{revision:"0".repeat(64)},parent),/已更新/);
 assert.equal(f.store.shop.remove(r.id,{revision:r.revision},parent).deleted,true);assert.equal(f.store.balance(),70);assert.equal(f.store.rewards().length,0);assert.equal(f.store.snapshot(child).rewards.length,0);assert.equal(f.store.snapshot(parent).rewards.length,0);
 for(const [table,original] of Object.entries(before))assert.deepEqual(rows(table),original,table);
 assert.equal(f.store.shop.remove(r.id,{revision:r.revision},parent).alreadyDeleted,true);assert.equal((f.store.db.prepare("SELECT count(*) AS n FROM audit WHERE action='delete-reward'").get() as any).n,1);
 assert.throws(()=>f.store.saveReward(input,parent.id),/已删除/);assert.throws(()=>f.store.saveReward({...input,revision:r.revision,changeReason:"重复商品"},parent.id,r.id),/已删除/);assert.throws(()=>f.store.shop.setIcon(r.id,{icon:"movie"},parent.id),/已删除/);
 assert.throws(()=>f.store.redeem(randomUUID(),r.id,child),/已删除/);assert.equal(f.store.balance(),70);assert.equal(f.store.shop.history(r.id)[0].cost,10);
 f.store.redeem(pending,r.id,child);assert.equal(f.store.balance(),70);f.store.decide(pending,"approved",parent.id);f.store.decide(pending,"fulfilled",parent.id);f.store.decide(approved,"rejected",parent.id);f.store.decide(approved,"rejected",parent.id);assert.equal(f.store.balance(),80);assert.equal(f.store.redemptions().filter(v=>v.status==="fulfilled").length,2);
 const reopened=new ReadingStore(f.store.directory,f.store.now);try{assert.equal(reopened.rewards().length,0);assert.equal(reopened.redemptions().length,3);assert.equal(reopened.balance(),80);}finally{reopened.close();}
}finally{f.close();}});

test("archived shopping contracts retain their cumulative refund math and deletions free the active product capacity",()=>{const f=fixture();try{
 const r=f.store.saveReward({title:"模拟购物卡",cost:1,kind:"shopping",rateCents:200,monthlyBudgetCents:10000},parent.id),a=randomUUID(),b=randomUUID();
 for(const id of [a,b])f.store.redeem(id,r.id,child,{revision:r.revision,amountCents:100});assert.equal(f.store.balance(),99);
 f.store.shop.remove(r.id,{revision:r.revision},parent);assert.equal(f.store.balance(),99);f.store.decide(a,"rejected",parent.id);assert.equal(f.store.balance(),99);f.store.decide(b,"rejected",parent.id);assert.equal(f.store.balance(),100);
 for(let i=0;i<100;i++)f.store.saveReward({title:"模拟商品"+i,cost:1},parent.id);assert.throws(()=>f.store.saveReward({title:"超出上限",cost:1},parent.id),/100/);
 const duplicate=f.store.rewards()[0];f.store.shop.remove(duplicate.id,{revision:duplicate.revision},parent);f.store.saveReward({title:"清理后新商品",cost:1},parent.id);assert.equal(f.store.rewards().length,100);assert.equal((f.store.db.prepare("SELECT count(*) AS n FROM rewards").get() as any).n,102);
}finally{f.close();}});

test("parent activity CRUD keeps pending promises, survives reload and uses the selected frequency",()=>{
 const f=fixture();
 try{
  const a=f.store.activities, rule={key:randomUUID(),title:"跳绳",points:3,frequency:"daily",enabled:true};
  const create={before:null,after:rule};
  assert.throws(()=>a.changeRule(create,child),/家长/);
  a.changeRule(create,parent);a.changeRule(create,parent);
  assert.equal(a.state().rules.filter(r=>r.key===rule.key).length,1);
  const original=a.submit({id:randomUUID(),key:rule.key,date:f.store.today()},child);
  const next={...rule,title:"练习跳绳",frequency:"weekly",points:5};
  a.changeRule({before:rule,after:next},parent);
  assert.throws(()=>a.changeRule({before:rule,after:null},parent),/已更新/);
  f.time("2026-11-24");
  assert.throws(()=>a.submit({id:randomUUID(),key:rule.key,date:f.store.today()},child),/已经记录/);
  a.changeRule({before:next,after:null},parent);
  a.changeRule({before:next,after:null},parent);
  assert.throws(()=>a.changeRule(create,parent),/重新新增/);
  assert.throws(()=>a.submit({id:randomUUID(),key:rule.key,date:f.store.today()},parent),/关闭/);
  const reopened=new ReadingStore(f.store.directory);
  try{
   assert.ok(!reopened.activities.state().rules.some(r=>r.key===rule.key));
   const decided=reopened.activities.decide(original.id,"approved","",parent);
   assert.equal(decided.points,3);assert.equal(decided.title,"跳绳");
   reopened.activities.decide(original.id,"approved","",parent);
   assert.equal(reopened.balance(),103);
   for(const preset of reopened.activities.state().rules)reopened.activities.changeRule({before:preset,after:null},parent);
   assert.equal(reopened.activities.state().rules.length,0);
  }finally{reopened.close();}
 }finally{f.close();}
});

test("activity rule endpoint restricts changes to parents and exposes new rules in the child snapshot",async()=>{
 const f=fixture(),http=new ReadingHTTP(f.store);let viewer=child;
 const server=createServer((req,res)=>void http.handle(req,res,viewer,async()=>{
  let json="";for await(const chunk of req)json+=chunk;return JSON.parse(json);
 }));
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/assistant-api/reading`;
  const rule={key:randomUUID(),title:"朗读",points:2,enabled:true,frequency:"weekly"};
  const change=()=>fetch(base+"/activity-rule",{method:"PATCH",body:JSON.stringify({before:null,after:rule})});
  assert.equal((await change()).status,403);
  viewer=parent;assert.equal((await change()).status,200);
  viewer=child;const state=await (await fetch(base+"/state")).json();
  assert.deepEqual(state.activities.rules.find((v:{key:string})=>v.key===rule.key),rule);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));f.close();}
});
