import { ReadingStore } from "../src/server/reading/store";
import { ReadingHTTP } from "../src/server/reading/http";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { scryptSync } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request as httpRequest } from "node:http";
import { Accounts } from "../src/server/assistant/accounts";
import { AssistantStore } from "../src/server/assistant/store";
import { createAssistantServer } from "../src/server/assistant/server";
import { HomeworkStore } from "../src/server/homework/store";
import { HomeworkConversation } from "../src/server/homework/conversation";
import { HomeworkHTTP } from "../src/server/homework/http";
const date = "2026-11-15", origin = "https://family.test", code = "81746290", salt = "ab".repeat(16);
const password = "synthetic-password";
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-accounts-test-")), accounts = new Accounts(directory), sessions = new AssistantStore(directory), homework = new HomeworkStore(join(directory, "learning")); const reading = new ReadingStore(join(directory, "reading")); let calls = 0;
  const server = createAssistantServer({ reading: new ReadingHTTP(reading, async () => []), origin, accessHash: salt + ":" + scryptSync(code, salt, 32).toString("hex"), accounts, store: sessions, learning: new HomeworkConversation(homework), homework: new HomeworkHTTP(homework), serviceInfo: { provider: "synthetic", model: "synthetic-model" }, ai: () => ({ async run(_task, schema) { calls++; return schema.parse({ answer: "模拟回答", spokenAnswer: "模拟回答", hint: null, followUpQuestion: null, sourceMaterialIds: [], clarification: null, memoryCandidates: [] }); } }) });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); const address = server.address(); assert.ok(address && typeof address !== "string");
  const port = address.port;
  let ip = 0;
  async function send(path: string, method = "GET", value?: unknown, cookie = "", extra: Record<string, string> = {}) {
    return new Promise<{ status: number; data: any; cookie: string }>((resolve, reject) => {
      const headers = { Host: "family.test", "X-Forwarded-Proto": "https", Origin: origin, "X-Real-IP": `192.0.2.${++ip}`, Cookie: cookie, "Content-Type": "application/json", ...(value === undefined ? {} : {"Content-Length": String(Buffer.byteLength(JSON.stringify(value)))}), ...extra };
      const request = httpRequest({ host: "127.0.0.1", port, path: "/assistant-api/" + path, method, headers }, response => { const chunks: Buffer[] = []; response.on("data", b => chunks.push(b)); response.on("end", () => resolve({ status: response.statusCode!, data: JSON.parse(Buffer.concat(chunks).toString()), cookie: response.headers["set-cookie"]?.[0]?.split(";")[0] || "" })); }); request.on("error", reject); request.end(value === undefined ? undefined : JSON.stringify(value));
    });
  }
  const setupCode = readFileSync(join(directory, "parent-setup-code"), "utf8").trim();
  async function bootstrap() { const result = await send("parent-setup", "POST", { setupCode, username: "admin", name: "模拟家长", password }); assert.equal(result.status, 200); return result; }
  async function login(username: string, pass = password) { return send("session", "POST", { username, password: pass }); }
  return { directory, accounts, sessions, homework, reading, send, setupCode, bootstrap, login, calls: () => calls, async cleanup() { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); accounts.close(); homework.close(); reading.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("server-only bootstrap cannot be claimed by the first visitor or family code; consumed once, hashes only", async () => {
  const f = await fixture(); try {
    assert.equal((await f.send("status")).data.setupRequired, true);
    assert.equal((await f.send("parent-setup", "POST", { setupCode: code, username: "admin", name: "成人", password })).status, 400);
    assert.equal((await f.send("parent-setup", "POST", { setupCode: "a".repeat(32), username: "admin", name: "成人", password })).status, 401);
    assert.equal((await f.send("parent-setup", "POST", { setupCode: f.setupCode, username: "admin", name: "成人", password }, "", { Origin: "https://other.test" })).status, 403);
    const first = await f.bootstrap(); assert.equal(first.data.viewer.role, "admin");
    assert.equal(existsSync(join(f.directory, "parent-setup-code")), false);
    assert.equal((await f.send("parent-setup", "POST", { setupCode: f.setupCode, username: "other", name: "成人", password })).status, 409);
    const rows = JSON.stringify(f.accounts.db.prepare("SELECT * FROM accounts").all()); assert.ok(!rows.includes(password));
    assert.ok(!JSON.stringify((await f.send("admin/overview", "GET", undefined, first.cookie)).data).includes(f.setupCode));
    assert.equal((await f.login("ADMIN")).status, 200);
  } finally { await f.cleanup(); }
});

test("legacy sessions become children; roles cannot be selected by the client; forbidden management spends no AI calls", async () => {
  const f = await fixture(); try {
    const legacy = f.sessions.createSession(), cookie = "__Secure-xiaobu-assistant=" + legacy;
    assert.equal((await f.send("status", "GET", undefined, cookie)).data.viewer.role, "child");
    assert.equal((await f.send("admin/overview")).status, 401);
    assert.equal((await f.send("admin/overview", "GET", undefined, cookie)).status, 403);
    assert.equal((await f.send("session", "POST", { code, role: "admin" })).status, 400);
    for (const [path, method, body] of [["admin/accounts", "POST", { username: "hacked", password, name: "模拟", role: "admin" }], ["admin/limits", "PATCH", { chat: 5000, asr: 5000, tts: 5000 }], ["memories/11111111-1111-4111-8111-111111111111/revoke", "POST", {}], ["learning/retry-day", "POST", { date }], ["learning/grading/start", "POST", { date }]] as const) assert.equal((await f.send(path, method, body, cookie)).status, 403);
    assert.equal(f.calls(), 0);
    assert.equal((await f.send("chat", "POST", { question: "模拟提问", history: [], studyDate: date }, cookie)).status, 200); assert.equal(f.calls(), 1);
    assert.equal((await f.send("learning/uploads", "POST", { date, kind: "memo", files: [{ name: "synthetic.png", size: 1, sha256: "a".repeat(64) }] }, cookie)).status, 201);
  } finally { await f.cleanup(); }
});

test("admin creates distinct parent and child accounts; parent can manage learning but cannot manage accounts or limits", async () => {
  const f = await fixture(); try {
    const admin = await f.bootstrap();
    for (const role of ["parent", "child"] as const) assert.equal((await f.send("admin/accounts", "POST", { username: role, name: "模拟" + role, role, password }, admin.cookie)).status, 200);
    const parent = await f.login("parent"), child = await f.login("child");
    assert.equal((await f.send("admin/overview", "GET", undefined, parent.cookie)).status, 200);
    assert.deepEqual((await f.send("admin/overview", "GET", undefined, parent.cookie)).data.knowledge, { rules: [], corrections: [], history: [] });
    assert.equal((await f.send("admin/accounts", "GET", undefined, parent.cookie)).status, 403);
    assert.equal((await f.send("admin/limits", "PATCH", { chat: 99, asr: 99, tts: 99 }, parent.cookie)).status, 403);
    assert.equal((await f.send("admin/overview", "GET", undefined, child.cookie)).status, 403);
    assert.equal((await f.send("admin/accounts", "POST", { username: "CHILD", name: "重名", role: "child", password }, admin.cookie)).status, 409);
    assert.equal(f.accounts.list().length, 3);
  } finally { await f.cleanup(); }
});

test("password reset and disable invalidate devices; live role is rechecked, and administrator cannot remove the last admin", async () => {
  const f = await fixture(); try {
    const admin = await f.bootstrap();
    const member = (await f.send("admin/accounts", "POST", { username: "parent", name: "模拟家长", role: "parent", password }, admin.cookie)).data;
    const signed = await f.login("parent");
    assert.equal((await f.send("admin/accounts/" + member.id, "PATCH", { name: "模拟孩子", role: "child", active: true }, admin.cookie)).status, 200);
    assert.equal((await f.send("admin/overview", "GET", undefined, signed.cookie)).status, 403);
    assert.equal((await f.send("status", "GET", undefined, signed.cookie)).data.viewer.role, "child");
    const newPassword = "changed-synthetic-password";
    assert.equal((await f.send("admin/accounts/" + member.id, "PATCH", { name: "模拟孩子", role: "child", active: true, password: newPassword }, admin.cookie)).status, 200);
    assert.equal((await f.send("status", "GET", undefined, signed.cookie)).data.authenticated, false);
    assert.equal((await f.login("parent")).status, 401);
    const fresh = await f.login("parent", newPassword); assert.equal(fresh.status, 200);
    await f.send("admin/accounts/" + member.id, "PATCH", { name: "模拟孩子", role: "child", active: false }, admin.cookie);
    assert.equal((await f.send("status", "GET", undefined, fresh.cookie)).data.authenticated, false);
    assert.equal((await f.send("admin/accounts/" + admin.data.viewer.id, "PATCH", { name: "模拟家长", role: "child", active: false }, admin.cookie)).status, 409);
    assert.equal(f.accounts.profile(admin.data.viewer.id)?.role, "admin");
  } finally { await f.cleanup(); }
});

test("legacy access can be closed only after a child account exists and old sessions stay revoked when reopened", async () => {
  const f = await fixture(); try {
    const old = await f.send("session", "POST", { code }), admin = await f.bootstrap();
    assert.equal((await f.send("admin/legacy-access", "PATCH", { enabled: false }, admin.cookie)).status, 409);
    await f.send("admin/accounts", "POST", { username: "child", name: "模拟孩子", role: "child", password }, admin.cookie);
    assert.equal((await f.send("admin/legacy-access", "PATCH", { enabled: false }, admin.cookie)).status, 200);
    assert.equal((await f.send("status", "GET", undefined, old.cookie)).data.authenticated, false);
    assert.equal((await f.send("session", "POST", { code })).status, 401);
    assert.equal((await f.login("child")).status, 200);
    await f.send("admin/legacy-access", "PATCH", { enabled: true }, admin.cookie);
    assert.equal((await f.send("status", "GET", undefined, old.cookie)).data.authenticated, false);
  } finally { await f.cleanup(); }
});

test("daily limits persist without resetting usage or deleting existing legacy sessions", async () => {
  const f = await fixture(); try {
    const legacy = f.sessions.createSession(); f.sessions.reserve("chat", legacy);
    const admin = await f.bootstrap();
    assert.equal((await f.send("admin/limits", "PATCH", { chat: 300, asr: 120, tts: 120 }, admin.cookie)).status, 200);
    assert.equal(f.sessions.settings().usage.chat, 1);
    const reopened = new AssistantStore(f.directory); assert.equal(reopened.authenticate(legacy), true); assert.equal(reopened.settings().limits.chat, 300); assert.equal(reopened.settings().usage.chat, 1);
    assert.equal((await f.send("admin/limits", "PATCH", { chat: 0, asr: 120, tts: 120 }, admin.cookie)).status, 400);
    assert.equal((await f.send("admin/accounts", "GET", undefined, admin.cookie)).data.items.some((u: any) => "password_hash" in u), false);
  } finally { await f.cleanup(); }
});

test("racing first-admin requests consume setup once and leave no open transaction", async () => {
  const f = await fixture(); try {
    const value = { setupCode: f.setupCode, password, name: "模拟家长" };
    const results = await Promise.allSettled([f.accounts.bootstrap({ ...value, username: "admin-one" }), f.accounts.bootstrap({ ...value, username: "admin-two" })]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.filter(r => r.status === "rejected").length, 1);
    assert.equal(f.accounts.list().length, 1);
    f.accounts.db.exec("BEGIN IMMEDIATE"); f.accounts.db.exec("ROLLBACK");
    assert.equal(existsSync(join(f.directory, "parent-setup-code")), false);
  } finally { await f.cleanup(); }
});

test("two-character accounts can sign in, and parents change only their own password with current credentials", async () => {
  const f = await fixture(); try {
    const admin = await f.send("parent-setup", "POST", { setupCode: f.setupCode, username: "ab", name: "模拟管理员", password });
    assert.equal(admin.status, 200);
    assert.equal((await f.login("AB")).status, 200);
    assert.equal((await f.send("admin/accounts", "POST", { username: "x", name: "模拟", role: "parent", password }, admin.cookie)).status, 400);
    const member = await f.send("admin/accounts", "POST", { username: "cd", name: "模拟家长", role: "parent", password }, admin.cookie);
    assert.equal(member.status, 200);
    const parent = await f.login("CD"), another = await f.login("cd");
    const nextPassword = "new-synthetic-password";
    const change = { currentPassword: password, password: nextPassword };
    assert.equal((await f.send("admin/password", "PATCH", change)).status, 401);
    assert.equal((await f.send("admin/password", "PATCH", change, parent.cookie, { Origin: "https://other.test" })).status, 403);
    assert.equal((await f.send("admin/password", "PATCH", { ...change, id: admin.data.viewer.id }, parent.cookie)).status, 400);
    assert.equal((await f.send("admin/password", "PATCH", { ...change, currentPassword: "incorrect-password" }, parent.cookie)).status, 401);
    assert.equal((await f.send("status", "GET", undefined, parent.cookie)).data.authenticated, true);
    assert.equal((await f.send("admin/password", "PATCH", change, parent.cookie)).status, 200);
    for (const cookie of [parent.cookie, another.cookie]) assert.equal((await f.send("status", "GET", undefined, cookie)).data.authenticated, false);
    assert.equal((await f.login("cd")).status, 401);
    const fresh = await f.login("cd", nextPassword); assert.equal(fresh.status, 200);
    assert.equal(fresh.data.viewer.role, "parent");
    assert.equal((await f.send("admin/accounts", "GET", undefined, fresh.cookie)).status, 403);
    assert.equal((await f.send("admin/accounts", "GET", undefined, admin.cookie)).status, 200);
    assert.equal((await f.login("ab")).status, 200);
    assert.equal(f.accounts.db.prepare("SELECT COUNT(*) AS n FROM account_audit WHERE action='change-own-password'").get()!.n, 1);
    assert.equal(f.calls(), 0);
  } finally { await f.cleanup(); }
});


test("reading routes share account authentication; children can read and check in but cannot configure rules or approve rewards", async () => {
 const f = await fixture(); try {
  assert.equal((await f.send("reading/state")).status, 401);
  const admin=await f.bootstrap();
  for(const role of ["child","parent"] as const)await f.send("admin/accounts","POST",{username:role,name:"模拟"+role,role,password},admin.cookie);
  const child=await f.login("child"), parent=await f.login("parent");
  const book=await f.send("reading/books","POST",{title:"模拟阅读书",totalPages:100},child.cookie);assert.equal(book.status,200);
  const input={id:randomUUID(),version:0,bookId:book.data.id,date:f.reading.today(),startPage:1,endPage:5,minutes:10,summary:"我读到了人物遇到问题后如何寻求帮助。"};
  assert.equal((await f.send("reading/logs","POST",input,child.cookie)).data.pointsAdded,2);
  assert.equal((await f.send("reading/logs","POST",input,child.cookie)).data.pointsAdded,0);
  assert.equal((await f.send("reading/logs","POST",{...input,role:"admin"},child.cookie)).status,400);
  const rules={dailyPoints:3,backfillCounts:false,milestones:[]};
  assert.equal((await f.send("reading/rules","PATCH",rules,child.cookie)).status,403);
  assert.equal((await f.send("reading/rules","PATCH",rules,parent.cookie)).status,200);
  assert.equal((await f.send("reading/rules","PATCH",rules,parent.cookie,{Origin:"https://other.test"})).status,403);
  const reward=await f.send("reading/rewards","POST",{title:"模拟亲子活动",cost:2},parent.cookie);assert.equal(reward.status,200);
  assert.equal((await f.send("reading/rewards","POST",{title:"伪造奖励",cost:1},child.cookie)).status,403);
  const redemption=randomUUID();assert.equal((await f.send("reading/redemptions","POST",{id:redemption,rewardId:reward.data.id,revision:reward.data.revision},child.cookie)).status,200);
  assert.equal((await f.send("reading/redemptions/"+redemption,"PATCH",{status:"fulfilled"},child.cookie)).status,403);
  assert.equal((await f.send("reading/redemptions/"+redemption,"PATCH",{status:"approved"},parent.cookie)).status,200);
  assert.equal((await f.send("reading/redemptions/"+redemption,"PATCH",{status:"fulfilled"},parent.cookie)).status,200);
  const chat=await f.send("chat","POST",{question:"怎样修改阅读记录？",history:[],readingMode:true,readingLogId:input.id},child.cookie);assert.equal(chat.status,200);assert.equal(f.calls(),1);
  assert.equal((await f.send("reading/state","GET",undefined,child.cookie)).data.growth.balance,0);
  assert.equal((await f.send("reading/logs?date="+input.date,"GET",undefined,parent.cookie)).data.total,1);
 } finally {await f.cleanup();}
});

test("wish HTTP routes enforce login, child ownership, parent approval and CSRF; successful approval is an idempotent mall insert",async()=>{const f=await fixture();try{assert.equal((await f.send("reading/wishes","POST",{id:randomUUID(),title:"未登录"})).status,401);const admin=await f.bootstrap();for(const role of ["child","parent"] as const)await f.send("admin/accounts","POST",{username:role,name:"模拟"+role,role,password},admin.cookie);const child=await f.login("child"),parent=await f.login("parent");const input={id:randomUUID(),title:"一起看星星",description:"想和爸爸妈妈一起去"};assert.equal((await f.send("reading/wishes","POST",{...input,cost:1,status:"approved"},child.cookie)).status,400);assert.equal((await f.send("reading/wishes","POST",input,child.cookie)).data.status,"pending");assert.equal((await f.send("reading/wishes","POST",input,child.cookie)).data.id,input.id);const decision={status:"approved",title:"家庭观星夜",cost:3,note:"周末一起去"};assert.equal((await f.send("reading/wishes/"+input.id,"PATCH",decision,child.cookie)).status,403);assert.equal((await f.send("reading/wishes/"+input.id,"PATCH",decision,parent.cookie,{Origin:"https://other.test"})).status,403);assert.equal((await f.send("reading/wishes/"+input.id+"/withdraw","POST",{},parent.cookie)).status,403);assert.equal((await f.send("reading/wishes/"+input.id,"PATCH",decision,parent.cookie)).data.status,"approved");assert.equal((await f.send("reading/wishes/"+input.id,"PATCH",decision,admin.cookie)).data.status,"approved");const state=(await f.send("reading/state","GET",undefined,child.cookie)).data;assert.equal(state.wishes[0].rewardId,state.rewards[0].id);assert.equal(state.rewards.length,1);assert.equal(state.growth.balance,0);const w=await f.send("reading/wishes","POST",{id:randomUUID(),title:"另一个愿望"},child.cookie);assert.equal((await f.send("reading/wishes/"+w.data.id+"/withdraw","POST",{},child.cookie)).data.status,"withdrawn");assert.equal((await f.send("reading/wishes/"+w.data.id,"PATCH",decision,parent.cookie)).status,409);}finally{await f.cleanup();}});

test("children and parents can explicitly correct memo entries through authenticated same-origin HTTP without AI", async () => {
  const f = await fixture();
  try {
    const admin = await f.bootstrap();
    assert.equal((await f.send("admin/accounts", "POST", { username: "child", name: "模拟孩子", role: "child", password }, admin.cookie)).status, 200);
    const child = await f.login("child");
    const upload = f.homework.begin({ date, kind: "memo", files: [{ name: "synthetic.png", size: 100, sha256: "a".repeat(64) }] });
    f.homework.stored(upload.files[0].id, "image/png"); f.homework.finalize(upload.id); const job = f.homework.claim()!;
    const original = { date, readable: true, assignments: [{ subject: "数学", title: "练居", requirement: "练居", format: "written", evidence: [{ fileId: upload.files[0].id + "-p1", page: 1, excerpt: "练居" }] }], uncertainties: [] };
    f.homework.recognized(job, original, ["数学"], false, 100, "fixture");
    const context = (await f.send(`homework-context?date=${date}`, "GET", undefined, child.cookie)).data;
    const input = { requestId: randomUUID(), date, revision: context.revision, entryId: context.entries[0].entryId, entry: { subject: "数学", title: "练习册P74", requirement: "完成数学练习册第74页。", format: "written" } };
    assert.equal((await f.send("memo-entries/update", "POST", input)).status, 401);
    assert.equal((await f.send("memo-entries/update", "POST", input, child.cookie, { Origin: "https://other.test" })).status, 403);
    assert.equal((await f.send("memo-entries/update", "POST", { ...input, actor: "admin" }, child.cookie)).status, 400);
    const result = await f.send("memo-entries/update", "POST", input, child.cookie); assert.equal(result.status, 200);
    assert.equal((await f.send("memo-entries/update", "POST", input, child.cookie)).data.id, result.data.id);
    assert.equal((await f.send(`homework-context?date=${date}`, "GET", undefined, admin.cookie)).data.entries[0].title, "练习册P74");
    assert.equal(f.calls(), 0); assert.equal(f.homework.upload(upload.id)!.result, JSON.stringify(original));
    assert.equal((await f.send(`clarifications/${result.data.id}/undo`, "POST", {}, child.cookie)).status, 200);
  } finally { await f.cleanup(); }
});

test("homework reward settings require parent identity and same origin, persist across requests, and reject invalid amounts", async () => {
 const f = await fixture();
 try {
  const admin = await f.bootstrap();
  for (const [username, role] of [["child", "child"], ["parent", "parent"]] as const) assert.equal((await f.send("admin/accounts", "POST", { username, name: "模拟账号", role, password }, admin.cookie)).status, 200);
  const child = await f.login("child"), parent = await f.login("parent");
  assert.equal((await f.send("reading/homework-rules", "PATCH", { dailyPoints: 5 })).status, 401);
  assert.equal((await f.send("reading/homework-rules", "PATCH", { dailyPoints: 5 }, child.cookie)).status, 403);
  assert.equal((await f.send("reading/homework-rules", "PATCH", { dailyPoints: 5 }, parent.cookie, { Origin: "https://other.test" })).status, 403);
  assert.equal((await f.send("reading/homework-rules", "PATCH", { dailyPoints: 2.5 }, parent.cookie)).status, 400);
  assert.equal((await f.send("reading/homework-rules", "PATCH", { dailyPoints: 3 }, parent.cookie)).status, 200);
  assert.equal((await f.send("reading/state", "GET", undefined, child.cookie)).data.homeworkRewardRules.dailyPoints, 3);
  assert.equal((await f.send("reading/homework-rules", "PATCH", { dailyPoints: 0 }, admin.cookie)).status, 200);
  assert.equal((await f.send("reading/state", "GET", undefined, parent.cookie)).data.homeworkRewardRules.dailyPoints, 0);
  assert.equal(f.calls(), 0); assert.equal(f.reading.balance(), 0);
 } finally { await f.cleanup(); }
});


test("parents and admins can set persistent homework AI quotas, while children and cross-origin requests cannot", async () => {
  const f = await fixture(); try {
    const admin = await f.bootstrap();
    for (const role of ["parent", "child"] as const) await f.send("admin/accounts", "POST", { username: role, name: "模拟" + role, role, password }, admin.cookie);
    const parent = await f.login("parent"), child = await f.login("child");
    assert.equal((await f.send("admin/overview", "GET", undefined, parent.cookie)).data.homeworkQuota.limit, 100);
    assert.equal((await f.send("admin/homework-quota", "PATCH", { dailyCalls: 150 })).status, 401);
    assert.equal((await f.send("admin/homework-quota", "PATCH", { dailyCalls: 150 }, child.cookie)).status, 403);
    assert.equal((await f.send("admin/homework-quota", "PATCH", { dailyCalls: 150 }, parent.cookie, { Origin: "https://other.test" })).status, 403);
    for (const body of [{ dailyCalls: 0 }, { dailyCalls: 5001 }, { dailyCalls: 1.5 }, { dailyCalls: "150" }, { dailyCalls: 150, extra: true }]) assert.equal((await f.send("admin/homework-quota", "PATCH", body, parent.cookie)).status, 400);
    for (let i = 0; i < 60; i++) f.homework.reserve();
    const usage = (await f.send("admin/overview", "GET", undefined, parent.cookie)).data.homeworkUsage;
    assert.equal(usage.total, 60); assert.equal(usage.untracked, 60); assert.equal(usage.tracked, 0);
    assert.equal((await f.send("admin/overview", "GET", undefined, child.cookie)).status, 403);
    assert.equal((await f.send("learning/state?date=" + date, "GET", undefined, child.cookie)).data.homeworkUsage, undefined);
    const saved = await f.send("admin/homework-quota", "PATCH", { dailyCalls: 150 }, parent.cookie);
    assert.equal(saved.status, 200); assert.equal(saved.data.limit, 150); assert.equal(saved.data.calls, 60);
    assert.equal((await f.send("learning/state?date=" + date, "GET", undefined, child.cookie)).data.quota.limit, 150);
    assert.equal((await f.send("admin/homework-quota", "PATCH", { dailyCalls: 50 }, admin.cookie)).data.calls, 60);
    assert.throws(() => f.homework.reserve(), /限额/);
    assert.equal((await f.send("admin/limits", "PATCH", { chat: 5000, asr: 30, tts: 40 }, parent.cookie)).status, 403, "Other administrator settings remain restricted");
  } finally { await f.cleanup(); }
});

test("children can confirm nonwritten work with their server identity; login, origin, current requirements and strict input remain enforced", async()=>{
 const f=await fixture();try{
  const admin=await f.bootstrap();await f.send("admin/accounts","POST",{username:"child",name:"模拟孩子",password,role:"child"},admin.cookie);const session=await f.login("child");
  const u=f.homework.begin({date,kind:"memo",files:[{name:"synthetic.png",size:1,sha256:"b".repeat(64)}]});const file=u.files[0];f.homework.stored(file.id,"image/png");f.homework.setPages(file.id,[{id:file.id+'-p1',file_id:file.id,number:1}]);f.homework.finalize(u.id);const job=f.homework.claim()!;
  f.homework.recognized(job,{date,readable:true,assignments:[{subject:"语文",title:"复习单元六",requirement:"复习单元六",format:"reading",evidence:[{fileId:file.id+'-p1',page:1,excerpt:"复习单元六"}]}],uncertainties:[]},["语文"],false,0,"");f.homework.db.exec("UPDATE jobs SET status='done'");
  const {DailyReportSchema}=await import("../src/domain/homework");const report=DailyReportSchema.parse({date,memoId:u.id,updatedAt:"",uncertainties:[],unassigned:[],tasks:[{id:u.id+':task:0',subject:"语文",title:"复习单元六",requirement:"复习单元六",format:"reading",memoEvidence:[],evidence:[],coverage:"none",missing:[]}]});
  f.homework.publish({id:-1,date,kind:"organize",upload_id:null,revision:f.homework.revision(date),attempts:1},report,"processed","");const task=f.homework.snapshot(date).report!.tasks[0];const input={date,taskId:task.id,token:task.completionToken,completed:true};
  assert.equal((await f.send('learning/task-completion','POST',input)).status,401);assert.equal((await f.send('learning/task-completion','POST',input,session.cookie,{Origin:'https://other.test'})).status,403);assert.equal((await f.send('learning/task-completion','POST',{...input,actor:'admin'},session.cookie)).status,400);
  assert.equal((await f.send('learning/task-completion','POST',input,session.cookie)).status,200);assert.equal((await f.send('learning/task-completion','POST',input,session.cookie)).status,200);
  const state=(await f.send('learning/state?date='+date,'GET',undefined,session.cookie)).data;assert.equal(state.report.tasks[0].selfCompletion.confirmedBy,'模拟孩子');assert.equal(state.report.tasks[0].selfCompletion.role,'child');assert.equal(f.calls(),0);
 }finally{await f.cleanup();}
});

test("book metadata HTTP editing is authenticated, same-origin, versioned and available to child and parent",async()=>{const f=await fixture();try{
 const admin=await f.bootstrap();for(const role of ["child","parent"] as const)await f.send("admin/accounts","POST",{username:role,name:"模拟"+role,role,password},admin.cookie);
 const child=await f.login("child"),parent=await f.login("parent"),book=(await f.send("reading/books","POST",{title:"模拟书名",totalPages:100},child.cookie)).data;
 const path="reading/books/"+book.id,edit={title:"修改后的书名",author:"作者",publisher:"出版社",isbn:"",totalPages:120,revision:book.revision};
 assert.equal((await f.send(path)).status,401);assert.equal((await f.send(path,"PATCH",edit)).status,401);assert.equal((await f.send(path,"PATCH",edit,child.cookie,{Origin:"https://other.test"})).status,403);
 assert.equal((await f.send(path,"PATCH",{...edit,finished:true},child.cookie)).status,400);
 const saved=await f.send(path,"PATCH",edit,child.cookie);assert.equal(saved.status,200);assert.equal(saved.data.id,book.id);assert.equal((await f.send(path,"GET",undefined,parent.cookie)).data.title,edit.title);
 const conflict=await f.send(path,"PATCH",{...edit,title:"过期修改"},parent.cookie);assert.equal(conflict.status,409);assert.equal(conflict.data.code,"BOOK_UPDATED");
 assert.equal((await f.send(path,"PATCH",{...edit,revision:saved.data.revision,totalPages:130},parent.cookie)).status,200);assert.equal(f.reading.snapshot(child.data.viewer).books.length,1);assert.equal(f.calls(),0);
 }finally{await f.cleanup();}});

test("book lookup reports invalid ISBN before spending quota; successful empty search is not a service error",async()=>{
 const f=await fixture();try{
  const admin=await f.bootstrap();
  const invalid=await f.send("reading/lookup","POST",{query:"01-2024-1017"},admin.cookie);
  assert.equal(invalid.status,200);assert.equal(invalid.data.status,"invalid_query");assert.match(invalid.data.note,/ISBN/);
  assert.equal(f.reading.db.prepare("SELECT count(*) AS n FROM lookup_budget").get()!.n,0);
  const absent=await f.send("reading/lookup","POST",{query:"模拟书名"},admin.cookie);
  assert.equal(absent.data.status,"not_found");assert.match(absent.data.note,/暂没查到/);
  assert.equal(f.reading.db.prepare("SELECT calls FROM lookup_budget").get()!.calls,1);assert.equal(f.calls(),0);
 }finally{await f.cleanup();}
});

test("children and parents share no-homework settings; login, same origin and strict inputs remain required", async () => {
 const f=await fixture();try {
  assert.equal((await f.send("learning/day-plan","POST",{date:"2026-11-23",noHomework:true})).status,401);
  const admin=await f.bootstrap();
  for(const role of ["child","parent"] as const)await f.send("admin/accounts","POST",{username:role,name:"模拟"+role,role,password},admin.cookie);
  const child=await f.login("child"),parent=await f.login("parent");
  assert.equal((await f.send("learning/day-plan","POST",{date:"2026-11-23",noHomework:false},child.cookie,{Origin:"https://other.test"})).status,403);
  assert.equal((await f.send("learning/day-plan","POST",{date:"2026-11-23",noHomework:false},child.cookie)).status,200);
  let state=await f.send("learning/state?date=2026-11-23","GET",undefined,parent.cookie);
  assert.equal(state.data.dayPlan.noHomework,false);assert.equal(state.data.dayPlan.source,"date");
  assert.equal((await f.send("learning/day-plan","POST",{date:"2026-11-23",noHomework:null,weekdays:[2]},parent.cookie)).status,200);
  state=await f.send("learning/state?date=2026-11-24","GET",undefined,child.cookie);
  assert.equal(state.data.dayPlan.noHomework,true);assert.deepEqual(state.data.dayPlan.weekdays,[2]);
  assert.equal((await f.send("learning/day-plan","POST",{date:"2026-02-30",weekdays:[1]},child.cookie)).status,400);
  assert.equal(f.calls(),0);
 }finally{await f.cleanup();}
});

test("each family member changes only their own avatar; preferences persist without role, password or session changes", async () => {
 const f=await fixture();try {
  assert.equal((await f.send("profile/avatar","PATCH",{avatar:"rabbit"})).status,401);
  const admin=await f.bootstrap();
  for(const role of ["child","parent"] as const)await f.send("admin/accounts","POST",{username:role,name:role==='parent'?"妈妈":"模拟孩子",role,password},admin.cookie);
  const child=await f.login("child"),parent=await f.login("parent");
  const oldChild=f.accounts.profile(child.data.viewer.id)!,oldParent=f.accounts.profile(parent.data.viewer.id)!;
  assert.equal(oldParent.avatar,"mom");assert.equal(oldChild.avatar,"rabbit");
  assert.equal((await f.send("profile/avatar","PATCH",{avatar:"cat"},child.cookie,{Origin:"https://other.test"})).status,403);
  for(const input of [{avatar:"unknown"},{avatar:"<svg onload=alert(1)>"},{avatar:"cat",id:parent.data.viewer.id},{avatar:"cat",role:"admin"}])assert.equal((await f.send("profile/avatar","PATCH",input,child.cookie)).status,400);
  const result=await f.send("profile/avatar","PATCH",{avatar:"cat"},child.cookie);assert.equal(result.status,200);assert.equal(result.data.id,oldChild.id);assert.equal(result.data.role,"child");assert.equal(result.data.avatar,"cat");
  assert.equal(f.accounts.profile(oldParent.id)!.avatar,"mom");
  assert.equal((await f.send("profile/avatar","PATCH",{avatar:"flower"},parent.cookie)).data.avatar,"flower");
  assert.equal((await f.send("profile/avatar","PATCH",{avatar:"cool"},admin.cookie)).data.avatar,"cool");
  const reopened=new Accounts(f.directory);try{assert.equal(reopened.profile(oldChild.id)!.avatar,"cat");assert.equal((await reopened.login("child",password))!.avatar,"cat");assert.equal(reopened.profile(oldParent.id)!.avatar,"flower");}finally{reopened.close();}
  const status=await f.send("status","GET",undefined,child.cookie);assert.equal(status.data.authenticated,true);assert.equal(status.data.viewer.avatar,"cat");
  assert.equal((await f.send("reading/state","GET",undefined,child.cookie)).data.viewer.avatar,"cat");
  assert.equal((await f.send("admin/overview","GET",undefined,child.cookie)).status,403);
  const legacy=await f.send("session","POST",{code});assert.equal((await f.send("profile/avatar","PATCH",{avatar:"cat"},legacy.cookie)).status,400);
  assert.equal(f.calls(),0);
 }finally{await f.cleanup();}
});

test("reward expiry is parent-controlled and enforced on the authenticated redemption API",async()=>{const f=await fixture();try{
 const admin=await f.bootstrap();for(const role of ["child","parent"] as const)await f.send("admin/accounts","POST",{username:role,name:"模拟"+role,role,password},admin.cookie);
 const child=await f.login("child"),parent=await f.login("parent");
 const book=await f.send("reading/books","POST",{title:"模拟书"},child.cookie);
 await f.send("reading/logs","POST",{id:randomUUID(),version:0,bookId:book.data.id,date:f.reading.today(),startPage:1,endPage:2,minutes:5,summary:"我读到朋友们一起想办法。"},child.cookie);
 assert.equal((await f.send("reading/rewards","POST",{title:"模拟过期电影",cost:1,expiresOn:"2020-01-01"},parent.cookie)).status,400);
 const legacyId=randomUUID();f.reading.db.prepare("INSERT INTO rewards VALUES(?,?,?,1,1)").run(legacyId,"模拟过期电影","");f.reading.db.prepare("INSERT INTO reward_deadlines VALUES(?,?)").run(legacyId,"2020-01-01");const reward={data:f.reading.shop.reward(legacyId)};
 assert.equal((await f.send("reading/rewards/"+reward.data.id,"PATCH",{title:"延期",cost:1,expiresOn:null},child.cookie)).status,403);
 assert.equal((await f.send("reading/rewards/"+reward.data.id,"PATCH",{title:"延期",cost:1,expiresOn:null},parent.cookie,{Origin:"https://other.test"})).status,403);
 const denied=await f.send("reading/redemptions","POST",{id:randomUUID(),rewardId:reward.data.id},child.cookie);assert.equal(denied.status,409);
 assert.equal((await f.send("reading/state","GET",undefined,child.cookie)).data.growth.balance,2);
 const renewed=await f.send("reading/rewards/"+reward.data.id,"PATCH",{title:"延期",cost:1,expiresOn:f.reading.today(),revision:reward.data.revision},parent.cookie);assert.equal(renewed.status,200);
 assert.equal((await f.send("reading/redemptions","POST",{id:randomUUID(),rewardId:reward.data.id,revision:renewed.data.revision},child.cookie)).status,200);
}finally{await f.cleanup();}});

test("growth setup and activity confirmation require parents, preserve quotes, enforce caps and use no AI",async()=>{const f=await fixture();try{
 const admin=await f.bootstrap();for(const role of ["child","parent"] as const)await f.send("admin/accounts","POST",{username:role,name:"模拟"+role,role,password},admin.cookie);const child=await f.login("child"),parent=await f.login("parent");
 assert.equal((await f.send("reading/economy/setup","POST",{},child.cookie)).status,403);
 assert.equal((await f.send("reading/economy/setup","POST",{},parent.cookie,{Origin:"https://other.test"})).status,403);
 const first=await f.send("reading/economy/setup","POST",{},parent.cookie);assert.equal(first.status,200);assert.equal(first.data.rewardIds.length,4);assert.equal((await f.send("reading/economy/setup","POST",{},parent.cookie)).data.alreadyInstalled,true);
 const input={id:randomUUID(),key:"housework",date:f.reading.today(),note:"叠衣服"};
 assert.equal((await f.send("reading/activities","POST",{...input,points:100},child.cookie)).status,400);
 assert.equal((await f.send("reading/activities","POST",input,child.cookie)).data.status,"pending");
 assert.equal((await f.send("reading/activities","POST",{...input,id:randomUUID()},child.cookie)).status,409);
 assert.equal((await f.send("reading/activities/"+input.id,"PATCH",{status:"approved"},child.cookie)).status,403);
 assert.equal((await f.send("reading/activities/"+input.id,"PATCH",{status:"approved"},parent.cookie,{Origin:"https://other.test"})).status,403);
 assert.equal((await f.send("reading/activities/"+input.id,"PATCH",{status:"approved"},parent.cookie)).status,200);
 await f.send("reading/activities/"+input.id,"PATCH",{status:"approved"},parent.cookie);
 const state=(await f.send("reading/state","GET",undefined,child.cookie)).data;assert.equal(state.growth.balance,1);assert.equal(state.rules.dailyPoints,1);
 const shop=state.rewards.find((r:any)=>r.kind==="shopping");
 assert.equal((await f.send("reading/redemptions","POST",{id:randomUUID(),rewardId:shop.id,amountCents:100},child.cookie)).status,409);
 const id=randomUUID();assert.equal((await f.send("reading/redemptions","POST",{id,rewardId:shop.id,revision:shop.revision,amountCents:100},child.cookie)).status,200);
 assert.equal((await f.send("reading/redemptions","POST",{id,rewardId:shop.id,revision:shop.revision,amountCents:100},child.cookie)).status,200);
 assert.equal((await f.send("reading/state","GET",undefined,child.cookie)).data.growth.balance,0);
 assert.equal((await f.send("reading/rewards/"+shop.id+"/history","GET",undefined,child.cookie)).status,200);
 assert.equal((await f.send("reading/rewards/"+shop.id+"/history","GET",undefined,parent.cookie)).data.items.length,1);
 assert.equal(f.calls(),0);
}finally{await f.cleanup();}});

test("student profile is private to authenticated family accounts and editable only by a parent",async()=>{const f=await fixture();try{const admin=await f.bootstrap();await f.send("admin/accounts","POST",{username:"child",name:"模拟孩子",role:"child",password},admin.cookie);const child=await f.login("child");const input={grade:4,semester:2,region:"模拟地区",school:"模拟学校"};assert.equal((await f.send("reading/student-profile","PATCH",input,child.cookie)).status,403);assert.equal((await f.send("reading/student-profile","PATCH",input,admin.cookie,{Origin:"https://other.test"})).status,403);const saved=await f.send("reading/student-profile","PATCH",input,admin.cookie);assert.equal(saved.status,200);assert.equal((await f.send("reading/state","GET",undefined,child.cookie)).data.studentProfile.school,input.school);assert.equal((await f.send("reading/student-profile","PATCH",{...input,grade:5},admin.cookie)).status,409);assert.equal((await f.send("reading/state")).status,401);}finally{await f.cleanup();}});

test("reading deletion requires login and same-origin; history and direct lookups exclude the deleted record",async()=>{
 const f=await fixture();try{
  const parent=await f.bootstrap(),viewer=(await f.send('status','GET',undefined,parent.cookie)).data.viewer;
  const book=f.reading.addBook({title:'模拟删除权限书'},viewer.id),input={id:randomUUID(),version:0,bookId:book.id,date:f.reading.today(),startPage:1,endPage:9,minutes:10,summary:'这是模拟阅读记录。'};
  const log=f.reading.save(input,viewer).log;
  assert.equal((await f.send(`reading/logs/${log.id}`,'DELETE',{version:1})).status,401);
  assert.equal((await f.send(`reading/logs/${log.id}`,'DELETE',{version:1},parent.cookie,{Origin:'https://other.test'})).status,403);
  assert.equal((await f.send(`reading/logs/${log.id}`,'DELETE',{version:1,actorId:viewer.id},parent.cookie)).status,400);
  assert.equal((await f.send(`reading/logs/${log.id}`,'DELETE',{version:1},parent.cookie)).status,200);
  assert.equal((await f.send(`reading/logs/${log.id}`,'DELETE',{version:1},parent.cookie)).data.deleted,true);
  assert.equal((await f.send(`reading/logs/${log.id}`,'GET',undefined,parent.cookie)).status,404);
  const history=await f.send(`reading/logs?date=${input.date}&bookId=${book.id}`,'GET',undefined,parent.cookie);assert.equal(history.status,200);assert.equal(history.data.total,0);assert.deepEqual(history.data.items,[]);
  assert.equal((await f.send('reading/logs','POST',input,parent.cookie)).status,409);
 }finally{await f.cleanup();}
});


test("reading history supports bounded pages and a lightweight latest record without changing full statistics", async () => {
 const f=await fixture();try{
  const admin=await f.bootstrap(),book=await f.send("reading/books","POST",{title:"分页测试书",totalPages:100},admin.cookie),today=f.reading.today(),yesterday=new Date(Date.parse(today+"T00:00:00Z")-86400000).toISOString().slice(0,10);
  for(let i=0;i<23;i++)f.reading.save({id:randomUUID(),version:0,bookId:book.data.id,date:i<12?today:yesterday,startPage:i+1,endPage:i+1,minutes:1,summary:`第${i}次虚构阅读。`},admin.data.viewer);
  assert.equal((await f.send("reading/logs?limit=10")).status,401);
  const get=async(query:string)=>(await f.send("reading/"+query,"GET",undefined,admin.cookie));
  const all=await get("logs"),first=await get("logs?limit=10"),second=await get("logs?limit=10&offset=10"),last=await get("logs?limit=10&offset=20");
  assert.equal(all.data.items.length,23);assert.equal(first.data.total,23);assert.equal(first.data.items.length,10);assert.equal(second.data.items.length,10);assert.equal(last.data.items.length,3);
  assert.deepEqual([...first.data.items,...second.data.items,...last.data.items].map((r:any)=>r.id),all.data.items.map((r:any)=>r.id));
  const filtered=await get(`logs?limit=10&date=${today}&bookId=${book.data.id}`);assert.equal(filtered.data.total,12);assert.equal(filtered.data.items.length,10);assert.ok(filtered.data.items.every((r:any)=>r.date===today&&r.bookId===book.data.id));
  const full=await get("state"),light=await get("state?logLimit=1");assert.equal(full.data.logs.length,23);assert.equal(light.data.logs.length,1);assert.equal(light.data.logs[0].id,first.data.items[0].id);assert.equal(light.data.hasMore,true);assert.deepEqual(light.data.stats,full.data.stats);assert.deepEqual(light.data.books,full.data.books);
  for(const limit of ["0","101","1.5","bad",""]){assert.equal((await get("logs?limit="+limit)).status,400);assert.equal((await get("state?logLimit="+limit)).status,400);}
  const target=first.data.items[0];assert.equal((await f.send("reading/logs/"+target.id,"DELETE",{version:target.version},admin.cookie)).status,200);const remaining=await get("logs?limit=10");assert.equal(remaining.data.total,22);assert.ok(remaining.data.items.every((r:any)=>r.id!==target.id));assert.equal(f.calls(),0);
 }finally{await f.cleanup();}
});
