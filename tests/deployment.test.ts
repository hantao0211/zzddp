import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createMaterialId } from "../src/services/material-id";

const require = createRequire(join(process.cwd(), "tests/deployment.test.ts"));
const { createPreviewServer } = require("../scripts/serve-preview.cjs") as { createPreviewServer: (directory: string) => Server };

test("material import works without the HTTPS-only randomUUID API", () => {
  const httpCrypto = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const first = createMaterialId(httpCrypto);
  assert.match(first, /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
  assert.notEqual(first, createMaterialId(httpCrypto));
});

test("deployment server handles static routes, health checks and rejects writes", async () => {
  const root = mkdtempSync(join(tmpdir(), "xiaobu-server-test-"));
  writeFileSync(join(root, "index.html"), "<h1>Prototype</h1>");
  mkdirSync(join(root, "print"));
  writeFileSync(join(root, "print/index.html"), "Worksheet");
  const server = createPreviewServer(root);
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal(await (await fetch(base)).text(), "<h1>Prototype</h1>");
    assert.equal(await (await fetch(`${base}/print/`)).text(), "Worksheet");
    assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { status: "ok", mode: "prototype" });
    assert.equal((await fetch(`${base}/not-found`)).status, 404);
    assert.equal((await fetch(`${base}/`, { method: "POST", body: "test" })).status, 405);
    assert.equal((await fetch(`${base}/%2e%2e%2fsecret`)).status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(root, { recursive: true });
  }
});
