import { record } from "../diagnostics/events";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { WorkPool } from "../work/concurrency";

export type PreviewSize = "thumb" | "screen";
export type PreviewRenderer = (source: string, screen: string, thumb: string) => Promise<void>;
const exec = promisify(execFile);
const render: PreviewRenderer = async (source, screen, thumb) => {
  await exec("/usr/bin/convert", ["-limit", "memory", "32MiB", "-limit", "map", "64MiB", "-limit", "disk", "128MiB", "-limit", "area", "16MP", source,
    "-strip", "-resize", "1600x1600>", "-sampling-factor", "4:4:4", "-quality", "80", "-interlace", "Plane", "-write", screen,
    "-resize", "480x480>", "-quality", "72", thumb],
  { timeout: 15000, maxBuffer: 32768, env: { ...process.env, MAGICK_THREAD_LIMIT: "1" } });
};

/** Disposable private derivatives. Neither originals nor the AI's page image is rewritten. */
export class PagePreviews {
  private pool = new WorkPool(1);
  private pending = new Map<string, Promise<void>>();
  private failures = new Map<string, number>();
  constructor(private directory: string, private renderer: PreviewRenderer = render) {}
  async get(pageId: string, size: PreviewSize): Promise<string> {
    if (!/^[a-f0-9-]{36}-p\d{1,3}$/.test(pageId)) throw Error("Invalid page identifier");
    const source = join(this.directory, "pages", pageId + ".jpg"), sourceStat = await stat(source);
    const fingerprint = createHash("sha256").update(`${sourceStat.size}:${sourceStat.mtimeMs}`).digest("hex").slice(0, 20);
    const root = join(this.directory, "previews", "v1"), key = `${pageId}-${fingerprint}`;
    const screen = join(root, key + "-screen.jpg"), thumb = join(root, key + "-thumb.jpg"), selected = size === "screen" ? screen : thumb;
    if (await stat(selected).then(s => s.size > 0, () => false)) return selected;
    if ((this.failures.get(key) || 0) > Date.now()) return source;
    let work = this.pending.get(key);
    if (!work) {
      // Browsing a long archive must not create an unbounded image-conversion queue.
      if (this.pending.size >= 16) return source;
      work = this.pool.run(async () => {
        await mkdir(root, { recursive: true, mode: 0o700 });
        const temporary = await mkdtemp(join(root, "render-"));
        try {
          const small = join(temporary, "thumb.jpg"), large = join(temporary, "screen.jpg");
          await this.renderer(source, large, small);
          for (const [from, to] of [[large, screen], [small, thumb]]) {
            const output = await stat(from);
            if (!output.size) throw Error("Empty preview");
            if (output.size >= sourceStat.size) await copyFile(source, from);
            await rename(from, to);
          }
        } finally { await rm(temporary, { recursive: true, force: true }); }
      });
      this.pending.set(key, work);
    }
    try { await work; return selected; }
    catch {
      // A failed optional optimization must not hide an otherwise readable page.
      if (!this.failures.has(key)) record({ event: "image.preview", error: true });
      if (this.failures.size >= 128) this.failures.delete(this.failures.keys().next().value!);
      this.failures.set(key, Date.now() + 60000);
      return source;
    } finally { if (this.pending.get(key) === work) this.pending.delete(key); }
  }
  prime(pages: { id: string }[]) {
    for (const page of pages) void this.get(page.id, "thumb").catch(() => {});
  }
}
