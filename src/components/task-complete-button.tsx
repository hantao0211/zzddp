"use client";
import { useState } from "react";
import { Check, LoaderCircle, Undo2 } from "lucide-react";
import { homeworkPost } from "@/services/homework-gateway";
import type { HomeworkSummaryRow } from "@/domain/homework-summary";
export function TaskCompleteButton({row,date,saved}:{row:HomeworkSummaryRow;date:string;saved:()=>Promise<void>}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 return <div className="task-confirm-control"><button className={row.selfConfirmed?"text-button task-confirm-undo":"task-confirm-button"} disabled={busy} aria-label={`${row.selfConfirmed?"撤销":"确认"}${row.title}完成`} onClick={async()=>{if(!row.completionToken)return;setBusy(true);setError("");try{await homeworkPost("/task-completion",{date,taskId:row.id,token:row.completionToken,completed:!row.selfConfirmed});await saved();window.dispatchEvent(new Event("xiaobu:growth-updated"));}catch(e){setError(e instanceof Error?e.message:"暂未保存，可以再试一次。");}finally{setBusy(false);}}}>{busy?<LoaderCircle size={16} className="spin" aria-hidden="true"/>:row.selfConfirmed?<Undo2 size={15} aria-hidden="true"/>:<Check size={17} aria-hidden="true"/>}{busy?"保存中…":row.selfConfirmed?"撤销确认":"我完成了"}</button>{error&&<small role="alert">{error}</small>}</div>;
}
