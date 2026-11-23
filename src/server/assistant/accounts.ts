import { AvatarIdSchema, defaultAvatar, type AvatarId } from "../../domain/avatars";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BootstrapSchema, CreateAccountSchema, UpdateAccountSchema, type Viewer } from "../../domain/accounts";
import { digest } from "./store";
import { HomeworkError } from "../homework/store";
const derive = promisify(scrypt);
type UserRow = { id: string; username: string; username_key: string; name: string; role: Viewer["role"]; password_hash: string; active: number; created_at: string };

async function passwordHash(password: string) { const salt = randomBytes(16).toString("hex"); return salt + ":" + (await derive(password, salt, 32) as Buffer).toString("hex"); }
export class Accounts {
  readonly db: DatabaseSync;
  private setupFile: string;
  constructor(directory: string, private now = Date.now) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, "accounts.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,username TEXT NOT NULL,username_key TEXT NOT NULL UNIQUE,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','parent','child')),password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS account_avatars(account_id TEXT PRIMARY KEY REFERENCES accounts(id),avatar TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS account_audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,created_at TEXT NOT NULL);`);
    this.setupFile = join(directory, "parent-setup-code");
    if (this.needsSetup()) {
      const old = this.setting("bootstrap_hash");
      if (old) { if (!existsSync(this.setupFile) || digest(readFileSync(this.setupFile, "utf8").trim()) !== old) throw new Error("Parent setup state requires recovery"); }
      else {
        const token = randomBytes(24).toString("base64url");
        writeFileSync(this.setupFile, token + "\n", { mode: 0o600, flag: "wx" });
        this.db.prepare("INSERT INTO settings(key,value) VALUES('bootstrap_hash',?)").run(digest(token));
      }
    } else if (existsSync(this.setupFile)) unlinkSync(this.setupFile);
  }
  private view(row: UserRow): Viewer {
    const saved = this.db.prepare("SELECT avatar FROM account_avatars WHERE account_id=?").get(row.id) as { avatar: string } | undefined;
    const parsed = AvatarIdSchema.safeParse(saved?.avatar);
    return { id: row.id, username: row.username, name: row.name, role: row.role, avatar: parsed.success ? parsed.data : defaultAvatar(row.name, row.role) };
  }
  setAvatar(id: string, avatar: AvatarId) {
    const parsed = AvatarIdSchema.safeParse(avatar);
    if (!parsed.success) throw new HomeworkError(400, "请选择列表里的表情。");
    if (!this.profile(id)) throw new HomeworkError(401, "请用自己的独立账号登录后选择表情。");
    this.db.prepare("INSERT INTO account_avatars(account_id,avatar,updated_at) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET avatar=excluded.avatar,updated_at=excluded.updated_at").run(id, parsed.data, new Date(this.now()).toISOString());
    return this.profile(id)!;
  }
  needsSetup() { return (this.db.prepare("SELECT COUNT(*) AS n FROM accounts").get() as { n: number }).n === 0; }
  private setting(key: string) { return (this.db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined)?.value; }
  legacyAllowed() { return this.setting("legacy_access") !== "off"; }
  profile(id: string): Viewer | null { const row = this.db.prepare("SELECT * FROM accounts WHERE id=? AND active=1").get(id) as UserRow | undefined; return row ? this.view(row) : null; }
  list() { return (this.db.prepare("SELECT * FROM accounts ORDER BY created_at,rowid").all() as UserRow[]).map(r => ({ ...this.view(r), active: !!r.active, createdAt: r.created_at })); }
  async login(username: string, password: string) {
    const row = this.db.prepare("SELECT * FROM accounts WHERE username_key=?").get(username.toLowerCase()) as UserRow | undefined;
    const [salt, expected] = (row?.password_hash || "00".repeat(16) + ":" + "00".repeat(32)).split(":");
    const actual = await derive(password, salt, 32) as Buffer;
    return row?.active && timingSafeEqual(actual, Buffer.from(expected, "hex")) ? this.view(row) : null;
  }
  private audit(actor: string, action: string, target: string) { this.db.prepare("INSERT INTO account_audit VALUES(?,?,?,?,?)").run(randomUUID(), actor, action, target, new Date(this.now()).toISOString()); }
  private insert(input: { username: string; name: string; role: Viewer["role"] }, hash: string, actor: string) {
    const count = (this.db.prepare("SELECT COUNT(*) AS n FROM accounts").get() as { n: number }).n;
    if (count >= 30) throw new HomeworkError(409, "家庭账号已达30个，请停用不再使用的账号。");
    if (this.db.prepare("SELECT id FROM accounts WHERE username_key=?").get(input.username.toLowerCase())) throw new HomeworkError(409, "这个登录名已使用，请换一个。");
    const id = randomUUID(), time = new Date(this.now()).toISOString();
    this.db.prepare("INSERT INTO accounts VALUES(?,?,?,?,?,?,1,?,?)").run(id, input.username, input.username.toLowerCase(), input.name, input.role, hash, time, time);
    this.audit(actor, "create:" + input.role, id); return this.profile(id)!;
  }
  async bootstrap(value: unknown) {
    const input = BootstrapSchema.parse(value), expected = this.setting("bootstrap_hash");
    if (!this.needsSetup()) throw new HomeworkError(409, "家长账号已开通，请直接登录。");
    if (!expected || !timingSafeEqual(Buffer.from(digest(input.setupCode), "hex"), Buffer.from(expected, "hex"))) throw new HomeworkError(401, "家长开通码不正确。");
    const hash = await passwordHash(input.password);
    this.db.exec("BEGIN IMMEDIATE");
    let user: Viewer;
    try {
      if (!this.needsSetup()) throw new HomeworkError(409, "家长账号已开通，请直接登录。");
      user = this.insert({ ...input, role: "admin" }, hash, "server-bootstrap");
      this.db.prepare("DELETE FROM settings WHERE key='bootstrap_hash'").run(); this.db.exec("COMMIT");
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
    if (existsSync(this.setupFile)) unlinkSync(this.setupFile);
    return user;
  }
  async create(value: unknown, actor: string) { const input = CreateAccountSchema.parse(value), hash = await passwordHash(input.password); return this.insert(input, hash, actor); }
  async changePassword(id: string, currentPassword: string, password: string) {
    const current = this.db.prepare("SELECT * FROM accounts WHERE id=? AND active=1").get(id) as UserRow | undefined;
    if (!current || !(await this.login(current.username, currentPassword))) throw new HomeworkError(401, "当前密码不正确，请重新输入。");
    const hash = await passwordHash(password);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.db.prepare("UPDATE accounts SET password_hash=?,updated_at=? WHERE id=? AND active=1 AND password_hash=?").run(hash, new Date(this.now()).toISOString(), id, current.password_hash);
      if (result.changes !== 1) throw new HomeworkError(409, "账号刚刚发生变化，请重新登录后再修改密码。");
      this.audit(id, "change-own-password", id); this.db.exec("COMMIT");
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  async update(id: string, value: unknown, actor: string) {
    const input = UpdateAccountSchema.parse(value), hash = input.password ? await passwordHash(input.password) : undefined;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db.prepare("SELECT * FROM accounts WHERE id=?").get(id) as UserRow | undefined;
      if (!current) throw new HomeworkError(404, "账号不存在。");
      if (actor === id && (!input.active || input.role !== "admin")) throw new HomeworkError(409, "不能停用或降低当前管理员账号的权限。");
      const admins = (this.db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE role='admin' AND active=1").get() as { n: number }).n;
      if (current.active && current.role === "admin" && (!input.active || input.role !== "admin") && admins <= 1) throw new HomeworkError(409, "家庭至少要保留一个可用管理员。");
      this.db.prepare("UPDATE accounts SET name=?,role=?,active=?,password_hash=?,updated_at=? WHERE id=?").run(input.name, input.role, Number(input.active), hash || current.password_hash, new Date(this.now()).toISOString(), id);
      this.audit(actor, hash ? "update-and-reset-password" : "update", id); this.db.exec("COMMIT"); return { resetPassword: !!hash };
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  setLegacy(enabled: boolean, actor: string) {
    if (!enabled && !this.db.prepare("SELECT id FROM accounts WHERE role='child' AND active=1 LIMIT 1").get()) throw new HomeworkError(409, "请先建立一个可用的孩子账号，再关闭旧访问码。");
    this.db.prepare("INSERT INTO settings VALUES('legacy_access',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(enabled ? "on" : "off");
    this.audit(actor, enabled ? "enable-legacy-code" : "disable-legacy-code", "family");
  }
  close() { this.db.close(); }
}
