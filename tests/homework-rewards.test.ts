import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { isHomeworkDayComplete } from "../src/domain/homework-reward";
import { DailyReportSchema, type HomeworkSnapshot } from "../src/domain/homework";
import { readReviewPolicy } from "../src/domain/review-policy";
import { HomeworkStore } from "../src/server/homework/store";
import { HomeworkRewards } from "../src/server/homework/rewards";
import { ReadingStore } from "../src/server/reading/store";
import type { Viewer } from "../src/domain/accounts";
const day = "2026-11-20", child: Viewer = { id: "qa-child", username: "qa-child", name: "模拟孩子", role: "child" };
function fixture() {
 const root = mkdtempSync(join(tmpdir(), "xiaobu-homework-rewards-")); let time = Date.parse(day + "T10:00:00+08:00");
 const now = () => time, homework = new HomeworkStore(join(root, "homework"), now, readReviewPolicy({ ASSISTANT_REVIEW_TRACE_POLICY: "1" }), true);
 let reading = new ReadingStore(join(root, "reading"), now);
 const seed = (date = day) => {
  const memo = homework.begin({ date, kind: "memo", files: [{ name: "synthetic-memo.png", size: 1, sha256: "a".repeat(64) }] });
  homework.stored(memo.files[0].id, "image/png");
  homework.db.prepare("UPDATE uploads SET status='processed' WHERE id=?").run(memo.id);
  const report = DailyReportSchema.parse({ date, memoId: memo.id, updatedAt: "", tasks: [{ id: memo.id + ":task:0", subject: "数学", title: "数学P74", requirement: "数学第74页", format: "written", coverage: "complete", evidence: [{ fileId: "synthetic-homework-page", page: 1, excerpt: "模拟学生作答" }], memoEvidence: [], missing: [], writtenCompletion: { version: "written-v2", status: "done", reason: "都已作答，答案有错也算做完。", parts: [{ label: "1", status: "answered", evidence: { fileId: "synthetic-homework-page", page: 1, excerpt: "模拟作答" } }] } }], unclassified: [], uncertainties: [], unassigned: [] });
  homework.bump(date); homework.db.exec("UPDATE jobs SET status='done'");
  homework.publish({ id: -1, date, revision: homework.revision(date), kind: "organize", upload_id: null, attempts: 1 }, report, "processed", "Synthetic complete");
  return homework.snapshot(date);
 };
 return { root, homework, get reading() { return reading; }, now, seed, advance(date: string) { time = Date.parse(date + "T10:00:00+08:00"); }, reopen() { reading.close(); reading = new ReadingStore(join(root, "reading"), now); }, cleanup() { homework.close(); reading.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("daily homework reward needs actual completion, not receipt, correctness or a stale report", () => {
 const f = fixture();
 try {
  const snapshot = f.seed(); assert.ok(isHomeworkDayComplete(snapshot));
  const bad = (change: (s: HomeworkSnapshot) => void) => { const s = structuredClone(snapshot); change(s); assert.equal(isHomeworkDayComplete(s), false); };
  bad(s => s.pending = true); bad(s => s.status = "failed"); bad(s => s.status = "needs_rescan");
  bad(s => s.report!.tasks = []); bad(s => s.report!.unclassified.push({ title: "未知", requirement: "未知", evidence: [] }));
  bad(s => s.report!.tasks[0].coverage = "partial"); bad(s => s.report!.tasks[0].writtenCompletion = null);
  bad(s => s.report!.tasks[0].writtenCompletion!.status = "incomplete"); bad(s => s.report!.tasks[0].writtenCompletion!.status = "unclear");
  bad(s => delete s.report!.tasks[0].writtenCompletion!.version); bad(s => s.report!.memoId = "old-memo");
  const review = structuredClone(snapshot); review.report!.tasks[0] = { ...review.report!.tasks[0], subject: "语文", title: "预习第19课", format: "reading", writtenCompletion: null, reviewActivity: { status: "marked", reason: "有圈画" } };
  assert.ok(isHomeworkDayComplete(review));
  const missingReview = structuredClone(review); missingReview.report!.tasks[0].coverage = "uncertain"; missingReview.report!.tasks[0].requirement = "复习后完成练习册第77页"; missingReview.report!.tasks[0].missing = ["第77页未拍到"]; assert.equal(isHomeworkDayComplete(missingReview), false, "Visible review marks cannot reward a day with a concrete missing page");
  review.report!.tasks[0].reviewActivity!.status = "blank"; assert.equal(isHomeworkDayComplete(review), false);
 } finally { f.cleanup(); }
});

test("automatic credit is exactly one per assignment day, survives restart, and does not retroactively reward archives", () => {
 const f = fixture();
 try {
  f.seed("2026-11-19"); f.seed(); let rewards = new HomeworkRewards(f.homework, f.reading);
  rewards.tick(); rewards.tick(); assert.equal(f.reading.balance(), 1); assert.equal(f.reading.homeworkRewardStatus(day).earned, true);
  assert.equal(f.reading.homeworkRewardStatus("2026-11-19").eligible, false);
  assert.equal(f.reading.creditHomework(day, 2), 0); assert.equal(f.reading.creditHomework("2026-11-21", 1), 0);
  f.reopen(); rewards = new HomeworkRewards(f.homework, f.reading); rewards.tick(); assert.equal(f.reading.balance(), 1);
  f.advance("2026-11-21"); f.seed("2026-11-21"); rewards.tick(); assert.equal(f.reading.balance(), 2);
  const state = f.reading.snapshot(child); assert.equal(state.growth.earned, 2); assert.equal(state.stats.days, 0); assert.equal(state.stats.currentStreak, 0);
  assert.equal(state.growth.ledger.filter(l => l.kind === "homework").length, 2);
  assert.equal((f.reading.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action='homework-completed'").get() as { n: number }).n, 2);
 } finally { f.cleanup(); }
});

test("delivery waits for an unfinished day, reacts to corrected revisions and recovers from a temporary ledger failure", () => {
 const f = fixture();
 try {
  const snapshot = f.seed(), report = snapshot.report!;
  report.tasks[0].writtenCompletion!.status = "incomplete";
  f.homework.publish({ id: -1, date: day, revision: f.homework.revision(day), kind: "organize", upload_id: null, attempts: 1 }, report, "processed", "Synthetic incomplete");
  const rewards = new HomeworkRewards(f.homework, f.reading); rewards.tick(); assert.equal(f.reading.balance(), 0);
  f.homework.bump(day); f.homework.db.exec("UPDATE jobs SET status='done'"); report.tasks[0].writtenCompletion!.status = "done";
  f.homework.publish({ id: -1, date: day, revision: f.homework.revision(day), kind: "organize", upload_id: null, attempts: 1 }, report, "processed", "Synthetic done");
  const original = f.reading.creditHomework.bind(f.reading); let fail = true;
  f.reading.creditHomework = (date, revision) => { if (fail) { fail = false; throw Error("Synthetic database retry"); } return original(date, revision); };
  assert.throws(() => rewards.tick()); rewards.tick(); assert.equal(f.reading.balance(), 1);
  // Later edits never claw back a spent reward and never create another credit for the day.
  f.homework.bump(day); rewards.tick(); assert.equal(f.reading.balance(), 1);
 } finally { f.cleanup(); }
});

test("homework and reading credits combine and can be redeemed with the existing family mall", () => {
 const f = fixture();
 try {
  f.seed(); new HomeworkRewards(f.homework, f.reading).tick();
  const book = f.reading.addBook({ title: "模拟阅读书", totalPages: 30 }, child.id);
  f.reading.save({ id: randomUUID(), version: 0, bookId: book.id, date: day, startPage: 1, endPage: 5, minutes: 10, summary: "今天读到主人公和朋友一起解决困难。" }, child);
  assert.equal(f.reading.balance(), 3); assert.equal(f.reading.snapshot(child).growth.earned, 3); assert.equal(f.reading.snapshot(child).stats.days, 1);
  const reward = f.reading.saveReward({ title: "一起画画", cost: 3 }, "qa-parent"); f.reading.redeem(randomUUID(), reward.id, child);
  assert.equal(f.reading.balance(), 0); assert.equal(f.reading.snapshot(child).growth.earned, 3);
 } finally { f.cleanup(); }
});

test("parents can change or disable homework rewards; earned amounts and reading rules stay unchanged", () => {
 const f = fixture(), parent: Viewer = { id: "qa-parent", username: "qa-parent", name: "模拟家长", role: "parent" };
 try {
  const readingRules = f.reading.rules(); f.seed(); const worker = new HomeworkRewards(f.homework, f.reading);
  assert.equal(f.reading.homeworkRewardRules().dailyPoints, 1);
  assert.throws(() => f.reading.setHomeworkRewardRules({ dailyPoints: 99 }, child));
  for (const dailyPoints of [-1, 1.5, 101, "3", null]) assert.throws(() => f.reading.setHomeworkRewardRules({ dailyPoints }, parent));
  assert.throws(() => f.reading.setHomeworkRewardRules({ dailyPoints: 3, extra: true }, parent));
  f.reading.setHomeworkRewardRules({ dailyPoints: 0 }, parent); worker.tick(); assert.equal(f.reading.balance(), 0); assert.equal(f.reading.homeworkRewardStatus(day).eligible, false);
  f.reading.setHomeworkRewardRules({ dailyPoints: 3 }, parent); worker.tick(); assert.equal(f.reading.balance(), 3);
  f.reading.setHomeworkRewardRules({ dailyPoints: 5 }, parent); worker.tick(); assert.equal(f.reading.balance(), 3); assert.equal(f.reading.homeworkRewardStatus(day).points, 3);
  f.reading.setHomeworkRewardRules({ dailyPoints: 0 }, parent); assert.equal(f.reading.homeworkRewardStatus(day).points, 3); assert.equal(f.reading.homeworkRewardStatus(day).earned, true);
  f.reopen(); assert.equal(f.reading.homeworkRewardRules().dailyPoints, 0); assert.deepEqual(f.reading.rules(), readingRules);
  f.reading.setHomeworkRewardRules({ dailyPoints: 5 }, parent); f.advance("2026-11-21"); f.seed("2026-11-21"); new HomeworkRewards(f.homework, f.reading).tick();
  assert.equal(f.reading.balance(), 8); assert.equal(f.reading.snapshot(child).homeworkRewardRules!.dailyPoints, 5);
  assert.equal(f.reading.homeworkRewardStatus(day).points, 3);
 } finally { f.cleanup(); }
});
