import { validateRecording } from "@/domain/assistant";

export function encodeRecording(chunks: Float32Array[], sampleRate: number) {
  const length = Math.min(chunks.reduce((sum, chunk) => sum + chunk.length, 0), sampleRate * 30);
  const input = new Float32Array(length); let offset = 0;
  for (const chunk of chunks) { const take = Math.min(chunk.length, length - offset); input.set(chunk.subarray(0, take), offset); offset += take; if (offset >= length) break; }
  const count = Math.floor(length * 16000 / sampleRate);
  const bytes = new Uint8Array(44 + count * 2), view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => [...value].forEach((letter, index) => view.setUint8(at + index, letter.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * sampleRate / 16000), end = Math.min(length, Math.max(start + 1, Math.floor((i + 1) * sampleRate / 16000)));
    let sum = 0; for (let j = start; j < end; j++) sum += input[j];
    const value = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  validateRecording(bytes);
  return new Blob([bytes], { type: "audio/wav" });
}

export type VoiceRecording = { stop(): Blob; cancel(): void };
export async function createVoiceRecording(signal: AbortSignal, onLimit: () => void): Promise<VoiceRecording> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("这台设备暂时不能录音，可以直接打字提问。");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
  if (signal.aborted) { stream.getTracks().forEach((track) => track.stop()); throw new DOMException("Cancelled", "AbortError"); }
  const Constructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) { stream.getTracks().forEach((track) => track.stop()); throw new Error("这台设备暂时不能录音，可以直接打字提问。"); }
  const context = new Constructor();
  let processor: ScriptProcessorNode | undefined, source: MediaStreamAudioSourceNode | undefined, mute: GainNode | undefined, timer: ReturnType<typeof setTimeout> | undefined, active = true;
  const chunks: Float32Array[] = [];
  const cleanup = () => {
    active = false; clearTimeout(timer); processor?.disconnect(); source?.disconnect(); mute?.disconnect();
    if (processor) processor.onaudioprocess = null;
    stream.getTracks().forEach((track) => track.stop()); void context.close().catch(() => undefined);
    signal.removeEventListener("abort", cleanup);
  };
  try {
    signal.addEventListener("abort", cleanup, { once: true });
    await context.resume();
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    source = context.createMediaStreamSource(stream); processor = context.createScriptProcessor(4096, 1, 1); mute = context.createGain(); mute.gain.value = 0;
    processor.onaudioprocess = (event) => { if (active) chunks.push(new Float32Array(event.inputBuffer.getChannelData(0))); };
    source.connect(processor); processor.connect(mute); mute.connect(context.destination);
    timer = setTimeout(onLimit, 30_000);
    return { stop() { if (!active) throw new Error("录音已经结束。"); cleanup(); return encodeRecording(chunks, context.sampleRate); }, cancel: cleanup };
  } catch (error) { cleanup(); throw error; }
}
