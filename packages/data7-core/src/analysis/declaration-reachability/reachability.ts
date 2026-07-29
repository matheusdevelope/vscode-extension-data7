import { tokenize } from "../../project/parser";
import {
  ASTWalker,
  type ClassDeclaration,
  type MethodDeclaration,
  type Node,
  type PropertyDeclaration,
  type TopLevelMember,
  type TypeReference,
  type VariableDeclaration,
} from "../../project/ast/ast";
import { isLanguageKeyword } from "../../project/language/keywords";
import {
  findClassLike,
  findDeclarationsByName,
  findMembersInClass,
  type DeclarationRecord,
  type ParsedReachabilityModule,
  type ReachabilityIndex,
} from "./index-builder";
import { retainsUnreachableMembers, shouldRemoveKind } from "./remove-options";
import type { DeclarationKind, ReachabilityOptions } from "./types";

const TYPE_KINDS: readonly DeclarationKind[] = ["class", "structure", "enum", "delegate"];
const MEMBER_KINDS: readonly DeclarationKind[] = [
  "method",
  "declareMethod",
  "field",
  "property",
  "const",
  "variable",
];

interface ReferenceSeed {
  readonly name: string;
  readonly lower: string;
  readonly qualifierLower?: string;
  readonly isNewExpression: boolean;
}

export interface LiveSet {
  readonly declarations: ReadonlySet<string>;
  readonly namespaces: ReadonlySet<string>;
}

export function computeLiveSet(index: ReachabilityIndex, options: ReachabilityOptions): LiveSet {
  const live = new Set<string>();
  const liveNamespaces = new Set<string>();
  const queue: DeclarationRecord[] = [];

  const markNamespace = (namespaceLower: string | undefined): void => {
    if (!namespaceLower || liveNamespaces.has(namespaceLower)) return;
    liveNamespaces.add(namespaceLower);
    const ns = index.namespaceByLower.get(namespaceLower);
    if (ns) {
      enqueue(ns);
      // When unused Imports are retained in output, keep imported namespaces reachable.
      if (!options.remove.unusedImports) {
        for (const imported of index.moduleImports.get(ns.module.input.moduleName) ?? []) {
          markNamespace(imported.toLowerCase());
        }
      }
    }
  };

  const enqueue = (record: DeclarationRecord | undefined): void => {
    if (!record || live.has(record.key)) return;
    live.add(record.key);
    queue.push(record);
    if (record.kind === "namespace") {
      markNamespace(record.lower);
      // Keep on namespace ⇒ retain every declaration in that namespace.
      if (record.keep) {
        for (const decl of index.declarations) {
          if (decl.namespaceLower === record.lower && decl.kind !== "namespace") {
            enqueue(decl);
          }
        }
      }
      return;
    }
    if (record.namespaceLower) markNamespace(record.namespaceLower);
    if (record.kind === "class" || record.kind === "structure") {
      // Sub New / Sub Free always travel with a live type (constructor + disposer).
      enqueueLifecycleMethods(record, index, enqueue);
    }
    if (
      (record.kind === "method" ||
        record.kind === "declareMethod" ||
        record.kind === "field" ||
        record.kind === "property") &&
      record.ownerClass
    ) {
      for (const cls of findClassLike(index, record.ownerClass.toLowerCase())) {
        if (cls.namespaceLower === record.namespaceLower && cls.module === record.module) {
          enqueue(cls);
        }
      }
    }
  };

  for (const alwaysInclude of options.alwaysInclude) {
    seedAlwaysInclude(alwaysInclude, index, enqueue, markNamespace);
  }

  for (const decl of index.declarations) {
    if (decl.keep) enqueue(decl);
  }

  const principal = index.principalModule;
  if (principal) {
    for (const member of principal.parse.unit.members) {
      if (isExecutableTopLevel(member)) {
        // Top-level Dim/Const in Principal are entry seeds — keep the declaration itself.
        if (member.kind === "VariableDeclaration") {
          const kind = member.isConst ? "const" : "variable";
          const record = index.declarations.find(
            (decl) =>
              decl.module === principal &&
              decl.kind === kind &&
              decl.lower === member.name.toLowerCase() &&
              !decl.namespaceLower &&
              !decl.ownerClass,
          );
          enqueue(record);
        }
        resolveReferences(
          collectNodeReferences(member),
          principal,
          undefined,
          undefined,
          index,
          enqueue,
          markNamespace,
        );
      }
    }

    const mainMethods = index.declarations.filter(
      (decl) =>
        (decl.kind === "method" || decl.kind === "declareMethod") &&
        decl.module === principal &&
        decl.lower === "main" &&
        decl.ownerClass !== undefined,
    );
    if (mainMethods.length > 0) {
      for (const main of mainMethods) enqueue(main);
    } else {
      const topLevelMain = index.declarations.find(
        (decl) =>
          (decl.kind === "method" || decl.kind === "declareMethod") &&
          decl.module === principal &&
          decl.lower === "main",
      );
      if (topLevelMain) enqueue(topLevelMain);
    }
  }

  const drainQueue = (): void => {
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      processLiveDeclaration(current, index, enqueue, markNamespace);
    }
  };

  drainQueue();

  // When internal declaration kinds are kept even if unreachable, their bodies still
  // ship in the .7Proj — follow those refs so dependent namespaces are not dropped.
  if (retainsUnreachableMembers(options.remove)) {
    let grew = true;
    while (grew) {
      grew = false;
      const beforeNamespaces = liveNamespaces.size;
      const beforeDeclarations = live.size;
      for (const namespaceLower of [...liveNamespaces]) {
        for (const decl of index.declarations) {
          if (decl.namespaceLower !== namespaceLower || decl.kind === "namespace") continue;
          const retained = live.has(decl.key) || !shouldRemoveKind(decl.kind, options.remove);
          if (!retained) continue;
          enqueue(decl);
        }
      }
      drainQueue();
      if (liveNamespaces.size > beforeNamespaces || live.size > beforeDeclarations) {
        grew = true;
      }
    }
  }

  return { declarations: live, namespaces: liveNamespaces };
}

