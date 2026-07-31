import type { CompilationUnit } from "../project/ast/ast";
import type { ParseError } from "../project/parser/parser-errors";
import type { Token } from "../project/parser/token-types";
import type { FileSymbols } from "./symbol-indexer";
import type * as vscode from "../platform/vscode-api";
import type { LintUnitIndex } from "../diagnostics/lint-unit-index";

/**
 * Immutable versioned view of one source file, shared by indexer, linter and
 * providers. Identity is `(uri, version, contentHash)`: analysis results are
 * attached by deriving a new snapshot, never by mutating the one already
 * published, so no consumer can observe a half-updated state.
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
  /** Populated by the bind pass. */
  readonly bindIndex?: BindIndex;
  /** Populated by ensureChecked. */
  readonly checkResult?: CheckResult;
  /**
   * Last completed check, kept across invalidations and version bumps so a large
   * file can answer immediately with stale data while a fresh check is queued.
   */
  readonly lastCompletedCheck?: CheckResult;
}

export interface BindIndex {
  readonly unitIndex: LintUnitIndex;
  readonly dependencyFingerprint: string;
}

export interface CheckResult {
  readonly diagnostics: readonly vscode.Diagnostic[];
  readonly checkedAtMs: number;
  readonly cancelled: boolean;
  /** True when the diagnostics come from an older version while a re-check is queued. */
  readonly stale?: boolean;
}

/**
 * Scheduling classes, most urgent first (REFACTOR-ANALYSIS-ENGINE.md §8.4):
 * active editor, other visible editors, other open buffers, direct dependents,
 * transitive dependents, and finally the rest of the workspace.
 */
export type AnalysisPriority =
  | "active"
  | "visible"
  | "open"
  | "dependent"
  | "transitive"
  | "background";

export interface AnalysisCancellation {
  readonly isCancellationRequested: boolean;
}
