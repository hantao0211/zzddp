// Explicit, paid-API acceptance test with synthetic printed materials.
// Run against an isolated staging state directory, never a family's live records.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL;
assert.ok(base?.endsWith(":3443"), "Use the isolated acceptance endpoint");
const code = (await readFile(process.env.SMOKE_CODE_FILE, "utf8")).trim();
const output = process.env.SMOKE_OUTPUT_DIR, fixtures = process.env.SMOKE_FIXTURE_DIR;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--host-resolver-rules=MAP 14.103.24.55 127.0.0.1"] });
const timings = {}, errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 980 } });
  const page = await context.newPage(); page.on("pageerror", (e) => errors.push(e.message)); page.setDefaultTimeout(20000);
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByLabel("8位家庭访问码", { exact: true }).fill(code);
  await page.getByRole("button", { name: "进入学习空间", exact: true }).click();
  await page.locator(".hw-heading").waitFor();
  const date = await page.locator(".hw-date input").inputValue();
  async function state() { return page.evaluate(async (date) => { const r = await fetch(`/assistant-api/learning/state?date=${date}`); return r.json(); }, date); }
  async function waitQueue(phase) {
    const start = Date.now(); let last = "";
    for (;;) {
      const value = await state();
      const status = value.status + ":" + value.uploads.map((u) => u.status).join(",");
      if (status !== last) { console.log(`QA_PHASE=${phase} STATUS=${status}`); last = status; }
      if (!value.pending && !value.uploads.some((u) => ["uploading", "queued", "converting", "recognizing", "retrying"].includes(u.status))) { timings[phase] = Math.round((Date.now() - start) / 1000);
        await page.waitForFunction(() => !document.querySelector(".hw-home-status .spin"));
        return value; }
      if (Date.now() - start > 240000) throw new Error(`Queue timeout: ${JSON.stringify(value)}`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  async function upload(kind, names) {
    if (await page.locator(".hw-details-page").count()) await page.getByRole("button", { name: "返回首页", exact: true }).click();
    const choosing = page.waitForEvent("filechooser");
    await page.locator(".hw-upload-actions").getByRole("button", { name: kind === "memo" ? /^拍备忘录/ : /^交作业/ }).click();
    await (await choosing).setFiles(names.map((n) => join(fixtures, n)));
    const dialog = page.getByRole("dialog", { name: kind === "memo" ? "上传备忘录" : "交作业", exact: true });
    await dialog.getByRole("button", { name: "确认上传", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
  }
  await upload("homework", ["math32.png", "english.pdf"]);
  let result = await waitQueue("beforeMemo");
  assert.equal(result.status, "waiting_memo");
  assert.ok(result.uploads[0].subjects.includes("数学") && result.uploads[0].subjects.includes("英语"));
  assert.equal(result.uploads[0].files.find((f) => f.name === "english.pdf").pages.length, 1);
  await upload("memo", ["memo.png"]);
  result = await waitQueue("memoAndCheck");
  assert.equal(result.status, "processed", JSON.stringify(result));
  const math = result.report.tasks.filter((t) => t.subject === "数学");
  assert.ok(math.length > 0 && math.some((t) => t.coverage === "partial" || t.coverage === "none"), "page33 must remain missing");
  assert.ok(result.report.tasks.some((t) => t.subject === "英语"));
  assert.ok(result.report.tasks.filter((t) => t.format === "reading" || t.format === "oral").every((t) => t.coverage !== "complete"));
  await page.getByRole("button", { name: "查看详情", exact: true }).click();
  await page.screenshot({ path: join(output, "homework-partial-desktop.png"), fullPage: true });
  await upload("homework", ["math33.png"]);
  result = await waitQueue("supplementAndCheck");
  assert.equal(result.status, "processed", JSON.stringify(result));
  assert.ok(result.report.tasks.filter((t) => t.subject === "数学").every((t) => t.coverage === "complete"), JSON.stringify(result.report));
  assert.ok(result.report.tasks.every((t) => !("completed" in t)), "received materials must not imply grading/completion");
  const count = result.uploads.length, quota = result.quota.calls;
  await upload("homework", ["math33.png"]);
  result = await state(); assert.equal(result.uploads.length, count); assert.equal(result.quota.calls, quota);
  await page.reload({ waitUntil: "networkidle" }); await page.locator(".hw-heading").waitFor();
  assert.equal((await state()).uploads.length, count);
  await page.getByRole("button", { name: "查看详情", exact: true }).click();
  const nav=page.getByRole("navigation",{name:"学习资料导航"});
  const archive=nav.getByRole("button",{name:"历史资料",exact:true});
  if(!await archive.isVisible())await nav.getByRole("button",{name:"更多",exact:true}).click();
  await archive.click();
  await page.locator(".hw-file-row").filter({ hasText: "作业备忘录" }).click();
  const detail = page.getByRole("dialog", { name: "作业备忘录", exact: true });
  await detail.locator("img").first().waitFor();
  assert.ok(await detail.locator("img").first().evaluate((i) => i.complete && i.naturalWidth > 0));
  await detail.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "作业清单", exact: true }).click();
  await page.screenshot({ path: join(output, "homework-complete-desktop.png"), fullPage: true });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await context.storageState() });
  const phone = await mobile.newPage(); phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(base, { waitUntil: "networkidle" }); await phone.locator(".hw-heading").waitFor();
  assert.equal(await phone.locator(".hw-task").count(), 0);
  await phone.getByRole("button", { name: "查看详情", exact: true }).click();
  assert.equal(await phone.locator(".hw-task").count(), result.report.tasks.length);
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await phone.screenshot({ path: join(output, "homework-mobile.png"), fullPage: true });
  await phone.getByRole("button", { name: "退出家庭空间", exact: true }).click();
  await phone.getByLabel("8位家庭访问码", { exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle" }); await page.getByLabel("8位家庭访问码", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await writeFile(join(output, "homework-result.json"), JSON.stringify({ timings, calls: quota, uploads: count, report: result.report, checks: { beforeMemo: true, mixedSubjects: true, pdfConversion: true, partialCoverage: true, supplementCompletes: true, deduplication: true, reloadPersistence: true, sharedMobileRecords: true, privatePreview: true, sessionRevocation: true }, errors }, null, 2));
  console.log("BROWSER_HOMEWORK_SMOKE_OK=true " + JSON.stringify({ timings, calls: quota }));
} catch (e) { console.error(String(e.stack || e).split(code).join("[redacted]")); process.exitCode = 1; }
finally { await browser.close(); }
