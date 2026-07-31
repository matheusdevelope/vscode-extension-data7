import { logger } from "../infra/logger";
import type { AnalysisCancellation, AnalysisPriority } from "./file-snapshot";

type CheckRunner = (
  uri: string,
  token?: AnalysisCancellation,
) => { cancelled: boolean } | undefined;

/** Cancels a slice that was handed to the host's idle driver. */
export type SliceCanceller = () => void;

/** Hands a slice to the host so it runs when the event loop is idle. */
export type SliceScheduler = (callback: () => void) => SliceCanceller;

interface QueuedCheck {
  readonly uri: string;
  readonly priority: AnalysisPriority;
}

export interface CheckSchedulerOptions {
  /** Wall-clock budget consumed by one slice before yielding the event loop. */
  readonly sliceBudgetMs?: number;
  /** Upper bound for queued files; overflow evicts the least important entries. */
  readonly maxQueueSize?: number;
  readonly scheduleSlice?: SliceScheduler;
  readonly now?: () => number;
  /** Invoked once the queue drains, so hosts can publish or stop a progress UI. */
  readonly onDrained?: () => void;
}

/**
 * Priority order mirrors tsserver: the file the user looks at is checked first,
 * and speculative work for the rest of the workspace only runs when nothing more
 * urgent is queued (REFACTOR-ANALYSIS-ENGINE.md §8.4).
 */
const PRIORITIES = [
  "active",
  "visible",
  "open",
  "dependent",
  "transitive",
  "background",
] as const satisfies readonly AnalysisPriority[];

const PRIORITY_ORDER: Record<AnalysisPriority, number> = {
  active: 0,
  visible: 1,
  open: 2,
  dependent: 3,
  transitive: 4,
  background: 5,
};

/** Priorities that answer a visible request; never dropped on overflow. */
const NEVER_EVICTED: ReadonlySet<AnalysisPriority> = new Set<AnalysisPriority>([
  "active",
  "visible",
]);

const DEFAULT_SLICE_BUDGET_MS = 15;
const DEFAULT_MAX_QUEUE_SIZE = 2000;
/**
 * Delay before a slice runs. Node has no `requestIdleCallback`; a short timer is
 * enough to let the keystroke path (parse + publish) win the race.
 */
const IDLE_DELAY_MS = 20;

const defaultScheduleSlice: SliceScheduler = (callback) => {
  const handle = setTimeout(callback, IDLE_DELAY_MS);
  return () => {
    clearTimeout(handle);
  };
};

/**
 * Priority queue plus idle driver for semantic checks.
 *
 * The queue used to have no driver at all: entries were enqueued and only ever
 * consumed by an explicit `flush` that nobody called, so every check ended up
 * running synchronously on the keystroke path. The driver below consumes the
 * queue in ~15 ms slices, yields between slices, and steps aside when the user
 * types (`interrupt`).
 */
export class CheckScheduler {
  private readonly buckets = new Map<AnalysisPriority, string[]>();
  /** Authoritative priority per queued file; bucket entries that disagree are stale. */
  private readonly pending = new Map<string, AnalysisPriority>();
  private readonly sliceBudgetMs: number;
  private readonly maxQueueSize: number;
  private readonly scheduleSlice: SliceScheduler;
  private readonly now: () => number;
  private readonly onDrained: (() => void) | undefined;

  private cancelSlice: SliceCanceller | undefined;
  private flushing = false;
  private interrupted = false;
  private disposed = false;
  private droppedCount = 0;

  /** Token handed to checks run by the driver; flips as soon as the user types. */
  private readonly sliceToken: AnalysisCancellation;

  constructor(
    private readonly run: CheckRunner,
    options: CheckSchedulerOptions = {},
  ) {
    const isCancelled = (): boolean => this.interrupted || this.disposed;
    this.sliceToken = {
      get isCancellationRequested(): boolean {
        return isCancelled();
      },
    };
    this.sliceBudgetMs = options.sliceBudgetMs ?? DEFAULT_SLICE_BUDGET_MS;
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.scheduleSlice = options.scheduleSlice ?? defaultScheduleSlice;
    this.now = options.now ?? Date.now;
    this.onDrained = options.onDrained;
    for (const priority of PRIORITIES) {
      this.buckets.set(priority, []);
    }
  }

  /** Number of files waiting to be checked. */
  public get size(): number {
    return this.pending.size;
  }

  /** Files discarded because the queue was full — surfaced by diagnostics tooling. */
  public get dropped(): number {
    return this.droppedCount;
  }

  public isScheduled(uri: string): boolean {
    return this.pending.has(uri.toLowerCase());
  }

  public clear(): void {
    for (const bucket of this.buckets.values()) {
      bucket.length = 0;
    }
    this.pending.clear();
    this.stopDriver();
  }

  public dispose(): void {
    this.disposed = true;
    this.clear();
  }

