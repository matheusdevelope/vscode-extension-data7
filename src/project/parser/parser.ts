/**
 * Recursive-descent parser for the Data7 Basic subset the generics
 * monomorphizer + linter rely on.
 *
 * Coverage:
 *
 *  - `Namespace <Name> ... End Namespace`
 *  - `Class <Name>[<T, U>] [Inherits <T>] ... End Class`
 *  - `[modifier]* Sub <Name>[<T>](params) ... End Sub`
 *  - `[modifier]* Function <Name>[<T>](params) [As T] ... End Function`
 *  - `Delegate (Sub|Function) <Name>[<T>](params) [As T]`
 *  - `Public/Private/Protected/Shared Property <Name> As <T>`
 *  - `Public/Private/Protected/Shared <FieldName> As <T>`
 *  - `Dim <Name> As <T> [= initializer]` — limited initializer parsing,
 *    enough to recognise `New T(args)` so the monomorphizer can rewrite
 *    `New TList<Product>()` to `New TList_Product()`.
 *
 * Out of scope (intentional, may be revisited in later phases):
 *
 *  - Full expression grammar. Method bodies are stored as
 *    {@link OpaqueStatement}s carrying the verbatim source text. The
 *    serializer (Fase 5) emits them unchanged; the monomorphizer's
 *    substitution walker applies lexical-aware substitution to them
 *    when type parameters are instantiated.
 *  - Control-flow statements (`If`, `For`, `While`, `Try`). They land in
 *    the opaque-statement bucket too.
 *  - Constraints (`T As BaseEnum`) are recognised but their right-hand
 *    side is parsed and then dropped by the monomorphizer.
 *
 * Errors are **collected** rather than thrown. Each problem becomes a
 * {@link ParseError} and the parser falls forward to the next token it
 * can resync on (next `End <kind>`, next top-level keyword, or EOF).
 */

import type {
  ClassDeclaration,
  ClassMember,
  CompilationUnit,
  DelegateDeclaration,
  FieldDeclaration,
  MethodDeclaration,
  NamespaceDeclaration,
  OpaqueStatement,
  ParameterDeclaration,
  PropertyDeclaration,
  Statement,
  TopLevelMember,
  TypeParameter,
  TypeReference,
} from "../generics-monomorphizer/ast";
import { tokenize } from "./lexer";
import { makeError, type ParseError, type ParseErrorCode } from "./parser-errors";
import type { Token, TokenLocation } from "./token-types";

export interface ParseResult {
  readonly unit: CompilationUnit;
  readonly errors: readonly ParseError[];
}

/**
 * Parses `source` into a {@link CompilationUnit}. Always returns a
 * (possibly partial) unit; consult `errors` to see whether the input
 * was well-formed.
 *
 * `sourceLines` is the original source split on `\r?\n` so we can carve
 * out verbatim body slices for {@link OpaqueStatement}s. Computed once
 * here to avoid threading the original string through every recursive
 * call.
 */
export function parse(source: string): ParseResult {
  const tokens = tokenize(source);
  const sourceLines = source.split(/\r?\n/);
  const parser = new Parser(tokens, sourceLines);
  const unit = parser.parseCompilationUnit();
  return { unit, errors: parser.errors };
}

// ============================================================================
// Parser internals
// ============================================================================

class Parser {
  private pos = 0;
  public readonly errors: ParseError[] = [];

  constructor(
    private readonly tokens: readonly Token[],
    private readonly sourceLines: readonly string[],
  ) {}

  // --------------------------------------------------------------------------
  // Cursor helpers
  // --------------------------------------------------------------------------

  private peek(offset = 0): Token {
    const idx = this.pos + offset;
    const at = this.tokens[idx];
    if (at !== undefined) return at;
    // The lexer guarantees an `eof` token at the end, so once we walk
    // past the cursor we still get an EOF marker. Defensive fallback
    // keeps `noUncheckedIndexedAccess` happy.
    const last = this.tokens[this.tokens.length - 1];
    return last ?? { kind: "eof", value: "", loc: { line: 0, column: 0 } };
  }

  private isEOF(): boolean {
    return this.peek().kind === "eof";
  }

