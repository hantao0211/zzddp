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
  copyFileSync(join(root, "LICENSE"), join(release, "LICENSE"));
  copyFileSync(join(root, "NOTICE"), join(release, "NOTICE"));
  mkdirSync(join(release, "docs"));
  copyFileSync(join(root, "docs/licensing.md"), join(release, "docs/licensing.md"));
  mkdirSync(join(release, "third-party-licenses"));
  for (const [dependency, file] of [["next", "license.md"], ["react", "LICENSE"], ["react-dom", "LICENSE"], ["lucide-react", "LICENSE"], ["zod", "LICENSE"]]) {
    copyFileSync(join(root, "node_modules", dependency, file), join(release, "third-party-licenses", dependency + ".txt"));
  }
  cpSync(join(root, "out"), join(release, "public"), { recursive: true });
  copyFileSync(join(root, "scripts/serve-preview.cjs"), join(release, "server.cjs"));
  copyFileSync(join(root, "dist/assistant/server.cjs"), join(release, "assistant.cjs"));
  copyFileSync(join(root, "dist/assistant/diagnostics.cjs"), join(release, "diagnostics.cjs"));
  copyFileSync(join(root, "deploy/xiaobu-diagnostics.service"), join(release, "xiaobu-diagnostics.service"));
  copyFileSync(join(root, "deploy/xiaobu-assistant.service"), join(release, "xiaobu-assistant.service"));
  copyFileSync(join(root, "deploy/nginx/xiaobu-assistant.conf"), join(release, "xiaobu-assistant.conf"));
  copyFileSync(join(root, "deploy/nginx/xiaobu.conf"), join(release, "xiaobu.conf"));
  copyFileSync(join(root, "docs/diagnostics.md"), join(release, "docs/diagnostics.md"));
  copyFileSync(join(root, "docs/homework.md"), join(release, "HOMEWORK.md"));
  copyFileSync(join(root, "docs/accounts.md"), join(release, "ACCOUNTS.md"));
  copyFileSync(join(root, "docs/reading.md"), join(release, "READING.md"));
  copyFileSync(join(root, "docs/design-system.md"), join(release, "DESIGN.md"));
  copyFileSync(join(root, "deploy/README.md"), join(release, "README.md"));
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  copyFileSync(join(root, "deploy/xiaobu-prototype.service"), join(release, "xiaobu-prototype.service"));
  mkdirSync(resolve(output, ".."), { recursive: true });
  const result = spawnSync("tar", ["-czf", output, "-C", temporary, "xiaobu-prototype"], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("Unable to create deployment archive");
  console.log(JSON.stringify({ version, archive: output, includes: ["compiled public assets", "static server", "assistant backend (no credentials)", "deployment instructions", "service template", "project license and usage guidance", "direct runtime dependency license texts"] }));
} finally { rmSync(temporary, { recursive: true, force: true }); }
