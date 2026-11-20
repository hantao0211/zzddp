import { isHomeworkDayComplete } from "../../domain/homework-reward";
import type { HomeworkStore } from "./store";
import type { ReadingStore } from "../reading/store";

/** Recoverable delivery between two private stores. The ledger's unique key is authoritative. */
export class HomeworkRewards {
  private timer?: ReturnType<typeof setInterval>;
  private checked = new Map<string, number>();
  readonly startDate: string;
  constructor(private homework: HomeworkStore, private reading: ReadingStore) { this.startDate = reading.enableHomeworkRewards(); }
  tick() {
    const earned = new Set(this.reading.homeworkRewardDates());
    const days = this.homework.db.prepare("SELECT date,revision FROM days WHERE date>=? AND date<=? AND status='processed'").all(this.startDate, this.reading.today()) as { date: string; revision: number }[];
    for (const day of days) {
      if (earned.has(day.date) || this.checked.get(day.date) === day.revision) continue;
      const snapshot = this.homework.snapshot(day.date);
      if (snapshot.pending) continue;
      if (isHomeworkDayComplete(snapshot)) this.reading.creditHomework(day.date, day.revision);
      this.checked.set(day.date, day.revision);
    }
  }
  start() {
    const run = () => { try { this.tick(); } catch { console.warn("Homework reward delivery will retry"); } };
    run(); this.timer = setInterval(run, 5000); this.timer.unref();
  }
  stop() { if (this.timer) clearInterval(this.timer); }
  status(date: string) { return this.reading.homeworkRewardStatus(date); }
}
