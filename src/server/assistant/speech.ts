import { z } from "zod";
import { AIServiceError } from "../ai/provider";

export interface SpeechServices {
  transcribe(audio: Uint8Array, signal: AbortSignal): Promise<string>;
  speak(text: string, signal: AbortSignal): Promise<Uint8Array>;
}
export async function boundedResponse(response: Response, maximum: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new AIServiceError("EMPTY_RESPONSE", true, "语音服务没有返回内容。");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maximum) throw new AIServiceError("RESPONSE_TOO_LARGE", false, "语音内容过长，请分成更短的问题。");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks);
}
export class DeepSeekSpeech implements SpeechServices {
  constructor(private key: string, private request: typeof fetch = fetch) {}
  private async call(path: string, body: BodyInit, signal: AbortSignal, json = false) {
    let response: Response;
    try {
      response = await this.request(`https://api.deepseek.com/v1/tools/${path}`, {
        method: "POST", headers: { Authorization: `Bearer ${this.key}`, ...(json ? { "Content-Type": "application/json" } : {}) },
        body, signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
      });
    } catch { throw new AIServiceError("SPEECH_NETWORK", true, "语音服务暂时连接不上，可以继续打字提问。"); }
    if (!response.ok) { await response.body?.cancel(); throw new AIServiceError(`SPEECH_HTTP_${response.status}`, false, "语音服务暂时不可用，可以继续打字提问。"); }
    return response;
  }
  async transcribe(audio: Uint8Array, signal: AbortSignal) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "question.wav");
    const response = await this.call("asr", form, signal);
    const result = z.object({ text: z.string().trim().min(1).max(1200) }).safeParse(JSON.parse((await boundedResponse(response, 32768)).toString("utf8")));
    if (!result.success) throw new AIServiceError("NO_SPEECH", false, "没有听清这个问题，请再说一次或改用打字。");
    return result.data.text;
  }
  async speak(text: string, signal: AbortSignal) {
    const response = await this.call("tts", JSON.stringify({ text: text.slice(0, 350), voice_id: "stella", format: "wav", filter_markdown: true }), signal, true);
    const audio = await boundedResponse(response, 8 * 1024 * 1024);
    if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") throw new AIServiceError("INVALID_AUDIO", false, "朗读没有完成，请稍后再试。");
    return audio;
  }
}
