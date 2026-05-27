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

export type DiagnosticPayload =
  | MissingImportPayload
  | ModuleNotDeclaredPayload
  | ModuleNotFoundPayload
  | UnusedImportPayload
  | UnknownMemberPayload
  | UnsupportedMemberPayload;

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
