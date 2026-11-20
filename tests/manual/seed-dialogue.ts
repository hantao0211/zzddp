// Synthetic-only fixture setup for the isolated dialogue acceptance environment.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { HomeworkStore } from "../../src/server/homework/store";
const directory = process.env.DIALOGUE_QA_DIRECTORY || "";
if (!directory.endsWith("/xiaobu-dialogue-qa/learning")) throw new Error("Refuse to seed outside isolated dialogue QA");
const date = "2026-11-18", store = new HomeworkStore(directory);
if (store.db.prepare("SELECT id FROM uploads LIMIT 1").get()) throw new Error("Refuse to overwrite existing fixture state");
const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWHkAAAAASUVORK5CYII=", "base64");
const upload = store.begin({ date, kind: "memo", files: [{ name: "synthetic-memo.png", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }] });
const file = upload.files[0]; writeFileSync(join(directory, "originals", file.id), bytes, { mode: 0o600 });
store.stored(file.id, "image/png"); store.finalize(upload.id); const job = store.claim()!;
const result = { date, readable: true, assignments: [
  { subject: "数学", title: "数学练习", requirement: "完成数学练习册第32页", format: "written", evidence: [{ fileId: file.id + "-p1", page: 1, excerpt: "数学：练习册32页" }] },
  { subject: null, title: "复9（科目不清）", requirement: "复9，科目和数字含义未确定", format: "other", evidence: [{ fileId: file.id + "-p1", page: 1, excerpt: "复9" }] },
], uncertainties: ["复9的科目看不清，不能确定。", "9指第9课还是第9页不确定。"] };
store.recognized(job, result, ["数学"], true, 10, "Synthetic fixture: one unresolved memo entry");
writeFileSync(join(directory, "fixture-source-hash"), createHash("sha256").update(JSON.stringify(result)).digest("hex"), { mode: 0o600 });
store.close(); console.log("SYNTHETIC_DIALOGUE_FIXTURE_READY");
