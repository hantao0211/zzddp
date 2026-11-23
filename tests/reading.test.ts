import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {ReadingStore} from "../src/server/reading/store";
import {ReadingWorker} from "../src/server/reading/worker";
import {lookupBooks} from "../src/server/reading/catalog";
import {streaks,uniquePages,DEFAULT_READING_RULES,nextReadingPages} from "../src/domain/reading";
import type {Viewer} from "../src/domain/accounts";
import type {StructuredAI} from "../src/server/ai/provider";
const child:Viewer={id:"11111111-1111-4111-8111-111111111111",username:"qa-child",name:"模拟孩子",role:"child"};
const parent:Viewer={id:"22222222-2222-4222-8222-222222222222",username:"qa-parent",name:"模拟家长",role:"parent"};
function fixture(){const directory=mkdtempSync(join(tmpdir(),"xiaobu-reading-"));let time=Date.parse("2026-11-20T10:00:00+08:00");const store=new ReadingStore(directory,()=>time);const book=store.addBook({title:"模拟阅读书",totalPages:100},child.id);const input=(date=store.today())=>({id:randomUUID(),version:0,bookId:book.id,date,startPage:1,endPage:10,minutes:15,summary:"主人公遇到困难后，主动向朋友求助。"});return{store,book,input,directory,setTime:(v:string)=>{time=Date.parse(v);},cleanup(){store.close();rmSync(directory,{recursive:true,force:true});}};}
const output={summaryFeedback:"你讲清楚了人物遇到的问题和采取的行动。",strengths:["说出了主要事情"],nextStep:"可以再说一句求助后的结果。",followUpQuestion:"你觉得他为什么找朋友帮忙？",expression:"clear",comparison:"consistent",comparisonReason:"与你提供的片段一致。",evidenceQuote:"主动向朋友求助",evidenceReadable:true};
test("reading dates use Shanghai days; streak and page progress handle gaps, overlap and rereading",()=>{assert.deepEqual(streaks(["2026-11-18","2026-11-19","2026-11-19"],"2026-11-20"),{currentStreak:2,bestStreak:2});assert.equal(streaks(["2026-11-17"],"2026-11-20").currentStreak,0);assert.equal(uniquePages([{startPage:1,endPage:10},{startPage:8,endPage:20},{startPage:30,endPage:35}]),26);});
test("saved logs and versioned updates are idempotent; daily points do not depend on AI, pages or duration",()=>{const f=fixture();try{const input=f.input(),first=f.store.save(input,child);assert.equal(first.pointsAdded,2);assert.equal(first.log.reviewStatus,"queued");assert.equal(f.store.save(input,child).pointsAdded,0);const updated=f.store.save({...input,version:1,minutes:25,endPage:12},child);assert.equal(updated.pointsAdded,0);assert.equal(f.store.balance(),2);assert.equal(f.store.book(f.book.id).uniquePages,12);assert.equal(f.store.snapshot(child).stats.minutes,25);assert.throws(()=>f.store.save({...input,version:1,minutes:30},child),/更新/);assert.throws(()=>f.store.save({...f.input(),date:"2026-11-21"},child),/日期/);assert.throws(()=>f.store.save({...f.input(),endPage:101},child),/总页数/);const p=f.store.save(f.input(),parent).log;assert.throws(()=>f.store.save({...f.input(),id:p.id,version:p.version},child),/家长/);assert.equal(f.store.snapshot(child).stats.days,1);}finally{f.cleanup();}});
test("consecutive rewards pay once, backfills follow rules, and broken streaks never remove earned points",()=>{const f=fixture();try{for(const date of ["2026-11-18","2026-11-19","2026-11-20"]){f.setTime(date+"T10:00:00+08:00");f.store.save(f.input(),child);}assert.equal(f.store.balance(),9);assert.equal(f.store.snapshot(child).stats.currentStreak,3);f.store.save(f.input(),child);assert.equal(f.store.balance(),9);f.store.save(f.input("2026-11-17"),child);assert.equal(f.store.balance(),9);f.setTime("2026-11-22T10:00:00+08:00");assert.equal(f.store.snapshot(child).stats.currentStreak,0);assert.equal(f.store.balance(),9);f.store.setRules({...DEFAULT_READING_RULES,backfillCounts:true},parent.id);f.store.save(f.input("2026-11-21"),child);assert.equal(f.store.balance(),11);f.store.save(f.input(),child);assert.equal(f.store.balance(),13);f.store.save(f.input(),child);assert.equal(f.store.balance(),13);}finally{f.cleanup();}});
test("redemption reserves points atomically, request retries do not double charge, refund is once and fulfillment is final",()=>{const f=fixture();try{f.store.save(f.input(),child);const reward=f.store.saveReward({title:"模拟亲子活动",cost:2},parent.id);const id=randomUUID();f.store.redeem(id,reward.id,child);assert.equal(f.store.balance(),0);f.store.redeem(id,reward.id,child);assert.equal(f.store.balance(),0);assert.throws(()=>f.store.redeem(randomUUID(),reward.id,child),/还不够/);f.store.decide(id,"rejected",parent.id);f.store.decide(id,"rejected",parent.id);assert.equal(f.store.balance(),2);const second=randomUUID();f.store.redeem(second,reward.id,child);f.store.decide(second,"approved",parent.id);assert.throws(()=>f.store.saveReward({title:"新版奖励",cost:20,active:true},parent.id,reward.id),/约定仍有效|已更新/);assert.equal(f.store.redemptions()[0].cost,2);f.store.decide(second,"fulfilled",parent.id);assert.throws(()=>f.store.decide(second,"rejected",parent.id),/状态/);assert.equal(f.store.balance(),0);}finally{f.cleanup();}});
test("AI cannot claim content verification from book metadata or invent an excerpt, and does not affect earned points",async()=>{const f=fixture();try{const input=f.input(),saved=f.store.save(input,child);const ai:StructuredAI={async run(task,schema,metadata){assert.equal(task,"reading_review");assert.equal((metadata as any).book.descriptionIsOriginalText,false);return schema.parse(output);}};const worker=new ReadingWorker(f.store,()=>ai);await worker.tick();const review=f.store.log(saved.log.id,child).review!;assert.equal(review.basis,"none");assert.equal(review.comparison,"insufficient_evidence");assert.equal(f.store.balance(),2);f.store.save({...input,version:1,excerpt:"主人公遇到困难后主动向朋友求助，大家一起解决了问题。"},child);await worker.tick();assert.equal(f.store.log(input.id,child).review!.basis,"provided_excerpt");assert.equal(f.store.balance(),2);worker.stop();}finally{f.cleanup();}});
test("editing during AI work cannot publish stale feedback; image submission retries and restart recovery are bounded",async()=>{const f=fixture();try{const input=f.input();const photo=Buffer.from([255,216,255,224,1,2,3]).toString("base64");const saved=f.store.save({...input,image:photo},child);assert.equal(f.store.save({...input,image:photo},child).log.version,1);assert.equal((f.store.db.prepare("SELECT COUNT(*) AS n FROM images").get() as any).n,1);const ai:StructuredAI={async run(_task,schema){f.store.save({...input,version:1,summary:"主人公先自己尝试，再找朋友一起想办法。",keepImage:false},child);return schema.parse(output);}};const worker=new ReadingWorker(f.store,()=>ai);await worker.tick();assert.equal(f.store.log(saved.log.id,child).version,2);assert.equal(f.store.log(saved.log.id,child).review,null);assert.equal(f.store.log(saved.log.id,child).reviewStatus,"queued");worker.stop();const job=f.store.claim()!;f.store.db.prepare("UPDATE review_jobs SET attempts=3 WHERE id=?").run(job.id);f.store.close();const reopened=new ReadingStore(f.directory,f.store.now);assert.equal(reopened.log(input.id,child).reviewStatus,"failed");reopened.close();(f.store as any).close=()=>{};}finally{f.cleanup();}});
test("book lookup uses a fixed catalog origin, ISBN/edition metadata and bounded public results",async()=>{let url="";const request:typeof fetch=async input=>{url=String(input);return new Response(JSON.stringify({items:[{id:"synthetic-volume",volumeInfo:{title:"模拟书名",authors:["模拟作者"],publisher:"模拟出版社",industryIdentifiers:[{type:"ISBN_13",identifier:"9780000000002"}],pageCount:120,description:"<p>只有简介，不是原文。</p>"}}]}),{headers:{"Content-Type":"application/json"}});};const result=await lookupBooks("9780000000002",request);assert.ok(url.startsWith("https://www.googleapis.com/books/v1/volumes?"));assert.ok(decodeURIComponent(url).includes("isbn:9780000000002"));assert.equal(result[0].isbn,"9780000000002");assert.equal(result[0].description,"只有简介，不是原文。");});

