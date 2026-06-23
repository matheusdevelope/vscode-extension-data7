import type {
  CompilationUnit,
  MethodDeclaration,
  Node,
  Statement,
  TypeReference,
} from "../../ast/ast";
import { ASTWalker } from "../../ast/ast";

/** Renames method-local symbols without touching type references. */
class LocalObfuscator {
  private readonly renameMap = new Map<string, string>();
  private counter = 0;

  obfuscate(method: MethodDeclaration): void {
    this.renameMap.clear();
    this.counter = 0;
    for (const parameter of method.parameters) this.rename(parameter, "name");
    this.collectLocalVariables(method.body);

    const renameMap = this.renameMap;
    const refRenamer = new (class extends ASTWalker {
      protected override visitTypeReference(_: TypeReference): void {
        // Type references deliberately keep their original names.
      }

      override walk(node: Node): void {
        if (node.kind === "Identifier") {
          const renamed = renameMap.get(node.name);
          if (renamed !== undefined) node.name = renamed;
          return;
        }
        super.walk(node);
      }
    })();
    for (const statement of method.body) refRenamer.walk(statement);
  }

  private rename(target: { name: string }, field: "name"): void {
    const obfuscated = `__v${this.counter++}`;
    this.renameMap.set(target[field], obfuscated);
    target[field] = obfuscated;
  }

  private collectLocalVariables(statements: Statement[]): void {
    for (const statement of statements) {
      switch (statement.kind) {
        case "VariableDeclaration":
          this.rename(statement, "name");
          break;
        case "ForStatement":
          this.rename(statement.counter, "name");
          this.collectLocalVariables(statement.body);
          break;
        case "ForEachStatement":
          this.rename(statement.elementVar, "name");
          this.collectLocalVariables(statement.body);
          break;
        case "UsingStatement":
          this.rename(statement.resourceVar, "name");
          this.collectLocalVariables(statement.body);
          break;
        case "TryCatchStatement":
          if (statement.catchVar) this.rename(statement.catchVar, "name");
          this.collectLocalVariables(statement.tryBody);
          this.collectLocalVariables(statement.catchBody);
          if (statement.finallyBody) this.collectLocalVariables(statement.finallyBody);
          break;
        case "IfStatement":
          this.collectLocalVariables(statement.thenBranch);
          for (const branch of statement.elseIfBranches) this.collectLocalVariables(branch.body);
          if (statement.elseBranch) this.collectLocalVariables(statement.elseBranch);
          break;
        case "WhileStatement":
          this.collectLocalVariables(statement.body);
          break;
        case "MatchStatement":
        case "SelectCaseStatement":
          for (const branch of statement.cases) this.collectLocalVariables(branch.body);
          break;
        case "Block":
          this.collectLocalVariables(statement.statements);
          break;
      }
    }
  }
}

export function obfuscateLocalVariables(unit: CompilationUnit): void {
  const walker = new (class extends ASTWalker {
    protected override visitTypeReference(_: TypeReference): void {
      // Type references deliberately keep their original names.
    }

    override walk(node: Node): void {
      if (node.kind === "MethodDeclaration") {
        new LocalObfuscator().obfuscate(node);
        return;
      }
      if (node.kind === "PropertyDeclaration") {
        if (node.getter) new LocalObfuscator().obfuscate(node.getter);
        if (node.setter) new LocalObfuscator().obfuscate(node.setter);
      }
      super.walk(node);
    }
  })();
  walker.walk(unit);
}
