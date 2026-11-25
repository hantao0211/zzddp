import { build } from "esbuild";
await build({ entryPoints: ["src/server/assistant/main.ts"], bundle: true, platform: "node", target: "node22", format: "cjs", outfile: "dist/assistant/server.cjs", tsconfig: "tsconfig.json", logLevel: "info" });
await build({ entryPoints: ["src/server/diagnostics/collector.ts"], bundle: true, platform: "node", target: "node22", format: "cjs", outfile: "dist/assistant/diagnostics.cjs", tsconfig: "tsconfig.json", logLevel: "info" });
