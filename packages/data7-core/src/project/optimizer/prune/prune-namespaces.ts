import {
  parseBasic,
  serializeUnit,
  tokenize,
  BUILD_SERIALIZE_OPTIONS,
  type ParseResult,
} from "../../parser";
import {
  ASTWalker,
  type ClassDeclaration,
  type ClassMember,
  type CompilationUnit,
  type Expression,
  type ImportsDeclaration,
  type MethodDeclaration,
  type NamespaceDeclaration,
  type Node,
  type OpaqueStatement,
  type TopLevelMember,
  type TypeReference,
} from "../../ast/ast";
import type { PruneModuleInput, PruneReport, PruneResult } from "./prune-types";
import type { PruneOptimizationOptions } from "../optimization-options";

const KEEP_DIRECTIVE_PATTERN = /'\s*@data7:(?:keep|keep-name|entrypoint|external-api)\b/i;

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

interface ParsedPruneModule {
  readonly input: PruneModuleInput;
  readonly parse: ParseResult;
}

interface NamespaceRecord {
  readonly name: string;
  readonly lower: string;
  readonly node: NamespaceDeclaration;
  readonly module: ParsedPruneModule;
  readonly keep: boolean;
}

interface MethodRecord {
  readonly key: string;
  readonly name: string;
  readonly lower: string;
  readonly namespace: string;
  readonly namespaceLower: string;
  readonly className?: string;
  readonly module: ParsedPruneModule;
  readonly node: MethodDeclaration;
}

interface ClassRecord {
  readonly key: string;
  readonly name: string;
  readonly lower: string;
  readonly namespace: string;
  readonly namespaceLower: string;
  readonly module: ParsedPruneModule;
  readonly node: ClassDeclaration;
}

interface PruneIndex {
  readonly modules: readonly ParsedPruneModule[];
  readonly namespaces: readonly NamespaceRecord[];
  readonly namespaceByLower: ReadonlyMap<string, NamespaceRecord>;
  readonly namespaceOwners: ReadonlyMap<string, ParsedPruneModule>;
  readonly moduleImports: ReadonlyMap<string, readonly string[]>;
  readonly methods: readonly MethodRecord[];
  readonly methodByKey: ReadonlyMap<string, MethodRecord>;
  readonly methodsByLower: ReadonlyMap<string, readonly MethodRecord[]>;
  readonly classes: readonly ClassRecord[];
  readonly classesByLower: ReadonlyMap<string, readonly ClassRecord[]>;
  readonly principalModule?: ParsedPruneModule;
}

function hasNamespaceDeclarations(members: readonly TopLevelMember[]): boolean {
  return members.some((member) => member.kind === "NamespaceDeclaration");
}

function moduleDeclaresLiveNamespace(
  module: ParsedPruneModule,
  index: PruneIndex,
  liveNamespaces: ReadonlySet<string>,
): boolean {
  return index.namespaces.some(
    (namespace) => namespace.module === module && liveNamespaces.has(namespace.lower),
  );
}

function shouldExcludeEntireModule(
  module: ParsedPruneModule,
  index: PruneIndex,
  liveNamespaces: ReadonlySet<string>,
): boolean {
  if (module.input.moduleName.toLowerCase() === "principal") {
    return false;
  }
  const declaredNamespaces = index.namespaces.filter((namespace) => namespace.module === module);
  if (declaredNamespaces.length === 0) {
    return true;
  }
  return !moduleDeclaresLiveNamespace(module, index, liveNamespaces);
}

