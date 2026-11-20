// UI regression with synthetic responses only; no family code, real records or AI calls.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL, output = process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(":3443")); await mkdir(output, { recursive: true });
const date = "2026-11-18", errors = [];
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--host-resolver-rules=MAP 14.103.24.55 127.0.0.1"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on("pageerror", (e) => errors.push(e.message)); let mode = "answer", chats = 0, memories = [];
  await page.route("**/assistant-api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/memories")) return send({ items: memories });
    if (path.match(/\/memories\/[^/]+\/revoke$/)) { memories = []; return send({ revoked: true }); }
    if (path.endsWith("/reading/state")) return send(null);
    if (path.endsWith("/status")) return send({ available: true, authenticated: true, speech: true });
    if (path.endsWith("/homework-context")) return send({ date, revision: 1, availableDates: [date], hasMaterials: true, pending: false, status: "processed", note: "Synthetic fixture", taskCount: 0, unclassifiedCount: 0, entries: [], uncertainties: [], familyNotes: [{ id: "synthetic-note-1", userQuote: "模拟家庭说明一", canUndo: false }, { id: "synthetic-note-2", userQuote: "模拟家庭说明二", canUndo: false }] });
    if (path.endsWith("/learning/state")) return send({ date, status: "processed", note: "Synthetic fixture", report: null, uploads: [], dates: [date], quota: { calls: 0, limit: 60 }, pending: false });
    if (path.endsWith("/chat")) {
      chats++; const body = route.request().postDataJSON();
      assert.equal(body.studyDate, date);
      if (mode === "failure") return send({ error: "AI这次的回答格式不完整，本次未修改清单。请重新发送问题。", code: "INVALID_RESULT", requestId: "abcd1234" }, 503);
      if (mode === "teach") {
        memories = [{ id: "b9f9a557-6200-4e17-a8c9-d88f41f02560", kind: "memo_abbreviation", trigger: "预", subject: "语文", summary: "语文备忘录中的预加课号，表示预习对应课文。", sourceQuote: "预23是预习第23课，后面的数字是课号。", sourceDate: date, createdAt: "2026-11-18T00:00:00Z" }];
        return send({ id: "synthetic-teaching", answer: "这项说明已经聊清楚了。", spokenAnswer: "明白这个含义了。", memoriesSaved: memories, memoryNotices: [], changeStatus: "none" });
      }
      assert.equal(body.reviewPhotos, true);
      return send({ id: "synthetic-answer", answer: "这次提供的作业照片上能看到 Lesson 19；这是第19课的标题。具体作业要求还需结合备忘录确认。\n\n" + "我们可以先看清作业要求，再逐项检查。遇到不明白的地方，可以继续问小步。\n\n".repeat(8), spokenAnswer: "照片标题是第19课。", photoReview: { requested: true, providedPages: 2, totalAvailablePages: 2, unavailablePages: 0 }, changeStatus: "none" });
    }
    if (path.endsWith("/speech")) return send({ error: "朗读暂时失败，文字回答已保留，可以稍后再点朗读。", code: "SPEECH_HTTP_503", requestId: "abcd5678" }, 503);
    throw new Error("Unexpected test API path: " + path);
  });
  await page.goto(base + "/?assistant=1", { waitUntil: "networkidle" });
  const input = page.locator("#assistant-question"); await input.waitFor();
  for (const viewport of [{ width: 390, height: 670 }, { width: 375, height: 667 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(100);
    const panel = await page.locator(".assistant-dialog").boundingBox();
    if (viewport.width < 600) assert.ok(Math.abs(panel.width - viewport.width) < 1, "Phone chat should fill its width");
    assert.ok((await page.locator(".assistant-messages").boundingBox()).height >= panel.height * (viewport.height < 500 ? .58 : .68), "Default conversation must be the main area");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "更多功能", exact: true }).click();
  await page.getByLabel("重新查看当天照片（每次最多6页）", { exact: true }).check();
  await page.getByLabel("回答后朗读", { exact: true }).check();
  await page.getByRole("button", { name: "返回对话", exact: true }).click();
  await input.fill("你看看作业就知道了，作业里面有19。");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await page.locator(".assistant-photo-result").waitFor();
  await page.locator(".assistant-compose .form-error").filter({ hasText: "文字回答已保留" }).waitFor();
  assert.ok(await page.locator(".assistant-messages").innerText().then((s) => s.includes("Lesson 19")));
  assert.ok((await page.locator(".assistant-photo-result").innerText()).includes("2 页"));
  await page.screenshot({ path: output + "/photo-mobile-tts-failure.png" });
  mode = "failure"; const question = "系统还有哪里没看懂？"; await input.fill(question);
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await page.locator(".assistant-compose .form-error").filter({ hasText: "回答格式" }).waitFor();
  assert.equal(await input.inputValue(), question);
  assert.ok(!(await page.locator(".assistant-compose .form-error").innerText()).includes("语音故障"));
  assert.ok((await page.locator(".assistant-messages").innerText()).includes("Lesson 19"));
  const bounds = await page.locator(".assistant-dialog").boundingBox();
  assert.ok(bounds.x >= 0 && bounds.width <= 391 && bounds.height <= 845);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok((await page.locator(".assistant-messages").boundingBox()).height >= bounds.height * .6);
  for (const viewport of [{ width: 390, height: 670 }, { width: 375, height: 667 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(100);
    const dialog = await page.locator(".assistant-dialog").boundingBox();
    const conversation = await page.locator(".assistant-messages").boundingBox();
    await page.screenshot({ path: output + `/layout-${viewport.width}x${viewport.height}.png` });
    assert.ok(conversation.height >= dialog.height * (viewport.height < 500 ? .43 : .52), `Conversation too small at ${JSON.stringify(viewport)}: ${conversation.height}/${dialog.height}`);
    assert.ok(dialog.x >= -1 && dialog.y >= -1 && dialog.x + dialog.width <= viewport.width + 1 && dialog.y + dialog.height <= viewport.height + 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: output + `/layout-${viewport.width}x${viewport.height}.png` });
  }
  await page.setViewportSize({ width: 390, height: 670 });
  // Simulate the reduced visual viewport reported while the on-screen keyboard is open.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 360 });
    Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => 22 });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(100);
  const keyboardDialog = await page.locator(".assistant-dialog").boundingBox();
  const keyboardInput = await input.boundingBox();
  assert.ok(keyboardDialog.y >= 21 && keyboardDialog.y + keyboardDialog.height <= 383);
  assert.ok(keyboardInput.y + keyboardInput.height <= 383);
  assert.ok((await page.locator(".assistant-messages").boundingBox()).height >= 130);
  await page.screenshot({ path: output + "/layout-keyboard-viewport.png" });
  await page.evaluate(() => { delete visualViewport.height; delete visualViewport.offsetTop; visualViewport.dispatchEvent(new Event("resize")); });
  await input.fill("多行问题\n".repeat(15));
  assert.ok((await input.boundingBox()).height <= 105);
  await input.fill(question);
  await page.locator(".assistant-messages").evaluate((el) => el.scrollTop = 0);
  assert.ok((await page.locator(".assistant-messages").evaluate((el) => el.scrollTop)) === 0);
  await page.locator(".assistant-messages").evaluate((el) => el.scrollTop = el.scrollHeight);
  assert.ok((await page.locator(".assistant-messages").evaluate((el) => el.scrollTop)) > 0);
  await page.setViewportSize({ width: 390, height: 844 });
  console.log("ASSISTANT_LAYOUT_UI_OK=true conversation-majority,small-phone,landscape,desktop,keyboard-viewport,scroll,multiline-cap");
  assert.equal(chats, 2); assert.deepEqual(errors, []);
  await page.screenshot({ path: output + "/photo-mobile-chat-failure.png" });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  await page.getByRole("button", { name: "更多功能", exact: true }).click();
  await page.getByRole("button", { name: "复制对话", exact: true }).click();
  await page.getByText("已复制对话，可以粘贴到其他聊天。", { exact: true }).waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copied.includes("作业日期：" + date)); assert.ok(copied.includes("Lesson 19"));
  assert.ok(copied.includes(question)); assert.ok(copied.includes("abcd1234"));
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载文本", exact: true }).click();
  const download = await downloading;
  assert.ok(download.suggestedFilename().endsWith(date + ".txt"));
  const downloaded = await readFile(await download.path(), "utf8");
  assert.ok(downloaded.includes("Lesson 19")); assert.ok(downloaded.includes(question)); assert.ok(downloaded.includes("abcd1234"));
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new DOMException("Denied", "NotAllowedError"); } } }));
  await page.getByRole("button", { name: "复制对话", exact: true }).click();
  const manual = page.getByLabel("待复制的对话文本", { exact: true }); await manual.waitFor();
  assert.ok((await manual.inputValue()).includes("Lesson 19")); assert.ok((await manual.inputValue()).includes("abcd1234"));
  await page.screenshot({ path: output + "/export-mobile-fallback.png" });
  await page.getByRole("button", { name: "收起复制文本", exact: true }).click();
  assert.deepEqual(errors, []);
  console.log("ASSISTANT_EXPORT_UI_OK=true clipboard,download,error-context,manual-fallback,mobile");
  console.log("ASSISTANT_PHOTO_UI_OK=true checkbox,review-count,tts-keeps-text,failed-question-restored,mobile");
  mode = "teach";
  await page.getByLabel("回答后朗读", { exact: true }).uncheck();
  await page.getByRole("button", { name: "返回对话", exact: true }).click();
  await input.fill("预23是预习第23课，后面的数字是课号。");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await page.locator(".assistant-memory-receipt").waitFor();
  await page.setViewportSize({ width: 390, height: 670 });
  assert.ok((await page.locator(".assistant-messages").boundingBox()).height >= 670 * .7);
  await page.screenshot({ path: output + "/layout-mobile-final.png" });
  await page.getByRole("button", { name: "更多功能", exact: true }).click();
  assert.ok((await page.locator(".assistant-memory-list").innerText()).includes("1 条"));
  await page.reload({ waitUntil: "networkidle" }); await input.waitFor();
  await page.getByRole("button", { name: "更多功能", exact: true }).click();
  await page.locator(".assistant-memory-list > summary").click();
  assert.ok((await page.locator(".assistant-memory-list").innerText()).includes("预习对应课文"));
  await page.screenshot({ path: output + "/memory-mobile.png" });
  await page.getByRole("button", { name: "停用这条记忆", exact: true }).click();
  await page.locator(".assistant-memory-list").waitFor({ state: "detached" });
  assert.equal(memories.length, 0); assert.deepEqual(errors, []);
  console.log("ASSISTANT_MEMORY_UI_OK=true extracted-card,persisted-after-refresh,source,revoke");
} finally { await browser.close(); }
