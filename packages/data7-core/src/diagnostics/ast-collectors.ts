import {
  ASTWalker,
  type MethodDeclaration,
  type MethodInvocation,
  type Node,
  type OpaqueStatement,
  type SourceLocation,
  type TypeReference,
} from "../project/ast/ast";

export interface LocalDeclaration {
  name: string;
  loc: SourceLocation;
  isParameter: boolean;
}

/** Collects declarations in a method, including parameters and scoped bindings. */
export class LocalDeclarationCollector extends ASTWalker {
  public readonly declarations: LocalDeclaration[] = [];

  constructor(private readonly methodNode: MethodDeclaration) {
    super();
  }

  public collect(): void {
    for (const p of this.methodNode.parameters) {
      const loc = p.loc ?? p.type.loc;
      if (loc) this.declarations.push({ name: p.name, loc, isParameter: true });
    }
    for (const statement of this.methodNode.body) this.walk(statement);
  }

  public override walk(node: Node): void {
    if (node.kind === "VariableDeclaration" && node.loc) {
      this.declarations.push({ name: node.name, loc: node.loc, isParameter: false });
    } else if (node.kind === "DestructuredVariableDeclaration" && node.loc) {
      for (const binding of node.bindings) {
        this.declarations.push({ name: binding.name, loc: node.loc, isParameter: false });
      }
    } else if (node.kind === "ForEachStatement" && node.elementVar.loc) {
      this.declarations.push({
        name: node.elementVar.name,
        loc: node.elementVar.loc,
        isParameter: false,
      });
    } else if (node.kind === "UsingStatement" && node.resourceVar.loc) {
      this.declarations.push({
        name: node.resourceVar.name,
        loc: node.resourceVar.loc,
        isParameter: false,
      });
    } else if (node.kind === "TryCatchStatement" && node.catchVar?.loc) {
      this.declarations.push({
        name: node.catchVar.name,
        loc: node.catchVar.loc,
        isParameter: false,
      });
    }
    super.walk(node);
  }
}

/** Collects identifiers used by a compilation unit for import analysis. */
export class ASTWordCollector extends ASTWalker {
  public readonly usedWords = new Set<string>();
  public readonly qualifiedTypes = new Set<string>();

  protected override visitTypeReference(node: TypeReference): void {
    if (!node.name) return;
    this.qualifiedTypes.add(node.name.toLowerCase());
    for (const part of node.name.toLowerCase().split(".")) this.usedWords.add(part);
  }

  protected override visitMethodInvocation(node: MethodInvocation): void {
    if (node.methodName) this.usedWords.add(node.methodName.toLowerCase());
  }

  protected override visitOpaqueStatement(node: OpaqueStatement): void {
    const wordRegex = /[A-Za-z_]\w*/g;
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(node.text)) !== null) this.usedWords.add(match[0].toLowerCase());
  }

  public override walk(node: Node): void {
    if (node.kind === "Identifier" && node.name) this.usedWords.add(node.name.toLowerCase());
    if (node.kind === "MemberAccess" && node.member) this.usedWords.add(node.member.toLowerCase());
    if (node.kind === "MethodInvocation" && node.methodName) {
      this.usedWords.add(node.methodName.toLowerCase());
    }
    super.walk(node);
  }
}
