import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HomeworkStore } from "../src/server/homework/store";
import { ReadingStore } from "../src/server/reading/store";
import { HomeworkRewards } from "../src/server/homework/rewards";
import { isHomeworkDayComplete } from "../src/domain/homework-reward";

const monday = "2026-11-23", tuesday = "2026-11-24";
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-calendar-"));
  let store = new HomeworkStore(join(directory, "learning"));
  return { directory, get store() { return store; }, reopen() { store.close(); store = new HomeworkStore(join(directory, "learning")); }, close() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
test("Mondays default to no homework; a date exception survives restart and weekly edits without affecting other dates", () => {
  const f = fixture(); try {
    assert.equal(f.store.snapshot(monday).dayPlan!.noHomework, true);
    assert.equal(f.store.snapshot(tuesday).dayPlan!.noHomework, false);
    f.store.setDayPlan({ date: monday, noHomework: false }, "child");
    f.reopen(); assert.equal(f.store.dayPlan(monday).source, "date"); assert.equal(f.store.dayPlan(monday).noHomework, false);
    assert.equal(f.store.dayPlan("2026-11-30").noHomework, true);
    f.store.setDayPlan({ date: tuesday, weekdays: [1, 2] }, "parent");
    assert.equal(f.store.dayPlan(monday).noHomework, false); assert.equal(f.store.dayPlan(tuesday).noHomework, true);
    f.store.setDayPlan({ date: monday, noHomework: null }, "parent");
    assert.equal(f.store.dayPlan(monday).noHomework, true);
    f.store.setDayPlan({ date: tuesday, weekdays: [] }, "child"); f.reopen();
    assert.equal(f.store.dayPlan(monday).noHomework, false); assert.equal(f.store.dayPlan(tuesday).noHomework, false);
    assert.equal(f.store.quota().calls, 0); assert.equal((f.store.db.prepare("SELECT count(*) AS n FROM jobs").get() as {n:number}).n, 0);
  } finally { f.close(); }
});
test("uploaded work takes precedence over a weekly or explicit day off, and cannot be hidden by a calendar edit", () => {
  const f = fixture(); try {
    f.store.setDayPlan({ date: monday, noHomework: true }, "child");
    const upload = f.store.begin({ date: monday, kind: "homework", files: [{ name: "synthetic.jpg", size: 10, sha256: "a".repeat(64) }] });
    assert.equal(f.store.dayPlan(monday).noHomework, false); assert.equal(f.store.dayPlan(monday).source, "work");
    assert.throws(() => f.store.setDayPlan({ date: monday, noHomework: true, weekdays: [2] }, "child"), /已有作业/);
    assert.deepEqual(f.store.dayPlan(monday).weekdays, [1], "conflicting edits are atomic");
    f.store.setDayPlan({ date: monday, weekdays: [2] }, "parent");
    assert.equal(f.store.snapshot(monday).uploads[0].id, upload.id);
    assert.equal(f.store.snapshot(monday).dayPlan!.hasWork, true);
    assert.equal(f.store.dayPlan(tuesday).noHomework, true);
  } finally { f.close(); }
});
test("invalid dates and calendar values are rejected without changing saved settings", () => {
  const f = fixture(); try {
    for (const input of [{date:"2026-02-30",noHomework:true},{date:monday,weekdays:[1,1]},{date:monday,weekdays:[7]},{date:monday,weekdays:["1"]},{date:monday,noHomework:"true"},{date:monday,noHomework:true,role:"admin"},{date:monday}]) assert.throws(() => f.store.setDayPlan(input,"child"));
    assert.deepEqual(f.store.dayPlan(monday).weekdays, [1]); assert.equal(f.store.dayPlan(monday).override, null);
  } finally { f.close(); }
});
test("a day off does not count as completed homework or create a homework reward", () => {
  const f = fixture(), reading = new ReadingStore(join(f.directory,"reading"), () => Date.parse(monday+"T12:00:00+08:00"));
  try {
    const rewards = new HomeworkRewards(f.store, reading);
    f.store.setDayPlan({date:monday,noHomework:true},"child");
    assert.equal(isHomeworkDayComplete(f.store.snapshot(monday)), false);
    rewards.tick(); assert.equal(reading.balance(), 0);
    assert.equal((reading.db.prepare("SELECT count(*) AS n FROM ledger").get() as {n:number}).n, 0);
  } finally { reading.close(); f.close(); }
});
