// Isolated, empty account fixtures only. Never point this process at family state.
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { scryptSync } from "node:crypto";
import { Accounts } from "../../src/server/assistant/accounts";
import { AssistantStore } from "../../src/server/assistant/store";
import { HomeworkStore } from "../../src/server/homework/store";
import { HomeworkConversation } from "../../src/server/homework/conversation";
import { HomeworkHTTP } from "../../src/server/homework/http";
import { createAssistantServer } from "../../src/server/assistant/server";
const directory = process.env.ADMIN_QA_DIRECTORY || "";
if (!directory.endsWith("/xiaobu-admin-qa")) throw new Error("Refuse to open non-QA state");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const homework = new HomeworkStore(join(directory, "learning")), salt = "ab".repeat(16);
const server = createAssistantServer({ origin: "https://14.103.24.55:3443", accessHash: salt + ":" + scryptSync("81746290", salt, 32).toString("hex"), accounts: new Accounts(directory), store: new AssistantStore(directory), homework: new HomeworkHTTP(homework), learning: new HomeworkConversation(homework), serviceInfo: { provider: "synthetic", model: "no-paid-calls" }, ai: () => ({ async run() { throw new Error("QA forbids paid model calls"); } }) });
server.listen(3104, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => server.close(() => process.exit(0)));
