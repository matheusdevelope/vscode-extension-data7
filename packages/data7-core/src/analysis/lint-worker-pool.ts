import * as path from "node:path";
import { Worker } from "node:worker_threads";
import type { WorkspaceSymbolIndexSnapshot } from "./symbol-indexer";
import type { SerializedLintDiagnostic } from "./lint-diagnostic-transfer";
import { type LintWorkspaceFileInput, resolveLintWorkerCount } from "./lint-workspace-runner";

interface WorkerLintResult {
  readonly uri: string;
  readonly diagnostics: readonly SerializedLintDiagnostic[];
}

export interface WorkerPoolLintSummary {
  readonly fileCount: number;
  readonly totalDiagnostics: number;
  readonly workerCount: number;
  readonly diagnosticsByUri: ReadonlyMap<string, readonly SerializedLintDiagnostic[]>;
}

function workerScriptPath(): string {
  return path.join(__dirname, "lint-worker.js");
}

function splitEvenly<T>(items: readonly T[], parts: number): T[][] {
  const buckets: T[][] = Array.from({ length: parts }, () => []);
  for (let i = 0; i < items.length; i++) {
    const bucket = buckets[i % parts];
    if (bucket) {
      bucket.push(items[i] as T);
    }
  }
  return buckets.filter((bucket) => bucket.length > 0);
}

function runWorker(
  snapshot: WorkspaceSymbolIndexSnapshot,
  files: readonly LintWorkspaceFileInput[],
): Promise<readonly WorkerLintResult[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerScriptPath());
    const results: WorkerLintResult[] = [];

    worker.on("message", (message: { type: string; results?: readonly WorkerLintResult[] }) => {
      if (message.type === "ready") {
        worker.postMessage({ type: "lint", files });
        return;
      }
      if (message.type === "results" && message.results) {
        results.push(...message.results);
        void worker.terminate();
        resolve(results);
      }
    });

    worker.on("error", (err: Error) => {
      void worker.terminate();
      reject(err);
    });

    worker.on("exit", (code) => {
      if (code !== 0 && results.length === 0) {
        reject(new Error(`lint-worker exited with code ${code}`));
      }
    });

    worker.postMessage({ type: "init", snapshot });
  });
}

function shouldUseWorkerPool(): boolean {
  if (process.env["DATA7_LINT_USE_WORKERS"] === "0") {
    return false;
  }
  return resolveLintWorkerCount() > 1;
}

/**
 * Lints workspace files across multiple Node worker threads, each with its own
 * detached symbol index hydrated from `snapshot`.
 */
export async function runWorkspaceLintWithWorkerPool(
  files: readonly LintWorkspaceFileInput[],
  snapshot: WorkspaceSymbolIndexSnapshot,
  workerCount: number = resolveLintWorkerCount(),
): Promise<WorkerPoolLintSummary> {
  if (files.length === 0) {
    return {
      fileCount: 0,
      totalDiagnostics: 0,
      workerCount: 0,
      diagnosticsByUri: new Map(),
    };
  }

  const workers = Math.min(Math.max(1, workerCount), files.length);
  const buckets = splitEvenly(files, workers);
  const bucketResults = await Promise.all(buckets.map((bucket) => runWorker(snapshot, bucket)));

  const diagnosticsByUri = new Map<string, readonly SerializedLintDiagnostic[]>();
  let totalDiagnostics = 0;
  for (const bucket of bucketResults) {
    for (const result of bucket) {
      diagnosticsByUri.set(result.uri, result.diagnostics);
      totalDiagnostics += result.diagnostics.length;
    }
  }

  return {
    fileCount: files.length,
    totalDiagnostics,
    workerCount: buckets.length,
    diagnosticsByUri,
  };
}

export function isWorkerPoolLintEnabled(): boolean {
  return shouldUseWorkerPool();
}
