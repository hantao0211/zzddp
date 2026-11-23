import type { ReadingStore } from "./store";
import { isParent,type Viewer } from "../../domain/accounts";
import { ActivityClaimSchema,ActivityRulesSchema,DEFAULT_ACTIVITY_RULES,activityPeriod,addDays,type ActivityClaim,type ActivityRule,type ActivityState } from "../../domain/growth-economy";
import { HomeworkError } from "../homework/store";

export class Activities {
 constructor(private store:ReadingStore){store.db.exec(`CREATE TABLE IF NOT EXISTS activity_claims(id TEXT PRIMARY KEY,key TEXT NOT NULL,period TEXT NOT NULL,data TEXT NOT NULL,status TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS activity_once ON activity_claims(key,period) WHERE status IN ('pending','approved');`);}
 state():ActivityState{const {store:s}=this;const row=s.db.prepare("SELECT value FROM settings WHERE key='activity_rules'").get() as {value:string}|undefined;const start=s.db.prepare("SELECT value FROM settings WHERE key='activity_start'").get() as {value:string}|undefined;return{rules:row?ActivityRulesSchema.parse(JSON.parse(row.value)).rules:structuredClone(DEFAULT_ACTIVITY_RULES),startOn:start?.value||s.today(),claims:(s.db.prepare("SELECT id FROM activity_claims ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,rowid DESC LIMIT 200").all() as {id:string}[]).map(r=>this.claim(r.id))};}
 claim(id:string):ActivityClaim{const row=this.store.db.prepare("SELECT data,status FROM activity_claims WHERE id=?").get(id) as {data:string;status:ActivityClaim["status"]}|undefined;if(!row)throw new HomeworkError(404,"没有找到这次活动。");return{...JSON.parse(row.data),status:row.status};}
 setRules(value:unknown,viewer:Viewer){if(!isParent(viewer))throw new HomeworkError(403,"活动奖励需要家长设置。");const input=ActivityRulesSchema.parse(value);this.store.transaction(()=>{this.store.db.prepare("INSERT INTO settings VALUES('activity_rules',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(input));this.store.audit(viewer.id,"activity-rules","growth");});return input;}
 submit(value:unknown,viewer:Viewer){const v=ActivityClaimSchema.parse(value),s=this.store;return s.transaction(()=>{
  const old=s.db.prepare("SELECT actor,data FROM activity_claims WHERE id=?").get(v.id) as {actor:string;data:string}|undefined;
  if(old){const claim=this.claim(v.id);if(old.actor!==viewer.id||claim.key!==v.key||claim.date!==v.date||claim.note!==v.note)throw new HomeworkError(409,"这次提交与原记录不同，请刷新。");return claim;}
  const state=this.state(),rule=state.rules.find(r=>r.key===v.key)!;
  if(!rule.enabled||!rule.points)throw new HomeworkError(409,"这项活动的奖励暂时关闭了。");
  if(v.date>s.today()||v.date<addDays(s.today(),-7)||v.date<state.startOn)throw new HomeworkError(400,"可以记录今天或最近7天内实际完成的活动，不能提前打卡。");
  s.db.prepare("INSERT OR IGNORE INTO settings VALUES('activity_start',?)").run(state.startOn);
  const period=activityPeriod(v.key,v.date);
  if(s.db.prepare("SELECT id FROM activity_claims WHERE key=? AND period=? AND status IN ('pending','approved')").get(v.key,period))throw new HomeworkError(409,"这项活动本期已经记录过了，家务每天合计一次，课程每周一次。");
  const claim:ActivityClaim={...v,title:rule.title,points:rule.points,period,status:isParent(viewer)?"approved":"pending",parentNote:"",createdAt:s.time()};
  s.db.prepare("INSERT INTO activity_claims VALUES(?,?,?,?,?,?,?)").run(v.id,v.key,period,JSON.stringify(claim),claim.status,viewer.id,claim.createdAt);
  if(isParent(viewer))s.award("activity:"+v.id,v.date,rule.points,rule.title,"activity",viewer.id);
  s.audit(viewer.id,"activity:"+claim.status,v.id);return claim;
 });}
 decide(id:string,status:"approved"|"rejected",note:string,viewer:Viewer){if(!isParent(viewer))throw new HomeworkError(403,"请家长确认这次活动。");const s=this.store;return s.transaction(()=>{const claim=this.claim(id);if(claim.status===status)return claim;if(claim.status!=="pending")throw new HomeworkError(409,"这次活动已处理，请刷新查看。");const updated={...claim,status,parentNote:note};s.db.prepare("UPDATE activity_claims SET status=?,data=? WHERE id=?").run(status,JSON.stringify(updated),id);if(status==="approved")s.award("activity:"+id,claim.date,claim.points,claim.title,"activity",viewer.id);s.audit(viewer.id,"activity:"+status,id);return updated;});}
}
