import {createHash} from "node:crypto";
import {StudentProfileSchema,StudentProfileInputSchema,type StudentProfileView} from "../../domain/student-profile";
import type {ReadingStore} from "./store";
import {HomeworkError} from "../homework/store";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function studentProfile(store:ReadingStore):StudentProfileView|null{const row=store.db.prepare("SELECT value FROM settings WHERE key='student_profile'").get() as {value:string}|undefined;if(!row)return null;const value=StudentProfileSchema.parse(JSON.parse(row.value));return{...value,revision:hash(value)};}
export function saveStudentProfile(store:ReadingStore,input:unknown,actor:string){const {revision,...value}=StudentProfileInputSchema.parse(input);return store.transaction(()=>{const previous=studentProfile(store);if(previous?.revision===hash(value))return previous;if(previous&&revision!==previous.revision)throw new HomeworkError(409,"学习档案刚更新过，请刷新后再保存，你的填写保留。");store.db.prepare("INSERT INTO settings VALUES('student_profile',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value));store.audit(actor,"update-student-profile","student-profile");return studentProfile(store)!;});}
