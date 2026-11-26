import { MistakeSortSchema } from "../../domain/mistake-sort";
import { noteFailure } from "../diagnostics/events";
import { GradeReviewSchema } from "../../domain/grade-review";
import { ConventionInput, FeedbackInput } from "./completion-feedback";
import type {PracticeHTTP} from "../practice/http";
import {LearningScopeSchema,type PracticeSubject} from "../../domain/practice";
import { z } from "zod";
import { isParent, type Viewer } from "../../domain/accounts";
import { HomeworkScopeRefSchema, HomeworkScopeSchema } from "../../domain/homework-scope";
import { createHash, randomUUID } from "node:crypto";
import { open, rename, rm, statfs } from "node:fs/promises";
import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DaySchema, UploadInputSchema } from "../../domain/homework";
import { HomeworkError, HomeworkStore } from "./store";
import { detectMime } from "./images";
import type { HomeworkRewards } from "./rewards";

function json(res: ServerResponse, value: unknown, status = 200) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); }
async function input(req: IncomingMessage) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new HomeworkError(415, "请求格式不正确。");
  const chunks: Buffer[] = []; let length = 0;
  for await (const b of req) { length += b.length; if (length > 30000) throw new HomeworkError(413, "资料信息过长。"); chunks.push(b); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HomeworkError(400, "资料信息不完整。"); }
}
export class HomeworkHTTP {
  private writing = new Set<string>();
  private active = 0;
  constructor(private store: HomeworkStore, private rewards?: HomeworkRewards,private practice?:PracticeHTTP) {}
  async handle(req: IncomingMessage, res: ServerResponse, viewer?: Viewer) {
    const url = new URL(req.url!, "http://internal"), path = url.pathname.replace("/assistant-api/learning", "");
    try {
      if(path.startsWith("/practice/")&&this.practice){if(!viewer)throw new HomeworkError(403,"请先登录家庭账号。");await this.practice.handle(req,res,viewer);return;}
      if (path === "/state" && req.method === "GET") {
        const date = DaySchema.safeParse(url.searchParams.get("date"));
        if (!date.success) throw new HomeworkError(400, "请选择有效的作业日期。");
        const snapshot = this.store.snapshot(date.data);
        json(res, { ...snapshot, ...(this.rewards ? { homeworkReward: this.rewards.status(date.data), gardenProgress: this.rewards.gardenProgress(snapshot) } : {}) }); return;
      }
      if (path === "/completion-feedback/convention" && req.method === "POST") {
        if (!viewer || !isParent(viewer)) throw new HomeworkError(403,"请家长保存家庭约定。");
        const value = ConventionInput.safeParse(await input(req));
        if (!value.success) throw new HomeworkError(400,"请填写适用场景，并用至少八个字说明今后的约定。");
        json(res,this.store.feedback.teach(value.data,viewer)); return;
      }
      if (path === "/completion-feedback" && req.method === "POST") {
        if (!viewer) throw new HomeworkError(403,"请先登录家庭账号。");
        const value = FeedbackInput.safeParse(await input(req));
        if (!value.success) throw new HomeworkError(400,"请选择反馈原因，其他问题请用一句话说明。");
        const receipt = this.store.feedback.submit(value.data, viewer);
        if (value.data.confirm) this.rewards?.tick();
        json(res,receipt); return;
      }
      if (path === "/day-plan" && req.method === "POST") {
        json(res, this.store.setDayPlan(await input(req), viewer?.id || "legacy")); return;
      }
      if (path === "/source-scope" && req.method === "PATCH") {
        if (!isParent(viewer)) throw new HomeworkError(403, "请家长修改已录入作业的归属。");
        const value = z.object({ source: HomeworkScopeRefSchema, scope: HomeworkScopeSchema }).strict().safeParse(await input(req));
        if (!value.success) throw new HomeworkError(400, "请选择课内或课外。");
        const { source, scope } = value.data;
        json(res, this.store.transaction(() => this.store.scopes.set(source, scope))); return;
      }
      if (path === "/task-completion" && req.method === "POST") {
        const value=z.object({date:DaySchema,taskId:z.string().min(1).max(180),token:z.string().regex(/^[a-f0-9]{64}$/),completed:z.boolean()}).strict().safeParse(await input(req));
        if(!value.success)throw new HomeworkError(400,"请从当前作业点击完成按钮。");
        const v=value.data;const result=this.store.completions.set(v.date,v.taskId,v.token,v.completed,viewer);this.rewards?.tick();json(res,result);return;
      }
      if (path === "/grading" && req.method === "GET") {
        const date = DaySchema.safeParse(url.searchParams.get("date"));
        if (!date.success) throw new HomeworkError(400, "请选择有效的作业日期。");
        json(res, this.store.grading.results(date.data)); return;
      }
      if (path === "/grading/review" && req.method === "POST") {
        if (!viewer || !isParent(viewer)) throw new HomeworkError(403,"请家长核对本题。");
        const value = z.object({runId:z.string().min(1).max(200),questionId:z.string().min(1).max(200),base:z.string().regex(/^[a-f0-9]{64}$/),review:GradeReviewSchema}).strict().safeParse(await input(req));
        if (!value.success) throw new HomeworkError(400,"请选择结论，写下一句核对依据。");
        const {runId,questionId,base,review} = value.data;
        json(res,this.store.grading.proposeReview(runId,questionId,base,review)); return;
      }
      if (path === "/grading/confirm" && req.method === "POST") {
        if (!viewer || !isParent(viewer)) throw new HomeworkError(403,"请家长确认本题的批改更正。");
        const value = z.object({id:z.string().uuid()}).strict().safeParse(await input(req));
        if (!value.success) throw new HomeworkError(400,"请选择本题的更正建议。");
        json(res,this.store.grading.confirmReview(value.data.id,viewer.id)); return;
      }
      if (path === "/grading/start" && req.method === "POST") {
        const date = DaySchema.safeParse((await input(req))?.date);
        if (!date.success) throw new HomeworkError(400, "请选择有效日期。");
        if (!this.store.autoGradingEnabled) throw new HomeworkError(503, "自动批改尚未启用。");
        const snapshot = this.store.snapshot(date.data);
        if (snapshot.pending) throw new HomeworkError(409, "资料正在整理，完成后会自动批改。");
        this.store.transaction(() => this.store.grading.queueDay(date.data, snapshot.report));
        json(res, this.store.grading.summary(date.data)); return;
      }
      if (path === "/grading/retry" && req.method === "POST") {
        const date = DaySchema.safeParse((await input(req))?.date);
        if (!date.success) throw new HomeworkError(400, "请选择有效日期。");
        const queued = this.store.grading.retry(date.data);
        if (!queued) throw new HomeworkError(409, "没有可重试的失败批改，或已达到重试上限。原件和已有结果仍保留。");
        json(res, { queued }); return;
      }
      if (path === "/mistakes" && req.method === "GET") {
        const subject = url.searchParams.get("subject");
        const offset = Number(url.searchParams.get("offset") || 0);
        const limit = Number(url.searchParams.get("limit") ?? 30);
        if ((subject && !["语文", "数学", "英语"].includes(subject)) ||
          !Number.isSafeInteger(offset) || offset < 0 || offset > 100000 ||
          !Number.isSafeInteger(limit) || limit < 1 || limit > 30) throw new HomeworkError(400, "筛选条件无效。");
        const scope = url.searchParams.get("scope");
        const sort = MistakeSortSchema.safeParse(url.searchParams.get("sort") ?? "newest");
        if (!sort.success) throw new HomeworkError(400,"错题排序方式无效。");
        const parsedScope = LearningScopeSchema.safeParse(scope);
        if (scope && !parsedScope.success) throw new HomeworkError(400, "请选择课内、课外或待分类。");
        json(res, this.practice
          ? this.practice.mistakes(subject as PracticeSubject || undefined, parsedScope.data, offset, limit,url.searchParams)
          : this.store.grading.mistakes(subject, offset, limit, sort.data));
        return;
      }
      if (path === "/uploads" && req.method === "POST") {
        const parsed = UploadInputSchema.safeParse(await input(req));
        if (!parsed.success) throw new HomeworkError(400, "请选择有效日期和文件：每次最多20个、单个20MB、合计50MB。");
        const space = await statfs(this.store.directory);
        if (space.bavail * space.bsize < 512 * 1024 * 1024) throw new HomeworkError(507, "服务器剩余空间不足，已有资料已保留，请联系家长。");
        json(res, this.store.begin(parsed.data), 201); return;
      }
      const upload = path.match(/^\/uploads\/([a-f0-9-]{36})\/(finish|retry|date)$/);
      if (upload && req.method === "POST") {
        if (upload[2] === "finish") json(res, this.store.finalize(upload[1]));
        else if (upload[2] === "retry") { this.store.retry(upload[1]); json(res, this.store.view(upload[1])); }
        else {
          const value = await input(req);
          const date = DaySchema.safeParse(value?.date);
          if (!date.success || Object.keys(value).length !== 1) throw new HomeworkError(400, "请选择有效日期。");
          this.store.changeDate(upload[1], date.data); json(res, this.store.view(upload[1]));
        }
        return;
      }
      if (path === "/retry-day" && req.method === "POST") {
        const value = await input(req); const date = DaySchema.safeParse(value?.date);
        if (!date.success) throw new HomeworkError(400, "日期无效。");
        this.store.retryDay(date.data); json(res, { queued: true }); return;
      }
      const write = path.match(/^\/files\/([a-f0-9-]{36})$/);
      if (write && req.method === "PUT") { await this.receive(req, res, write[1]); return; }
      const read = path.match(/^\/(files|pages)\/([a-f0-9-]{36}(?:-p\d{1,3})?)$/);
      if (read && req.method === "GET") {
        const page = read[1] === "pages" ? this.store.page(read[2]) : undefined;
        const file = this.store.file(page ? page.file_id : read[2]);
        if (!file?.stored || (read[1] === "pages" && !page)) throw new HomeworkError(404, "原件或预览不存在。");
        const variant = url.searchParams.get("size") || "full";
        if (page && !["full", "thumb", "screen"].includes(variant)) throw new HomeworkError(400, "图片尺寸选项无效。");
        const filePath = page && variant !== "full" ? await this.store.previews.get(page.id, variant as "thumb" | "screen") : join(this.store.directory, page ? "pages" : "originals", read[2] + (page ? ".jpg" : ""));
        const info = statSync(filePath), size = info.size;
        const name = page ? `page-${page.number}.jpg` : file.name.replace(/[\x00-\x1f\x7f]/g, "");
        if (page) {
          // Revalidation saves bytes but still requires authentication, including after logout.
          const etag = 'W/"' + createHash("sha256").update(`${filePath}:${size}:${info.mtimeMs}`).digest("hex") + '"';
          res.setHeader("Cache-Control", "private, no-cache"); res.setHeader("ETag", etag); res.setHeader("Vary", "Cookie");
          if (req.headers["if-none-match"]?.split(",").some(tag => tag.trim() === "*" || tag.trim().replace(/^W\//, "") === etag.replace(/^W\//, ""))) { res.writeHead(304); res.end(); return; }
        }
        res.writeHead(200, { "Content-Type": page ? "image/jpeg" : file.mime || "application/octet-stream", "Content-Length": size, "Content-Disposition": `${page && url.searchParams.get("download") !== "1" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`, "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin" });
        const stream = createReadStream(filePath); stream.on("error", () => res.destroy()); res.on("close", () => stream.destroy()); stream.pipe(res); return;
      }
      throw new HomeworkError(404, "没有找到这个资料功能。");
    } catch (e) {
      noteFailure(res, e);
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) { res.destroy(); return; }
      json(res, { error: e instanceof HomeworkError ? e.message : "资料处理暂时不可用，原件不会被自动删除。请稍后再试。" }, e instanceof HomeworkError ? e.status : 503);
    }
  }
  private async receive(req: IncomingMessage, res: ServerResponse, id: string) {
    const file = this.store.file(id), upload = file ? this.store.upload(file.upload_id) : undefined;
    if (!file || !upload) throw new HomeworkError(404, "上传任务不存在。");
    if (file.stored) { req.resume(); json(res, { stored: true }); return; }
    if (upload.status !== "uploading") throw new HomeworkError(409, "这份资料已进入整理流程。");
    if (this.active >= 2 || this.writing.has(id)) throw new HomeworkError(429, "正在上传，请稍等后重试。");
    if (Number(req.headers["content-length"]) !== file.size || req.headers["content-type"] !== "application/octet-stream") throw new HomeworkError(400, "文件大小或格式不匹配，请重新选择原件。");
    this.active++; this.writing.add(id);
    const temporary = join(this.store.directory, "incoming", randomUUID());
    let fd: Awaited<ReturnType<typeof open>> | undefined;
    try {
      fd = await open(temporary, "wx", 0o600);
      const hash = createHash("sha256"); let length = 0, header = Buffer.alloc(0);
      for await (const chunk of req) {
        length += chunk.length; if (length > file.size) throw new HomeworkError(413, "文件超出声明大小。");
        if (header.length < 64) header = Buffer.concat([header, chunk.subarray(0, 64 - header.length)]);
        hash.update(chunk); let offset = 0;
        while (offset < chunk.length) { const written = await fd.write(chunk, offset, chunk.length - offset); offset += written.bytesWritten; }
      }
      if (length !== file.size || hash.digest("hex") !== file.sha256) throw new HomeworkError(400, "文件传输不完整，原件未提交，请重试这一批上传。");
      const mime = detectMime(header); await fd.sync();
      await rename(temporary, join(this.store.directory, "originals", file.id));
      const directory = await open(join(this.store.directory, "originals"), "r");
      try { await directory.sync(); } finally { await directory.close(); }
      this.store.stored(id, mime); json(res, { stored: true });
    } finally { try { await fd?.close(); await rm(temporary, { force: true }); } finally { this.active--; this.writing.delete(id); } }
  }
}
