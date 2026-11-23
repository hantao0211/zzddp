import { HomeworkQuotaSettingsSchema } from "../../domain/homework-quota";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Accounts } from "./accounts";
import type { AssistantStore } from "./store";
import type { HomeworkConversation } from "../homework/conversation";
import { HomeworkError } from "../homework/store";
import { CreateAccountSchema, UpdateAccountSchema, ChangePasswordSchema, LimitsSchema, isParent, type Viewer } from "../../domain/accounts";
import { z } from "zod";
const json = (response: ServerResponse, value: unknown) => { response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(value)); };
export class AdminHTTP {
  constructor(private accounts: Accounts, private sessions: AssistantStore, private learning?: HomeworkConversation, private serviceInfo?: { provider: string; model: string }) {}
  async handle(request: IncomingMessage, response: ServerResponse, path: string, viewer: Viewer, body: () => Promise<unknown>) {
    if (!isParent(viewer)) throw new HomeworkError(403, "这是家长管理功能，请使用家长账号登录。");
    if (path === "/assistant-api/admin/password" && request.method === "PATCH") {
      this.sessions.loginAttempt(String(request.headers["x-real-ip"] || request.socket.remoteAddress));
      const parsed = ChangePasswordSchema.safeParse(await body());
      if (!parsed.success) throw new HomeworkError(400, "请填写当前密码和至少8位的新密码。");
      await this.accounts.changePassword(viewer.id, parsed.data.currentPassword, parsed.data.password);
      this.sessions.revokeUser(viewer.id);
      json(response, { updated: true, signInAgain: true }); return;
    }
    if (path === "/assistant-api/admin/overview" && request.method === "GET") {
      const store = this.learning?.store;
      const days = store ? (store.db.prepare("SELECT date,status,note,report FROM days ORDER BY date DESC LIMIT 60").all() as { date: string; status: string; note: string; report: string | null }[]).map(d => {
        const report = d.report ? JSON.parse(d.report) : null;
        const uploads = store.db.prepare("SELECT COUNT(*) AS n FROM uploads WHERE date=?").get(d.date) as { n: number };
        const files = store.db.prepare("SELECT COUNT(*) AS n FROM files f JOIN uploads u ON u.id=f.upload_id WHERE u.date=? AND f.stored=1").get(d.date) as { n: number };
        return { date: d.date, status: d.status, note: d.note, tasks: report?.tasks.length || 0, uploads: uploads.n, originals: files.n, grading: store.grading.summary(d.date) };
      }) : [];
      const jobCounts = store?.db.prepare("SELECT status,COUNT(*) AS count FROM jobs GROUP BY status").all() || [];
      json(response, { viewer, days, jobCounts, homeworkQuota: store?.quota() || null, homeworkUsage: store?.usage.summary() || null, ...this.sessions.settings(), legacyAccess: this.accounts.legacyAllowed(), service: this.serviceInfo || null, features: { autoGrading: !!store?.autoGradingEnabled, writtenCompletion: !!store?.writtenCompletionEnabled }, memories: this.learning?.memories.list() || [], knowledge: this.learning?.memories.catalog() || { rules: [], corrections: [], history: [] } }); return;
    }
    if (path === "/assistant-api/admin/homework-quota" && request.method === "PATCH") {
      const parsed = HomeworkQuotaSettingsSchema.safeParse(await body());
      if (!parsed.success) throw new HomeworkError(400, "作业每日AI额度须为1—5000的整数。");
      if (!this.learning) throw new HomeworkError(503, "作业服务尚未启用。");
      json(response, this.learning.store.setQuota(parsed.data, viewer.id)); return;
    }
    // Family members and assistant spend limits can only be administered by an administrator.
    if (viewer.role !== "admin") throw new HomeworkError(403, "只有家庭管理员可以管理账号和额度。");
    if (path === "/assistant-api/admin/accounts" && request.method === "GET") { json(response, { items: this.accounts.list() }); return; }
    if (path === "/assistant-api/admin/accounts" && request.method === "POST") {
      const parsed = CreateAccountSchema.safeParse(await body()); if (!parsed.success) throw new HomeworkError(400, "登录名为2—32位英文或数字，密码至少8位，请检查称呼和角色。");
      json(response, await this.accounts.create(parsed.data, viewer.id)); return;
    }
    const member = path.match(/^\/assistant-api\/admin\/accounts\/([a-f0-9-]{36})$/);
    if (member && request.method === "PATCH") {
      const parsed = UpdateAccountSchema.safeParse(await body()); if (!parsed.success) throw new HomeworkError(400, "请检查称呼、角色和密码（至少8位）。");
      const result = await this.accounts.update(member[1], parsed.data, viewer.id);
      if (result.resetPassword || !parsed.data.active) this.sessions.revokeUser(member[1]);
      json(response, { updated: true, signInAgain: member[1] === viewer.id && result.resetPassword }); return;
    }
    if (path === "/assistant-api/admin/limits" && request.method === "PATCH") {
      const parsed = LimitsSchema.safeParse(await body()); if (!parsed.success) throw new HomeworkError(400, "每日限额须为1—5000的整数。");
      this.sessions.setLimits(parsed.data); json(response, this.sessions.settings()); return;
    }
    if (path === "/assistant-api/admin/legacy-access" && request.method === "PATCH") {
      const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(await body()); if (!parsed.success) throw new HomeworkError(400, "请确认旧访问码设置。");
      this.accounts.setLegacy(parsed.data.enabled, viewer.id); if (!parsed.data.enabled) this.sessions.revokeLegacy();
      json(response, { enabled: this.accounts.legacyAllowed() }); return;
    }
    throw new HomeworkError(404, "没有找到这个管理功能。");
  }
}
