/**
 * Public surface of the generics monomorphization engine.
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
  ImportsDeclaration,
  ParameterDeclaration,
  PropertyDeclaration,
  SourceLocation,
  Statement,
  TopLevelMember,
  TypeParameter,
  TypeReference,
  VariableDeclaration,
} from "../ast/ast";
export { ASTWalker } from "../ast/ast";

export { deepClone } from "../ast/clone";

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
