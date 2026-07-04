import { parentPort } from "node:worker_threads";
import { LanguageProcessor } from "./language-processor";
import { WorkspaceSymbolIndexer, type WorkspaceSymbolIndexSnapshot } from "./symbol-indexer";
import {
  serializeLintDiagnostics,
  type SerializedLintDiagnostic,
} from "./lint-diagnostic-transfer";
import { runLintFileDiagnosticsOnly, type LintWorkspaceFileInput } from "./lint-workspace-runner";

interface WorkerInitMessage {
  readonly type: "init";
  readonly snapshot: WorkspaceSymbolIndexSnapshot;
}

interface WorkerLintMessage {
  readonly type: "lint";
  readonly files: readonly LintWorkspaceFileInput[];
}

type WorkerInboundMessage = WorkerInitMessage | WorkerLintMessage;

interface WorkerLintResult {
  readonly uri: string;
  readonly diagnostics: readonly SerializedLintDiagnostic[];
}

interface WorkerReadyMessage {
  readonly type: "ready";
}

interface WorkerResultsMessage {
  readonly type: "results";
  readonly results: readonly WorkerLintResult[];
}

type WorkerOutboundMessage = WorkerReadyMessage | WorkerResultsMessage;

let indexer: WorkspaceSymbolIndexer | undefined;

function post(message: WorkerOutboundMessage): void {
  parentPort?.postMessage(message);
}

parentPort?.on("message", (message: WorkerInboundMessage) => {
  if (message.type === "init") {
    LanguageProcessor.getInstance().clearCache();
    indexer = WorkspaceSymbolIndexer.createDetached();
    indexer.loadLintSnapshot(message.snapshot);
    post({ type: "ready" });
    return;
  }

  if (message.type !== "lint" || !indexer) {
    return;
  }

  const results: WorkerLintResult[] = [];
  for (const file of message.files) {
    const diagnostics = runLintFileDiagnosticsOnly(file, indexer);
    results.push({
      uri: file.uri,
      diagnostics: serializeLintDiagnostics(diagnostics),
    });
  }
  post({ type: "results", results });
});
