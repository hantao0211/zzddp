import type { GradedQuestion } from "./grading";
import type { GradeReview } from "./grade-review";

const signingLabel = /^(?:家长|监护人|签字人)(?:签名|签字|签章)(?:栏|处|及日期|和日期)?$/;
const signingInstruction = /^(?:请|需|由|要求)?(?:家长|监护人|签字人)(?:[/、或](?:家长|监护人|签字人))?(?:在.{0,16}(?:页|栏|处|本上))?(?:签名|签字|签章)(?:确认)?(?:并.{0,8}日期|及日期)?[。！.!]?$/;
export function isSignatureRecord(q: {label:string; question:string}) {
  const label = q.label.normalize("NFKC").replace(/\s/g,"");
  const stem = q.question.normalize("NFKC").replace(/\s/g,"");
  return signingInstruction.test(stem) || (signingLabel.test(label) && /^(?:请)?(?:签名|签字)(?:栏|处|及日期)?[。:：]?$/.test(stem));
}

export function signatureRecord(q: GradedQuestion): GradedQuestion {
  return {...q, kind:"subjective", verdict:"feedback", verification:"subjective", expectedAnswer:"",
    explanation:q.familyReview?.evidence || "", knowledgePoints:[], cause:"原因待确认", causeExplanation:"", nextStep:"",
    ...(q.familyReview && {familyReview:{...q.familyReview,correction:""}})};
}

export function signatureReview(review: GradeReview): GradeReview {
  return {...review, verdict:"record", expected:"", correction:""};
}
