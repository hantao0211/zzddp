import { effectiveMemo } from "./memo-context";
import type { MemoEntry } from "../../domain/clarifications";
import { createHash } from "node:crypto";
import { taskSubmission } from "../../domain/task-submission";
import type { DailyReport } from "../../domain/homework";
import type { Viewer } from "../../domain/accounts";
import { currentUploadTarget } from "./upload-target";
import { HomeworkError, type HomeworkStore } from "./store";
export class TaskCompletions {
 constructor(private store:HomeworkStore) {store.db.exec(`CREATE TABLE IF NOT EXISTS task_completions(token TEXT PRIMARY KEY,date TEXT NOT NULL,completed INTEGER NOT NULL,actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,actor_role TEXT NOT NULL,updated_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS task_completion_versions(date TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0);`);}
 private current(date:string,taskId:string) {
  const target=currentUploadTarget(this.store,date,taskId);if(!target)return null;
  return {target,token:createHash("sha256").update(JSON.stringify(target)).digest("hex")};
 }
 view(date:string,input:DailyReport["tasks"][number]) {
  const {completionToken:_token,selfCompletion:_completion,...task}=input;
  const current=this.current(date,task.id);
  if(!current||taskSubmission(current.target)!=="self"||["subject","title","requirement","format"].some(key=>current.target[key as "title"]!==task[key as "title"]))return task;
  const record=this.store.db.prepare("SELECT * FROM task_completions WHERE token=? AND completed=1").get(current.token) as {actor_name:string;actor_role:string;updated_at:string}|undefined;
  return {...task,completionToken:current.token,...(record?{selfCompletion:{confirmedAt:record.updated_at,confirmedBy:record.actor_name,role:record.actor_role as Viewer["role"]}}:{})};
 }
 set(date:string,taskId:string,token:string,completed:boolean,viewer?:Viewer) {
  return this.store.transaction(()=>{
   const current=this.current(date,taskId);
   if(!current||current.token!==token)throw new HomeworkError(409,"作业要求已更新，请刷新清单后再确认。");
   if(taskSubmission(current.target)!=="self")throw new HomeworkError(409,"这项需要提交作业，请上传对应资料，不能直接确认完成。");
   const previous=this.store.db.prepare("SELECT completed FROM task_completions WHERE token=?").get(token) as {completed:number}|undefined;
   if(!!previous?.completed===completed)return {completed};
   const actor=viewer||{id:"legacy-child",name:"孩子",role:"child"};
   this.store.db.prepare("INSERT INTO task_completions(token,date,completed,actor_id,actor_name,actor_role,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(token) DO UPDATE SET completed=excluded.completed,actor_id=excluded.actor_id,actor_name=excluded.actor_name,actor_role=excluded.actor_role,updated_at=excluded.updated_at").run(token,date,completed?1:0,actor.id,actor.name,actor.role,new Date(this.store.now()).toISOString());
   this.store.db.prepare("INSERT INTO task_completion_versions(date,revision) VALUES(?,1) ON CONFLICT(date) DO UPDATE SET revision=revision+1").run(date);
   return {completed};
  });
 }
 requirements() {
  const items:MemoEntry[]=[];const seen=new Set<string>();let length=0;
  for(const row of this.store.db.prepare("SELECT id FROM uploads WHERE kind='memo' AND result IS NOT NULL ORDER BY created_at DESC,rowid DESC LIMIT 40").all() as {id:string}[]) {
   for(const a of effectiveMemo(this.store,this.store.upload(row.id)!).result.assignments) {
    if(!a.subject||/未写明|无法|看不清|字迹待|待确认|已勾选/.test(a.requirement))continue;
    const key=a.subject+":"+a.requirement;if(seen.has(key)||length+a.requirement.length>8000)continue;
    items.push({subject:a.subject,title:a.title,requirement:a.requirement,format:a.format});seen.add(key);length+=a.requirement.length;
    if(items.length>=20)return items;
   }
  }return items;
 }
 revision(date:string) {return (this.store.db.prepare("SELECT revision FROM task_completion_versions WHERE date=?").get(date) as {revision:number}|undefined)?.revision||0;}
}
