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
 *  - Constraints (`T As TEnum`) are recognised but their right-hand
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
  ImportsDeclaration,
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
  ReturnStatement,
  ExitStatement,
  ThrowStatement,
  WithStatement,
  Expression,
  VariableDeclaration,
  SelectCaseStatement,
  SelectCaseBranch,
  ContinueStatement,
  EnumDeclaration,
  SourceLocation,
} from "../ast/ast";
import { tokenize } from "./lexer";
import { makeError, type ParseError, type ParseErrorCode } from "./parser-errors";
import type { Token, TokenLocation } from "./token-types";
import type { ParserPlugin } from "./plugin";
import { GenericsParserPlugin } from "./generics-plugin";
import { SugarEngine } from "../sugars/engine";
import { ALLOWED_NAME_KEYWORDS } from "../language/keywords";
import { parseNamespace } from "./declaration-parsers/namespace-parser";
import { parseClass } from "./declaration-parsers/class-parser";
import { parseMethod } from "./declaration-parsers/method-parser";
import { parseProperty } from "./declaration-parsers/property-parser";
import { parseField } from "./declaration-parsers/field-parser";
import { parseLocalVariableDeclarationAfterDim } from "./declaration-parsers/variable-parser";
import { parseDelegate } from "./declaration-parsers/delegate-parser";
import { parseImportsDeclaration } from "./declaration-parsers/imports-parser";
import { parseNativeEnumDeclaration } from "./declaration-parsers/enum-parser";
import { parseDeclareDeclaration } from "./declaration-parsers/declare-parser";
import {
  parseExpression as parseExpressionGrammar,
  parseExpressionWithLeft as parseExpressionWithLeftGrammar,
  parseInfix as parseInfixGrammar,
  parsePrefix as parsePrefixGrammar,
} from "./expression-parser";
import {
  parseDoLoopStatement,
  parseForOrForEachStatement,
  parseIfStatement,
  parseTryCatchStatement,
  parseWhileStatement,
} from "./statement-parsers";

export interface ParseResult {
  readonly unit: CompilationUnit;
  readonly errors: readonly ParseError[];
}

