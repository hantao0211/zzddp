import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiagnosticFiles, decodePacket } from "../src/server/diagnostics/collector";
import { observeRequest, type Diagnostic } from "../src/server/diagnostics/events";

test("only key mutations and failures are recorded; error reference matches the response", async () => {
  const events: Diagnostic[] = [];
  const server = createServer((req, res) => {
    const path = req.url!.split("?")[0];
    const trace = observeRequest(res, req.method, path, e => events.push(e));
    if (path.endsWith("/chat")) { trace.code = "INVALID_RESULT"; res.statusCode = 503; }
    res.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = "http://127.0.0.1:" + address.port + "/assistant-api/";
    for (const [route, method] of [["status","GET"], ["reading/state","GET"], ["reading/lookup","POST"], ["reading/logs?secret=private","POST"]]) await fetch(base + route, { method });
    const error = await fetch(base + "chat", { method: "POST" });
    assert.deepEqual(events.map(e => e.event), ["reading.checkin", "chat"]);
    assert.equal(events[1].ref, error.headers.get("x-request-id"));
    assert.equal(events[1].code, "INVALID_RESULT");
    assert.equal(events[1].error, true);
    assert.ok(!JSON.stringify(events).includes("private"));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("gateway messages and incoming fields are reduced to diagnostic labels", () => {
  const gateway = "<187>Nov 26 09:00:00 host xiaobu_gateway: 123#123: *7 connect() failed (111: Connection refused), client: 192.0.2.2, request: secret";
  assert.deepEqual(decodePacket(Buffer.from(gateway)), { event: "gateway", error: true, code: "UPSTREAM_CONNECT" });
  assert.deepEqual(decodePacket(Buffer.from(JSON.stringify({ event: "exam.process", code: "raw private text", ref: "private", stage: "private", body: "private", cookie: "private" }))), { event: "exam.process", error: false });
  assert.equal(decodePacket(Buffer.from("arbitrary input")), undefined);
});

test("separate byte budgets survive restarts and error storms are condensed", () => {
  const dir = mkdtempSync(join(tmpdir(),"xb-diag-"));
  try {
    let now = Date.parse("2026-11-25T10:00:00Z");
    const limits = { ops: 520, errors: 680 };
    let files = new DiagnosticFiles(dir, () => now, limits);
    for (let i = 0; i < 100; i++) files.write({ event: "upload.finish" });
    const opPath = join(dir,"2026-11-25-ops.jsonl"), errorPath = join(dir,"2026-11-25-errors.jsonl");
    const before = readFileSync(opPath,"utf8"); assert.ok(before.includes("daily.limit"));
    files = new DiagnosticFiles(dir, () => now, limits);
    files.write({ event: "upload.finish" }); assert.equal(readFileSync(opPath,"utf8"),before);
    for (let i = 0; i < 100; i++) files.write({ event: "exam.process", error: true, code: "TIMEOUT" });
    now += 61_000; files.maintain();
    assert.match(readFileSync(errorPath,"utf8"), /"repeated":99/);
    for (let i = 0; i < 100; i++) files.write({ event:"gateway", code:"HTTP_" + i, error: true });
    assert.ok(statSync(errorPath).size <= limits.errors && statSync(opPath).size <= limits.ops);
    assert.match(readFileSync(errorPath,"utf8"), /daily.limit/);
    assert.equal(statSync(errorPath).mode & 0o777, 0o600);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("retention follows Shanghai midnight even on an idle day and skips unrelated files", () => {
  const dir = mkdtempSync(join(tmpdir(),"xb-diag-"));
  try {
    let now = Date.parse("2026-12-01T15:59:59Z");
    for (const name of ["2026-11-21-errors.jsonl","2026-11-22-ops.jsonl","2026-11-23-errors.jsonl","notes.txt"]) writeFileSync(join(dir,name),"");
    const files = new DiagnosticFiles(dir, () => now);
    assert.ok(!readdirSync(dir).includes("2026-11-21-errors.jsonl"));
    assert.ok(readdirSync(dir).includes("2026-11-22-ops.jsonl"));
    now += 1000; files.maintain(); files.write({ event:"service.ready" });
    assert.deepEqual(readdirSync(dir).sort(),["2026-11-23-errors.jsonl","2026-12-02-ops.jsonl","notes.txt"]);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
