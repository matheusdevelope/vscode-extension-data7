import type {
  ClassMember,
  CompilationUnit,
  MethodDeclaration,
  Statement,
  TopLevelMember,
} from "../../ast/ast";
import { ShortNameAllocator } from "./name-allocator";
import { isUglifyLocalReservedName, isUglifyReservedName } from "./reserved-names";
import { buildUserTypeIndex, type UserTypeIndex } from "./user-type-index";

/** Preceding-line directive that pins the original declaration name. */
export const KEEP_NAME_DIRECTIVE_PATTERN = /'\s*@data7:(?:keep-name|external-api)\b/i;

export interface UglifyRenameMaps {
  /** Namespace simple name (lower) → short name. */
  readonly namespaces: ReadonlyMap<string, string>;
  /** All declared namespace names (lower), including those kept verbatim. */
  readonly namespaceNames: ReadonlySet<string>;
  /** Type simple name (lower) → short name (class/structure/enum/delegate). */
  readonly types: ReadonlyMap<string, string>;
  /**
   * Member simple name (lower) → short name.
   * Includes System-Library-colliding names (e.g. Touch) when declared by user code.
   */
  readonly members: ReadonlyMap<string, string>;
  /**
   * Member names that also exist in the System Library.
   * Call-site renames require a user-typed receiver.
   */
  readonly systemCollidingMembers: ReadonlySet<string>;
  /**
   * Nested class renames keyed by enclosing type: parentLower → (nestedLower → short).
   * Prevents `WinAPI.Window` from picking up an unrelated `Property Window` member rename.
   */
  readonly nestedTypes: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /**
   * Top-level members declared directly in a namespace (not inside a class):
   * namespaceLower → set of member lowers. Enables `console.Printe` → `h16.n16`.
   */
  readonly namespaceMembers: ReadonlyMap<string, ReadonlySet<string>>;
  /** User type → members / inheritance for typed member-access gating. */
  readonly userTypes: UserTypeIndex;
}

export interface ParsedUglifyModule {
  readonly moduleName: string;
  readonly code: string;
  readonly unit: CompilationUnit;
}

function hasKeepNameDirective(code: string, startLine: number | undefined): boolean {
  if (startLine === undefined || startLine <= 1) return false;
  const lines = code.split(/\r?\n/);
  for (let index = startLine - 2; index >= 0; index--) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    return KEEP_NAME_DIRECTIVE_PATTERN.test(trimmed);
  }
  return false;
}

function shouldSkipTypeOrNamespace(
  name: string,
  code: string,
  startLine: number | undefined,
): boolean {
  if (isUglifyReservedName(name)) return true;
  if (hasKeepNameDirective(code, startLine)) return true;
  return false;
}

/** Members may collide with System Library names — those are renamed with typed gating. */
function shouldSkipMemberName(name: string, code: string, startLine: number | undefined): boolean {
  if (hasKeepNameDirective(code, startLine)) return true;
  const lower = name.toLowerCase();
  if (lower === "new" || lower === "free" || lower === "main") return true;
  // Keywords / Me / Value — not System member names like Touch.
  if (isUglifyLocalReservedName(name)) return true;
  return false;
}

/**
 * Collect rename maps for user declarations across all parsed modules.
 */
