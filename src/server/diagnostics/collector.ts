import { appendFileSync, openSync, readSync, closeSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createSocket } from "node:dgram";
import { diagnosticPort, type Diagnostic } from "./events";

const DAY = 86_400_000;
const shanghaiDay = (t: number) => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
type Lane = "ops" | "errors";
type Repeat = { event: Diagnostic; since: number; count: number };

export function decodePacket(packet: Buffer): Diagnostic | undefined {
  if (packet.length > 8192) return;
  const raw = packet.toString();
  if (/^<\d{1,3}>.{0,100} xiaobu_gateway: /.test(raw)) {
    const reason = raw.split(", client:")[0];
    const code = reason.includes("upstream timed out") ? "UPSTREAM_TIMEOUT" :
      reason.includes("connect() failed") ? "UPSTREAM_CONNECT" :
      reason.includes("too large body") ? "UPLOAD_TOO_LARGE" : "GATEWAY_ERROR";
    return { event: "gateway", error: true, code };
  }
  if (raw.length > 512 || !raw.startsWith("{")) return;
  let data;
  try { data = JSON.parse(raw); } catch { return; }
  if (typeof data.event !== "string" || !/^[a-z][a-z.]{0,39}$/.test(data.event)) return;
  const event: Diagnostic = { event: data.event, error: data.error === true };
  if (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(data.method)) event.method = data.method;
  if (typeof data.code === "string" && /^[A-Z][A-Z0-9_]{0,47}$/.test(data.code)) event.code = data.code;
  if (typeof data.ref === "string" && /^[0-9a-f]{8}$/.test(data.ref)) event.ref = data.ref;
  if (["inspection", "verification", "recheck", "saving", "generation", "grading"].includes(data.stage)) event.stage = data.stage;
  for (const key of ["status", "ms", "attempt"] as const) {
    if (Number.isSafeInteger(data[key]) && data[key] >= 0 && data[key] <= 1e9) event[key] = data[key];
  }
  return event;
}

export class DiagnosticFiles {
  private day = "";
  private size = { ops: 0, errors: 0 };
  private capped = { ops: false, errors: false };
  private repeats = new Map<string, Repeat>();
  constructor(private directory: string, private now = Date.now, private limits = { ops: 1_000_000, errors: 4_000_000 }) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.maintain();
  }
  private append(lane: Lane, data: object, time: number) {
    if (this.capped[lane]) return;
    const file = join(this.directory, this.day + "-" + lane + ".jsonl");
    let terminal = false;
    let line = JSON.stringify({ at: new Date(time).toISOString(), ...data }) + "\n";
    const remaining = this.limits[lane] - this.size[lane];
    if (Buffer.byteLength(line) + 96 > remaining) {
      line = JSON.stringify({ at: new Date(time).toISOString(), event: "daily.limit" }) + "\n";
      if (Buffer.byteLength(line) > remaining) { this.capped[lane] = true; return; }
      terminal = true;
    }
    appendFileSync(file, line, { mode: 0o600 });
    this.capped[lane] = terminal;
    this.size[lane] += Buffer.byteLength(line);
  }
  maintain() {
    const time = this.now(), day = shanghaiDay(time);
    for (const [key, group] of this.repeats) {
      if (day !== this.day || time - group.since >= 60_000) {
        if (group.count) this.append("errors", { event: group.event.event, code: group.event.code, status: group.event.status, stage: group.event.stage, repeated: group.count }, group.since);
        this.repeats.delete(key);
      }
    }
    if (day === this.day) return;
    const oldest = shanghaiDay(time - 9 * DAY);
    const sizes = { ops: 0, errors: 0 };
    const capped = { ops: false, errors: false };
    for (const name of readdirSync(this.directory)) {
      const m = /^(\d{4}-\d{2}-\d{2})-(ops|errors)\.jsonl$/.exec(name);
      if (!m) continue;
      const file = join(this.directory, name);
      if (m[1] < oldest) unlinkSync(file);
      else if (m[1] === day) {
        const lane = m[2] as Lane;
        const size = sizes[lane] = statSync(file).size;
        const tail = Buffer.alloc(Math.min(size, 96));
        const fd = openSync(file, "r");
        try { readSync(fd, tail, 0, tail.length, size - tail.length); }
        finally { closeSync(fd); }
        capped[lane] = tail.toString().includes('"event":"daily.limit"') || size + 96 >= this.limits[lane];
      }
    }
    this.day = day; this.size = sizes;
    this.capped = capped;
  }
  write(data: Diagnostic) {
    const time = this.now();
    if (shanghaiDay(time) !== this.day) this.maintain();
    if (data.error) {
      const key = [data.event, data.status, data.stage, data.code].join("|");
      const group = this.repeats.get(key);
      if (group && time - group.since < 60_000) { group.count++; return; }
      if (group) this.maintain();
      if (this.repeats.size < 512) this.repeats.set(key, { event: data, since: time, count: 0 });
    }
    this.append(data.error ? "errors" : "ops", data, time);
  }
}

if (require.main === module) {
  const files = new DiagnosticFiles(process.env.LOGS_DIRECTORY || "/var/log/xiaobu-diagnostics");
  const socket = createSocket("udp4");
  socket.on("message", packet => { const event = decodePacket(packet); if (event) files.write(event); });
  socket.bind(diagnosticPort, "127.0.0.1");
  setInterval(() => files.maintain(), 30_000).unref();
}
