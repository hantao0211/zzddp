import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { WrittenInspectionSchema } from "../../domain/written-completion";
import type { DailyReport } from "../../domain/homework";

type Task = DailyReport["tasks"][number];

const checks = {
  numbering: "对照实际作答和布置的词表或数量，核实有没有漏项。",
  correction: "把重写的位置与原答、批改标记逐一对应，辨清哪些是订正。",
  writing: "在相应作答处查找笔迹，区分学生填写、印刷示例和真正的空白。",
  continuation: "沿题号和续写位置核对相邻作答处，检查答案是否写在别处。",
  marks: "对照题目要求，核对圈画、连线或图形是否属于这道题的作答。",
} as const;

const observation = z.object({
  method: z.enum(["numbering","correction","writing","continuation","marks"]),
  cue: z.string().min(2).max(32).describe("可在另一份作业上看见的图面特征，如另起一行重复写词。只写特征，不含具体答案、数字、姓名、判断或指令。"),
  fileId: z.string().min(1), page: z.number().int().positive(),
  label: z.string().min(1).max(200).describe("原图上直接证实反馈的作答处，逐字引用本次parts.label，并在该part的excerpt写明可见依据"),
}).strict();
export const FeedbackInspectionSchema = WrittenInspectionSchema.extend({
  verifiedClues: z.array(observation).max(3).describe("仅列原图直接证实、能帮助下次检查的反馈线索。无法定位、仅有用户说法、复查不支持、或只对当题有效时返回空数组。"),
});
type Observation = z.infer<typeof observation>;
export type VerifiedClue = Observation & { excerpt: string };
export function verifiedClues(value: z.infer<typeof FeedbackInspectionSchema>): VerifiedClue[] {
  return value.verifiedClues.flatMap(clue => {
    const part = value.parts.find(p => p.label === clue.label && p.status === "answered" &&
      p.evidence.fileId === clue.fileId && p.evidence.page === clue.page);
    if (!part || !/^[\p{Script=Han}、，]{2,32}$/u.test(clue.cue) ||
        /跳过检查|指令|以后|必须|直接判|一律|算完成|已做完|忽略|自动通过|不用检查/u.test(clue.cue)) return [];
    return [{...clue,excerpt:part.evidence.excerpt}];
  });
}

function taskFamily(task: Task) {
  const title = task.title.replace(/[（(](?:除|不含|不做|不包括)[^）)]*[）)]/gu, "");
  for (const [pattern,family] of [
    [/听写|默写|家默/u,"听写默写"], [/订正|改错/u,"订正"], [/抄写|誊写/u,"抄写"],
    [/练习册|练习本|配套练习/u,"练习册"], [/试卷|测验|考试/u,"试卷"],
  ] as const) if (pattern.test(title)) return family;
  return title.replace(/[\s\d０-９]+/gu, "").trim().slice(0,60);
}

type Row = {id:string; subject:string; family:string; cue:string; method:keyof typeof checks; date:string; page:number; excerpt:string; disabled:number};
const description = (row: Pick<Row,"cue"|"method">) => "看到“" + row.cue + "”时，" + checks[row.method];

export class FeedbackLessons {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS homework_feedback_lessons(
      id TEXT PRIMARY KEY, feedback_id TEXT NOT NULL REFERENCES completion_feedback(id), token TEXT NOT NULL,
      subject TEXT NOT NULL, family TEXT NOT NULL, method TEXT NOT NULL, cue TEXT NOT NULL,
      date TEXT NOT NULL,file_id TEXT NOT NULL,page INTEGER NOT NULL,excerpt TEXT NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0, retired INTEGER NOT NULL DEFAULT 0,
      UNIQUE(feedback_id,method,cue));
      CREATE INDEX IF NOT EXISTS feedback_lessons_by_family ON homework_feedback_lessons(subject,family,disabled,retired)`);
  }
  record(date:string, task:Task, token:string, feedbackId:string, clues: VerifiedClue[]) {
    const family = taskFamily(task);
    if (!family) return;
    const insert = this.db.prepare(`INSERT OR IGNORE INTO homework_feedback_lessons
      (id,feedback_id,token,subject,family,method,cue,date,file_id,page,excerpt)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM homework_feedback_lessons
      WHERE subject=? AND family=? AND method=? AND cue=? AND disabled=1)`);
    for (const c of clues) {
      insert.run(randomUUID(),feedbackId,token,task.subject,family,c.method,c.cue,date,c.fileId,c.page,c.excerpt,
        task.subject,family,c.method,c.cue);
    }
  }
  retire(token:string) { this.db.prepare("UPDATE homework_feedback_lessons SET retired=1 WHERE token=?").run(token); }
  learned(feedbackId:string) {
    const rows = this.db.prepare("SELECT cue,method FROM homework_feedback_lessons WHERE feedback_id=? AND retired=0 AND disabled=0 ORDER BY rowid").all(feedbackId) as Pick<Row,"cue"|"method">[];
    return rows.map(description);
  }
  recall(task:Task, token:string) {
    const rows = this.db.prepare(`SELECT cue,method FROM homework_feedback_lessons WHERE subject=? AND family=? AND token!=?
      AND disabled=0 AND retired=0 GROUP BY method,cue ORDER BY MAX(rowid) DESC LIMIT 4`).all(task.subject,taskFamily(task),token) as Pick<Row,"cue"|"method">[];
    return rows.map(description);
  }
  catalog() {
    const rows = this.db.prepare(`SELECT * FROM homework_feedback_lessons WHERE rowid IN (
      SELECT MAX(rowid) FROM homework_feedback_lessons WHERE retired=0 AND disabled=0 GROUP BY subject,family,method,cue)
      ORDER BY rowid DESC`).all() as Row[];
    return rows.map(r=>({id:r.id,subject:r.subject,family:r.family,description:description(r),date:r.date,page:r.page,excerpt:r.excerpt}));
  }
  revoke(id:string) {
    return this.db.prepare(`UPDATE homework_feedback_lessons SET disabled=1 WHERE (subject,family,method,cue) =
      (SELECT subject,family,method,cue FROM homework_feedback_lessons WHERE id=?)`).run(id).changes > 0;
  }
}