export enum Precedence {
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

export const PRECEDENCES: Record<string, number> = {
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
export interface ParseOptions {
  plugins?: ParserPlugin[];
  /**
   * Optional lossless fallback for syntax intentionally not handled by the
   * active parser plugins. Returning true keeps the full source line as an
   * `OpaqueStatement` instead of partially parsing and serializing it.
   */
  preserveLine?: (sourceLine: string) => boolean;
}

export function parse(source: string, options?: ParseOptions): ParseResult {
  const tokens = tokenize(source);
  const sourceLines = source.split(/\r?\n/);
  const plugins = options?.plugins ?? [
    ...new SugarEngine().createParserPlugins(),
    new GenericsParserPlugin(),
  ];
  const parser = new Parser(tokens, sourceLines, plugins, options?.preserveLine);
  const unit = parser.parseCompilationUnit();
  return { unit, errors: parser.errors };
}

export function parseExpr(source: string, options?: ParseOptions): Expression {
  const tokens = tokenize(source);
  const plugins = options?.plugins ?? [
    ...new SugarEngine().createParserPlugins(),
    new GenericsParserPlugin(),
  ];
  const parser = new Parser(tokens, [source], plugins);
  return parser.parseExpression();
}

// ============================================================================
// Parser internals
// ============================================================================

export class Parser {
  public pos = 0;
  public readonly errors: ParseError[] = [];

  constructor(
    public readonly tokens: readonly Token[],
    public readonly sourceLines: readonly string[],
    public readonly plugins: readonly ParserPlugin[] = [],
    private readonly preserveLine?: (sourceLine: string) => boolean,
  ) {}

  // --------------------------------------------------------------------------
  // Cursor helpers
  // --------------------------------------------------------------------------

  public peek(offset = 0): Token {
    const idx = this.pos + offset;
    const at = this.tokens[idx];
    if (at !== undefined) return at;
    // The lexer guarantees an `eof` token at the end, so once we walk
    // past the cursor we still get an EOF marker. Defensive fallback
    // keeps `noUncheckedIndexedAccess` happy.
    const last = this.tokens[this.tokens.length - 1];
    return last ?? { kind: "eof", value: "", loc: { line: 0, column: 0 } };
  }

  public isEOF(): boolean {
    return this.peek().kind === "eof";
  }

  public advance(): Token {
    const t = this.peek();
    if (t.kind !== "eof") this.pos++;
    return t;
  }

  /** Skips zero or more `newline` tokens. */
  public skipNewlines(): void {
    while (this.peek().kind === "newline") this.pos++;
  }

  /** Skips newline and whole-line comment trivia inside expression lists. */
  public skipExpressionTrivia(): void {
    let advanced = true;
    while (advanced) {
      advanced = false;
      while (this.peek().kind === "newline") {
        this.pos++;
        advanced = true;
      }
      if (this.peek().kind === "comment") {
        this.pos++;
        this.consume("newline");
        advanced = true;
      }
    }
  }

  /** Case-insensitive comparison of a keyword/identifier token's value. */
  public static eq(token: Token, name: string): boolean {
    return token.value.toLowerCase() === name.toLowerCase();
  }

  public eq(token: Token, name: string): boolean {
    return Parser.eq(token, name);
  }

  /**
   * Returns true if the current token matches `kind` and (when given)
   * `value` (case-insensitive). Does NOT consume the token.
   */
  public match(kind: Token["kind"], value?: string): boolean {
    const t = this.peek();
    if (t.kind !== kind) return false;
    if (value === undefined) return true;
    return Parser.eq(t, value);
  }

  /**
   * Consumes the current token if it matches. Returns the consumed
   * token on match, otherwise `null`.
   */
  public consume(kind: Token["kind"], value?: string): Token | null {
    if (this.match(kind, value)) return this.advance();
    return null;
  }

  public consumeNameToken(): Token | null {
    const next = this.peek();
    if (next.kind === "identifier") {
      return this.advance();
    }
    if (next.kind === "keyword") {
      const val = next.value.toLowerCase();
      if (ALLOWED_NAME_KEYWORDS.has(val)) {
        return this.advance();
      }
    }
    return null;
  }

  public expectNameToken(description: string): Token | null {
    const t = this.consumeNameToken();
    if (t) return t;
    const next = this.peek();
    this.recordError(
      "expected-token",
      `Expected '${description}', got '${next.value || next.kind}'.`,
      next.loc,
    );
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
  public expect(
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

  public recordError(code: ParseErrorCode, message: string, loc: TokenLocation): void {
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
      if (m !== null) {
        if (Array.isArray(m)) {
          members.push(...m);
        } else {
          members.push(m);
        }
      }
      this.skipNewlines();
    }
    return { kind: "CompilationUnit", members };
  }

  public parseTopLevelMember(): TopLevelMember | TopLevelMember[] | null {
    if (this.shouldPreserveCurrentLine()) return this.consumeLineAsOpaque();

    // Skip modifier prefixes that may precede a declaration so we can
    // peek at the actual declaration keyword.
    let lookahead = 0;
    while (this.peekIsModifier(lookahead)) lookahead++;
    const head = this.peek(lookahead);

    if (head.kind === "keyword" || head.kind === "identifier") {
      const v = head.value.toLowerCase();

      for (const plugin of this.plugins) {
        if (plugin.parseStatement) {
          const res = plugin.parseStatement(this);
          if (res !== null) return res;
        }
      }

      if (v === "namespace") return parseNamespace(this);
      if (v === "class" || v === "structure") return parseClass(this);
      if (v === "sub" || v === "function") return parseMethod(this);
      if (v === "delegate") return parseDelegate(this);
      if (v === "imports") return parseImportsDeclaration(this);
      if (v === "declare") return parseDeclareDeclaration(this);
      if (v === "enum") return parseNativeEnumDeclaration(this);

      if (v === "dim" || v === "const") {
        const modifiers = this.parseModifiers();
        const startLoc = this.peek().loc;
        const isConst = v === "const";
        this.advance(); // consume dim/const
        for (const plugin of this.plugins) {
          if (plugin.parseVariableDeclaration) {
            const res = plugin.parseVariableDeclaration(this);
            if (res !== null) return res;
          }
        }
        return parseLocalVariableDeclarationAfterDim(this, startLoc, isConst, modifiers);
      }
      if (lookahead > 0) return parseField(this);
    }

    // Try to parse the top-level member as a statement structurally first
    // (e.g. assignments, loops, method calls).
    const stmt = this.parseStatement();
    if (stmt !== null) return stmt;

    return this.consumeLineAsOpaque();
  }

  public peekIsModifier(offset: number): boolean {
    const t = this.peek(offset);
    if (t.kind !== "keyword" && t.kind !== "identifier") return false;
    return MODIFIER_KEYWORDS.has(t.value.toLowerCase());
  }

  // --------------------------------------------------------------------------
  // Namespace
  // --------------------------------------------------------------------------

  // Declarations parsed via specialized modules in declaration-parsers/

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

  public skipStatementSeparator(): void {
    while (this.consume("punct", ":")) {
      // Allow colons
    }
    this.skipNewlines();
  }

  public parseStatement(): Statement | null {
    const startLoc = this.peek().loc;
    if (this.shouldPreserveCurrentLine()) return this.consumeLineAsOpaque();
    if (this.currentLineIsMetaDirective()) {
      return this.consumeLineAsOpaque();
    }
    if (this.peek().kind === "comment") {
      const commentToken = this.advance();
      this.consume("newline");
      return {
        kind: "OpaqueStatement",
        text: commentToken.value,
        loc: locOf(startLoc),
      };
    }

    for (const plugin of this.plugins) {
      if (plugin.parseStatement) {
        const res = plugin.parseStatement(this);
        if (res !== null) return res;
      }
    }

    if (
      this.match("keyword", "dim") ||
      this.match("identifier", "dim") ||
      this.match("keyword", "const") ||
      this.match("identifier", "const")
    ) {
      const isConst = this.peek().value.toLowerCase() === "const";
      this.advance(); // consume 'Dim'/'Const'
      for (const plugin of this.plugins) {
        if (plugin.parseVariableDeclaration) {
          const res = plugin.parseVariableDeclaration(this);
          if (res !== null) return res;
        }
      }
      return parseLocalVariableDeclarationAfterDim(this, startLoc, isConst);
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
    if (this.match("keyword", "return") || this.match("identifier", "return")) {
      return this.parseReturnStatement();
    }
    if (this.match("keyword", "exit") || this.match("identifier", "exit")) {
      return this.parseExitStatement();
    }
    if (this.match("keyword", "continue") || this.match("identifier", "continue")) {
      return this.parseContinueStatement();
    }
    if (this.match("keyword", "throw") || this.match("identifier", "throw")) {
      return this.parseThrowStatement();
    }
    if (this.match("keyword", "with") || this.match("identifier", "with")) {
      return this.parseWithStatement();
    }
    if (this.match("keyword", "select") || this.match("identifier", "select")) {
      return this.parseSelectCaseStatement();
    }
    if (this.match("keyword", "imports") || this.match("identifier", "imports")) {
      const imports = parseImportsDeclaration(this);
      const text =
        imports.length > 0 ? `Imports ${imports.map((item) => item.target).join(", ")}` : "Imports";
      return {
        kind: "OpaqueStatement",
        text,
        loc: imports[0]?.loc ?? locOf(startLoc),
      };
    }
    return this.parseAssignmentOrExpressionStatement();
  }

  public parseLocalVariableDeclaration(): Statement {
    const startLoc = this.peek().loc;
    const isConst = this.peek().value.toLowerCase() === "const";
    this.advance(); // consume 'Dim'/'Const'
    return parseLocalVariableDeclarationAfterDim(this, startLoc, isConst);
  }

  private parseIfStatement(): IfStatement {
    return parseIfStatement(this);
  }

  private parseForOrForEachStatement(): ForStatement | ForEachStatement {
    return parseForOrForEachStatement(this);
  }

  private parseWhileStatement(): WhileStatement {
    return parseWhileStatement(this);
  }

  private parseDoLoopStatement(): WhileStatement {
    return parseDoLoopStatement(this);
  }

  private parseTryCatchStatement(): TryCatchStatement {
    return parseTryCatchStatement(this);
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
      expression = this.parseExpression();
    }

    return {
      kind: "ReturnStatement",
      expression,
      loc: locOf(startLoc),
    };
  }

  private parseExitStatement(): ExitStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'Exit'
    const next = this.peek();
    let targetVal = "";
    if (next.kind === "keyword" || next.kind === "identifier") {
      targetVal = this.advance().value.toLowerCase();
    } else {
      this.recordError(
        "expected-token",
        `Expected 'Sub', 'Function', 'For', 'Do', 'While' or 'Property' after 'Exit', got '${next.value || next.kind}'.`,
        startLoc,
      );
    }

    let target: "Sub" | "Function" | "For" | "Do" | "While" | "Property" = "Sub";
    if (targetVal === "function") target = "Function";
    else if (targetVal === "for") target = "For";
    else if (targetVal === "do") target = "Do";
    else if (targetVal === "while") target = "While";
    else if (targetVal === "property") target = "Property";
    else if (targetVal === "sub") target = "Sub";
    else if (targetVal !== "") {
      this.recordError(
        "expected-token",
        `Expected 'Sub', 'Function', 'For', 'Do', 'While' or 'Property' after 'Exit', got '${targetVal}'.`,
        startLoc,
      );
    }

    const endLoc = this.peek().loc;
    this.skipToEndOfLine();
    return {
      kind: "ExitStatement",
      target,
      loc: locOf(startLoc, endLoc),
    };
  }

  private parseContinueStatement(): ContinueStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'continue'
    const endLoc = this.peek().loc;
    this.skipToEndOfLine();
    return {
      kind: "ContinueStatement",
      loc: locOf(startLoc, endLoc),
    };
  }

  private parseThrowStatement(): ThrowStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'Throw'
    const expression = this.parseExpression();
    const comment = this.skipToEndOfLine();
    return {
      kind: "ThrowStatement",
      expression,
      loc: locOf(startLoc),
      comment,
    };
  }

