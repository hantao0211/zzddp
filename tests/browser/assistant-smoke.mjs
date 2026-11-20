// Explicit deployment smoke test. Uses paid APIs with synthetic questions only.
// Credentials are read from a private file and never written to test artifacts.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL || "https://14.103.24.55";
const code = (await readFile(process.env.SMOKE_CODE_FILE, "utf8")).trim();
assert.ok(/^\d{8}$/.test(code), "Expected a private family access code file");
const output = process.env.SMOKE_OUTPUT_DIR;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${process.env.SMOKE_AUDIO_FILE}`] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["microphone"] });
  await context.addInitScript(() => {
    window.__smokeStreams = [];
    if (navigator.mediaDevices?.getUserMedia) {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (...args) => { const stream = await original(...args); window.__smokeStreams.push(stream); return stream; };
    }
  });
  const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(20000);
  await page.goto(`${base}/?assistant=1`, { waitUntil: "networkidle" });
  await page.getByLabel("家庭访问码").fill(code);
  await page.getByRole("button", { name: "打开小助手", exact: true }).click();
  await page.locator("#assistant-question").waitFor();
  assert.ok(!await page.evaluate(() => document.cookie.includes("xiaobu-assistant")));
  await page.locator("#assistant-question").fill("小数减法为什么要对齐小数点？请用简短的例子说明。");
  const chat = page.waitForResponse((response) => response.url().endsWith("/assistant-api/chat") && response.request().method() === "POST", { timeout: 95000 });
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  const chatResponse = await chat; assert.equal(chatResponse.status(), 200);
  const answer = await chatResponse.json(); assert.ok(answer.answer.length > 10);
  await page.locator(".assistant-message.assistant").waitFor();
  const tts = page.waitForResponse((response) => response.url().endsWith("/assistant-api/speech"), { timeout: 65000 });
  await page.getByRole("button", { name: "朗读回答", exact: true }).click();
  assert.equal((await tts).status(), 200);
  await page.waitForFunction(() => !document.querySelector(".assistant-read")?.disabled);
  if (await page.getByRole("button", { name: "播放回答", exact: true }).count()) await page.getByRole("button", { name: "播放回答", exact: true }).click();
  await page.getByRole("button", { name: "停止朗读", exact: true }).waitFor();
  await page.getByRole("button", { name: "停止朗读", exact: true }).click();
  await page.screenshot({ path: join(output, "assistant-desktop.png") });
  await page.getByRole("button", { name: "语音提问", exact: true }).click();
  await page.locator(".assistant-recording").waitFor();
  await page.waitForTimeout(4500);
  const asr = page.waitForResponse((response) => response.url().endsWith("/assistant-api/transcribe"), { timeout: 65000 });
  await page.locator(".assistant-recording button").click();
  assert.equal((await asr).status(), 200);
  await page.waitForFunction(() => document.querySelector("#assistant-question")?.value.length > 0);
  assert.ok(await page.evaluate(() => window.__smokeStreams.length > 0 && window.__smokeStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended"))));
  // Closing the assistant must also stop an in-progress microphone capture.
  await page.getByRole("button", { name: "语音提问", exact: true }).click();
  await page.locator(".assistant-recording").waitFor();
  await page.getByRole("button", { name: "关闭小助手", exact: true }).click();
  assert.ok(await page.evaluate(() => window.__smokeStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended"))));
  await page.getByRole("button", { name: "小助手", exact: true }).click();
  await page.locator("#assistant-question").waitFor();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await context.storageState() });
  const phone = await mobile.newPage(); phone.on("pageerror", (error) => errors.push(error.message));
  await phone.goto(`${base}/?assistant=1`, { waitUntil: "networkidle" });
  await phone.locator("#assistant-question").waitFor();
  const bounds = await phone.locator(".assistant-dialog").boundingBox();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 391 && bounds.y + bounds.height <= 845);
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await phone.screenshot({ path: join(output, "assistant-mobile.png") });
  await phone.getByRole("button", { name: "退出设备", exact: true }).click();
  await phone.getByLabel("家庭访问码").waitFor();
  await page.locator("#assistant-question").fill("你好");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await page.getByLabel("家庭访问码").waitFor();
  assert.deepEqual(errors, []);
  await writeFile(join(output, "result.json"), JSON.stringify({ desktopLogin: true, realChat: true, realSpeechPlayback: true, realMicrophoneTranscription: true, stopTracksOnFinish: true, stopTracksOnClose: true, mobileLayout: true, sessionRevocation: true, pageErrors: errors }, null, 2));
  console.log("BROWSER_ASSISTANT_SMOKE_OK=true desktop,mobile,chat,voice,microphone-release,logout");
} catch (error) {
  console.error(String(error.stack || error).split(code).join("[redacted]"));
  process.exitCode = 1;
} finally { await browser.close(); }
