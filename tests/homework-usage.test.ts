import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { HomeworkStore, type Job } from "../src/server/homework/store";
import { HomeworkExecution } from "../src/server/homework/execution";
import { AIServiceError } from "../src/server/ai/provider";
import { automaticAttemptLimit } from "../src/domain/homework-usage";
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "xiaobu-usage-")); let now = Date.parse("2026-11-23T15:59:00Z");
  let store = new HomeworkStore(dir, () => now);
  return { get store() { return store; }, nextDay() { now += 120_000; }, reopen() { store.close(); store = new HomeworkStore(dir, () => now); }, close() { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test("real requests are counted once, cached/shared work is free, failures are visible without raw material", async () => {
  const f = fixture(); let requests = 0;
  try {
    f.store.reserve(); // Pre-ledger usage must remain visible, never guessed or reset.
    const execution = new HomeworkExecution(f.store, () => ({ async run(_task, schema, metadata) { requests++; if (metadata === "fail") throw new AIServiceError("INVALID_ENVELOPE", true, "private-student-answer-or-key"); return schema.parse("ok"); } }));
    const context = { date: "2026-11-20", title: "数学 P74", runId: "synthetic-run", pageId: "synthetic-page", attempt: 2 };
    const ai = execution.forJob(undefined, undefined, context);
    await Promise.all([1, 2, 3].map(() => execution.cached("one-photo", () => ai.run("grade_homework", z.string(), {}))));
    await execution.cached("one-photo", () => { throw Error("must use cache"); });
    await assert.rejects(ai.run("verify_homework_grading", z.string(), "fail"));
    await ai.run("verify_homework_grading", z.string(), { source: { focus: true } });
    const usage = f.store.usage.summary();
    assert.equal(requests, 3); assert.equal(usage.total, 4); assert.equal(usage.tracked, 3); assert.equal(usage.untracked, 1);
    assert.equal(usage.returned, 2); assert.equal(usage.failed, 1); assert.equal(usage.running, 0);
    assert.deepEqual(new Set(usage.phases.map(row => row.phase)), new Set(["inspection", "verification", "focus"]));
    assert.deepEqual(usage.assignments.map(row => ({ ...row })), [{ date: "2026-11-20", title: "数学 P74", calls: 3, failed: 1 }]);
    assert.ok(usage.recent.every(call => call.attempt === 2));
    assert.match(usage.recent.find(call => call.status === "failed")!.reason, /格式/);
    assert.ok(!JSON.stringify(usage).includes("private-student"));
  } finally { f.close(); }
});
test("quota refusal, stale work and failed local image preparation never create a charged call", async () => {
  const f = fixture(); let requests = 0;
  try {
    const execution = new HomeworkExecution(f.store, () => ({ async run(_task, schema) { requests++; return schema.parse("ok"); } }));
    await assert.rejects(execution.forJob().run("extract_homework", z.string(), {}, () => { throw Error("local decode failure"); }));
    await assert.rejects(execution.forJob().run("extract_homework", z.string(), {}, Array.from({ length: 21 }, (_, i) => ({ fileId: "synthetic-" + i, mimeType: "image/jpeg" as const, base64: "YQ==" }))), /图片/);
    f.store.bump("2026-11-20"); const job = f.store.claim()!; f.store.bump(job.date);
    await assert.rejects(execution.forJob(job).run("organize_homework", z.string(), {}), /新资料/);
    assert.equal(f.store.quota().calls, 0); assert.equal(f.store.usage.summary().tracked, 0);
    f.store.setQuota({ dailyCalls: 1 }, "synthetic-parent");
    await execution.forJob().run("extract_homework", z.string(), {});
    await assert.rejects(execution.forJob().run("extract_homework", z.string(), {}), /限额/);
    assert.equal(requests, 1); assert.equal(f.store.usage.summary().tracked, 1);
  } finally { f.close(); }
});
test("calls crossing Beijing midnight belong to their start day; restart retains interrupted usage", () => {
  const f = fixture(); try {
    const id = f.store.usage.start("organize_homework", {}, { date: "2026-11-20", attempts: 1 } as Job);
    assert.equal(f.store.usage.summary().running, 1);
    f.nextDay(); f.store.usage.finish(id); assert.equal(f.store.usage.summary().total, 0);
    f.store.usage.start("grade_homework", {}, undefined, { date: "2026-11-20", title: "旧作业" });
    f.reopen(); const usage = f.store.usage.summary();
    assert.equal(usage.total, 1); assert.equal(usage.interrupted, 1); assert.equal(usage.running, 0);
    assert.equal(f.store.db.prepare("SELECT status FROM homework_ai_calls WHERE id=?").get(id)!.status, "returned");
  } finally { f.close(); }
});
test("malformed replies stop after one retry, without changing network backoff or manual retry caps", () => {
  const f = fixture(); try {
    f.store.bump("2026-11-20"); const job = f.store.claim()!;
    const run = { ...job, attempts: 2 };
    f.store.fail(run, "未完成", true, false, automaticAttemptLimit("INVALID_ENVELOPE"));
    assert.equal(f.store.db.prepare("SELECT status FROM jobs WHERE id=?").get(job.id)!.status, "failed");
    f.store.fail(run, "网络暂不可用", true, false, automaticAttemptLimit("NETWORK_ERROR"));
    assert.equal(f.store.db.prepare("SELECT status FROM jobs WHERE id=?").get(job.id)!.status, "queued");
  } finally { f.close(); }
});
