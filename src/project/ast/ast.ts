/**
 * AST node types for the Data7 Basic compiler.
 *
 * Design notes:
 *  - Every node carries a `kind` literal (discriminated union). The engine
 *    relies on exhaustive `switch` over `kind` and a `never`-typed default
 *    branch to enforce coverage statically when new node kinds are added.
 *  - `loc` (source location) is optional on every node so the engine can be
 *    fed a parser AST that does carry positions, without forcing tests and
 *    fixtures to invent fake spans.
 *  - Mutability is intentional: the monomorphizer rewrites
 *    {@link TypeReference} nodes in place (renaming + clearing type args)
 *    so parent pointers do not need to be tracked.
 *
 * Out of scope (intentional, may be revisited):
 *  - Higher-kinded type parameters (`T<U>` as a parameter).
 *  - Variance annotations (`In T`, `Out T`).
 *  - Default type parameters.
 *  - Parametric constraints (`T As List<U>`); plain constraints
 *    (`T As BaseItem`) are accepted and discarded by the engine.
 *  - Generic methods declared inside classes — they are detected by the
 *    engine and pruned with a `class-generic-method-unsupported` warning.
 */

export interface SourceLocation {
  readonly startLine: number;
  readonly startChar: number;
  readonly endLine: number;
  readonly endChar: number;
}

interface BaseNode {
  /** Optional source position; preserved by the engine when present. */
  loc?: SourceLocation;
  comment?: string;
  parenthesized?: boolean;
  noParentheses?: boolean;
  singleLine?: boolean;
}

export type Node =
  | CompilationUnit
  | NamespaceDeclaration
  | ClassDeclaration
  | MethodDeclaration
  | DelegateDeclaration
  | FieldDeclaration
  | PropertyDeclaration
  | ParameterDeclaration
  | TypeParameter
  | TypeReference
  | TypeReferenceExpression
  | VariableDeclaration
  | ObjectCreationExpression
  | MethodInvocation
  | MemberAccess
  | Identifier
  | Literal
  | Assignment
  | ExpressionStatement
  | OpaqueStatement
  | IfStatement
  | ForStatement
  | ForEachStatement
  | WhileStatement
  | TryCatchStatement
  | UsingStatement
  | MatchStatement
  | ReturnStatement
  | ExitStatement
  | ThrowStatement
  | Block
  | WithStatement
  | BinaryExpression
  | UnaryExpression
  | TernaryExpression
  | NullCoalescingExpression
  | OptionalChainingExpression
  | PipeExpression
  | TaggedTemplateExpression
  | EnumDeclaration
  | DestructuredVariableDeclaration
  | ObjectInitializerExpression
  | ImportsDeclaration
  | SelectCaseStatement
  | SelectCaseBranch
  | ArrayLiteralExpression
  | SpreadExpression
  | ArrowFunctionExpression;

export interface CompilationUnit extends BaseNode {
  readonly kind: "CompilationUnit";
  members: TopLevelMember[];
}

export type TopLevelMember =
  | NamespaceDeclaration
  | ClassDeclaration
  | MethodDeclaration
  | DelegateDeclaration
  | VariableDeclaration
  | Statement
  | EnumDeclaration
  | DestructuredVariableDeclaration
  | ImportsDeclaration;

export interface NamespaceDeclaration extends BaseNode {
  readonly kind: "NamespaceDeclaration";
  name: string;
  members: TopLevelMember[];
}

export interface ClassDeclaration extends BaseNode {
  readonly kind: "ClassDeclaration";
  name: string;
  typeParameters: TypeParameter[];
  baseType?: TypeReference;
  members: ClassMember[];
  readonly modifiers?: string[];
}

export type ClassMember = MethodDeclaration | FieldDeclaration | PropertyDeclaration;

export interface MethodDeclaration extends BaseNode {
  readonly kind: "MethodDeclaration";
  name: string;
  /** `true` when the method is a constructor (`Sub New`). */
  isConstructor?: boolean;
  typeParameters: TypeParameter[];
  parameters: ParameterDeclaration[];
  returnType?: TypeReference;
  body: Statement[];
  readonly modifiers?: string[];
  readonly noParentheses?: boolean;
}

