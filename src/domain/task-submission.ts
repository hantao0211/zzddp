import { usesReviewTraces } from "./review-policy";
export type TaskSubmission = "written" | "self" | "unknown";
export function taskSubmission(task: {title:string;requirement:string;format:string}): TaskSubmission {
 const text=`${task.title} ${task.requirement}`.replace(/(?:无需|不需要|没有要求|未要求|不要求|不用|不必|没要求|未布置|未写明)[^，。；;\n]*/gu,"");
 if (/抄写|默写|家默|听写|誊写|订正|订签|签字|签名|练习册|试卷|作文|写作|阅读理解|阅读练习|练习题|读书笔记|摘抄|读后感|阅读记录(?:单|卡|表)|预习单|阅读单|写.{0,6}笔记|写.{0,8}(?:遍|字|词|句|段|篇)|完成.{0,18}(?:练习|习题|作业|第.{0,8}题)|做.{0,8}(?:题|页)|(?:提交|上传).{0,6}(?:书面|录音|视频|作品)/u.test(text)) return "written";
 if (usesReviewTraces(task) || task.format==="oral" || task.format==="reading" || /朗读|背诵|课外阅读|阅读打卡/u.test(text)) return "self";
 return task.format==="written" ? "written" : "unknown";
}
export const REQUIREMENT_PRESETS = [
 {label:"复习／预习，不交书面",text:"按课堂要求预习或复习，无额外书面提交要求。",format:"reading"},
 {label:"阅读指定内容",text:"阅读指定内容，无需提交照片。",format:"reading"},
 {label:"朗读／背诵",text:"按老师要求朗读或背诵，无需提交照片。",format:"oral"},
 {label:"完成书面练习",text:"完成老师布置的书面练习，完成后上传照片。",format:"written"},
] as const;
