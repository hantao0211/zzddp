import { createHash, randomUUID } from "node:crypto";
import { MemoryCandidateSchema, type LearnedMemory, type MemoryCandidate, type KnowledgeCatalog, type ConfirmedKnowledgeExample } from "../../domain/memory";
import { ClarificationActionSchema } from "../../domain/clarifications";
import { HomeworkError, type HomeworkStore, type UploadRow } from "./store";
import { effectiveMemo, sourceHash, type NoteRow } from "./memo-context";
import type { ChatInput } from "../../domain/assistant";

type MemoryRow = { id: string; kind: MemoryCandidate["kind"]; trigger_text: string; trigger_key: string; subject: MemoryCandidate["subject"]; summary: string; source_quote: string; source_date: string; status: string; replaces_id: string | null; created_at: string };
const key = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\s“”"'‘’＋+]/g, "");
const abbreviationKey = (text: string) => key(text.split(/[+＋\s（(<【\[]/u)[0].replace(/(?:N|数字|课号|页码|序号|[0-9零〇一二三四五六七八九十百]+)$/u, ""));
// A pointer to today's page is useful task context, not a general rule for future uploads.
export function isReusableMemoryEvidence(evidence: string) {
  const localPointer = /(?:这|那|今|当|本)(?:一|天|次)?(?:张|幅|份|页|次|天).{0,12}(?:图|照片|作业|预习|内容)|(?:图|照片).{0,8}(?:里|里面|上的|拍的|对应)/u.test(evidence);
  const explicitRule = /以后|今后|下次|每次|通常|一般|一直|习惯|简称|缩写|后面.{0,8}(?:数字|课号|页码)|(?:表示|代表).{0,20}(?:对应|数字|课号|页码)/u.test(evidence);
  return !localPointer || explicitRule;
}
const numeral = (text: string) => {
  if (/^\d+$/.test(text)) return Number(text);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0, digit = 0;
  for (const character of text) {
    if (character in digits) digit = digits[character];
    else { total += (digit || 1) * ({ 十: 10, 百: 100, 千: 1000 }[character] || 0); digit = 0; }
  }
  return total + digit;
};
export function isReusableAbbreviationEvidence(evidence: string) {
  // A corrected reading teaches us about this instance, not a permanent replacement of digits.
  if (/(?:误识别|误读|误认|识别错|识别有误|看错|认错|漏识别|漏认|漏掉|写得?[^。！？]{0,8}潦草|被[^。！？]{0,12}(?:认|看|识别)成)/u.test(evidence)) return false;
  const numbers = "[0-9零〇一二两三四五六七八九十百千]+";
  const pairs = new RegExp(`(?:预|复|默|背|抄|读)\\s*[“‘\"']?(${numbers})[”’\"']?[^。！？\\n]{0,40}?第\\s*(${numbers})\\s*课`, "gu");
  return [...evidence.normalize("NFKC").matchAll(pairs)].every(pair => numeral(pair[1]) === numeral(pair[2]));
}
const reusable = (memory: { kind: MemoryCandidate["kind"]; sourceQuote: string; summary: string }) => isReusableMemoryEvidence(memory.sourceQuote) && (memory.kind !== "memo_abbreviation" || isReusableAbbreviationEvidence(memory.sourceQuote) && isReusableAbbreviationEvidence(memory.summary));
const view = (row: MemoryRow): LearnedMemory => ({ id: row.id, kind: row.kind, trigger: row.trigger_text, summary: row.summary, subject: row.subject, sourceQuote: row.source_quote, sourceDate: row.source_date, createdAt: row.created_at });
const tokens = (text: string) => {
  const result = new Set(text.toLowerCase().match(/[a-z]+|\d+/g) || []);
  const stop = new Set(["什么", "怎么", "这个", "那个", "我的", "我们", "你们", "可以", "一下", "小助", "助手", "系统"]);
  for (const part of text.match(/[\p{Script=Han}]+/gu) || []) for (let i = 0; i < part.length - 1; i++) if (!stop.has(part.slice(i, i + 2))) result.add(part.slice(i, i + 2));
  return [...result].slice(0, 100);
};

export class LearnedMemories {
  constructor(private store: HomeworkStore) {}
  list(): LearnedMemory[] { return (this.store.db.prepare("SELECT * FROM learned_memories WHERE status='active' ORDER BY rowid DESC LIMIT 500").all() as MemoryRow[]).map(view); }
  catalog(): KnowledgeCatalog {
    const rows = this.store.db.prepare("SELECT * FROM learned_memories ORDER BY rowid DESC LIMIT 500").all() as MemoryRow[];
    const applicable = reusable;
    return {
      rules: rows.filter(r => r.status === "active" && applicable(view(r))).map(view),
      corrections: this.corrections(),
      history: rows.filter(r => r.status !== "active" || !applicable(view(r))).map(r => {
        const memory = view(r);
        const status = r.status === "active" ? "excluded" as const : r.status === "superseded" ? "superseded" as const : "revoked" as const;
        const reason = !isReusableMemoryEvidence(memory.sourceQuote) ? "这条只说明当次照片或作业的对应关系，不作为跨作业的长期规则。" : memory.kind === "memo_abbreviation" && (!isReusableAbbreviationEvidence(memory.sourceQuote) || !isReusableAbbreviationEvidence(memory.summary)) ? "识字或课号纠正只适用于当次记录，不能作为替换课号的简称规则。" : status === "superseded" ? "已有较新的解释，不再调用这一版。" : "已停用，不再用于后续识别和问答。";
        return { ...memory, status, reason };
      }),
    };
  }
  recall(question: string) {
    const terms = tokens(question), normalized = key(question);
    return this.list().filter(reusable).map((memory, order) => {
      const text = `${memory.trigger} ${memory.summary}`.toLowerCase();
      const trigger = memory.kind === "memo_abbreviation" ? abbreviationKey(memory.trigger) : key(memory.trigger);
      const score = (trigger && normalized.includes(trigger) ? 10 : 0) + terms.filter((t) => text.includes(t)).length + (memory.kind !== "memo_abbreviation" ? 1 : 0);
      return { memory, score, order };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 8).map((r) => r.memory);
  }
  remember(candidates: MemoryCandidate[], question: string, date: string, history: ChatInput["history"] = []) {
    const saved: LearnedMemory[] = [], notices: string[] = [];
    if (/(不要|不用|别|无需|不必|不需要).{0,10}(记住|记忆|保存|记录)|(只是|仅仅|仅).{0,8}(例子|举例)/u.test(question)) return { saved, notices };
    this.store.transaction(() => {
      for (const input of candidates) {
        const parsed = MemoryCandidateSchema.safeParse(input);
        if (!parsed.success) { notices.push("有一条记忆缺少明确依据，未保存。"); continue; }
        const candidate = parsed.data;
        if (candidate.kind === "memo_abbreviation" && (!isReusableAbbreviationEvidence(candidate.evidenceQuote) || !isReusableAbbreviationEvidence(candidate.summary) || !isReusableAbbreviationEvidence(question))) { notices.push("这是本次识别的纠正，不会保存为把一个课号替换成另一个课号的简称规则；作业内容通过修改预览确认。"); continue; }
        if (!isReusableMemoryEvidence(candidate.evidenceQuote)) { notices.push("这次的作业对应关系只用于当前说明，不保存为长期简称规则。"); continue; }
        const confirmation = candidate.confirmationQuote;
        const confirmed = !!confirmation && question.includes(confirmation) && /^(对|是的|没错|正确|就是|确认|记住|好的|好，|OK|ok|嗯|你说得对|理解对了)/u.test(confirmation);
        const earlier = history.slice(-8).filter((m) => m.role === "user").some((m) => m.content.includes(candidate.evidenceQuote)) || !!history.filter((m) => m.role === "assistant").at(-1)?.content.includes(candidate.evidenceQuote);
        if (!question.includes(candidate.evidenceQuote) && !(confirmed && earlier)) { notices.push("有一条记忆尚未得到你的明确说明或确认，未保存。"); continue; }
        if (!confirmed && candidate.kind === "memo_abbreviation" && /是什么|是啥|什么意思|代表什么|是不是|是否|怎么|如何|能不能/u.test(candidate.evidenceQuote)) { notices.push("这次仍是在提问，尚未作为已确认知识保存。"); continue; }
        const value = parsed.data, triggerKey = value.kind === "memo_abbreviation" ? abbreviationKey(value.trigger) : key(value.trigger);
        if (!triggerKey) { notices.push("有一条记忆缺少明确的检索关键词，未保存。"); continue; }
        const matching = this.store.db.prepare("SELECT * FROM learned_memories WHERE status='active' AND kind=? AND trigger_key=? AND subject IS ? ORDER BY rowid DESC LIMIT 1").get(value.kind, triggerKey, value.subject) as MemoryRow | undefined;
        const existing = value.replacesMemoryId ? this.store.db.prepare("SELECT * FROM learned_memories WHERE id=? AND status='active'").get(value.replacesMemoryId) as MemoryRow | undefined : matching;
        if (existing && key(existing.summary) === key(value.summary)) continue;
        if ((existing && existing.id !== value.replacesMemoryId) || (!existing && value.replacesMemoryId) || (existing && existing.kind !== value.kind) || (matching && existing?.id !== matching.id)) { notices.push("这次说明与已有记忆的版本不一致，未自动替换。请指出需要更正的那条记忆。"); continue; }
        const count = this.store.db.prepare("SELECT COUNT(*) AS n FROM learned_memories WHERE status='active'").get() as { n: number };
        if (!existing && count.n >= 500) { notices.push("已积累较多记忆，请先整理不再适用的内容；已有记忆仍保留。"); continue; }
        const id = randomUUID(), time = new Date(this.store.now()).toISOString();
        if (existing) this.store.db.prepare("UPDATE learned_memories SET status='superseded',updated_at=? WHERE id=?").run(time, existing.id);
        const sourceQuote = question.includes(value.evidenceQuote) ? value.evidenceQuote : `${value.evidenceQuote}\n用户确认：${confirmation}`;
        this.store.db.prepare("INSERT INTO learned_memories(id,kind,trigger_text,trigger_key,subject,summary,source_quote,source_date,replaces_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id, value.kind, value.trigger, triggerKey, value.subject, value.summary, sourceQuote, date, existing?.id || null, time, time);
        saved.push(view(this.store.db.prepare("SELECT * FROM learned_memories WHERE id=?").get(id) as MemoryRow));
      }
    });
    return { saved, notices: [...new Set(notices)] };
  }
  revoke(id: string) {
    const memory = this.store.db.prepare("SELECT id FROM learned_memories WHERE id=?").get(id);
    if (!memory) throw new HomeworkError(404, "没有找到这条记忆。");
    this.store.db.prepare("UPDATE learned_memories SET status='revoked',updated_at=? WHERE id=?").run(new Date(this.store.now()).toISOString(), id);
    return { revoked: true };
  }
  private corrections(): ConfirmedKnowledgeExample[] {
    const notes = this.store.db.prepare(`SELECT c.* FROM clarifications c JOIN uploads u ON u.id=c.memo_id
      WHERE c.undone_at IS NULL AND u.kind='memo' AND u.result IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM clarifications newer WHERE newer.memo_id=c.memo_id AND newer.entry_index=c.entry_index AND newer.undone_at IS NULL AND newer.rowid>c.rowid)
      ORDER BY c.rowid DESC LIMIT 12`).all() as NoteRow[];
    return notes.flatMap((note) => {
      try {
        const memo = this.store.upload(note.memo_id) as UploadRow, data = effectiveMemo(this.store, memo);
        const original = data.original.assignments[note.entry_index];
        if (!original || sourceHash(original) !== note.source_hash) return [];
        const current = data.result.assignments[note.entry_index], action = ClarificationActionSchema.parse(JSON.parse(note.payload));
        const small = (a: typeof original) => ({ subject: a.subject, title: a.title, requirement: a.requirement.slice(0, 500), format: a.format });
        return [{ id: note.id, sourceDate: memo.date, original: small(original), corrected: small(current), explanation: action.userQuote }];
      } catch { return []; }
    });
  }
  forRecognition() {
    const rules = this.list().filter((m) => m.kind === "memo_abbreviation" && reusable(m)).slice(0, 20), corrections = this.corrections();
    const revision = createHash("sha256").update(JSON.stringify({ rules, corrections })).digest("hex").slice(0, 20);
    return { rules, corrections, revision, boundary: "这些是这个孩子的已提炼知识和确认过的纠正案例。规则只在当前图片与科目上下文相符时适用；识字纠正案例中original是旧识别，不一定是孩子原文，corrected才是用户确认的当次含义。漏字、漏数字不构成简称规则，不能把一个课号永久替换成另一个，不能把历史课号固定套用于本次数字。当前清晰图片和新的明确说明优先；有矛盾就保留不确定。证据ID必须来自本次页面，不能引用记忆或旧案例ID作为本次图片证据。" };
  }
}
