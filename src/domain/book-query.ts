export const ISBN_QUERY_HINT = "这串编号未通过ISBN校验。请找书背面条形码旁的ISBN（10位，或978/979开头的13位），也可以改用书名查找。";
export class BookQueryError extends Error {}

export function validISBN(value: string): boolean {
  if (/^\d{9}[\dX]$/.test(value)) {
    return [...value].reduce((sum, char, i) => sum + (char === "X" ? 10 : Number(char)) * (10 - i), 0) % 11 === 0;
  }
  return /^97[89]\d{10}$/.test(value) && [...value].reduce((sum, char, i) => sum + Number(char) * (i % 2 ? 3 : 1), 0) % 10 === 0;
}

export function parseBookQuery(input: string): {kind: "isbn" | "title"; value: string} {
  const text = input.normalize("NFKC").trim().replace(/[‐‑‒–—−]/g, "-");
  if (text.length < 2 || text.length > 100) throw new BookQueryError("请输入2至100字的书名或ISBN。");
  const prefixed = /^ISBN(?:-1[03])?\s*:?\s*/i.test(text);
  const number = text.replace(/^ISBN(?:-1[03])?\s*:?\s*/i, "").replace(/[\s-]/g, "").toUpperCase();
  const numberLike = /^[\dX]+$/.test(number) && (number.length >= 8 || /[-\s]/.test(text));
  if (prefixed || numberLike) {
    if (!validISBN(number)) throw new BookQueryError(ISBN_QUERY_HINT);
    return {kind: "isbn", value: number};
  }
  return {kind: "title", value: text};
}
