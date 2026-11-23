import type { z } from "zod";
import type { AITask } from "../../domain/ai-contracts";
import { validateAIImages, type AIImage, type StructuredAI } from "../ai/provider";
import { WorkPool } from "../work/concurrency";
import { HomeworkError, type HomeworkStore, type Job } from "./store";
import type { CallContext } from "./usage";

export const HOMEWORK_CONCURRENCY = 3;
export class HomeworkExecution {
  readonly calls = new WorkPool(HOMEWORK_CONCURRENCY);
  // Decoding photos/PDFs is memory intensive; allow one converter alongside AI calls.
  readonly conversions = new WorkPool(1);
  private pending = new Map<string, Promise<unknown>>();
  constructor(private store: HomeworkStore, private factory: () => StructuredAI) {}
  forJob(job?: Job, beforeCall?: () => void, context?: CallContext) {
    const store = this.store, factory = this.factory, calls = this.calls;
    return { run<T>(task: AITask, schema: z.ZodType<T>, metadata: unknown, images: AIImage[] | (() => AIImage[]) = []): Promise<T> {
      return calls.run(async () => {
        if (job?.kind === "organize" && job.revision !== store.revision(job.date)) throw new HomeworkError(409, "有新资料已收到，使用最新资料继续整理。");
        beforeCall?.();
        // Reserve only after acquiring a slot, immediately before a real provider call.
        // Local decoding failures must not spend AI quota.
        const prepared = typeof images === "function" ? images() : images;
        validateAIImages(prepared);
        const provider = factory(), id = store.usage.start(task, metadata, job, context);
        try {
          const result = await provider.run(task, schema, metadata, prepared);
          store.usage.finish(id); return result;
        } catch (error) { store.usage.finish(id, error); throw error; }
      }, job?.kind === "recognize" ? 0 : job?.kind === "organize" ? 1 : 2);
    } };
  }
  async cached<T>(key: string, work: () => Promise<T>): Promise<T> {
    const row = this.store.db.prepare("SELECT result FROM analysis_cache WHERE key=?").get(key) as { result: string } | undefined;
    if (row) return JSON.parse(row.result) as T;
    const shared = this.pending.get(key);
    if (shared) return shared as Promise<T>;
    const promise = work().then(result => {
      this.store.db.prepare("INSERT OR REPLACE INTO analysis_cache(key,result) VALUES(?,?)").run(key, JSON.stringify(result));
      return result;
    });
    this.pending.set(key, promise);
    try { return await promise; } finally { this.pending.delete(key); }
  }
}
