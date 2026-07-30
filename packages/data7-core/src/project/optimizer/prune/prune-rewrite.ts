import type {
  ClassDeclaration,
  ClassMember,
  CompilationUnit,
  MethodDeclaration,
  NamespaceDeclaration,
  TopLevelMember,
} from "../../ast/ast";
import type { PruneRemoveOptions } from "../optimization-options";
import {
  declarationKey,
  formatDeclarationLabel,
  shouldRemoveKind,
  type DeclarationKind,
  type LiveSet,
  type ParsedReachabilityModule,
  type ReachabilityIndex,
} from "../../../analysis/declaration-reachability";

export interface RewriteResult {
  readonly unit: CompilationUnit;
  readonly excludedDeclarations: readonly string[];
}

function isLive(
  live: LiveSet,
  moduleName: string,
  namespace: string,
  ownerClass: string | undefined,
  kind: DeclarationKind,
  name: string,
): boolean {
  const key = declarationKey(moduleName, namespace, ownerClass, kind, name);
  return live.declarations.has(key);
}

function isStructure(node: ClassDeclaration): boolean {
  return (node.modifiers ?? []).some((modifier) => modifier.toLowerCase() === "structure");
}

function methodKind(node: MethodDeclaration): DeclarationKind {
  return node.libName !== undefined ? "declareMethod" : "method";
}

export function rewriteCompilationUnit(
  unit: CompilationUnit,
  module: ParsedReachabilityModule,
  index: ReachabilityIndex,
  live: LiveSet,
  remove: PruneRemoveOptions,
): RewriteResult {
  const excluded: string[] = [];
  const moduleName = module.input.moduleName;

  const rewriteClassMembers = (
    members: readonly ClassMember[],
    namespace: string,
    ownerClass: string,
  ): ClassMember[] => {
    const result: ClassMember[] = [];
    for (const member of members) {
      if (member.kind === "ClassDeclaration") {
        const kind: DeclarationKind = isStructure(member) ? "structure" : "class";
        const alive = isLive(live, moduleName, namespace, ownerClass, kind, member.name);
        if (!alive && shouldRemoveKind(kind, remove)) {
          excluded.push(formatDeclarationLabel(namespace, ownerClass, kind, member.name));
          continue;
        }
        if (!alive && !shouldRemoveKind(kind, remove)) {
          result.push(member);
          continue;
        }
        result.push({
          ...member,
          members: rewriteClassMembers(member.members, namespace, member.name),
        });
        continue;
      }

      if (member.kind === "MethodDeclaration") {
        const kind = methodKind(member);
        const alive = isLive(live, moduleName, namespace, ownerClass, kind, member.name);
        if (!alive && shouldRemoveKind(kind, remove)) {
          excluded.push(formatDeclarationLabel(namespace, ownerClass, kind, member.name));
          continue;
        }
        result.push(member);
        continue;
      }

      if (member.kind === "FieldDeclaration") {
        const alive = isLive(live, moduleName, namespace, ownerClass, "field", member.name);
        if (!alive && shouldRemoveKind("field", remove)) {
          excluded.push(formatDeclarationLabel(namespace, ownerClass, "field", member.name));
          continue;
        }
        result.push(member);
        continue;
      }

      if (member.kind === "PropertyDeclaration") {
        const alive = isLive(live, moduleName, namespace, ownerClass, "property", member.name);
        if (!alive && shouldRemoveKind("property", remove)) {
          excluded.push(formatDeclarationLabel(namespace, ownerClass, "property", member.name));
          continue;
        }
        result.push(member);
      }
    }
    return result;
  };

  const rewriteNamespaceMembers = (
    members: readonly TopLevelMember[],
    namespace: string,
  ): TopLevelMember[] => {
    const result: TopLevelMember[] = [];
    for (const member of members) {
      if (member.kind === "ClassDeclaration") {
        const kind: DeclarationKind = isStructure(member) ? "structure" : "class";
        const alive = isLive(live, moduleName, namespace, undefined, kind, member.name);
        if (!alive && shouldRemoveKind(kind, remove)) {
          excluded.push(formatDeclarationLabel(namespace, undefined, kind, member.name));
          continue;
        }
        if (!alive && !shouldRemoveKind(kind, remove)) {
          result.push(member);
          continue;
        }
        result.push({
          ...member,
          members: rewriteClassMembers(member.members, namespace, member.name),
        });
        continue;
      }

      if (member.kind === "EnumDeclaration") {
        const alive = isLive(live, moduleName, namespace, undefined, "enum", member.name);
        if (!alive && shouldRemoveKind("enum", remove)) {
          excluded.push(formatDeclarationLabel(namespace, undefined, "enum", member.name));
          continue;
        }
        result.push(member);
        continue;
      }

      if (member.kind === "DelegateDeclaration") {
        const alive = isLive(live, moduleName, namespace, undefined, "delegate", member.name);
        if (!alive && shouldRemoveKind("delegate", remove)) {
          excluded.push(formatDeclarationLabel(namespace, undefined, "delegate", member.name));
          continue;
        }
        result.push(member);
        continue;
      }

      if (member.kind === "MethodDeclaration") {
        const kind = methodKind(member);
        const alive = isLive(live, moduleName, namespace, undefined, kind, member.name);
        if (!alive && shouldRemoveKind(kind, remove)) {
          excluded.push(formatDeclarationLabel(namespace, undefined, kind, member.name));
          continue;
        }
        result.push(member);
        continue;
      }

      if (member.kind === "VariableDeclaration") {
        const kind: DeclarationKind = member.isConst ? "const" : "variable";
        const alive = isLive(live, moduleName, namespace, undefined, kind, member.name);
        if (!alive && shouldRemoveKind(kind, remove)) {
          excluded.push(formatDeclarationLabel(namespace, undefined, kind, member.name));
          continue;
        }
        result.push(member);
        continue;
      }

      result.push(member);
    }
    return result;
  };

  const members: TopLevelMember[] = [];
  for (const member of unit.members) {
    if (member.kind === "ImportsDeclaration") {
      if (!remove.unusedImports) {
        members.push(member);
        continue;
      }
      const target = member.target.trim().toLowerCase();
      // Only drop Imports that target a project namespace known to be dead.
      // System/external imports (Collections, IO, …) are not in the reachability index
      // and must be kept — types like StringList still need them at compile time.
      const isProjectNamespace = index.namespaceByLower.has(target);
      if (!isProjectNamespace || live.namespaces.has(target)) {
        members.push(member);
      } else {
        excluded.push(`import:${member.target.trim()}`);
      }
      continue;
    }

    if (member.kind === "NamespaceDeclaration") {
      const nsAlive = live.namespaces.has(member.name.toLowerCase());
      if (!nsAlive && shouldRemoveKind("namespace", remove)) {
        excluded.push(formatDeclarationLabel(member.name, undefined, "namespace", member.name));
        continue;
      }
      if (!nsAlive && !shouldRemoveKind("namespace", remove)) {
        members.push(member);
        continue;
      }
      const rewritten: NamespaceDeclaration = {
        ...member,
        members: rewriteNamespaceMembers(member.members, member.name),
      };
      // Drop empty namespaces when namespace removal is enabled.
      if (
        shouldRemoveKind("namespace", remove) &&
        !namespaceHasRetainedDeclarations(rewritten, moduleName, live, remove)
      ) {
        excluded.push(formatDeclarationLabel(member.name, undefined, "namespace", member.name));
        continue;
      }
      members.push(rewritten);
      continue;
    }

    // Top-level declarations outside namespaces (rare).
    members.push(...rewriteNamespaceMembers([member], ""));
  }

  return { unit: { ...unit, members }, excludedDeclarations: excluded };
}