  private advance(): Token {
    const t = this.peek();
    if (t.kind !== "eof") this.pos++;
    return t;
  }

  /** Skips zero or more `newline` tokens. */
  private skipNewlines(): void {
    while (this.peek().kind === "newline") this.pos++;
  }

  /** Case-insensitive comparison of a keyword/identifier token's value. */
  private static eq(token: Token, name: string): boolean {
    return token.value.toLowerCase() === name.toLowerCase();
  }

  /**
   * Returns true if the current token matches `kind` and (when given)
   * `value` (case-insensitive). Does NOT consume the token.
   */
  private match(kind: Token["kind"], value?: string): boolean {
    const t = this.peek();
    if (t.kind !== kind) return false;
    if (value === undefined) return true;
    return Parser.eq(t, value);
  }

  /**
   * Consumes the current token if it matches. Returns the consumed
   * token on match, otherwise `null`.
   */
  private consume(kind: Token["kind"], value?: string): Token | null {
    if (this.match(kind, value)) return this.advance();
    return null;
  }

  /**
   * Consumes the current token if it matches `kind` (and, when supplied,
   * the case-insensitive `value`). Otherwise records an
   * `expected-token` error and returns `null`. Does NOT advance on
   * failure (caller decides on recovery).
   *
   * `description` is the human-readable label used in the error
   * message; pass it whenever the placeholder differs from the literal
   * value (e.g. `<namespace-name>` instead of a hard-coded token).
   */
  private expect(
    kind: Token["kind"],
    valueOrDescription: string,
    options: { readonly literal?: boolean } = {},
  ): Token | null {
    const t = this.peek();
    const literal = options.literal ?? false;
    const matches = literal ? this.match(kind, valueOrDescription) : this.match(kind);
    if (matches) return this.advance();
    this.recordError(
      "expected-token",
      `Expected '${valueOrDescription}', got '${t.value || t.kind}'.`,
      t.loc,
    );
    return null;
  }

  private recordError(code: ParseErrorCode, message: string, loc: TokenLocation): void {
    this.errors.push(makeError(code, message, loc));
  }

  // --------------------------------------------------------------------------
  // Top level
  // --------------------------------------------------------------------------

  parseCompilationUnit(): CompilationUnit {
    const members: TopLevelMember[] = [];
    this.skipNewlines();
    while (!this.isEOF()) {
      const m = this.parseTopLevelMember();
      if (m !== null) members.push(m);
      this.skipNewlines();
    }
    return { kind: "CompilationUnit", members };
  }

  private parseTopLevelMember(): TopLevelMember | null {
    // Skip modifier prefixes that may precede a declaration so we can
    // peek at the actual declaration keyword.
    let lookahead = 0;
    while (this.peekIsModifier(lookahead)) lookahead++;
    const head = this.peek(lookahead);

    if (head.kind === "keyword" || head.kind === "identifier") {
      const v = head.value.toLowerCase();
      if (v === "namespace") return this.parseNamespace();
      if (v === "class") return this.parseClass();
      if (v === "sub" || v === "function") return this.parseMethod();
      if (v === "delegate") return this.parseDelegate();
    }

    // Anything else at top level becomes an opaque line. This includes
    // bare `Dim`s, comments-only lines, and assignments.
    return this.consumeLineAsOpaque();
  }

  private peekIsModifier(offset: number): boolean {
    const t = this.peek(offset);
    if (t.kind !== "keyword" && t.kind !== "identifier") return false;
    return MODIFIER_KEYWORDS.has(t.value.toLowerCase());
  }

  // --------------------------------------------------------------------------
  // Namespace
  // --------------------------------------------------------------------------

