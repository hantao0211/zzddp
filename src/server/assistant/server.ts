import type { ReadingHTTP } from "../reading/http";
import { HomeworkError } from "../homework/store";
import type { HomeworkConversation } from "../homework/conversation";
import { DaySchema } from "../../domain/calendar";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { ChatInputSchema, validateRecording } from "../../domain/assistant";
import { chatPhotos } from "./photos";
import { AIServiceError, type StructuredAI } from "../ai/provider";
import { answerTutor } from "../ai/workflows";
import { AssistantLimitError, AssistantStore, digest } from "./store";
import type { HomeworkHTTP } from "../homework/http";
import type { SpeechServices } from "./speech";
import type { Accounts } from "./accounts";
import { AdminHTTP } from "./admin";
import { AccountLoginSchema, BootstrapSchema, isParent, type Viewer } from "../../domain/accounts";

const scryptAsync = promisify(scrypt);
const COOKIE = "__Secure-xiaobu-assistant";
type Options = { reading?: ReadingHTTP; origin: string; accessHash: string; store: AssistantStore; ai: (signal: AbortSignal) => StructuredAI; speech?: SpeechServices; homework?: HomeworkHTTP; learning?: HomeworkConversation; accounts?: Accounts; serviceInfo?: { provider: string; model: string } };
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function json(response: ServerResponse, status: number, value: unknown) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(value)); }
function aiErrorMessage(error: AIServiceError, operation: string) {
  if (operation === "speech") return "朗读暂时失败，文字回答已保留，可以稍后再点朗读。";
  if (operation === "transcribe") return error.code === "NO_SPEECH" ? "没有听清这个问题，请重新录音或打字。" : "语音识别暂时失败，可以重新录音或继续打字。";
  if (error.code === "INVALID_SOURCE") return "AI返回的资料引用未通过检查，本次未修改清单。请重新发送问题。";
  if (["INVALID_RESULT", "INVALID_ENVELOPE", "INCOMPLETE_RESPONSE"].includes(error.code)) return "AI这次的回答格式不完整，本次未修改清单。请重新发送问题。";
  if (error.code === "NETWORK_ERROR") return "AI服务未连接成功或等待超时，本次未修改清单。请稍后重新发送。";
  if (["HTTP_401", "HTTP_403", "HTTP_402", "AI_UNCONFIGURED"].includes(error.code)) return "AI服务配置或账户暂时不可用，请联系家长检查。已上传资料仍保留。";
  return "AI服务暂时繁忙，本次未修改清单，请稍后重新发送。";
}
async function body(request: IncomingMessage, maximum: number) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of request) { size += part.length; if (size > maximum) throw new HttpError(413, "问题或录音过长，请分短一点。"); chunks.push(part); }
  return Buffer.concat(chunks);
}
async function jsonBody(request: IncomingMessage, maximum = 64000) {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json") throw new HttpError(415, "请求格式不正确。");
  try { return JSON.parse((await body(request, maximum)).toString("utf8")); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "请求内容不完整，请重试。"); }
}

