import type { Observation } from "./assessment";

type HeadingSource = Pick<Observation, "label" | "question"> & Partial<Pick<Observation, "knowledgePoints">>;

function displayExamLabel(label: string) {
  const normalized = label.trim().normalize("NFKC");
  const numbered = /^(\d{1,3})(?:\s*\((\d{1,3})\))?[.、]?$/.exec(normalized);
  if (numbered) return `第${numbered[1]}题${numbered[2] ? `（${numbered[2]}）` : ""}`;
  const subquestion = /^\((\d{1,3})\)$/.exec(normalized);
  if (subquestion) return `第${subquestion[1]}小题`;
  return label.trim() || "题号未识别";
}

export function examQuestionHeading({ label, question, knowledgePoints }: HeadingSource) {
  const number = displayExamLabel(label);
  const stem = question.trim().replace(/\s+/g, " ");
  const topic = knowledgePoints?.map(point => point.trim()).find(point =>
    point && !/^(待分类|未分类|待确认|待补充|未知|无)$/.test(point) && !number.includes(point)
  );
  if (topic) return { number, summary: topic, preview: stem === topic ? "" : stem };

  // Older records may have only the original wording. Keep formulas and decimal points intact.
  const clause = /^(.{3,32}?)[，。；：？]\s*(.+)$/u.exec(stem);
  if (clause) return { number, summary: clause[1], preview: clause[2] };
  return { number, summary: stem, preview: "" };
}
