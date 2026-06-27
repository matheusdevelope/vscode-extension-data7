import { parseBasic, serializeUnit, tokenize, type ParseResult } from "../../parser";
import {
  ASTWalker,
  type ClassDeclaration,
  type ClassMember,
  type CompilationUnit,
  type DelegateDeclaration,
  type EnumDeclaration,
  type FieldDeclaration,
  type ImportsDeclaration,
  type MethodDeclaration,
  type Node,
  type OpaqueStatement,
  type ParameterDeclaration,
  type PropertyDeclaration,
  type Statement,
  type TopLevelMember,
  type TypeParameter,
  type TypeReference,
  type VariableDeclaration,
} from "../../ast/ast";

export interface RemoveUnusedModuleInput {
  readonly moduleName: string;
  readonly fileUri: string;
  readonly code: string;
}

export interface RemoveUnusedResult {
  readonly modules: ReadonlyMap<string, string>;
}

interface ParsedModule {
  readonly input: RemoveUnusedModuleInput;
  readonly parse: ParseResult;
}

type DeclarationKind =
  | "namespace"
  | "class"
  | "method"
  | "property"
  | "field"
  | "delegate"
  | "variable"
  | "enum";

interface Declaration {
  readonly key: string;
  readonly kind: DeclarationKind;
  readonly name: string;
  readonly node:
    | TopLevelMember
    | ClassDeclaration
    | ClassMember
    | DelegateDeclaration
    | VariableDeclaration
    | EnumDeclaration;
  readonly module: ParsedModule;
  readonly namespace?: Declaration;
  readonly ownerClass?: Declaration;
  readonly keep: boolean;
}

interface DeclarationRegistry {
  readonly declarations: Declaration[];
  readonly byName: Map<string, Declaration[]>;
  readonly byNode: WeakMap<object, Declaration>;
}

const RESERVED_WORDS = new Set([
  "and",
  "as",
  "byref",
  "byval",
  "case",
  "catch",
  "class",
  "const",
  "delegate",
  "dim",
  "else",
  "elseif",
  "end",
  "enum",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "imports",
  "inherits",
  "in",
  "is",
  "me",
  "mybase",
  "namespace",
  "new",
  "next",
  "not",
  "null",
  "or",
  "private",
  "property",
  "protected",
  "public",
  "return",
  "shared",
  "step",
  "structure",
  "sub",
  "then",
  "to",
  "true",
  "try",
  "while",
  "with",
]);

const KEEP_DIRECTIVE_PATTERN = /'\s*@data7:(?:keep|keep-name|entrypoint|external-api)\b/i;

export function removeUnusedDeclarations(
  modules: readonly RemoveUnusedModuleInput[],
): RemoveUnusedResult {
  const parsed = parseModules(modules);
  if (parsed.some((module) => module.parse.errors.length > 0)) {
    return {
      modules: new Map(modules.map((module) => [module.moduleName, module.code])),
    };
  }

  const registry = buildRegistry(parsed);
  const live = computeReachableDeclarations(parsed, registry);
  const optimized = new Map<string, string>();

  for (const module of parsed) {
    pruneCompilationUnit(module.parse.unit, live, registry);
    optimized.set(module.input.moduleName, serializeUnit(module.parse.unit, { eol: "\r\n" }));
  }

  return { modules: optimized };
}

function parseModules(modules: readonly RemoveUnusedModuleInput[]): ParsedModule[] {
  return modules.map((input) => ({
    input,
    parse: parseBasic(input.code),
  }));
}

function buildRegistry(modules: readonly ParsedModule[]): DeclarationRegistry {
  const declarations: Declaration[] = [];
  const byName = new Map<string, Declaration[]>();
  const byNode = new WeakMap<object, Declaration>();

  const add = (decl: Declaration): Declaration => {
    declarations.push(decl);
    const names = declarationLookupNames(decl);
    for (const name of names) {
      const bucket = byName.get(name) ?? [];
      bucket.push(decl);
      byName.set(name, bucket);
    }
    byNode.set(decl.node, decl);
    return decl;
  };

  for (const module of modules) {
    collectTopLevelDeclarations(module.parse.unit.members, module, add);
  }

  return { declarations, byName, byNode };
}

