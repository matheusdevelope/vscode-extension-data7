import { lookupSystemByName } from "../../system-library";
import type { CompilationUnit, TopLevelMember } from "../ast/ast";
import type { GenericTemplate, TemplateRegistry } from "./registry";

/**
 * Build-time classification of a concrete type argument for
 * `TypeSystem.IsKind(T, "...")` metaprogramming directives.
 */
export type MetaTypeKind = "Class" | "Delegate" | "Structure" | "Primitive" | "Enum" | "Unknown";

const META_TYPE_KINDS = new Set<string>([
  "class",
  "delegate",
  "structure",
  "primitive",
  "enum",
  "unknown",
]);

/**
 * Scalar / language types treated as `Primitive` by metaprogramming.
 * Intentionally narrower than the linter's {@link PRIMITIVE_TYPES}: class-like
 * globals such as `TObject` stay `Class` when resolved via the symbol catalog.
 */
export const META_PRIMITIVE_TYPES: ReadonlySet<string> = new Set([
  "boolean",
  "byte",
  "char",
  "currency",
  "date",
  "decimal",
  "double",
  "extended",
  "integer",
  "long",
  "longint",
  "short",
  "shortstring",
  "single",
  "string",
  "tdatetime",
  "variant",
  "void",
  "widechar",
  "word",
]);

export function parseMetaTypeKind(raw: string): MetaTypeKind | undefined {
  const lower = raw.trim().toLowerCase();
  if (!META_TYPE_KINDS.has(lower)) return undefined;
  switch (lower) {
    case "class":
      return "Class";
    case "delegate":
      return "Delegate";
    case "structure":
      return "Structure";
    case "primitive":
      return "Primitive";
    case "enum":
      return "Enum";
    case "unknown":
      return "Unknown";
    default:
      return undefined;
  }
}

export interface ResolveMetaTypeKindContext {
  readonly unit: CompilationUnit;
  readonly templates: TemplateRegistry;
  readonly concreteInstantiations: ReadonlyMap<
    string,
    { readonly templateName: string; readonly flatName: string }
  >;
  readonly resolveTypeKind?: (typeName: string) => MetaTypeKind | undefined;
}

/** Resolves the metaprogramming kind of a concrete (already-substituted) type name. */
export function resolveMetaTypeKind(
  typeName: string,
  ctx: ResolveMetaTypeKindContext,
): MetaTypeKind {
  const simple = simpleMetaTypeName(typeName);
  if (!simple) return "Unknown";

  const fromOptions = ctx.resolveTypeKind?.(typeName) ?? ctx.resolveTypeKind?.(simple);
  if (fromOptions) return fromOptions;

  if (META_PRIMITIVE_TYPES.has(simple.toLowerCase())) return "Primitive";

  const fromConcrete = kindFromConcreteInstantiation(simple, ctx);
  if (fromConcrete) return fromConcrete;

  const fromTemplatePrefix = kindFromTemplatePrefix(simple, ctx.templates);
  if (fromTemplatePrefix) return fromTemplatePrefix;

  const fromUnit = findTypeKindInMembers(ctx.unit.members, simple);
  if (fromUnit) return fromUnit;

  const fromSystem = kindFromSystemLibrary(simple);
  if (fromSystem) return fromSystem;

  return "Unknown";
}

function simpleMetaTypeName(typeName: string): string {
  const trimmed = typeName.trim();
  if (!trimmed) return "";
  const genericStart = trimmed.indexOf("<");
  const withoutGeneric = genericStart >= 0 ? trimmed.slice(0, genericStart).trim() : trimmed;
  const dot = withoutGeneric.lastIndexOf(".");
  return dot >= 0 ? withoutGeneric.slice(dot + 1) : withoutGeneric;
}

function kindFromConcreteInstantiation(
  typeName: string,
  ctx: ResolveMetaTypeKindContext,
): MetaTypeKind | undefined {
  const concrete = ctx.concreteInstantiations.get(typeName.toLowerCase());
  if (!concrete) return undefined;
  return kindFromTemplate(ctx.templates.get(concrete.templateName));
}

function kindFromTemplatePrefix(
  typeName: string,
  templates: TemplateRegistry,
): MetaTypeKind | undefined {
  const lower = typeName.toLowerCase();
  let best: { readonly name: string; readonly kind: MetaTypeKind } | undefined;
  for (const templateName of templates.names()) {
    const template = templates.get(templateName);
    if (!template) continue;
    const kind = kindFromTemplate(template);
    if (!kind || kind === "Unknown") continue;
    const base = template.name.toLowerCase();
    if (lower === base || lower.startsWith(`${base}_`)) {
      if (!best || base.length > best.name.length) {
        best = { name: base, kind };
      }
    }
  }
  return best?.kind;
}

function kindFromTemplate(template: GenericTemplate | undefined): MetaTypeKind | undefined {
  if (!template) return undefined;
  if (template.kind === "DelegateDeclaration") return "Delegate";
  if (template.kind === "ClassDeclaration") {
    const node = template.node;
    if (node.kind === "ClassDeclaration" && node.modifiers?.includes("structure")) {
      return "Structure";
    }
    return "Class";
  }
  return undefined;
}

function findTypeKindInMembers(
  members: readonly TopLevelMember[],
  typeName: string,
): MetaTypeKind | undefined {
  const lower = typeName.toLowerCase();
  for (const member of members) {
    if (member.kind === "NamespaceDeclaration") {
      const nested = findTypeKindInMembers(member.members, typeName);
      if (nested) return nested;
      continue;
    }
    if (member.kind === "DelegateDeclaration" && member.name.toLowerCase() === lower) {
      return "Delegate";
    }
    if (member.kind === "EnumDeclaration" && member.name.toLowerCase() === lower) {
      return "Enum";
    }
    if (member.kind === "ClassDeclaration" && member.name.toLowerCase() === lower) {
      return member.modifiers?.includes("structure") ? "Structure" : "Class";
    }
  }
  return undefined;
}

function kindFromSystemLibrary(typeName: string): MetaTypeKind | undefined {
  const symbols = lookupSystemByName(typeName);
  if (symbols.some((symbol) => symbol.kind === "delegate")) return "Delegate";
  if (symbols.some((symbol) => symbol.kind === "structure")) return "Structure";
  if (symbols.some((symbol) => symbol.kind === "class")) return "Class";
  return undefined;
}