function namespaceHasRetainedDeclarations(
  ns: NamespaceDeclaration,
  moduleName: string,
  live: LiveSet,
  remove: PruneRemoveOptions,
): boolean {
  const walkTop = (members: readonly TopLevelMember[]): boolean => {
    for (const member of members) {
      if (member.kind === "ClassDeclaration") {
        const kind: DeclarationKind = isStructure(member) ? "structure" : "class";
        if (
          isLive(live, moduleName, ns.name, undefined, kind, member.name) ||
          !shouldRemoveKind(kind, remove)
        ) {
          return true;
        }
        if (walkClass(member.members, member.name)) return true;
      } else if (member.kind === "MethodDeclaration") {
        const kind = methodKind(member);
        if (
          isLive(live, moduleName, ns.name, undefined, kind, member.name) ||
          !shouldRemoveKind(kind, remove)
        ) {
          return true;
        }
      } else if (member.kind === "EnumDeclaration") {
        if (
          isLive(live, moduleName, ns.name, undefined, "enum", member.name) ||
          !shouldRemoveKind("enum", remove)
        ) {
          return true;
        }
      } else if (member.kind === "DelegateDeclaration") {
        if (
          isLive(live, moduleName, ns.name, undefined, "delegate", member.name) ||
          !shouldRemoveKind("delegate", remove)
        ) {
          return true;
        }
      } else if (member.kind === "VariableDeclaration") {
        const kind: DeclarationKind = member.isConst ? "const" : "variable";
        if (
          isLive(live, moduleName, ns.name, undefined, kind, member.name) ||
          !shouldRemoveKind(kind, remove)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const walkClass = (members: readonly ClassMember[], ownerClass: string): boolean => {
    for (const member of members) {
      if (member.kind === "ClassDeclaration") {
        const kind: DeclarationKind = isStructure(member) ? "structure" : "class";
        if (
          isLive(live, moduleName, ns.name, ownerClass, kind, member.name) ||
          !shouldRemoveKind(kind, remove)
        ) {
          return true;
        }
        if (walkClass(member.members, member.name)) return true;
      } else if (member.kind === "MethodDeclaration") {
        const kind = methodKind(member);
        if (
          isLive(live, moduleName, ns.name, ownerClass, kind, member.name) ||
          !shouldRemoveKind(kind, remove)
        ) {
          return true;
        }
      } else if (member.kind === "FieldDeclaration") {
        if (
          isLive(live, moduleName, ns.name, ownerClass, "field", member.name) ||
          !shouldRemoveKind("field", remove)
        ) {
          return true;
        }
      } else if (member.kind === "PropertyDeclaration") {
        if (
          isLive(live, moduleName, ns.name, ownerClass, "property", member.name) ||
          !shouldRemoveKind("property", remove)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  return walkTop(ns.members);
}

export function shouldExcludeEntireModule(
  module: ParsedReachabilityModule,
  live: LiveSet,
  remove: PruneRemoveOptions,
  index: ReachabilityIndex,
): boolean {
  if (module.input.moduleName.toLowerCase() === "principal") {
    return false;
  }
  const declaredNamespaces = index.declarations.filter(
    (decl) => decl.module === module && decl.kind === "namespace",
  );
  if (declaredNamespaces.length === 0) {
    return true;
  }
  if (!remove.namespaces) {
    return false;
  }
  return !declaredNamespaces.some((ns) => live.namespaces.has(ns.lower));
}

export function hasNamespaceDeclarations(members: readonly TopLevelMember[]): boolean {
  return members.some((member) => member.kind === "NamespaceDeclaration");
}