test("reading review has a persistent daily call budget and queued work resumes on the next Shanghai day",()=>{const f=fixture();try{for(let i=0;i<20;i++){f.store.save(f.input(),child);const job=f.store.claim()!;assert.ok(job);f.store.fail(job,false);}f.store.save(f.input("2026-11-19"),child);assert.equal(f.store.claim(),undefined);assert.equal(f.store.snapshot(child).reviewBudget.used,20);assert.equal(f.store.balance(),2);f.setTime("2026-11-20T16:01:00Z");assert.equal(f.store.today(),"2026-11-21");assert.ok(f.store.claim());assert.equal(f.store.snapshot(child).reviewBudget.used,1);}finally{f.cleanup();}});

test("old reading records remain editable after a year without granting historic points again",()=>{const f=fixture();try{const input=f.input();f.store.save(input,child);f.setTime("2028-01-20T10:00:00+08:00");const updated=f.store.save({...input,version:1,minutes:20},child);assert.equal(updated.log.minutes,20);assert.equal(updated.pointsAdded,0);assert.equal(f.store.balance(),2);assert.throws(()=>f.store.save(f.input("2026-11-20"),child),/一年/);}finally{f.cleanup();}});

test("wish approval atomically creates one mall reward; retries do not mint rewards or change the balance",()=>{const f=fixture();try{f.store.save(f.input(),child);const input={id:randomUUID(),title:"一起去看星星",description:"周末和爸爸妈妈一起"};const w=f.store.submitWish(input,child);assert.equal(w.status,"pending");assert.equal(f.store.balance(),2);assert.equal(f.store.rewards().length,0);assert.equal(f.store.submitWish(input,child).id,w.id);assert.throws(()=>f.store.submitWish({...input,title:"另一件事"},child),/不同/);const decision={status:"approved",title:"家庭观星夜",description:"晴朗周末一起去公园观星",cost:2,note:"一起选一个天气好的晚上吧"};assert.throws(()=>f.store.decideWish(w.id,decision,child),/家长/);const approved=f.store.decideWish(w.id,decision,parent);assert.ok(approved.rewardId);assert.equal(approved.title,input.title);assert.equal(approved.note,decision.note);assert.equal(f.store.decideWish(w.id,decision,parent).rewardId,approved.rewardId);assert.equal(f.store.rewards().length,1);assert.equal(f.store.rewards()[0].title,decision.title);assert.equal(f.store.balance(),2);assert.throws(()=>f.store.decideWish(w.id,{...decision,cost:3},parent),/已处理/);assert.throws(()=>f.store.decideWish(w.id,{status:"declined",note:"暂缓"},parent),/已处理/);assert.throws(()=>f.store.withdrawWish(w.id,child),/已处理/);f.store.redeem(randomUUID(),approved.rewardId!,child);assert.equal(f.store.balance(),0);}finally{f.cleanup();}});
test("wish withdrawal is owner-only and final, declined wishes require a parent explanation and never charge points",()=>{const f=fixture();try{const w=f.store.submitWish({id:randomUUID(),title:"去看电影"},child);assert.throws(()=>f.store.withdrawWish(w.id,parent),/自己/);assert.equal(f.store.withdrawWish(w.id,child).status,"withdrawn");assert.equal(f.store.withdrawWish(w.id,child).status,"withdrawn");assert.throws(()=>f.store.decideWish(w.id,{status:"approved",title:w.title,cost:10},parent),/撤回/);const next=f.store.submitWish({id:randomUUID(),title:"远途旅行"},child);assert.throws(()=>f.store.decideWish(next.id,{status:"declined",note:"   "},parent));const decision={status:"declined",note:"这个月时间不够，我们先安排一次附近的野餐好吗？"};assert.equal(f.store.decideWish(next.id,decision,parent).note,decision.note);assert.equal(f.store.decideWish(next.id,decision,parent).status,"declined");assert.equal(f.store.rewards().length,0);assert.equal(f.store.balance(),0);assert.equal(f.store.snapshot(child).wishes.length,2);}finally{f.cleanup();}});
test("wish inputs cannot choose approval, prices or actors and pending limits do not block idempotent retries",()=>{const f=fixture();try{const first={id:randomUUID(),title:"一起画画"};f.store.submitWish(first,child);for(const injection of [{cost:1},{status:"approved"},{actorId:parent.id},{rewardId:randomUUID()}])assert.throws(()=>f.store.submitWish({...first,...injection},child));for(let i=1;i<20;i++)f.store.submitWish({id:randomUUID(),title:"模拟心愿"+i},child);assert.equal(f.store.submitWish(first,child).id,first.id);assert.throws(()=>f.store.submitWish({id:randomUUID(),title:"第21个"},child),/20个/);f.store.withdrawWish(first.id,child);assert.equal(f.store.submitWish({id:randomUUID(),title:"新心愿"},child).status,"pending");}finally{f.cleanup();}});
test("a full mall rolls back wish approval; persisted original data and legacy ledger labels keep their values",()=>{const f=fixture();try{f.store.save(f.input(),child);f.store.db.prepare("UPDATE ledger SET label='旧积分记录'").run();for(let i=0;i<100;i++)f.store.saveReward({title:"模拟奖励"+i,cost:1},parent.id);const w=f.store.submitWish({id:randomUUID(),title:"新活动"},child);assert.throws(()=>f.store.decideWish(w.id,{status:"approved",title:w.title,cost:1},parent),/上限/);assert.equal(f.store.wish(w.id,child).status,"pending");assert.equal(f.store.wish(w.id,child).rewardId,null);assert.equal(f.store.rewards().length,100);assert.equal(f.store.balance(),2);assert.equal(f.store.snapshot(child).growth.ledger[0].label,"旧小脚步记录");f.store.close();const reopened=new ReadingStore(f.directory,f.store.now);assert.equal(reopened.snapshot(child).wishes[0].id,w.id);assert.equal(reopened.balance(),2);assert.equal(reopened.snapshot(child).logs.length,1);assert.equal((reopened.db.prepare("SELECT label FROM ledger").get() as any).label,"旧积分记录");reopened.close();(f.store as any).close=()=>{};}finally{f.cleanup();}});

