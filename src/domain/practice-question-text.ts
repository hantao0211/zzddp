/** Keep authored line breaks and recover structure in older, single-line questions. */
export function formatPracticeQuestionText(question: string): string {
  const text = question.replace(/\r\n?/g, "\n").trim();
  const choices = [...text.matchAll(/(^|[\n\t \u3000])([A-H][.．、])(?=[\t \u3000]+\S)/g)];
  const hasChoices = choices.some((choice, index) =>
    choice[2][0] === "A" && choices[index + 1]?.[2][0] === "B");

  return (hasChoices ? text.replace(/[\t \u3000]+([A-H][.．、])(?=[\t \u3000]+\S)/g, "\n$1") : text)
    .replace(/[\t \u3000]+([（(]\d{1,2}[）)])(?=[\t \u3000]+\S)/g, "\n$1")
    .replace(/(?:^|\n)?[\t \u3000]*(作答区|你的答案|请作答)[：:][\t \u3000]*/g, "\n$1：")
    .replace(/\n(?:[\t \u3000]*\n){2,}/g, "\n\n")
    .trim();
}