export interface DelegateDeclaration extends BaseNode {
  readonly kind: "DelegateDeclaration";
  name: string;
  typeParameters: TypeParameter[];
  parameters: ParameterDeclaration[];
  returnType?: TypeReference;
  readonly modifiers?: string[];
  readonly noParentheses?: boolean;
}

export interface FieldDeclaration extends BaseNode {
  readonly kind: "FieldDeclaration";
  name: string;
  type: TypeReference;
  initializer?: Expression;
  readonly modifiers?: string[];
}

export interface PropertyDeclaration extends BaseNode {
  readonly kind: "PropertyDeclaration";
  name: string;
  type: TypeReference;
  getter?: MethodDeclaration;
  setter?: MethodDeclaration;
  hasBlock: boolean;
  readonly modifiers?: string[];
  parameters?: ParameterDeclaration[];
}

export interface ParameterDeclaration extends BaseNode {
  readonly kind: "ParameterDeclaration";
  name: string;
  type: TypeReference;
  isByRef?: boolean;
  defaultValue?: Expression;
}

export interface TypeParameter extends BaseNode {
  readonly kind: "TypeParameter";
  name: string;
  /** Constraint clause (`T As BaseItem`); dropped during monomorphization. */
  constraint?: TypeReference;
}

export interface TypeReference extends BaseNode {
  readonly kind: "TypeReference";
  name: string;
  typeArguments: TypeReference[];
}

export interface TypeReferenceExpression extends BaseNode {
  readonly kind: "TypeReferenceExpression";
  type: TypeReference;
}

export interface VariableDeclaration extends BaseNode {
  readonly kind: "VariableDeclaration";
  name: string;
  type?: TypeReference;
  initializer?: Expression;
  isConst?: boolean;
}

export type Expression =
  | ObjectCreationExpression
  | MethodInvocation
  | MemberAccess
  | Identifier
  | Literal
  | BinaryExpression
  | UnaryExpression
  | TernaryExpression
  | NullCoalescingExpression
  | OptionalChainingExpression
  | PipeExpression
  | TaggedTemplateExpression
  | ObjectInitializerExpression
  | ArrayLiteralExpression
  | SpreadExpression
  | ArrowFunctionExpression
  | TypeReferenceExpression;

export interface ObjectCreationExpression extends BaseNode {
  readonly kind: "ObjectCreationExpression";
  type: TypeReference;
  arguments: Expression[];
}

export interface MethodInvocation extends BaseNode {
  readonly kind: "MethodInvocation";
  /** Receiver, if any (e.g. `obj` in `obj.Foo<Integer>(x)`). */
  callee?: Expression;
  methodName: string;
  typeArguments: TypeReference[];
  arguments: Expression[];
}

export interface MemberAccess extends BaseNode {
  readonly kind: "MemberAccess";
  target: Expression;
  member: string;
}

export interface Identifier extends BaseNode {
  readonly kind: "Identifier";
  name: string;
}

export interface Literal extends BaseNode {
  readonly kind: "Literal";
  value: string | number | boolean | null;
}

export type Statement =
  | ExpressionStatement
  | Assignment
  | VariableDeclaration
  | OpaqueStatement
  | IfStatement
  | ForStatement
  | ForEachStatement
  | WhileStatement
  | TryCatchStatement
  | UsingStatement
  | MatchStatement
  | ReturnStatement
  | ExitStatement
  | ThrowStatement
  | Block
  | WithStatement
  | EnumDeclaration
  | DestructuredVariableDeclaration
  | SelectCaseStatement;

export interface ExpressionStatement extends BaseNode {
  readonly kind: "ExpressionStatement";
  expression: Expression;
}

export interface Assignment extends BaseNode {
  readonly kind: "Assignment";
  target: Expression;
  value: Expression;
  operator?: string;
}

export interface OpaqueStatement extends BaseNode {
  readonly kind: "OpaqueStatement";
  /** Verbatim line text (without trailing EOL). */
  text: string;
}

export interface ImportsDeclaration extends BaseNode {
  readonly kind: "ImportsDeclaration";
  target: string;
}

