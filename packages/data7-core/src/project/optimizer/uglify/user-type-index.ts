import type {
  ClassMember,
  CompilationUnit,
  Expression,
  TopLevelMember,
  TypeReference,
} from "../../ast/ast";
import { lookupSystemClassByName } from "../../../system-library";

export interface UserMemberRecord {
  readonly lower: string;
  /** Simple type name (last segment, lower) when known. */
  readonly typeLower?: string;
  /**
   * Method overloads: arity → return type.
   * Default `typeLower` prefers the zero-arg overload when present so
   * `list.Last().Options` resolves `Last() As TItem` rather than `Last(n) As TList`.
   */
  readonly overloads?: ReadonlyArray<{ readonly arity: number; readonly typeLower?: string }>;
}

export interface UserTypeRecord {
  readonly lower: string;
  readonly name: string;
  /** Declaring namespace (lower), when the type lives inside one. */
  readonly namespaceLower?: string;
  /** Simple base type name (last segment, lower), if any. */
  readonly baseLower?: string;
  readonly members: ReadonlyMap<string, UserMemberRecord>;
}

export type UserTypeIndex = ReadonlyMap<string, UserTypeRecord>;

export function typeReferenceSimpleLower(type: TypeReference | undefined): string | undefined {
  if (!type?.name) return undefined;
  const parts = type.name.split(".").filter((part) => part.length > 0);
  const last = parts[parts.length - 1];
  return last ? last.toLowerCase() : undefined;
}

export function qualifiedTypeKey(typeLower: string, namespaceLower?: string): string {
  return namespaceLower ? `${namespaceLower}.${typeLower}` : typeLower;
}

/** Prefer `namespace.type` when available, else the simple type name. */
export function lookupUserType(
  typeLower: string,
  userTypes: UserTypeIndex,
  namespaceLower?: string,
): UserTypeRecord | undefined {
  if (namespaceLower) {
    const qualified = userTypes.get(qualifiedTypeKey(typeLower, namespaceLower));
    if (qualified) return qualified;
  }
  return userTypes.get(typeLower);
}

function mergeMethodRecords(a: UserMemberRecord, b: UserMemberRecord): UserMemberRecord {
  const overloads = [...(a.overloads ?? []), ...(b.overloads ?? [])];
  if (overloads.length === 0) {
    return {
      lower: a.lower,
      typeLower: b.typeLower ?? a.typeLower,
    };
  }
  const zero = overloads.find((entry) => entry.arity === 0);
  return {
    lower: a.lower,
    typeLower: zero?.typeLower ?? b.typeLower ?? a.typeLower,
    overloads,
  };
}

function recordMethod(
  into: Map<string, UserMemberRecord>,
  name: string,
  arity: number,
  typeLower: string | undefined,
): void {
  const lower = name.toLowerCase();
  const next: UserMemberRecord = {
    lower,
    typeLower,
    overloads: [{ arity, typeLower }],
  };
  const existing = into.get(lower);
  into.set(lower, existing ? mergeMethodRecords(existing, next) : next);
}

/** Resolve a member's return/field type, optionally selecting a method overload by arity. */
export function memberTypeLower(
  member: UserMemberRecord | undefined,
  arity?: number,
): string | undefined {
  if (!member) return undefined;
  if (arity !== undefined && member.overloads && member.overloads.length > 0) {
    const match = member.overloads.find((entry) => entry.arity === arity);
    if (match) return match.typeLower;
  }
  return member.typeLower;
}

/**
 * Build a map of user class/structure/enum types → declared members (+ optional base).
 * Types inside namespaces are keyed as `namespace.type` and, when unambiguous, also
 * under the simple type name. Same simple name from *different* namespaces must not
 * merge members (e.g. `mod_enum.TEnum` vs `mod_tenum.TEnum`).
 */
