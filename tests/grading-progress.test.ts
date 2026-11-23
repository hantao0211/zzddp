import assert from "node:assert/strict";
import test from "node:test";
import { gradingProgressText } from "../src/domain/grading-progress";

const paused = { status: "queued", note: "今天的AI额度已用完，批改会在明天继续，原件已保存。" };
test("quota-paused pages and a failed page never claim AI is currently running", () => {
  const message = gradingProgressText([paused, paused, paused, { status: "failed", note: "AI回复解析失败" }], 3)!;
  assert.match(message, /3页因AI额度用完而暂停/);
  assert.match(message, /额度恢复后自动继续/);
  assert.doesNotMatch(message, /正在批改|4页/);
});
test("mixed work describes quota, active requests, and queued retries separately", () => {
  const message = gradingProgressText([paused, { status: "running", note: "" }, { status: "queued", note: "稍后重试" }], 3)!;
  assert.match(message, /1页因AI额度用完而暂停/);
  assert.match(message, /1页正在批改或复核/);
  assert.match(message, /1页排队或等待重试/);
});
test("queued pages alone do not claim an active request", () => {
  assert.equal(gradingProgressText([{ status: "queued", note: "" }], 1), "1页排队或等待重试。完成后会自动更新。");
});
test("finished or failed work alone has no pending progress banner", () => {
  assert.equal(gradingProgressText([{ status: "failed", note: "" }, { status: "done", note: "" }], 0), null);
});
test("legacy summaries without detailed batches keep a neutral waiting message", () => {
  assert.equal(gradingProgressText([], 2), "还有2页等待处理，完成后会自动更新。");
});
