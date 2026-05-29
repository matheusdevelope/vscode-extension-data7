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
  /**
   * A null-coalescing `lhs ?? rhs` was used outside an assignment RHS. Like
   * the ternary case the transpiler needs a target variable to bind the
   * result of the expansion, so contexts like `Print x ?? "" ` or
   * `Return x ?? defaultVal` are surfaced for manual refactor.
   */
  NullCoalesceContextUnsupported: "null-coalesce-context-unsupported",
  /**
   * An optional-chaining `obj?.member` was used outside the assignment RHS
   * or property/method-call statement contexts the transpiler can lift
   * into `If obj <> NULL Then ...`. Surfaced so the user can either choose
   * a supported context or write the guard manually.
   */
  OptionalChainContextUnsupported: "optional-chain-context-unsupported",
  /**
   * An optional-chaining expression has too many nested `?.` for the
   * single-line expansion to remain readable (the transpiler caps the
   * chain depth at three). The user can refactor to intermediate temps.
   */
  OptionalChainTooDeep: "optional-chain-too-deep",
  /**
   * `Using x As T` references a type that does not appear to expose a
   * `Free`/`Dispose` method on its inheritance chain. The expansion still
   * goes through (using `.Free()`) but the user is warned in case the
   * resource needs a different liberation API.
   */
  UsingNonDisposable: "using-non-disposable",
  /**
   * `Dim x As New T` (auto-new without `()`) targeted a type whose only
   * known constructors require arguments — the resulting `New T()` call
   * will fail in runtime.
   */
  AutoNewNonDefaultCtor: "auto-new-non-default-ctor",
  /**
   * A destructuring pattern (`Dim { Nome, Idade } = pessoa`) references a
   * member that does not exist on the resolved type.
   */
  DestructureUnknownMember: "destructure-unknown-member",
  /**
   * An array destructuring pattern (`Dim [a, b] = lista`) is targeting a
   * value that does not expose a default indexer or `Item(Integer)`.
   */
  DestructureNonArray: "destructure-non-array",
  /**
   * A destructuring pattern was used outside a supported context
   * (`Dim` declaration or `Sub` parameter list).
   */
  DestructureContextUnsupported: "destructure-context-unsupported",
  /**
   * A destructuring pattern is nested too deeply for the line-based
   * transpiler to expand it reliably.
   */
  DestructureTooDeep: "destructure-too-deep",
  /**
   * A spread `...other` in an object initializer targeted a type that
   * does not inherit from TPersistent (lacks the `Assign` method).
   */
  SpreadNonPersistent: "spread-non-persistent",
  /**
   * A lambda body references a variable from the enclosing scope. Data7
   * Basic delegates do not capture; the user must thread the value
   * through the `extra As Variant` parameter instead.
   */
  LambdaCaptureUnsupported: "lambda-capture-unsupported",
  /**
   * A generic constraint (`Class TList<T As BaseEnum>`) was violated by
   * the concrete type argument at the usage site.
   */
  GenericConstraintViolated: "generic-constraint-violated",
  /**
   * `list(i)` was used as a default indexer on a type that does not
   * declare an `Item(Integer)` member.
   */
  DefaultIndexerMissing: "default-indexer-missing",
  /**
   * Assignment to a parameter declared with the `ReadOnly` modifier
   * (`Sub Foo(ReadOnly p As T)`).
   */
  ReadOnlyAssignment: "readonly-assignment",
  /**
   * A generic usage site references a template name that is not declared
   * in the unit (`Dim x As TList<Product>` when `TList<T>` is missing).
   * Emitted by the generics pre-pass; the usage is left untouched so the
   * downstream compiler can also surface the symbol as unknown.
   */
  UnknownTemplate: "unknown-template",
  /**
   * The number of type arguments at a generic usage site does not match
   * the template's declared type parameters
   * (`Dim x As Pair<Integer>` for `Class Pair<K, V>`). The site is left
   * untouched and no instantiation is emitted.
   */
  GenericArityMismatch: "generic-arity-mismatch",
  /**
   * Two top-level generic declarations share the same name (e.g. two
   * `Class Box<T>` blocks in the same unit). The last registration wins;
   * the warning surfaces the ambiguity so the user can rename one of
   * them.
   */
  DuplicateTemplate: "duplicate-template",
  /**
   * A class declared a generic method (`Sub Foo<T>(...)` inside a
   * `Class`). The current monomorphization engine does not support
   * receiver-bound generic methods; the declaration is dropped so the
   * downstream AST stays free of `<T>`.
   */
  ClassGenericMethodUnsupported: "class-generic-method-unsupported",
  /**
   * Two structurally distinct generic usages flatten to the same name
   * (e.g. when a source type already contains `_`). Both still emit a
   * single concrete declaration; the warning surfaces the ambiguity so
   * the user can rename the offending type.
   */
  FlatNameCollision: "flat-name-collision",
  /**
   * The generics monomorphization worklist exceeded
   * `MAX_INSTANTIATIONS`. Usually a sign of a feedback loop the engine
   * cannot terminate; the drain stops and any remaining usages survive
   * in the AST (the downstream compiler will then surface them as
   * parser errors).
   */
  InstantiationLimitExceeded: "instantiation-limit-exceeded",
  /** An identifier's name conflicts with another declaration in the same or an outer/imported/global scope. */
  DuplicateDeclaration: "duplicate-declaration",
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