function collectTopLevelDeclarations(
  members: readonly TopLevelMember[],
  module: ParsedModule,
  add: (decl: Declaration) => Declaration,
  namespace?: Declaration,
): void {
  for (const member of members) {
    if (member.kind === "NamespaceDeclaration") {
      const ns = add({
        key: `${module.input.moduleName}:namespace:${member.name}`,
        kind: "namespace",
        name: member.name,
        node: member,
        module,
        keep: hasKeepDirective(module, member.loc?.startLine),
      });
      collectTopLevelDeclarations(member.members, module, add, ns);
    } else if (member.kind === "ClassDeclaration") {
      collectClassDeclaration(member, module, add, namespace);
    } else if (member.kind === "MethodDeclaration") {
      add({
        key: `${module.input.moduleName}:method:${qualifiedName(namespace, undefined, member.name)}`,
        kind: "method",
        name: member.name,
        node: member,
        module,
        namespace,
        keep: hasKeepDirective(module, member.loc?.startLine),
      });
    } else if (member.kind === "DelegateDeclaration") {
      add({
        key: `${module.input.moduleName}:delegate:${qualifiedName(namespace, undefined, member.name)}`,
        kind: "delegate",
        name: member.name,
        node: member,
        module,
        namespace,
        keep: hasKeepDirective(module, member.loc?.startLine),
      });
    } else if (member.kind === "VariableDeclaration") {
      add({
        key: `${module.input.moduleName}:variable:${qualifiedName(namespace, undefined, member.name)}`,
        kind: "variable",
        name: member.name,
        node: member,
        module,
        namespace,
        keep: hasKeepDirective(module, member.loc?.startLine),
      });
    } else if (member.kind === "EnumDeclaration") {
      add({
        key: `${module.input.moduleName}:enum:${qualifiedName(namespace, undefined, member.name)}`,
        kind: "enum",
        name: member.name,
        node: member,
        module,
        namespace,
        keep: hasKeepDirective(module, member.loc?.startLine),
      });
    }
  }
}

function collectClassDeclaration(
  klass: ClassDeclaration,
  module: ParsedModule,
  add: (decl: Declaration) => Declaration,
  namespace?: Declaration,
  ownerClass?: Declaration,
): Declaration {
  const classDecl = add({
    key: `${module.input.moduleName}:class:${qualifiedName(namespace, ownerClass, klass.name)}`,
    kind: "class",
    name: klass.name,
    node: klass,
    module,
    namespace,
    ownerClass,
    keep: hasKeepDirective(module, klass.loc?.startLine),
  });

  for (const member of klass.members) {
    if (member.kind === "ClassDeclaration") {
      collectClassDeclaration(member, module, add, namespace, classDecl);
      continue;
    }
    const kind = classMemberDeclarationKind(member);
    add({
      key: `${module.input.moduleName}:${kind}:${qualifiedName(namespace, classDecl, member.name)}`,
      kind,
      name: member.name,
      node: member,
      module,
      namespace,
      ownerClass: classDecl,
      keep: hasKeepDirective(module, member.loc?.startLine),
    });
  }

  return classDecl;
}

function classMemberDeclarationKind(
  member: Exclude<ClassMember, ClassDeclaration>,
): DeclarationKind {
  if (member.kind === "MethodDeclaration") return "method";
  if (member.kind === "PropertyDeclaration") return "property";
  return "field";
}

function computeReachableDeclarations(
  modules: readonly ParsedModule[],
  registry: DeclarationRegistry,
): Set<Declaration> {
  const live = new Set<Declaration>();
  const queue: Declaration[] = [];

  const mark = (decl: Declaration | undefined): void => {
    if (!decl || live.has(decl)) return;
    live.add(decl);
    queue.push(decl);
    mark(decl.namespace);
    mark(decl.ownerClass);

    if (decl.kind === "class" && decl.node.kind === "ClassDeclaration") {
      for (const member of decl.node.members) {
        if (member.kind === "MethodDeclaration" && member.name.toLowerCase() === "new") {
          mark(registry.byNode.get(member));
        }
      }
    }
  };

  for (const module of modules) {
    seedModuleRoots(module, registry, mark);
  }
  for (const decl of registry.declarations) {
    if (decl.keep) mark(decl);
  }

  while (queue.length > 0) {
    const decl = queue.shift();
    if (!decl) continue;
    const refs = collectReferencesFromDeclaration(decl);
    for (const ref of refs) {
      for (const candidate of registry.byName.get(ref) ?? []) {
        mark(candidate);
      }
    }
  }

  return live;
}

