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