test("book edits preserve identity, logs, progress, finish flag, rewards and review jobs; save retries are idempotent",()=>{const f=fixture();try{
 const input=f.input();f.store.save(input,child);f.store.finishBook(f.book.id,true,child.id);
 const before=f.store.book(f.book.id),logs=f.store.db.prepare('SELECT * FROM logs').all(),jobs=f.store.db.prepare('SELECT * FROM review_jobs').all(),ledger=f.store.db.prepare('SELECT * FROM ledger').all();
 const edit={title:"模拟书名更正",author:"模拟作者",isbn:"9780000000002",publisher:"模拟出版社",totalPages:120,revision:before.revision};
 const book=f.store.editBook(before.id,edit,child.id);assert.equal(book.id,before.id);assert.equal(book.createdAt,before.createdAt);assert.equal(book.finished,true);assert.equal(book.uniquePages,10);assert.equal(book.minutes,15);assert.equal(book.logCount,1);assert.equal(book.totalPages,120);assert.notEqual(book.revision,before.revision);
 const audit=f.store.db.prepare('SELECT count(*) n FROM audit').get();assert.deepEqual(f.store.editBook(before.id,edit,child.id),book);assert.deepEqual(f.store.db.prepare('SELECT count(*) n FROM audit').get(),audit);
 assert.deepEqual(f.store.db.prepare('SELECT * FROM logs').all(),logs);assert.deepEqual(f.store.db.prepare('SELECT * FROM review_jobs').all(),jobs);assert.deepEqual(f.store.db.prepare('SELECT * FROM ledger').all(),ledger);assert.equal(f.store.balance(),2);assert.equal(f.store.snapshot(child).stats.currentStreak,1);
 assert.throws(()=>f.store.editBook(before.id,{...edit,title:"另一台设备的旧修改"},parent.id),/刚更新/);
 }finally{f.cleanup();}});