export interface IfStatement extends BaseNode {
  readonly kind: "IfStatement";
  condition: Expression;
  thenBranch: Statement[];
  elseIfBranches: { condition: Expression; body: Statement[] }[];
  elseBranch?: Statement[];
}

export interface ForStatement extends BaseNode {
  readonly kind: "ForStatement";
  counter: Identifier;
  start: Expression;
  end: Expression;
  step?: Expression;
  body: Statement[];
}

export interface ForEachStatement extends BaseNode {
  readonly kind: "ForEachStatement";
  elementVar: Identifier;
  elementType?: TypeReference;
  enumerable: Expression;
  body: Statement[];
}

export interface WhileStatement extends BaseNode {
  readonly kind: "WhileStatement";
  condition: Expression;
  body: Statement[];
}

export interface TryCatchStatement extends BaseNode {
  readonly kind: "TryCatchStatement";
  tryBody: Statement[];
  catchVar?: Identifier;
  catchType?: TypeReference;
  catchBody: Statement[];
  finallyBody?: Statement[];
}

export interface UsingStatement extends BaseNode {
  readonly kind: "UsingStatement";
  resourceVar: Identifier;
  resourceType: TypeReference;
  resourceArgs: Expression[];
  body: Statement[];
}

export interface MatchStatement extends BaseNode {
  readonly kind: "MatchStatement";
  subject: Expression;
  cases: { typeName?: string; isElse: boolean; body: Statement[] }[];
}

export interface SelectCaseStatement extends BaseNode {
  readonly kind: "SelectCaseStatement";
  expression: Expression;
  cases: SelectCaseBranch[];
}

export interface SelectCaseBranch extends BaseNode {
  readonly kind: "SelectCaseBranch";
  values: Expression[];
  isElse: boolean;
  body: Statement[];
}

export interface ReturnStatement extends BaseNode {
  readonly kind: "ReturnStatement";
  expression?: Expression;
}

export interface ExitStatement extends BaseNode {
  readonly kind: "ExitStatement";
  target: "Sub" | "Function" | "For" | "Do" | "While" | "Property";
}

export interface ThrowStatement extends BaseNode {
  readonly kind: "ThrowStatement";
  expression: Expression;
}

export interface Block extends BaseNode {
  readonly kind: "Block";
  statements: Statement[];
}

export interface WithStatement extends BaseNode {
  readonly kind: "WithStatement";
  expression: Expression;
  body: Statement[];
}

export interface BinaryExpression extends BaseNode {
  readonly kind: "BinaryExpression";
  left: Expression;
  operator: string;
  right: Expression;
}

export interface UnaryExpression extends BaseNode {
  readonly kind: "UnaryExpression";
  operator: string;
  argument: Expression;
}

export interface TernaryExpression extends BaseNode {
  readonly kind: "TernaryExpression";
  condition: Expression;
  trueExpr: Expression;
  falseExpr: Expression;
}

export interface NullCoalescingExpression extends BaseNode {
  readonly kind: "NullCoalescingExpression";
  left: Expression;
  right: Expression;
}

export interface OptionalChainingExpression extends BaseNode {
  readonly kind: "OptionalChainingExpression";
  target: Expression;
  member: Expression;
}

export interface PipeExpression extends BaseNode {
  readonly kind: "PipeExpression";
  left: Expression;
  right: Expression;
}

export interface TaggedTemplateExpression extends BaseNode {
  readonly kind: "TaggedTemplateExpression";
  tag: string;
  body: string;
}

export interface ArrayLiteralExpression extends BaseNode {
  readonly kind: "ArrayLiteralExpression";
  readonly elements: ArrayLiteralElement[];
}

export type ArrayLiteralElement = Expression | SpreadExpression;

export interface SpreadExpression extends BaseNode {
  readonly kind: "SpreadExpression";
  readonly expression: Expression;
}

export interface ArrowFunctionExpression extends BaseNode {
  readonly kind: "ArrowFunctionExpression";
  readonly parameters: ParameterDeclaration[];
  readonly body: Expression | Statement[];
  readonly returnType?: TypeReference;
}

// ============================================================================
// Visitor / Walker
// ============================================================================

