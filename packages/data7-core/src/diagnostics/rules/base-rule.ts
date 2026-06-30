import type * as vscode from "../../platform/vscode-api";
import type {
  Node,
  ClassDeclaration,
  MethodDeclaration,
  PropertyDeclaration,
  CompilationUnit,
} from "../../project/ast/ast";
import type { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";

export interface RuleContext {
  readonly document: vscode.TextDocument;
  readonly indexer: WorkspaceSymbolIndexer;
  readonly text: string;
  readonly lines: readonly string[];
  readonly diagnostics: vscode.Diagnostic[];

  readonly activeClass: ClassDeclaration | undefined;
  readonly activeClassInheritedNames: ReadonlySet<string> | undefined;
  readonly activeMethod: MethodDeclaration | undefined;
  readonly activeProperty: PropertyDeclaration | undefined;
  readonly conditionalBlockDepth: number;
  readonly allowedTernaries: ReadonlySet<Node>;
  readonly parentStack: readonly Node[];

  report(diagnostic: vscode.Diagnostic): void;
  isLocalDeclared(name: string): boolean;
  isGenericTypeParameter(name: string): boolean;
}

export interface Rule {
  readonly name: string;

  /**
   * Chamado para cada nó da AST visitado pelo walker.
   */
  checkNode?(node: Node, context: RuleContext, parent: Node | undefined): void;

  /**
   * Chamado no início do processo de análise do arquivo.
   */
  onStart?(unit: CompilationUnit, context: RuleContext): void;

  /**
   * Chamado no final do processo de análise, após todo o AST ser percorrido.
   */
  onEnd?(unit: CompilationUnit, context: RuleContext): void;
}
