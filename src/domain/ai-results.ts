import type { LearningState } from "./contracts";
import { MemoRecognitionSchema, OrganizationSchema, type MemoRecognition, type HomeworkOrganization } from "./ai-contracts";

export function applyMemoRecognition(state: LearningState, materialId: string, input: MemoRecognition): LearningState {
  const result = MemoRecognitionSchema.parse(input);
  const material = state.materials.find((item) => item.id === materialId);
  if (!material) throw new Error("备忘录原件不存在，不能写入识别结果。");
  for (const assignment of result.assignments) {
    if (assignment.evidence.some((item) => !material.fileIds.includes(item.fileId))) throw new Error("备忘录识别引用了未提供的文件。");
  }
  const unresolved = !result.readable || !result.assignments.length || result.assignments.some((item) => !item.subject) || !result.date;
  if (unresolved) return { ...state, materials: state.materials.map((m) => m.id === materialId ? { ...m, kind: "备忘录", processing: "needs_rescan" } : m) };
  const previous = state.tasks.filter((task) => task.memoId === materialId);
  const usedIds = new Set(state.tasks.map((task) => task.id));
  let nextIndex = 0;
  const tasks = result.assignments.map((assignment) => {
    const old = previous.find((task) => task.subject === assignment.subject && task.description === assignment.requirement);
    let id = old?.id;
    if (!id) {
      do { id = `${materialId}:task:${nextIndex++}`; } while (usedIds.has(id));
      usedIds.add(id);
    }
    return {
      id,
      subject: assignment.subject!, title: assignment.title, description: assignment.requirement,
      date: result.date!, memoId: materialId,
      format: assignment.format,
      completed: old?.completed || false, uploaded: old?.uploaded || false,
      coverage: old?.coverage || "none" as const, evidenceIds: old?.evidenceIds || [],
    };
  });
  return {
    ...state,
    tasks: [...state.tasks.filter((task) => task.memoId !== materialId), ...tasks],
    materials: state.materials.map((m) => m.id === materialId ? { ...m, kind: "备忘录", date: result.date!, subject: undefined, subjects: [...new Set(tasks.map((t) => t.subject))], processing: "processed" } : m),
  };
}

export function applyHomeworkOrganization(state: LearningState, materialId: string, input: HomeworkOrganization): LearningState {
  const result = OrganizationSchema.parse(input);
  const material = state.materials.find((item) => item.id === materialId);
  if (!material) throw new Error("作业原件不存在，不能写入关联结果。");
  const candidates = state.tasks.filter((task) => task.date === material.date);
  const candidateIds = new Set(candidates.map((task) => task.id));
  for (const match of result.matches) {
    if (!candidateIds.has(match.taskId)) throw new Error("AI引用了不存在或日期不符的任务。");
    const task = candidates.find((item) => item.id === match.taskId)!;
    if (!result.subjects.includes(task.subject)) throw new Error("AI返回的科目与关联任务不一致。");
    if (match.coverage === "complete" && (task.format === "oral" || task.format === "reading")) throw new Error("纸面作业不能证明口头或阅读任务已经完成。");
    if (match.evidence.some((item) => !material.fileIds.includes(item.fileId))) throw new Error("AI关联引用了未提供的原件。");
  }
  if (result.unassigned.some((item) => !material.fileIds.includes(item.fileId))) throw new Error("AI返回了未提供的未关联原件。");
  if (new Set(result.matches.map((m) => m.taskId)).size !== result.matches.length) throw new Error("AI返回了重复的任务关联。");
  return {
    ...state,
    tasks: state.tasks.map((task) => {
      const match = result.matches.find((item) => item.taskId === task.id);
      if (!match || !result.readable) return task;
      return { ...task, uploaded: true, coverage: task.coverage === "complete" ? task.coverage : match.coverage, evidenceIds: [...new Set([...(task.evidenceIds || []), ...match.evidence.map((e) => e.fileId)])] };
    }),
    materials: state.materials.map((m) => m.id === materialId ? {
      ...m, kind: "每日作业", subject: result.subjects.length === 1 ? result.subjects[0] : undefined,
      subjects: result.subjects, taskIds: result.matches.map((match) => match.taskId),
      processing: result.readable ? "processed" : "needs_rescan",
    } : m),
  };
}
