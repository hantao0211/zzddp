// UI acceptance with invented records only. No real photos, credentials or model calls.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL, output = process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(":3443")); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--host-resolver-rules=MAP 14.103.24.55 127.0.0.1"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 670 }, isMobile: true, hasTouch: true });
  let pending = false, failed = false, photos = 0; const errors = []; page.on("pageerror", e => errors.push(e.message));
  const counts = { correct: 1, wrong: 1, blank: 1, uncertain: 1, feedback: 1 };
  const summary = () => ({ ...counts, enabled: true, pages: 1, finished: pending || failed ? 0 : 1, pending: pending ? 1 : 0, failed: failed ? 1 : 0, incomplete: 0, tasks: { "synthetic-task": { ...counts, pending: pending ? 1 : 0, failed: failed ? 1 : 0, incomplete: 0 } } });
  const q = (verdict, i) => ({ id: "synthetic-question-" + i, label: `第${i}题`, sourcePartLabels: [], kind: verdict === "feedback" ? "subjective" : "objective", question: i === 2 ? "2+3等于多少？" : "一道人造的模拟练习题", studentAnswer: i === 2 ? "6" : "模拟作答", expectedAnswer: i === 2 ? "5" : "模拟参考答案", verdict, confidence: verdict === "uncertain" ? "low" : "high", explanation: verdict === "uncertain" ? "两次解答没有取得一致，未直接判错。" : "先算2加2等于4，再加1得到5。", knowledgePoints: ["整数加法"], cause: "计算错误", causeExplanation: "从这次作答看，可能在相加时多算了1，不能据此断定是粗心。", nextStep: "用小棒分两步相加，再检查总数。", evidence: [{ fileId: "synthetic-page", page: 1, excerpt: "模拟作答" }], verification: verdict === "uncertain" ? "uncertain" : verdict === "feedback" ? "subjective" : "agreed" });
  const questions = ["correct", "wrong", "blank", "uncertain", "feedback"].map((s, i) => q(s, i + 1));
  let selectedDate = "";
  await page.route("**/assistant-api/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    const json = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    if (path.endsWith("/status")) return json({ authenticated: true, available: true, speech: true });
    if (path.endsWith("/memories")) return json({ items: [] });
    if (path.endsWith("/homework-context")) return json({ date: url.searchParams.get("date"), revision: 1, availableDates: [selectedDate], hasMaterials: true, pending: false, status: "processed", note: "", taskCount: 1, entries: [], familyNotes: [], uncertainties: [] });
    if (path.endsWith("/learning/state")) {
      const date = url.searchParams.get("date"); selectedDate = date;
      return json({ date, status: "processed", pending: false, note: "模拟资料", dates: [date], quota: { calls: 1, limit: 60 }, grading: summary(), writtenCompletionEnabled: true, uploads: [{ id: "synthetic-upload", date, kind: "memo", status: "processed", createdAt: "", subjects: ["数学"], note: "", aiMs: 0, issues: [], files: [{ id: "synthetic-file", name: "synthetic.png", size: 1, stored: true, pages: [] }] }], report: { date, memoId: "synthetic-upload", updatedAt: "", familyNotes: [], unclassified: [], unassigned: [], uncertainties: [], tasks: [{ id: "synthetic-task", title: "数学练习", subject: "数学", requirement: "完成模拟练习第12页", format: "written", memoEvidence: [], evidence: [], coverage: "complete", missing: [], reviewActivity: null, writtenCompletion: { version: "written-v2", status: "done", reason: "均有模拟作答", parts: [] } }] } });
    }
    if (path.endsWith("/learning/grading")) return json({ summary: summary(), batches: [{ id: "synthetic-run", title: "数学练习", subject: "数学", status: pending ? "queued" : failed ? "failed" : "done", note: failed ? "批改未完成，原件保留。" : "", primaryPageId: "synthetic-page", result: pending || failed ? null : { version: "grading-v1", scopeComplete: true, note: "", questions } }] });
    if (path.endsWith("/learning/mistakes")) return json({ total: url.searchParams.get("subject") === "英语" ? 0 : 1, items: url.searchParams.get("subject") === "英语" ? [] : [{ id: "synthetic-mistake", date: selectedDate, lastDate: selectedDate, subject: "数学", title: "数学练习", pageId: "synthetic-page", occurrences: 1, question: questions[1] }] });
    if (path.endsWith("/learning/grading/retry")) { failed = false; pending = true; return json({ queued: 1 }); }
    if (path.includes("/learning/pages/")) { photos++; return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA5sAAAAASUVORK5CYII=", "base64") }); }
    throw new Error("Unexpected simulated endpoint: " + path);
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "查看批改", exact: true }).click();
  const panel = page.getByRole("region", { name: "批改结果", exact: true });
  await panel.getByText("错误 · 已入错题本", { exact: true }).waitFor();
  assert.equal(await panel.locator(".grade-question").count(), 4);
  assert.equal(await panel.getByText("AI尚未确认", { exact: true }).count(), 1);
  assert.equal(photos, 0, "Original photos load only when requested");
  await panel.getByRole("button", { name: "全部题目", exact: true }).click();
  assert.equal(await panel.locator(".grade-question").count(), 5);
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 670 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal page overflow");
    await page.screenshot({ path: output + `/grading-${viewport.width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 670 });
  await page.getByRole("button", { name: "错题本", exact: true }).click();
  const book = page.getByRole("region", { name: "错题本", exact: true });
  await book.getByText("可能的错因 · 计算错误", { exact: true }).waitFor();
  assert.equal(await book.locator(".grade-question").count(), 1);
  await book.getByRole("button", { name: "查看原题照片", exact: true }).click(); await book.locator("img").waitFor();
  assert.equal(photos, 1);
  await book.getByRole("button", { name: "收起原图", exact: true }).click();
  await page.screenshot({ path: output + "/mistake-book-mobile.png", fullPage: true });
  await book.getByRole("button", { name: "英语", exact: true }).click();
  await book.getByText("目前没有已核验的错题。新上传作业批改后会自动整理到这里。", { exact: true }).waitFor();
  await book.getByRole("button", { name: "数学", exact: true }).click();
  await book.getByRole("button", { name: "让小步帮我弄懂", exact: true }).click();
  await page.locator("#assistant-question").waitFor();
  assert.match(await page.locator("#assistant-question").inputValue(), /第2题.*2\+3/);
  await page.getByRole("button", { name: "关闭小助手", exact: true }).click();
  failed = true; await page.getByRole("button", { name: "批改结果", exact: true }).click();
  await panel.getByRole("button", { name: "重试批改", exact: true }).click();
  await panel.getByText("AI正在批改或等待复核，完成后会自动更新。", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("GRADING_UI_OK=true daily-progress,all-verdicts,wrong-book,cause,next-step,subject-filter,lazy-private-photo,assistant-prefill,retry,mobile-and-desktop");
} finally { await browser.close(); }
