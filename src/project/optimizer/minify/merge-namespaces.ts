import { parseBasic, serializeUnit } from "../../parser";
import type { NamespaceDeclaration, TopLevelMember } from "../../ast/ast";
import type { RemoveUnusedModuleInput, RemoveUnusedResult } from "./remove-unused";

export function mergeDuplicateNamespaces(
  modules: readonly RemoveUnusedModuleInput[],
): RemoveUnusedResult {
  const optimized = new Map<string, string>();

  for (const module of modules) {
    const parse = parseBasic(module.code);
    if (parse.errors.length > 0) {
      optimized.set(module.moduleName, module.code);
      continue;
    }

    mergeDuplicateNamespacesInMembers(parse.unit.members);
    optimized.set(module.moduleName, serializeUnit(parse.unit, { eol: "\r\n" }));
  }

  return { modules: optimized };
}

function mergeDuplicateNamespacesInMembers(members: TopLevelMember[]): void {
  const mergedMembers: TopLevelMember[] = [];
  const namespaceByName = new Map<string, NamespaceDeclaration>();

  for (const member of members) {
    if (member.kind !== "NamespaceDeclaration") {
      mergedMembers.push(member);
      continue;
    }

    mergeDuplicateNamespacesInMembers(member.members);

    const key = member.name.toLowerCase();
    const existing = namespaceByName.get(key);
    if (!existing) {
      namespaceByName.set(key, member);
      mergedMembers.push(member);
      continue;
    }

    existing.members.push(...member.members);
  }

  members.splice(0, members.length, ...mergedMembers);
}
