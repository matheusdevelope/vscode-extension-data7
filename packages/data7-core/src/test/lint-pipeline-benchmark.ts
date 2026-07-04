/**
 * Standalone lint pipeline benchmark for real workspaces.
 *
 * Usage:
 *   npm run lint:benchmark
 *   DATA7_BENCHMARK_WORKSPACE="D:\path\to\project" npm run lint:benchmark
 *
 * Set DATA7_LINT_PROFILE=1 (default in script) to emit stage timings.
 * Set DATA7_LINT_WORKERS=N to control worker-thread pool size (phase 2c).
 */
import "./_setup/global-hooks";
import * as fs from "node:fs";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import * as vscode from "../platform/vscode-api";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { LanguageProcessor } from "../analysis/language-processor";
import { LintPipelineProfiler } from "../analysis/lint-pipeline-profiler";
import { runWorkspaceLintInBatches } from "../analysis/lint-workspace-runner";
import { runWorkspaceLintWithWorkerPool } from "../analysis/lint-worker-pool";
import { SemanticLintCache } from "../analysis/semantic-lint-cache";
import { clearPerfStats, perfStats } from "../utils/performance";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { DiagnosticsLinter } from "../diagnostics/diagnostics";
import { buildMockDocument } from "../utils/text-edit-utils";

const DEFAULT_WORKSPACE = "D:\\DEV\\Projects\\data7\\Modules\\demo";

function findBasFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const lower = entry.name.toLowerCase();
      if (lower === "node_modules" || lower === ".git") continue;
      findBasFiles(fullPath, results);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === ".bas" || ext === ".d7b") {
      results.push(fullPath);
    }
  }
  return results;
}

function toFileUri(filePath: string): string {
  return vscode.Uri.file(filePath).toString();
}

function lintFileCold(
  filePath: string,
  content: string,
  indexer: WorkspaceSymbolIndexer,
): readonly vscode.Diagnostic[] {
  const uriStr = toFileUri(filePath);
  const mockDoc = buildMockDocument(vscode.Uri.file(filePath), content);

  const cachedDoc = LintPipelineProfiler.measure("parse", uriStr, () =>
    LanguageProcessor.getInstance().getOrParse(uriStr, content),
  );

  const diagnostics: vscode.Diagnostic[] = [];

  LintPipelineProfiler.measure("module-refs", uriStr, () => {
    try {
      for (const reference of DependencyScanner.collectModuleReferences(content)) {
        void reference;
      }
    } catch {
      /* module validation needs extension workspace cache — skipped in benchmark */
    }
  });

  for (const err of cachedDoc.errors) {
    const line = Math.max(0, err.loc.line - 1);
    const col = Math.max(0, err.loc.column);
    diagnostics.push(
      new vscode.Diagnostic(
        new vscode.Range(line, col, line, col + 1),
        err.message,
        vscode.DiagnosticSeverity.Error,
      ),
    );
  }

  const advanced = LintPipelineProfiler.measure("advanced-lint", uriStr, () =>
    DiagnosticsLinter.runAdvancedDiagnostics(mockDoc, indexer),
  );

  return [...diagnostics, ...advanced];
}

