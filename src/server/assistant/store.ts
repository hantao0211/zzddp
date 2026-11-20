import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const StateSchema = z.object({
  version: z.literal(1), day: z.string(),
  usage: z.object({ chat: z.number().int().nonnegative(), asr: z.number().int().nonnegative(), tts: z.number().int().nonnegative() }),
  sessions: z.array(z.object({ hash: z.string().length(64), expires: z.number() })).max(20),
  authHits: z.array(z.object({ ip: z.string().length(64), at: z.number() })).max(60),
});
export type AssistantLimits = { chat: number; asr: number; tts: number };
const DEFAULT_LIMITS: AssistantLimits = { chat: 100, asr: 30, tts: 40 };
export function readAssistantLimits(env: Record<string, string | undefined> = process.env): AssistantLimits {
  const limits = { ...DEFAULT_LIMITS };
  for (const kind of ["chat", "asr", "tts"] as const) {
    const raw = env[`ASSISTANT_DAILY_${kind.toUpperCase()}_LIMIT`];
    if (raw !== undefined) {
      if (!/^[1-9]\d{0,3}$/.test(raw) || Number(raw) > 5000) throw new Error("Invalid assistant daily limit");
      limits[kind] = Number(raw);
    }
  }
  return limits;
}
export class AssistantLimitError extends Error {}
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");

export class AssistantStore {
  private state: z.infer<typeof StateSchema>;
  private path: string;
  private recent = new Map<string, number[]>();
  constructor(directory: string, private now = Date.now, private limits: AssistantLimits = DEFAULT_LIMITS) {
    if (Object.values(limits).some((n) => !Number.isInteger(n) || n < 1 || n > 5000)) throw new Error("Invalid assistant daily limit");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, "state.json");
    // Corrupt or incompatible state is never silently reset: limits fail closed.
    this.state = existsSync(this.path) ? StateSchema.parse(JSON.parse(readFileSync(this.path, "utf8"))) : { version: 1, day: "", usage: { chat: 0, asr: 0, tts: 0 }, sessions: [], authHits: [] };
  }
  private save() {
    const temporary = this.path + ".next";
    const fd = openSync(temporary, "w", 0o600);
    try { writeFileSync(fd, JSON.stringify(this.state)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, this.path);
  }
  private clean() {
    const time = this.now();
    this.state.sessions = this.state.sessions.filter((item) => item.expires > time);
    this.state.authHits = this.state.authHits.filter((item) => item.at > time - 10 * 60_000);
  }
  loginAttempt(ip: string) {
    this.clean();
    const hash = digest(ip);
    if (this.state.authHits.length >= 60 || this.state.authHits.filter((item) => item.ip === hash).length >= 5) throw new AssistantLimitError("尝试次数较多，请10分钟后再试。");
    this.state.authHits.push({ ip: hash, at: this.now() });
    this.save();
  }
  createSession() {
    this.clean();
    const token = randomBytes(32).toString("base64url");
    this.state.sessions = [...this.state.sessions.slice(-19), { hash: digest(token), expires: this.now() + 30 * 86400_000 }];
    this.save();
    return token;
  }
  authenticate(token: string) {
    this.clean();
    return /^[A-Za-z0-9_-]{43}$/.test(token) && this.state.sessions.some((item) => item.hash === digest(token));
  }
  logout(token: string) {
    this.state.sessions = this.state.sessions.filter((item) => item.hash !== digest(token));
    this.recent.delete(digest(token));
    this.save();
  }
  reserve(kind: "chat" | "asr" | "tts", session: string) {
    const time = this.now();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
    if (day !== this.state.day) { this.state.day = day; this.state.usage = { chat: 0, asr: 0, tts: 0 }; }
    const key = digest(session);
    const hits = (this.recent.get(key) || []).filter((value) => value > time - 60_000);
    if (hits.length >= 10) throw new AssistantLimitError("请求比较密集，请等一分钟再试。");
    if (this.state.usage[kind] >= this.limits[kind]) {
      const nextStep = { chat: "今天的小助手问答已达到家庭限额，请明天再来。", asr: "今天的语音输入次数已达到家庭限额，仍可打字提问；明天会恢复语音输入。", tts: "今天的回答朗读次数已达到家庭限额，文字回答已保留，仍可继续提问。" };
      throw new AssistantLimitError(nextStep[kind]);
    }
    this.state.usage[kind]++;
    this.save(); // Reserve before making a paid call; failures do not auto-retry.
    this.recent.set(key, [...hits, time]);
  }
}