export function pruneBuildModules(
  modules: readonly PruneModuleInput[],
  options: PruneOptimizationOptions,
): PruneResult {
  if (!options.enabled) {
    return {
      modules: new Map(modules.map((module) => [module.moduleName, module.code])),
      excludedModuleNames: new Set(),
    };
  }

  const parsed = modules.map((input) => ({
    input,
    parse: parseBasic(input.code),
  }));

  if (parsed.some((module) => module.parse.errors.length > 0)) {
    return {
      modules: new Map(modules.map((module) => [module.moduleName, module.code])),
      excludedModuleNames: new Set(),
      report: {
        strategy: "principal-closure",
        liveNamespaces: [],
        excludedNamespaces: [],
        excludedModules: [],
        warnings: ["Prune skipped because at least one module failed to parse."],
      },
    };
  }

  const index = buildPruneIndex(parsed);
  const liveNamespaces = computeLiveNamespaces(index, options);
  const optimized = new Map<string, string>();
  const excludedModuleNames = new Set<string>();
  const excludedNamespaces: string[] = [];

  for (const namespace of index.namespaces) {
    if (!liveNamespaces.has(namespace.lower)) {
      excludedNamespaces.push(namespace.name);
    }
  }

  for (const module of parsed) {
    if (shouldExcludeEntireModule(module, index, liveNamespaces)) {
      excludedModuleNames.add(module.input.moduleName);
      continue;
    }

    const pruned = pruneModuleCompilationUnit(
      module.parse.unit,
      module,
      liveNamespaces,
      index.moduleImports.get(module.input.moduleName) ?? [],
    );
    if (!hasNamespaceDeclarations(pruned.members)) {
      excludedModuleNames.add(module.input.moduleName);
      continue;
    }
    optimized.set(
      module.input.moduleName,
      serializeUnit(pruned, {
        eol: module.input.code.includes("\r\n") ? "\r\n" : "\n",
        ...BUILD_SERIALIZE_OPTIONS,
      }),
    );
  }

  const report: PruneReport | undefined = options.report
    ? {
        strategy: "principal-closure",
        liveNamespaces: [...liveNamespaces].map(
          (lower) => index.namespaceByLower.get(lower)?.name ?? lower,
        ),
        excludedNamespaces,
        excludedModules: [...excludedModuleNames],
        warnings: [],
      }
    : undefined;

  return { modules: optimized, excludedModuleNames, report };
}

function buildPruneIndex(modules: readonly ParsedPruneModule[]): PruneIndex {
  const namespaces: NamespaceRecord[] = [];
  const namespaceByLower = new Map<string, NamespaceRecord>();
  const namespaceOwners = new Map<string, ParsedPruneModule>();
  const moduleImports = new Map<string, readonly string[]>();
  const methods: MethodRecord[] = [];
  const methodByKey = new Map<string, MethodRecord>();
  const methodsByLower = new Map<string, MethodRecord[]>();
  const classes: ClassRecord[] = [];
  const classesByLower = new Map<string, ClassRecord[]>();

  let principalModule: ParsedPruneModule | undefined;

  for (const module of modules) {
    if (module.input.moduleName.toLowerCase() === "principal") {
      principalModule = module;
    }
    moduleImports.set(module.input.moduleName, collectModuleImports(module.parse.unit.members));
    collectFromMembers(module.parse.unit.members, module, undefined, undefined, {
      namespaces,
      namespaceByLower,
      namespaceOwners,
      methods,
      methodByKey,
      methodsByLower,
      classes,
      classesByLower,
    });
  }

  return {
    modules,
    namespaces,
    namespaceByLower,
    namespaceOwners,
    moduleImports,
    methods,
    methodByKey,
    methodsByLower,
    classes,
    classesByLower,
    principalModule,
  };
}

function collectFromMembers(
  members: readonly TopLevelMember[],
  module: ParsedPruneModule,
  namespace: NamespaceRecord | undefined,
  ownerClass: ClassRecord | undefined,
  buckets: {
    readonly namespaces: NamespaceRecord[];
    readonly namespaceByLower: Map<string, NamespaceRecord>;
    readonly namespaceOwners: Map<string, ParsedPruneModule>;
    readonly methods: MethodRecord[];
    readonly methodByKey: Map<string, MethodRecord>;
    readonly methodsByLower: Map<string, MethodRecord[]>;
    readonly classes: ClassRecord[];
    readonly classesByLower: Map<string, ClassRecord[]>;
  },
): void {
  for (const member of members) {
    if (member.kind === "NamespaceDeclaration") {
      const record: NamespaceRecord = {
        name: member.name,
        lower: member.name.toLowerCase(),
        node: member,
        module,
        keep: hasKeepDirective(module, member.loc?.startLine),
      };
      buckets.namespaces.push(record);
      buckets.namespaceByLower.set(record.lower, record);
      buckets.namespaceOwners.set(record.lower, module);
      collectFromMembers(member.members, module, record, undefined, buckets);
      continue;
    }

    if (member.kind === "ClassDeclaration") {
      const classRecord: ClassRecord = {
        key: classKey(module.input.moduleName, namespace?.name, member.name),
        name: member.name,
        lower: member.name.toLowerCase(),
        namespace: namespace?.name ?? "",
        namespaceLower: namespace?.lower ?? "",
        module,
        node: member,
      };
      buckets.classes.push(classRecord);
      pushBucket(buckets.classesByLower, classRecord.lower, classRecord);
      collectClassMembers(member.members, module, namespace, classRecord, buckets);
      continue;
    }

    if (member.kind === "MethodDeclaration") {
      registerMethod(member, module, namespace, ownerClass, buckets);
    }
  }
}