function seedAlwaysInclude(
  raw: string,
  index: ReachabilityIndex,
  enqueue: (record: DeclarationRecord | undefined) => void,
  markNamespace: (namespaceLower: string | undefined) => void,
): void {
  const parts = raw
    .split(".")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return;

  const first = parts[0]?.toLowerCase();
  if (!first) return;

  if (parts.length === 1) {
    markNamespace(first);
    const ns = index.namespaceByLower.get(first);
    if (ns) {
      enqueue(ns);
      for (const decl of index.declarations) {
        if (decl.namespaceLower === first && decl.kind !== "namespace") enqueue(decl);
      }
    }
    return;
  }

  const typeName = parts[1]?.toLowerCase();
  if (!typeName) return;
  markNamespace(first);
  const types = findDeclarationsByName(index, TYPE_KINDS, typeName).filter(
    (candidate) => candidate.namespaceLower === first,
  );
  for (const type of types) enqueue(type);

  if (parts.length >= 3) {
    const memberName = parts[2]?.toLowerCase();
    if (!memberName) return;
    for (const type of types) {
      for (const member of findMembersInClass(index, first, type.lower, memberName, MEMBER_KINDS)) {
        enqueue(member);
      }
    }
  }
}

function processLiveDeclaration(
  record: DeclarationRecord,
  index: ReachabilityIndex,
  enqueue: (record: DeclarationRecord | undefined) => void,
  markNamespace: (namespaceLower: string | undefined) => void,
): void {
  const ownerClass = record.ownerClass;
  const contextNamespace = record.namespaceLower || undefined;

  if (record.kind === "class" || record.kind === "structure") {
    const cls = record.node as ClassDeclaration;
    if (cls.baseType) {
      resolveReferences(
        collectTypeReferences(cls.baseType, false),
        record.module,
        contextNamespace,
        ownerClass,
        index,
        enqueue,
        markNamespace,
      );
    }
    return;
  }

  if (record.kind === "method" || record.kind === "declareMethod") {
    const method = record.node as MethodDeclaration;
    resolveReferences(
      collectMethodReferences(method),
      record.module,
      contextNamespace,
      ownerClass,
      index,
      enqueue,
      markNamespace,
    );
    return;
  }

  if (record.kind === "property") {
    const property = record.node as PropertyDeclaration;
    resolveReferences(
      collectTypeReferences(property.type, false),
      record.module,
      contextNamespace,
      ownerClass,
      index,
      enqueue,
      markNamespace,
    );
    if (property.getter) {
      resolveReferences(
        collectMethodReferences(property.getter),
        record.module,
        contextNamespace,
        ownerClass,
        index,
        enqueue,
        markNamespace,
      );
    }
    if (property.setter) {
      resolveReferences(
        collectMethodReferences(property.setter),
        record.module,
        contextNamespace,
        ownerClass,
        index,
        enqueue,
        markNamespace,
      );
    }
    return;
  }

  if (record.kind === "field") {
    const field = record.node as { type: TypeReference; initializer?: Node };
    resolveReferences(
      [
        ...collectTypeReferences(field.type, false),
        ...(field.initializer ? collectNodeReferences(field.initializer) : []),
      ],
      record.module,
      contextNamespace,
      ownerClass,
      index,
      enqueue,
      markNamespace,
    );
    return;
  }

  if (record.kind === "const" || record.kind === "variable") {
    const variable = record.node as VariableDeclaration;
    const refs: ReferenceSeed[] = [];
    if (variable.type) refs.push(...collectTypeReferences(variable.type, false));
    if (variable.initializer) refs.push(...collectNodeReferences(variable.initializer));
    resolveReferences(
      refs,
      record.module,
      contextNamespace,
      ownerClass,
      index,
      enqueue,
      markNamespace,
    );
    return;
  }

  if (record.kind === "delegate") {
    const delegate = record.node as {
      parameters: { type: TypeReference }[];
      returnType?: TypeReference;
    };
    const refs: ReferenceSeed[] = [];
    for (const param of delegate.parameters) {
      refs.push(...collectTypeReferences(param.type, false));
    }
    if (delegate.returnType) refs.push(...collectTypeReferences(delegate.returnType, false));
    resolveReferences(
      refs,
      record.module,
      contextNamespace,
      ownerClass,
      index,
      enqueue,
      markNamespace,
    );
    return;
  }

  if (record.kind === "enum") {
    const enumNode = record.node as {
      baseType?: TypeReference;
      entries: { value?: Node }[];
    };
    const refs: ReferenceSeed[] = [];
    if (enumNode.baseType) refs.push(...collectTypeReferences(enumNode.baseType, false));
    for (const entry of enumNode.entries) {
      if (entry.value) refs.push(...collectNodeReferences(entry.value));
    }
    resolveReferences(
      refs,
      record.module,
      contextNamespace,
      ownerClass,
      index,
      enqueue,
      markNamespace,
    );
  }
}

