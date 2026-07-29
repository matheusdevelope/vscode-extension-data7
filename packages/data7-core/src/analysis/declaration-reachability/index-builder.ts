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
  readonly byKindAndLower: ReadonlyMap<string, readonly DeclarationRecord[]>;
  readonly namespaceByLower: ReadonlyMap<string, DeclarationRecord>;
  readonly moduleImports: ReadonlyMap<string, readonly string[]>;
  readonly principalModule?: ParsedReachabilityModule;
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

export function hasKeepDirective(
  module: ParsedReachabilityModule,
  startLine: number | undefined,
): boolean {
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

function pushByKind(
  map: Map<string, DeclarationRecord[]>,
  kind: DeclarationKind,
  lower: string,
  record: DeclarationRecord,
): void {
  const key = kindLowerKey(kind, lower);
  const bucket = map.get(key) ?? [];
  bucket.push(record);
  map.set(key, bucket);
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
  const byKindAndLower = new Map<string, DeclarationRecord[]>();
  const namespaceByLower = new Map<string, DeclarationRecord>();
  const moduleImports = new Map<string, readonly string[]>();
  let principalModule: ParsedReachabilityModule | undefined;

  const register = (record: DeclarationRecord): void => {
    declarations.push(record);
    byKey.set(record.key, record);
    pushByKind(byKindAndLower, record.kind, record.lower, record);
    if (record.kind === "namespace") {
      namespaceByLower.set(record.lower, record);
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

  return {
    modules,
    declarations,
    byKey,
    byKindAndLower,
    namespaceByLower,
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
  for (const kind of kinds) {
    for (const candidate of index.byKindAndLower.get(kindLowerKey(kind, memberLower)) ?? []) {
      if (candidate.namespaceLower !== namespaceLower) continue;
      if (candidate.ownerClassLower === classNameLower) {
        results.push(candidate);
      }
    }
  }
  return results;
}