  private parseWithStatement(): WithStatement {
    const startLoc = this.peek().loc;
    this.advance(); // consume 'With'
    const expression = this.parseExpression();
    this.skipToEndOfLine();

    const body: Statement[] = [];
    let endLoc: TokenLocation | undefined;
    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.matchEnd("with")) {
        endLoc = this.consumeEnd("with");
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
      loc: locOf(startLoc, endLoc),
    };
  }

  private parseAssignmentOrExpressionStatement(): Statement {
    const startLoc = this.peek().loc;
    let left = this.parseExpression(Precedence.Comparison);
    const next = this.peek();
    if (
      next.kind === "punct" &&
      (next.value === "=" ||
        next.value === "+=" ||
        next.value === "-=" ||
        next.value === "*=" ||
        next.value === "/=" ||
        next.value === "??=" ||
        next.value === "||=" ||
        next.value === "&&=")
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

  // --------------------------------------------------------------------------
  // Expression grammar
  // --------------------------------------------------------------------------

  public parseExpressionWithLeft(left: Expression, precedence = Precedence.None): Expression {
    return parseExpressionWithLeftGrammar(this, left, precedence);
  }

  public parseExpression(precedence = Precedence.None): Expression {
    return parseExpressionGrammar(this, precedence);
  }

  public parsePrefix(): Expression | null {
    return parsePrefixGrammar(this);
  }

  public parseInfix(left: Expression, token: Token): Expression | null {
    return parseInfixGrammar(this, left, token);
  }
  // --------------------------------------------------------------------------
  // Delegate
  // --------------------------------------------------------------------------

  // Delegate and Property parsing delegated to specialized modules

  private parseSelectCaseStatement(): SelectCaseStatement {
    const startLoc = this.peek().loc;
    this.advance(); // 'Select'

    // Opcional: consome 'Case' se existir (ex.: Select Case x)
    if (this.match("keyword", "case") || this.match("identifier", "case")) {
      this.advance(); // consome 'Case'
    }

    const expression = this.parseExpression();
    this.skipToEndOfLine();

    const cases: SelectCaseBranch[] = [];
    let endLoc: TokenLocation | undefined;

    while (!this.isEOF()) {
      this.skipNewlines();

      if (this.matchEnd("select")) {
        endLoc = this.consumeEnd("select");
        this.skipToEndOfLine();
        break;
      }

      const head = this.peek();
      if (head.kind === "identifier" || head.kind === "keyword") {
        const v = head.value.toLowerCase();
        if (v === "case") {
          const caseStartLoc = head.loc;
          this.advance(); // consome 'Case'

          let isElse = false;
          const values: Expression[] = [];

          // Verifica se é "Case Else"
          const next = this.peek();
          if (
            (next.kind === "keyword" || next.kind === "identifier") &&
            next.value.toLowerCase() === "else"
          ) {
            this.advance(); // consome 'Else'
            isElse = true;
          } else {
            // Lê a lista de valores/expressões separadas por vírgula
            while (!this.isEOF()) {
              values.push(this.parseExpression());
              if (!this.consume("punct", ",")) {
                break;
              }
            }
          }
          this.skipToEndOfLine();

          const body: Statement[] = [];
          while (!this.isEOF()) {
            this.skipNewlines();

            const nextHead = this.peek();
            if (nextHead.kind === "identifier" || nextHead.kind === "keyword") {
              const val = nextHead.value.toLowerCase();
              if (val === "case") {
                break;
              }
              if (val === "end" && Parser.eq(this.peek(1), "select")) {
                break;
              }
            }

            const stmt = this.parseStatement();
            if (stmt !== null) {
              body.push(stmt);
            }
            this.skipStatementSeparator();
          }

          const caseEndLoc = this.peek().loc;
          cases.push({
            kind: "SelectCaseBranch",
            values,
            isElse,
            body,
            loc: locOf(caseStartLoc, caseEndLoc),
          });
          continue;
        }
      }

      const errLoc = this.peek().loc;
      this.recordError("expected-token", "Expected 'Case', 'Case Else' or 'End Select'.", errLoc);
      this.advance();
    }

    return {
      kind: "SelectCaseStatement",
      expression,
      cases,
      loc: locOf(startLoc, endLoc),
    };
  }

  // Enum and Field parsing delegated to specialized modules

  public consumeArraySugarMarker(): boolean {
    if (!this.match("punct", "[")) return false;
    const next = this.peek(1);
    if (next.kind !== "punct" || next.value !== "]") return false;
    this.advance();
    this.advance();
    return true;
  }

  public parseNativeArrayDimensions(): Expression[] | undefined {
    const open = this.peek();
    if (open.kind !== "punct" || (open.value !== "(" && open.value !== "[")) return undefined;
    const closeValue = open.value === "(" ? ")" : "]";
    const first = this.peek(1);
    if (first.kind === "punct" && first.value === closeValue) return undefined;

    this.advance();
    const dimensions: Expression[] = [];
    while (!this.isEOF() && !this.match("newline") && !this.match("punct", closeValue)) {
      dimensions.push(this.parseExpression());
      if (!this.consume("punct", ",")) break;
    }
    this.expect("punct", closeValue, { literal: true });
    return dimensions;
  }

  public parseOptionalArgumentList(): Expression[] {
    const args: Expression[] = [];
    if (!this.consume("punct", "(")) return args;
    this.skipExpressionTrivia();
    while (!this.match("punct", ")") && !this.isEOF()) {
      this.skipExpressionTrivia();
      if (this.match("punct", ")")) break;
      args.push(this.parseExpression());
      this.skipExpressionTrivia();
      if (!this.consume("punct", ",")) break;
      this.skipExpressionTrivia();
    }
    this.expect("punct", ")", { literal: true });
    return args;
  }

  // --------------------------------------------------------------------------
  // Type parameters / parameters / type references
  // --------------------------------------------------------------------------

  public parseOptionalTypeParameters(): TypeParameter[] {
    for (const plugin of this.plugins) {
      if (plugin.parseTypeParameters) {
        const res = plugin.parseTypeParameters(this);
        if (res !== null) return res;
      }
    }
    return [];
  }

  public parseParameterList(): { params: ParameterDeclaration[]; hasParentheses: boolean } {
    const params: ParameterDeclaration[] = [];
    if (!this.consume("punct", "(")) {
      return { params, hasParentheses: false };
    }
    while (!this.match("punct", ")") && !this.isEOF() && !this.match("newline")) {
      // Skip ByRef/ByVal/ReadOnly/Optional modifiers.
      let isByRef = false;
      let isByVal = false;
      let advanced = true;
      while (advanced) {
        advanced = false;
        if (this.consume("keyword", "byref") || this.consume("identifier", "byref")) {
          isByRef = true;
          advanced = true;
        } else if (this.consume("keyword", "byval") || this.consume("identifier", "byval")) {
          isByVal = true;
          advanced = true;
        } else if (this.consume("keyword", "readonly") || this.consume("identifier", "readonly")) {
          advanced = true;
        } else if (this.consume("keyword", "optional") || this.consume("identifier", "optional")) {
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
      let defaultValue: Expression | undefined;
      if (this.consume("punct", "=")) {
        defaultValue = this.parseExpression();
      }
      const decl: ParameterDeclaration = {
        kind: "ParameterDeclaration",
        name: nameToken.value,
        type,
      };
      if (isByRef) decl.isByRef = true;
      if (isByVal) decl.isByVal = true;
      if (defaultValue) decl.defaultValue = defaultValue;
      params.push(decl);
      if (!this.consume("punct", ",")) break;
    }
    this.expect("punct", ")", { literal: true });
    return { params, hasParentheses: true };
  }

  /**
   * Returns `true` when the token sequence starting at `ltOffset` looks like a
   * generic type-argument list (`<TypeName, ...>`), not a comparison operator.
   *
   * `ltOffset` is the peek-offset of the `<` token:
   *  - Pass `1` (default) when the cursor is on the *identifier* before `<`.
   *  - Pass `0` when the cursor is already sitting *on* the `<` (e.g. after a
   *    member-name has been consumed and we want to check what follows).
   *
   * The heuristic mirrors the one used in TypeScript / Roslyn:
   * - A literal number or string token inside the angle brackets → operator.
   * - A control-flow keyword inside the brackets → operator.
   * - Any other unexpected punctuation → operator.
   * - A balanced `>` closes the argument list → type arguments.
   */
  public isGenericTypeArgumentsLookahead(ltOffset = 1): boolean {
    const lt = this.peek(ltOffset);
    if (lt.kind !== "punct" || lt.value !== "<") return false;

    let depth = 1;
    let idx = ltOffset + 1;
    for (;;) {
      const t = this.peek(idx);
      if (t.kind === "eof" || t.kind === "newline") return false;
      if (t.kind === "number" || t.kind === "string") {
        return false;
      }
      if (t.kind === "punct" && !["<", ">", ".", ",", "(", ")"].includes(t.value)) return false;
      if (t.kind === "keyword" || t.kind === "identifier") {
        const lower = t.value.toLowerCase();
        if (
          [
            "or",
            "and",
            "xor",
            "andalso",
            "orelse",
            "not",
            "mod",
            "is",
            "then",
            "else",
            "if",
            "for",
            "while",
            "do",
            "loop",
            "next",
            "return",
            "step",
            "to",
            "in",
          ].includes(lower)
        ) {
          return false;
        }
      }
      if (t.kind === "punct") {
        if (t.value === "<") {
          depth++;
        } else if (t.value === ">") {
          depth--;
          if (depth === 0) {
            return true;
          }
        }
      }
      idx++;
    }
  }

  /**
   * Parses a Type reference, supporting dotted names (`Forms.TForm`),
   * generic type arguments with arbitrary nesting (`TList<TList<Integer>>`),
   * and trailing primitive-array brackets (`T()`).
   */
  public parseTypeReference(swallowArrayMarker = true): TypeReference | null {
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
    for (const plugin of this.plugins) {
      if (plugin.parseTypeArguments) {
        const res = plugin.parseTypeArguments(this);
        if (res !== null) {
          typeArguments.push(...res);
          break;
        }
      }
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
  public consumeLineAsOpaque(): OpaqueStatement | null {
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

  private shouldPreserveCurrentLine(): boolean {
    if (!this.preserveLine || this.isEOF()) return false;
    const sourceLine = this.sourceLines[this.peek().loc.line - 1] ?? "";
    return this.preserveLine(sourceLine);
  }

  private currentLineIsMetaDirective(): boolean {
    if (this.isEOF()) return false;
    const loc = this.peek().loc;
    const text = this.sourceLines[loc.line - 1] ?? "";
    return /^\s*<#/.test(text);
  }

  public parseModifiers(): string[] {
    const list: string[] = [];
    while (this.peekIsModifier(0)) {
      list.push(this.advance().value.toLowerCase());
    }
    return list;
  }

  public matchEnd(kind: string): boolean {
    return (
      (this.match("keyword", "end") || this.match("identifier", "end")) &&
      Parser.eq(this.peek(1), kind)
    );
  }

  public consumeEnd(kind: string): TokenLocation {
    const endKw = this.advance(); // 'End'
    const next = this.peek();
    if (Parser.eq(next, kind)) {
      return this.advance().loc;
    }
    return endKw.loc;
  }

  public skipToEndOfLine(): string | undefined {
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
  "shadows",
  "mustoverride",
  "mustinherit",
  "notinheritable",
]);

export function locOf(
  loc: TokenLocation,
  endLoc?: TokenLocation,
): {
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
} {
  return {
    startLine: loc.line,
    startChar: loc.column,
    endLine: endLoc ? endLoc.line : loc.line,
    endChar: endLoc ? endLoc.column : loc.column,
  };
}

export function emptyTypeReference(): TypeReference {
  return { kind: "TypeReference", name: "", typeArguments: [] };
}

export function wrapArraySugarType(elementType: TypeReference, loc: TokenLocation): TypeReference {
  return {
    kind: "TypeReference",
    name: "TTList",
    typeArguments: [elementType],
    loc: locOf(loc),
  };
}
