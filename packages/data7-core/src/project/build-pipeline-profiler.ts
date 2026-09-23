import { performance } from "perf_hooks";
import { logger } from "../infra/logger";

export type BuildPipelineStage =
  | "scan-files"
  | "index"
  | "live-namespaces"
  | "collect-generics"
  | "context-hash"
  | "transpile"
  | "transpile-parse"
  | "transpile-generics"
  | "transpile-sugars"
  | "transpile-logger-print"
  | "transpile-stack-trace"
  | "transpile-serialize"
  | "prune-reachability"
  | "prune-rewrite"
  | "reindex"
  | "validate"
  | "minify"
  | "uglify"
  | "emit";

export interface BuildFileProfile {
  readonly fileUri: string;
  readonly totalMs: number;
  readonly cacheHit: boolean;
}

export interface BuildBenchmarkReport {
  readonly workspaceDir: string;
  readonly totalMs: number;
  readonly stages: Readonly<Record<BuildPipelineStage, number>>;
  readonly files: readonly BuildFileProfile[];
  readonly transpileCacheHits: number;
  readonly transpileCacheMisses: number;
}

/**
 * Lightweight profiler for Builder / SugarTranspiler / prune. Enabled when
 * `DATA7_BUILD_PROFILE=1` or via {@link BuildPipelineProfiler.setEnabled}.
 */
export class BuildPipelineProfiler {
  private static enabled = false;
  private static readonly stages = emptyStages();
  private static readonly files: BuildFileProfile[] = [];
  private static transpileCacheHits = 0;
  private static transpileCacheMisses = 0;
  private static wallStart = 0;
  private static wallMs = 0;

  public static setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) {
      this.reset();
    }
  }

  public static isEnabled(): boolean {
    return this.enabled;
  }

  public static reset(): void {
    Object.assign(this.stages, emptyStages());
    this.files.length = 0;
    this.transpileCacheHits = 0;
    this.transpileCacheMisses = 0;
    this.wallStart = 0;
    this.wallMs = 0;
  }

  public static beginRun(): void {
    if (!this.enabled) return;
    this.reset();
    this.wallStart = performance.now();
  }

  public static endRun(): void {
    if (!this.enabled) return;
    this.wallMs = performance.now() - this.wallStart;
  }

  public static measure<T>(stage: BuildPipelineStage, fn: () => T): T {
    if (!this.enabled) {
      return fn();
    }
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      this.stages[stage] += performance.now() - t0;
    }
  }

  public static recordTranspileFile(fileUri: string, elapsedMs: number, cacheHit: boolean): void {
    if (!this.enabled) return;
    this.files.push({ fileUri, totalMs: elapsedMs, cacheHit });
    if (cacheHit) {
      this.transpileCacheHits++;
    } else {
      this.transpileCacheMisses++;
    }
  }

  public static buildReport(workspaceDir: string): BuildBenchmarkReport {
    return {
      workspaceDir,
      totalMs: this.wallMs,
      stages: { ...this.stages },
      files: [...this.files].sort((a, b) => b.totalMs - a.totalMs),
      transpileCacheHits: this.transpileCacheHits,
      transpileCacheMisses: this.transpileCacheMisses,
    };
  }

  public static logReport(workspaceDir: string): void {
    const report = this.buildReport(workspaceDir);
    logger.info(`[BUILD-PERF] Workspace: ${report.workspaceDir}`);
    logger.info(
      `[BUILD-PERF] wall=${report.totalMs.toFixed(2)} ms, transpile cache ${report.transpileCacheHits} hits / ${report.transpileCacheMisses} misses`,
    );
    logger.info("[BUILD-PERF] Estágios (ms):");
    for (const [stage, ms] of Object.entries(report.stages).sort((a, b) => b[1] - a[1])) {
      if (ms > 0) {
        logger.info(`  - ${stage}: ${ms.toFixed(2)} ms`);
      }
    }
    const top = report.files.slice(0, 10);
    if (top.length > 0) {
      logger.info("[BUILD-PERF] Top 10 arquivos no transpile:");
      for (const file of top) {
        const rel = file.fileUri.split(/[/\\]/).slice(-2).join("/");
        logger.info(`  ${rel}: ${file.totalMs.toFixed(1)} ms${file.cacheHit ? " (cache)" : ""}`);
      }
    }
  }

  public static formatConsoleReport(workspaceDir: string): string {
    const report = this.buildReport(workspaceDir);
    const lines: string[] = [];
    lines.push(`[BUILD-PERF] Workspace: ${report.workspaceDir}`);
    lines.push(
      `[BUILD-PERF] wall=${report.totalMs.toFixed(2)} ms, transpile cache ${report.transpileCacheHits} hits / ${report.transpileCacheMisses} misses`,
    );
    lines.push("[BUILD-PERF] Estágios (ms):");
    for (const [stage, ms] of Object.entries(report.stages).sort((a, b) => b[1] - a[1])) {
      if (ms > 0) {
        lines.push(`  - ${stage}: ${ms.toFixed(2)}`);
      }
    }
    const top = report.files.slice(0, 15);
    if (top.length > 0) {
      lines.push("[BUILD-PERF] Top arquivos no transpile:");
      for (const file of top) {
        const rel = file.fileUri.split(/[/\\]/).pop() ?? file.fileUri;
        lines.push(`  ${rel}: ${file.totalMs.toFixed(1)} ms${file.cacheHit ? " (cache)" : ""}`);
      }
    }
    return lines.join("\n");
  }
}

function emptyStages(): Record<BuildPipelineStage, number> {
  return {
    "scan-files": 0,
    index: 0,
    "live-namespaces": 0,
    "collect-generics": 0,
    "context-hash": 0,
    transpile: 0,
    "transpile-parse": 0,
    "transpile-generics": 0,
    "transpile-sugars": 0,
    "transpile-logger-print": 0,
    "transpile-stack-trace": 0,
    "transpile-serialize": 0,
    "prune-reachability": 0,
    "prune-rewrite": 0,
    reindex: 0,
    validate: 0,
    minify: 0,
    uglify: 0,
    emit: 0,
  };
}