function collectClassMembers(
  members: readonly ClassMember[],
  module: ParsedPruneModule,
  namespace: NamespaceRecord | undefined,
  ownerClass: ClassRecord,
  buckets: {
    readonly methods: MethodRecord[];
    readonly methodByKey: Map<string, MethodRecord>;
    readonly methodsByLower: Map<string, MethodRecord[]>;
    readonly classes: ClassRecord[];
    readonly classesByLower: Map<string, ClassRecord[]>;
    readonly namespaces: NamespaceRecord[];
    readonly namespaceByLower: Map<string, NamespaceRecord>;
    readonly namespaceOwners: Map<string, ParsedPruneModule>;
  },
): void {
  for (const member of members) {
    if (member.kind === "ClassDeclaration") {
      const nestedClass: ClassRecord = {
        key: classKey(
          module.input.moduleName,
          namespace?.name,
          `${ownerClass.name}.${member.name}`,
        ),
        name: member.name,
        lower: member.name.toLowerCase(),
        namespace: namespace?.name ?? "",
        namespaceLower: namespace?.lower ?? "",
        module,
        node: member,
      };
      buckets.classes.push(nestedClass);
      pushBucket(buckets.classesByLower, nestedClass.lower, nestedClass);
      collectClassMembers(member.members, module, namespace, nestedClass, buckets);
      continue;
    }
    if (member.kind === "MethodDeclaration") {
      registerMethod(member, module, namespace, ownerClass, buckets);
    }
  }
}

function registerMethod(
  method: MethodDeclaration,
  module: ParsedPruneModule,
  namespace: NamespaceRecord | undefined,
  ownerClass: ClassRecord | undefined,
  buckets: {
    readonly methods: MethodRecord[];
    readonly methodByKey: Map<string, MethodRecord>;
    readonly methodsByLower: Map<string, MethodRecord[]>;
  },
): void {
  const record: MethodRecord = {
    key: methodKey(module.input.moduleName, namespace?.name ?? "", ownerClass?.name, method.name),
    name: method.name,
    lower: method.name.toLowerCase(),
    namespace: namespace?.name ?? "",
    namespaceLower: namespace?.lower ?? "",
    className: ownerClass?.name,
    module,
    node: method,
  };
  buckets.methods.push(record);
  buckets.methodByKey.set(record.key, record);
  pushBucket(buckets.methodsByLower, record.lower, record);
}

