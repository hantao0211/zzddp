import {z} from "zod";
import {contextSchema,emptyContext,goalSchema,goalResult,isMilestone,milestoneKinds,type ExamNode,type MilestoneGoal,type MilestoneData} from "../../domain/exam-milestones";
import type {ExamMeta} from "../../domain/assessment";
import {HomeworkError} from "../homework/store";
import type {PracticeStore} from "./store";

export class ExamMilestones {
  constructor(private store:PracticeStore){
    store.db.exec("CREATE TABLE IF NOT EXISTS exam_context(exam_id TEXT PRIMARY KEY REFERENCES exams(id),revision INTEGER NOT NULL,data TEXT NOT NULL)");
    store.reading.db.exec(`CREATE TABLE IF NOT EXISTS exam_goals(id TEXT PRIMARY KEY,spec TEXT NOT NULL,created TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',earnedExam TEXT,actual REAL);`);
  }
  snapshot():MilestoneData{
    const rows=this.store.db.prepare(`SELECT e.id,e.metadata,c.revision,c.data,
        (SELECT count(*) FROM exam_questions q JOIN exam_pages p ON p.id=q.page_id WHERE p.exam_id=e.id AND q.verdict='wrong') AS wrong
      FROM exams e LEFT JOIN exam_context c ON c.exam_id=e.id WHERE json_extract(e.metadata,'$.kind') IN (?,?,?,?)
      ORDER BY json_extract(e.metadata,'$.date') DESC,e.created_at DESC,e.id`).all(...milestoneKinds);
    const exams=rows.map(r=>({...JSON.parse(String(r.metadata)),id:r.id,revision:r.revision??0,context:r.data?JSON.parse(String(r.data)):emptyContext,wrong:r.wrong})) as ExamNode[];
    const goals=this.store.reading.db.prepare("SELECT * FROM exam_goals ORDER BY rowid DESC").all().map(({spec,...r})=>({...JSON.parse(String(spec)),...r})) as MilestoneGoal[];
    return {exams,goals};
  }
  saveContext(id:string,raw:unknown){
    const v=z.object({revision:z.number().int().nonnegative(),context:contextSchema}).parse(raw);
    return this.store.homework.transaction(()=>{
      const row=this.store.db.prepare("SELECT metadata FROM exams WHERE id=?").get(id);
      const meta=row?JSON.parse(String(row.metadata)) as ExamMeta:null;
      if(!meta||!isMilestone(meta.kind))throw new HomeworkError(409,"请先确定重要考试类型。");
      if(meta.maximum!==null&&Object.values(v.context).some(c=>c.average!==null&&c.average>meta.maximum!))throw new HomeworkError(400,"平均分超过了本卷满分，请核对。");
      const data=JSON.stringify(v.context);
      const old=this.store.db.prepare("SELECT * FROM exam_context WHERE exam_id=?").get(id);
      if(old?.data===data)return;
      if((old?.revision??0)!==v.revision)throw new HomeworkError(409,"对照数据已更新，请重新打开后再改。");
      this.store.db.prepare("INSERT INTO exam_context VALUES(?,?,?) ON CONFLICT(exam_id) DO UPDATE SET revision=excluded.revision,data=excluded.data").run(id,v.revision+1,data);
    });
  }
  saveGoal(raw:unknown){
    const {id,goal}=z.object({id:z.string().uuid(),goal:goalSchema}).parse(raw);
    const db=this.store.reading.db,spec=JSON.stringify(goal);
    const old=db.prepare("SELECT spec FROM exam_goals WHERE id=?").get(id);
    if(old&&old.spec!==spec)throw new HomeworkError(409,"这个目标已保存，请刷新。");
    db.prepare("INSERT OR IGNORE INTO exam_goals(id,spec,created) VALUES(?,?,?)").run(id,spec,this.store.today());
  }
  settle(id:string,raw:unknown,actor:string){
    const action=z.discriminatedUnion("action",[z.object({action:z.literal("cancel")}),z.object({action:z.literal("confirm"),examId:z.string().regex(/^[a-f0-9]{64}$/)})]).parse(raw);
    const reading=this.store.reading;
    reading.transaction(()=>{
      const data=this.snapshot(),goal=data.goals.find(g=>g.id===id);
      if(!goal)throw new HomeworkError(404,"目标不存在。");
      if(action.action==="cancel"){
        if(goal.status==="earned")throw new HomeworkError(409,"这个目标已兑现。");
        reading.db.prepare("UPDATE exam_goals SET status='cancelled' WHERE id=?").run(id);return;
      }
      if(goal.status==="earned"&&goal.earnedExam===action.examId)return;
      const exam=data.exams.find(e=>e.id===action.examId),result=exam&&goalResult(goal,exam);
      if(!result?.reached)throw new HomeworkError(409,"当前成绩还不能确认达成这个目标。");
      reading.db.prepare("UPDATE exam_goals SET status='earned',earnedExam=?,actual=? WHERE id=?").run(action.examId,result.value,id);
      reading.award("exam-goal:"+id,reading.today(),goal.points,goal.subject+" · "+goal.kind+"目标达成","exam_goal",actor);
    });
  }
}
