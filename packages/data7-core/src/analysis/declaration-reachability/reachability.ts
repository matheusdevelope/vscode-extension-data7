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
const RECEIVER_KINDS: readonly DeclarationKind[] = ["const", "variable", "field", "property"];

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

  // Overloads share one declaration key; track records so every sibling node is analyzed.
  const enqueuedRecords = new Set<DeclarationRecord>();

  const enqueue = (record: DeclarationRecord | undefined): void => {
    if (!record || enqueuedRecords.has(record)) return;
    enqueuedRecords.add(record);
    const isNewKey = !live.has(record.key);
    live.add(record.key);
    queue.push(record);

    // When any overload becomes live, keep/analyze all overloads with the same key so
    // signature types (e.g. FindDel) and helpers only referenced by sibling bodies stay reachable.
    if (isNewKey && (record.kind === "method" || record.kind === "declareMethod")) {
      for (const sibling of index.declarations) {
        if (sibling.key === record.key && sibling !== record) {
          enqueue(sibling);
        }
      }
    }

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
      // Live subclass must keep Overrides of already-live ancestor members (polymorphism).
      enqueueOverridesFromLiveAncestors(record, index, live, enqueue);
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
      // Live virtual member ⇒ keep Overrides on already-live descendants.
      if (
        record.kind === "method" ||
        record.kind === "declareMethod" ||
        record.kind === "property"
      ) {
        enqueueOverridesOnLiveDescendants(record, index, live, enqueue);
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
      // Entry statements only — do not seed every Dim/Const/Function just because it
      // exists at Principal top-level (unused deadApp/deadConst/GlobalDeadClass must drop).
      if (!isPrincipalEntryStatement(member)) continue;
      resolveReferences(
        collectNodeReferences(member),
        principal,
        undefined,
        undefined,
        index,
        live,
        collectLocalTypeBindings(member),
        enqueue,
        markNamespace,
      );
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
      processLiveDeclaration(current, index, live, enqueue, markNamespace);
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
  live: ReadonlySet<string>,
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
        live,
        EMPTY_LOCAL_BINDINGS,
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
      live,
      collectLocalTypeBindings(method),
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
      live,
      EMPTY_LOCAL_BINDINGS,
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
        live,
        collectLocalTypeBindings(property.getter),
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
        live,
        collectLocalTypeBindings(property.setter),
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
      live,
      EMPTY_LOCAL_BINDINGS,
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
      live,
      EMPTY_LOCAL_BINDINGS,
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
      live,
      EMPTY_LOCAL_BINDINGS,
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
      live,
      EMPTY_LOCAL_BINDINGS,
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
  live: ReadonlySet<string>,
  localBindings: ReadonlyMap<string, string>,
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
      enqueueInheritedMembers(
        ref.lower,
        qualifier === "mybase",
        ownerClass,
        contextNamespaceLower,
        contextModule,
        importSet,
        index,
        live,
        enqueue,
        markNamespace,
      );
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

      // Qualified type member when the type was already seeded (e.g. Namespace.Type
      // made CardGroupersStone live, then .GetOptions resolves without Imports).
      enqueueMembersOnNamedType(qualifier, ref.lower, index, live, enqueue);

      // Chain hint: ….Take().Value.AsString — only follow already-live preceding
      // members so dead Take/Data/Format/Item return types are not pulled in.
      enqueueMembersFromPrecedingMemberType(qualifier, ref.lower, index, live, enqueue);

      // Receiver variable/Using/Dim/param: `_form.Show()` → TFormCard → Inherits → Show.
      enqueueMembersFromReceiverTypeName(
        localBindings.get(qualifier),
        ref.lower,
        contextModule,
        contextNamespaceLower,
        importSet,
        index,
        live,
        enqueue,
      );
      for (const receiver of resolveInScope(
        findDeclarationsByName(index, RECEIVER_KINDS, qualifier),
        contextModule,
        contextNamespaceLower,
        importSet,
        index,
      )) {
        enqueueMembersFromReceiverTypeName(
          memberResultTypeName(receiver),
          ref.lower,
          contextModule,
          contextNamespaceLower,
          importSet,
          index,
          live,
          enqueue,
        );
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

/**
 * Follow a chained access hint (….Preceding.Member) by resolving already-live
 * `Preceding` members' result types and keeping `Member` on those types —
 * including when the type lives in a namespace the caller never Imports
 * (e.g. `.Value.AsString` → `TTValue.AsString`).
 *
 * Only live predecessors are considered: scanning every `Take`/`Data`/`Format`
 * in the project would false-keep dead BaseList subclasses and HTTP helpers.
 */
function enqueueMembersFromPrecedingMemberType(
  precedingLower: string,
  memberLower: string,
  index: ReachabilityIndex,
  live: ReadonlySet<string>,
  enqueue: (record: DeclarationRecord | undefined) => void,
): void {
  const seenTypes = new Set<string>();
  for (const preceding of findDeclarationsByName(index, MEMBER_KINDS, precedingLower)) {
    if (!live.has(preceding.key)) continue;
    const typeName = memberResultTypeName(preceding);
    if (!typeName) continue;
    for (const typeRec of resolveTypeNameToClasses(typeName, index)) {
      if (seenTypes.has(typeRec.key)) continue;
      seenTypes.add(typeRec.key);
      enqueueMemberOnTypeAndBases(typeRec, memberLower, index, enqueue);
    }
  }
}

/**
 * `SomeType.SharedOrInstanceMember` when `SomeType` is already live (seeded via
 * `Namespace.Type` or an in-scope type reference) but its namespace may not be
 * imported at the call site.
 */
function enqueueMembersOnNamedType(
  typeLower: string,
  memberLower: string,
  index: ReachabilityIndex,
  live: ReadonlySet<string>,
  enqueue: (record: DeclarationRecord | undefined) => void,
): void {
  for (const typeRec of findClassLike(index, typeLower)) {
    if (!live.has(typeRec.key)) continue;
    enqueueMemberOnTypeAndBases(typeRec, memberLower, index, enqueue);
  }
}

function memberResultTypeName(record: DeclarationRecord): string | undefined {
  if (record.kind === "property") {
    const property = record.node as PropertyDeclaration;
    return property.type.name.trim() || undefined;
  }
  if (record.kind === "field") {
    const field = record.node as { type: TypeReference };
    return field.type.name.trim() || undefined;
  }
  if (record.kind === "const" || record.kind === "variable") {
    const variable = record.node as VariableDeclaration;
    if (variable.type?.name.trim()) return variable.type.name.trim();
    if (variable.initializer && variable.initializer.kind === "ObjectCreationExpression") {
      return variable.initializer.type.name.trim() || undefined;
    }
    return undefined;
  }
  if (record.kind === "method" || record.kind === "declareMethod") {
    const method = record.node as MethodDeclaration;
    return method.returnType?.name.trim() || undefined;
  }
  return undefined;
}

/**
 * Resolve `receiver.Member` when `receiver` is a local Dim/Using/param (or indexed
 * field/variable) whose declared type is known — walks Inherits so
 * `TFormCard.Show` keeps `TFormBase.Show` even when only `mod_card_form` is imported.
 */
function enqueueMembersFromReceiverTypeName(
  typeName: string | undefined,
  memberLower: string,
  contextModule: ParsedReachabilityModule,
  contextNamespaceLower: string | undefined,
  importSet: ReadonlySet<string>,
  index: ReachabilityIndex,
  live: ReadonlySet<string>,
  enqueue: (record: DeclarationRecord | undefined) => void,
): void {
  if (!typeName) return;
  const classes = resolveTypeNameToClasses(typeName, index);
  if (classes.length === 0) return;
  const scoped = resolveInScope(classes, contextModule, contextNamespaceLower, importSet, index);
  const liveHits = classes.filter((candidate) => live.has(candidate.key));
  const targets = scoped.length > 0 ? scoped : liveHits;
  for (const typeRec of targets) {
    enqueueMemberOnTypeAndBases(typeRec, memberLower, index, enqueue);
  }
}

const EMPTY_LOCAL_BINDINGS: ReadonlyMap<string, string> = new Map();

/** Map local Dim / Using resource / parameter names → declared type name. */
function collectLocalTypeBindings(root: Node): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const collector = new LocalTypeBindingCollector(map);
  collector.walk(root);
  return map;
}

class LocalTypeBindingCollector extends ASTWalker {
  public constructor(private readonly bindings: Map<string, string>) {
    super();
  }

  public override walk(node: Node | undefined): void {
    if (!node) return;
    if (node.kind === "VariableDeclaration") {
      const typeName =
        node.type?.name.trim() ||
        (node.initializer?.kind === "ObjectCreationExpression"
          ? node.initializer.type.name.trim()
          : undefined);
      if (typeName) this.bindings.set(node.name.toLowerCase(), typeName);
    } else if (node.kind === "UsingStatement") {
      const typeName = node.resourceType.name.trim();
      if (typeName) this.bindings.set(node.resourceVar.name.toLowerCase(), typeName);
    } else if (node.kind === "ParameterDeclaration") {
      const typeName = node.type.name.trim();
      if (typeName) this.bindings.set(node.name.toLowerCase(), typeName);
    } else if (node.kind === "MethodDeclaration") {
      for (const param of node.parameters) this.walk(param);
      for (const statement of node.body) this.walk(statement);
      return;
    }
    super.walk(node);
  }
}

function resolveTypeNameToClasses(
  typeName: string,
  index: ReachabilityIndex,
): readonly DeclarationRecord[] {
  const lastDot = typeName.lastIndexOf(".");
  if (lastDot !== -1) {
    const qualifier = typeName.slice(0, lastDot).trim().toLowerCase();
    const simple = typeName
      .slice(lastDot + 1)
      .trim()
      .toLowerCase();
    if (!simple) return [];
    return findClassLike(index, simple).filter(
      (candidate) => candidate.namespaceLower === qualifier,
    );
  }
  const simple = typeName.trim().toLowerCase();
  if (!simple) return [];
  return findClassLike(index, simple);
}

/**
 * Keep `memberLower` on `typeRec` and its bases. Only enqueue a type when the
 * member is actually declared there — otherwise `Format.Free` would keep every
 * unrelated type that merely shares a preceding property name's result type.
 */
function enqueueMemberOnTypeAndBases(
  typeRec: DeclarationRecord,
  memberLower: string,
  index: ReachabilityIndex,
  enqueue: (record: DeclarationRecord | undefined) => void,
): void {
  const visited = new Set<string>();
  let current: DeclarationRecord | undefined = typeRec;
  while (current) {
    if (visited.has(current.key)) break;
    visited.add(current.key);
    const members = findMembersInClass(
      index,
      current.namespaceLower,
      current.lower,
      memberLower,
      MEMBER_KINDS,
    );
    if (members.length > 0) {
      enqueue(current);
      for (const member of members) {
        enqueue(member);
      }
    }
    current = resolveBaseTypeRecord(current, index);
  }
}

/**
 * Resolve `Me.Member` / `MyBase.Member` through the inheritance chain, including
 * Protected helpers declared on a base class in another project namespace
 * (e.g. `me.BuildLogger` on `mod_tobject.TTObject` from `mod_logger.Logger`).
 */
function enqueueInheritedMembers(
  memberLower: string,
  startFromBase: boolean,
  ownerClass: string,
  contextNamespaceLower: string,
  contextModule: ParsedReachabilityModule,
  importSet: ReadonlySet<string>,
  index: ReachabilityIndex,
  live: ReadonlySet<string>,
  enqueue: (record: DeclarationRecord | undefined) => void,
  markNamespace: (namespaceLower: string | undefined) => void,
): void {
  let classRecord = resolveClassRecord(
    index,
    ownerClass.toLowerCase(),
    contextNamespaceLower,
    contextModule,
    importSet,
  );

  if (!classRecord) {
    for (const member of findMembersInClass(
      index,
      contextNamespaceLower,
      ownerClass.toLowerCase(),
      memberLower,
      MEMBER_KINDS,
    )) {
      enqueue(member);
    }
    return;
  }

  if (startFromBase) {
    const base = resolveBaseClassRecord(classRecord, index, live, enqueue, markNamespace);
    if (!base) return;
    classRecord = base;
  }

  const visited = new Set<string>();
  while (classRecord) {
    if (visited.has(classRecord.key)) break;
    visited.add(classRecord.key);

    for (const member of findMembersInClass(
      index,
      classRecord.namespaceLower,
      classRecord.lower,
      memberLower,
      MEMBER_KINDS,
    )) {
      enqueue(member);
    }

    const next = resolveBaseClassRecord(classRecord, index, live, enqueue, markNamespace);
    if (!next) break;
    classRecord = next;
  }
}

function resolveClassRecord(
  index: ReachabilityIndex,
  classLower: string,
  preferredNamespaceLower: string | undefined,
  contextModule: ParsedReachabilityModule,
  importSet: ReadonlySet<string>,
): DeclarationRecord | undefined {
  const scoped = resolveInScope(
    findClassLike(index, classLower),
    contextModule,
    preferredNamespaceLower,
    importSet,
    index,
  );
  if (scoped.length === 0) return undefined;
  return (
    scoped.find((candidate) => candidate.namespaceLower === preferredNamespaceLower) ?? scoped[0]
  );
}

function resolveBaseClassRecord(
  classRecord: DeclarationRecord,
  index: ReachabilityIndex,
  live: ReadonlySet<string>,
  enqueue: (record: DeclarationRecord | undefined) => void,
  markNamespace: (namespaceLower: string | undefined) => void,
): DeclarationRecord | undefined {
  const hit = resolveBaseTypeRecord(classRecord, index);
  if (hit) {
    markNamespace(hit.namespaceLower);
    enqueue(hit);
    return hit;
  }

  const node = classRecord.node as ClassDeclaration;
  if (!node.baseType) return undefined;

  // External/system base (e.g. TObject): keep the type seed for any project alias.
  resolveReferences(
    collectTypeReferences(node.baseType, false),
    classRecord.module,
    classRecord.namespaceLower || undefined,
    classRecord.name,
    index,
    live,
    EMPTY_LOCAL_BINDINGS,
    enqueue,
    markNamespace,
  );
  return undefined;
}

function resolveBaseTypeRecord(
  classRecord: DeclarationRecord,
  index: ReachabilityIndex,
): DeclarationRecord | undefined {
  const node = classRecord.node as ClassDeclaration;
  if (!node.baseType) return undefined;

  const lastDot = node.baseType.name.lastIndexOf(".");
  const qualifier =
    lastDot !== -1 ? node.baseType.name.slice(0, lastDot).trim().toLowerCase() : undefined;
  const baseName =
    lastDot !== -1
      ? node.baseType.name
          .slice(lastDot + 1)
          .trim()
          .toLowerCase()
      : node.baseType.name.trim().toLowerCase();
  if (!baseName) return undefined;

  if (qualifier) {
    return findClassLike(index, baseName).find(
      (candidate) => candidate.namespaceLower === qualifier,
    );
  }

  const baseImportSet = new Set(
    (index.moduleImports.get(classRecord.module.input.moduleName) ?? []).map((item) =>
      item.toLowerCase(),
    ),
  );
  return resolveClassRecord(
    index,
    baseName,
    classRecord.namespaceLower,
    classRecord.module,
    baseImportSet,
  );
}

function hasModifier(node: { readonly modifiers?: readonly string[] }, name: string): boolean {
  return (node.modifiers ?? []).some((modifier) => modifier.toLowerCase() === name);
}

function isOverridesRecord(record: DeclarationRecord): boolean {
  if (record.kind !== "method" && record.kind !== "declareMethod" && record.kind !== "property") {
    return false;
  }
  return hasModifier(record.node as { readonly modifiers?: readonly string[] }, "overrides");
}

function findOwnerClassRecord(
  member: DeclarationRecord,
  index: ReachabilityIndex,
): DeclarationRecord | undefined {
  if (!member.ownerClassLower) return undefined;
  return findClassLike(index, member.ownerClassLower).find(
    (candidate) =>
      candidate.namespaceLower === member.namespaceLower && candidate.module === member.module,
  );
}

function findDirectSubclasses(
  base: DeclarationRecord,
  index: ReachabilityIndex,
): DeclarationRecord[] {
  const results: DeclarationRecord[] = [];
  for (const decl of index.declarations) {
    if (decl.kind !== "class" && decl.kind !== "structure") continue;
    const resolved = resolveBaseTypeRecord(decl, index);
    if (resolved && resolved.key === base.key) {
      results.push(decl);
    }
  }
  return results;
}

function collectDescendantClasses(
  root: DeclarationRecord,
  index: ReachabilityIndex,
): DeclarationRecord[] {
  const results: DeclarationRecord[] = [];
  const seen = new Set<string>();
  const pending = [...findDirectSubclasses(root, index)];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current.key)) continue;
    seen.add(current.key);
    results.push(current);
    pending.push(...findDirectSubclasses(current, index));
  }
  return results;
}