export abstract class ASTWalker {
  walk(node: Node): void {
    switch (node.kind) {
      case "CompilationUnit":
        for (const m of node.members) this.walk(m);
        return;
      case "NamespaceDeclaration":
        for (const m of node.members) this.walk(m);
        return;
      case "ClassDeclaration":
        if (node.baseType) this.walk(node.baseType);
        for (const tp of node.typeParameters) this.walk(tp);
        for (const m of node.members) this.walk(m);
        return;
      case "MethodDeclaration":
        for (const tp of node.typeParameters) this.walk(tp);
        for (const p of node.parameters) this.walk(p);
        if (node.returnType) this.walk(node.returnType);
        for (const s of node.body) this.walk(s);
        return;
      case "DelegateDeclaration":
        for (const tp of node.typeParameters) this.walk(tp);
        for (const p of node.parameters) this.walk(p);
        if (node.returnType) this.walk(node.returnType);
        return;
      case "FieldDeclaration":
        this.walk(node.type);
        if (node.initializer) this.walk(node.initializer);
        return;
      case "PropertyDeclaration":
        if (node.parameters) {
          for (const p of node.parameters) this.walk(p);
        }
        this.walk(node.type);
        if (node.getter) this.walk(node.getter);
        if (node.setter) this.walk(node.setter);
        return;
      case "ParameterDeclaration":
        this.walk(node.type);
        if (node.defaultValue) this.walk(node.defaultValue);
        return;
      case "TypeParameter":
        if (node.constraint) this.walk(node.constraint);
        return;
      case "TypeReference":
        for (const t of node.typeArguments) this.walk(t);
        this.visitTypeReference(node);
        return;
      case "TypeReferenceExpression":
        this.walk(node.type);
        this.visitTypeReferenceExpression(node);
        return;
      case "VariableDeclaration":
        if (node.type) this.walk(node.type);
        if (node.initializer) this.walk(node.initializer);
        return;
      case "ObjectCreationExpression":
        this.walk(node.type);
        for (const a of node.arguments) this.walk(a);
        return;
      case "MethodInvocation":
        if (node.callee) this.walk(node.callee);
        for (const t of node.typeArguments) this.walk(t);
        for (const a of node.arguments) this.walk(a);
        this.visitMethodInvocation(node);
        return;
      case "MemberAccess":
        this.walk(node.target);
        return;
      case "Identifier":
      case "Literal":
      case "OpaqueStatement":
        if (node.kind === "OpaqueStatement") this.visitOpaqueStatement(node);
        return;
      case "ImportsDeclaration":
        this.visitImportsDeclaration(node);
        return;
      case "ExpressionStatement":
        this.walk(node.expression);
        return;
      case "Assignment":
        this.walk(node.target);
        this.walk(node.value);
        return;
      case "IfStatement":
        this.walk(node.condition);
        for (const s of node.thenBranch) this.walk(s);
        for (const branch of node.elseIfBranches) {
          this.walk(branch.condition);
          for (const s of branch.body) this.walk(s);
        }
        if (node.elseBranch) {
          for (const s of node.elseBranch) this.walk(s);
        }
        return;
      case "ForStatement":
        this.walk(node.counter);
        this.walk(node.start);
        this.walk(node.end);
        if (node.step) this.walk(node.step);
        for (const s of node.body) this.walk(s);
        return;
      case "ForEachStatement":
        this.walk(node.elementVar);
        if (node.elementType) this.walk(node.elementType);
        this.walk(node.enumerable);
        for (const s of node.body) this.walk(s);
        return;
      case "WhileStatement":
        this.walk(node.condition);
        for (const s of node.body) this.walk(s);
        return;
      case "TryCatchStatement":
        for (const s of node.tryBody) this.walk(s);
        if (node.catchVar) this.walk(node.catchVar);
        if (node.catchType) this.walk(node.catchType);
        for (const s of node.catchBody) this.walk(s);
        if (node.finallyBody) {
          for (const s of node.finallyBody) this.walk(s);
        }
        return;
      case "UsingStatement":
        this.walk(node.resourceVar);
        this.walk(node.resourceType);
        for (const a of node.resourceArgs) this.walk(a);
        for (const s of node.body) this.walk(s);
        return;
      case "MatchStatement":
        this.walk(node.subject);
        for (const c of node.cases) {
          for (const s of c.body) this.walk(s);
        }
        return;
      case "SelectCaseStatement":
        this.walk(node.expression);
        for (const c of node.cases) this.walk(c);
        return;
      case "SelectCaseBranch":
        for (const v of node.values) this.walk(v);
        for (const s of node.body) this.walk(s);
        return;
      case "ReturnStatement":
        if (node.expression) this.walk(node.expression);
        return;
      case "ExitStatement":
        return;
      case "ThrowStatement":
        this.walk(node.expression);
        return;
      case "Block":
        for (const s of node.statements) this.walk(s);
        return;
      case "WithStatement":
        this.walk(node.expression);
        for (const s of node.body) this.walk(s);
        return;
      case "BinaryExpression":
        this.walk(node.left);
        this.walk(node.right);
        return;
      case "UnaryExpression":
        this.walk(node.argument);
        return;
      case "TernaryExpression":
        this.walk(node.condition);
        this.walk(node.trueExpr);
        this.walk(node.falseExpr);
        return;
      case "NullCoalescingExpression":
        this.walk(node.left);
        this.walk(node.right);
        return;
      case "OptionalChainingExpression":
        this.walk(node.target);
        this.walk(node.member);
        return;
      case "PipeExpression":
        this.walk(node.left);
        this.walk(node.right);
        return;
      case "TaggedTemplateExpression":
        return;
      case "EnumDeclaration":
        if (node.baseType) this.walk(node.baseType);
        for (const entry of node.entries) {
          if (entry.value) this.walk(entry.value);
        }
        return;
      case "DestructuredVariableDeclaration":
        for (const binding of node.bindings) {
          if (binding.defaultValue) this.walk(binding.defaultValue);
        }
        this.walk(node.initializer);
        return;
      case "ObjectInitializerExpression":
        this.walk(node.type);
        for (const arg of node.arguments) this.walk(arg);
        for (const assoc of node.assignments) this.walk(assoc.value);
        return;
      case "ArrayLiteralExpression":
        for (const el of node.elements) this.walk(el);
        return;
      case "SpreadExpression":
        this.walk(node.expression);
        return;
      case "ArrowFunctionExpression":
        for (const p of node.parameters) this.walk(p);
        if (node.returnType) this.walk(node.returnType);
        if (Array.isArray(node.body)) {
          for (const s of node.body) this.walk(s);
        } else {
          this.walk(node.body);
        }
        return;
      default: {
        const _exhaustive: never = node;
        return _exhaustive;
      }
    }
  }