function computeLiveNamespaces(
  index: PruneIndex,
  options: PruneOptimizationOptions,
): ReadonlySet<string> {
  const live = new Set<string>();
  const liveMethods = new Set<string>();
  const methodQueue: MethodRecord[] = [];

  const markNamespace = (namespaceLower: string | undefined): void => {
    if (!namespaceLower || live.has(namespaceLower)) return;
    live.add(namespaceLower);
    absorbNamespaceOutboundReferences(namespaceLower, index, markNamespace, enqueueMethod);
    const owner = index.namespaceOwners.get(namespaceLower);
    if (!owner) return;
    for (const imported of index.moduleImports.get(owner.input.moduleName) ?? []) {
      markNamespace(imported.toLowerCase());
    }
  };

  const enqueueMethod = (method: MethodRecord | undefined): void => {
    if (!method || liveMethods.has(method.key)) return;
    liveMethods.add(method.key);
    methodQueue.push(method);
    if (method.namespaceLower) markNamespace(method.namespaceLower);
  };

  for (const alwaysInclude of options.alwaysInclude) {
    markNamespace(alwaysInclude.toLowerCase());
  }

  for (const namespace of index.namespaces) {
    if (namespace.keep) markNamespace(namespace.lower);
  }

  const principal = index.principalModule;
  if (principal) {
    for (const member of principal.parse.unit.members) {
      if (isExecutableTopLevel(member)) {
        const refs = collectExpressionReferences(member);
        resolveReferencesToNamespaces(
          refs,
          principal,
          undefined,
          index,
          markNamespace,
          enqueueMethod,
        );
      }
    }

    const mainMethods = index.methods.filter(
      (method) =>
        method.module === principal && method.lower === "main" && method.className !== undefined,
    );
    if (mainMethods.length > 0) {
      for (const main of mainMethods) enqueueMethod(main);
    } else {
      const topLevelMain = index.methods.find(
        (method) => method.module === principal && method.lower === "main",
      );
      if (topLevelMain) enqueueMethod(topLevelMain);
    }
  }

  while (methodQueue.length > 0) {
    const method = methodQueue.shift();
    if (!method) continue;
    const refs = collectMethodReferences(method.node);
    resolveReferencesToNamespaces(
      refs,
      method.module,
      method.namespaceLower || undefined,
      index,
      markNamespace,
      enqueueMethod,
    );
  }

  if (principal) {
    for (const namespace of index.namespaces) {
      if (namespace.module === principal && live.has(namespace.lower)) {
        markNamespace(namespace.lower);
      }
    }
  }

  return live;
}

interface ReferenceSeed {
  readonly name: string;
  readonly lower: string;
  readonly qualifierLower?: string;
  readonly isNewExpression: boolean;
}

function resolveReferencesToNamespaces(
  refs: readonly ReferenceSeed[],
  contextModule: ParsedPruneModule,
  contextNamespaceLower: string | undefined,
  index: PruneIndex,
  markNamespace: (namespaceLower: string | undefined) => void,
  enqueueMethod: (method: MethodRecord | undefined) => void,
): void {
  const importSet = new Set(
    (index.moduleImports.get(contextModule.input.moduleName) ?? []).map((item) =>
      item.toLowerCase(),
    ),
  );

  for (const ref of refs) {
    if (ref.qualifierLower) {
      markNamespace(ref.qualifierLower);
      const classHits = (index.classesByLower.get(ref.lower) ?? []).filter(
        (candidate) => candidate.namespaceLower === ref.qualifierLower,
      );
      for (const classHit of classHits) {
        markNamespace(classHit.namespaceLower);
        if (ref.isNewExpression) {
          enqueueConstructor(classHit, index, enqueueMethod);
        }
      }
      const methodHits = (index.methodsByLower.get(ref.lower) ?? []).filter(
        (candidate) =>
          candidate.namespaceLower === ref.qualifierLower &&
          (!ref.isNewExpression || candidate.lower === "new"),
      );
      for (const methodHit of methodHits) enqueueMethod(methodHit);
      continue;
    }

    const methodCandidates = resolveMethodCandidates(
      ref,
      contextModule,
      contextNamespaceLower,
      importSet,
      index,
    );
    for (const methodCandidate of methodCandidates) enqueueMethod(methodCandidate);

    const classCandidates = resolveClassCandidates(
      ref,
      contextModule,
      contextNamespaceLower,
      importSet,
      index,
    );
    for (const classCandidate of classCandidates) {
      markNamespace(classCandidate.namespaceLower);
      if (ref.isNewExpression) {
        enqueueConstructor(classCandidate, index, enqueueMethod);
      }
    }

    const namespaceCandidate = index.namespaceByLower.get(ref.lower);
    if (namespaceCandidate) markNamespace(namespaceCandidate.lower);
  }
}

function resolveMethodCandidates(
  ref: ReferenceSeed,
  contextModule: ParsedPruneModule,
  contextNamespaceLower: string | undefined,
  importSet: ReadonlySet<string>,
  index: PruneIndex,
): readonly MethodRecord[] {
  const hits = index.methodsByLower.get(ref.lower) ?? [];
  const filtered = hits.filter((candidate) =>
    isCandidateInScope(candidate, contextModule, contextNamespaceLower, importSet, index),
  );
  return filtered.length > 0 ? filtered : [];
}

