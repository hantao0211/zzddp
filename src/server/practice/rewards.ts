import type {ReadingStore} from "../reading/store";
import type {PracticeSubject} from "../../domain/practice";
/** A receipt bridges the two private SQLite stores without double-crediting after a crash. */
export class PracticeRewards{
 constructor(private reading:ReadingStore){reading.db.exec("CREATE TABLE IF NOT EXISTS practice_reward_receipts(practice_id TEXT PRIMARY KEY,day TEXT NOT NULL,subject TEXT NOT NULL,points INTEGER NOT NULL)");}
 eligible(subject:PracticeSubject,day:string){return !this.reading.db.prepare("SELECT id FROM ledger WHERE event_key=?").get(`practice:${subject}:${day}`);}
 credit(practiceId:string,subject:PracticeSubject,day:string,actor:string){const s=this.reading;return s.transaction(()=>{const prior=s.db.prepare("SELECT points FROM practice_reward_receipts WHERE practice_id=?").get(practiceId) as {points:number}|undefined;if(prior)return prior.points;const points=s.award(`practice:${subject}:${day}`,day,2,`完成${subject}课内小练习`,"practice",actor);s.db.prepare("INSERT INTO practice_reward_receipts VALUES(?,?,?,?)").run(practiceId,day,subject,points);if(points)s.audit(actor,"practice-completed",practiceId);return points;});}
}