export function buildUserTypeIndex(units: readonly CompilationUnit[]): UserTypeIndex {
  const types = new Map<string, UserTypeRecord>();

  const upsert = (
    name: string,
    baseType: TypeReference | undefined,
    members: Map<string, UserMemberRecord>,
    namespaceLower?: string,
  ): void => {
    const simpleLower = name.toLowerCase();
    const keys = [qualifiedTypeKey(simpleLower, namespaceLower)];
    if (namespaceLower) {
      const existingSimple = types.get(simpleLower);
      if (
        !existingSimple ||
        existingSimple.namespaceLower === undefined ||
        existingSimple.namespaceLower === namespaceLower
      ) {
        keys.push(simpleLower);
      }
    }

    for (const key of keys) {
      const existing = types.get(key);
      const merged = new Map(existing?.members ?? []);
      for (const [memberKey, value] of members) {
        const prev = merged.get(memberKey);
        merged.set(
          memberKey,
          prev && (prev.overloads || value.overloads) ? mergeMethodRecords(prev, value) : value,
        );
      }
      types.set(key, {
        lower: key,
        name: existing?.name ?? name,
        namespaceLower: namespaceLower ?? existing?.namespaceLower,
        baseLower: typeReferenceSimpleLower(baseType) ?? existing?.baseLower,
        members: merged,
      });
    }
  };

  const walkClassMembers = (
    classMembers: readonly ClassMember[],
    into: Map<string, UserMemberRecord>,
    namespaceLower?: string,
  ): void => {
    for (const member of classMembers) {
      if (member.kind === "ClassDeclaration") {
        const nested = new Map<string, UserMemberRecord>();
        walkClassMembers(member.members, nested, namespaceLower);
        upsert(member.name, member.baseType, nested, namespaceLower);
        into.set(member.name.toLowerCase(), {
          lower: member.name.toLowerCase(),
          typeLower: member.name.toLowerCase(),
        });
        continue;
      }
      if (member.kind === "MethodDeclaration") {
        if (member.isConstructor || member.libName !== undefined) continue;
        recordMethod(
          into,
          member.name,
          member.parameters.length,
          typeReferenceSimpleLower(member.returnType),
        );
        continue;
      }
      if (member.kind === "FieldDeclaration") {
        into.set(member.name.toLowerCase(), {
          lower: member.name.toLowerCase(),
          typeLower: typeReferenceSimpleLower(member.type),
        });
        continue;
      }
      if (member.kind === "PropertyDeclaration") {
        into.set(member.name.toLowerCase(), {
          lower: member.name.toLowerCase(),
          typeLower: typeReferenceSimpleLower(member.type),
        });
      }
    }
  };

  const walkTop = (members: readonly TopLevelMember[], namespaceLower?: string): void => {
    for (const member of members) {
      if (member.kind === "NamespaceDeclaration") {
        const nsLower = member.name.toLowerCase();
        const nsMembers = new Map<string, UserMemberRecord>();
        for (const child of member.members) {
          if (child.kind === "MethodDeclaration") {
            if (child.isConstructor || child.libName !== undefined) continue;
            recordMethod(
              nsMembers,
              child.name,
              child.parameters.length,
              typeReferenceSimpleLower(child.returnType),
            );
            continue;
          }
          if (child.kind === "VariableDeclaration" || child.kind === "FieldDeclaration") {
            nsMembers.set(child.name.toLowerCase(), {
              lower: child.name.toLowerCase(),
              typeLower: bindingTypeLowerFromDeclaration(child),
            });
          }
        }
        upsert(member.name, undefined, nsMembers);
        walkTop(member.members, nsLower);
        continue;
      }
      if (member.kind === "ClassDeclaration") {
        const classMembers = new Map<string, UserMemberRecord>();
        walkClassMembers(member.members, classMembers, namespaceLower);
        upsert(member.name, member.baseType, classMembers, namespaceLower);
        continue;
      }
      if (member.kind === "EnumDeclaration") {
        const enumMembers = new Map<string, UserMemberRecord>();
        for (const entry of member.entries) {
          enumMembers.set(entry.name.toLowerCase(), { lower: entry.name.toLowerCase() });
        }
        upsert(member.name, member.baseType, enumMembers, namespaceLower);
        continue;
      }
      if (member.kind === "DelegateDeclaration") {
        upsert(member.name, undefined, new Map(), namespaceLower);
      }
    }
  };

  for (const unit of units) walkTop(unit.members);
  return types;
}

/** Look up a member on a user type, walking the user `Inherits` chain. */
export function findUserMember(
  typeLower: string,
  memberLower: string,
  userTypes: UserTypeIndex,
  namespaceLower?: string,
): UserMemberRecord | undefined {
  let current: string | undefined = typeLower;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const record = lookupUserType(current, userTypes, namespaceLower);
    if (!record) {
      return undefined;
    }
    const member = record.members.get(memberLower);
    if (member) return member;
    current = record.baseLower;
  }
  return undefined;
}

export function findUserMemberTypeLower(
  typeLower: string,
  memberLower: string,
  userTypes: UserTypeIndex,
  namespaceLower?: string,
  arity?: number,
): string | undefined {
  return memberTypeLower(findUserMember(typeLower, memberLower, userTypes, namespaceLower), arity);
}