function resolveReferences(
  refs: readonly ReferenceSeed[],
  contextModule: ParsedReachabilityModule,
  contextNamespaceLower: string | undefined,
  ownerClass: string | undefined,
  index: ReachabilityIndex,
  enqueue: (record: DeclarationRecord | undefined) => void,
  markNamespace: (namespaceLower: string | undefined) => void,
): void {
  const importSet = new Set(
    (index.moduleImports.get(contextModule.input.moduleName) ?? []).map((item) =>
      item.toLowerCase(),
    ),
  );

  for (const ref of refs) {
    const qualifier = ref.qualifierLower;

    if (qualifier === "me" || qualifier === "mybase") {
      if (!ownerClass || !contextNamespaceLower) continue;
      const members = findMembersInClass(
        index,
        contextNamespaceLower,
        ownerClass.toLowerCase(),
        ref.lower,
        MEMBER_KINDS,
      );
      for (const member of members) enqueue(member);

      if (qualifier === "mybase") {
        const classes = findClassLike(index, ownerClass.toLowerCase()).filter(
          (candidate) =>
            candidate.namespaceLower === contextNamespaceLower &&
            candidate.module === contextModule,
        );
        for (const cls of classes) {
          const node = cls.node as ClassDeclaration;
          if (node.baseType) {
            resolveReferences(
              collectTypeReferences(node.baseType, false),
              contextModule,
              contextNamespaceLower,
              ownerClass,
              index,
              enqueue,
              markNamespace,
            );
          }
        }
      }
      continue;
    }

    if (qualifier) {
      const nsRecord = index.namespaceByLower.get(qualifier);
      if (nsRecord) {
        markNamespace(qualifier);
        const typeHits = findDeclarationsByName(index, TYPE_KINDS, ref.lower).filter(
          (candidate) => candidate.namespaceLower === qualifier,
        );
        for (const typeHit of typeHits) {
          enqueue(typeHit);
          if (ref.isNewExpression) enqueueConstructor(typeHit, index, enqueue);
        }

        const nsMethods = findDeclarationsByName(
          index,
          ["method", "declareMethod"],
          ref.lower,
        ).filter((candidate) => candidate.namespaceLower === qualifier && !candidate.ownerClass);
        for (const methodHit of nsMethods) enqueue(methodHit);

        const qualifiedMembers = findDeclarationsByName(index, MEMBER_KINDS, ref.lower).filter(
          (candidate) => candidate.namespaceLower === qualifier,
        );
        for (const member of qualifiedMembers) enqueue(member);
        continue;
      }

      // Qualifier is a type in scope (e.g. LiveEnum.A or helper.Touch).
      const typeCandidates = resolveInScope(
        findDeclarationsByName(index, TYPE_KINDS, qualifier),
        contextModule,
        contextNamespaceLower,
        importSet,
        index,
      );
      for (const typeCandidate of typeCandidates) {
        enqueue(typeCandidate);
        for (const member of findMembersInClass(
          index,
          typeCandidate.namespaceLower,
          typeCandidate.lower,
          ref.lower,
          MEMBER_KINDS,
        )) {
          enqueue(member);
        }
        if (ref.isNewExpression) enqueueConstructor(typeCandidate, index, enqueue);
      }

      // Also treat as shared/instance call target variable — member name alone in scope.
      for (const memberCandidate of resolveInScope(
        findDeclarationsByName(index, MEMBER_KINDS, ref.lower),
        contextModule,
        contextNamespaceLower,
        importSet,
        index,
      )) {
        enqueue(memberCandidate);
      }
      continue;
    }

    for (const methodCandidate of resolveInScope(
      findDeclarationsByName(index, ["method", "declareMethod"], ref.lower),
      contextModule,
      contextNamespaceLower,
      importSet,
      index,
    )) {
      enqueue(methodCandidate);
    }

    for (const typeCandidate of resolveInScope(
      findDeclarationsByName(index, TYPE_KINDS, ref.lower),
      contextModule,
      contextNamespaceLower,
      importSet,
      index,
    )) {
      enqueue(typeCandidate);
      if (ref.isNewExpression) enqueueConstructor(typeCandidate, index, enqueue);
    }

    for (const valueCandidate of resolveInScope(
      findDeclarationsByName(index, ["const", "variable", "field", "property"], ref.lower),
      contextModule,
      contextNamespaceLower,
      importSet,
      index,
    )) {
      enqueue(valueCandidate);
    }

    const namespaceCandidate = index.namespaceByLower.get(ref.lower);
    if (namespaceCandidate) markNamespace(namespaceCandidate.lower);
  }
}