test("book metadata rejects too-small page counts, duplicates and protected fields without changing saved data",()=>{const f=fixture();try{
 f.store.save({...f.input(),endPage:48},child);const book=f.store.book(f.book.id),edit={title:book.title,author:book.author,isbn:book.isbn,publisher:book.publisher,totalPages:book.totalPages,revision:book.revision};
 const snapshot=JSON.stringify(f.store.db.prepare('SELECT * FROM books').all());
 assert.throws(()=>f.store.editBook(book.id,{...edit,totalPages:47},child.id),/48页/);assert.equal(JSON.stringify(f.store.db.prepare('SELECT * FROM books').all()),snapshot);
 for(const extra of [{finished:true},{id:randomUUID()},{catalogId:"other"},{uniquePages:200}])assert.throws(()=>f.store.editBook(book.id,{...edit,...extra},child.id));
 const other=f.store.addBook({title:"另一本书",isbn:"9780000000003"},child.id);assert.throws(()=>f.store.editBook(book.id,{...edit,title:other.title,isbn:other.isbn},child.id),/已有这本书/);assert.equal(f.store.book(book.id).title,book.title);
 assert.equal(f.store.editBook(book.id,{...edit,totalPages:null},child.id).totalPages,null);assert.equal(f.store.book(book.id).uniquePages,48);
 }finally{f.cleanup();}});
