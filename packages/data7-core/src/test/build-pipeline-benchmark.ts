/**
 * Standalone build + lint pipeline benchmark for real workspaces.
 *
 * Usage:
 *   npm run build:benchmark -w @data7/core
 *   DATA7_BENCHMARK_WORKSPACE="C:\path\to\project" npm run build:benchmark -w @data7/core
 *
 * Measures syntactic analysis, linter, prune, sugars and transpile on cold
 * (empty caches) and hot (in-process transpile / reachability caches) runs.
 */
import "./_setup/global-hooks";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import * as vscode from "../platform/vscode-api";
import { LanguageProcessor } from "../analysis/language-processor";
import { LintPipelineProfiler } from "../analysis/lint-pipeline-profiler";
import { ReachabilityParseCache } from "../analysis/declaration-reachability";
import { SemanticLintCache } from "../analysis/semantic-lint-cache";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { DiagnosticsLinter } from "../diagnostics/diagnostics";
import { Builder } from "../project/builder";
import { BuildCache } from "../project/build-cache";
import { BuildPipelineProfiler } from "../project/build-pipeline-profiler";
import { computeBuildSnapshot, recordBuildSnapshot } from "../project/build-snapshot";
import { assertTranspiledNativeSyntax } from "../project/validate-native-syntax";
import { buildMockDocument } from "../utils/text-edit-utils";
import { clearPerfStats, perfStats } from "../utils/performance";

const DEFAULT_WORKSPACE = "C:\\Data7\\Developer\\Modules\\mod_configurador";

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

function lintFile(
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

function printLintReport(workspaceDir: string, label: string): void {
  const report = LintPipelineProfiler.buildReport(workspaceDir);
  console.log(`\n[LINT-PERF] ${label}`);
  console.log(`  Arquivos perfilados: ${report.fileCount}`);
  console.log(`  Tempo total medido: ${report.totalMs.toFixed(2)} ms`);
  console.log(`  TypeResolver agregado: ${report.typeResolverMs.toFixed(2)} ms`);
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
      `    ${rel}: ${file.totalMs.toFixed(1)} ms (parse=${file.stages.parse.toFixed(1)}, lint=${file.stages["advanced-lint"].toFixed(1)})`,
    );
  }
}

function resetLintCaches(): void {
  LanguageProcessor.getInstance().clearCache();
  SemanticLintCache.resetForTests();
  WorkspaceSymbolIndexer.getInstance().__resetForTests();
  LintPipelineProfiler.reset();
  clearPerfStats();
}

function resetBuildCaches(): void {
  Builder.__resetBuildCacheForTests();
  ReachabilityParseCache.resetForTests();
}

function printReachabilityPerf(label: string): void {
  const stats = Array.from(perfStats.values())
    .filter((s) => s.name.startsWith("reachability."))
    .sort((a, b) => b.totalTime - a.totalTime);
  if (stats.length === 0) return;
  console.log(`[BUILD-PERF] Reachability interno (${label}):`);
  for (const stat of stats) {
    const avg = stat.calls > 0 ? stat.totalTime / stat.calls : 0;
    console.log(
      `  - ${stat.name}: ${stat.totalTime.toFixed(1)} ms (${stat.calls} chamadas, média ${avg.toFixed(1)} ms)`,
    );
  }
}

