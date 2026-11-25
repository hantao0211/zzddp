import { createSocket, type Socket } from "node:dgram";
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";

export const diagnosticPort = 13092;
export type Diagnostic = {
  event: string; error?: boolean; status?: number; code?: string; ref?: string;
  ms?: number; attempt?: number; stage?: string; method?: string;
};
let socket: Socket | undefined;
export function enableDiagnostics() {
  socket = createSocket("udp4");
  socket.on("error", () => {});
  socket.unref();
}
export function record(data: Diagnostic) {
  socket?.send(JSON.stringify(data), diagnosticPort, "127.0.0.1", () => {});
}
export function failureCode(error: unknown): string {
  if (typeof error !== "object" || !error) return "UNEXPECTED";
  if ("code" in error && typeof error.code === "string" && /^[A-Z][A-Z0-9_]{0,47}$/.test(error.code)) return error.code;
  if ("status" in error && Number.isInteger(error.status)) return "LOCAL_" + error.status;
  return "UNEXPECTED";
}

const causes = new WeakMap<ServerResponse, string>();
export function noteFailure(response: ServerResponse, error: unknown) {
  causes.set(response, failureCode(error));
}

// Only fixed labels reach disk. Unknown URLs, file names and database keys never become labels.
const routes: [RegExp, string][] = [
  [/^session$/, "session"],
  [/^parent-setup$|^admin\//, "family.settings"],
  [/^learning\/uploads$/, "upload.start"],
  [/^learning\/uploads\/[\da-f-]+\/finish$/, "upload.finish"],
  [/^learning\/uploads\/[\da-f-]+\/retry$|^learning\/retry-day$/, "upload.retry"],
  [/^learning\/grading\/retry$/, "grading.retry"],
  [/^learning\/grading\/start$/, "grading.start"],
  [/^learning\/task-completion$/, "homework.completion"],
  [/^learning\/completion-feedback(?:\/convention)?$/, "homework.feedback"],
  [/^memo-entries\/update$|^learning\/day-plan$/, "homework.plan"],
  [/^learning\/practice\/exams$/, "exam.upload"],
  [/^learning\/practice\/exam-pages\/[\da-f-]+\/(retry|review|photo|explain|learn)$/, "exam.page"],
  [/^learning\/practice\/(items\/|generate$)/, "practice.task"],
  [/^learning\/practice\/milestone-goals(?:\/|$)/, "exam.goal"],
  [/^learning\/practice\/milestones\/[a-f0-9]+\/context$/, "exam.context"],
  [/^reading\/logs(?:\/|$)/, "reading.checkin"],
  [/^reading\/activities(?:\/|$)/, "activity.record"],
  [/^reading\/redemptions(?:\/|$)/, "shop.redeem"],
  [/^reading\/rewards(?:\/|$)/, "shop.reward"],
];
export function observeRequest(res: ServerResponse, method: string | undefined, path: string, emit = record) {
  const ref = randomUUID().slice(0, 8);
  res.setHeader("X-Request-Id", ref);
  const api = path.replace(/^\/assistant-api\//, "");
  const operation = routes.find(([pattern]) => pattern.test(api))?.[1];
  const area = ["learning", "reading", "admin", "chat", "transcribe", "speech"].find(key => api === key || api.startsWith(key + "/"));
  const uploadFile = /^learning\/files\/[a-f0-9-]+$/.test(api) && method === "PUT";
  const event = operation || (uploadFile ? "upload.file" : area) || "api";
  const write = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  const start = Date.now();
  const trace = { ref, code: undefined as string | undefined };
  function finish(status: number) {
    const error = status >= 500 || status === 429 || status === 413 || ((!!operation || uploadFile) && write && status >= 400);
    if (error || (operation && write && status < 400)) {
      emit({ event, status, error, ref, method, code: trace.code || causes.get(res), ms: Math.max(0, Date.now() - start) });
    }
  }
  res.once("finish", () => finish(res.statusCode));
  res.once("close", () => { if (!res.writableFinished && write && (operation || uploadFile)) finish(499); });
  return trace;
}