function resolveClassCandidates(
  ref: ReferenceSeed,
  contextModule: ParsedPruneModule,
  contextNamespaceLower: string | undefined,
  importSet: ReadonlySet<string>,
  index: PruneIndex,
): readonly ClassRecord[] {
  const hits = index.classesByLower.get(ref.lower) ?? [];
  return hits.filter((candidate) =>
    isCandidateInScope(candidate, contextModule, contextNamespaceLower, importSet, index),
  );
}

function isCandidateInScope(
  candidate: { readonly namespaceLower: string; readonly module: ParsedPruneModule },
  contextModule: ParsedPruneModule,
  contextNamespaceLower: string | undefined,
  importSet: ReadonlySet<string>,
  index: PruneIndex,
): boolean {
  if (candidate.module === contextModule) {
    if (!contextNamespaceLower) return true;
    return (
      candidate.namespaceLower === contextNamespaceLower || importSet.has(candidate.namespaceLower)
    );
  }
  if (candidate.module.input.moduleName.toLowerCase() === "principal") return true;
  return importSet.has(candidate.namespaceLower);
}

function enqueueConstructor(
  classRecord: ClassRecord,
  index: PruneIndex,
  enqueueMethod: (method: MethodRecord | undefined) => void,
): void {
  const ctor = (index.methodsByLower.get("new") ?? []).find(
    (method) =>
      method.className?.toLowerCase() === classRecord.lower &&
      method.namespaceLower === classRecord.namespaceLower &&
      method.module === classRecord.module,
  );
  enqueueMethod(ctor);
}

function pruneModuleCompilationUnit(
  unit: CompilationUnit,
  module: ParsedPruneModule,
  liveNamespaces: ReadonlySet<string>,
  imports: readonly string[],
): CompilationUnit {
  const liveImportSet = new Set(
    imports
      .filter((item) => liveNamespaces.has(item.toLowerCase()))
      .map((item) => item.toLowerCase()),
  );
  const members: TopLevelMember[] = [];

  for (const member of unit.members) {
    if (member.kind === "ImportsDeclaration") {
      if (liveImportSet.has(member.target.toLowerCase())) {
        members.push(member);
      }
      continue;
    }
    if (member.kind === "NamespaceDeclaration") {
      if (liveNamespaces.has(member.name.toLowerCase())) {
        members.push(member);
      }
      continue;
    }
    members.push(member);
  }

  return { ...unit, members };
}

function collectModuleImports(members: readonly TopLevelMember[]): readonly string[] {
  const imports: string[] = [];
  for (const member of members) {
    if (member.kind === "ImportsDeclaration" && member.target.trim().length > 0) {
      imports.push(member.target.trim());
    }
  }
  return imports;
}

function absorbNamespaceOutboundReferences(
  namespaceLower: string,
  index: PruneIndex,
  markNamespace: (namespaceLower: string | undefined) => void,
  enqueueMethod: (method: MethodRecord | undefined) => void,
): void {
  for (const method of index.methods) {
    if (method.namespaceLower !== namespaceLower) continue;
    const refs = collectMethodReferences(method.node);
    resolveReferencesToNamespaces(
      refs,
      method.module,
      namespaceLower,
      index,
      markNamespace,
      enqueueMethod,
    );
  }
  for (const cls of index.classes) {
    if (cls.namespaceLower !== namespaceLower) continue;
    const refs = collectClassReferences(cls.node);
    resolveReferencesToNamespaces(
      refs,
      cls.module,
      namespaceLower,
      index,
      markNamespace,
      enqueueMethod,
    );
  }
}

function collectMethodReferences(method: MethodDeclaration): readonly ReferenceSeed[] {
  const collector = new ReferenceSeedCollector();
  for (const statement of method.body) collector.walk(statement);
  for (const param of method.parameters) collector.walk(param);
  if (method.returnType) collector.walk(method.returnType);
  return collector.seeds;
}

