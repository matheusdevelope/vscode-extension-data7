import assert from "node:assert/strict";
import { describe, test, beforeEach } from "node:test";
import { CheckScheduler } from "../../analysis/check-scheduler";
import type { AnalysisCancellation, AnalysisPriority } from "../../analysis/file-snapshot";

/**
 * The queue existed but had no driver: nothing ever consumed it, so every
 * semantic check fell back to running synchronously on the keystroke path.
 * These tests pin the driver contract — priority order, time slicing, capacity
 * and the re-queue of work aborted by typing.
 */
describe("CheckScheduler", () => {
  /** Manual idle driver so slices run exactly when the test says so. */
  class ManualDriver {
    private queued: (() => void)[] = [];

    public readonly schedule = (callback: () => void): (() => void) => {
      this.queued.push(callback);
      return () => {
        this.queued = this.queued.filter((entry) => entry !== callback);
      };
    };

    public get pendingSlices(): number {
      return this.queued.length;
    }

    /** Runs one scheduled slice. */
    public tick(): boolean {
      const next = this.queued.shift();
      if (!next) return false;
      next();
      return true;
    }

    /** Runs slices until the scheduler stops asking for more. */
    public drain(maxSlices = 100): void {
      for (let i = 0; i < maxSlices && this.tick(); i++) {
        /* keep draining */
      }
    }
  }

  let driver: ManualDriver;
  let clock: number;

  const advance = (ms: number): void => {
    clock += ms;
  };

  beforeEach(() => {
    driver = new ManualDriver();
    clock = 0;
  });

  const makeScheduler = (
    run: (uri: string, token?: AnalysisCancellation) => { cancelled: boolean } | undefined,
    options: { sliceBudgetMs?: number; maxQueueSize?: number; onDrained?: () => void } = {},
  ): CheckScheduler =>
    new CheckScheduler(run, {
      scheduleSlice: driver.schedule,
      now: () => clock,
      sliceBudgetMs: options.sliceBudgetMs ?? 15,
      ...(options.maxQueueSize === undefined ? {} : { maxQueueSize: options.maxQueueSize }),
      ...(options.onDrained === undefined ? {} : { onDrained: options.onDrained }),
    });

  test("does not run anything until the idle driver fires", () => {
    const ran: string[] = [];
    const scheduler = makeScheduler((uri) => {
      ran.push(uri);
      return { cancelled: false };
    });

    scheduler.enqueue("file:///a.bas", "background");
    assert.deepEqual(ran, [], "enqueue must not run the check inline");
    assert.equal(scheduler.size, 1);

    driver.drain();
    assert.deepEqual(ran, ["file:///a.bas"]);
    assert.equal(scheduler.size, 0);
  });

  test("consumes files in priority order", () => {
    const ran: string[] = [];
    const scheduler = makeScheduler((uri) => {
      ran.push(uri);
      return { cancelled: false };
    });

    const order: readonly AnalysisPriority[] = [
      "background",
      "transitive",
      "dependent",
      "open",
      "visible",
      "active",
    ];
    for (const priority of order) {
      scheduler.enqueue(`file:///${priority}.bas`, priority);
    }

    driver.drain();
    assert.deepEqual(ran, [
      "file:///active.bas",
      "file:///visible.bas",
      "file:///open.bas",
      "file:///dependent.bas",
      "file:///transitive.bas",
      "file:///background.bas",
    ]);
  });

  test("promotes an already queued file instead of duplicating it", () => {
    const ran: string[] = [];
    const scheduler = makeScheduler((uri) => {
      ran.push(uri);
      return { cancelled: false };
    });

    scheduler.enqueue("file:///late.bas", "background");
    scheduler.enqueue("file:///other.bas", "dependent");
    scheduler.enqueue("file:///late.bas", "active");
    assert.equal(scheduler.size, 2);

    driver.drain();
    assert.deepEqual(ran, ["file:///late.bas", "file:///other.bas"]);
  });

  test("never downgrades a queued file", () => {
    const ran: string[] = [];
    const scheduler = makeScheduler((uri) => {
      ran.push(uri);
      return { cancelled: false };
    });

    scheduler.enqueue("file:///a.bas", "active");
    scheduler.enqueue("file:///a.bas", "background");
    scheduler.enqueue("file:///b.bas", "visible");

    driver.drain();
    assert.deepEqual(ran, ["file:///a.bas", "file:///b.bas"]);
  });

  test("yields the event loop once the slice budget is spent", () => {
    const ran: string[] = [];
    const scheduler = makeScheduler(
      (uri) => {
        ran.push(uri);
        advance(6);
        return { cancelled: false };
      },
      { sliceBudgetMs: 15 },
    );

    for (let i = 0; i < 6; i++) {
      scheduler.enqueue(`file:///f${i}.bas`, "background");
    }

    driver.tick();
    assert.equal(ran.length, 3, "a 15ms budget fits three 6ms checks");
    assert.equal(driver.pendingSlices, 1, "the driver must reschedule itself");

    driver.drain();
    assert.equal(ran.length, 6);
  });

  test("cancel removes a queued file", () => {
    const ran: string[] = [];
    const scheduler = makeScheduler((uri) => {
      ran.push(uri);
      return { cancelled: false };
    });

    scheduler.enqueue("file:///a.bas", "open");
    scheduler.enqueue("file:///b.bas", "open");
    scheduler.cancel("file:///A.BAS");

    driver.drain();
    assert.deepEqual(ran, ["file:///b.bas"]);
  });

  test("interrupt stops the current slice and re-queues the aborted file", () => {
    const ran: string[] = [];
    const scheduler = makeScheduler((uri, token) => {
      ran.push(uri);
      if (uri === "file:///a.bas") {
        scheduler.interrupt();
        return { cancelled: token?.isCancellationRequested === true };
      }
      return { cancelled: false };
    });

    scheduler.enqueue("file:///a.bas", "open");
    scheduler.enqueue("file:///b.bas", "open");

    driver.tick();
    assert.deepEqual(ran, ["file:///a.bas"], "the slice must stop after the interruption");
    assert.equal(scheduler.isScheduled("file:///a.bas"), true, "aborted work must come back");

    driver.drain();
    assert.deepEqual(ran.slice(1).sort(), ["file:///a.bas", "file:///b.bas"]);
    assert.equal(scheduler.size, 0);
  });

  test("drops the least important entries when the queue is full", () => {
    const ran: string[] = [];
    const scheduler = makeScheduler(
      (uri) => {
        ran.push(uri);
        return { cancelled: false };
      },
      { maxQueueSize: 2 },
    );

    scheduler.enqueue("file:///keep.bas", "dependent");
    scheduler.enqueue("file:///drop.bas", "background");
    scheduler.enqueue("file:///new.bas", "open");

    assert.equal(scheduler.size, 2);
    assert.equal(scheduler.dropped, 1);
    assert.equal(scheduler.isScheduled("file:///drop.bas"), false);

    driver.drain();
    assert.deepEqual(ran, ["file:///new.bas", "file:///keep.bas"]);
  });

  test("a visible file is never traded away for capacity", () => {
    const scheduler = makeScheduler(() => ({ cancelled: false }), { maxQueueSize: 1 });

    scheduler.enqueue("file:///a.bas", "active");
    scheduler.enqueue("file:///b.bas", "visible");

    assert.equal(scheduler.size, 2, "user-visible work outranks the capacity bound");
  });

  test("a failing check does not kill the driver", () => {
    const ran: string[] = [];
    const scheduler = makeScheduler((uri) => {
      ran.push(uri);
      if (uri === "file:///boom.bas") throw new Error("linter exploded");
      return { cancelled: false };
    });

    scheduler.enqueue("file:///boom.bas", "open");
    scheduler.enqueue("file:///ok.bas", "open");

    driver.drain();
    assert.deepEqual(ran, ["file:///boom.bas", "file:///ok.bas"]);
  });

  test("notifies once the queue drains", () => {
    let drained = 0;
    const scheduler = makeScheduler(() => ({ cancelled: false }), {
      onDrained: () => {
        drained++;
      },
    });

    scheduler.enqueue("file:///a.bas", "open");
    driver.drain();

    assert.equal(drained, 1);
  });

  test("dispose stops the driver and refuses new work", () => {
    const ran: string[] = [];
    const scheduler = makeScheduler((uri) => {
      ran.push(uri);
      return { cancelled: false };
    });

    scheduler.enqueue("file:///a.bas", "open");
    scheduler.dispose();
    scheduler.enqueue("file:///b.bas", "active");

    driver.drain();
    assert.deepEqual(ran, []);
    assert.equal(scheduler.size, 0);
    assert.equal(driver.pendingSlices, 0);
  });

  test("flush drains the queue for callers that need a completion point", async () => {
    const ran: string[] = [];
    const scheduler = makeScheduler((uri) => {
      ran.push(uri);
      return { cancelled: false };
    });

    scheduler.enqueue("file:///b.bas", "background");
    scheduler.enqueue("file:///a.bas", "active");

    await scheduler.flush();
    assert.deepEqual(ran, ["file:///a.bas", "file:///b.bas"]);
    assert.equal(scheduler.size, 0);
  });

  test("flush honours its cancellation token", async () => {
    const ran: string[] = [];
    let cancelled = false;
    const scheduler = makeScheduler((uri) => {
      ran.push(uri);
      cancelled = true;
      return { cancelled: false };
    });
    const token: AnalysisCancellation = {
      get isCancellationRequested(): boolean {
        return cancelled;
      },
    };

    scheduler.enqueue("file:///a.bas", "open");
    scheduler.enqueue("file:///b.bas", "open");

    await scheduler.flush(token);
    assert.equal(ran.length, 1);
    assert.equal(scheduler.size, 1, "the untouched file stays queued");
  });
});
