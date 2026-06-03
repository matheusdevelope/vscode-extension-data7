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
  IfStatement,
  ForStatement,
  ForEachStatement,
  WhileStatement,
  TryCatchStatement,
  UsingStatement,
  MatchStatement,
  ReturnStatement,
  WithStatement,
  Expression,
  Identifier,
  VariableDeclaration,
} from "../generics-monomorphizer/ast";
import { tokenize } from "./lexer";
import { makeError, type ParseError, type ParseErrorCode } from "./parser-errors";
import type { Token, TokenLocation } from "./token-types";

export interface ParseResult {
  readonly unit: CompilationUnit;
  readonly errors: readonly ParseError[];
}

enum Precedence {
  None = 0,
  Assignment = 1,
  Ternary = 2,
  NullCoalescing = 3,
  Logical = 4,
  Comparison = 5,
  Pipe = 6,
  Concatenation = 7,
  Term = 8,
  Factor = 9,
  Unary = 10,
  OptionalChain = 11,
  Call = 12,
  Primary = 13,
}

const PRECEDENCES: Record<string, number> = {
  or: Precedence.Logical,
  and: Precedence.Logical,
  xor: Precedence.Logical,
  andalso: Precedence.Logical,
  orelse: Precedence.Logical,
  is: Precedence.Comparison, // <-- Adicionado
  not: Precedence.Comparison, // <-- Adicionado
  mod: Precedence.Factor, // <-- Adicionado (Mod é como operador de fator/resto)
  "=": Precedence.Comparison,
  "<>": Precedence.Comparison,
  "<": Precedence.Comparison,
  ">": Precedence.Comparison,
  "<=": Precedence.Comparison,
  ">=": Precedence.Comparison,
  "..": Precedence.Comparison,
  "&": Precedence.Concatenation,
  "+": Precedence.Term,
  "-": Precedence.Term,
  "*": Precedence.Factor,
  "/": Precedence.Factor,
  "??": Precedence.NullCoalescing,
  "|>": Precedence.Pipe,
  "?": Precedence.Ternary,
};

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

