import {
  ASTWalker,
  type CompilationUnit,
  type MethodInvocation,
  type Node,
  type OpaqueStatement,
  type TypeReference,
} from "../project/ast/ast";

export interface NativeArrayDeclaration {
  readonly name: string;
  readonly rank: number;
  readonly line: number;
  readonly isField: boolean;
}

/**
 * Single AST prepass that collects data previously gathered by separate full-tree
 * walks (import word usage, native array dims).
 */
export class LintUnitIndex {
  public readonly usedWords = new Set<string>();
  public readonly qualifiedTypes = new Set<string>();
  public readonly nativeArrayDeclarations: NativeArrayDeclaration[] = [];

  public static build(unit: CompilationUnit): LintUnitIndex {
    const index = new LintUnitIndex();
    new LintUnitIndexWalker(index).walk(unit);
    return index;
  }
}

class LintUnitIndexWalker extends ASTWalker {
  public constructor(private readonly index: LintUnitIndex) {
    super();
  }

  public override walk(node: Node): void {
    this.collectWords(node);
    this.collectNativeArray(node);
    super.walk(node);
  }

  private collectWords(node: Node): void {
    if (node.kind === "TypeReference") {
      this.collectTypeReference(node);
      return;
    }
    if (node.kind === "MethodInvocation") {
      this.collectMethodInvocationWords(node);
    }
    if (node.kind === "OpaqueStatement") {
      this.collectOpaqueStatementWords(node);
    }
    if (node.kind === "Identifier" && node.name) {
      this.index.usedWords.add(node.name.toLowerCase());
    }
    if (node.kind === "MemberAccess" && node.member) {
      this.index.usedWords.add(node.member.toLowerCase());
    }
    if (node.kind === "MethodInvocation" && node.methodName) {
      this.index.usedWords.add(node.methodName.toLowerCase());
    }
  }

  private collectTypeReference(node: TypeReference): void {
    if (!node.name) return;
    this.index.qualifiedTypes.add(node.name.toLowerCase());
    for (const part of node.name.toLowerCase().split(".")) {
      this.index.usedWords.add(part);
    }
  }

  private collectMethodInvocationWords(node: MethodInvocation): void {
    if (node.methodName) {
      this.index.usedWords.add(node.methodName.toLowerCase());
    }
  }

  private collectOpaqueStatementWords(node: OpaqueStatement): void {
    const wordRegex = /[A-Za-z_]\w*/g;
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(node.text)) !== null) {
      this.index.usedWords.add(match[0].toLowerCase());
    }
  }

  private collectNativeArray(node: Node): void {
    if (
      (node.kind === "FieldDeclaration" || node.kind === "VariableDeclaration") &&
      node.nativeArrayDimensions !== undefined
    ) {
      this.index.nativeArrayDeclarations.push({
        name: node.name.toLowerCase(),
        rank: node.nativeArrayDimensions.length,
        line: Math.max(0, (node.loc?.startLine ?? 1) - 1),
        isField: node.kind === "FieldDeclaration",
      });
    }
  }
}