function collectClassReferences(cls: ClassDeclaration): readonly ReferenceSeed[] {
  const collector = new ReferenceSeedCollector();
  if (cls.baseType) collector.walk(cls.baseType);
  for (const member of cls.members) {
    if (member.kind === "FieldDeclaration" && member.initializer) {
      collector.walk(member.initializer);
    }
    if (member.kind === "PropertyDeclaration") {
      if (member.getter) {
        for (const statement of member.getter.body) collector.walk(statement);
      }
      if (member.setter) {
        for (const statement of member.setter.body) collector.walk(statement);
      }
    }
  }
  return collector.seeds;
}

function collectExpressionReferences(node: Node): readonly ReferenceSeed[] {
  const collector = new ReferenceSeedCollector();
  collector.walk(node);
  return collector.seeds;
}

class ReferenceSeedCollector extends ASTWalker {
  public readonly seeds: ReferenceSeed[] = [];

  public override walk(node: Node | undefined): void {
    if (!node) return;
    if (node.kind === "ObjectCreationExpression") {
      this.addSeedFromType(node.type, true);
      for (const arg of node.arguments) this.walk(arg);
      return;
    }
    if (node.kind === "MemberAccess") {
      if (node.target.kind === "Identifier") {
        this.addSeed(node.member, node.target.name, false);
        return;
      }
      this.walk(node.target);
      this.addSeed(node.member, undefined, false);
      return;
    }
    if (node.kind === "MethodInvocation") {
      if (node.callee) {
        if (node.callee.kind === "Identifier") {
          this.addSeed(node.methodName, node.callee.name, false);
        } else {
          this.walk(node.callee);
          this.addSeed(node.methodName, undefined, false);
        }
      } else {
        this.addSeed(node.methodName, undefined, false);
      }
      for (const typeArg of node.typeArguments) this.walk(typeArg);
      for (const arg of node.arguments) this.walk(arg);
      return;
    }
    if (node.kind === "Identifier") {
      this.addSeed(node.name, undefined, false);
      return;
    }
    if (node.kind === "OpaqueStatement") {
      for (const token of tokenize(node.text)) {
        if (token.kind !== "identifier" && token.kind !== "keyword") continue;
        this.addSeed(token.value, undefined, false);
      }
      return;
    }
    super.walk(node);
  }

  protected override visitTypeReference(node: TypeReference): void {
    this.addSeedFromType(node, false);
  }

  private addSeedFromType(type: TypeReference, isNewExpression: boolean): void {
    const lastDot = type.name.lastIndexOf(".");
    if (lastDot !== -1) {
      const qualifier = type.name.slice(0, lastDot);
      const simpleName = type.name.slice(lastDot + 1);
      this.addSeed(simpleName, qualifier, isNewExpression);
    } else {
      this.addSeed(type.name, undefined, isNewExpression);
    }
    for (const typeArg of type.typeArguments) this.addSeedFromType(typeArg, false);
  }

  private addSeed(name: string, qualifier: string | undefined, isNewExpression: boolean): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (RESERVED_WORDS.has(lower)) return;
    this.seeds.push({
      name: trimmed,
      lower,
      qualifierLower: qualifier?.trim().toLowerCase(),
      isNewExpression,
    });
  }
}

function isExecutableTopLevel(
  member: TopLevelMember,
): member is Exclude<TopLevelMember, NamespaceDeclaration | ClassDeclaration> {
  return member.kind !== "NamespaceDeclaration" && member.kind !== "ClassDeclaration";
}

function hasKeepDirective(module: ParsedPruneModule, startLine: number | undefined): boolean {
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

function methodKey(
  moduleName: string,
  namespace: string,
  className: string | undefined,
  methodName: string,
): string {
  return `${moduleName}\0${namespace}\0${className ?? ""}\0${methodName}`.toLowerCase();
}

function classKey(moduleName: string, namespace: string | undefined, className: string): string {
  return `${moduleName}\0${namespace ?? ""}\0${className}`.toLowerCase();
}

function pushBucket<T>(map: Map<string, T[]>, key: string, value: T): void {
  const bucket = map.get(key) ?? [];
  bucket.push(value);
  map.set(key, bucket);
}
