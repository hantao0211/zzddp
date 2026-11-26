// Browser-only UX checks. All files, records and replies below are invented; no AI calls.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL, output = process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(":3443")); await mkdir(output, { recursive: true });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA5sAAAAASUVORK5CYII=", "base64");
const picture = { name: "synthetic-homework.png", mimeType: "image/png", buffer: png };
const memoPicture = { ...picture, name: "synthetic-memo.png" };
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--host-resolver-rules=MAP 14.103.24.55 127.0.0.1"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 670 }, isMobile: true, hasTouch: true });
  const errors = [], created = [], sent = [], records = new Map(); let scenario = "empty", counter = 0;
  page.on("pageerror", e => errors.push(e.message));
  function snapshot(date) {
    const uploads = [...records.values()].filter(u => u.date === date);
    const tasks = [{ id: "synthetic-task", subject: ["marked", "blank"].includes(scenario) ? "语文" : "数学", title: ["marked", "blank"].includes(scenario) ? "预习第7课" : "数学练习第12页", requirement: ["marked", "blank"].includes(scenario) ? "预习第7课第10页，无额外书面要求" : "完成第12页练习。", format: "written", memoEvidence: [], evidence: [], missing: [], coverage: ["complete", "marked", "blank"].includes(scenario) ? "complete" : "uncertain", reviewActivity: ["marked", "blank"].includes(scenario) ? { status: scenario, reason: scenario === "marked" ? "学生有圈画和旁批" : "清晰页面没有动笔" } : null }];
    return { date, status: scenario === "empty" ? "empty" : scenario === "waiting" ? "waiting_memo" : scenario === "pending" ? "queued" : scenario === "failed" ? "failed" : "processed", note: "模拟资料状态的详细说明，只应该出现在详情。", pending: scenario === "pending", dates: [date, "2026-11-16"], quota: { calls: 0, limit: 60 }, reviewPolicy: { version: "review-traces-v1", description: "无额外书面要求的预习复习按可见痕迹判断。" }, uploads, report: ["complete", "uncertain", "pending", "failed", "marked", "blank"].includes(scenario) ? { date, memoId: uploads.find(u => u.kind === "memo")?.id || null, tasks, unclassified: [], familyNotes: [{ id: "synthetic-note", date, userQuote: "模拟家庭补充说明", title: "数学页码", createdAt: "2026-11-17T00:00:00Z" }], uncertainties: ["complete", "marked", "blank"].includes(scenario) ? [] : ["有一处模拟页码需要说明"], unassigned: [], updatedAt: "2026-11-17T00:00:00Z" } : null };
  }
  await page.route("**/assistant-api/**", async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path.endsWith("/reading/state")) return json(null);
    if (path.endsWith("/learning/state")) return json(snapshot(url.searchParams.get("date")));
 if(path.endsWith('/practice/exams'))return json({items:[],total:0});
    if (path.endsWith("/status")) return json({ authenticated: true, available: true, speech: true });
    if (path.endsWith("/memories")) return json({ items: [] });
    if (path.endsWith("/homework-context")) { const date = url.searchParams.get("date"); return json({ date, revision: 1, availableDates: [date], hasMaterials: true, pending: false, status: "processed", note: "Synthetic fixture", taskCount: 1, unclassifiedCount: 0, entries: [], uncertainties: [], familyNotes: [] }); }
    if (path.endsWith("/learning/uploads")) {
      const body = req.postDataJSON(); created.push(body); const id = "synthetic-upload-" + (++counter);
      const u = { ...body, id, status: "uploading", createdAt: "2026-11-17T00:00:00Z", subjects: [], aiMs: 0, issues: [], note: "模拟资料", files: body.files.map((f, i) => ({ ...f, id: `${id}-file-${i}`, stored: false, pages: [] })) };
      records.set(id, u); return json(u);
    }
    if (/\/learning\/files\//.test(path) && req.method() === "PUT") { sent.push(req.postDataBuffer()); return json({ stored: true }); }
    if (/\/learning\/uploads\/[^/]+\/finish$/.test(path)) { const id = path.split("/").at(-2), u = records.get(id); u.status = "queued"; u.files.forEach(f => f.stored = true); scenario = "pending"; return json(u); }
    if (path.endsWith("/learning/retry-day")) { scenario = "pending"; return json({ queued: true }); }
    throw new Error("Unexpected simulated endpoint: " + path);
  });
  await page.goto(base, { waitUntil: "networkidle" }); await page.locator(".hw-simple-home").waitFor();
  const date = await page.locator(".hw-simple-home input[type=date]").inputValue();
  assert.equal(await page.locator(".hw-primary-actions button").count(), 2);
  assert.equal(await page.locator(".hw-tabs,.hw-task,.hw-file-row,.hw-family-notes,.hw-tips").count(), 0);
  for (const viewport of [{ width: 390, height: 670 }, { width: 320, height: 568 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const controls = await page.locator(".hw-primary-actions").boundingBox();
    await page.screenshot({ path: output + `/simple-home-${viewport.width}.png` });
    assert.ok(controls.y + controls.height <= viewport.height - 45, `Primary controls below the fold: ${JSON.stringify(viewport)}`);
    for (const button of await page.locator(".hw-primary-actions button").all()) assert.ok((await button.boundingBox()).height >= 100);
    await page.screenshot({ path: output + `/simple-home-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 670 });
  async function choose(kind, files) {
    const choosing = page.waitForEvent("filechooser");
    await page.locator(".hw-primary-actions").getByRole("button", { name: kind === "memo" ? /^拍备忘录/ : /^交作业/ }).click();
    assert.equal(await page.locator(".hw-upload-form").count(), 0, "No intermediate form before the native picker");
    await (await choosing).setFiles(files);
    const dialog = page.getByRole("dialog", { name: kind === "memo" ? "上传备忘录" : "交作业", exact: true });
    await dialog.waitFor(); assert.equal(await dialog.locator("input[type=date],.hw-kind,select").count(), 0);
    assert.ok((await dialog.locator(".hw-upload-summary").innerText()).includes((await page.locator(".hw-simple-home input[type=date]").inputValue()).replaceAll("-", "/")));
    return dialog;
  }
  // A child can submit homework before any memo and add a scanned PDF in the same batch.
  let dialog = await choose("homework", [picture]);
  const adding = page.waitForEvent("filechooser"); await dialog.getByRole("button", { name: "继续添加", exact: true }).click();
  await (await adding).setFiles({ name: "synthetic-scan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 synthetic upload-protocol fixture") });
  assert.equal(await dialog.locator(".hw-chosen-files>div").count(), 2);
  await page.screenshot({ path: output + "/simple-upload-confirm.png" });
  await dialog.getByRole("button", { name: "确认上传", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
  assert.equal(created[0].kind, "homework"); assert.equal(created[0].date, date); assert.equal(created[0].files.length, 2);
  assert.match(created[0].files[0].sha256, /^[a-f0-9]{64}$/); assert.ok(sent[0].equals(png));
  await page.getByText("正在识别新照片，你可以继续交作业。", { exact: true }).waitFor();
  // Pending processing must suppress stale uncertainty from the previous report.
  assert.equal(await page.getByRole("button", { name: "和小步说说", exact: true }).count(), 0);
  scenario = "waiting"; await page.reload({ waitUntil: "networkidle" });
  await page.getByText("作业已收到，补一张备忘录就能对照清单。", { exact: true }).waitFor();
  const past = "2026-11-17";
  await page.locator(".hw-simple-home input[type=date]").fill(past);
  dialog = await choose("memo", [memoPicture]);
  await dialog.getByRole("button", { name: "确认上传", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
  assert.equal(created.at(-1).kind, "memo"); assert.equal(created.at(-1).date, past);
  scenario = "uncertain";
  await page.getByRole("button", { name: "查看详情", exact: true }).click();
  await page.getByRole("button", { name: "刷新作业状态", exact: true }).click();
  await page.locator(".hw-task").waitFor();
  await page.locator(".hw-family-notes button").click();
  assert.ok((await page.getByRole("dialog").innerText()).includes("模拟家庭补充说明"));
  await page.getByRole("dialog").getByRole("button",{name:"返回列表"}).click();
  const nav=page.getByRole("navigation",{name:"学习资料导航"});
  const archive=nav.getByRole("button",{name:"历史资料",exact:true});
  if(!await archive.isVisible())await nav.getByRole("button",{name:"更多",exact:true}).click();
  await archive.click();
  await page.getByLabel("有记录的日期").selectOption("2026-11-16");
  assert.equal(await page.locator(".hw-details-heading input").inputValue(), "2026-11-16");
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  assert.equal(await page.locator(".hw-simple-home input").inputValue(), "2026-11-16");
  // Uncertain and fully received materials use short home status, never a completion claim.
  await page.locator(".hw-simple-home input[type=date]").fill(past);
  await page.getByRole("button", { name: "和小步说说", exact: true }).waitFor();
  await page.screenshot({ path: output + "/simple-home-question.png" });
  await page.setViewportSize({ width: 320, height: 568 });
  const detailButton = await page.getByRole("button", { name: "查看详情", exact: true }).boundingBox();
  const helperButton = await page.getByRole("button", { name: "问问小步", exact: true }).boundingBox();
  const summaryRow = await page.locator(".hw-home-summary tbody tr").first().boundingBox();
  assert.ok(summaryRow.y < 568, "The first task starts on the small phone without opening Details");
  assert.ok(detailButton.x + detailButton.width <= helperButton.x || detailButton.y + detailButton.height <= helperButton.y || detailButton.y >= helperButton.y + helperButton.height, "Assistant must not overlap Details");
  await page.screenshot({ path: output + "/simple-home-question-small.png" });
  await page.setViewportSize({ width: 390, height: 670 });
  await page.getByRole("button", { name: "和小步说说", exact: true }).click();
  await page.locator("#assistant-question").waitFor();
  assert.equal(await page.getByLabel("讨论的作业日期", { exact: true }).inputValue(), past);
  await page.getByRole("button", { name: "关闭小助手", exact: true }).click();
  scenario = "complete";
  for (const u of records.values()) u.status = "processed";
  await page.getByRole("button", { name: "查看详情", exact: true }).click();
  await page.getByRole("button", { name: "作业清单", exact: true }).click();
  await page.getByRole("button", { name: "刷新作业状态", exact: true }).click();
  await page.getByText("已找到对应照片", { exact: true }).waitFor();
  assert.ok(!/\d+\/\d+/.test(await page.locator(".hw-task-card .section-heading").innerText()));
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await page.getByText("这一天的作业材料已收齐。", { exact: true }).waitFor();
  assert.ok(!/作业已完成|答案正确/.test(await page.locator(".hw-home-status").innerText()));
  dialog = await choose("homework", [{ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") }]);
  await dialog.getByRole("alert").waitFor(); assert.equal(await dialog.getByRole("button", { name: "确认上传", exact: true }).isDisabled(), true);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  for (const state of ["marked", "blank"]) {
    scenario = state;
    await page.getByRole("button", { name: "查看详情", exact: true }).click();
    await page.getByRole("button", { name: "作业清单", exact: true }).click();
    await page.getByRole("button", { name: "刷新作业状态", exact: true }).click();
    await page.getByText(state === "marked" ? "已做（有痕迹）" : "未做（无痕迹）", { exact: true }).waitFor();
    assert.ok((await page.locator(".hw-task-card .section-heading").innerText()).includes("共 1 项作业"));
    await page.locator(".hw-task").first().click();
    await page.getByRole("dialog").getByText(/完成情况 ·/).waitFor();
    await page.screenshot({ path: output + `/review-${state}-mobile.png`, fullPage: true });
    await page.getByRole("dialog").getByRole("button",{name:"返回列表"}).click();
    await page.getByRole("button", { name: "返回首页", exact: true }).click();
    if (state === "blank") await page.getByText("预习复习还有未动笔的内容，做好后再拍照。", { exact: true }).waitFor();
  }
  scenario = "complete";
  const homeworkTemplate = [...records.values()].find(u => u.kind === "homework");
  records.set("overview-homework", { ...homeworkTemplate, id: "overview-homework", date: past });
  let writtenState = null;
  const overviewRoute = async route => {
    const data = snapshot(new URL(route.request().url()).searchParams.get("date"));
    const written = data.report.tasks[0];
    if(scenario==="pending")written.coverage="complete"; // Preserve the last report while new files are queued.
    if (writtenState) {
      data.writtenCompletionEnabled = true;
      written.writtenCompletion = { status: writtenState, reason: writtenState === "done" ? "两题均已填写，尚未批改" : "第2题空白", parts: [{ label: "第1题", status: "answered", evidence: { fileId: "synthetic-page", page: 1, excerpt: "模拟答案" } }, { label: "第2题", status: writtenState === "done" ? "answered" : "blank", evidence: { fileId: "synthetic-page", page: 1, excerpt: "模拟第二题" } }] };
    }
    data.report.tasks = [
      { ...written, id: "overview-review", subject: "语文", title: "预习第7课", requirement: "预习第7课", format: "reading", writtenCompletion: null, reviewActivity: { status: "marked", reason: "模拟圈画" } },
      { ...written, id: "overview-blank", subject: "语文", title: "复习第6课", requirement: "复习第6课", format: "reading", writtenCompletion: null, reviewActivity: { status: "blank", reason: "模拟空白页面" } },
      written,
    ];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  };
  await page.route("**/assistant-api/learning/state**", overviewRoute);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".hw-simple-home input[type=date]").fill(past);
  const overview = page.getByRole("region", { name: "作业概况", exact: true });
  await overview.getByRole("cell", { name: "已做", exact: true }).waitFor();
  assert.equal(await overview.locator("tbody tr").count(), 3);
  assert.ok((await overview.innerText()).includes("备忘录：已上传1份"));
  await overview.getByRole("cell", { name: "未做", exact: true }).waitFor();
  await overview.getByRole("cell", { name: "尚未判断", exact: true }).waitFor();
  assert.equal(await page.locator(".hw-task,.hw-file-row").count(), 0);
  for (const viewport of [{ width: 390, height: 670 }, { width: 320, height: 568 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (viewport.width === 390) {
      const last = await overview.locator("tbody tr").last().boundingBox();
      await overview.locator("tbody tr").last().evaluate(row=>row.scrollIntoView({block:"center"}));const visibleLast=await overview.locator("tbody tr").last().boundingBox();assert.ok(visibleLast.y>=0&&visibleLast.y+visibleLast.height<viewport.height-80,"Every task can scroll into view above the bottom navigation without opening Details");
    }
    for (const row of await overview.locator("tbody tr").all()) {
      const rect = await row.boundingBox(); const helper = await page.getByRole("button", { name: "问问小步", exact: true }).boundingBox();
      assert.ok(helper.y >= viewport.height - 95 || helper.x < 190, "Assistant navigation stays at the edge rather than floating over rows");
    }
    await page.screenshot({ path: output + `/home-overview-${viewport.width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 670 });
  for (const state of ["done", "incomplete"]) {
    writtenState = state;
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".hw-simple-home input[type=date]").fill(past);
    await overview.getByRole("cell", { name: state === "done" ? "已做完" : "未做完", exact: true }).waitFor();
    await page.screenshot({ path: output + `/written-${state}-home.png`, fullPage: true });
    await page.getByRole("button", { name: "查看详情", exact: true }).click();
    await page.getByText(state === "done" ? "已做完（未批改）" : "未做完", { exact: true }).waitFor();
    if (state === "incomplete") { await page.locator(".hw-task").first().click(); await page.getByRole("dialog").locator("li").filter({hasText:/第2题.*未作答/}).first().waitFor(); }
  }
  scenario = "pending";
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".hw-simple-home input[type=date]").fill(past);
  await page.locator(".hw-summary-processing").waitFor();
  await overview.getByRole("cell", { name: "已做", exact: true }).waitFor();
  await overview.getByRole("cell", { name: "未做完", exact: true }).waitFor();
  assert.equal(await overview.getByRole("cell", { name: "整理中", exact: true }).count(), 0);
  await page.unroute("**/assistant-api/learning/state**", overviewRoute);
  scenario = "marked";
  await page.route("**/assistant-api/learning/state**", async route => {
    const data = snapshot(new URL(route.request().url()).searchParams.get("date"));
    data.report.tasks[0].reviewActivity = null;
    data.report.tasks[0].coverage = "uncertain";
    data.report.tasks[0].missing = ["纸面照片不能证明预习过程已完成。", "课本自带练习未见完成记录。"];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".hw-simple-home input[type=date]").fill(past);
  await page.getByText("部分预习复习仍是旧结果，可在详情重新整理。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "查看详情", exact: true }).click();
  await page.getByText("AI尚未按新规则判断", { exact: true }).waitFor();
  assert.ok(!(await page.locator(".hw-task").innerText()).includes("纸面照片不能证明"));
  assert.ok(!(await page.locator(".hw-task").innerText()).includes("课本自带练习未见完成"));
  await page.screenshot({ path: output + "/review-old-result-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("HOMEWORK_SIMPLE_UI_OK=true compact-mobile-and-desktop,native-picker-first,one-confirmation,no-repeat-kind-or-date,homework-before-memo,photo-and-pdf,byte-upload,date-preserved,details-history,assistant-context,pending-priority,no-false-completion,invalid-file");
} finally { await browser.close(); }
