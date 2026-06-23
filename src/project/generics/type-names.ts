import type { TypeReference } from "../ast/ast";

/** Produces the compiler-safe flattened name for a concrete generic type. */
export function flatNameOf(type: TypeReference): string {
  if (type.typeArguments.length === 0) return type.name;
  return flatNameFromParts(type.name, type.typeArguments);
}

export function flatNameFromParts(name: string, args: readonly TypeReference[]): string {
  if (args.length === 0) return name;
  return `${name}_${args.map(flatNameArgumentOf).join("_")}`;
}

/** Canonical name retains generic structure for collision detection. */
export function canonicalNameOf(type: TypeReference): string {
  if (type.typeArguments.length === 0) return type.name;
  return `${type.name}<${type.typeArguments.map(canonicalNameOf).join(",")}>`;
}

function flatNameArgumentOf(type: TypeReference): string {
  if (type.typeArguments.length > 0) return flatNameOf(type);
  const lastDot = type.name.lastIndexOf(".");
  return lastDot === -1 ? type.name : type.name.substring(lastDot + 1);
}
