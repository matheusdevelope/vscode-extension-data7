/**
 * AST node types for the generics monomorphization engine.
 *
 * **Status: placeholder.** The Data7 codebase currently has no formal AST
 * for `.bas` source — `src/analysis/symbol-indexer.ts` is line-oriented and
 * regex-driven. The types declared here are a self-contained, minimal AST
 * sufficient to express the constructs the monomorphizer needs to manipulate
 * (declarations with type parameters, references with type arguments, usage
 * sites). When a full parser lands, this file should be reconciled with the
 * parser's output: either by aligning these types with the parser's own, or
 * by introducing an adapter at the parser/engine boundary.
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
  | VariableDeclaration
  | ObjectCreationExpression
  | MethodInvocation
  | MemberAccess
  | Identifier
  | Literal
  | Assignment
  | ExpressionStatement
  | OpaqueStatement;

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
  | Statement;

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
}

export type ClassMember = MethodDeclaration | FieldDeclaration | PropertyDeclaration;

export interface MethodDeclaration extends BaseNode {
  readonly kind: "MethodDeclaration";
  name: string;
  typeParameters: TypeParameter[];
  parameters: ParameterDeclaration[];
  returnType?: TypeReference;
  body: Statement[];
}

export interface DelegateDeclaration extends BaseNode {
  readonly kind: "DelegateDeclaration";
  name: string;
  typeParameters: TypeParameter[];
  parameters: ParameterDeclaration[];
  returnType?: TypeReference;
}

export interface FieldDeclaration extends BaseNode {
  readonly kind: "FieldDeclaration";
  name: string;
  type: TypeReference;
  initializer?: Expression;
}

export interface PropertyDeclaration extends BaseNode {
  readonly kind: "PropertyDeclaration";
  name: string;
  type: TypeReference;
}

export interface ParameterDeclaration extends BaseNode {
  readonly kind: "ParameterDeclaration";
  name: string;
  type: TypeReference;
  isByRef?: boolean;
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

export interface VariableDeclaration extends BaseNode {
  readonly kind: "VariableDeclaration";
  name: string;
  type?: TypeReference;
  initializer?: Expression;
}

export type Expression =
  | ObjectCreationExpression
  | MethodInvocation
  | MemberAccess
  | Identifier
  | Literal;

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

export type Statement = ExpressionStatement | Assignment | VariableDeclaration | OpaqueStatement;

export interface ExpressionStatement extends BaseNode {
  readonly kind: "ExpressionStatement";
  expression: Expression;
}

export interface Assignment extends BaseNode {
  readonly kind: "Assignment";
  target: Expression;
  value: Expression;
}

/**
 * Catch-all node for body lines the parser does not structurally
 * understand. Stores the verbatim source `text` so the serializer can
 * emit it unchanged, and so the monomorphizer's substitution walker can
 * apply lexical-aware type-parameter substitution to it (preserving the
 * textual pass's behaviour for body lines).
 */
export interface OpaqueStatement extends BaseNode {
  readonly kind: "OpaqueStatement";
  /** Verbatim line text (without trailing EOL). */
  text: string;
}

// ============================================================================
// Visitor / Walker
// ============================================================================

/**
 * Read-only depth-first walker. Subclasses override the `visit*` hooks they
 * care about; structural recursion is handled here. Hooks fire **after**
 * children have been visited (post-order) so subclasses can rely on inner
 * type arguments having already been processed.
 *
 * Mutating the AST during traversal (e.g. renaming a TypeReference in the
 * `visitTypeReference` hook) is supported — the walker does not memoize
 * children.
 */
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
        this.walk(node.type);
        return;
      case "ParameterDeclaration":
        this.walk(node.type);
        return;
      case "TypeParameter":
        if (node.constraint) this.walk(node.constraint);
        return;
      case "TypeReference":
        for (const t of node.typeArguments) this.walk(t);
        this.visitTypeReference(node);
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
        // OpaqueStatement is a leaf. Subclasses that need to inspect its
        // verbatim text (e.g. the monomorphizer's substitution walker)
        // can override a dedicated hook.
        if (node.kind === "OpaqueStatement") this.visitOpaqueStatement(node);
        return;
      case "ExpressionStatement":
        this.walk(node.expression);
        return;
      case "Assignment":
        this.walk(node.target);
        this.walk(node.value);
        return;
      default: {
        // Exhaustiveness: if a new node kind is added to `Node`, this branch
        // must be updated. The `never` widening enforces that statically.
        const _exhaustive: never = node;
        return _exhaustive;
      }
    }
  }

  protected visitTypeReference(_node: TypeReference): void {
    // No-op base hook; subclasses override to react to TypeReference nodes.
  }
  protected visitMethodInvocation(_node: MethodInvocation): void {
    // No-op base hook; subclasses override to react to MethodInvocation nodes.
  }
  protected visitOpaqueStatement(_node: OpaqueStatement): void {
    // No-op base hook; subclasses override to react to OpaqueStatement nodes.
  }
}
