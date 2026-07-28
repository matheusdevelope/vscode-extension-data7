import type { CompilationUnit } from "../project/ast/ast";
import type { ParseError } from "../project/parser/parser-errors";
import type { Token } from "../project/parser/token-types";
import type { FileSymbols } from "./symbol-indexer";
import type * as vscode from "../platform/vscode-api";
import type { LintUnitIndex } from "../diagnostics/lint-unit-index";

/**
 * Versioned view of one source file shared by indexer, linter, and providers.
 */
export interface FileSnapshot {
  readonly uri: string;
  readonly version: number;
  readonly contentHash: string;
  readonly content: string;
  readonly unit: CompilationUnit;
  readonly tokens: readonly Token[];
  readonly errors: readonly ParseError[];
  readonly symbols: FileSymbols;
  /** Populated by ensureChecked / bind pass. */
  bindIndex?: BindIndex;
  /** Populated by ensureChecked. */
  checkResult?: CheckResult;
}

export interface BindIndex {
  readonly unitIndex: LintUnitIndex;
  readonly dependencyFingerprint: string;
}

export interface CheckResult {
  readonly diagnostics: readonly vscode.Diagnostic[];
  readonly checkedAtMs: number;
  readonly cancelled: boolean;
}

export type AnalysisPriority = "active" | "dependent" | "background";

export interface AnalysisCancellation {
  readonly isCancellationRequested: boolean;
}