async function runBenchmark(): Promise<void> {
  const workspaceDir = process.env["DATA7_BENCHMARK_WORKSPACE"] ?? DEFAULT_WORKSPACE;
  if (!fs.existsSync(workspaceDir)) {
    console.error(`Workspace não encontrado: ${workspaceDir}`);
    process.exit(1);
  }

  const skipLint = process.env["DATA7_BENCH_SKIP_LINT"] === "1";
  LintPipelineProfiler.setEnabled(true);
  BuildPipelineProfiler.setEnabled(true);

  const basFiles = findBasFiles(workspaceDir);
  let bytes = 0;
  let lines = 0;
  const fileContents = basFiles.map((filePath) => {
    const content = fs.readFileSync(filePath, "utf-8");
    bytes += Buffer.byteLength(content);
    lines += content.split(/\r?\n/).length;
    return { filePath, content };
  });

  console.log(`\n[PIPE-BENCH] Workspace: ${workspaceDir}`);
  console.log(
    `[PIPE-BENCH] Arquivos .bas/.d7b: ${basFiles.length} | ~${(bytes / 1024).toFixed(0)} KiB | ${lines} linhas`,
  );

  if (!skipLint && fileContents.length > 0) {
    resetLintCaches();
    const indexer = WorkspaceSymbolIndexer.getInstance();

    console.log("\n[PIPE-BENCH] === LINTER cold (index + parse + advanced-lint) ===");
    const t0Index = performance.now();
    for (const file of fileContents) {
      indexer.updateFileContent(toFileUri(file.filePath), file.content);
    }
    const indexMs = performance.now() - t0Index;
    console.log(`[PIPE-BENCH] Indexação linter: ${indexMs.toFixed(2)} ms`);

    LanguageProcessor.getInstance().clearCache();
    SemanticLintCache.resetForTests();
    LintPipelineProfiler.reset();
    const t0ColdLint = performance.now();
    for (const file of fileContents) {
      lintFile(file.filePath, file.content, indexer);
    }
    const coldLintMs = performance.now() - t0ColdLint;
    console.log(`[PIPE-BENCH] Lint cold: ${coldLintMs.toFixed(2)} ms`);
    printLintReport(workspaceDir, "cold");

    console.log("\n[PIPE-BENCH] === LINTER hot (AST + semantic cache) ===");
    LintPipelineProfiler.reset();
    const t0WarmLint = performance.now();
    for (const file of fileContents) {
      lintFile(file.filePath, file.content, indexer);
    }
    const warmLintMs = performance.now() - t0WarmLint;
    console.log(`[PIPE-BENCH] Lint hot: ${warmLintMs.toFixed(2)} ms`);
    printLintReport(workspaceDir, "hot");
    console.log(
      `[PIPE-BENCH] Linter resumo: index=${indexMs.toFixed(0)}ms, cold=${coldLintMs.toFixed(0)}ms, hot=${warmLintMs.toFixed(0)}ms, speedup=${(coldLintMs / Math.max(warmLintMs, 1)).toFixed(2)}x`,
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-build-bench-"));
  const outputFilePath = path.join(tmpDir, "mod_configurador.7Proj");
  const buildOptions = {
    validateTranspiled: assertTranspiledNativeSyntax,
    onWarning: (message: string) => {
      if (process.env["DATA7_BENCH_WARNINGS"] === "1") {
        console.warn(`  [warn] ${message}`);
      }
    },
  };

  console.log("\n[PIPE-BENCH] === BUILD cold (caches vazios) ===");
  resetBuildCaches();
  BuildPipelineProfiler.reset();
  clearPerfStats();
  const t0ColdBuild = performance.now();
  Builder.buildProject(workspaceDir, outputFilePath, undefined, buildOptions);
  const coldBuildMs = performance.now() - t0ColdBuild;
  console.log(`[PIPE-BENCH] Build cold: ${coldBuildMs.toFixed(2)} ms`);
  console.log(BuildPipelineProfiler.formatConsoleReport(workspaceDir));
  printReachabilityPerf("cold");

  console.log("\n[PIPE-BENCH] === BUILD hot (transpile + reachability cache) ===");
  BuildPipelineProfiler.reset();
  clearPerfStats();
  const t0HotBuild = performance.now();
  Builder.buildProject(workspaceDir, outputFilePath, undefined, buildOptions);
  const hotBuildMs = performance.now() - t0HotBuild;
  console.log(`[PIPE-BENCH] Build hot: ${hotBuildMs.toFixed(2)} ms`);
  console.log(BuildPipelineProfiler.formatConsoleReport(workspaceDir));
  printReachabilityPerf("hot");

  console.log("\n[PIPE-BENCH] === BUILD snapshot skip (BuildCache) ===");
  const snapshot = computeBuildSnapshot(workspaceDir, outputFilePath, {
    validateTranspiled: true,
  });
  recordBuildSnapshot(snapshot);
  const t0Skip = performance.now();
  const skipped = BuildCache.getFreshProjectBuild(workspaceDir, outputFilePath, buildOptions);
  const skipMs = performance.now() - t0Skip;
  console.log(
    `[PIPE-BENCH] BuildCache: skipped=${String(skipped?.skipped ?? false)} in ${skipMs.toFixed(2)} ms`,
  );

  console.log(
    `\n[PIPE-BENCH] Resumo build: cold=${coldBuildMs.toFixed(0)}ms, hot=${hotBuildMs.toFixed(0)}ms, snapshot=${skipMs.toFixed(0)}ms, speedup=${(coldBuildMs / Math.max(hotBuildMs, 1)).toFixed(2)}x`,
  );

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}

runBenchmark().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
