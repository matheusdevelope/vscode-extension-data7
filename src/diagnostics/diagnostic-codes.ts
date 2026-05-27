/**
 * Canonical diagnostic codes emitted by the linter and consumed by code actions.
 * New codes must be added here AND documented in project_context.md (see data7_domain.mdc).
 */
export const DiagnosticCodes = {
  /** A type reference belongs to a namespace that is not imported in the current file. */
  MissingImport: "missing-import",
  /** An `Imports` directive in the file header is not actually used. */
  UnusedImport: "unused-import",
  /** A referenced module name was not found in workspace, repository, or system library. */
  ModuleNotFound: "module-not-found",
  /** A module is available in the repository but not declared in `data7.json` dependencies. */
  ModuleNotDeclared: "module-not-declared",
  /** A member access (`obj.X`) targets a member that does not exist on the resolved type. */
  UnknownMember: "unknown-member",
  /** The same namespace is imported more than once in the header of the file. */
  DuplicateImport: "duplicate-import",
  /** A `Private` member of a class is accessed from outside its declaring scope. */
  PrivateMemberAccess: "private-member-access",
  /** A handler assigned to an `OnXxx` event has a signature incompatible with the delegate. */
  EventSignatureMismatch: "event-signature-mismatch",
  /**
   * The referenced member exists in the System Library but is flagged
   * `isUnsupported` because the Data7 compiler does not translate it. Surfaced
   * as a warning so users can find an alternative before runtime.
   */
  UnsupportedMember: "unsupported-member",
  /**
   * A `For Each ... In <expr>` targets an expression whose type does not
   * expose the `Count` + indexer pair required by the sugar transpiler.
   * Surfaced as a warning so the user can switch back to a classic `For`
   * before the Builder rewrites the file.
   */
  NotEnumerable: "not-enumerable",
  /**
   * A `' data7:disable-line <code>` (or `disable-next-line`) directive
   * references a diagnostic code that does not exist in this enum. Usually
   * a typo (`missig-import`) or a code that was removed from a previous
   * release. Surfaced as a warning so the user discovers stale directives.
   */
  UnknownSuppressionCode: "unknown-suppression-code",
  /**
   * A `$"..."` interpolated string is malformed: empty `{}` expression,
   * unterminated brace `{`, or unterminated string literal. The transpiler
   * leaves the offending token untouched so the user can see exactly where
   * the parse stopped.
   */
  InvalidInterpolation: "invalid-interpolation",
  /**
   * A ternary `cond ? a : b` was used in a context the transpiler cannot
   * expand into the native multi-line `If/Then/Else/End If` form. Only the
   * right-hand side of an assignment is supported (`Dim x = c ? a : b`,
   * `x = c ? a : b`, `obj.prop = c ? a : b`); anything else (function call
   * argument, expression inside another expression, `Return` statement, …)
   * is flagged here so the user can refactor before the Builder runs.
   */
  TernaryContextUnsupported: "ternary-context-unsupported",
} as const;

export type DiagnosticCode = (typeof DiagnosticCodes)[keyof typeof DiagnosticCodes];

/**
 * Structured payload attached to `vscode.Diagnostic.data` so that code actions
 * can act on diagnostics without parsing the localized `message` text.
 */
export interface MissingImportPayload {
  code: typeof DiagnosticCodes.MissingImport;
  /** Namespace that must be added via `Imports <namespace>` to satisfy the reference. */
  namespace: string;
  /** Type or symbol that triggered the diagnostic. */
  typeName: string;
}

/** Payload for `ModuleNotDeclared`: lets the code action add the entry to `data7.json`. */
export interface ModuleNotDeclaredPayload {
  code: typeof DiagnosticCodes.ModuleNotDeclared;
  /** Module name to be appended to `data7.json#dependencies`. */
  moduleName: string;
}

/** Payload for `ModuleNotFound`: lets the code action fire `data7.installModule`. */
export interface ModuleNotFoundPayload {
  code: typeof DiagnosticCodes.ModuleNotFound;
  /** Module name the user referenced. */
  moduleName: string;
}

/** Payload for `UnusedImport`: gives the action the full range of the line to delete. */
export interface UnusedImportPayload {
  code: typeof DiagnosticCodes.UnusedImport;
  /** Namespace whose `Imports` line should be removed. */
  namespace: string;
}

/** Payload for `UnknownMember`: enables "did you mean?" suggestions. */
export interface UnknownMemberPayload {
  code: typeof DiagnosticCodes.UnknownMember;
  /** The actual member name the user typed. */
  member: string;
  /** Up to 3 candidate names (typo suggestions) from the resolved type. */
  suggestions: readonly string[];
}

/** Payload for `UnsupportedMember`: identifies which member on which type. */
export interface UnsupportedMemberPayload {
  code: typeof DiagnosticCodes.UnsupportedMember;
  /** The member name that was flagged as unsupported. */
  member: string;
  /** The owning type as it was resolved by the linter. */
  typeName: string;
}

/** Payload for `NotEnumerable`: identifies the offending type behind the `For Each`. */
export interface NotEnumerablePayload {
  code: typeof DiagnosticCodes.NotEnumerable;
  /** The type the linter resolved for the `In <expr>` operand, or `"Variant"` when unknown. */
  typeName: string;
}

/** Payload for `UnknownSuppressionCode`: identifies the typoed/removed code. */
export interface UnknownSuppressionCodePayload {
  code: typeof DiagnosticCodes.UnknownSuppressionCode;
  /** The bogus code that appeared inside the directive. */
  suppressedCode: string;
}

/**
 * Payload for `InvalidInterpolation`: identifies the failure mode the parser
 * stopped on so consumers can show a precise error message.
 *
 * `reason` is one of the canonical kinds the parser may emit:
 *  - `"unterminated-string"`: a `$"...` token never reaches a closing `"`.
 *  - `"unterminated-brace"`: an interpolation `{expr` never reaches `}`.
 *  - `"empty-expression"`: a `{}` (or `{   }`) with no actual expression.
 */
export interface InvalidInterpolationPayload {
  code: typeof DiagnosticCodes.InvalidInterpolation;
  reason: "unterminated-string" | "unterminated-brace" | "empty-expression";
}

/**
 * Payload for `TernaryContextUnsupported`: identifies the surface where the
 * ternary appears. Today the only recognised context is `"non-assignment"`,
 * but the field is extensible so future strategies (lifting to a temp var,
 * helper function injection) can route on a finer-grained tag.
 */
export interface TernaryContextUnsupportedPayload {
  code: typeof DiagnosticCodes.TernaryContextUnsupported;
  context: "non-assignment";
}

export type DiagnosticPayload =
  | MissingImportPayload
  | ModuleNotDeclaredPayload
  | ModuleNotFoundPayload
  | UnusedImportPayload
  | UnknownMemberPayload
  | UnsupportedMemberPayload
  | NotEnumerablePayload
  | UnknownSuppressionCodePayload
  | InvalidInterpolationPayload
  | TernaryContextUnsupportedPayload;

/**
 * Attaches a typed `DiagnosticPayload` to a `vscode.Diagnostic.data`. Centralised
 * here so callers do not repeat the `(diag as Diagnostic & { data?: unknown }).data`
 * cast in seven different files.
 *
 * The `diag` parameter is typed as `unknown` because `vscode.Diagnostic` does not
 * expose `data` in its public type declaration — VS Code reads it via duck-typing
 * at runtime. We accept anything here and let the helper own the single unchecked
 * cast.
 */
export function setDiagnosticPayload(diag: unknown, payload: DiagnosticPayload): void {
  (diag as { data?: unknown }).data = payload;
}