  protected visitTypeReference(_node: TypeReference): void {
    // No-op base hook; subclasses override to react to TypeReference nodes.
  }
  protected visitTypeReferenceExpression(_node: TypeReferenceExpression): void {
    // No-op base hook; subclasses override to react to TypeReferenceExpression nodes.
  }
  protected visitMethodInvocation(_node: MethodInvocation): void {
    // No-op base hook; subclasses override to react to MethodInvocation nodes.
  }
  protected visitOpaqueStatement(_node: OpaqueStatement): void {
    // No-op base hook; subclasses override to react to OpaqueStatement nodes.
  }
  protected visitImportsDeclaration(_node: ImportsDeclaration): void {
    // No-op base hook; subclasses override to react to ImportsDeclaration nodes.
  }
}

export interface EnumDeclaration extends BaseNode {
  readonly kind: "EnumDeclaration";
  name: string;
  baseType?: TypeReference;
  entries: { name: string; value?: Expression; loc?: SourceLocation }[];
  readonly modifiers?: string[];
}

export interface DestructuringBinding {
  name: string;
  property?: string;
  defaultValue?: Expression;
  isRest?: boolean;
}

export interface DestructuredVariableDeclaration extends BaseNode {
  readonly kind: "DestructuredVariableDeclaration";
  isObject: boolean;
  bindings: DestructuringBinding[];
  initializer: Expression;
}

export interface ObjectInitializerExpression extends BaseNode {
  readonly kind: "ObjectInitializerExpression";
  type: TypeReference;
  arguments: Expression[];
  assignments: { member: string; value: Expression }[];
}