function seedModuleRoots(
  module: ParsedModule,
  registry: DeclarationRegistry,
  mark: (decl: Declaration | undefined) => void,
): void {
  const isPrincipal = module.input.moduleName.toLowerCase() === "principal";
  const rootRefs = new Set<string>();
  for (const member of module.parse.unit.members) {
    if (isStatementLike(member)) {
      collectReferences(member, rootRefs);
    }
  }

  for (const ref of rootRefs) {
    for (const candidate of registry.byName.get(ref) ?? []) {
      mark(candidate);
    }
  }

  if (!isPrincipal) return;

  const principalDeclarations = registry.declarations.filter((decl) => decl.module === module);
  for (const decl of principalDeclarations) {
    if (decl.kind === "method" && decl.name.toLowerCase() === "main") {
      mark(decl);
    }
  }

  if (
    !principalDeclarations.some(
      (decl) => decl.kind === "method" && decl.name.toLowerCase() === "main",
    )
  ) {
    for (const decl of principalDeclarations) {
      mark(decl);
    }
  }
}

function collectReferencesFromDeclaration(decl: Declaration): Set<string> {
  const refs = new Set<string>();
  const node = decl.node;

  if (node.kind === "ClassDeclaration") {
    if (node.baseType) collectReferences(node.baseType, refs);
    for (const typeParam of node.typeParameters) collectReferences(typeParam, refs);
    return refs;
  }

  if (node.kind === "MethodDeclaration") {
    collectMethodReferences(node, refs);
  } else if (node.kind === "PropertyDeclaration") {
    for (const param of node.parameters ?? []) collectReferences(param, refs);
    collectReferences(node.type, refs);
    if (node.getter) collectMethodReferences(node.getter, refs);
    if (node.setter) collectMethodReferences(node.setter, refs);
  } else if (node.kind === "FieldDeclaration") {
    collectReferences(node.type, refs);
    for (const dimension of node.nativeArrayDimensions ?? []) collectReferences(dimension, refs);
    if (node.initializer) collectReferences(node.initializer, refs);
  } else if (node.kind === "DelegateDeclaration") {
    for (const typeParam of node.typeParameters) collectReferences(typeParam, refs);
    for (const param of node.parameters) collectReferences(param, refs);
    if (node.returnType) collectReferences(node.returnType, refs);
  } else if (node.kind === "VariableDeclaration") {
    if (node.type) collectReferences(node.type, refs);
    for (const dimension of node.nativeArrayDimensions ?? []) collectReferences(dimension, refs);
    if (node.initializer) collectReferences(node.initializer, refs);
  } else if (node.kind === "EnumDeclaration") {
    if (node.baseType) collectReferences(node.baseType, refs);
    for (const entry of node.entries) {
      if (entry.value) collectReferences(entry.value, refs);
    }
  }

  return refs;
}

function collectMethodReferences(method: MethodDeclaration, refs: Set<string>): void {
  for (const typeParam of method.typeParameters) collectReferences(typeParam, refs);
  for (const param of method.parameters) collectReferences(param, refs);
  if (method.returnType) collectReferences(method.returnType, refs);
  for (const statement of method.body) collectReferences(statement, refs);
}

function collectReferences(
  node: Node | ParameterDeclaration | TypeParameter,
  refs: Set<string>,
): void {
  new ReferenceCollector(refs).walk(node as Node);
}

function pruneCompilationUnit(
  unit: CompilationUnit,
  live: ReadonlySet<Declaration>,
  registry: DeclarationRegistry,
): void {
  unit.members = pruneTopLevelMembers(unit.members, live, registry);
}

