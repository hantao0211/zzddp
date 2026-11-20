import assert from "node:assert/strict";
import test from "node:test";
import { StateSchema, type Material } from "../src/domain/contracts";
import { attachMaterial, makeDemoState, summarize } from "../src/domain/demo";

test("uploading homework never marks it completed or changes unrelated tasks", () => {
  const state = makeDemoState();
  const material: Material = { id: "upload-1", name: "数学作业", kind: "每日作业", subject: "数学", date: "2026-11-18", taskId: "math", sample: false, fileIds: ["file-1"], filenames: ["homework.jpg"] };
  const next = attachMaterial(state, material);
  assert.equal(next.tasks.find((t) => t.id === "math")?.uploaded, true);
  assert.equal(next.tasks.find((t) => t.id === "math")?.completed, false);
  assert.deepEqual(next.tasks.find((t) => t.id === "chinese"), state.tasks.find((t) => t.id === "chinese"));
  assert.equal(state.materials.length, 3);
});

test("retrying the same material does not create duplicate archive records", () => {
  const state = makeDemoState();
  const next = attachMaterial(state, state.materials[0]);
  assert.equal(next.materials.length, state.materials.length);
});

test("unlinked materials do not alter homework upload counts", () => {
  const state = makeDemoState();
  const material: Material = { id: "memo", name: "备忘录", kind: "备忘录", subject: "数学", date: "2026-11-18", sample: false, fileIds: ["memo-1"], filenames: ["memo.jpg"] };
  assert.equal(summarize(attachMaterial(state, material)).uploaded, summarize(state).uploaded);
});

test("a review event does not count duplicate clicks as additional reviews", () => {
  const state = makeDemoState();
  state.reviewDone = ["decimal", "decimal"];
  assert.equal(summarize(state).reviewed, 1);
});

test("persisted state validates version and required completion status", () => {
  const state = makeDemoState();
  assert.equal(StateSchema.safeParse(state).success, true);
  assert.equal(StateSchema.safeParse({ ...state, version: 2 }).success, false);
  assert.equal(StateSchema.safeParse({ ...state, tasks: [{ id: "bad", subject: "数学" }] }).success, false);
});
