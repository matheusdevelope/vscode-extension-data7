import type { DeclarationKind, ReachabilityRemoveOptions } from "./types";

export function shouldRemoveKind(
  kind: DeclarationKind,
  remove: ReachabilityRemoveOptions,
): boolean {
  switch (kind) {
    case "namespace":
      return remove.namespaces;
    case "class":
      return remove.classes;
    case "structure":
      return remove.structures;
    case "enum":
      return remove.enums;
    case "delegate":
      return remove.delegates;
    case "method":
      return remove.methods;
    case "declareMethod":
      return remove.declareMethods;
    case "field":
      return remove.fields;
    case "property":
      return remove.properties;
    case "const":
      return remove.consts;
    case "variable":
      return remove.variables;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** True when any non-namespace declaration kind may be kept despite being unreachable. */
export function retainsUnreachableMembers(remove: ReachabilityRemoveOptions): boolean {
  return (
    !remove.classes ||
    !remove.structures ||
    !remove.enums ||
    !remove.delegates ||
    !remove.methods ||
    !remove.declareMethods ||
    !remove.fields ||
    !remove.properties ||
    !remove.consts ||
    !remove.variables
  );
}
