/** Bounded priority queue, FIFO within each priority. Hold permits until calls settle. */
export class WorkPool {
  private active = 0;
  private waiting: { enter: () => void; priority: number }[] = [];
  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 8) throw Error("Invalid background concurrency");
  }
  async run<T>(work: () => Promise<T>, priority = 0): Promise<T> {
    await new Promise<void>(resolve => {
      const enter = () => { this.active++; resolve(); };
      if (this.active < this.limit) enter(); else { this.waiting.push({ enter, priority }); this.waiting.sort((a, b) => a.priority - b.priority); }
    });
    try { return await work(); }
    finally { this.active--; this.waiting.shift()?.enter(); }
  }
}
/** Preserve input order and drain in-flight work before propagating any failure. */
export async function mapParallel<T, R>(items: readonly T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0, failure: { error: unknown } | undefined;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failure && next < items.length) {
      const index = next++;
      try { results[index] = await work(items[index], index); }
      catch (error) { failure ??= { error }; }
    }
  }));
  if (failure) throw failure.error;
  return results;
}
