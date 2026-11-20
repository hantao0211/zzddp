"use strict";

// Serve only the compiled prototype. No upload endpoint, database or package installation.
const http = require("http");
const fs = require("fs");
const path = require("path");
const URL = require("url").URL;

const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
};

function createPreviewServer(directory) {
  const root = fs.realpathSync(directory);
  return http.createServer(function (request, response) {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "SAMEORIGIN");
    response.setHeader("Referrer-Policy", "same-origin");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      response.writeHead(405); response.end("Method not allowed"); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
    catch (_) { response.writeHead(400); response.end("Invalid URL"); return; }
    if (pathname === "/healthz") {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(request.method === "HEAD" ? undefined : JSON.stringify({ status: "ok", mode: "prototype" })); return;
    }
    const filename = path.resolve(root, "." + pathname);
    if (filename !== root && !filename.startsWith(root + path.sep)) {
      response.writeHead(403); response.end("Forbidden"); return;
    }
    let selected = filename;
    try {
      const stat = fs.statSync(selected);
      if (stat.isDirectory()) {
        if (!pathname.endsWith("/")) {
          response.writeHead(308, { Location: encodeURI(pathname + "/") }); response.end(); return;
        }
        selected = path.join(selected, "index.html");
      }
      if (!fs.statSync(selected).isFile()) throw new Error("Not a file");
      const real = fs.realpathSync(selected);
      if (!real.startsWith(root + path.sep)) throw new Error("Outside public directory");
    } catch (_) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); response.end("Not found"); return;
    }
    const stat = fs.statSync(selected);
    const contentType = pathname.replace(/\/$/, "") === "/api/v1/demo" ? "application/json; charset=utf-8" : types[path.extname(selected)] || "application/octet-stream";
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Length", stat.size);
    response.setHeader("Cache-Control", pathname.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache");
    if (request.method === "HEAD") { response.end(); return; }
    const stream = fs.createReadStream(selected);
    stream.on("error", function () { response.destroy(); });
    stream.pipe(response);
  });
}

if (require.main === module) {
  const directory = path.resolve(process.argv[2] || "out");
  const port = Number(process.env.PORT || 3080);
  const host = process.env.HOST || "0.0.0.0";
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
  if (!fs.existsSync(path.join(directory, "index.html"))) throw new Error("Compiled index.html is missing");
  const server = createPreviewServer(directory);
  server.on("error", function (error) { console.error(error.message); process.exit(1); });
  server.listen(port, host, function () { console.log("Xiaobu prototype listening on " + host + ":" + port); });
  ["SIGTERM", "SIGINT"].forEach(function (signal) {
    process.on(signal, function () { server.close(function () { process.exit(0); }); });
  });
}

module.exports = { createPreviewServer };
