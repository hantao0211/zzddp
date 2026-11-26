// UI acceptance with invented records only. No real photos, credentials or model calls.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium, webkit } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL, output = process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(":3443")); await mkdir(output, { recursive: true });
const engine = process.env.SMOKE_BROWSER === "webkit" ? webkit : chromium;
const browser = await engine.launch({ headless: true, args: engine === chromium ? ["--no-sandbox"] : [] });
try {
  const page = await browser.newPage({ colorScheme:process.env.SMOKE_COLOR_SCHEME || 'light', viewport: { width: 390, height: 670 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
  let pending = false, failed = false, photos = 0, child = false, quotaPaused = false, partial = false; const errors = []; page.on("pageerror", e => errors.push(e.message));
  const counts = { passedWithNote: 1, correct: 2, wrong: 1, blank: 1, uncertain: 1, feedback: 1 };
  const summary = () => ({ ...counts, enabled: true, pages: 1, finished: pending || failed ? 0 : 1, pending: pending ? 1 : 0, failed: failed ? 1 : 0, incomplete: partial ? 1 : 0, tasks: { "synthetic-task": { ...counts, pending: pending ? 1 : 0, failed: failed ? 1 : 0, incomplete: 0 } } });
  const q = (verdict, i) => ({ id: "synthetic-question-" + i, label: `第${i}题`, sourcePartLabels: [], kind: verdict === "feedback" ? "subjective" : "objective", question: i === 2 ? "2+3等于多少？" : "一道人造的模拟练习题", studentAnswer: i === 2 ? "6" : "模拟作答", expectedAnswer: i === 2 ? "5" : "模拟参考答案", verdict, confidence: verdict === "uncertain" ? "low" : "high", explanation: verdict === "uncertain" ? "两次解答没有取得一致，未直接判错。" : "先算2加2等于4，再加1得到5。", knowledgePoints: ["整数加法"], cause: "计算错误", causeExplanation: "从这次作答看，可能在相加时多算了1，不能据此断定是粗心。", nextStep: "用小棒分两步相加，再检查总数。", evidence: [{ fileId: "synthetic-page", page: 1, excerpt: "模拟作答" }], verification: verdict === "uncertain" ? "uncertain" : verdict === "feedback" ? "subjective" : "agreed" });
  const questions = ["correct", "wrong", "blank", "uncertain", "feedback"].map((s, i) => q(s, i + 1));
  questions.push({ ...q("passedWithNote", 7), explanation: "两次核对的内容分别是整词和单字。" });
  questions[1].explanation += " 图片编号（synthetic-page），第2题。";
  const legacyLabels = [
    ["四、8", "第4大题 · 第8小题"],
    ["七、3", "第7大题 · 第3小题"],
    ["三、选择题第6题", "第3大题 · 第6小题 · 选择题"],
    ["四、 短语翻译 第4题 Translate the following paragraph", "第4大题 · 第4小题 · 短语翻译"],
    ["句型第2句 An example question", "第2句 · 句型"],
    ["没有题号的旧题", "题号未识别"],
  ];
  const longStem = "Translate the following practice question into your own words. Then check the example and write down your answer.";
  const fullAssignment = "模拟课外拓展习题（单词和课文默写之外的部分）";
  let selectedDate = "", blankVisible = true, extraWrong = false, many = false;
  const currentQuestions = () => [...questions.filter(q => blankVisible || q.verdict !== "blank"), ...(extraWrong ? [q("wrong", 6)] : []), ...(many ? Array.from({length:15},(_,i)=>q("correct",i+20)) : [])];
  let reviewPreview, signatureCase = false;
  await page.route("**/assistant-api/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    const json = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    if (path.endsWith("/practice/exams")) return json({items:[],total:0,stage:{grade:4,semester:1}});
    if (path.endsWith("/reading/state")) return json(null);
    if (path.endsWith("/status")) return json({ authenticated: true, available: true, speech: true, accounts: true, viewer: { id: "11111111-1111-4111-8111-111111111111", name: "模拟成员", username: "synthetic", role: child ? "child" : "admin" } });
    if (path.endsWith("/memories")) return json({ items: [] });
    if (path.endsWith("/homework-context")) return json({ date: url.searchParams.get("date"), revision: 1, availableDates: [selectedDate], hasMaterials: true, pending: false, status: "processed", note: "", taskCount: 1, entries: [], familyNotes: [], uncertainties: [] });
    if (path.endsWith("/learning/state")) {
      const date = url.searchParams.get("date"); selectedDate = date;
      return json({ date, status: "processed", pending: false, note: "模拟资料", dates: [date], quota: { calls: 1, limit: 60 }, grading: summary(), writtenCompletionEnabled: true, uploads: [{ id: "synthetic-upload", date, kind: "memo", status: "processed", createdAt: "", subjects: ["数学"], note: "", aiMs: 0, issues: [], files: [{ id: "synthetic-file", name: "synthetic.png", size: 1, stored: true, pages: [] }] }], report: { date, memoId: "synthetic-upload", updatedAt: "", familyNotes: [], unclassified: [], unassigned: [], uncertainties: [], tasks: [{ id: "synthetic-task", title: "数学练习", subject: "数学", requirement: "完成模拟练习第12页", format: "written", memoEvidence: [], evidence: [], coverage: "complete", missing: [], reviewActivity: null, writtenCompletion: { version: "written-v2", status: "done", reason: "均有模拟作答", parts: [] } }] } });
    }
    if (signatureCase && path.endsWith("/learning/grading")) {
      const signature = {...q("feedback",8),label:"家长签名",question:"请家长在本页签名。",studentAnswer:"模拟签名",expectedAnswer:"",explanation:"",knowledgePoints:[]};
      return json({summary:{...summary(),feedback:1,wrong:0},batches:[{id:"signature-run",title:"模拟作业",subject:"语文",status:"done",primaryPageId:"synthetic-page",
        reviewVersions:{[signature.id]:"c".repeat(64)},result:{version:"grading-v2",scopeComplete:true,note:"",questions:[signature]}}]});
    }
    if (path.endsWith("/learning/grading")) return json({ summary: summary(), batches: [{ id: "synthetic-run", title: "数学练习", subject: "数学", attempts: failed ? 3 : 1, retryAllowed: failed, failure: failed ? { code: "INVALID_ENVELOPE", stage: "verification", failedAt: "2026-11-21T14:58:51.833Z", source: "runtime", reason: "AI返回的内容未能正常解析，没能读到可用的批改回复。", nextStep: "原件已保存，不用重新上传。可以请家长重试。" } : null, status: pending ? "queued" : failed ? "failed" : "done", note: pending && quotaPaused ? "今天的AI额度已用完，批改会在明天继续，原件已保存。" : failed ? "批改未完成，原件保留。" : "", primaryPageId: "synthetic-page", reviewVersions: {"synthetic-question-4":"b".repeat(64)}, readings: { "synthetic-question-4": ["verification","focusOne","focusTwo"].map((stage,i)=>({stage,studentAnswer:i===0?"甲":"乙",expectedAnswer:"乙",confidence:i===1?"medium":"high",verdict:"correct",explanation:"模拟观察记录"})) }, result: pending || failed ? null : { version: "grading-v1", scopeComplete: !partial, note: "", questions: currentQuestions() } }, { id: "synthetic-english", title: "英语练习", subject: "英语", status: "done", note: "", primaryPageId: "synthetic-english-page", result: { version: "grading-v1", scopeComplete: true, note: "", questions: [q("correct", 7)] } }] });
    if (path.endsWith("/learning/mistakes")) {
      const subject = url.searchParams.get("subject");
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      assert.equal(limit, 10);
      const total = subject === "英语" ? 0 : subject === "数学" ? 1 : 301;
      const items = Array.from({ length: Math.min(limit, total - offset) }, (_, index) => {
        const number = offset + index + 2;
        const sample = legacyLabels[number - 4];
        const question = number === 2 ? questions[1] : q("wrong", number);
        if (sample) Object.assign(question, { label: sample[0], question: longStem });
        return { id: "synthetic-mistake-" + number, date: selectedDate, lastDate: selectedDate, subject: "数学",
          title: "已上传作业", provenance: { kind: "assignment", title: fullAssignment }, pageId: "synthetic-page",
          occurrences: 1, question };
      });
      return json({ total, items });
    }
    if (path.endsWith("/learning/grading/review")) {
      const payload = route.request().postDataJSON();
      assert.equal(payload.questionId,signatureCase ? "synthetic-question-8" : "synthetic-question-4");
      if (signatureCase) { assert.equal(payload.review.verdict,"record"); assert.equal(payload.review.correction,""); }
      assert.equal(payload.review.evidence,"模拟核对依据");
      reviewPreview={...payload.review,id:"synthetic-review",label:"第4题",applied:false};
      return json(reviewPreview);
    }
    if (path.endsWith("/learning/grading/confirm")) {
      assert.equal(route.request().postDataJSON().id,reviewPreview.id);
      return json({...reviewPreview,applied:true});
    }
    if (path.endsWith("/learning/grading/retry")) { failed = false; pending = true; return json({ queued: 1 }); }
    if (path.includes("/learning/pages/")) { photos++; return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA5sAAAAASUVORK5CYII=", "base64") }); }
    throw new Error("Unexpected simulated endpoint: " + path);
  });
  await page.goto(base, { waitUntil: "networkidle" });
  const dateBadge = page.locator(".study-heading-date");
  const dateInput = dateBadge.getByLabel("作业日期", { exact: true });
  const startingDate = await dateInput.inputValue();
  for (const [day, weekday, width] of [["2026-11-24", "周二", 320], ["2026-11-29", "周日", 390], ["2027-01-01", "周五", 1280]]) {
    await page.setViewportSize({ width, height: 670 });
    await dateInput.fill(day);
    await dateBadge.getByText(weekday, { exact: true }).waitFor();
    const fits = await dateBadge.evaluate(el => {
      const badge = el.getBoundingClientRect();
      const text = el.querySelector("time").getBoundingClientRect();
      return badge.width === 128 && badge.height === 44 && text.left >= badge.left && text.right <= badge.right && text.top >= badge.top && text.bottom <= badge.bottom;
    });
    assert.ok(fits, "The complete date and weekday fit inside the shared header badge");
  }
  await dateInput.fill(startingDate);
  await page.setViewportSize({ width: 390, height: 670 });
  await page.getByRole("button", { name: "查看批改", exact: true }).click();
  const panel = page.getByRole("region", { name: "批改结果", exact: true });
  const rows = panel.locator(".grade-result-row");
  const detail = page.getByRole("dialog",{name:"批改详情"});
  const categoryButton = label => panel.getByRole("group", {name:"按批改结果筛选"}).getByRole("button",{name:new RegExp("^" + label + " ")});
  const more = panel.getByRole("button",{name:"更多",exact:true});
  async function reveal(label) {
    const button = categoryButton(label);
    if (!await button.isVisible()) await more.click();
    await button.waitFor();
    return button;
  }
  const all = panel.getByRole("button",{name:"全部题目",exact:true});
  await rows.first().waitFor();
  assert.equal(await rows.count(),4);
  assert.equal(await panel.locator(".grade-question").count(),0);
  assert.equal(photos,0);
  const uncertain = rows.filter({hasText:"第4题"});
  await uncertain.click();
  await detail.getByText("AI 读到：甲 · 正确 · 把握高",{exact:true}).waitFor();
  await detail.getByRole("button",{name:"家长核对",exact:true}).click();
  await detail.getByLabel("核对依据").fill("模拟核对依据");
  await detail.getByRole("button",{name:"原题照片",exact:true}).click();
  await detail.getByRole("img").scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector(".grade-detail-dialog img")?.naturalWidth>0);
  await detail.getByRole("button",{name:"家长核对",exact:true}).click();
  assert.equal(await detail.getByLabel("核对依据").inputValue(),"模拟核对依据");
  await detail.getByRole("radio",{name:"错误",exact:true}).check();
  await detail.getByRole("button",{name:"预览更正"}).click();
  await detail.getByRole("button",{name:"确认更正这道题"}).click();
  await detail.getByText("已更正",{exact:true}).waitFor();
  await detail.getByRole("button",{name:"批改依据",exact:true}).click();
  await detail.getByRole("button",{name:"和小步聊这题"}).click();
  await page.getByRole("button",{name:"关闭小助手"}).click();
  await detail.getByRole("button",{name:"下一条"}).click();
  await detail.getByRole("heading",{name:"第5题"}).waitFor();
  await detail.getByRole("button",{name:"返回列表"}).click();
  await detail.waitFor({state:"hidden"});
  await page.waitForFunction(()=>document.activeElement?.classList.contains("grade-result-row"));
  await all.click();
  assert.equal(await rows.count(),7);
  for (const [label, count] of [["通过但存疑",1],["正确",2],["错误",1],["未作答",1],["未确认",1],["点评",1]]) {
    await (await reveal(label)).click();
    assert.equal(await rows.count(),count);
    assert.ok((await rows.locator(".grade-row-status").allTextContents()).every(text=>text===label));
    assert.equal(await panel.locator(".grade-list-group").count(),label==="正确"?2:1);
  }
  await (await reveal("点评")).click();
  assert.equal(await all.getAttribute("aria-pressed"),"true");
  await (await reveal("未批改")).click();
  await panel.getByText("暂无未批改的页面。").waitFor();
  partial = true;
  await rows.getByText("部分已批",{exact:true}).waitFor();
  assert.equal(await rows.count(),1);
  partial = false; blankVisible = false; counts.blank=0;
  await (await reveal("未作答")).click();
  await panel.getByText("暂无未作答的题目。").waitFor();
  await (await reveal("错误")).click();
  extraWrong=true; counts.wrong=2;
  await panel.getByText("只看错误 · 2题").waitFor();
  assert.equal(await rows.count(),2);
  await (await reveal("正确")).focus(); await page.keyboard.press("Enter");
  assert.equal(await categoryButton("正确").getAttribute("aria-pressed"),"true");
  many=true; counts.correct+=15;
  await all.click();
  await panel.getByText("全部题目 · 22题").waitFor();
  assert.equal(await rows.count(),10);
  await panel.getByRole("button",{name:"下一页",exact:true}).click();
  const firstOnPage = await rows.first().innerText();
  await rows.first().click();
  await page.keyboard.press("Escape");
  await detail.waitFor({state:"hidden"});
  assert.equal(await rows.first().innerText(),firstOnPage);
  await panel.getByRole("navigation",{name:"批改结果翻页"}).getByText("2 / 3").waitFor();
  await (await reveal("错误")).click();
  many=false; counts.correct-=15;
  for (const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:800});
    await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,null,{timeout:4000}).catch(async error=>{
      console.error("Overflow after resize", width, await page.locator(".grade-filter-bar").evaluate(el=>({
        viewport:innerWidth, page:document.documentElement.scrollWidth, bar:el.clientWidth,
        items:[...el.children].map(child=>[child.textContent, Math.round(child.getBoundingClientRect().width)])
      })));
      throw error;
    });
    const bar = panel.getByRole("group",{name:"按批改结果筛选"});
    assert.ok((await bar.boundingBox()).height <= 62);
    for (const button of await bar.getByRole("button").all()) assert.ok((await button.boundingBox()).height >= 44);
    assert.ok(await bar.evaluate(el=>el.scrollWidth<=el.clientWidth),"No horizontal filter scrolling");
    if (width <= 390) {
      await more.click();
      const dropdown = bar.getByRole("group",{name:"更多筛选"});
      const hiddenButtons = dropdown.getByRole("button");
      assert.ok(await hiddenButtons.count() >= 2);
      const first = await hiddenButtons.nth(0).boundingBox(), second = await hiddenButtons.nth(1).boundingBox();
      assert.ok(second.y >= first.y + first.height - 1);
      assert.equal(await dropdown.getByRole("button",{pressed:true}).count(),0);
      const color = await categoryButton("错误").locator(".grade-filter-pill").evaluate(el=>getComputedStyle(el).backgroundColor);
      const correctColor = await categoryButton("正确").locator(".grade-filter-pill").evaluate(el=>getComputedStyle(el).backgroundColor);
      assert.notEqual(color,correctColor);
      await page.screenshot({path:output + `/grading-more-${width}.png`});
      await page.keyboard.press("Escape");
      assert.equal(await more.getAttribute("aria-expanded"),"false");
      await more.click();
      await panel.getByRole("heading",{name:"批改结果",exact:true}).click();
      await dropdown.waitFor({state:"hidden"});
    }
    if (width===1280) assert.equal(await more.count(),0);
    const rowBox = await rows.first().boundingBox();
    assert.ok(rowBox.height>=44 && rowBox.height<=85);
    await panel.screenshot({path:output + `/grading-${width}.png`});
    await rows.first().click();
    assert.ok(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth));
    await detail.getByRole("button",{name:"返回列表"}).click();
  }
  await page.setViewportSize({width:390,height:670});
  await page.locator('.hw-date input').fill('2026-11-21');
  await panel.getByRole('button',{name:'先看需要留意的题',pressed:true}).waitFor();
  await page.getByRole("button", { name: "错题本", exact: true }).click();
  const book = page.getByRole("region", { name: "错题本", exact: true });
  const toggle = number => book.getByRole("button", { name: new RegExp(`^第${number}题 `) });
  await toggle(2).waitFor();
  assert.equal(await book.locator(".mistake-entry").count(), 10);
  assert.equal(await book.locator(".grade-question").count(), 0);
  assert.equal(await book.getByText("第1／31页", { exact: true }).count(), 1);
  const titles = book.locator(".mistake-summary strong");
  assert.deepEqual((await titles.allTextContents()).slice(2, 8), legacyLabels.map(([, title]) => title));
  const stem = book.locator(".mistake-stem-preview").nth(5);
  assert.equal(await stem.textContent(), longStem);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({width, height: 670});
    const layout = await stem.evaluate(element => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      fits: element.getBoundingClientRect().right < innerWidth,
      ellipsis: getComputedStyle(element).textOverflow === "ellipsis",
      clipped: element.scrollWidth > element.clientWidth,
    }));
    assert.ok(!layout.overflow && layout.fits && layout.ellipsis && (width > 390 || layout.clipped), JSON.stringify(layout));
  }
  await page.setViewportSize({width: 390, height: 670});
  await page.screenshot({path: output + "/mistake-title-summary-mobile.png", fullPage: true});
  await book.getByRole("button", { name: /^第4大题 · 第8小题/ }).click();
  await book.getByRole("heading", { name: "第4大题 · 第8小题", exact: true }).waitFor();
  assert.equal(await book.locator(".grade-stem").textContent(), longStem);
  await toggle(2).click();
  await toggle(3).click();
  assert.equal(await toggle(2).getAttribute("aria-expanded"), "false");
  assert.equal(await toggle(3).getAttribute("aria-expanded"), "true");
  assert.equal(await book.locator(".grade-question").count(), 1);
  await book.getByRole("button", { name: "下一页", exact: true }).click();
  await toggle(12).waitFor();
  assert.equal(await book.locator(".mistake-entry").count(), 10);
  assert.equal(await book.locator(".grade-question").count(), 0);
  assert.equal(await toggle(2).count(), 0);
  await book.getByRole("button", { name: "上一页", exact: true }).click();
  await toggle(2).waitFor();
  await book.getByRole("button", { name: "下一页", exact: true }).click();
  await toggle(12).waitFor();
  await book.getByRole("button", { name: "数学", exact: true }).click();
  await toggle(2).click();
  await book.getByText("查看详情", { exact: true }).click();
  await book.getByText("可能的错因 · 计算错误", { exact: true }).waitFor();
  assert.equal(await book.locator(".grade-question").count(), 1);
  const sourceText = `来自作业 · ${fullAssignment}`;
  const row = book.locator(".mistake-scope").first();
  const editScope = row.getByRole("button", { name: /更改本题归属/ });
  await row.getByText(`作业 · ${fullAssignment}`, { exact: true }).waitFor();
  assert.ok(!(await book.innerText()).includes("已上传作业"));
  for (const width of [320, 390, 428]) {
    await page.setViewportSize({ width, height: 640 });
    const layout = await row.evaluate(el => {
      const badge = el.querySelector("button");
      const title = el.querySelector(".mistake-origin");
      const r = el.getBoundingClientRect(), b = badge.getBoundingClientRect(), t = title.getBoundingClientRect();
      return { rowHeight:r.height, hitHeight:b.height, centered:Math.abs((b.top+b.bottom)-(t.top+t.bottom))<1,
        singleLine:getComputedStyle(title).whiteSpace==="nowrap", ellipsis:getComputedStyle(title).textOverflow==="ellipsis",
        clipped:title.scrollWidth>title.clientWidth, pencil:!!badge.querySelector("svg"), overflow:document.documentElement.scrollWidth>innerWidth };
    });
    assert.ok(layout.rowHeight <= 45 && layout.hitHeight >= 44 && layout.centered && layout.singleLine && layout.ellipsis && layout.pencil && !layout.overflow, JSON.stringify(layout));
    if (width === 320) assert.ok(layout.clipped, "Long assignment names fit by truncating at narrow width");
  }
  await editScope.tap();
  const scopeDialog = page.getByRole("dialog", { name: "更改本题归属", exact: true });
  await scopeDialog.getByText(sourceText, { exact: true }).waitFor();
  await scopeDialog.getByRole("button", { name: "取消", exact: true }).tap();
  await scopeDialog.waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 670 });
  await book.getByRole("button", { name: "查看原题照片", exact: true }).click(); await book.locator("img").waitFor();
  await book.locator("img").scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.mistake-book img')?.naturalWidth>0||document.querySelector('.grade-photo img')?.naturalWidth>0);
  assert.ok((await book.locator('img').getAttribute('src')).endsWith('?size=screen'));assert.ok((await book.getByRole('link',{name:'下载图片',exact:true}).getAttribute('href')).endsWith('?size=screen&download=1'));
  assert.ok(photos >= 1);
  const bigPhoto = book.getByRole('button', { name: '查看高清大图', exact: true });
  await bigPhoto.tap();
  const photoDialog = page.getByRole('dialog', { name: '照片预览', exact: true });
  await photoDialog.getByRole('img').waitFor();
  assert.ok((await photoDialog.getByRole('img').getAttribute('src')).endsWith('/synthetic-page'));
  await photoDialog.getByRole('button', { name: '关闭照片', exact: true }).tap();
  await photoDialog.waitFor({ state: 'hidden' });
  assert.ok(await bigPhoto.evaluate(button => document.activeElement === button));
  await book.getByRole("button", { name: "收起原图", exact: true }).click();
  await page.screenshot({ path: output + "/mistake-book-mobile.png", fullPage: true });
  await book.getByRole("button", { name: "英语", exact: true }).click();
  await book.getByText("这个分类暂时没有已核验的错题。", { exact: true }).waitFor();
  await book.getByRole("button", { name: "数学", exact: true }).click();
  await toggle(2).click();
  await book.getByRole("button", { name: "和小步聊这题", exact: true }).click();
  await page.locator("#assistant-question").waitFor();
  assert.equal(await page.locator("#assistant-question").inputValue(), "");
  await page.getByRole("button", {name:"帮我看看这里有没有认错"}).waitFor();
  await page.getByRole("button", { name: "关闭小助手", exact: true }).click();
  failed = true; await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await page.getByRole("button", { name: "查看未完成原因", exact: true }).click();
  const ungraded = categoryButton("未批改");
  await rows.getByText("批改未完成",{exact:true}).waitFor();
  assert.equal(await ungraded.getAttribute("aria-pressed"),"true");
  await (await reveal("正确")).click();
  assert.equal(await rows.count(),1);
  await (await reveal("未批改")).click(); await (await reveal("未批改")).click();
  assert.equal(await all.getAttribute("aria-pressed"),"true");
  await (await reveal("未批改")).click(); await rows.first().click();
  const failures = detail.getByRole("region",{name:"本页批改情况"});
  await failures.getByText("AI返回的内容未能正常解析，没能读到可用的批改回复。",{exact:true}).waitFor();
  assert.match(await failures.innerText(),/已尝试3次.*独立复核/);
  await failures.getByRole("button",{name:"查看原题照片"}).click();
  await failures.locator("img").waitFor();
  await failures.getByRole("button",{name:"重试当天失败页"}).click();
  await failures.getByRole("heading",{name:"等待批改"}).waitFor();
  quotaPaused=true;
  await failures.getByText("今天的AI额度已用完，批改会在明天继续，原件已保存。",{exact:true}).waitFor();
  child=true; failed=true; pending=false;
  await page.goto(base,{waitUntil:"networkidle"});
  await page.getByRole("button",{name:"查看未完成原因",exact:true}).click();
  await rows.first().click();
  assert.equal(await failures.getByRole("button",{name:"重试当天失败页"}).count(),0);
  await failures.getByText("请家长处理重试，已有结果仍可查看。").waitFor();
  child=false; failed=false; signatureCase=true;
  await page.goto(base,{waitUntil:"networkidle"});
  await page.getByRole("button",{name:"查看批改",exact:true}).click();
  await all.click();
  await rows.getByText("签名记录",{exact:true}).click();
  await detail.getByRole("button",{name:"家长核对",exact:true}).click();
  assert.equal(await detail.getByRole("radio").count(),0);
  await detail.getByLabel("卷面签名及日期").fill("新签名，模拟日期");
  await detail.getByLabel("核对依据").fill("模拟核对依据");
  await detail.getByRole("button",{name:"预览更正"}).click();
  await detail.getByText("确认后更新签名记录。").waitFor();
  await detail.getByRole("button",{name:"确认更正签名"}).click();
  await detail.getByText("签名记录已更新。").waitFor();
  assert.doesNotMatch(await detail.innerText(),/入错题本|原答错误/);
  assert.deepEqual(errors, []);
  console.log("GRADING_UI_OK=true daily-progress,category-buttons,zero-category,poll-preserves-filter,keyboard,date-reset,failed-reason-home-entry,per-page-cause-attempt-stage,ungraded-filter-and-reset,child-no-retry,all-verdicts,wrong-book,compact-one-line-source,scope-badge-edit,full-title-in-editor,cause,next-step,subject-filter,lazy-private-photo,assistant-prefill,retry,mobile-and-desktop");
} finally { await browser.close(); }
