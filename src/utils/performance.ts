import { performance } from "perf_hooks";
import { logger } from "../infra/logger";

export interface FuncStats {
  name: string;
  calls: number;
  totalTime: number;
}

export const perfStats = new Map<string, FuncStats>();

export function recordPerf(name: string, duration: number): void {
  let stats = perfStats.get(name);
  if (!stats) {
    stats = { name, calls: 0, totalTime: 0 };
    perfStats.set(name, stats);
  }
  stats.calls++;
  stats.totalTime += duration;
}

export function clearPerfStats(): void {
  perfStats.clear();
}

export class TimeTracker {
  private startTime: number;
  private label: string;

  constructor(label: string) {
    this.label = label;
    this.startTime = performance.now();
  }

  public stopAndLog(): number {
    const elapsed = performance.now() - this.startTime;
    const msg = `[PERF] ${this.label} levou ${elapsed.toFixed(2)} ms`;
    logger.info(msg);
    console.log(msg);
    return elapsed;
  }
}
