import assert from "node:assert/strict";
import test from "node:test";
import { createHash, scryptSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import type { z } from "zod";
import type { AITask } from "../src/domain/ai-contracts";
import { DaySchema } from "../src/domain/homework";
import { HomeworkStore, HomeworkError, type UploadRow } from "../src/server/homework/store";
import { HomeworkWorker } from "../src/server/homework/worker";
import { HomeworkHTTP } from "../src/server/homework/http";
import { detectMime } from "../src/server/homework/images";
import { AssistantStore } from "../src/server/assistant/store";
import { createAssistantServer } from "../src/server/assistant/server";
import { AIServiceError, type StructuredAI, type AIImage } from "../src/server/ai/provider";

const date = "2026-11-20";
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-homework-test-"));
  let now = Date.parse("2026-11-20T04:00:00Z"), calls = 0;
  const store = new HomeworkStore(directory, () => now);
  const pipeline = {
    async convert(file: { id: string }) { const pages = [{ id: file.id + "-p1", file_id: file.id, number: 1 }]; store.setPages(file.id, pages); return pages; },
    images(pages: { id: string }[]) { return pages.map((p) => ({ fileId: p.id, mimeType: "image/jpeg" as const, base64: "fixture" })); },
  };
  const ai: StructuredAI = { async run<T>(task: AITask, schema: z.ZodType<T>, metadata: unknown, images: AIImage[] = []): Promise<T> {
    calls++; const data = metadata as { candidates?: { id: string }[]; extractedPages?: unknown[] };
    if (task === "recognize_memo") return schema.parse({ date, readable: true, assignments: [{ subject: "数学", title: "数学练习册", requirement: "第32–33页", format: "written", evidence: [{ fileId: images[0].fileId, page: 1, excerpt: "数学32–33页" }] }], uncertainties: [] });
    if (task === "extract_homework") return schema.parse({ pages: images.map((i) => ({ fileId: i.fileId, readable: true, subject: "数学", book: "练习册", printedPage: "32", content: "已写题号", uncertainties: [] })) });
    const pages = data.extractedPages as { fileId: string }[];
    return schema.parse({ readable: true, subjects: ["数学"], matches: [{ taskId: data.candidates![0].id, coverage: pages.length >= 2 ? "complete" : "partial", evidence: pages.map((p) => ({ fileId: p.fileId, page: 1, excerpt: "已拍页面" })), missing: pages.length >= 2 ? [] : ["缺少第33页"] }], unassigned: [], uncertainties: [] });
  } };
  const worker = new HomeworkWorker(store, () => ai, pipeline);
  const add = (kind: "memo" | "homework", seed: string, day = date) => {
    const u = store.begin({ date: day, kind, files: [{ name: seed + ".png", size: 100, sha256: createHash("sha256").update(seed).digest("hex") }] });
    for (const f of u.files) store.stored(f.id, "image/png"); return store.finalize(u.id);
  };
  const drain = async () => { for (let i = 0; i < 30; i++) if (!await worker.tick()) return; throw new Error("Queue did not drain"); };
  return { directory, store, worker, pipeline, ai, add, drain, calls: () => calls, advance: (ms: number) => { now += ms; }, cleanup() { worker.stop(); store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("homework arriving before memo is classified; later memo and supplemental batch combine coverage", async () => {
  const f = fixture();
  try {
    const first = f.add("homework", "page32"); await f.drain();
    assert.equal(f.store.snapshot(date).status, "waiting_memo");
    assert.deepEqual(f.store.view(first.id).subjects, ["数学"]);
    f.add("memo", "memo"); await f.drain();
    let report = f.store.snapshot(date).report!;
    assert.equal(report.tasks[0].coverage, "partial"); assert.deepEqual(report.tasks[0].missing, ["缺少第33页"]);
    f.add("homework", "page33"); await f.drain();
    report = f.store.snapshot(date).report!;
    assert.equal(report.tasks[0].coverage, "complete"); assert.equal(report.tasks[0].evidence.length, 2);
    assert.ok(!("completed" in report.tasks[0]), "coverage must not imply correct answers/completion");
    assert.equal(f.calls(), 5, "earlier photo extraction is cached, only aggregate check repeats");
  } finally { f.cleanup(); }
});

test("uploads are deduplicated; interrupted queue and reserved paid-call budget survive restart", async () => {
  const f = fixture();
  try {
    const first = f.add("memo", "same");
    const again = f.add("memo", "same"); assert.equal(first.id, again.id);
    const job = f.store.claim(); assert.equal(job!.kind, "recognize");
    f.store.reserve(); f.store.close();
    const reopened = new HomeworkStore(f.directory, () => Date.parse("2026-11-20T04:00:00Z"));
    assert.equal(reopened.claim()!.attempts, 2); assert.equal(reopened.snapshot(date).quota.calls, 1);
    for (let i = 0; i < 59; i++) reopened.reserve();
    assert.throws(() => reopened.reserve()); reopened.close();
    // Restore handle for fixture teardown.
    (f.store as unknown as { db: unknown }).db = new HomeworkStore(f.directory).db;
  } finally { f.cleanup(); }
});

test("mismatched memo date blocks task publication until selected date is corrected", async () => {
  const f = fixture();
  try {
    const memo = f.add("memo", "wrongdate", "2026-11-19"); await f.drain();
    assert.equal(f.store.snapshot("2026-11-19").report, null);
    assert.equal(f.store.snapshot("2026-11-19").status, "needs_rescan");
    f.store.changeDate(memo.id, date); await f.drain();
    assert.equal(f.store.snapshot(date).report!.tasks.length, 1);
    assert.equal(f.store.snapshot(date).status, "processed");
  } finally { f.cleanup(); }
});

test("memo without a written date uses the selected day and records that assumption", async () => {
  const f = fixture();
  try {
    const run = f.ai.run.bind(f.ai);
    f.ai.run = async <T,>(task: AITask, schema: z.ZodType<T>, metadata: unknown, images: AIImage[] = []): Promise<T> => {
      const result = await run(task, schema, metadata, images);
      return task === "recognize_memo" ? schema.parse({ ...(result as object), date: null }) : result;
    };
    f.add("memo", "undated"); await f.drain();
    const report = f.store.snapshot(date).report!;
    assert.equal(report.date, date); assert.equal(report.tasks.length, 1);
    assert.ok(report.uncertainties.some((s) => s.includes("未写日期")));
  } finally { f.cleanup(); }
});

test("correcting a failed upload date also corrects its durable retry job", async () => {
  const f = fixture();
  try {
    const memo = f.add("memo", "retry-date", "2026-11-19");
    const job = f.store.claim()!; f.store.fail(job, "fixture failure", false);
    f.store.changeDate(memo.id, date); f.store.retry(memo.id);
    await f.drain(); assert.equal(f.store.snapshot(date).report!.tasks.length, 1);
    assert.equal(f.store.view(memo.id).date, date);
  } finally { f.cleanup(); }
});

test("transient failure retries finitely without exposing provider errors", async () => {
  const f = fixture();
  try {
    f.add("memo", "memo");
    let n = 0;
    const worker = new HomeworkWorker(f.store, () => ({ async run() { n++; throw new AIServiceError("NETWORK", true, "private provider message"); } }), f.pipeline);
    await worker.tick(); assert.equal(f.store.uploads(date)[0].status, "retrying");
    f.advance(16000); await worker.tick(); f.advance(61000); await worker.tick();
    assert.equal(n, 3); assert.equal(f.store.uploads(date)[0].status, "failed");
    assert.ok(!f.store.snapshot(date).note.includes("private provider message"));
    worker.stop();
  } finally { f.cleanup(); }
});

test("invented image evidence is rejected before any memo task is published", async () => {
  const f = fixture();
  try {
    f.add("memo", "memo");
    const worker = new HomeworkWorker(f.store, () => ({ async run<T>(_task: AITask, schema: z.ZodType<T>): Promise<T> {
      return schema.parse({ date, readable: true, assignments: [{ subject: "数学", title: "bad", requirement: "bad", format: "written", evidence: [{ fileId: "unprovided-secret-page", page: 1, excerpt: "invented" }] }], uncertainties: [] });
    } }), f.pipeline);
    await worker.tick();
    assert.equal(f.store.uploads(date)[0].status, "retrying");
    assert.equal(f.store.snapshot(date).report, null);
    worker.stop();
  } finally { f.cleanup(); }
});

test("stale aggregate job cannot overwrite results from a newer upload", async () => {
  const f = fixture();
  try {
    f.add("memo", "memo"); await f.drain();
    f.add("homework", "first"); await f.worker.tick();
    const old = f.store.claim()!;
    f.add("homework", "new");
    f.store.publish(old, null, "processed", "stale result");
    assert.notEqual(f.store.snapshot(date).note, "stale result");
    await f.drain(); assert.equal(f.store.snapshot(date).report!.tasks[0].coverage, "complete");
  } finally { f.cleanup(); }
});

test("private upload HTTP requires login and same-origin; hashes and actual MIME protect originals", async () => {
  const f = fixture();
  const authDir = join(f.directory, "auth"), code = "19472586", salt = "ac".repeat(16), origin = "https://family.test";
  const auth = new AssistantStore(authDir);
  const server = createAssistantServer({ origin, accessHash: salt + ":" + scryptSync(code, salt, 32).toString("hex"), store: auth, ai: () => f.ai, homework: new HomeworkHTTP(f.store) });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const send = (path: string, method = "GET", body?: Buffer | object, cookie = "", custom: Record<string, string> = {}) => new Promise<{ status: number; headers: Record<string, unknown>; bytes: Buffer }>((resolve, reject) => {
    const buffer = body instanceof Buffer ? body : body ? Buffer.from(JSON.stringify(body)) : undefined;
    const r = request({ hostname: "127.0.0.1", port: address.port, path: "/assistant-api/" + path, method, headers: { Host: "family.test", "X-Forwarded-Proto": "https", Origin: origin, Cookie: cookie, ...(buffer ? { "Content-Type": body instanceof Buffer ? "application/octet-stream" : "application/json", "Content-Length": buffer.length } : {}), ...custom } }, (res) => { const chunks: Buffer[] = []; res.on("data", (b) => chunks.push(b)); res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, bytes: Buffer.concat(chunks) })); }); r.on("error", reject); r.end(buffer);
  });
  try {
    assert.equal((await send("learning/state?date=" + date)).status, 401);
    const cookie = "__Secure-xiaobu-assistant=" + auth.createSession();
    const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
    const input = { date, kind: "homework", files: [{ name: "<script>alert(1)</script>.png", size: png.length, sha256: createHash("sha256").update(png).digest("hex") }] };
    assert.equal((await send("learning/uploads", "POST", input, cookie, { Origin: "https://evil.test" })).status, 403);
    const result = await send("learning/uploads", "POST", input, cookie); assert.equal(result.status, 201);
    const u = JSON.parse(result.bytes.toString());
    assert.equal((await send(`learning/uploads/${u.id}/finish`, "POST", {}, cookie)).status, 409);
    assert.equal((await send(`learning/files/${u.files[0].id}`, "PUT", Buffer.alloc(png.length), cookie)).status, 400);
    assert.equal((await send(`learning/files/${u.files[0].id}`, "PUT", png, cookie)).status, 200);
    assert.equal((await send(`learning/uploads/${u.id}/finish`, "POST", {}, cookie)).status, 200);
    assert.equal((await send(`learning/files/${u.files[0].id}`)).status, 401);
    const download = await send(`learning/files/${u.files[0].id}`, "GET", undefined, cookie);
    assert.equal(download.status, 200); assert.deepEqual(download.bytes, png);
    assert.match(String(download.headers["content-disposition"]), /^attachment;/);
    auth.logout(cookie.split("=")[1]); assert.equal((await send("learning/state?date=" + date, "GET", undefined, cookie)).status, 401);
    assert.throws(() => detectMime(Buffer.from("<html>bad</html>")));
    assert.equal(DaySchema.safeParse("2026-02-30").success, false);
  } finally { await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }); f.cleanup(); }
});