/**
 * Payload for `NullCoalesceContextUnsupported`: mirrors the ternary case —
 * the operator was found outside an assignment RHS that the transpiler
 * cannot lift into an `If/Then/Else/End If` block automatically.
 */
export interface NullCoalesceContextUnsupportedPayload {
  code: typeof DiagnosticCodes.NullCoalesceContextUnsupported;
  context: "non-assignment";
}

/**
 * Payload for `OptionalChainContextUnsupported`: same shape used by other
 * "lift to If/Then/Else" diagnostics.
 */
export interface OptionalChainContextUnsupportedPayload {
  code: typeof DiagnosticCodes.OptionalChainContextUnsupported;
  context: "non-assignment-non-call";
}

/**
 * Payload for `OptionalChainTooDeep`: identifies the cap that was breached.
 */
export interface OptionalChainTooDeepPayload {
  code: typeof DiagnosticCodes.OptionalChainTooDeep;
  /** Number of `?.` tokens found in the chain. */
  depth: number;
  /** Cap enforced by the transpiler. */
  maxDepth: number;
}

/**
 * Payload for `UnknownTemplate`: identifies the template name that was
 * referenced but not declared in the unit.
 */
export interface UnknownTemplatePayload {
  code: typeof DiagnosticCodes.UnknownTemplate;
  /** Name of the missing template (`TList`, `Pair`, …). */
  templateName: string;
}

/**
 * Payload for `GenericArityMismatch`: identifies the template plus the
 * expected vs. supplied number of type arguments.
 */
export interface GenericArityMismatchPayload {
  code: typeof DiagnosticCodes.GenericArityMismatch;
  /** Name of the template the user referenced. */
  templateName: string;
  /** Number of type parameters the template declares. */
  expected: number;
  /** Number of type arguments supplied at the usage site. */
  actual: number;
}

/**
 * Payload for `DuplicateTemplate`: identifies the name that was registered
 * twice in the unit.
 */
export interface DuplicateTemplatePayload {
  code: typeof DiagnosticCodes.DuplicateTemplate;
  /** Name registered more than once. */
  templateName: string;
}

/**
 * Payload for `ClassGenericMethodUnsupported`: identifies the qualified
 * name of the method whose generic declaration was dropped.
 */
export interface ClassGenericMethodUnsupportedPayload {
  code: typeof DiagnosticCodes.ClassGenericMethodUnsupported;
  /** Qualified name (`<ClassName>.<MethodName>`). */
  qualifiedName: string;
}

/**
 * Payload for `FlatNameCollision`: identifies the flat name shared by two
 * structurally different usages.
 */
export interface FlatNameCollisionPayload {
  code: typeof DiagnosticCodes.FlatNameCollision;
  /** The colliding flat name. */
  flatName: string;
}

/**
 * Payload for `InstantiationLimitExceeded`: identifies the cap that was
 * breached.
 */
export interface InstantiationLimitExceededPayload {
  code: typeof DiagnosticCodes.InstantiationLimitExceeded;
  /** Maximum number of instantiations allowed. */
  limit: number;
}

export interface DuplicateDeclarationPayload {
  code: typeof DiagnosticCodes.DuplicateDeclaration;
  name: string;
  scope: "method" | "class" | "namespace" | "imported" | "global";
  conflictingWithName: string;
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
  | TernaryContextUnsupportedPayload
  | NullCoalesceContextUnsupportedPayload
  | OptionalChainContextUnsupportedPayload
  | OptionalChainTooDeepPayload
  | UnknownTemplatePayload
  | GenericArityMismatchPayload
  | DuplicateTemplatePayload
  | ClassGenericMethodUnsupportedPayload
  | FlatNameCollisionPayload
  | InstantiationLimitExceededPayload
  | DuplicateDeclarationPayload;

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
