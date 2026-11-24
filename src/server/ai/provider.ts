import { z } from "zod";
import { AI_INSTRUCTIONS, AI_SYSTEM_INSTRUCTIONS, type AITask } from "@/domain/ai-contracts";

export type AIImage = { fileId: string; mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string };
export type AIConfiguration = { provider: "deepseek" | "openai"; apiKey: string; model: string };
export class AIServiceError extends Error {
  constructor(public code: string, public retryable: boolean, message: string) { super(message); }
}

export function readAIConfiguration(env: Record<string, string | undefined> = process.env): AIConfiguration {
  if (typeof window !== "undefined") throw new Error("AI接口只能在服务器上调用。");
  if (env.STUDY_AI_PROVIDER === "deepseek" && env.DEEPSEEK_API_KEY) return { provider: "deepseek", apiKey: env.DEEPSEEK_API_KEY, model: env.STUDY_AI_MODEL || "deepseek-flash" };
  if (env.STUDY_AI_PROVIDER === "openai" && env.OPENAI_API_KEY && env.STUDY_AI_MODEL) return { provider: "openai", apiKey: env.OPENAI_API_KEY, model: env.STUDY_AI_MODEL };
  throw new AIServiceError("AI_UNCONFIGURED", false, "后台AI尚未配置，原件应保留等待处理，不能伪造识别结果。");
}

export interface StructuredAI {
  run<T>(task: AITask, schema: z.ZodType<T>, metadata: unknown, images?: AIImage[]): Promise<T>;
}

export function validateAIImages(images: AIImage[]) {
    if (images.length > 20 || images.reduce((size, image) => size + image.base64.length, 0) > 24 * 1024 * 1024 || images.some((image) => !image.base64 || image.base64.length > 14 * 1024 * 1024)) throw new AIServiceError("INVALID_IMAGES", false, "图片数量或大小超限，需要先拆分及压缩页面。");
}

export class VisionAI implements StructuredAI {
  constructor(private config: AIConfiguration, private request: typeof fetch = fetch) {}

  async run<T>(task: AITask, schema: z.ZodType<T>, metadata: unknown, images: AIImage[] = []): Promise<T> {
    validateAIImages(images);
    const userText = `${AI_INSTRUCTIONS[task]}\nJSON Schema：${JSON.stringify(z.toJSONSchema(schema))}\n任务数据：${JSON.stringify(metadata)}\n图片顺序：${JSON.stringify(images.map((image) => image.fileId))}`;
    const isDeepSeek = this.config.provider === "deepseek";
    const detailed = ["read_marked_exam", "generate_practice", "verify_practice", "index_curriculum", "grade_practice", "grade_homework", "verify_homework_grading", "assess_written_completion", "recheck_written_parts"].includes(task);
    const body = isDeepSeek ? {
      model: this.config.model,
      messages: [{ role: "system", content: AI_SYSTEM_INSTRUCTIONS }, { role: "user", content: [{ type: "text", text: userText }, ...images.map((image) => ({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } }))] }],
      response_format: { type: "json_object" }, max_tokens: ["tutor_answer", "reading_review", "reading_dialogue"].includes(task) ? 2048 : task === "homework_dialogue" ? 4096 : detailed ? 16000 : 8192,
      ...(["tutor_answer", "homework_dialogue", "reading_review", "reading_dialogue", "organize_homework"].includes(task) ? { thinking: { type: "disabled" } } : {}),
    } : {
      model: this.config.model, store: false, instructions: AI_SYSTEM_INSTRUCTIONS,
      input: [{ role: "user", content: [{ type: "input_text", text: userText }, ...images.map((image) => ({ type: "input_image", image_url: `data:${image.mimeType};base64,${image.base64}`, detail: "high" }))] }],
      text: { format: { type: "json_object" } }, max_output_tokens: detailed ? 16000 : 8192,
    };
    let response: Response;
    try {
      response = await this.request(isDeepSeek ? "https://api.deepseek.com/chat/completions" : "https://api.openai.com/v1/responses", {
        method: "POST", headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
      });
    } catch { throw new AIServiceError("NETWORK_ERROR", true, "AI服务暂时不可达，任务应保留后重试。"); }
    if (!response.ok) throw new AIServiceError(`HTTP_${response.status}`, response.status === 429 || response.status >= 500, `AI服务返回${response.status}，不会将未处理资料标记为已完成。`);
    let payload: { choices?: { finish_reason?: string; message?: { content?: string } }[]; status?: string; output?: { content?: { type?: string; text?: string }[] }[] };
    try { payload = await response.json(); if (!payload || typeof payload !== "object") throw new Error("Invalid envelope"); }
    catch { throw new AIServiceError("INVALID_ENVELOPE", true, "AI响应格式不完整，结果未发布。"); }
    if ((isDeepSeek && payload.choices?.[0]?.finish_reason !== "stop") || (!isDeepSeek && payload.status !== "completed")) throw new AIServiceError("INCOMPLETE_RESPONSE", true, "AI输出未完整结束，结果未发布。");
    const text = isDeepSeek ? payload.choices?.[0]?.message?.content : payload.output?.flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text || "").join("");
    try { return schema.parse(JSON.parse(text || "")); }
    catch { throw new AIServiceError("INVALID_RESULT", true, "AI结果不符合数据要求，保留原件等待重试。"); }
  }
}