export function createAssistantServer(options: Options) {
  const host = new URL(options.origin).host;
  if (!options.origin.startsWith("https://") || !/^[a-f\d]{32}:[a-f\d]{64}$/.test(options.accessHash)) throw new Error("Invalid assistant configuration");
  const [salt, expected] = options.accessHash.split(":");
  const replies = new Map<string, { owner: string; text: string; expires: number }>();
  const admin = options.accounts ? new AdminHTTP(options.accounts, options.store, options.learning, options.serviceInfo) : undefined;
  let active = 0, logins = 0;
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff");
    const abort = new AbortController(); response.once("close", () => abort.abort());
    const token = (request.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1) || "";
    let operation = "other";
    try {
      if (request.headers["x-forwarded-proto"] !== "https" || request.headers.host !== host) throw new HttpError(426, "请从HTTPS安全地址打开小助手。");
      const path = new URL(request.url || "/", options.origin).pathname;
      operation = path === "/assistant-api/chat" ? "chat" : path === "/assistant-api/speech" ? "speech" : path === "/assistant-api/transcribe" ? "transcribe" : "other";
      if (request.method !== "GET" && request.headers.origin !== options.origin) throw new HttpError(403, "请从小步学习网页发起请求。");
      const userId = options.store.userId(token);
      const viewer: Viewer | null = options.accounts ? userId ? options.accounts.profile(userId) : options.accounts.legacyAllowed() ? { id: "legacy", username: "", name: "孩子（旧访问码）", role: "child", legacy: true } : null : null;
      const authenticated = options.store.authenticate(token) && (!options.accounts || !!viewer);
      const beginSession = (identity?: Viewer) => {
        const session = options.store.createSession(identity?.id);
        response.setHeader("Set-Cookie", `${COOKIE}=${session}; Path=/assistant-api; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`);
        json(response, 200, { authenticated: true, viewer: identity || null });
      };
      if (path === "/assistant-api/status" && request.method === "GET") { json(response, 200, { available: true, authenticated, speech: !!options.speech, viewer: authenticated ? viewer : null, accounts: !!options.accounts, setupRequired: options.accounts?.needsSetup() || false }); return; }
      if ((path === "/assistant-api/session" || path === "/assistant-api/parent-setup") && request.method === "POST") {
        if (logins >= 2) throw new HttpError(429, "正在验证，请稍后再试。");
        options.store.loginAttempt(String(request.headers["x-real-ip"] || request.socket.remoteAddress));
        const value = await jsonBody(request, 2048);
        logins++;
        try {
          if (path === "/assistant-api/parent-setup") {
            if (!options.accounts) throw new HttpError(404, "家长管理尚未启用。");
            const parsed = BootstrapSchema.safeParse(value);
            if (!parsed.success) throw new HttpError(400, "请填写家长开通码、2—32位英文或数字登录名，以及至少8位密码。");
            beginSession(await options.accounts.bootstrap(parsed.data)); return;
          }
          const account = AccountLoginSchema.safeParse(value);
          if (options.accounts && account.success) {
            const identity = await options.accounts.login(account.data.username, account.data.password);
            if (!identity) throw new HttpError(401, "登录名或密码不正确，或账号已停用。");
            beginSession(identity); return;
          }
          const input = z.object({ code: z.string().regex(/^\d{8}$/) }).strict().safeParse(value);
          if (!input.success) throw new HttpError(400, "请填写登录名和密码，或使用8位旧家庭访问码。");
          if (options.accounts && !options.accounts.legacyAllowed()) throw new HttpError(401, "旧访问码已关闭，请使用家长为你建立的账号。");
          const actual = await scryptAsync(input.data.code, salt, 32) as Buffer;
          if (!timingSafeEqual(actual, Buffer.from(expected, "hex"))) throw new HttpError(401, "家庭访问码不正确。");
          beginSession(); return;
        } finally { logins--; }
      }
      if (!authenticated) throw new HttpError(401, "请先登录学习账号。");
      if (path.startsWith("/assistant-api/reading/") && options.reading && viewer) { await options.reading.handle(request, response, viewer, () => jsonBody(request, 3_000_000)); return; }
      if (path.startsWith("/assistant-api/admin/") && admin && viewer) { await admin.handle(request, response, path, viewer, () => jsonBody(request, 4096)); return; }
      if (options.accounts && !isParent(viewer) && (path.match(/^\/assistant-api\/memories\/[a-f0-9-]{36}\/revoke$/) || path.match(/^\/assistant-api\/learning\/(?:retry-day|grading\/(?:start|retry)|uploads\/[a-f0-9-]{36}\/date)$/)) && request.method !== "GET") throw new HttpError(403, "这是家长管理操作，请让家长到管理页处理。日常上传和小助手仍可使用。");
      if (path === "/assistant-api/session" && request.method === "DELETE") {
        options.store.logout(token);
        for (const [id, reply] of replies) if (reply.owner === digest(token)) replies.delete(id);
        response.setHeader("Set-Cookie", `${COOKIE}=; Path=/assistant-api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
        json(response, 200, { authenticated: false }); return;
      }
      if (path === "/assistant-api/homework-context" && request.method === "GET" && options.learning) {
        const rawDate = new URL(request.url!, options.origin).searchParams.get("date");
        const date = rawDate ? DaySchema.safeParse(rawDate) : undefined;
        if (date && !date.success) throw new HttpError(400, "请选择有效作业日期。");
        json(response, 200, options.learning.context(date?.data, digest(token))); return;
      }
      if (path === "/assistant-api/memories" && request.method === "GET" && options.learning) {
        json(response, 200, { items: options.learning.memories.list() }); return;
      }
      const memoryPath = path.match(/^\/assistant-api\/memories\/([a-f0-9-]{36})\/revoke$/);
      if (memoryPath && request.method === "POST" && options.learning) {
        if (!z.object({}).strict().safeParse(await jsonBody(request, 1024)).success) throw new HttpError(400, "请从记忆卡片停用这条记忆。");
        json(response, 200, options.learning.memories.revoke(memoryPath[1])); return;
      }
      const clarificationPath = path.match(/^\/assistant-api\/clarifications\/([a-f0-9-]{36})\/(confirm|undo)$/);
      if (clarificationPath && request.method === "POST" && options.learning) {
        if (!z.object({}).strict().safeParse(await jsonBody(request, 1024)).success) throw new HttpError(400, "请从修改预览卡片确认操作。");
        const result = clarificationPath[2] === "confirm" ? options.learning.confirm(clarificationPath[1], digest(token)) : options.learning.undo(clarificationPath[1], digest(token));
        json(response, 200, result); return;
      }
      if (path.startsWith("/assistant-api/learning/") && options.homework) { await options.homework.handle(request, response); return; }
      if (request.method !== "POST") throw new HttpError(405, "请求方式不支持。");
      if (active >= 2) throw new HttpError(429, "小助手正在回答问题，请稍等一下。");
      active++;
      try {
        if (path === "/assistant-api/chat") {
          const input = ChatInputSchema.safeParse(await jsonBody(request, 1_900_000));
          if (!input.success) throw new HttpError(400, "问题太长或内容不完整，请换个短一点的问题。");
          chatPhotos(input.data); // Validate image bytes before reserving a model call.
          options.store.reserve("chat", token);
          const result = input.data.readingMode && options.reading && viewer ? await options.reading.answer(options.ai(abort.signal), input.data, viewer) : options.learning ? await options.learning.answer(options.ai(abort.signal), input.data, digest(token), viewer) : await answerTutor(options.ai(abort.signal), { ...input.data, materials: [] });
          for (const [id, reply] of replies) if (reply.expires < Date.now()) replies.delete(id);
          while (replies.size >= 100) replies.delete(replies.keys().next().value!);
          const id = randomUUID();
          replies.set(id, { owner: digest(token), text: result.spokenAnswer, expires: Date.now() + 15 * 60_000 });
          json(response, 200, { id, ...result }); return;
        }
        if (path === "/assistant-api/transcribe") {
          if (!options.speech) throw new HttpError(503, "语音暂未开通，可以打字提问。");
          if (request.headers["content-type"] !== "audio/wav") throw new HttpError(415, "请通过录音按钮提问。");
          const audio = await body(request, 1_000_000);
          try { validateRecording(audio); } catch (error) { throw new HttpError(400, (error as Error).message); }
          options.store.reserve("asr", token);
          json(response, 200, { text: await options.speech.transcribe(audio, abort.signal) }); return;
        }
        if (path === "/assistant-api/speech") {
          if (!options.speech) throw new HttpError(503, "语音暂未开通。");
          const input = z.object({ id: z.string().uuid() }).strict().safeParse(await jsonBody(request, 1024));
          const reply = input.success ? replies.get(input.data.id) : undefined;
          if (!reply || reply.expires < Date.now() || reply.owner !== digest(token)) throw new HttpError(404, "这条回答的朗读已过期，可以重新提问。");
          options.store.reserve("tts", token);
          const audio = await options.speech.speak(reply.text, abort.signal);
          response.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": audio.byteLength }); response.end(audio); return;
        }
        throw new HttpError(404, "没有找到这个功能。");
      } finally { active--; }
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      if (error instanceof HttpError || error instanceof HomeworkError) json(response, error.status, { error: error.message });
      else if (error instanceof AssistantLimitError) json(response, 429, { error: error.message });
      else {
        const requestId = randomUUID().slice(0, 8);
        const code = error instanceof AIServiceError && /^[A-Z0-9_]{1,48}$/.test(error.code) ? error.code : "UNEXPECTED";
        // Never log questions, model responses, document IDs, audio, cookies, or credentials.
        console.warn("Assistant request failed", JSON.stringify({ operation, code, requestId }));
        json(response, 503, { error: error instanceof AIServiceError ? aiErrorMessage(error, operation) : "小助手暂时不可用，请稍后重试。", code, requestId });
      }
    }
  });
  server.requestTimeout = 180_000; server.headersTimeout = 10_000; server.maxHeadersCount = 30;
  return server;
}
