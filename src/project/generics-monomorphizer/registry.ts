import type {
  ClassDeclaration,
  DelegateDeclaration,
  MethodDeclaration,
  TopLevelMember,
  TypeParameter,
} from "./ast";

/** Discriminator for entries in the {@link TemplateRegistry}. */
export type TemplateKind = "ClassDeclaration" | "MethodDeclaration" | "DelegateDeclaration";

/**
 * One entry of the {@link TemplateRegistry}. The `node` is a deep clone of
 * the original generic declaration (parameters, body, signatures, …) and is
 * never mutated; each instantiation deep-clones it again.
 *
 * `host` references the `members[]` array the original declaration was
 * removed from during pruning. Newly monomorphized declarations are
 * re-injected at the front of that same array, preserving namespace
 * locality.
 */
export interface GenericTemplate {
  readonly name: string;
  readonly kind: TemplateKind;
  readonly typeParameters: readonly TypeParameter[];
  readonly node: ClassDeclaration | MethodDeclaration | DelegateDeclaration;
  readonly host: TopLevelMember[];
}

/**
 * Map from original generic name (e.g. `"Box"`, `"Dictionary"`,
 * `"ProcessItem"`) to its template entry. Two declarations sharing the same
 * name (overloading) are treated as a `duplicate-template` warning by the
 * monomorphizer; the second one registered wins.
 */
export class TemplateRegistry {
  private readonly map = new Map<string, GenericTemplate>();

  register(template: GenericTemplate): void {
    this.map.set(template.name.toLowerCase(), template);
  }

  get(name: string): GenericTemplate | undefined {
    return this.map.get(name.toLowerCase());
  }

  has(name: string): boolean {
    return this.map.has(name.toLowerCase());
  }

  get size(): number {
    return this.map.size;
  }

  names(): readonly string[] {
    return Array.from(this.map.keys());
  }
}

/**
 * Tracks the flat names of every monomorphized declaration that has already
 * been emitted into the AST. Enforces the One Definition Rule: a flat name
 * is added at most once, regardless of how many times the corresponding
 * generic type/method is used in the source.
 */
export class GlobalInstantiatedSet {
  private readonly emitted = new Set<string>();

  /** Returns `true` iff `flatName` was newly added (i.e. not seen before). */
  register(flatName: string): boolean {
    if (this.emitted.has(flatName)) return false;
    this.emitted.add(flatName);
    return true;
  }

  has(flatName: string): boolean {
    return this.emitted.has(flatName);
  }

  get size(): number {
    return this.emitted.size;
  }

  values(): readonly string[] {
    return Array.from(this.emitted);
  }
}
