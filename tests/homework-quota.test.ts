import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HomeworkStore } from "../src/server/homework/store";
const reason = "今天的AI整理限额已到，原件已保存，明天自动继续。";
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "xiaobu-quota-")); let now = Date.parse("2026-11-22T04:00:00Z");
  let store = new HomeworkStore(dir, () => now);
  return { store: () => store, nextDay() { now += 86400000; }, reopen() { store.close(); store = new HomeworkStore(dir, () => now); }, cleanup() { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test("homework defaults to 100 calls shared across homework dates, and resets by Shanghai processing day", () => {
  const f = fixture(); try {
    for (let i = 0; i < 100; i++) f.store().reserve();
    assert.throws(() => f.store().reserve(), /限额/);
    assert.equal(f.store().snapshot("2026-11-20").quota.limit, 100); assert.equal(f.store().snapshot("2026-11-21").quota.calls, 100);
    f.nextDay(); assert.equal(f.store().quota().calls, 0); f.store().reserve(); assert.equal(f.store().quota().calls, 1);
  } finally { f.cleanup(); }
});
test("raising and lowering the persisted quota never resets usage or retry attempts", () => {
  const f = fixture(); try {
    for (let i = 0; i < 60; i++) f.store().reserve();
    f.store().setQuota({ dailyCalls: 60 }, "synthetic-parent"); assert.throws(() => f.store().reserve());
    f.store().setQuota({ dailyCalls: 120 }, "synthetic-parent"); f.store().reserve(); f.reopen();
    assert.deepEqual(f.store().quota(), { day: "2026-11-22", calls: 61, limit: 120 });
    f.store().setQuota({ dailyCalls: 50 }, "synthetic-parent"); assert.equal(f.store().quota().calls, 61); assert.throws(() => f.store().reserve());
    for (const dailyCalls of [0, 5001, -1, 1.1, "100", null]) assert.throws(() => f.store().setQuota({ dailyCalls }, "synthetic-parent"));
    assert.equal(f.store().quota().limit, 50);
  } finally { f.cleanup(); }
});
test("available quota resumes old quota waits immediately, while preserving network backoff and failures", () => {
  const f = fixture(); try {
    const s = f.store(), midnight = Date.parse("2026-11-23T00:00:00+08:00"), retryAt = Date.parse("2026-11-22T04:01:00Z");
    s.setQuota({ dailyCalls: 60 }, "synthetic-parent"); for (let i = 0; i < 60; i++) s.reserve();
    s.db.prepare("INSERT INTO days(date,revision,status,note) VALUES(?,1,'retrying',?)").run("2026-11-20", reason);
    s.db.prepare("INSERT INTO jobs(key,kind,date,revision,status,attempts,next_at) VALUES('quota','organize','2026-11-20',1,'queued',2,?)").run(midnight);
    s.db.prepare("INSERT INTO jobs(key,kind,date,revision,status,attempts,next_at) VALUES('network','organize','2026-11-20',1,'queued',1,?)").run(retryAt);
    s.db.prepare("INSERT INTO jobs(key,kind,date,revision,status,attempts,next_at) VALUES('failed','organize','2026-11-20',1,'failed',3,?)").run(midnight);
    s.db.prepare("INSERT INTO grading_runs(id,date,primary_page_id,source,status,attempts,next_at,note,created_at,updated_at) VALUES('quota-grade','2026-11-20','p','{}','queued',2,?,'今天的AI额度已用完，批改会在明天继续，原件已保存。','','')").run(midnight);
    s.db.prepare("INSERT INTO homework_quota_waits(job_id) SELECT id FROM jobs WHERE key='quota'").run();
    s.setQuota({ dailyCalls: 100 }, "synthetic-parent");
    const row = (key: string) => s.db.prepare("SELECT status,attempts,next_at FROM jobs WHERE key=?").get(key);
    assert.deepEqual({ ...row("quota") }, { status: "queued", attempts: 2, next_at: 0 });
    assert.equal(row("network")!.next_at, retryAt); assert.equal(row("failed")!.status, "failed");
    assert.equal(s.db.prepare("SELECT next_at FROM grading_runs WHERE id='quota-grade'").get()!.next_at, 0); assert.equal(s.quota().calls, 60);
  } finally { f.cleanup(); }
});
test("upgrading a legacy 60-call day wakes its overnight wait under the new 100 default", () => {
  const f = fixture(); try {
    const s = f.store(); for (let i = 0; i < 60; i++) s.reserve();
    s.db.prepare("INSERT INTO days(date,revision,status,note) VALUES('2026-11-20',1,'retrying',?)").run(reason);
    s.db.prepare("INSERT INTO jobs(key,kind,date,revision,status,attempts,next_at) VALUES('legacy','organize','2026-11-20',1,'queued',2,?)").run(Date.parse("2026-11-23T00:00:00+08:00"));
    s.db.exec("DROP TABLE homework_quota_waits");
    f.reopen(); assert.equal(f.store().dailyCallLimit(), 100); assert.equal(f.store().claim()!.attempts, 3); assert.equal(f.store().quota().calls, 60);
  } finally { f.cleanup(); }
});

test("a real quota failure is tracked and resumes even after the day's note changes", () => {
  const f = fixture(); try {
    const s = f.store(); s.setQuota({ dailyCalls: 1 }, "synthetic-parent"); s.reserve(); s.bump("2026-11-20"); const job = s.claim()!;
    s.fail(job, reason, false, true);
    s.db.prepare("UPDATE days SET note='新资料等待整理' WHERE date='2026-11-20'").run();
    s.setQuota({ dailyCalls: 2 }, "synthetic-parent"); assert.equal(s.quota().calls, 1);
    const resumed = s.claim()!; assert.equal(resumed.id, job.id); assert.equal(resumed.attempts, 1);
  } finally { f.cleanup(); }
});