export function collectUglifyRenameMaps(modules: readonly ParsedUglifyModule[]): UglifyRenameMaps {
  const allocator = new ShortNameAllocator();
  const namespaces = new Map<string, string>();
  const namespaceNames = new Set<string>();
  const types = new Map<string, string>();
  const members = new Map<string, string>();
  const systemCollidingMembers = new Set<string>();
  const nestedTypes = new Map<string, Map<string, string>>();
  const namespaceMembers = new Map<string, Set<string>>();

  const claim = (
    bucket: Map<string, string>,
    name: string,
    code: string,
    startLine: number | undefined,
    skip: (n: string, c: string, line: number | undefined) => boolean,
  ): void => {
    const lower = name.toLowerCase();
    if (bucket.has(lower)) return;
    if (skip(name, code, startLine)) {
      allocator.markTaken(name);
      return;
    }
    bucket.set(lower, allocator.next());
  };

  const claimMember = (name: string, code: string, startLine: number | undefined): void => {
    const lower = name.toLowerCase();
    if (members.has(lower)) return;
    if (shouldSkipMemberName(name, code, startLine)) {
      allocator.markTaken(name);
      return;
    }
    members.set(lower, allocator.next());
    if (isUglifyReservedName(name)) {
      systemCollidingMembers.add(lower);
    }
  };

  const recordNamespaceMember = (namespaceLower: string | undefined, name: string): void => {
    if (!namespaceLower) return;
    let bucket = namespaceMembers.get(namespaceLower);
    if (!bucket) {
      bucket = new Set();
      namespaceMembers.set(namespaceLower, bucket);
    }
    bucket.add(name.toLowerCase());
  };

  const recordNestedType = (parentLower: string, nestedName: string): void => {
    const nestedLower = nestedName.toLowerCase();
    const short = types.get(nestedLower) ?? nestedName;
    let bucket = nestedTypes.get(parentLower);
    if (!bucket) {
      bucket = new Map();
      nestedTypes.set(parentLower, bucket);
    }
    bucket.set(nestedLower, short);
  };

  const walkClassMembers = (
    classMembers: readonly ClassMember[],
    code: string,
    parentLower: string,
  ): void => {
    for (const member of classMembers) {
      if (member.kind === "ClassDeclaration") {
        claim(types, member.name, code, member.loc?.startLine, shouldSkipTypeOrNamespace);
        recordNestedType(parentLower, member.name);
        walkClassMembers(member.members, code, member.name.toLowerCase());
        continue;
      }
      if (member.kind === "MethodDeclaration") {
        if (member.libName !== undefined) {
          allocator.markTaken(member.name);
          continue;
        }
        if (!member.isConstructor) {
          claimMember(member.name, code, member.loc?.startLine);
        }
        continue;
      }
      if (member.kind === "FieldDeclaration" || member.kind === "PropertyDeclaration") {
        claimMember(member.name, code, member.loc?.startLine);
      }
    }
  };

  const walkTop = (
    membersList: readonly TopLevelMember[],
    code: string,
    namespaceLower?: string,
  ): void => {
    for (const member of membersList) {
      if (member.kind === "NamespaceDeclaration") {
        namespaceNames.add(member.name.toLowerCase());
        claim(namespaces, member.name, code, member.loc?.startLine, shouldSkipTypeOrNamespace);
        walkTop(member.members, code, member.name.toLowerCase());
        continue;
      }
      if (member.kind === "ClassDeclaration") {
        claim(types, member.name, code, member.loc?.startLine, shouldSkipTypeOrNamespace);
        walkClassMembers(member.members, code, member.name.toLowerCase());
        continue;
      }
      if (member.kind === "EnumDeclaration") {
        claim(types, member.name, code, member.loc?.startLine, shouldSkipTypeOrNamespace);
        for (const entry of member.entries) {
          claimMember(entry.name, code, entry.loc?.startLine ?? member.loc?.startLine);
        }
        continue;
      }
      if (member.kind === "DelegateDeclaration") {
        claim(types, member.name, code, member.loc?.startLine, shouldSkipTypeOrNamespace);
        continue;
      }
      if (member.kind === "MethodDeclaration") {
        if (member.libName !== undefined) {
          allocator.markTaken(member.name);
          continue;
        }
        if (!member.isConstructor) {
          claimMember(member.name, code, member.loc?.startLine);
          recordNamespaceMember(namespaceLower, member.name);
        }
        continue;
      }
      if (member.kind === "VariableDeclaration" || member.kind === "FieldDeclaration") {
        claimMember(member.name, code, member.loc?.startLine);
        recordNamespaceMember(namespaceLower, member.name);
      }
    }
  };

  for (const module of modules) {
    walkTop(module.unit.members, module.code);
  }

  const userTypes = buildUserTypeIndex(modules.map((module) => module.unit));

  return {
    namespaces,
    namespaceNames,
    types,
    members,
    systemCollidingMembers,
    nestedTypes,
    namespaceMembers,
    userTypes,
  };
}

export function createLocalRenameMap(
  method: MethodDeclaration,
  globalTaken: Iterable<string>,
): Map<string, string> {
  const allocator = new ShortNameAllocator(globalTaken);
  const map = new Map<string, string>();

  const rename = (name: string): void => {
    const lower = name.toLowerCase();
    if (map.has(lower) || isUglifyLocalReservedName(name)) return;
    map.set(lower, allocator.next());
  };

  for (const parameter of method.parameters) rename(parameter.name);

  const walkStatements = (statements: readonly Statement[]): void => {
    for (const statement of statements) {
      switch (statement.kind) {
        case "VariableDeclaration":
          rename(statement.name);
          break;
        case "ForStatement":
          rename(statement.counter.name);
          walkStatements(statement.body);
          break;
        case "ForEachStatement":
          rename(statement.elementVar.name);
          walkStatements(statement.body);
          break;
        case "UsingStatement":
          rename(statement.resourceVar.name);
          walkStatements(statement.body);
          break;
        case "TryCatchStatement":
          if (statement.catchVar) rename(statement.catchVar.name);
          walkStatements(statement.tryBody);
          walkStatements(statement.catchBody);
          if (statement.finallyBody) walkStatements(statement.finallyBody);
          break;
        case "IfStatement":
          walkStatements(statement.thenBranch);
          for (const branch of statement.elseIfBranches) walkStatements(branch.body);
          if (statement.elseBranch) walkStatements(statement.elseBranch);
          break;
        case "WhileStatement":
        case "WithStatement":
          walkStatements(statement.body);
          break;
        case "SelectCaseStatement":
          for (const branch of statement.cases) walkStatements(branch.body);
          break;
        case "Block":
          walkStatements(statement.statements);
          break;
        default:
          break;
      }
    }
  };

  walkStatements(method.body);
  return map;
}
