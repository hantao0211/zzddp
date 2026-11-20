// Paid visual acceptance uses generated arithmetic pages, never a family archive.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VisionAI, readAIConfiguration } from "../../src/server/ai/provider";
import { WrittenInspectionSchema, evaluateWrittenInspection } from "../../src/domain/written-completion";
async function main() {
  const directory = process.env.WRITTEN_SYNTHETIC_PHOTOS || "";
  assert.ok(directory.endsWith("/synthetic-written-photos"));
  await Promise.all(["done", "incomplete"].map(async label => {
    const pageId = `synthetic-${label}-page`;
    const value = await new VisionAI(readAIConfiguration()).run("assess_written_completion", WrittenInspectionSchema, { title: "数学第12页", requirement: "完成第12页第1、2题", pages: [{ fileId: pageId, page: 1, printedPage: "12" }] }, [{ fileId: pageId, mimeType: "image/png", base64: readFileSync(join(directory, label + ".png")).toString("base64") }]);
    assert.ok(value.parts.every(p => p.evidence.fileId === pageId && (p.evidence.page === 1 || p.evidence.page === null)));
    assert.ok(value.parts.length >= 2);
    assert.equal(evaluateWrittenInspection(value, "complete").status, label);
    console.log(JSON.stringify({ fixture: label, status: label, parts: value.parts.length, blankParts: value.parts.filter(p => p.status === "blank").length }));
  }));
  console.log("WRITTEN_COMPLETION_AI_OK=true wrong-but-answered-is-complete,blank-answer-is-incomplete,visible-evidence,synthetic-only");
}
void main().catch(error => { console.error("WRITTEN_COMPLETION_AI_FAILED", error instanceof assert.AssertionError ? error.message : error?.code || "CHECK_ERROR"); process.exitCode = 1; });
