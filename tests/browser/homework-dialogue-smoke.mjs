// Paid API test with synthetic archived recognition only. Never confirm against live family records.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const { chromium } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL;
assert.ok(base?.endsWith(":3443"), "Only isolated dialogue QA is allowed");
const code = (await readFile(process.env.SMOKE_CODE_FILE, "utf8")).trim();
const output = process.env.SMOKE_OUTPUT_DIR; await mkdir(output, { recursive: true });
const date = "2026-11-18", statement = "复9是语文复习第9课，请把这条改为复习语文第9课，数学作业保持原样。";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--host-resolver-rules=MAP 14.103.24.55 127.0.0.1"] });
const errors = []; let activePage;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 980 } });
  const page = await context.newPage(); activePage = page; page.on("pageerror", (e) => errors.push(e.message)); page.setDefaultTimeout(20000);
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByLabel("8位家庭访问码", { exact: true }).fill(code);
  await page.getByRole("button", { name: "进入学习空间", exact: true }).click(); await page.locator(".hw-heading").waitFor();
  await page.getByRole("button", { name: "小助手", exact: true }).click();
  await page.locator("#assistant-question").waitFor();
  assert.equal(await page.getByLabel("讨论的作业日期", { exact: true }).inputValue(), date, "empty today should visibly fall back to latest recorded day");
  await page.getByRole("button", { name: "关闭小助手", exact: true }).click();
  await page.locator(".hw-date input").fill(date); await page.getByRole("button", { name: "查看详情", exact: true }).click(); await page.locator(".hw-unclassified").waitFor();
  await page.getByRole("button", { name: "和小助手说说这些疑问", exact: true }).click();
  await page.locator("#assistant-question").waitFor();
  async function ask(question) {
    await page.locator("#assistant-question").fill(question);
    const response = page.waitForResponse((r) => r.url().endsWith("/assistant-api/chat") && r.request().method() === "POST", { timeout: 95000 });
    await page.getByRole("button", { name: "发送问题", exact: true }).click();
    const r = await response; assert.equal(r.status(), 200); return r.json();
  }
  const explain = await ask("这一天的作业，系统还有哪些疑问？");
  assert.ok(explain.answer.includes("复9"), "response must use the real synthetic unresolved entry"); assert.equal(explain.changeStatus, "none");
  const proposal = await ask(statement);
  assert.equal(proposal.changeStatus, "pending"); assert.equal(proposal.proposal.after.subject, "语文");
  assert.ok(proposal.proposal.after.requirement.includes("9"));
  const state = () => page.evaluate(async (date) => (await fetch(`/assistant-api/learning/state?date=${date}`)).json(), date);
  assert.equal((await state()).report.familyNotes.length, 0, "chat cannot write before confirmation");
  await page.locator(".assistant-proposal").waitFor();
  await page.locator(".assistant-proposal").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "dialogue-proposal-desktop.png") });
  await page.getByRole("button", { name: "确认修改并重新查缺", exact: true }).click();
  await page.waitForFunction(async (date) => { const s = await (await fetch(`/assistant-api/learning/state?date=${date}`)).json(); return !s.pending && s.report?.unclassified.length === 0 && s.report.familyNotes.length === 1; }, date, { timeout: 95000 });
  let saved = await state();
  assert.equal(saved.report.tasks.length, 2); assert.ok(saved.report.tasks.some((t) => t.subject === "数学" && t.requirement.includes("32")));
  assert.ok(saved.report.tasks.every((t) => t.coverage !== "complete"), "a family clarification is not proof of completed homework");
  await page.reload({ waitUntil: "networkidle" }); await page.locator(".hw-heading").waitFor();
  await page.getByRole("button", { name: "小助手", exact: true }).click(); await page.locator("#assistant-question").waitFor();
  await page.getByRole("button", { name: "更多功能", exact: true }).click();
  const records = page.locator(".assistant-saved-notes"); await records.locator("summary").click();
  await records.getByRole("button", { name: "撤销这次说明", exact: true }).waitFor();
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await context.storageState() });
  const phone = await phoneContext.newPage(); phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(base + "/?assistant=1", { waitUntil: "networkidle" }); await phone.locator("#assistant-question").waitFor();
  const bounds = await phone.locator(".assistant-dialog").boundingBox(); assert.ok(bounds.x >= 0 && bounds.width <= 391 && bounds.height <= 845);
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await phone.screenshot({ path: join(output, "dialogue-mobile.png") });
  await records.getByRole("button", { name: "撤销这次说明", exact: true }).click();
  await page.waitForFunction(async (date) => { const s = await (await fetch(`/assistant-api/learning/state?date=${date}`)).json(); return !s.pending && s.report?.unclassified.length === 1 && s.report.familyNotes.length === 0; }, date, { timeout: 95000 });
  assert.deepEqual(errors, []);
  await writeFile(join(output, "dialogue-result.json"), JSON.stringify({ readActualContext: true, visibleDateFallback: true, explanation: true, previewBeforeWrite: true, confirmAndRequeue: true, originalTaskPreserved: true, persistedAfterRefresh: true, mobileLayout: true, undoRestoresUnresolved: true, errors }, null, 2));
  console.log("HOMEWORK_DIALOGUE_BROWSER_OK=true context,explanation,preview,confirm,persist,mobile,undo");
} catch (e) { console.error(String(e.stack || e).split(code).join("[redacted]")); if (activePage) await activePage.screenshot({ path: join(output, "dialogue-failure.png") }).catch(() => {}); process.exitCode = 1; }
finally { await browser.close(); }
