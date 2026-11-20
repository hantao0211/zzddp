import { Accounts } from "./accounts";
import { readAutoGrading } from "../../domain/grading";
import { readWrittenCompletion } from "../../domain/written-completion";
import { readReviewPolicy } from "../../domain/review-policy";
import { HomeworkConversation } from "../homework/conversation";
import { join } from "node:path";
import { HomeworkStore } from "../homework/store";
import { HomeworkWorker } from "../homework/worker";
import { ServerImages } from "../homework/images";
import { HomeworkHTTP } from "../homework/http";
import { VisionAI, readAIConfiguration } from "../ai/provider";
import { AssistantStore, readAssistantLimits } from "./store";
import { DeepSeekSpeech } from "./speech";
import { createAssistantServer } from "./server";

try {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error("Node 22.13 or newer required");
  process.umask(0o077);
  const config = readAIConfiguration();
  const homeworkStore = new HomeworkStore(join(process.env.ASSISTANT_STATE_DIRECTORY || "/var/lib/xiaobu-assistant", "learning"), Date.now, readReviewPolicy(), readWrittenCompletion(), readAutoGrading());
  const worker = new HomeworkWorker(homeworkStore, () => new VisionAI(config), new ServerImages(homeworkStore));
  const port = Number(process.env.ASSISTANT_PORT || 3091);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port");
  const server = createAssistantServer({
    accounts: new Accounts(process.env.ASSISTANT_STATE_DIRECTORY || "/var/lib/xiaobu-assistant"),
    serviceInfo: { provider: config.provider, model: config.model },
    homework: new HomeworkHTTP(homeworkStore),
    learning: new HomeworkConversation(homeworkStore, new ServerImages(homeworkStore)),
    origin: process.env.ASSISTANT_ORIGIN || "https://14.103.24.55",
    accessHash: process.env.ASSISTANT_ACCESS_HASH || "",
    store: new AssistantStore(process.env.ASSISTANT_STATE_DIRECTORY || "/var/lib/xiaobu-assistant", Date.now, readAssistantLimits()),
    ai: (signal) => new VisionAI(config, (url, init) => fetch(url, { ...init, signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]) })),
    speech: config.provider === "deepseek" ? new DeepSeekSpeech(config.apiKey) : undefined,
  });
  worker.start();
  server.listen(port, "127.0.0.1", () => console.log("Xiaobu assistant ready on loopback"));
  server.on("error", () => { console.error("Assistant listener unavailable"); process.exitCode = 1; });
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { worker.stop(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
} catch { console.error("Assistant configuration or private state unavailable"); process.exitCode = 1; }
