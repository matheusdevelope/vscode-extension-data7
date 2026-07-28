import type { AnalysisCancellation, AnalysisPriority } from "./file-snapshot";

type CheckRunner = (
  uri: string,
  token?: AnalysisCancellation,
) => { cancelled: boolean } | undefined;

interface QueuedCheck {
  readonly uri: string;
  priority: AnalysisPriority;
}

const PRIORITY_ORDER: Record<AnalysisPriority, number> = {
  active: 0,
  dependent: 1,
  background: 2,
};

/**
 * Priority queue for analysis checks. Active document first, then dependents.
 */
export class CheckScheduler {
  private readonly queue: QueuedCheck[] = [];
  private readonly pending = new Set<string>();
  private flushing = false;

  constructor(private readonly run: CheckRunner) {}

  public clear(): void {
    this.queue.length = 0;
    this.pending.clear();
  }

  public cancel(uri: string): void {
    const key = uri.toLowerCase();
    this.pending.delete(key);
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i]?.uri.toLowerCase() === key) {
        this.queue.splice(i, 1);
      }
    }
  }

  public enqueue(uri: string, priority: AnalysisPriority): void {
    const key = uri.toLowerCase();
    if (this.pending.has(key)) {
      const existing = this.queue.find((item) => item.uri.toLowerCase() === key);
      if (existing && PRIORITY_ORDER[priority] < PRIORITY_ORDER[existing.priority]) {
        existing.priority = priority;
        this.sortQueue();
      }
      return;
    }
    this.pending.add(key);
    this.queue.push({ uri, priority });
    this.sortQueue();
  }

  public async flush(token?: AnalysisCancellation): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        if (token?.isCancellationRequested) break;
        const next = this.queue.shift();
        if (!next) break;
        this.pending.delete(next.uri.toLowerCase());
        this.run(next.uri, token);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    } finally {
      this.flushing = false;
    }
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }
}