export function parseExpr(source: string): Expression {
  const tokens = tokenize(source);
  const parser = new Parser(tokens, [source]);
  return parser.parseExpression();
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
      // Parse `Dim` and `Const` at the top-level so that their
      // initializers pass through the AST sugar transformer
      // (ternary, null-coalescing, interpolation). Without this,
      // code in `Principal.bas` outside any Namespace block falls
      // through to `consumeLineAsOpaque()` and sugar is never
      // rewritten.
      if (v === "dim" || v === "const") {
        // Consume any leading modifiers before the Dim/Const keyword.
        this.parseModifiers();
        return this.parseLocalVariableDeclaration();
      }
    }

    // Anything else at top level becomes an opaque line. This includes
    // comments-only lines and assignments.
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
    this.parseModifiers();
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
    const modifiers = this.parseModifiers();
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
    this.skipNewlines();
    if (this.match("keyword", "Inherits") || this.match("identifier", "Inherits")) {
      this.advance();
      const parsed = this.parseTypeReference();
      if (parsed !== null) baseType = parsed;
      this.skipToEndOfLine();
    }

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
          modifiers,
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
      modifiers,
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
    const modifiers = this.parseModifiers();
    const head = this.advance(); // 'Sub' | 'Function'
    const isFunction = Parser.eq(head, "function");
    // 'New' is a keyword token (not an identifier), but it is a valid
    // method name in Data7 Basic (constructor). Accept either kind.
    const nameToken = this.consume("identifier") ?? this.consume("keyword", "new");
    if (!nameToken) {
      this.recordError(
        "expected-token",
        `Expected '<method-name>', got '${this.peek().value || this.peek().kind}'.`,
        this.peek().loc,
      );
    }
    const name = nameToken?.value ?? "";
    const isConstructor = name.toLowerCase() === "new";
    const typeParameters = this.parseOptionalTypeParameters();
    const { params: parameters, hasParentheses } = this.parseParameterList();
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
      modifiers,
      noParentheses: !hasParentheses,
    };
    if (isConstructor) decl.isConstructor = true;
    if (returnType !== undefined) decl.returnType = returnType;
    return decl;
  }

  // Substitua a função parseMethodBody original por esta:
  private parseMethodBody(
    endKind: "sub" | "function" | "get" | "set",
    startLoc: TokenLocation,
  ): Statement[] {
    const stmts: Statement[] = [];
    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.matchEnd(endKind)) {
        this.consumeEnd(endKind);
        this.skipToEndOfLine();
        return stmts;
      }
      const s = this.parseStatement();
      if (s !== null) stmts.push(s);
      this.skipStatementSeparator();
    }
    const endLabel =
      endKind === "sub"
        ? "Sub"
        : endKind === "function"
          ? "Function"
          : endKind === "get"
            ? "Get"
            : "Set";
    this.recordError("unterminated-block", `Method body is missing 'End ${endLabel}'.`, startLoc);
    return stmts;
  }

  // private parseMethodBody(endKind: "sub" | "function", startLoc: TokenLocation): Statement[] {
  //   const stmts: Statement[] = [];
  //   while (!this.isEOF()) {
  //     this.skipNewlines();
  //     if (this.matchEnd(endKind)) {
  //       this.consumeEnd(endKind);
  //       this.skipToEndOfLine();
  //       return stmts;
  //     }
  //     const s = this.parseStatement();
  //     if (s !== null) stmts.push(s);
  //     this.skipStatementSeparator();
  //   }
  //   this.recordError(
  //     "unterminated-block",
  //     `Method body is missing 'End ${endKind === "sub" ? "Sub" : "Function"}'.`,
  //     startLoc,
  //   );
  //   return stmts;
  // }

  private skipStatementSeparator(): void {
    while (this.consume("punct", ":")) {
      // Allow colons
    }
    this.skipNewlines();
  }

  private parseStatement(): Statement | null {
    const startLoc = this.peek().loc;
    if (this.peek().kind === "comment") {
      const commentToken = this.advance();
      this.consume("newline");
      return {
        kind: "OpaqueStatement",
        text: commentToken.value,
        loc: locOf(startLoc),
      };
    }
    if (
      this.match("keyword", "dim") ||
      this.match("identifier", "dim") ||
      this.match("keyword", "const") ||
      this.match("identifier", "const")
    ) {
      return this.parseLocalVariableDeclaration();
    }
    if (this.match("keyword", "if") || this.match("identifier", "if")) {
      return this.parseIfStatement();
    }
    if (this.match("keyword", "for") || this.match("identifier", "for")) {
      return this.parseForOrForEachStatement();
    }
    if (this.match("keyword", "while") || this.match("identifier", "while")) {
      return this.parseWhileStatement();
    }
    if (this.match("keyword", "do") || this.match("identifier", "do")) {
      return this.parseDoLoopStatement();
    }
    if (this.match("keyword", "try") || this.match("identifier", "try")) {
      return this.parseTryCatchStatement();
    }
    if (this.match("keyword", "using") || this.match("identifier", "using")) {
      return this.parseUsingStatement();
    }
    if (this.match("keyword", "match") || this.match("identifier", "match")) {
      return this.parseMatchStatement();
    }
    if (this.match("keyword", "return") || this.match("identifier", "return")) {
      return this.parseReturnStatement();
    }
    if (this.match("keyword", "with") || this.match("identifier", "with")) {
      return this.parseWithStatement();
    }
    return this.parseAssignmentOrExpressionStatement();
  }

  private parseLocalVariableDeclaration(): VariableDeclaration {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'Dim'
    const nameToken = this.expect("identifier", "<variable-name>");
    const name = nameToken?.value ?? "";
    let type: TypeReference | undefined;
    if (this.consume("keyword", "as") || this.consume("identifier", "as")) {
      this.consume("keyword", "new");
      this.consume("identifier", "new");
      const t = this.parseTypeReference();
      if (t !== null) type = t;
    }
    let initializer: Expression | undefined;
    if (this.consume("punct", "=")) {
      initializer = this.parseExpression();
    }
    const comment = this.skipToEndOfLine();
    return {
      kind: "VariableDeclaration",
      name,
      type,
      initializer,
      loc: locOf(startLoc),
      comment,
    };
  }

  private parseIfStatement(): IfStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'If'
    const condition = this.parseExpression();
    this.expect("keyword", "then", { literal: true });

    const nextToken = this.peek();
    const isSingleLine =
      nextToken.loc.line === startLoc.line &&
      nextToken.kind !== "newline" &&
      nextToken.kind !== "eof";

    const thenBranch: Statement[] = [];
    const elseIfBranches: { condition: Expression; body: Statement[] }[] = [];
    let elseBranch: Statement[] | undefined;

    if (isSingleLine) {
      while (this.peek().loc.line === startLoc.line && !this.isEOF()) {
        const token = this.peek();
        if ((token.kind === "keyword" || token.kind === "identifier") && Parser.eq(token, "else")) {
          break;
        }
        if (token.kind === "punct" && token.value === ":") {
          this.advance();
          continue;
        }
        if (token.kind === "newline") {
          break;
        }
        const s = this.parseStatement();
        if (s !== null) thenBranch.push(s);
      }

      const next = this.peek();
      if (
        next.loc.line === startLoc.line &&
        (next.kind === "keyword" || next.kind === "identifier") &&
        Parser.eq(next, "else")
      ) {
        this.advance(); // consume 'Else'
        elseBranch = [];
        while (this.peek().loc.line === startLoc.line && !this.isEOF()) {
          const token = this.peek();
          if (token.kind === "punct" && token.value === ":") {
            this.advance();
            continue;
          }
          if (token.kind === "newline") {
            break;
          }
          const s = this.parseStatement();
          if (s !== null) elseBranch.push(s);
        }
      }

      this.skipToEndOfLine();
      return {
        kind: "IfStatement",
        condition,
        thenBranch,
        elseIfBranches: [],
        elseBranch,
        loc: locOf(startLoc),
        singleLine: true,
      };
    }

    this.skipToEndOfLine();

    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.matchEnd("if")) {
        this.consumeEnd("if");
        this.skipToEndOfLine();
        break;
      }

      const head = this.peek();
      if ((head.kind === "keyword" || head.kind === "identifier") && Parser.eq(head, "elseif")) {
        this.advance(); // consume 'ElseIf'
        const elseIfCond = this.parseExpression();
        this.expect("keyword", "then", { literal: true });
        this.skipToEndOfLine();
        const elseIfBody: Statement[] = [];
        while (!this.isEOF()) {
          this.skipNewlines();
          if (this.peekIsElseIfOrElseOrEndIf()) break;
          const s = this.parseStatement();
          if (s !== null) elseIfBody.push(s);
          this.skipStatementSeparator();
        }
        elseIfBranches.push({ condition: elseIfCond, body: elseIfBody });
        continue;
      }

      if ((head.kind === "keyword" || head.kind === "identifier") && Parser.eq(head, "else")) {
        this.advance(); // consume 'Else'
        this.skipToEndOfLine();
        elseBranch = [];
        while (!this.isEOF()) {
          this.skipNewlines();
          if (this.matchEnd("if")) break;
          const s = this.parseStatement();
          if (s !== null) elseBranch.push(s);
          this.skipStatementSeparator();
        }
        continue;
      }

      const s = this.parseStatement();
      if (s !== null) thenBranch.push(s);
      this.skipStatementSeparator();
    }

    return {
      kind: "IfStatement",
      condition,
      thenBranch,
      elseIfBranches,
      elseBranch,
      loc: locOf(startLoc),
    };
  }

  private peekIsElseIfOrElseOrEndIf(): boolean {
    const head = this.peek();
    if (head.kind !== "keyword" && head.kind !== "identifier") return false;
    const val = head.value.toLowerCase();
    if (val === "elseif" || val === "else") return true;
    if (val === "end" && Parser.eq(this.peek(1), "if")) return true;
    return false;
  }

  private parseForOrForEachStatement(): ForStatement | ForEachStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'For'

    const nextToken = this.peek();
    if (
      (nextToken.kind === "keyword" || nextToken.kind === "identifier") &&
      Parser.eq(nextToken, "each")
    ) {
      this.advance(); // consume 'Each'
      const elementVarToken = this.expect("identifier", "<loop-variable>");
      const elementVar: Identifier = {
        kind: "Identifier",
        name: elementVarToken?.value ?? "",
        loc: locOf(elementVarToken?.loc ?? startLoc),
      };
      let elementType: TypeReference | undefined;
      if (this.consume("keyword", "as") || this.consume("identifier", "as")) {
        elementType = this.parseTypeReference() ?? undefined;
      }
      this.expect("keyword", "in", { literal: true });
      const enumerable = this.parseExpression();
      const comment = this.skipToEndOfLine();

      const body: Statement[] = [];
      while (!this.isEOF()) {
        this.skipNewlines();
        if (this.matchEnd("for") || this.matchNext()) {
          this.consumeNext();
          this.skipToEndOfLine();
          break;
        }
        const s = this.parseStatement();
        if (s !== null) body.push(s);
        this.skipStatementSeparator();
      }

      return {
        kind: "ForEachStatement",
        elementVar,
        elementType,
        enumerable,
        body,
        loc: locOf(startLoc),
        comment,
      };
    } else {
      const counterToken = this.expect("identifier", "<loop-variable>");
      const counter: Identifier = {
        kind: "Identifier",
        name: counterToken?.value ?? "",
        loc: locOf(counterToken?.loc ?? startLoc),
      };
      this.expect("punct", "=", { literal: true });
      const start = this.parseExpression();
      this.expect("keyword", "to", { literal: true });
      const end = this.parseExpression();
      let step: Expression | undefined;
      if (this.consume("keyword", "step") || this.consume("identifier", "step")) {
        step = this.parseExpression();
      }
      const comment = this.skipToEndOfLine();

      const body: Statement[] = [];
      while (!this.isEOF()) {
        this.skipNewlines();
        if (this.matchEnd("for") || this.matchNext()) {
          this.consumeNext();
          this.skipToEndOfLine();
          break;
        }
        const s = this.parseStatement();
        if (s !== null) body.push(s);
        this.skipStatementSeparator();
      }

      return {
        kind: "ForStatement",
        counter,
        start,
        end,
        step,
        body,
        loc: locOf(startLoc),
        comment,
      };
    }
  }

  private matchNext(): boolean {
    return this.match("keyword", "next") || this.match("identifier", "next");
  }

  private consumeNext(): void {
    this.advance(); // consume 'Next'
    if (this.peek().kind === "identifier") {
      this.advance();
    }
  }

  private parseWhileStatement(): WhileStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'While'
    const condition = this.parseExpression();
    this.skipToEndOfLine();

    const body: Statement[] = [];
    while (!this.isEOF()) {
      this.skipNewlines();
      if (
        this.matchEnd("while") ||
        this.match("keyword", "wend") ||
        this.match("identifier", "wend")
      ) {
        if (this.matchEnd("while")) {
          this.consumeEnd("while");
        } else {
          this.advance(); // consume 'Wend'
        }
        this.skipToEndOfLine();
        break;
      }
      const s = this.parseStatement();
      if (s !== null) body.push(s);
      this.skipStatementSeparator();
    }

    return {
      kind: "WhileStatement",
      condition,
      body,
      loc: locOf(startLoc),
    };
  }

  private parseDoLoopStatement(): WhileStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'Do'

    let condition: Expression | undefined;
    let isUntil = false;
    const nextToken = this.peek();
    if (
      (nextToken.kind === "keyword" || nextToken.kind === "identifier") &&
      (Parser.eq(nextToken, "while") || Parser.eq(nextToken, "until"))
    ) {
      isUntil = Parser.eq(nextToken, "until");
      this.advance();
      condition = this.parseExpression();
    }
    this.skipToEndOfLine();

    const body: Statement[] = [];
    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.match("keyword", "loop") || this.match("identifier", "loop")) {
        this.advance(); // consume 'Loop'
        const tailToken = this.peek();
        if (
          (tailToken.kind === "keyword" || tailToken.kind === "identifier") &&
          (Parser.eq(tailToken, "while") || Parser.eq(tailToken, "until"))
        ) {
          isUntil = Parser.eq(tailToken, "until");
          this.advance();
          condition = this.parseExpression();
        }
        this.skipToEndOfLine();
        break;
      }
      const s = this.parseStatement();
      if (s !== null) body.push(s);
      this.skipStatementSeparator();
    }

    let finalCondition = condition ?? { kind: "Literal", value: true, loc: locOf(startLoc) };
    if (isUntil) {
      finalCondition = {
        kind: "UnaryExpression",
        operator: "Not",
        argument: finalCondition,
        loc: finalCondition.loc,
      };
    }

    return {
      kind: "WhileStatement",
      condition: finalCondition,
      body,
      loc: locOf(startLoc),
    };
  }

  private parseTryCatchStatement(): TryCatchStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'Try'
    this.skipToEndOfLine();

    const tryBody: Statement[] = [];
    let catchVar: Identifier | undefined;
    let catchType: TypeReference | undefined;
    const catchBody: Statement[] = [];
    let finallyBody: Statement[] | undefined;
    let currentBlock: "try" | "catch" | "finally" = "try";

    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.matchEnd("try")) {
        this.consumeEnd("try");
        this.skipToEndOfLine();
        break;
      }

      const head = this.peek();
      if ((head.kind === "keyword" || head.kind === "identifier") && Parser.eq(head, "catch")) {
        this.advance(); // consume 'Catch'
        currentBlock = "catch";
        if (this.peek().kind === "identifier") {
          const varToken = this.advance();
          catchVar = {
            kind: "Identifier",
            name: varToken.value,
            loc: locOf(varToken.loc),
          };
          if (this.consume("keyword", "as") || this.consume("identifier", "as")) {
            catchType = this.parseTypeReference() ?? undefined;
          }
        }
        this.skipToEndOfLine();
        continue;
      }

      if ((head.kind === "keyword" || head.kind === "identifier") && Parser.eq(head, "finally")) {
        this.advance(); // consume 'Finally'
        currentBlock = "finally";
        finallyBody = [];
        this.skipToEndOfLine();
        continue;
      }

      const s = this.parseStatement();
      if (s !== null) {
        if (currentBlock === "try") tryBody.push(s);
        else if (currentBlock === "catch") catchBody.push(s);
        else if (finallyBody) finallyBody.push(s);
      }
      this.skipStatementSeparator();
    }

    return {
      kind: "TryCatchStatement",
      tryBody,
      catchVar,
      catchType,
      catchBody,
      finallyBody,
      loc: locOf(startLoc),
    };
  }

  private parseUsingStatement(): UsingStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'Using'
    const resourceVarToken = this.expect("identifier", "<resource-variable>");
    const resourceVar: Identifier = {
      kind: "Identifier",
      name: resourceVarToken?.value ?? "",
      loc: locOf(resourceVarToken?.loc ?? startLoc),
    };
    this.expect("keyword", "as", { literal: true });
    this.consume("keyword", "new");
    this.consume("identifier", "new");
    const resourceType = this.parseTypeReference() ?? {
      kind: "TypeReference",
      name: "",
      typeArguments: [],
      loc: locOf(startLoc),
    };
    const resourceArgs: Expression[] = [];
    if (this.consume("punct", "(")) {
      while (!this.match("punct", ")") && !this.isEOF()) {
        resourceArgs.push(this.parseExpression());
        if (!this.consume("punct", ",")) break;
      }
      this.expect("punct", ")", { literal: true });
    }
    this.skipToEndOfLine();

    const body: Statement[] = [];
    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.matchEnd("using")) {
        this.consumeEnd("using");
        this.skipToEndOfLine();
        break;
      }
      const s = this.parseStatement();
      if (s !== null) body.push(s);
      this.skipStatementSeparator();
    }

    return {
      kind: "UsingStatement",
      resourceVar,
      resourceType,
      resourceArgs,
      body,
      loc: locOf(startLoc),
    };
  }

  private parseMatchStatement(): MatchStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'Match'
    const subject = this.parseExpression();
    this.skipToEndOfLine();

    const cases: { typeName?: string; isElse: boolean; body: Statement[] }[] = [];
    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.matchEnd("match")) {
        this.consumeEnd("match");
        this.skipToEndOfLine();
        break;
      }

      const head = this.peek();
      if ((head.kind === "keyword" || head.kind === "identifier") && Parser.eq(head, "case")) {
        this.advance(); // consume 'Case'
        const next = this.peek();
        let typeName: string | undefined;
        let isElse = false;

        if ((next.kind === "keyword" || next.kind === "identifier") && Parser.eq(next, "is")) {
          this.advance(); // consume 'Is'
          const typeRef = this.parseTypeReference();
          typeName = typeRef ? typeRef.name : undefined;
        } else if (
          (next.kind === "keyword" || next.kind === "identifier") &&
          Parser.eq(next, "else")
        ) {
          this.advance(); // consume 'Else'
          isElse = true;
        }

        this.expect("punct", ":", { literal: true });

        const caseBody: Statement[] = [];
        while (!this.isEOF()) {
          this.skipNewlines();
          const nextHead = this.peek();
          if (
            (nextHead.kind === "keyword" || nextHead.kind === "identifier") &&
            (Parser.eq(nextHead, "case") ||
              (Parser.eq(nextHead, "end") && Parser.eq(this.peek(1), "match")))
          ) {
            break;
          }
          const s = this.parseStatement();
          if (s !== null) caseBody.push(s);
          this.skipStatementSeparator();
        }
        cases.push({ typeName, isElse, body: caseBody });
        continue;
      }
      this.advance();
    }

    return {
      kind: "MatchStatement",
      subject,
      cases,
      loc: locOf(startLoc),
    };
  }

  private parseReturnStatement(): ReturnStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'Return'
    let expression: Expression | undefined;

    const next = this.peek();
    if (
      next.kind !== "newline" &&
      next.kind !== "eof" &&
      next.value !== ":" &&
      !(next.kind === "keyword" && Parser.eq(next, "end"))
    ) {
      if ((next.kind === "keyword" || next.kind === "identifier") && Parser.eq(next, "if")) {
        this.advance(); // consume 'If'
        const condition = this.parseExpression();
        this.expect("keyword", "then", { literal: true });
        const trueExpr = this.parseExpression();
        this.expect("keyword", "else", { literal: true });
        const falseExpr = this.parseExpression();
        expression = {
          kind: "TernaryExpression",
          condition,
          trueExpr,
          falseExpr,
          loc: locOf(startLoc),
        };
      } else {
        expression = this.parseExpression();
      }
    }

    return {
      kind: "ReturnStatement",
      expression,
      loc: locOf(startLoc),
    };
  }

  private parseWithStatement(): WithStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'With'
    const expression = this.parseExpression();
    this.skipToEndOfLine();

    const body: Statement[] = [];
    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.matchEnd("with")) {
        this.consumeEnd("with");
        this.skipToEndOfLine();
        break;
      }
      const s = this.parseStatement();
      if (s !== null) body.push(s);
      this.skipStatementSeparator();
    }

    return {
      kind: "WithStatement",
      expression,
      body,
      loc: locOf(startLoc),
    };
  }

  private parseAssignmentOrExpressionStatement(): Statement {
    const startLoc = this.peek().loc;
    let left = this.parseExpression(Precedence.Comparison);
    const next = this.peek();
    if (
      next.kind === "punct" &&
      (next.value === "=" || next.value === "??=" || next.value === "||=" || next.value === "&&=")
    ) {
      const op = this.advance().value;
      const right = this.parseExpression();
      return {
        kind: "Assignment",
        target: left,
        value: right,
        operator: op,
        loc: locOf(startLoc),
      };
    }

    if (
      (left.kind === "Identifier" || left.kind === "MemberAccess") &&
      next.kind !== "newline" &&
      next.kind !== "eof" &&
      next.value !== ":" &&
      next.value !== ","
    ) {
      const args: Expression[] = [];
      while (!this.isEOF() && this.peek().kind !== "newline" && this.peek().value !== ":") {
        args.push(this.parseExpression());
        if (!this.consume("punct", ",")) {
          break;
        }
      }
      if (left.kind === "MemberAccess") {
        left = {
          kind: "MethodInvocation",
          callee: left.target,
          methodName: left.member,
          typeArguments: [],
          arguments: args,
          loc: left.loc,
          noParentheses: true,
        };
      } else {
        left = {
          kind: "MethodInvocation",
          methodName: left.name,
          typeArguments: [],
          arguments: args,
          loc: left.loc,
          noParentheses: true,
        };
      }
    } else {
      left = this.parseExpressionWithLeft(left, Precedence.None);
    }

    return {
      kind: "ExpressionStatement",
      expression: left,
      loc: locOf(startLoc),
    };
  }

  private getPrecedence(token: Token): Precedence {
    if (token.kind === "punct" && token.value === "(") {
      return Precedence.Call;
    }
    if (token.kind === "punct" && token.value === ".") {
      return Precedence.Call;
    }
    if (token.kind === "punct" && token.value === "?.") {
      return Precedence.OptionalChain;
    }
    if (token.kind === "keyword" || token.kind === "identifier" || token.kind === "punct") {
      return PRECEDENCES[token.value.toLowerCase()] ?? Precedence.None;
    }
    return Precedence.None;
  }

  public parseExpressionWithLeft(left: Expression, precedence = Precedence.None): Expression {
    let currentLeft = left;
    while (precedence < this.getPrecedence(this.peek())) {
      const next = this.peek();
      const updatedLeft = this.parseInfix(currentLeft, next);
      if (updatedLeft === null) break;
      currentLeft = updatedLeft;
    }
    return currentLeft;
  }

  public parseExpression(precedence = Precedence.None): Expression {
    const left = this.parsePrefix();
    if (left === null) {
      const errLoc = this.peek().loc;
      this.recordError(
        "expected-token",
        `Expected an expression, got '${this.peek().value || this.peek().kind}'.`,
        errLoc,
      );
      this.advance(); // Advance past the unexpected token to prevent infinite loop
      return { kind: "Identifier", name: "", loc: locOf(errLoc) };
    }

    return this.parseExpressionWithLeft(left, precedence);
  }

  private parsePrefix(): Expression | null {
    const token = this.peek();
    if (token.kind === "number") {
      this.advance();
      const val = token.value.includes(".") ? parseFloat(token.value) : parseInt(token.value);
      return { kind: "Literal", value: isNaN(val) ? token.value : val, loc: locOf(token.loc) };
    }
    if (token.kind === "string") {
      const strToken = this.advance();
      if (strToken.prefix === "$") {
        return {
          kind: "TaggedTemplateExpression",
          tag: "",
          body: strToken.value,
          loc: locOf(strToken.loc),
        };
      }
      return { kind: "Literal", value: strToken.value, loc: locOf(strToken.loc) };
    }
    if (token.kind === "identifier" || token.kind === "keyword") {
      const lower = token.value.toLowerCase();
      const nextToken = this.peek(1);
      if (nextToken.kind === "string" && nextToken.prefix === "$") {
        const tag = this.advance().value;
        const bodyToken = this.advance();
        return {
          kind: "TaggedTemplateExpression",
          tag,
          body: bodyToken.value,
          loc: locOf(token.loc),
        };
      }
      if (lower === "true") {
        this.advance();
        return { kind: "Literal", value: true, loc: locOf(token.loc) };
      }
      if (lower === "false") {
        this.advance();
        return { kind: "Literal", value: false, loc: locOf(token.loc) };
      }
      if (lower === "null" || lower === "nothing") {
        this.advance();
        return { kind: "Literal", value: null, loc: locOf(token.loc) };
      }
      if (lower === "not" || token.value === "!") {
        this.advance();
        const arg = this.parseExpression(Precedence.Unary);
        return { kind: "UnaryExpression", operator: "Not", argument: arg, loc: locOf(token.loc) };
      }
      if (lower === "new") {
        this.advance();
        const typeRef = this.parseTypeReference(false) ?? {
          kind: "TypeReference",
          name: "",
          typeArguments: [],
          loc: locOf(token.loc),
        };
        const args: Expression[] = [];
        this.expect("punct", "(", { literal: true });
        while (!this.match("punct", ")") && !this.isEOF()) {
          args.push(this.parseExpression());
          if (!this.consume("punct", ",")) break;
        }
        this.expect("punct", ")", { literal: true });
        return {
          kind: "ObjectCreationExpression",
          type: typeRef,
          arguments: args,
          loc: locOf(token.loc),
        };
      }
      this.advance();
      return { kind: "Identifier", name: token.value, loc: locOf(token.loc) };
    }
    if (token.kind === "punct" && token.value === "-") {
      this.advance();
      const arg = this.parseExpression(Precedence.Unary);
      return { kind: "UnaryExpression", operator: "-", argument: arg, loc: locOf(token.loc) };
    }
    if (token.kind === "punct" && token.value === "(") {
      this.advance();
      const expr = this.parseExpression();
      this.expect("punct", ")", { literal: true });
      expr.parenthesized = true;
      return expr;
    }
    if (token.kind === "punct" && token.value === ".") {
      this.advance();
      // Member names can be keywords in some contexts (e.g., `MyBase.New()`).
      const memberToken = this.consume("identifier") ?? this.consume("keyword");
      if (!memberToken) {
        this.recordError(
          "expected-token",
          `Expected '<member-name>', got '${this.peek().value || this.peek().kind}'.`,
          this.peek().loc,
        );
      }
      const member = memberToken?.value ?? "";
      return {
        kind: "MemberAccess",
        target: { kind: "Identifier", name: "", loc: locOf(token.loc) },
        member,
        loc: locOf(token.loc),
      };
    }
    return null;
  }

  private parseInfix(left: Expression, token: Token): Expression | null {
    if (token.kind === "punct" && token.value === "(") {
      this.advance();
      const args: Expression[] = [];
      while (!this.match("punct", ")") && !this.isEOF()) {
        args.push(this.parseExpression());
        if (!this.consume("punct", ",")) break;
      }
      this.expect("punct", ")", { literal: true });
      if (left.kind === "MemberAccess") {
        return {
          kind: "MethodInvocation",
          callee: left.target,
          methodName: left.member,
          typeArguments: [],
          arguments: args,
          loc: left.loc,
        };
      }
      if (left.kind === "Identifier") {
        return {
          kind: "MethodInvocation",
          methodName: left.name,
          typeArguments: [],
          arguments: args,
          loc: left.loc,
        };
      }
      return {
        kind: "MethodInvocation",
        callee: left,
        methodName: "",
        typeArguments: [],
        arguments: args,
        loc: left.loc,
      };
    }
    if (token.kind === "punct" && token.value === ".") {
      this.advance();
      // Member names can be keywords in some contexts (e.g., `MyBase.New()`).
      const memberToken = this.consume("identifier") ?? this.consume("keyword");
      if (!memberToken) {
        this.recordError(
          "expected-token",
          `Expected '<member-name>', got '${this.peek().value || this.peek().kind}'.`,
          this.peek().loc,
        );
      }
      const member = memberToken?.value ?? "";
      const typeArguments: TypeReference[] = [];
      if (this.consume("punct", "<")) {
        while (!this.match("punct", ">") && !this.isEOF()) {
          const tRef = this.parseTypeReference();
          if (tRef) typeArguments.push(tRef);
          if (!this.consume("punct", ",")) break;
        }
        this.expect("punct", ">", { literal: true });
      }
      if (typeArguments.length > 0) {
        return {
          kind: "MethodInvocation",
          callee: left,
          methodName: member,
          typeArguments,
          arguments: [],
          loc: left.loc,
        };
      }
      return {
        kind: "MemberAccess",
        target: left,
        member,
        loc: left.loc,
      };
    }
    if (token.kind === "punct" && token.value === "?.") {
      this.advance();
      // Member names can be keywords in some contexts (e.g., `MyBase.New()`).\n
      const memberToken = this.consume("identifier") ?? this.consume("keyword");
      if (!memberToken) {
        this.recordError(
          "expected-token",
          `Expected '<member-name>', got '${this.peek().value || this.peek().kind}'.`,
          this.peek().loc,
        );
      }
      const member = memberToken?.value ?? "";
      let memberExpr: Expression;
      if (this.match("punct", "(")) {
        this.advance();
        const args: Expression[] = [];
        while (!this.match("punct", ")") && !this.isEOF()) {
          args.push(this.parseExpression());
          if (!this.consume("punct", ",")) break;
        }
        this.expect("punct", ")", { literal: true });
        memberExpr = {
          kind: "MethodInvocation",
          methodName: member,
          typeArguments: [],
          arguments: args,
          loc: locOf(memberToken?.loc ?? token.loc),
        };
      } else {
        memberExpr = {
          kind: "MemberAccess",
          target: { kind: "Identifier", name: "", loc: left.loc },
          member,
          loc: locOf(memberToken?.loc ?? token.loc),
        };
      }
      return {
        kind: "OptionalChainingExpression",
        target: left,
        member: memberExpr,
        loc: left.loc,
      };
    }
    if (token.kind === "punct" && token.value === "?") {
      this.advance();
      const trueExpr = this.parseExpression();
      this.expect("punct", ":", { literal: true });
      const falseExpr = this.parseExpression(Precedence.Ternary);
      return {
        kind: "TernaryExpression",
        condition: left,
        trueExpr,
        falseExpr,
        loc: left.loc,
      };
    }
    if (token.kind === "punct" && token.value === "??") {
      this.advance();
      const right = this.parseExpression(Precedence.NullCoalescing);
      return {
        kind: "NullCoalescingExpression",
        left,
        right,
        loc: left.loc,
      };
    }
    if (token.kind === "punct" && token.value === "|>") {
      this.advance();
      const right = this.parseExpression(Precedence.Pipe);
      return {
        kind: "PipeExpression",
        left,
        right,
        loc: left.loc,
      };
    }
    const lower = token.value.toLowerCase();
    const prec: Precedence = PRECEDENCES[lower] ?? Precedence.None;
    if (prec !== Precedence.None) {
      this.advance();
      const right = this.parseExpression(prec);
      return {
        kind: "BinaryExpression",
        left,
        operator: token.value,
        right,
        loc: left.loc,
      };
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Delegate
  // --------------------------------------------------------------------------

  private parseDelegate(): DelegateDeclaration {
    const startLoc = this.peek().loc;
    const modifiers = this.parseModifiers();
    this.advance(); // 'Delegate'
    const kindToken = this.advance(); // 'Sub' | 'Function'
    const isFunction = Parser.eq(kindToken, "function");
    const nameToken = this.expect("identifier", "<delegate-name>");
    const name = nameToken?.value ?? "";
    const typeParameters = this.parseOptionalTypeParameters();
    const { params: parameters, hasParentheses } = this.parseParameterList();
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
      modifiers,
      noParentheses: !hasParentheses,
    };
    if (returnType !== undefined) decl.returnType = returnType;
    return decl;
  }

  // --------------------------------------------------------------------------
  // Property / Field
  // --------------------------------------------------------------------------

  // Substitua a função parseProperty original por esta:
  private parseProperty(): PropertyDeclaration {
    const startLoc = this.peek().loc;
    const modifiers = this.parseModifiers();
    this.advance(); // 'Property'
    const nameToken = this.expect("identifier", "<property-name>");
    const name = nameToken?.value ?? "";
    let type: TypeReference = emptyTypeReference();
    if (this.consume("keyword", "as") || this.consume("identifier", "as")) {
      const t = this.parseTypeReference();
      if (t !== null) type = t;
    }
    this.skipToEndOfLine();

    let getter: MethodDeclaration | undefined;
    let setter: MethodDeclaration | undefined;

    // Faz o lookahead para verificar se a property possui um bloco
    let lookahead = 0;
    let nextToken = this.peek(lookahead);
    while (
      nextToken.kind === "newline" ||
      nextToken.kind === "comment" ||
      this.peekIsModifier(lookahead)
    ) {
      lookahead++;
      nextToken = this.peek(lookahead);
    }

    let hasBlock = false;
    if (nextToken.kind === "identifier" || nextToken.kind === "keyword") {
      const v = nextToken.value.toLowerCase();
      if (v === "get" || v === "set") {
        hasBlock = true;
      } else if (v === "end" && Parser.eq(this.peek(lookahead + 1), "property")) {
        hasBlock = true;
      }
    }

    if (hasBlock) {
      while (!this.isEOF()) {
        this.skipNewlines();
        if (this.matchEnd("property")) {
          this.consumeEnd("property");
          this.skipToEndOfLine();
          break;
        }

        const getSetModifiers = this.parseModifiers();
        const head = this.peek();
        if (head.kind === "identifier" || head.kind === "keyword") {
          const v = head.value.toLowerCase();
          if (v === "get") {
            const getStartLoc = head.loc;
            this.advance(); // consume Get
            this.skipToEndOfLine();
            const body = this.parseMethodBody("get", getStartLoc);
            getter = {
              kind: "MethodDeclaration",
              name: "Get",
              typeParameters: [],
              parameters: [],
              body,
              loc: locOf(getStartLoc),
              modifiers: getSetModifiers,
              noParentheses: true,
            };
            continue;
          } else if (v === "set") {
            const setStartLoc = head.loc;
            this.advance(); // consume Set
            const { params, hasParentheses } = this.parseParameterList();
            this.skipToEndOfLine();
            const body = this.parseMethodBody("set", setStartLoc);
            setter = {
              kind: "MethodDeclaration",
              name: "Set",
              typeParameters: [],
              parameters: params,
              body,
              loc: locOf(setStartLoc),
              modifiers: getSetModifiers,
              noParentheses: !hasParentheses,
            };
            continue;
          }
        }

        //const s =
        this.parseStatement();
        this.skipStatementSeparator();
      }
    }

    // Fazemos um bypass/cast para `any` para evitar conflitos na interface AST se
    // os campos getter/setter não estiverem declarados na interface original
    const decl: PropertyDeclaration = {
      kind: "PropertyDeclaration",
      name,
      type,
      loc: locOf(startLoc),
      modifiers,
      getter: getter,
      setter: setter,
      hasBlock: hasBlock,
    };

    return decl;
  }

  // private parseProperty(): PropertyDeclaration {
  //   const startLoc = this.peek().loc;
  //   const modifiers = this.parseModifiers();
  //   this.advance(); // 'Property'
  //   const nameToken = this.expect("identifier", "<property-name>");
  //   const name = nameToken?.value ?? "";
  //   let type: TypeReference = emptyTypeReference();
  //   if (this.consume("keyword", "as") || this.consume("identifier", "as")) {
  //     const t = this.parseTypeReference();
  //     if (t !== null) type = t;
  //   }
  //   this.skipToEndOfLine();
  //   return { kind: "PropertyDeclaration", name, type, loc: locOf(startLoc), modifiers };
  // }

  private parseField(): FieldDeclaration | null {
    const startLoc = this.peek().loc;
    const modifiers = this.parseModifiers();
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
    return { kind: "FieldDeclaration", name, type, loc: locOf(startLoc), modifiers };
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

  private parseParameterList(): { params: ParameterDeclaration[]; hasParentheses: boolean } {
    const params: ParameterDeclaration[] = [];
    if (!this.consume("punct", "(")) {
      return { params, hasParentheses: false };
    }
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
    return { params, hasParentheses: true };
  }

  /**
   * Parses a Type reference, supporting dotted names (`Forms.TForm`),
   * generic type arguments with arbitrary nesting (`TList<TList<Integer>>`),
   * and trailing primitive-array brackets (`T()`).
   */
  private parseTypeReference(swallowArrayMarker = true): TypeReference | null {
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
    // Swallow `()` array marker without storing — the engine ignores it.
    if (swallowArrayMarker && this.match("punct", "(")) {
      const next = this.peek(1);
      if (next.kind === "punct" && next.value === ")") {
        this.advance();
        this.advance();
      }
    }
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

  private parseModifiers(): string[] {
    const list: string[] = [];
    while (this.peekIsModifier(0)) {
      list.push(this.advance().value);
    }
    return list;
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

  private skipToEndOfLine(): string | undefined {
    let comment: string | undefined;
    while (!this.isEOF() && this.peek().kind !== "newline") {
      const t = this.advance();
      if (t.kind === "comment") {
        comment = t.value;
      }
    }
    this.consume("newline");
    return comment;
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