test("corrected book identity drops old catalog attribution, while a page-count correction retains its matching source",()=>{const f=fixture();try{
 const catalog={id:"synthetic-volume",title:"模拟查书",author:"作者",isbn:"9780000000004",publisher:"出版社",totalPages:200,description:"只有简介，不是原文",sourceUrl:"https://books.google.com/books?id=synthetic"};f.store.cache([catalog]);const book=f.store.addBook({title:catalog.title,catalogId:catalog.id},child.id);
 const input={title:book.title,author:book.author,isbn:book.isbn,publisher:book.publisher,totalPages:201,revision:book.revision};const pages=f.store.editBook(book.id,input,child.id);assert.equal(pages.sourceUrl,catalog.sourceUrl);assert.equal(pages.description,catalog.description);
 const renamed=f.store.editBook(book.id,{...input,title:"更正后的书名",revision:pages.revision},child.id);assert.equal(renamed.sourceUrl,null);assert.equal(renamed.description,"");assert.equal(renamed.catalogId,null);
 }finally{f.cleanup();}});

test("continuation uses the latest dated session per book, including sparse history and rereading",()=>{const f=fixture();try{
 assert.equal(f.store.book(f.book.id).lastReadPage,null);
 f.store.save({...f.input(),date:"2026-11-18",startPage:40,endPage:48},child);
 const latest=f.store.save({...f.input(),date:"2026-11-20",startPage:10,endPage:15},child).log;
 f.store.save({...f.input(),date:"2026-11-19",startPage:60,endPage:80},child);
 assert.equal(f.store.book(f.book.id).lastReadPage,15,"Backfills and max page must not replace the latest reading session");
 assert.equal(f.store.snapshot(child).books[0].lastReadPage,15);
 f.store.save({...f.input(),id:latest.id,version:latest.version,startPage:10,endPage:18},child);
 assert.deepEqual(nextReadingPages(f.store.book(f.book.id)),{startPage:19,endPage:19});
 assert.deepEqual(nextReadingPages({lastReadPage:100,totalPages:100}),{startPage:100,endPage:100});
 assert.deepEqual(nextReadingPages(),{startPage:1,endPage:1});
}finally{f.cleanup();}});

