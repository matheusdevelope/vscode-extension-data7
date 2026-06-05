import type {
  Expression,
  Statement,
  TypeParameter,
  TypeReference,
} from "../ast/ast";
import type { Parser } from "./parser";
import type { Token } from "./token-types";

/**
 * Interface that all parser plugins must implement to extend the syntax.
 */
export interface ParserPlugin {
  readonly name: string;

  /**
   * Called when the parser is parsing a statement.
   * Returns a parsed statement if recognized, or null to fall back.
   */
  parseStatement?(parser: Parser): Statement | null;

  /**
   * Called when parsing optional type parameters (e.g. `<T>`).
   * Returns type parameters if parsed, or null to fall back.
   */
  parseTypeParameters?(parser: Parser): TypeParameter[] | null;

  /**
   * Called when parsing type arguments (e.g. `<Product>`).
   * Returns type arguments if parsed, or null to fall back.
   */
  parseTypeArguments?(parser: Parser): TypeReference[] | null;

  /**
   * Called when parsing expression prefix terms (e.g. `New T() With { ... }`).
   * Returns expression if parsed, or null to fall back.
   */
  parseExpressionPrefix?(parser: Parser): Expression | null;

  /**
   * Called when parsing expression infix/postfix terms (e.g. `a ?. b`, `a ?? b`, `a |> b`).
   * Returns expression if parsed, or null to fall back.
   */
  parseExpressionInfix?(parser: Parser, left: Expression, token: Token): Expression | null;

  /**
   * Called when parsing a local variable declaration (Dim/Const).
   * Used to intercept destructuring syntax (e.g. `Dim { a } = obj`).
   * Returns a statement if parsed, or null to fall back.
   */
  parseVariableDeclaration?(parser: Parser): Statement | null;
}
