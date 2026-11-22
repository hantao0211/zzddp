import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AIImage } from "../ai/provider";
import { HomeworkError, HomeworkStore, type FileRow, type PageRow } from "./store";
const exec = promisify(execFile);

export function detectMime(bytes: Buffer): string {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  if (bytes.toString("ascii", 4, 8) === "ftyp" && /heic|heix|hevc|hevx|mif1|msf1/.test(bytes.toString("ascii", 8, 64))) return "image/heic";
  throw new HomeworkError(415, "文件内容不是支持的照片或PDF。请选择JPG、PNG、WebP、HEIC或PDF原件。");
}
export interface ImagePipeline { convert(file: FileRow): Promise<PageRow[]>; images(pages: PageRow[]): AIImage[] }
export class ServerImages implements ImagePipeline {
  constructor(private store: HomeworkStore) {}
  private async run(command: string, args: string[]) {
    try { return await exec(command, args, { timeout: 60000, maxBuffer: 256 * 1024, env: { ...process.env, MAGICK_THREAD_LIMIT: "1" } }); }
    catch (error) {
      const failure = error as { stderr?: string; killed?: boolean };
      const exhausted = /cache resources exhausted|memory allocation failed|unable to extend cache|No space left on device/i.test(failure.stderr || "");
      const category = exhausted ? "RESOURCE_LIMIT" : failure.killed ? "TIMEOUT" : "DECODE_ERROR";
      // Never log document contents, filenames or raw decoder diagnostics.
      console.warn("Image conversion did not finish:", command.split("/").pop(), category);
      if (exhausted || failure.killed) throw new HomeworkError(503, "服务器暂未完成图片转换，原件已保存，后台会有限重试；无需重新上传。");
      throw new HomeworkError(422, "这份文件暂时无法解码，原件已保存。若重试仍失败，请上传清晰照片或未加密PDF。");
    }
  }
  async convert(file: FileRow) {
    const existing = this.store.pages(file.id);
    if (existing.length && existing.every((p) => existsSync(join(this.store.directory, "pages", p.id + ".jpg")))) { this.store.previews.prime(existing); return existing; }
    const temporary = mkdtempSync(join(this.store.directory, "incoming", "convert-"));
    const original = join(this.store.directory, "originals", file.id);
    try {
      let count = 1;
      if (file.mime === "application/pdf") {
        const info = await this.run("/usr/bin/pdfinfo", [original]);
        count = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
        if (!count || count > 20) throw new HomeworkError(422, "原件已保存。单份PDF最多20页，请拆成较小的文件后上传。");
      }
      const pages: PageRow[] = [];
      for (let i = 1; i <= count; i++) {
        let input = original;
        if (file.mime === "application/pdf") {
          const prefix = join(temporary, "pdf");
          await this.run("/usr/bin/pdftoppm", ["-f", String(i), "-l", String(i), "-scale-to", "2400", "-singlefile", "-jpeg", original, prefix]);
          input = prefix + ".jpg";
        } else if (file.mime === "image/heic") {
          input = join(temporary, "heif.jpg");
          await this.run("/usr/bin/heif-convert", [original, input]);
        }
        const id = `${file.id}-p${i}`, output = join(this.store.directory, "pages", id + ".jpg");
        await this.run("/usr/bin/convert", ["-limit", "memory", "64MiB", "-limit", "map", "128MiB", "-limit", "disk", "512MiB", "-limit", "area", "32MP", input + "[0]", "-auto-orient", "-resize", "1800x2400>", "-background", "white", "-alpha", "remove", "-strip", "-quality", "85", output]);
        if (statSync(output).size > 2 * 1024 * 1024) throw new HomeworkError(422, "图片内容过大，原件已保存，请分开拍摄页面。");
        pages.push({ id, file_id: file.id, number: i });
      }
      this.store.setPages(file.id, pages); this.store.previews.prime(pages); return pages;
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
  images(pages: PageRow[]): AIImage[] { return pages.map((p) => ({ fileId: p.id, mimeType: "image/jpeg", base64: readFileSync(join(this.store.directory, "pages", p.id + ".jpg")).toString("base64") })); }
}