test("reward deadlines include the whole Shanghai day and expired requests never spend steps",()=>{const f=fixture();try{
 f.store.save(f.input(),child);
 const reward=f.store.saveReward({title:"模拟电影",cost:1,expiresOn:"2026-11-20"},parent.id),id=randomUUID();
 f.setTime("2026-11-20T23:59:59+08:00");f.store.redeem(id,reward.id,child);assert.equal(f.store.balance(),1);
 f.setTime("2026-11-21T00:00:00+08:00");
 f.store.redeem(id,reward.id,child);assert.equal(f.store.balance(),1,"Retry an existing request after expiry without charging twice");
 assert.throws(()=>f.store.redeem(randomUUID(),reward.id,child),/到期/);
 assert.equal(f.store.balance(),1);assert.equal(f.store.redemptions().length,1);
 f.store.decide(id,"approved",parent.id);f.store.decide(id,"rejected",parent.id);assert.equal(f.store.balance(),2);
 f.store.saveReward({title:reward.title,cost:reward.cost,expiresOn:"2026-11-22",revision:reward.revision},parent.id,reward.id);
 f.store.redeem(randomUUID(),reward.id,child);assert.equal(f.store.balance(),1);
}finally{f.cleanup();}});

test("reward expiry survives restart, cannot be shortened midterm, and legacy rewards keep their promise",()=>{const f=fixture();try{
 const oldId=randomUUID();f.store.db.prepare("INSERT INTO rewards VALUES(?,?,?,1,1)").run(oldId,"原有长期奖励","");const old=f.store.shop.reward(oldId);
 assert.equal(old.expiresOn,null);
 const limited=f.store.saveReward({title:"模拟限时活动",cost:1,expiresOn:"2026-12-01"},parent.id);
 assert.throws(()=>f.store.saveReward({title:"错误日期",cost:1,expiresOn:"2026-02-30"},parent.id));
 f.store.close();const reopened=new ReadingStore(f.directory,f.store.now);
 assert.equal(reopened.rewards().find(r=>r.id===limited.id)?.expiresOn,"2026-12-01");
 assert.equal(reopened.rewards().find(r=>r.id===old.id)?.expiresOn,null);
 assert.throws(()=>reopened.saveReward({title:limited.title,cost:limited.cost,expiresOn:null},parent.id,limited.id),/约定仍有效|已更新/);
 assert.equal(reopened.rewards().find(r=>r.id===limited.id)?.expiresOn,"2026-12-01");
 assert.equal((reopened.db.prepare("PRAGMA table_info(rewards)").all()).length,5,"Original reward columns remain compatible");
 reopened.close();(f.store as any).close=()=>{};
}finally{f.cleanup();}});

test("approved wishes create dated rewards atomically and retries retain their original decision",()=>{const f=fixture();try{
 const wish=f.store.submitWish({id:randomUUID(),title:"一起去看电影"},child);
 const decision={status:"approved",title:wish.title,cost:1,expiresOn:"2026-12-01"};
 const approved=f.store.decideWish(wish.id,decision,parent);
 assert.equal(f.store.rewards().find(r=>r.id===approved.rewardId)?.expiresOn,"2026-12-01");
 assert.equal(f.store.decideWish(wish.id,decision,parent).rewardId,approved.rewardId);
 assert.throws(()=>f.store.decideWish(wish.id,{...decision,expiresOn:"2026-12-02"},parent),/已处理/);
 assert.equal(f.store.balance(),0);
}finally{f.cleanup();}});

test("legacy databases gain only an empty deadline table and retain existing rewards and points",()=>{const f=fixture();try{
 f.store.save(f.input(),child);f.store.db.prepare("INSERT INTO rewards VALUES(?,?,?,2,1)").run(randomUUID(),"原有奖励","");
 const before=f.store.db.prepare("SELECT * FROM rewards").all(),balance=f.store.balance();
 f.store.db.exec("DROP TABLE reward_deadlines");f.store.close();
 const reopened=new ReadingStore(f.directory,f.store.now);
 assert.deepEqual(reopened.db.prepare("SELECT * FROM rewards").all(),before);
 assert.equal(reopened.balance(),balance);assert.equal(reopened.rewards()[0].expiresOn,null);
 assert.equal((reopened.db.prepare("SELECT COUNT(*) AS n FROM reward_deadlines").get() as any).n,0);
 reopened.close();(f.store as any).close=()=>{};
}finally{f.cleanup();}});
