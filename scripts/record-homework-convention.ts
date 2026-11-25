// Record a family convention already explicitly confirmed outside the app.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, realpathSync } from "node:fs";
import { z } from "zod";
import { isHomeworkRule, MemoryCandidateSchema } from "../src/domain/memory";
import { rememberCandidates } from "../src/server/homework/memory";

const [database, flag] = process.argv.slice(2);
if (!database || (flag && flag !== "--apply")) throw Error("Usage: record-homework-convention <homework.sqlite> [--apply] < private-input.json");
const input = z.object({
  date: z.iso.date(), kind: MemoryCandidateSchema.shape.kind,
  subject: MemoryCandidateSchema.shape.subject, trigger: MemoryCandidateSchema.shape.trigger,
  quote: z.string().trim().min(8).max(600), replacesMemoryId: z.string().uuid().optional(),
}).strict().parse(JSON.parse(readFileSync(0, "utf8")));
if (!isHomeworkRule(input.kind) && input.kind !== "memo_abbreviation") throw Error("Expected a homework convention or memo abbreviation.");
const candidate = MemoryCandidateSchema.parse({ kind: input.kind, subject: input.subject, trigger: input.trigger, summary: input.quote,
  evidenceQuote:input.quote, replacesMemoryId:input.replacesMemoryId || null });
const db = new DatabaseSync(realpathSync(database));
try {
  db.exec("PRAGMA busy_timeout=5000");
  const transaction = <T>(action: () => T) => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = action(); db.exec(flag === "--apply" ? "COMMIT" : "ROLLBACK"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  const result = rememberCandidates({db, now: Date.now, transaction}, [candidate], input.quote, input.date, [], true);
  console.log(JSON.stringify({applied:flag === "--apply" && result.saved.length > 0, changes:result.saved.length, notices:result.notices}));
  if (result.notices.length) process.exitCode = 1;
} finally { db.close(); }
