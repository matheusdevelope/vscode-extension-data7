import type { ParseResult } from "../../project/parser";
import type {
  ClassDeclaration,
  ClassMember,
  DelegateDeclaration,
  EnumDeclaration,
  FieldDeclaration,
  MethodDeclaration,
  NamespaceDeclaration,
  PropertyDeclaration,
  TopLevelMember,
  VariableDeclaration,
} from "../../project/ast/ast";
import { declarationKey, type DeclarationKind, type ReachabilityModuleInput } from "./types";

export const KEEP_DIRECTIVE_PATTERN = /'\s*@data7:(?:keep|keep-name|entrypoint|external-api)\b/i;

export interface ParsedReachabilityModule {
  readonly input: ReachabilityModuleInput;
  readonly parse: ParseResult;
}

export interface DeclarationRecord {
  readonly key: string;
  readonly kind: DeclarationKind;
  readonly name: string;
  readonly lower: string;
  readonly namespace: string;
  readonly namespaceLower: string;
  readonly ownerClass?: string;
  readonly ownerClassLower?: string;
  readonly module: ParsedReachabilityModule;
  readonly keep: boolean;
  readonly node:
    | NamespaceDeclaration
    | ClassDeclaration
    | EnumDeclaration
    | DelegateDeclaration
    | MethodDeclaration
    | FieldDeclaration
    | PropertyDeclaration
    | VariableDeclaration;
}

export interface ReachabilityIndex {
  readonly modules: readonly ParsedReachabilityModule[];
  readonly declarations: readonly DeclarationRecord[];
  readonly byKey: ReadonlyMap<string, DeclarationRecord>;
  /** All records that share a declaration key (overloads). */
  readonly byKeyAll: ReadonlyMap<string, readonly DeclarationRecord[]>;
  readonly byKindAndLower: ReadonlyMap<string, readonly DeclarationRecord[]>;
  readonly namespaceByLower: ReadonlyMap<string, DeclarationRecord>;
  /** Every declaration in a namespace, including the namespace record itself. */
  readonly declarationsByNamespace: ReadonlyMap<string, readonly DeclarationRecord[]>;
  /** Members keyed by `namespaceLower\\0ownerClassLower`. */
  readonly membersByOwner: ReadonlyMap<string, readonly DeclarationRecord[]>;
  /** Members keyed by `moduleName\\0namespaceLower\\0ownerClassLower`. */
  readonly membersByOwnerInModule: ReadonlyMap<string, readonly DeclarationRecord[]>;
  readonly keepRecords: readonly DeclarationRecord[];
  readonly principalClassMainMethods: readonly DeclarationRecord[];
  readonly principalTopLevelMain?: DeclarationRecord;
  readonly moduleImports: ReadonlyMap<string, readonly string[]>;
  readonly principalModule?: ParsedReachabilityModule;
}

export function ownerMembersKey(namespaceLower: string, ownerClassLower: string): string {
  return `${namespaceLower}\0${ownerClassLower}`;
}

export function ownerMembersInModuleKey(
  moduleName: string,
  namespaceLower: string,
  ownerClassLower: string,
): string {
  return `${moduleName.toLowerCase()}\0${namespaceLower}\0${ownerClassLower}`;
}

function kindLowerKey(kind: DeclarationKind, lower: string): string {
  return `${kind}\0${lower}`;
}

function isStructure(node: ClassDeclaration): boolean {
  return (node.modifiers ?? []).some((modifier) => modifier.toLowerCase() === "structure");
}

function isDeclareMethod(node: MethodDeclaration): boolean {
  return node.libName !== undefined;
}

const keepDirectiveLines = new WeakMap<ParsedReachabilityModule, string[]>();

function linesOf(module: ParsedReachabilityModule): string[] {
  const cached = keepDirectiveLines.get(module);
  if (cached) return cached;
  const lines = module.input.code.split(/\r?\n/);
  keepDirectiveLines.set(module, lines);
  return lines;
}

export function hasKeepDirective(
  module: ParsedReachabilityModule,
  startLine: number | undefined,
): boolean {
  if (startLine === undefined || startLine <= 1) return false;
  const lines = linesOf(module);
  for (let index = startLine - 2; index >= 0; index--) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    return KEEP_DIRECTIVE_PATTERN.test(trimmed);
  }
  return false;
}

function pushByKind(
  map: Map<string, DeclarationRecord[]>,
  kind: DeclarationKind,
  lower: string,
  record: DeclarationRecord,
): void {
  pushList(map, kindLowerKey(kind, lower), record);
}