/** True when `memberLower` is declared on a user type in the inheritance chain (user types only). */
export function userTypeOwnsMember(
  typeLower: string,
  memberLower: string,
  userTypes: UserTypeIndex,
  namespaceLower?: string,
): boolean {
  return findUserMember(typeLower, memberLower, userTypes, namespaceLower) !== undefined;
}

export function isKnownSystemTypeName(name: string): boolean {
  return lookupSystemClassByName(name).length > 0;
}

export interface ReceiverScope {
  readonly currentClassLower?: string;
  readonly currentBaseLower?: string;
  readonly currentNamespaceLower?: string;
  /** Innermost `With` target type (simple name, lower), if any. */
  readonly withTypeLower?: string;
  /** Local / param / field bindings: name lower → type simple lower. */
  readonly bindings: ReadonlyMap<string, string>;
  /** Known user namespace simple names (lower) for `Namespace.Member` receivers. */
  readonly namespaceNames?: ReadonlySet<string>;
}

/**
 * Best-effort receiver type (simple name, lower) for member-access gating.
 */
export function resolveReceiverTypeLower(
  expression: Expression | undefined,
  scope: ReceiverScope,
  userTypes: UserTypeIndex,
  typeNames: ReadonlySet<string>,
): string | undefined {
  if (!expression) return scope.withTypeLower;

  switch (expression.kind) {
    case "Identifier": {
      if (expression.name === "") return scope.withTypeLower;
      const lower = expression.name.toLowerCase();
      if (lower === "me" || lower === "myclass") return scope.currentClassLower;
      if (lower === "mybase") return scope.currentBaseLower;
      const bound = scope.bindings.get(lower);
      if (bound) return bound;
      if (lookupUserType(lower, userTypes, scope.currentNamespaceLower) || typeNames.has(lower)) {
        return lower;
      }
      if (scope.namespaceNames?.has(lower)) return lower;
      return undefined;
    }
    case "ObjectCreationExpression":
      return typeReferenceSimpleLower(expression.type);
    case "TypeReferenceExpression":
      return typeReferenceSimpleLower(expression.type);
    case "MemberAccess": {
      const targetType = resolveReceiverTypeLower(expression.target, scope, userTypes, typeNames);
      const memberLower = expression.member.toLowerCase();
      if (!targetType) {
        if (
          lookupUserType(memberLower, userTypes, scope.currentNamespaceLower) ||
          typeNames.has(memberLower)
        ) {
          return memberLower;
        }
        return undefined;
      }
      if (scope.namespaceNames?.has(targetType)) {
        if (
          lookupUserType(memberLower, userTypes, scope.currentNamespaceLower) ||
          typeNames.has(memberLower)
        ) {
          return memberLower;
        }
        return findUserMemberTypeLower(
          targetType,
          memberLower,
          userTypes,
          scope.currentNamespaceLower,
        );
      }
      return findUserMemberTypeLower(
        targetType,
        memberLower,
        userTypes,
        scope.currentNamespaceLower,
      );
    }
    case "MethodInvocation": {
      if (!expression.callee) {
        if (scope.withTypeLower) {
          return (
            findUserMemberTypeLower(
              scope.withTypeLower,
              expression.methodName.toLowerCase(),
              userTypes,
              scope.currentNamespaceLower,
              expression.arguments.length,
            ) ?? scope.withTypeLower
          );
        }
        const castType = expression.methodName.toLowerCase();
        if (
          lookupUserType(castType, userTypes, scope.currentNamespaceLower) ||
          typeNames.has(castType)
        ) {
          return castType;
        }
        // Bare namespace function: `GetDefault().Printe` → resolve GetDefault's return type.
        if (scope.currentNamespaceLower) {
          const fromNamespace = findUserMemberTypeLower(
            scope.currentNamespaceLower,
            expression.methodName.toLowerCase(),
            userTypes,
            scope.currentNamespaceLower,
            expression.arguments.length,
          );
          if (fromNamespace) return fromNamespace;
        }
        return undefined;
      }
      const targetType = resolveReceiverTypeLower(expression.callee, scope, userTypes, typeNames);
      if (!targetType) return undefined;
      return findUserMemberTypeLower(
        targetType,
        expression.methodName.toLowerCase(),
        userTypes,
        scope.currentNamespaceLower,
        expression.arguments.length,
      );
    }
    default:
      return undefined;
  }
}

export function bindingTypeLowerFromDeclaration(options: {
  readonly type?: TypeReference;
  readonly initializer?: Expression;
}): string | undefined {
  const fromType = typeReferenceSimpleLower(options.type);
  if (fromType) return fromType;
  if (options.initializer?.kind === "ObjectCreationExpression") {
    return typeReferenceSimpleLower(options.initializer.type);
  }
  return undefined;
}