async function runBenchmark(): Promise<void> {
  const workspaceDir = process.env["DATA7_BENCHMARK_WORKSPACE"] ?? DEFAULT_WORKSPACE;
  if (!fs.existsSync(workspaceDir)) {
    console.error(`Workspace não encontrado: ${workspaceDir}`);
    process.exit(1);
  }

  LintPipelineProfiler.setEnabled(process.env["DATA7_LINT_PROFILE"] !== "0");
  clearPerfStats();
  LanguageProcessor.getInstance().clearCache();
  SemanticLintCache.resetForTests();
  WorkspaceSymbolIndexer.getInstance().__resetForTests();

  const basFiles = findBasFiles(workspaceDir);
  console.log(`\n[LINT-BENCH] Workspace: ${workspaceDir}`);
  console.log(`[LINT-BENCH] Arquivos .bas/.d7b: ${basFiles.length}`);

  if (basFiles.length === 0) {
    process.exit(0);
  }

  const fileContents = basFiles.map((filePath) => ({
    filePath,
    uri: toFileUri(filePath),
    content: fs.readFileSync(filePath, "utf-8"),
  }));

  const indexer = WorkspaceSymbolIndexer.getInstance();

  console.log("\n[LINT-BENCH] Fase 1 — indexação inicial (cold)...");
  const t0Index = performance.now();
  for (const file of fileContents) {
    indexer.updateFileContent(file.uri, file.content);
  }
  const indexMs = performance.now() - t0Index;
  console.log(`[LINT-BENCH] Indexação: ${indexMs.toFixed(2)} ms`);

  const lintInputs = fileContents.map((file) => ({
    uri: file.uri,
    filePath: file.filePath,
    content: file.content,
  }));

  console.log("\n[LINT-BENCH] Fase 2 — lint completo cold (parse + advanced-lint, sequencial)...");
  LanguageProcessor.getInstance().clearCache();
  SemanticLintCache.resetForTests();
  const t0Cold = performance.now();
  for (const file of fileContents) {
    lintFileCold(file.filePath, file.content, indexer);
  }
  const coldLintMs = performance.now() - t0Cold;
  console.log(`[LINT-BENCH] Lint cold: ${coldLintMs.toFixed(2)} ms`);

  console.log("\n[LINT-BENCH] Fase 3 — lint com cache AST + semântico (warm)...");
  const t0Warm = performance.now();
  for (const file of fileContents) {
    lintFileCold(file.filePath, file.content, indexer);
  }
  const warmLintMs = performance.now() - t0Warm;
  console.log(`[LINT-BENCH] Lint warm: ${warmLintMs.toFixed(2)} ms`);

  console.log("\n[LINT-BENCH] Fase 2b — lint cold em lotes async (sem re-index, wall-clock)...");
  LanguageProcessor.getInstance().clearCache();
  SemanticLintCache.resetForTests();
  const t0Parallel = performance.now();
  await runWorkspaceLintInBatches(lintInputs, indexer);
  const parallelLintMs = performance.now() - t0Parallel;
  console.log(`[LINT-BENCH] Lint cold lotes async: ${parallelLintMs.toFixed(2)} ms`);

  console.log("\n[LINT-BENCH] Fase 2c — lint cold worker threads (multi-core)...");
  LanguageProcessor.getInstance().clearCache();
  SemanticLintCache.resetForTests();
  const snapshot = indexer.exportLintSnapshot();
  const t0Workers = performance.now();
  const workerSummary = await runWorkspaceLintWithWorkerPool(lintInputs, snapshot);
  const workerLintMs = performance.now() - t0Workers;
  console.log(
    `[LINT-BENCH] Lint cold workers (${workerSummary.workerCount} threads): ${workerLintMs.toFixed(2)} ms`,
  );

  const sampleFile = fileContents[0];
  if (sampleFile) {
    const sampleUri = sampleFile.uri;
    const dependents = LintPipelineProfiler.measure("dependent-propagation", sampleUri, () =>
      indexer.getDependentFileUris(sampleUri),
    );
    LintPipelineProfiler.recordDependentPropagation(dependents.length);
    LintPipelineProfiler.finalizeFile(sampleUri, dependents.length);
    const rel = path.basename(sampleFile.filePath);
    console.log(
      `\n[LINT-BENCH] Propagação simulada a partir de ${rel}: ${dependents.length} dependente(s)`,
    );
    if (dependents.length > 0) {
      const preview = dependents
        .slice(0, 5)
        .map((u) => path.basename(vscode.Uri.parse(u).fsPath))
        .join(", ");
      console.log(`[LINT-BENCH]   → ${preview}${dependents.length > 5 ? ", ..." : ""}`);
    }
  }

  if (LintPipelineProfiler.isEnabled()) {
    console.log("\n[LINT-BENCH] Relatório detalhado por estágio:");
    const report = LintPipelineProfiler.buildReport(workspaceDir);
    console.log(`  Arquivos perfilados: ${report.fileCount}`);
    console.log(`  Tempo total medido: ${report.totalMs.toFixed(2)} ms`);
    console.log(`  Revalidações redundantes estimadas: ${report.redundantRevalidations}`);
    console.log(
      `  Cache semântico: ${report.semanticCacheHits} hits / ${report.semanticCacheMisses} misses`,
    );
    console.log(`  TypeResolver agregado: ${report.typeResolverMs.toFixed(2)} ms`);
    const resolverStats = Array.from(perfStats.values()).filter((s) =>
      s.name.startsWith("TypeResolver."),
    );
    if (resolverStats.length > 0) {
      console.log("  TypeResolver por operação:");
      for (const stat of resolverStats.sort((a, b) => b.totalTime - a.totalTime)) {
        console.log(`    ${stat.name}: ${stat.totalTime.toFixed(1)} ms (${stat.calls} chamadas)`);
      }
    }
    console.log("  Estágios agregados (ms):");
    for (const [stage, ms] of Object.entries(report.aggregateStages)) {
      if (ms > 0) {
        console.log(`    - ${stage}: ${ms.toFixed(2)}`);
      }
    }
    console.log("  Top 10 mais lentos:");
    for (const file of report.files.slice(0, 10)) {
      const rel = path.basename(file.fileUri);
      console.log(
        `    ${rel}: ${file.totalMs.toFixed(1)} ms (parse=${file.stages.parse.toFixed(1)}, lint=${file.stages["advanced-lint"].toFixed(1)}, deps=${file.dependentFilesTriggered})`,
      );
    }
  }

  const report = LintPipelineProfiler.buildReport(workspaceDir);
  const top = report.files[0];
  if (top) {
    const rel = path.basename(top.fileUri);
    const parseMs = top.stages.parse.toFixed(1);
    const lintMs = top.stages["advanced-lint"].toFixed(1);
    console.log(
      `\n[LINT-BENCH] Gargalo principal: ${rel} — ${top.totalMs.toFixed(1)} ms total (parse=${parseMs}, lint=${lintMs}, deps=${top.dependentFilesTriggered})`,
    );
  }

  console.log(
    `\n[LINT-BENCH] Resumo: index=${indexMs.toFixed(0)}ms, lint_cold=${coldLintMs.toFixed(0)}ms, lint_cold_async=${parallelLintMs.toFixed(0)}ms, lint_cold_workers=${workerLintMs.toFixed(0)}ms, lint_warm=${warmLintMs.toFixed(0)}ms, speedup=${(coldLintMs / Math.max(warmLintMs, 1)).toFixed(2)}x`,
  );
}

runBenchmark().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
