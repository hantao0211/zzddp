import { build } from "esbuild";
await build({ entryPoints: ["src/server/assistant/main.ts"], bundle: true, platform: "node", target: "node22", format: "cjs", outfile: "dist/assistant/server.cjs", tsconfig: "tsconfig.json", logLevel: "info" });
