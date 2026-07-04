import { performance } from "perf_hooks";
import { logger } from "../infra/logger";

export type LintPipelineStage =
  | "parse"
  | "index-update"
  | "module-refs"
  | "advanced-lint"
  | "semantic-cache"
  | "type-resolver"
  | "publish"
  | "dependent-propagation";

export interface LintFileProfile {
  readonly fileUri: string;
  readonly stages: Readonly<Record<LintPipelineStage, number>>;
  readonly totalMs: number;
  readonly dependentFilesTriggered: number;
  readonly staleRunsDiscarded: number;
}

export interface LintBenchmarkReport {
  readonly workspaceDir: string;
  readonly fileCount: number;
  readonly totalMs: number;
  readonly files: readonly LintFileProfile[];
  readonly aggregateStages: Readonly<Record<LintPipelineStage, number>>;
  readonly redundantRevalidations: number;
  readonly semanticCacheHits: number;
  readonly semanticCacheMisses: number;
  readonly typeResolverMs: number;
}

/**
 * Lightweight pipeline profiler for lint orchestration. Enabled when
 * `data7.features.diagnostics.profileLintPipeline` is true or when running
 * the standalone benchmark script.
 */
export class LintPipelineProfiler {
  private static enabled = false;
  private static readonly fileProfiles = new Map<string, LintFileProfile>();
  private static redundantRevalidations = 0;
  private static semanticCacheHits = 0;
  private static semanticCacheMisses = 0;
  private static typeResolverMs = 0;

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
    this.fileProfiles.clear();
    this.redundantRevalidations = 0;
    this.semanticCacheHits = 0;
    this.semanticCacheMisses = 0;
    this.typeResolverMs = 0;
  }

  public static recordSemanticCacheHit(fileUri: string): void {
    if (!this.enabled) return;
    this.semanticCacheHits++;
    this.addStageTime(fileUri, "semantic-cache", 0);
  }

  public static recordSemanticCacheMiss(fileUri: string): void {
    if (!this.enabled) return;
    this.semanticCacheMisses++;
  }

  public static measureResolver<T>(operation: string, fn: () => T): T {
    if (!this.enabled) {
      return fn();
    }
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      const elapsed = performance.now() - t0;
      this.typeResolverMs += elapsed;
      this.addStageTime(operation, "type-resolver", elapsed);
    }
  }

  public static recordStaleRun(fileUri: string): void {
    if (!this.enabled) return;
    const key = fileUri.toLowerCase();
    const existing = this.fileProfiles.get(key);
    if (existing) {
      this.fileProfiles.set(key, {
        ...existing,
        staleRunsDiscarded: existing.staleRunsDiscarded + 1,
      });
    }
    this.redundantRevalidations++;
  }

  public static recordDependentPropagation(count: number): void {
    if (!this.enabled || count === 0) return;
    this.redundantRevalidations += Math.max(0, count - 1);
  }

  public static measure<T>(stage: LintPipelineStage, fileUri: string, fn: () => T): T {
    if (!this.enabled) {
      return fn();
    }
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      this.addStageTime(fileUri, stage, performance.now() - t0);
    }
  }

  public static async measureAsync<T>(
    stage: LintPipelineStage,
    fileUri: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!this.enabled) {
      return fn();
    }
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      this.addStageTime(fileUri, stage, performance.now() - t0);
    }
  }

  public static finalizeFile(fileUri: string, dependentCount = 0): void {
    if (!this.enabled) return;
    const key = fileUri.toLowerCase();
    const existing = this.fileProfiles.get(key);
    if (!existing) return;
    this.fileProfiles.set(key, {
      ...existing,
      dependentFilesTriggered: dependentCount,
    });
  }

  public static buildReport(workspaceDir: string): LintBenchmarkReport {
    const files = Array.from(this.fileProfiles.values());
    const aggregateStages = emptyStages();
    let totalMs = 0;

    for (const file of files) {
      totalMs += file.totalMs;
      for (const stage of Object.keys(file.stages) as LintPipelineStage[]) {
        aggregateStages[stage] += file.stages[stage];
      }
    }

    return {
      workspaceDir,
      fileCount: files.length,
      totalMs,
      files: files.sort((a, b) => b.totalMs - a.totalMs),
      aggregateStages,
      redundantRevalidations: this.redundantRevalidations,
      semanticCacheHits: this.semanticCacheHits,
      semanticCacheMisses: this.semanticCacheMisses,
      typeResolverMs: this.typeResolverMs,
    };
  }

  public static logReport(workspaceDir: string): void {
    const report = this.buildReport(workspaceDir);
    if (report.fileCount === 0) {
      logger.info("[LINT-PERF] Nenhum perfil coletado.");
      return;
    }

    logger.info(`[LINT-PERF] Workspace: ${report.workspaceDir}`);
    logger.info(
      `[LINT-PERF] ${report.fileCount} arquivo(s), ${report.totalMs.toFixed(2)} ms total, ${report.redundantRevalidations} revalidação(ões) redundante(s), cache ${report.semanticCacheHits}/${report.semanticCacheHits + report.semanticCacheMisses} hits, TypeResolver ${report.typeResolverMs.toFixed(2)} ms`,
    );

    logger.info("[LINT-PERF] Estágios agregados (ms):");
    for (const [stage, ms] of Object.entries(report.aggregateStages)) {
      if (ms > 0) {
        logger.info(`  - ${stage}: ${ms.toFixed(2)} ms`);
      }
    }

    const top = report.files.slice(0, 10);
    logger.info("[LINT-PERF] Top 10 arquivos mais lentos:");
    for (const file of top) {
      const rel = file.fileUri.split(/[/\\]/).slice(-2).join("/");
      const parseMs = file.stages.parse.toFixed(1);
      const lintMs = file.stages["advanced-lint"].toFixed(1);
      logger.info(
        `  ${rel}: ${file.totalMs.toFixed(1)} ms (parse=${parseMs}, lint=${lintMs}, deps=${file.dependentFilesTriggered}, stale=${file.staleRunsDiscarded})`,
      );
    }
  }

  private static addStageTime(fileUri: string, stage: LintPipelineStage, elapsedMs: number): void {
    const key = fileUri.toLowerCase();
    const existing = this.fileProfiles.get(key) ?? createEmptyProfile(fileUri);
    const stages = { ...existing.stages, [stage]: existing.stages[stage] + elapsedMs };
    this.fileProfiles.set(key, {
      ...existing,
      stages,
      totalMs: existing.totalMs + elapsedMs,
    });
  }
}

function emptyStages(): Record<LintPipelineStage, number> {
  return {
    parse: 0,
    "index-update": 0,
    "module-refs": 0,
    "advanced-lint": 0,
    "semantic-cache": 0,
    "type-resolver": 0,
    publish: 0,
    "dependent-propagation": 0,
  };
}

function createEmptyProfile(fileUri: string): LintFileProfile {
  return {
    fileUri,
    stages: emptyStages(),
    totalMs: 0,
    dependentFilesTriggered: 0,
    staleRunsDiscarded: 0,
  };
}