function pushList(
  map: Map<string, DeclarationRecord[]>,
  key: string,
  record: DeclarationRecord,
): void {
  const bucket = map.get(key);
  if (bucket) {
    bucket.push(record);
    return;
  }
  map.set(key, [record]);
}

function makeRecord(
  module: ParsedReachabilityModule,
  namespace: string,
  ownerClass: string | undefined,
  kind: DeclarationKind,
  name: string,
  node: DeclarationRecord["node"],
  keep: boolean,
): DeclarationRecord {
  return {
    key: declarationKey(module.input.moduleName, namespace, ownerClass, kind, name),
    kind,
    name,
    lower: name.toLowerCase(),
    namespace,
    namespaceLower: namespace.toLowerCase(),
    ownerClass,
    ownerClassLower: ownerClass?.toLowerCase(),
    module,
    keep,
    node,
  };
}

export function buildReachabilityIndex(
  modules: readonly ParsedReachabilityModule[],
): ReachabilityIndex {
  const declarations: DeclarationRecord[] = [];
  const byKey = new Map<string, DeclarationRecord>();
  const byKeyAll = new Map<string, DeclarationRecord[]>();
  const byKindAndLower = new Map<string, DeclarationRecord[]>();
  const namespaceByLower = new Map<string, DeclarationRecord>();
  const declarationsByNamespace = new Map<string, DeclarationRecord[]>();
  const membersByOwner = new Map<string, DeclarationRecord[]>();
  const membersByOwnerInModule = new Map<string, DeclarationRecord[]>();
  const keepRecords: DeclarationRecord[] = [];
  const moduleImports = new Map<string, readonly string[]>();
  let principalModule: ParsedReachabilityModule | undefined;

  const register = (record: DeclarationRecord): void => {
    declarations.push(record);
    byKey.set(record.key, record);
    pushList(byKeyAll, record.key, record);
    pushByKind(byKindAndLower, record.kind, record.lower, record);
    if (record.kind === "namespace") {
      namespaceByLower.set(record.lower, record);
    }
    if (record.namespaceLower) {
      pushList(declarationsByNamespace, record.namespaceLower, record);
    }
    if (record.ownerClassLower) {
      pushList(
        membersByOwner,
        ownerMembersKey(record.namespaceLower, record.ownerClassLower),
        record,
      );
      pushList(
        membersByOwnerInModule,
        ownerMembersInModuleKey(
          record.module.input.moduleName,
          record.namespaceLower,
          record.ownerClassLower,
        ),
        record,
      );
    }
    if (record.keep) {
      keepRecords.push(record);
    }
  };

  const collectMembers = (
    members: readonly TopLevelMember[],
    module: ParsedReachabilityModule,
    namespace: string,
    ownerClass: string | undefined,
  ): void => {
    for (const member of members) {
      if (member.kind === "ImportsDeclaration") continue;

      if (member.kind === "NamespaceDeclaration") {
        const record = makeRecord(
          module,
          member.name,
          undefined,
          "namespace",
          member.name,
          member,
          hasKeepDirective(module, member.loc?.startLine),
        );
        register(record);
        collectMembers(member.members, module, member.name, undefined);
        continue;
      }

      if (member.kind === "ClassDeclaration") {
        collectClass(member, module, namespace, ownerClass, register, collectClassMembers);
        continue;
      }

      if (member.kind === "EnumDeclaration") {
        register(
          makeRecord(
            module,
            namespace,
            ownerClass,
            "enum",
            member.name,
            member,
            hasKeepDirective(module, member.loc?.startLine),
          ),
        );
        continue;
      }

      if (member.kind === "DelegateDeclaration") {
        register(
          makeRecord(
            module,
            namespace,
            ownerClass,
            "delegate",
            member.name,
            member,
            hasKeepDirective(module, member.loc?.startLine),
          ),
        );
        continue;
      }

      if (member.kind === "MethodDeclaration") {
        const kind: DeclarationKind = isDeclareMethod(member) ? "declareMethod" : "method";
        register(
          makeRecord(
            module,
            namespace,
            ownerClass,
            kind,
            member.name,
            member,
            hasKeepDirective(module, member.loc?.startLine),
          ),
        );
        continue;
      }

      if (member.kind === "VariableDeclaration") {
        const kind: DeclarationKind = member.isConst ? "const" : "variable";
        register(
          makeRecord(
            module,
            namespace,
            ownerClass,
            kind,
            member.name,
            member,
            hasKeepDirective(module, member.loc?.startLine),
          ),
        );
      }
    }
  };

  const collectClassMembers = (
    members: readonly ClassMember[],
    module: ParsedReachabilityModule,
    namespace: string,
    ownerClass: string,
    registerFn: (record: DeclarationRecord) => void,
  ): void => {
    for (const member of members) {
      if (member.kind === "ClassDeclaration") {
        collectClass(member, module, namespace, ownerClass, registerFn, collectClassMembers);
        continue;
      }
      if (member.kind === "MethodDeclaration") {
        const kind: DeclarationKind = isDeclareMethod(member) ? "declareMethod" : "method";
        registerFn(
          makeRecord(
            module,
            namespace,
            ownerClass,
            kind,
            member.name,
            member,
            hasKeepDirective(module, member.loc?.startLine),
          ),
        );
        continue;
      }
      if (member.kind === "FieldDeclaration") {
        registerFn(
          makeRecord(
            module,
            namespace,
            ownerClass,
            "field",
            member.name,
            member,
            hasKeepDirective(module, member.loc?.startLine),
          ),
        );
        continue;
      }
      if (member.kind === "PropertyDeclaration") {
        registerFn(
          makeRecord(
            module,
            namespace,
            ownerClass,
            "property",
            member.name,
            member,
            hasKeepDirective(module, member.loc?.startLine),
          ),
        );
      }
    }
  };

  const collectClass = (
    member: ClassDeclaration,
    module: ParsedReachabilityModule,
    namespace: string,
    parentClass: string | undefined,
    registerFn: (record: DeclarationRecord) => void,
    collectMembersFn: typeof collectClassMembers,
  ): void => {
    const kind: DeclarationKind = isStructure(member) ? "structure" : "class";
    registerFn(
      makeRecord(
        module,
        namespace,
        parentClass,
        kind,
        member.name,
        member,
        hasKeepDirective(module, member.loc?.startLine),
      ),
    );
    collectMembersFn(member.members, module, namespace, member.name, registerFn);
  };

  for (const module of modules) {
    if (module.input.moduleName.toLowerCase() === "principal") {
      principalModule = module;
    }
    moduleImports.set(module.input.moduleName, collectModuleImports(module.parse.unit.members));
    collectMembers(module.parse.unit.members, module, "", undefined);
  }

  const principalClassMainMethods: DeclarationRecord[] = [];
  let principalTopLevelMain: DeclarationRecord | undefined;
  if (principalModule) {
    for (const decl of declarations) {
      if (decl.module !== principalModule) continue;
      if (decl.kind !== "method" && decl.kind !== "declareMethod") continue;
      if (decl.lower !== "main") continue;
      if (decl.ownerClass !== undefined) {
        principalClassMainMethods.push(decl);
      } else if (!principalTopLevelMain) {
        principalTopLevelMain = decl;
      }
    }
  }

  return {
    modules,
    declarations,
    byKey,
    byKeyAll,
    byKindAndLower,
    namespaceByLower,
    declarationsByNamespace,
    membersByOwner,
    membersByOwnerInModule,
    keepRecords,
    principalClassMainMethods,
    ...(principalTopLevelMain ? { principalTopLevelMain } : {}),
    moduleImports,
    principalModule,
  };
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

export function findDeclarationsByName(
  index: ReachabilityIndex,
  kinds: readonly DeclarationKind[],
  lower: string,
): DeclarationRecord[] {
  const results: DeclarationRecord[] = [];
  for (const kind of kinds) {
    const hits = index.byKindAndLower.get(kindLowerKey(kind, lower)) ?? [];
    results.push(...hits);
  }
  return results;
}

export function findClassLike(
  index: ReachabilityIndex,
  lower: string,
): readonly DeclarationRecord[] {
  return findDeclarationsByName(index, ["class", "structure"], lower);
}

export function findMembersInClass(
  index: ReachabilityIndex,
  namespaceLower: string,
  classNameLower: string,
  memberLower: string,
  kinds: readonly DeclarationKind[],
): DeclarationRecord[] {
  const results: DeclarationRecord[] = [];
  const members = index.membersByOwner.get(ownerMembersKey(namespaceLower, classNameLower));
  if (!members) return results;
  for (const candidate of members) {
    if (candidate.lower !== memberLower) continue;
    if (!kinds.includes(candidate.kind)) continue;
    results.push(candidate);
  }
  return results;
}
