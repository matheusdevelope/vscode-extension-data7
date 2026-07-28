import type { CompilationUnit, Expression, Node } from "../project/ast/ast";
import { ASTWalker } from "../project/ast/ast";
import type * as vscode from "../platform/vscode-api";
import type { WorkspaceSymbolIndexer } from "./symbol-indexer";
import { TypeResolver } from "./type-resolver";

/**
 * One-pass TypeMap: walks the unit and fills TypeResolver expression caches
 * so subsequent rule checks reuse resolved types instead of recomputing.
 */
export function buildExpressionTypeMap(
  unit: CompilationUnit,
  document: vscode.TextDocument,
  indexer: WorkspaceSymbolIndexer,
): void {
  new ExpressionTypeMapWalker(document, indexer).walk(unit);
}

class ExpressionTypeMapWalker extends ASTWalker {
  constructor(
    private readonly document: vscode.TextDocument,
    private readonly indexer: WorkspaceSymbolIndexer,
  ) {
    super();
  }

  public override walk(node: Node): void {
    if (isExpressionNode(node)) {
      const lineIdx = Math.max(0, (node.loc?.startLine ?? 1) - 1);
      TypeResolver.resolveExpressionType(node, this.document, lineIdx, this.indexer);
    }
    super.walk(node);
  }
}

function isExpressionNode(node: Node): node is Expression {
  switch (node.kind) {
    case "Identifier":
    case "Literal":
    case "MemberAccess":
    case "MethodInvocation":
    case "BinaryExpression":
    case "UnaryExpression":
    case "TernaryExpression":
    case "NullCoalescingExpression":
    case "OptionalChainingExpression":
    case "ArrayAccessExpression":
    case "ArrayLiteralExpression":
    case "ObjectCreationExpression":
    case "TypeReferenceExpression":
    case "PipeExpression":
    case "SpreadExpression":
    case "ArrowFunctionExpression":
    case "TaggedTemplateExpression":
      return true;
    default:
      return false;
  }
}
