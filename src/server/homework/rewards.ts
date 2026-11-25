import { record } from "../diagnostics/events";
import { isHomeworkDayComplete } from "../../domain/homework-reward";
import type { HomeworkSnapshot } from "../../domain/homework";
import type { HomeworkStore } from "./store";
import type { ReadingStore } from "../reading/store";

/** Recoverable delivery between two private stores. The ledger's unique key is authoritative. */
export class HomeworkRewards {
  private timer?: ReturnType<typeof setInterval>;
  private checked = new Map<string, string>();
  private points?: number;
  readonly startDate: string;
  constructor(private homework: HomeworkStore, private reading: ReadingStore) { this.startDate = reading.enableHomeworkRewards(); }
  tick() {
    const points = this.reading.homeworkRewardRules().dailyPoints;
    if (points !== this.points) { this.checked.clear(); this.points = points; }
    if (!points) return;
    const earned = new Set(this.reading.homeworkRewardDates());
    const days = this.homework.db.prepare("SELECT date,revision FROM days WHERE date>=? AND date<=? AND status IN ('processed','needs_rescan')").all(this.startDate, this.reading.today()) as { date: string; revision: number }[];
    for (const day of days) {
      const revision = `${day.revision}:${this.homework.completions.revision(day.date)}`;
      if (earned.has(day.date) || this.checked.get(day.date) === revision) continue;
      const snapshot = this.homework.snapshot(day.date);
      if (snapshot.pending) continue;
      if (isHomeworkDayComplete(snapshot)) this.reading.creditHomework(day.date, day.revision);
      this.checked.set(day.date, revision);
    }
  }
  start() {
    const run = () => { try { this.tick(); } catch { record({ event: "reward.delivery", error: true }); } };
    run(); this.timer = setInterval(run, 5000); this.timer.unref();
  }
  stop() { if (this.timer) clearInterval(this.timer); }
  gardenProgress(snapshot: HomeworkSnapshot) {
    if (snapshot.date !== this.reading.today()) return undefined;
    return {
      homeworkComplete: !snapshot.dayPlan?.noHomework && isHomeworkDayComplete(snapshot),
      readingLogged: this.reading.hasReadingLog(snapshot.date),
      earnedSteps: this.reading.earnedSteps(snapshot.date),
    };
  }
  status(date: string) { return this.reading.homeworkRewardStatus(date); }
}
