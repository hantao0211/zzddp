import { existsSync, mkdirSync, copyFileSync, cpSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const output = resolve(process.argv[2] || "dist/xiaobu-prototype.tar.gz");
if (!existsSync(join(root, "out/index.html"))) throw new Error("Run npm run build:preview first");
if (!existsSync(join(root, "dist/assistant/server.cjs"))) throw new Error("Run npm run build:assistant first");
const temporary = mkdtempSync(join(tmpdir(), "xiaobu-prototype-"));
try {
  const release = join(temporary, "xiaobu-prototype");
  mkdirSync(release);
  cpSync(join(root, "out"), join(release, "public"), { recursive: true });
  copyFileSync(join(root, "scripts/serve-preview.cjs"), join(release, "server.cjs"));
  copyFileSync(join(root, "dist/assistant/server.cjs"), join(release, "assistant.cjs"));
  copyFileSync(join(root, "deploy/xiaobu-assistant.service"), join(release, "xiaobu-assistant.service"));
  copyFileSync(join(root, "deploy/nginx/xiaobu-assistant.conf"), join(release, "xiaobu-assistant.conf"));
  copyFileSync(join(root, "docs/homework.md"), join(release, "HOMEWORK.md"));
  copyFileSync(join(root, "deploy/README.md"), join(release, "README.md"));
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  copyFileSync(join(root, "deploy/xiaobu-prototype.service"), join(release, "xiaobu-prototype.service"));
  mkdirSync(resolve(output, ".."), { recursive: true });
  const result = spawnSync("tar", ["-czf", output, "-C", temporary, "xiaobu-prototype"], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("Unable to create deployment archive");
  console.log(JSON.stringify({ version, archive: output, includes: ["compiled public assets", "static server", "assistant backend (no credentials)", "deployment instructions", "service template"] }));
} finally { rmSync(temporary, { recursive: true, force: true }); }
