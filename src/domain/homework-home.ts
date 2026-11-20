import type { HomeworkSnapshot } from "./homework";
import { needsReviewTraceUpdate } from "./review-policy";

export function homeworkHomeStatus(snapshot: HomeworkSnapshot | null): { text: string; help: boolean; busy: boolean } {
  if (!snapshot) return { text: "正在读取这一天的记录…", help: false, busy: true };
  if (!snapshot.uploads.length) return { text: "拍下照片，小步来整理。", help: false, busy: false };
  if (snapshot.uploads.some((u) => u.status === "uploading")) return { text: "还有照片没传完，重新选择原来的照片就能继续。", help: false, busy: false };
  if (snapshot.pending) return { text: "照片已收到，小步正在整理。", help: false, busy: true };
  if (snapshot.status === "failed" || snapshot.uploads.some((u) => u.status === "failed")) return { text: "有资料没整理好，找小步一起看看。", help: true, busy: false };
  if (!snapshot.uploads.some((u) => u.kind === "memo")) return { text: "作业已收到，补一张备忘录就能对照清单。", help: false, busy: false };
  const report = snapshot.report;
  if (report?.tasks.some(t => t.writtenCompletion?.status === "incomplete")) return { text: "还有题目没写完，可在详情查看具体题号。", help: true, busy: false };
  if (report?.tasks.some((t) => t.reviewActivity?.status === "blank")) return { text: "预习复习还有未动笔的内容，做好后再拍照。", help: false, busy: false };
  if (report?.tasks.some((t) => needsReviewTraceUpdate(t, snapshot.reviewPolicy))) return { text: "部分预习复习仍是旧结果，可在详情重新整理。", help: false, busy: false };
  if (report?.tasks.length && !report.unclassified.length && !report.unassigned.length && snapshot.status !== "needs_rescan" && !snapshot.uploads.some(u => u.status === "needs_rescan") && report.tasks.every(t => t.coverage === "complete" && (t.reviewActivity?.status === "marked" || t.writtenCompletion?.status === "done"))) {
    const grade = snapshot.grading;
    const text = !grade?.enabled ? "这一天的作业都已做完，答案对错还没批改。" : grade.pending ? "作业已做完，AI正在批改。" : grade.failed ? "作业已做完，有批改还没完成。" : grade.wrong ? `作业已做完，${grade.wrong}道错题已整理到错题本。` : grade.uncertain ? `作业已做完，有${grade.uncertain}题AI尚未确认。` : grade.finished ? "作业已做完，可以查看逐题批改结果。" : "这一天的作业都已做完。";
    return { text, help: false, busy: false };
  }
  if (snapshot.uploads.some((u) => u.status === "needs_rescan") || !report || report.uncertainties.length || report.unclassified.length || report.unassigned.length || report.tasks.some((t) => t.coverage === "uncertain" || t.reviewActivity?.status === "unclear" || t.writtenCompletion?.status === "unclear")) return { text: "有些内容还需要说明。", help: true, busy: false };
  const missing = report.tasks.filter((t) => t.coverage !== "complete").length;
  if (missing) return { text: `还有 ${missing} 项作业材料没收齐，可以继续交作业。`, help: false, busy: false };
  return { text: report.tasks.some((t) => t.reviewActivity?.status === "marked") ? "材料已收齐，预习复习也已见痕迹。" : report.tasks.length ? "这一天的作业材料已收齐。" : "备忘录已收到，和小步看看清单吧。", help: !report.tasks.length, busy: false };
}
