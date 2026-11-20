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
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-accounts-test-")), accounts = new Accounts(directory), sessions = new AssistantStore(directory), homework = new HomeworkStore(join(directory, "learning")); let calls = 0;
  const server = createAssistantServer({ origin, accessHash: salt + ":" + scryptSync(code, salt, 32).toString("hex"), accounts, store: sessions, learning: new HomeworkConversation(homework), homework: new HomeworkHTTP(homework), serviceInfo: { provider: "synthetic", model: "synthetic-model" }, ai: () => ({ async run(_task, schema) { calls++; return schema.parse({ answer: "模拟回答", spokenAnswer: "模拟回答", hint: null, followUpQuestion: null, sourceMaterialIds: [], clarification: null, memoryCandidates: [] }); } }) });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); const address = server.address(); assert.ok(address && typeof address !== "string");
  const port = address.port;
  let ip = 0;
  async function send(path: string, method = "GET", value?: unknown, cookie = "", extra: Record<string, string> = {}) {
    return new Promise<{ status: number; data: any; cookie: string }>((resolve, reject) => {
      const headers = { Host: "family.test", "X-Forwarded-Proto": "https", Origin: origin, "X-Real-IP": `192.0.2.${++ip}`, Cookie: cookie, "Content-Type": "application/json", ...extra };
      const request = httpRequest({ host: "127.0.0.1", port, path: "/assistant-api/" + path, method, headers }, response => { const chunks: Buffer[] = []; response.on("data", b => chunks.push(b)); response.on("end", () => resolve({ status: response.statusCode!, data: JSON.parse(Buffer.concat(chunks).toString()), cookie: response.headers["set-cookie"]?.[0]?.split(";")[0] || "" })); }); request.on("error", reject); request.end(value === undefined ? undefined : JSON.stringify(value));
    });
  }
  const setupCode = readFileSync(join(directory, "parent-setup-code"), "utf8").trim();
  async function bootstrap() { const result = await send("parent-setup", "POST", { setupCode, username: "admin", name: "模拟家长", password }); assert.equal(result.status, 200); return result; }
  async function login(username: string, pass = password) { return send("session", "POST", { username, password: pass }); }
  return { directory, accounts, sessions, homework, send, setupCode, bootstrap, login, calls: () => calls, async cleanup() { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); accounts.close(); homework.close(); rmSync(directory, { recursive: true, force: true }); } };
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
