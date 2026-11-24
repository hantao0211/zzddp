import type { HomeworkSnapshot, UploadView } from "@/domain/homework";
import type { HomeworkScope } from "@/domain/homework-scope";
import {operationLabels,withOperationFeedback} from "./operation-feedback";
export class HomeworkRequestError extends Error { constructor(public status: number, message: string) { super(message); } }
const base = "/assistant-api/learning";
export async function homeworkRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith("/assistant-api/") ? path : base + path;
  return withOperationFeedback(operationLabels(url, init.method || "GET"), async () => {
    let response: Response, result;
    try { response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store" }); result = await response.json(); }
    catch (error) { if (init.signal?.aborted) throw error; throw new Error(!init.method || init.method === "GET" ? "服务器暂未响应，请稍后刷新。" : "未收到服务器确认，请先查看记录后再重试，避免重复操作。"); }
    if (!response.ok) throw new HomeworkRequestError(response.status, result.error || "请求未完成，请重试。");
    return result as T;
  });
}
export const getHomework = (date: string, signal?: AbortSignal) => homeworkRequest<HomeworkSnapshot>(`/state?date=${date}`, { signal });
export const homeworkPost = <T,>(path: string, value: unknown = {}) => homeworkRequest<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
export async function uploadHomework(date: string, kind: "memo" | "homework", files: File[], onProgress: (text: string) => void, targetTaskId?: string, scope?: HomeworkScope) {
  return withOperationFeedback({pending: kind === "memo" ? "正在上传备忘录，请稍候…" : "正在上传作业，请稍候…", success: "资料已收到，识别和批改会在后台继续。无需重复上传。"}, async () => {
  onProgress("正在检查文件…");
  const metadata = [];
  for (const file of files) {
    const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    metadata.push({ name: file.name, size: file.size, sha256: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("") });
  }
  const upload = await homeworkPost<UploadView>("/uploads", { date, kind, files: metadata, ...(targetTaskId ? { targetTaskId } : {}), ...(scope ? { scope } : {}) });
  if (upload.status !== "uploading") { onProgress("这批资料已保存，无需重复上传。"); return upload; }
  for (let i = 0; i < files.length; i++) {
    onProgress(`正在上传 ${i + 1}/${files.length}：${files[i].name}`);
    if (upload.files[i].stored) continue;
    const result = await fetch(`${base}/files/${upload.files[i].id}`, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/octet-stream" }, body: files[i] });
    if (!result.ok) { const error = await result.json().catch(() => ({})); throw new HomeworkRequestError(result.status, error.error || "上传中断，请重试这批资料；已成功的文件会跳过。"); }
  }
  return homeworkPost<UploadView>(`/uploads/${upload.id}/finish`);
  });
}