function resolveInScope(
  candidates: readonly DeclarationRecord[],
  contextModule: ParsedReachabilityModule,
  contextNamespaceLower: string | undefined,
  importSet: ReadonlySet<string>,
  index: ReachabilityIndex,
): DeclarationRecord[] {
  return candidates.filter((candidate) =>
    isCandidateInScope(candidate, contextModule, contextNamespaceLower, importSet, index),
  );
}

function isCandidateInScope(
  candidate: DeclarationRecord,
  contextModule: ParsedReachabilityModule,
  contextNamespaceLower: string | undefined,
  importSet: ReadonlySet<string>,
  _index: ReachabilityIndex,
): boolean {
  // Partial namespaces: same namespace name is visible across modules without Imports.
  if (contextNamespaceLower && candidate.namespaceLower === contextNamespaceLower) {
    return true;
  }
  if (candidate.module === contextModule) {
    if (!contextNamespaceLower) return true;
    return importSet.has(candidate.namespaceLower);
  }
  if (candidate.module.input.moduleName.toLowerCase() === "principal") return true;
  return importSet.has(candidate.namespaceLower);
}

function enqueueConstructor(
  classRecord: DeclarationRecord,
  index: ReachabilityIndex,
  enqueue: (record: DeclarationRecord | undefined) => void,
): void {
  enqueueLifecycleMethods(classRecord, index, enqueue);
}

function enqueueLifecycleMethods(
  classRecord: DeclarationRecord,
  index: ReachabilityIndex,
  enqueue: (record: DeclarationRecord | undefined) => void,
): void {
  for (const name of ["new", "free"] as const) {
    for (const member of findMembersInClass(
      index,
      classRecord.namespaceLower,
      classRecord.lower,
      name,
      ["method"],
    )) {
      if (member.module === classRecord.module) enqueue(member);
    }
  }
}

function collectMethodReferences(method: MethodDeclaration): readonly ReferenceSeed[] {
  const collector = new ReferenceSeedCollector();
  for (const statement of method.body) collector.walk(statement);
  for (const param of method.parameters) collector.walk(param);
  if (method.returnType) collector.walk(method.returnType);
  return collector.seeds;
}

function collectNodeReferences(node: Node): readonly ReferenceSeed[] {
  const collector = new ReferenceSeedCollector();
  collector.walk(node);
  return collector.seeds;
}

function collectTypeReferences(
  type: TypeReference,
  isNewExpression: boolean,
): readonly ReferenceSeed[] {
  const collector = new ReferenceSeedCollector();
  collector.addSeedFromType(type, isNewExpression);
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

  public addSeedFromType(type: TypeReference, isNewExpression: boolean): void {
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
    if (isLanguageKeyword(lower)) return;
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
): member is Exclude<
  TopLevelMember,
  | { kind: "NamespaceDeclaration" }
  | { kind: "ClassDeclaration" }
  | { kind: "EnumDeclaration" }
  | { kind: "DelegateDeclaration" }
  | { kind: "ImportsDeclaration" }
> {
  return (
    member.kind !== "NamespaceDeclaration" &&
    member.kind !== "ClassDeclaration" &&
    member.kind !== "EnumDeclaration" &&
    member.kind !== "DelegateDeclaration" &&
    member.kind !== "ImportsDeclaration"
  );
}