  private parseNamespace(): NamespaceDeclaration {
    const startLoc = this.peek().loc;
    // Consume any leading modifiers we ignored at the peek stage.
    this.consumeModifiers();
    this.advance(); // 'Namespace'
    const nameToken = this.expect("identifier", "<namespace-name>");
    const name = nameToken?.value ?? "";
    this.skipToEndOfLine();

    const members: TopLevelMember[] = [];
    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.matchEnd("namespace")) {
        this.consumeEnd("namespace");
        this.skipToEndOfLine();
        return { kind: "NamespaceDeclaration", name, members, loc: locOf(startLoc) };
      }
      const m = this.parseTopLevelMember();
      if (m !== null) members.push(m);
    }
    this.recordError(
      "unterminated-block",
      `Namespace '${name}' is missing 'End Namespace'.`,
      startLoc,
    );
    return { kind: "NamespaceDeclaration", name, members, loc: locOf(startLoc) };
  }

  // --------------------------------------------------------------------------
  // Class
  // --------------------------------------------------------------------------

  private parseClass(): ClassDeclaration {
    const startLoc = this.peek().loc;
    this.consumeModifiers();
    this.advance(); // 'Class'
    const nameToken = this.expect("identifier", "<class-name>");
    const name = nameToken?.value ?? "";
    const typeParameters = this.parseOptionalTypeParameters();
    let baseType: TypeReference | undefined;
    if (this.match("keyword", "Inherits") || this.match("identifier", "Inherits")) {
      this.advance();
      const parsed = this.parseTypeReference();
      if (parsed !== null) baseType = parsed;
    }
    this.skipToEndOfLine();

    const classMembers: ClassMember[] = [];
    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.matchEnd("class")) {
        this.consumeEnd("class");
        this.skipToEndOfLine();
        const decl: ClassDeclaration = {
          kind: "ClassDeclaration",
          name,
          typeParameters,
          members: classMembers,
          loc: locOf(startLoc),
        };
        if (baseType !== undefined) decl.baseType = baseType;
        return decl;
      }
      const m = this.parseClassMember();
      if (m !== null) classMembers.push(m);
    }
    this.recordError("unterminated-block", `Class '${name}' is missing 'End Class'.`, startLoc);
    const decl: ClassDeclaration = {
      kind: "ClassDeclaration",
      name,
      typeParameters,
      members: classMembers,
      loc: locOf(startLoc),
    };
    if (baseType !== undefined) decl.baseType = baseType;
    return decl;
  }

  private parseClassMember(): ClassMember | null {
    let lookahead = 0;
    while (this.peekIsModifier(lookahead)) lookahead++;
    const head = this.peek(lookahead);
    if (head.kind === "keyword" || head.kind === "identifier") {
      const v = head.value.toLowerCase();
      if (v === "sub" || v === "function") return this.parseMethod();
      if (v === "property") return this.parseProperty();
    }

    // Field declaration: `<modifier>* <name> As <Type>`. Anything we
    // cannot interpret is dropped as a parse error and we resync to the
    // next line.
    return this.parseField();
  }

  // --------------------------------------------------------------------------
  // Method / Sub / Function
  // --------------------------------------------------------------------------

  private parseMethod(): MethodDeclaration {
    const startLoc = this.peek().loc;
    this.consumeModifiers();
    const head = this.advance(); // 'Sub' | 'Function'
    const isFunction = Parser.eq(head, "function");
    const nameToken = this.expect("identifier", "<method-name>");
    const name = nameToken?.value ?? "";
    const typeParameters = this.parseOptionalTypeParameters();
    const parameters = this.parseParameterList();
    let returnType: TypeReference | undefined;
    if (isFunction && this.consume("keyword", "as")) {
      const t = this.parseTypeReference();
      if (t !== null) returnType = t;
    } else if (isFunction && this.consume("identifier", "as")) {
      const t = this.parseTypeReference();
      if (t !== null) returnType = t;
    }
    this.skipToEndOfLine();

    const endKind = isFunction ? "function" : "sub";
    const body = this.parseMethodBody(endKind, startLoc);
    const decl: MethodDeclaration = {
      kind: "MethodDeclaration",
      name,
      typeParameters,
      parameters,
      body,
      loc: locOf(startLoc),
    };
    if (returnType !== undefined) decl.returnType = returnType;
    return decl;
  }

  private parseMethodBody(endKind: "sub" | "function", startLoc: TokenLocation): Statement[] {
    const stmts: Statement[] = [];
    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.matchEnd(endKind)) {
        this.consumeEnd(endKind);
        this.skipToEndOfLine();
        return stmts;
      }
      const s = this.consumeLineAsOpaque();
      if (s !== null) stmts.push(s);
    }
    this.recordError(
      "unterminated-block",
      `Method body is missing 'End ${endKind === "sub" ? "Sub" : "Function"}'.`,
      startLoc,
    );
    return stmts;
  }

  // --------------------------------------------------------------------------
  // Delegate
  // --------------------------------------------------------------------------

  private parseDelegate(): DelegateDeclaration {
    const startLoc = this.peek().loc;
    this.consumeModifiers();
    this.advance(); // 'Delegate'
    const kindToken = this.advance(); // 'Sub' | 'Function'
    const isFunction = Parser.eq(kindToken, "function");
    const nameToken = this.expect("identifier", "<delegate-name>");
    const name = nameToken?.value ?? "";
    const typeParameters = this.parseOptionalTypeParameters();
    const parameters = this.parseParameterList();
    let returnType: TypeReference | undefined;
    if (isFunction && (this.consume("keyword", "as") || this.consume("identifier", "as"))) {
      const t = this.parseTypeReference();
      if (t !== null) returnType = t;
    }
    this.skipToEndOfLine();
    const decl: DelegateDeclaration = {
      kind: "DelegateDeclaration",
      name,
      typeParameters,
      parameters,
      loc: locOf(startLoc),
    };
    if (returnType !== undefined) decl.returnType = returnType;
    return decl;
  }

  // --------------------------------------------------------------------------
  // Property / Field
  // --------------------------------------------------------------------------

  private parseProperty(): PropertyDeclaration {
    const startLoc = this.peek().loc;
    this.consumeModifiers();
    this.advance(); // 'Property'
    const nameToken = this.expect("identifier", "<property-name>");
    const name = nameToken?.value ?? "";
    let type: TypeReference = emptyTypeReference();
    if (this.consume("keyword", "as") || this.consume("identifier", "as")) {
      const t = this.parseTypeReference();
      if (t !== null) type = t;
    }
    this.skipToEndOfLine();
    return { kind: "PropertyDeclaration", name, type, loc: locOf(startLoc) };
  }

  private parseField(): FieldDeclaration | null {
    const startLoc = this.peek().loc;
    this.consumeModifiers();
    const nameToken = this.consume("identifier");
    if (nameToken === null) {
      this.skipToEndOfLine();
      return null;
    }
    const name = nameToken.value;
    let type: TypeReference = emptyTypeReference();
    if (this.consume("keyword", "as") || this.consume("identifier", "as")) {
      const t = this.parseTypeReference();
      if (t !== null) type = t;
    }
    this.skipToEndOfLine();
    return { kind: "FieldDeclaration", name, type, loc: locOf(startLoc) };
  }

  // --------------------------------------------------------------------------
  // Type parameters / parameters / type references
  // --------------------------------------------------------------------------

  private parseOptionalTypeParameters(): TypeParameter[] {
    if (!this.match("punct", "<")) return [];
    this.advance();
    const params: TypeParameter[] = [];
    while (!this.match("punct", ">") && !this.isEOF()) {
      const nameToken = this.consume("identifier");
      if (nameToken === null) break;
      const tp: TypeParameter = { kind: "TypeParameter", name: nameToken.value };
      if (this.consume("keyword", "as") || this.consume("identifier", "as")) {
        const c = this.parseTypeReference();
        if (c !== null) tp.constraint = c;
      }
      params.push(tp);
      if (!this.consume("punct", ",")) break;
    }
    this.expect("punct", ">", { literal: true });
    return params;
  }

  private parseParameterList(): ParameterDeclaration[] {
    const params: ParameterDeclaration[] = [];
    if (!this.consume("punct", "(")) return params;
    while (!this.match("punct", ")") && !this.isEOF() && !this.match("newline")) {
      // Skip ByRef/ByVal/ReadOnly modifiers.
      let isByRef = false;
      let advanced = true;
      while (advanced) {
        advanced = false;
        if (this.consume("keyword", "byref") || this.consume("identifier", "byref")) {
          isByRef = true;
          advanced = true;
        } else if (this.consume("keyword", "byval") || this.consume("identifier", "byval")) {
          advanced = true;
        } else if (this.consume("keyword", "readonly") || this.consume("identifier", "readonly")) {
          advanced = true;
        }
      }
      const nameToken = this.consume("identifier");
      if (nameToken === null) break;
      let type: TypeReference = emptyTypeReference();
      if (this.consume("keyword", "as") || this.consume("identifier", "as")) {
        const t = this.parseTypeReference();
        if (t !== null) type = t;
      }
      const decl: ParameterDeclaration = {
        kind: "ParameterDeclaration",
        name: nameToken.value,
        type,
      };
      if (isByRef) decl.isByRef = true;
      params.push(decl);
      if (!this.consume("punct", ",")) break;
    }
    this.expect("punct", ")", { literal: true });
    return params;
  }

  /**
   * Parses a Type reference, supporting dotted names (`Forms.TForm`),
   * generic type arguments with arbitrary nesting (`TList<TList<Integer>>`),
   * and trailing primitive-array brackets (`T()`).
   */
  private parseTypeReference(): TypeReference | null {
    const head = this.peek();
    if (head.kind !== "identifier" && head.kind !== "keyword") {
      this.recordError(
        "invalid-type-reference",
        `Expected a type name, got '${head.value || head.kind}'.`,
        head.loc,
      );
      return null;
    }
    let name = this.advance().value;
    while (this.match("punct", ".")) {
      this.advance();
      const next = this.consume("identifier") ?? this.consume("keyword");
      if (next === null) break;
      name += "." + next.value;
    }
    const typeArguments: TypeReference[] = [];
    if (this.consume("punct", "<")) {
      while (!this.match("punct", ">") && !this.isEOF()) {
        const arg = this.parseTypeReference();
        if (arg !== null) typeArguments.push(arg);
        if (!this.consume("punct", ",")) break;
      }
      this.expect("punct", ">", { literal: true });
    }
    // Swallow `(...)` array marker without storing — the engine ignores it.
    if (this.consume("punct", "(")) this.expect("punct", ")", { literal: true });
    return { kind: "TypeReference", name, typeArguments, loc: locOf(head.loc) };
  }

  // --------------------------------------------------------------------------
  // Recovery helpers
  // --------------------------------------------------------------------------

  /**
   * Consumes every token on the current source line and emits a single
   * {@link OpaqueStatement} holding the verbatim text (sliced from
   * `sourceLines`). Used both for unparsable top-level lines and for
   * statements inside a method body.
   */
  private consumeLineAsOpaque(): OpaqueStatement | null {
    if (this.isEOF()) return null;
    const startLoc = this.peek().loc;
    const lineNo = startLoc.line;
    // Drain tokens belonging to this source line.
    while (!this.isEOF() && this.peek().kind !== "newline") {
      if (this.peek().loc.line !== lineNo) break;
      this.advance();
    }
    // Consume the trailing newline (if any).
    this.consume("newline");
    const text = this.sourceLines[lineNo - 1] ?? "";
    if (text.trim().length === 0) return null;
    return { kind: "OpaqueStatement", text, loc: locOf(startLoc) };
  }

  private consumeModifiers(): void {
    while (this.peekIsModifier(0)) this.advance();
  }

  private matchEnd(kind: string): boolean {
    return (
      (this.match("keyword", "end") || this.match("identifier", "end")) &&
      Parser.eq(this.peek(1), kind)
    );
  }

  private consumeEnd(kind: string): void {
    this.advance(); // 'End'
    const next = this.peek();
    if (Parser.eq(next, kind)) this.advance();
  }

  private skipToEndOfLine(): void {
    while (!this.isEOF() && this.peek().kind !== "newline") this.advance();
    this.consume("newline");
  }
}

// ============================================================================
// Constants + helpers
// ============================================================================

/**
 * Modifier keywords that can prefix a declaration. Maintained as a set
 * for O(1) lookup. Lower-case canonical form so callers use
 * `.toLowerCase()` once at the call site.
 */
const MODIFIER_KEYWORDS: ReadonlySet<string> = new Set([
  "public",
  "private",
  "protected",
  "shared",
  "overridable",
  "overrides",
  "readonly",
]);

function locOf(loc: TokenLocation): {
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
} {
  return {
    startLine: loc.line,
    startChar: loc.column,
    endLine: loc.line,
    endChar: loc.column,
  };
}

function emptyTypeReference(): TypeReference {
  return { kind: "TypeReference", name: "", typeArguments: [] };
}