function pruneTopLevelMembers(
  members: TopLevelMember[],
  live: ReadonlySet<Declaration>,
  registry: DeclarationRegistry,
): TopLevelMember[] {
  const result: TopLevelMember[] = [];

  for (const member of members) {
    if (member.kind === "NamespaceDeclaration") {
      member.members = pruneTopLevelMembers(member.members, live, registry);
      if (member.members.length > 0 || isLive(member, live, registry)) {
        result.push(member);
      }
      continue;
    }

    if (member.kind === "ClassDeclaration") {
      if (!isLive(member, live, registry)) continue;
      member.members = pruneClassMembers(member.members, live, registry);
      result.push(member);
      continue;
    }

    if (isDeclarationMember(member)) {
      if (isLive(member, live, registry)) result.push(member);
      continue;
    }

    result.push(member);
  }

  return result;
}

function pruneClassMembers(
  members: ClassMember[],
  live: ReadonlySet<Declaration>,
  registry: DeclarationRegistry,
): ClassMember[] {
  const result: ClassMember[] = [];
  for (const member of members) {
    if (member.kind === "ClassDeclaration") {
      if (!isLive(member, live, registry)) continue;
      member.members = pruneClassMembers(member.members, live, registry);
      result.push(member);
      continue;
    }

    if (isLive(member, live, registry)) {
      result.push(member);
    }
  }
  return result;
}

function isLive(
  node: object,
  live: ReadonlySet<Declaration>,
  registry: DeclarationRegistry,
): boolean {
  const decl = registry.byNode.get(node);
  return decl !== undefined && live.has(decl);
}

function isDeclarationMember(member: TopLevelMember): boolean {
  return (
    member.kind === "MethodDeclaration" ||
    member.kind === "DelegateDeclaration" ||
    member.kind === "VariableDeclaration" ||
    member.kind === "EnumDeclaration"
  );
}

function isStatementLike(member: TopLevelMember): member is Statement | ImportsDeclaration {
  return (
    member.kind !== "NamespaceDeclaration" &&
    member.kind !== "ClassDeclaration" &&
    member.kind !== "MethodDeclaration" &&
    member.kind !== "DelegateDeclaration" &&
    member.kind !== "VariableDeclaration" &&
    member.kind !== "EnumDeclaration"
  );
}

class ReferenceCollector extends ASTWalker {
  constructor(private readonly refs: Set<string>) {
    super();
  }

  public override walk(node: Node): void {
    if (node.kind === "Identifier") {
      addReference(this.refs, node.name);
      return;
    }
    super.walk(node);
  }

  protected override visitTypeReference(node: TypeReference): void {
    addReference(this.refs, node.name);
  }

  protected override visitMethodInvocation(node: { readonly methodName: string }): void {
    addReference(this.refs, node.methodName);
  }

  protected override visitOpaqueStatement(node: OpaqueStatement): void {
    for (const token of tokenize(node.text)) {
      if (token.kind !== "identifier" && token.kind !== "keyword") continue;
      addReference(this.refs, token.value);
    }
  }
}

function addReference(refs: Set<string>, rawName: string): void {
  const names = normalizeLookupNames(rawName);
  for (const name of names) {
    if (!RESERVED_WORDS.has(name)) refs.add(name);
  }
}

function declarationLookupNames(decl: Declaration): Set<string> {
  return normalizeLookupNames(decl.name);
}

function normalizeLookupNames(rawName: string): Set<string> {
  const result = new Set<string>();
  const trimmed = rawName.trim();
  if (!trimmed) return result;
  const lower = trimmed.toLowerCase();
  result.add(lower);
  const lastDot = lower.lastIndexOf(".");
  if (lastDot !== -1 && lastDot < lower.length - 1) {
    result.add(lower.substring(lastDot + 1));
  }
  return result;
}

function qualifiedName(
  namespace: Declaration | undefined,
  ownerClass: Declaration | undefined,
  name: string,
): string {
  const parts: string[] = [];
  if (namespace) parts.push(namespace.name);
  if (ownerClass) parts.push(ownerClass.name);
  parts.push(name);
  return parts.join(".");
}

function hasKeepDirective(module: ParsedModule, startLine: number | undefined): boolean {
  if (startLine === undefined || startLine <= 1) return false;
  const lines = module.input.code.split(/\r?\n/);
  for (let index = startLine - 2; index >= 0; index--) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    return KEEP_DIRECTIVE_PATTERN.test(trimmed);
  }
  return false;
}