function ancestorHasLiveMember(
  classRecord: DeclarationRecord,
  memberLower: string,
  kind: DeclarationKind,
  index: ReachabilityIndex,
  live: ReadonlySet<string>,
): boolean {
  const visited = new Set<string>();
  let current: DeclarationRecord | undefined = resolveBaseTypeRecord(classRecord, index);
  while (current) {
    if (visited.has(current.key)) break;
    visited.add(current.key);
    for (const member of findMembersInClass(
      index,
      current.namespaceLower,
      current.lower,
      memberLower,
      [kind],
    )) {
      if (live.has(member.key)) return true;
    }
    current = resolveBaseTypeRecord(current, index);
  }
  return false;
}

/** When a virtual member is live, keep Overrides on already-live descendants. */
function enqueueOverridesOnLiveDescendants(
  member: DeclarationRecord,
  index: ReachabilityIndex,
  live: ReadonlySet<string>,
  enqueue: (record: DeclarationRecord | undefined) => void,
): void {
  const owner = findOwnerClassRecord(member, index);
  if (!owner) return;
  for (const descendant of collectDescendantClasses(owner, index)) {
    if (!live.has(descendant.key)) continue;
    for (const override of findMembersInClass(
      index,
      descendant.namespaceLower,
      descendant.lower,
      member.lower,
      [member.kind],
    )) {
      if (isOverridesRecord(override)) enqueue(override);
    }
  }
}

