import {
  ASTWalker,
  type CompilationUnit,
  type MethodInvocation,
  type Node,
  type OpaqueStatement,
  type TypeReference,
} from "../project/ast/ast";

export interface TrackedDeclaration {
  readonly name: string;
  readonly line: number;
  readonly startChar: number;
  readonly endChar: number;
}

export interface NativeArrayDeclaration {
  readonly name: string;
  readonly rank: number;
  readonly line: number;
  readonly isField: boolean;
}

/**
 * Single AST prepass that collects data previously gathered by separate full-tree
 * walks (import word usage, unused-declaration tracking, native array dims).
 */
export class LintUnitIndex {
  public readonly usedWords = new Set<string>();
  public readonly qualifiedTypes = new Set<string>();
  public readonly trackedDeclarations: TrackedDeclaration[] = [];
  public readonly references = new Set<string>();
  public readonly nativeArrayDeclarations: NativeArrayDeclaration[] = [];

  public static build(unit: CompilationUnit): LintUnitIndex {
    const index = new LintUnitIndex();
    new LintUnitIndexWalker(index).walk(unit);
    return index;
  }
}

class LintUnitIndexWalker extends ASTWalker {
  private readonly parentStack: Node[] = [];

  public constructor(private readonly index: LintUnitIndex) {
    super();
  }

  public override walk(node: Node): void {
    this.collectWords(node);
    this.collectDeclarationUsage(node);
    this.collectNativeArray(node);

    this.parentStack.push(node);
    super.walk(node);
    this.parentStack.pop();
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

  private collectDeclarationUsage(node: Node): void {
    const parent = this.parentStack[this.parentStack.length - 1];
    if (node.kind === "VariableDeclaration") {
      if (!node.loc) return;
      if (this.isInsideFileLevelLambda()) return;
      const shouldTrack = node.isConst || this.isInsideRoutine();
      if (!shouldTrack) return;
      this.index.trackedDeclarations.push(
        toTracked(node.name, node.loc.startLine - 1, node.loc.startChar, node.loc.endChar),
      );
      return;
    }

    if (node.kind === "FieldDeclaration") {
      if (!node.loc || !hasModifier(node.modifiers, "private")) return;
      this.index.trackedDeclarations.push(
        toTracked(node.name, node.loc.startLine - 1, node.loc.startChar, node.loc.endChar),
      );
      return;
    }

    if (node.kind === "Identifier") {
      if (isDeclarationName(node.name, parent)) return;
      this.index.references.add(node.name.toLowerCase());
      return;
    }

    if (node.kind === "MemberAccess" && node.member) {
      this.index.references.add(node.member.toLowerCase());
      return;
    }

    if (node.kind === "MethodInvocation" && node.methodName) {
      this.index.references.add(node.methodName.toLowerCase());
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

  private isInsideRoutine(): boolean {
    return this.parentStack.some(
      (ancestor) =>
        ancestor.kind === "MethodDeclaration" || ancestor.kind === "PropertyDeclaration",
    );
  }

  private isInsideFileLevelLambda(): boolean {
    const isInsideLambda = this.parentStack.some(
      (ancestor) => ancestor.kind === "ArrowFunctionExpression",
    );
    if (!isInsideLambda) return false;
    return !this.isInsideRoutine();
  }
}

function toTracked(
  name: string,
  line: number,
  startChar: number,
  endChar: number,
): TrackedDeclaration {
  return { name, line, startChar, endChar: Math.max(endChar, startChar + name.length) };
}

function hasModifier(modifiers: readonly string[] | undefined, modifier: string): boolean {
  return modifiers?.some((item) => item.toLowerCase() === modifier) ?? false;
}

function isDeclarationName(name: string, parent: Node | undefined): boolean {
  if (!parent) return false;
  switch (parent.kind) {
    case "VariableDeclaration":
    case "FieldDeclaration":
    case "MethodDeclaration":
    case "PropertyDeclaration":
    case "DelegateDeclaration":
    case "ClassDeclaration":
    case "ParameterDeclaration":
      return "name" in parent && parent.name.toLowerCase() === name.toLowerCase();
    default:
      return false;
  }
}
