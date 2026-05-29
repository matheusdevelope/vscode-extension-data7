/**
 * Public surface of the generics monomorphization engine.
 *
 * Consumers should import from this barrel only — the internal split
 * (`ast.ts`, `clone.ts`, `monomorphizer.ts`, `registry.ts`, `warnings.ts`)
 * is an implementation detail and may change without notice.
 */

export type {
  Assignment,
  ClassDeclaration,
  ClassMember,
  CompilationUnit,
  DelegateDeclaration,
  Expression,
  ExpressionStatement,
  FieldDeclaration,
  Identifier,
  Literal,
  MemberAccess,
  MethodDeclaration,
  MethodInvocation,
  NamespaceDeclaration,
  Node,
  ObjectCreationExpression,
  OpaqueStatement,
  ParameterDeclaration,
  PropertyDeclaration,
  SourceLocation,
  Statement,
  TopLevelMember,
  TypeParameter,
  TypeReference,
  VariableDeclaration,
} from "./ast";
export { ASTWalker } from "./ast";

export { deepClone } from "./clone";

export type { GenericTemplate, TemplateKind } from "./registry";
export { GlobalInstantiatedSet, TemplateRegistry } from "./registry";

export type { MonomorphizationWarning, MonomorphizationWarningCode } from "./warnings";

export type { MonomorphizationResult } from "./monomorphizer";
export {
  canonicalNameOf,
  flatNameFromParts,
  flatNameOf,
  GenericsMonomorphizer,
  MAX_INSTANTIATIONS,
} from "./monomorphizer";