test("transient conversion resource exhaustion is retried without asking for re-upload", async () => {
  const f = fixture();
  try {
    const convert = f.pipeline.convert.bind(f.pipeline); let attempts = 0;
    f.pipeline.convert = async (file) => { if (++attempts === 1) throw new HomeworkError(503, "fixture resource exhaustion"); return convert(file); };
    const upload = f.add("memo", "resource-limited");
    await f.worker.tick(); assert.equal(f.store.view(upload.id).status, "retrying"); assert.equal(f.calls(), 0);
    f.advance(16000); await f.drain();
    assert.equal(f.store.view(upload.id).status, "processed"); assert.equal(f.calls(), 1);
  } finally { f.cleanup(); }
});

test("received but failed homework is not described as waiting for an upload", async () => {
  const f = fixture();
  try {
    f.add("memo", "memo"); await f.drain();
    f.add("homework", "photo");
    const job = f.store.claim()!; f.store.fail(job, "fixture decode error", false);
    await f.drain();
    const day = f.store.snapshot(date);
    assert.equal(day.status, "failed"); assert.ok(day.note.includes("已经收到")); assert.ok(!day.note.includes("等待上传"));
  } finally { f.cleanup(); }
});

test("unclear subject does not silently discard a recognized memo requirement", async () => {
  const f = fixture();
  try {
    const run = f.ai.run.bind(f.ai);
    f.ai.run = async <T,>(task: AITask, schema: z.ZodType<T>, metadata: unknown, images: AIImage[] = []): Promise<T> => {
      const result = await run(task, schema, metadata, images);
      if (task !== "recognize_memo") return result;
      const value = result as { assignments: unknown[] };
      return schema.parse({ ...(result as object), assignments: [...value.assignments, { subject: null, title: "科目不清的复习", requirement: "复习某一课", format: "other", evidence: [{ fileId: images[0].fileId, page: 1, excerpt: "复习" }] }] });
    };
    f.add("memo", "partly-unclear"); await f.drain();
    const day = f.store.snapshot(date);
    assert.equal(day.report!.tasks.length, 1); assert.equal(day.report!.unclassified.length, 1);
    assert.equal(day.report!.unclassified[0].requirement, "复习某一课");
  } finally { f.cleanup(); }
});
