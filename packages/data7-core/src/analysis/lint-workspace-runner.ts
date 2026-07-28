import * as os from "node:os";
import * as vscode from "../platform/vscode-api";
import { LanguageProcessor } from "./language-processor";
import { SymbolParser } from "./symbol-indexer";
import { DiagnosticsLinter } from "../diagnostics/diagnostics";
import type { WorkspaceSymbolIndexer } from "./symbol-indexer";
import { buildMockDocument } from "../utils/text-edit-utils";

export interface LintWorkspaceFileInput {
  readonly uri: string;
  readonly filePath: string;
  readonly content: string;
}

/**
 * Resolves workspace lint batch concurrency from env or CPU count.
 * Override with `DATA7_LINT_CONCURRENCY` (1–32).
 */
export function resolveLintBatchConcurrency(): number {
  const env = process.env["DATA7_LINT_CONCURRENCY"];
  if (env) {
    const parsed = Number.parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, 32);
    }
  }
  return Math.min(Math.max(os.cpus().length, 2), 16);
}

/**
 * Resolves worker-thread pool size for cold workspace lint.
 * Override with `DATA7_LINT_WORKERS` (1–16). Defaults to CPU count capped at 8.
 */
export function resolveLintWorkerCount(): number {
  const env = process.env["DATA7_LINT_WORKERS"];
  if (env) {
    const parsed = Number.parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, 16);
    }
  }
  return Math.min(Math.max(os.cpus().length, 1), 8);
}

/**
 * Runs advanced diagnostics on one file.
 * Refreshes the file's symbols from the content being linted so same-namespace
 * resolution does not depend on URI/fs quirks between host snapshot and worker.
 */
export function runLintFileDiagnosticsOnly(
  file: LintWorkspaceFileInput,
  indexer: WorkspaceSymbolIndexer,
): readonly vscode.Diagnostic[] {
  // Prefer the stable workspace URI string over Uri.file(fsPath) so lookups
  // match snapshot keys produced on the extension host.
  const mockDoc = buildMockDocument(vscode.Uri.parse(file.uri), file.content);
  const cached = LanguageProcessor.getInstance().getOrParse(file.uri, file.content);
  const symbols = SymbolParser.parseFromAst(file.uri, file.content, cached.unit);
  indexer.updateFileContentFromParsed(file.uri, file.content, symbols);
  return DiagnosticsLinter.runAdvancedDiagnostics(mockDoc, indexer);
}

/**
 * Lints workspace files in concurrent async batches (I/O overlap + yields between batches).
 * Indexer must already reflect workspace state; no per-file index updates are performed.
 */
export async function runWorkspaceLintInBatches(
  files: readonly LintWorkspaceFileInput[],
  indexer: WorkspaceSymbolIndexer,
  batchSize: number = resolveLintBatchConcurrency(),
): Promise<void> {
  const size = Math.max(1, batchSize);
  for (let i = 0; i < files.length; i += size) {
    const batch = files.slice(i, i + size);
    await Promise.all(
      batch.map((file) => Promise.resolve(runLintFileDiagnosticsOnly(file, indexer))),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