/** When a subclass becomes live, keep Overrides of already-live ancestor members. */
function enqueueOverridesFromLiveAncestors(
  classRecord: DeclarationRecord,
  index: ReachabilityIndex,
  live: ReadonlySet<string>,
  enqueue: (record: DeclarationRecord | undefined) => void,
): void {
  for (const decl of index.declarations) {
    if (decl.module !== classRecord.module) continue;
    if (decl.namespaceLower !== classRecord.namespaceLower) continue;
    if (decl.ownerClassLower !== classRecord.lower) continue;
    if (!isOverridesRecord(decl)) continue;
    if (ancestorHasLiveMember(classRecord, decl.lower, decl.kind, index, live)) {
      enqueue(decl);
    }
  }
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
  // Principal injects top-level globals only — not members of Principal-local classes.
  // Otherwise unqualified seeds like `.Free()` from other modules pull every Sub Free
  // on Principal (e.g. GlobalDeadClass.Free) and keep dead classes alive.
  if (candidate.module.input.moduleName.toLowerCase() === "principal") {
    return !candidate.ownerClass;
  }
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
        // Keep the receiver Dim/Const live (e.g. `app.Run()` ⇒ seed `app`).
        this.addSeed(node.target.name, undefined, false);
        this.addSeed(node.member, node.target.name, false);
        return;
      }
      this.walk(node.target);
      // Chain: ….Take().Value.AsString — qualify with the immediate left member/method
      // so resolve can follow Value → TTValue → AsString across namespaces.
      if (node.target.kind === "MemberAccess") {
        this.addSeed(node.member, node.target.member, false);
      } else if (node.target.kind === "MethodInvocation") {
        this.addSeed(node.member, node.target.methodName, false);
      } else {
        this.addSeed(node.member, undefined, false);
      }
      return;
    }
    if (node.kind === "MethodInvocation") {
      if (node.callee) {
        if (node.callee.kind === "Identifier") {
          this.addSeed(node.callee.name, undefined, false);
          this.addSeed(node.methodName, node.callee.name, false);
        } else {
          this.walk(node.callee);
          if (node.callee.kind === "MemberAccess") {
            this.addSeed(node.methodName, node.callee.member, false);
          } else if (node.callee.kind === "MethodInvocation") {
            this.addSeed(node.methodName, node.callee.methodName, false);
          } else {
            this.addSeed(node.methodName, undefined, false);
          }
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

function isPrincipalEntryStatement(member: TopLevelMember): boolean {
  switch (member.kind) {
    case "NamespaceDeclaration":
    case "ClassDeclaration":
    case "EnumDeclaration":
    case "DelegateDeclaration":
    case "ImportsDeclaration":
    case "MethodDeclaration":
    case "VariableDeclaration":
      return false;
    default:
      return true;
  }
}