  public cancel(uri: string): void {
    const key = uri.toLowerCase();
    if (!this.pending.delete(key)) return;
    // The bucket entry is left behind and skipped on dequeue (see takeNext).
    if (this.pending.size === 0) this.stopDriver();
  }

  /**
   * Aborts the running slice at the next yield point. Called when the user types
   * so speculative background work never competes with the active document.
   */
  public interrupt(): void {
    if (this.pending.size === 0 && !this.flushing) return;
    this.interrupted = true;
  }

  public enqueue(uri: string, priority: AnalysisPriority): void {
    if (this.disposed) return;
    const key = uri.toLowerCase();
    const existing = this.pending.get(key);
    if (existing !== undefined) {
      if (PRIORITY_ORDER[priority] >= PRIORITY_ORDER[existing]) return;
      // Promotion: the old bucket entry becomes stale and is skipped on dequeue.
      this.pending.set(key, priority);
      this.pushToBucket(uri, priority);
      this.ensureDriver();
      return;
    }

    if (!this.makeRoomFor(priority)) return;
    this.pending.set(key, priority);
    this.pushToBucket(uri, priority);
    this.ensureDriver();
  }

  /**
   * Drains the whole queue, yielding between items. Kept for callers that need a
   * deterministic completion point (tests, batch lint); the idle driver is the
   * normal consumption path.
   */
  public async flush(token?: AnalysisCancellation): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    this.stopDriver();
    try {
      while (!this.disposed && this.pending.size > 0) {
        if (token?.isCancellationRequested) break;
        const next = this.takeNext();
        if (next === undefined) break;
        this.runOne(next, token);
        if (token?.isCancellationRequested) break;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    } finally {
      this.flushing = false;
      this.interrupted = false;
    }
    if (this.pending.size > 0) this.ensureDriver();
    else this.onDrained?.();
  }

  private pushToBucket(uri: string, priority: AnalysisPriority): void {
    this.buckets.get(priority)?.push(uri);
  }

  /**
   * Enforces the queue bound by evicting the least important queued file. A file
   * the user can see is never traded for speculative work.
   */
  private makeRoomFor(priority: AnalysisPriority): boolean {
    if (this.pending.size < this.maxQueueSize) return true;
    if (NEVER_EVICTED.has(priority)) return true;

    for (let i = PRIORITIES.length - 1; i >= 0; i--) {
      const victimPriority = PRIORITIES[i];
      if (victimPriority === undefined) continue;
      if (PRIORITY_ORDER[victimPriority] <= PRIORITY_ORDER[priority]) break;
      const bucket = this.buckets.get(victimPriority);
      while (bucket && bucket.length > 0) {
        const victim = bucket.pop();
        if (victim === undefined) break;
        if (this.pending.get(victim.toLowerCase()) === victimPriority) {
          this.pending.delete(victim.toLowerCase());
          this.droppedCount++;
          return true;
        }
      }
    }

    this.droppedCount++;
    return false;
  }

  private takeNext(): QueuedCheck | undefined {
    for (const priority of PRIORITIES) {
      const bucket = this.buckets.get(priority);
      while (bucket && bucket.length > 0) {
        const uri = bucket.shift();
        if (uri === undefined) break;
        const key = uri.toLowerCase();
        // Skip entries superseded by a promotion or removed by cancel().
        if (this.pending.get(key) !== priority) continue;
        this.pending.delete(key);
        return { uri, priority };
      }
    }
    return undefined;
  }

  private runOne(item: QueuedCheck, token?: AnalysisCancellation): void {
    let outcome: { cancelled: boolean } | undefined;
    try {
      outcome = this.run(item.uri, token);
    } catch (err) {
      logger.warn(
        `Falha ao analisar ${item.uri} em segundo plano: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }
    // A check aborted by a keystroke must come back, or the file would keep
    // serving stale diagnostics forever.
    if (outcome?.cancelled === true) {
      this.enqueue(item.uri, item.priority);
    }
  }

  private ensureDriver(): void {
    if (this.disposed || this.flushing) return;
    if (this.cancelSlice !== undefined) return;
    if (this.pending.size === 0) return;
    this.cancelSlice = this.scheduleSlice(() => {
      this.cancelSlice = undefined;
      this.runSlice();
    });
  }

  private stopDriver(): void {
    this.cancelSlice?.();
    this.cancelSlice = undefined;
  }

  private runSlice(): void {
    if (this.disposed) return;
    this.interrupted = false;
    const started = this.now();

    while (!this.disposed && !this.interrupted) {
      if (this.now() - started >= this.sliceBudgetMs) break;
      const next = this.takeNext();
      if (next === undefined) break;
      this.runOne(next, this.sliceToken);
    }

    this.interrupted = false;
    if (this.disposed) return;
    if (this.pending.size > 0) {
      this.ensureDriver();
    } else {
      this.onDrained?.();
    }
  }
}
