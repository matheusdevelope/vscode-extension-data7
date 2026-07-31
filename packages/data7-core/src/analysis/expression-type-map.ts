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
  isCancelled?: () => boolean,
): void {
  new ExpressionTypeMapWalker(document, indexer, isCancelled).walk(unit);
}

/** Nodes between cancellation probes; keeps the check off the per-node path. */
const CANCELLATION_CHECK_INTERVAL = 64;

class ExpressionTypeMapWalker extends ASTWalker {
  private nodesVisited = 0;
  private aborted = false;

  constructor(
    private readonly document: vscode.TextDocument,
    private readonly indexer: WorkspaceSymbolIndexer,
    private readonly isCancelled?: () => boolean,
  ) {
    super();
  }

  public override walk(node: Node): void {
    if (this.aborted) return;
    // This pass resolves every expression in the unit; without a yield point a
    // cancelled check still paid for the whole traversal.
    if (++this.nodesVisited % CANCELLATION_CHECK_INTERVAL === 0 && this.isCancelled?.() === true) {
      this.aborted = true;
      return;
    }
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
