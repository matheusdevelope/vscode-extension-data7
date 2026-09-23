import type { TypeReference } from "../ast/ast";

/** Produces the compiler-safe flattened name for a concrete generic type. */
export function flatNameOf(
  type: TypeReference,
  homonymousSimpleNames?: ReadonlySet<string>,
): string {
  if (type.typeArguments.length === 0) return type.name;
  return flatNameFromParts(type.name, type.typeArguments, homonymousSimpleNames);
}

export function flatNameFromParts(
  name: string,
  args: readonly TypeReference[],
  homonymousSimpleNames?: ReadonlySet<string>,
): string {
  if (args.length === 0) return name;
  return `${name}_${args.map((arg) => flatNameArgumentOf(arg, homonymousSimpleNames)).join("_")}`;
}

/** Canonical name retains generic structure for collision detection. */
export function canonicalNameOf(type: TypeReference): string {
  if (type.typeArguments.length === 0) return type.name;
  return `${type.name}<${type.typeArguments.map(canonicalNameOf).join(",")}>`;
}

/**
 * Flatten a concrete type-argument name. Qualified homonyms keep the
 * namespace (`table_campo.TCampo` → `table_campo_TCampo`); unique types
 * still drop the qualifier (`mod_product.Product` → `Product`).
 */
export function flattenConcreteTypeArgName(
  typeName: string,
  homonymousSimpleNames?: ReadonlySet<string>,
): string {
  return flatNameArgumentOf(
    { kind: "TypeReference", name: typeName, typeArguments: [] },
    homonymousSimpleNames,
  );
}

function flatNameArgumentOf(
  type: TypeReference,
  homonymousSimpleNames?: ReadonlySet<string>,
): string {
  if (type.typeArguments.length > 0) return flatNameOf(type, homonymousSimpleNames);
  const lastDot = type.name.lastIndexOf(".");
  if (lastDot === -1) return type.name;
  const simple = type.name.substring(lastDot + 1);
  if (!homonymousSimpleNames?.has(simple.toLowerCase())) return simple;
  const qualifier = type.name.substring(0, lastDot).replace(/[^A-Za-z0-9]+/g, "_");
  return `${qualifier}_${simple}`;
}
