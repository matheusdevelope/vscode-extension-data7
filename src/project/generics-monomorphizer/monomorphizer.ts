/**
 * Generics Monomorphization (Template Instantiation) Engine — core.
 *
 * Performs pure AST transformations to expand generic templates
 * (`Class Foo<T>`, `Sub Bar<T>`, `Delegate ... <T>`) into concrete,
 * non-generic declarations. The downstream Data7 compiler does not
 * understand `<T>` syntax, so every generic site must be resolved at this
 * layer before the AST reaches the builder.
 *
 * The engine is **structure-aware** and **logic-agnostic**: it does not
 * understand the bodies of methods or the semantics of expressions; it
 * only walks the tree, finds Type Parameters, substitutes them with
 * concrete Type References, and rewrites usage sites to flattened names.
 *
 * Pipeline (see {@link GenericsMonomorphizer.monomorphize}):
 *   1. Input validation — sanity checks (empty names, etc.) emit
 *      `invalid-input` warnings without aborting.
 *   2. Template Registration & Pruning — collect every generic
 *      declaration, deep-clone it into the {@link TemplateRegistry}, then
 *      remove the original from the AST so the downstream compiler never
 *      sees `<T>`. Generic methods declared inside classes are detected
 *      and pruned with a `class-generic-method-unsupported` warning.
 *   3. Usage Discovery & flat-name rewrite — walk the remaining AST
 *      looking for instantiation sites (TypeReference /
 *      ObjectCreationExpression / MethodInvocation) carrying type
 *      arguments. Each site is rewritten in place to its flat name and
 *      enqueued for instantiation. A canonical-name table also runs to
 *      surface `flat-name-collision` warnings.
 *   4. Monomorphization & Injection — drain the worklist (deduplicated
 *      via {@link GlobalInstantiatedSet}), deep-clone each template,
 *      substitute type parameters with concrete types, drop type
 *      parameters & constraints, rename, and inject the result at the
 *      front of the original host scope. The freshly injected
 *      declaration is re-walked so any nested generic references it
 *      surfaces are themselves scheduled.
 *
 * Nested generics (`TList<TList<Integer>>` → `TList_TList_Integer`) are
 * handled by the worklist: when a cloned template references another
 * generic, that reference is itself enqueued, processed, and rewritten —
 * until the worklist drains.
 *
 * Termination is enforced by {@link MAX_INSTANTIATIONS}: if the worklist
 * exceeds that limit the engine emits a `instantiation-limit-exceeded`
 * warning and stops draining (any remaining generic usages survive in the
 * AST and the downstream compiler will surface them as parser errors).
 */

import {
  ASTWalker,
  type ClassDeclaration,
  type CompilationUnit,
  type DelegateDeclaration,
  type MethodDeclaration,
  type MethodInvocation,
  type NamespaceDeclaration,
  type Node,
  type OpaqueStatement,
  type TopLevelMember,
  type TypeReference,
} from "./ast";
import { deepClone } from "./clone";
import { type GenericTemplate, GlobalInstantiatedSet, TemplateRegistry } from "./registry";
import type { MonomorphizationWarning, MonomorphizationWarningCode } from "./warnings";
import { substituteTypeParamsInLine } from "../generics-pass";
import { findInnerMostGenericUsage } from "../../analysis/generics-analyzer";

// ============================================================================
// Public API
// ============================================================================

/** Hard cap on the number of distinct instantiations the engine will emit. */
export const MAX_INSTANTIATIONS = 10_000;

export interface MonomorphizationResult {
  readonly unit: CompilationUnit;
  readonly templates: TemplateRegistry;
  readonly instantiated: GlobalInstantiatedSet;
  readonly warnings: readonly MonomorphizationWarning[];
}

/**
 * Pure-AST engine that rewrites a {@link CompilationUnit} so it contains
 * **no** generic declarations or generic usages.
 *
 * Each call to {@link monomorphize} creates a fresh {@link TemplateRegistry}
 * and {@link GlobalInstantiatedSet}; the engine itself is stateless between
 * calls (the per-run state lives on a private context object).
 */
export class GenericsMonomorphizer {
  monomorphize(unit: CompilationUnit): MonomorphizationResult {
    const ctx: MonoContext = {
      unit,
      templates: new TemplateRegistry(),
      instantiated: new GlobalInstantiatedSet(),
      enqueued: new Set<string>(),
      worklist: [],
      flatToCanonical: new Map<string, string>(),
      warnings: [],
    };

    // Step 1.
    validate(unit, ctx);

    // Step 2.
    collectAndPrune(unit, ctx);

    // Step 3.
    rewriteGenericUsages(unit, ctx);

    // Step 4.
    drainWorklist(ctx);

    return {
      unit,
      templates: ctx.templates,
      instantiated: ctx.instantiated,
      warnings: ctx.warnings,
    };
  }
}

// ============================================================================
// Naming helpers
// ============================================================================

/**
 * Flat naming rule:
 *
 * ```text
 * flatNameOf({ name: "Box", typeArguments: [Integer] })             === "Box_Integer"
 * flatNameOf({ name: "Dictionary", typeArguments: [String,Product] }) === "Dictionary_String_Product"
 * flatNameOf({ name: "TList", typeArguments: [TList<Integer>] })    === "TList_TList_Integer"
 * ```
 *
 * Recursive: inner type arguments are flattened first.
 *
 * Limitation: types whose names already contain `_` can collide with the
 * separator (`Foo<A_B,C>` and `Foo<A,B_C>` both produce `Foo_A_B_C`). The
 * engine detects this case and surfaces a {@link MonomorphizationWarning}
 * with code `flat-name-collision`.
 */
export function flatNameOf(t: TypeReference): string {
  if (t.typeArguments.length === 0) return t.name;
  return flatNameFromParts(t.name, t.typeArguments);
}

export function flatNameFromParts(name: string, args: readonly TypeReference[]): string {
  if (args.length === 0) return name;
  return `${name}_${args.map(flatNameOf).join("_")}`;
}

/**
 * Canonical (un-flattened) string used solely for collision detection.
 *
 * `canonicalNameOf({ name: "Dict", typeArguments: [TList<Integer>, String] })`
 *   → `"Dict<TList_Integer,String>"`
 *
 * Two structurally distinct usages produce two different canonical strings;
 * if their flat names collide, the engine raises a `flat-name-collision`
 * warning. Note the inner type arguments are taken in their **current**
 * shape (which may already be flat-named when this function is called from
 * the rewriter, since the walker visits children first); that is fine —
 * what matters is that two genuinely different usages observed at distinct
 * sites yield different canonical strings.
 */
export function canonicalNameOf(t: TypeReference): string {
  if (t.typeArguments.length === 0) return t.name;
  return `${t.name}<${t.typeArguments.map(canonicalNameOf).join(",")}>`;
}

// ============================================================================
// Internal context
// ============================================================================

interface MonoContext {
  readonly unit: CompilationUnit;
  readonly templates: TemplateRegistry;
  readonly instantiated: GlobalInstantiatedSet;
  /** Flat names already pushed to the worklist (avoid re-enqueueing). */
  readonly enqueued: Set<string>;
  readonly worklist: PendingInstantiation[];
  /** Flat name → canonical string (collision detection). */
  readonly flatToCanonical: Map<string, string>;
  readonly warnings: MonomorphizationWarning[];
}

interface PendingInstantiation {
  readonly templateName: string;
  /** Concrete type arguments (already flat-named, no `<...>` left). */
  readonly concreteArgs: readonly TypeReference[];
  readonly flatName: string;
}

function warn(
  ctx: MonoContext,
  code: MonomorphizationWarningCode,
  message: string,
  extras: { templateName?: string; flatName?: string } = {},
): void {
  const w: MonomorphizationWarning = { code, message };
  if (extras.templateName !== undefined) {
    Object.assign(w, { templateName: extras.templateName });
  }
  if (extras.flatName !== undefined) {
    Object.assign(w, { flatName: extras.flatName });
  }
  ctx.warnings.push(w);
}

// ============================================================================
// Step 1 — Input validation
// ============================================================================

class InputValidator extends ASTWalker {
  constructor(private readonly ctx: MonoContext) {
    super();
  }

  protected override visitTypeReference(node: TypeReference): void {
    if (node.name.length === 0) {
      warn(this.ctx, "invalid-input", "TypeReference with empty name encountered.");
    }
  }
}

function validate(unit: CompilationUnit, ctx: MonoContext): void {
  new InputValidator(ctx).walk(unit);
}

// ============================================================================
// Step 2 — Template Registration & Pruning
// ============================================================================

/**
 * Traverses every `members[]` array of the unit and its namespaces, and for
 * each top-level declaration that is generic (`typeParameters.length > 0`):
 *   - removes it from the array (in place);
 *   - deep-clones the original node into the registry;
 *   - records the host `members[]` array so the monomorphized clones can
 *     be injected back into the same scope.
 *
 * Non-generic top-level declarations are kept untouched. For non-generic
 * classes, `pruneClassGenericMethods` scans their members and removes any
 * generic method declaration with a `class-generic-method-unsupported`
 * warning (see `Out of scope` in `ast.ts`).
 */
function collectAndPrune(unit: CompilationUnit, ctx: MonoContext): void {
  collectAndPruneIn(unit.members, ctx);
}

function collectAndPruneIn(members: TopLevelMember[], ctx: MonoContext): void {
  for (let i = members.length - 1; i >= 0; i--) {
    const member = members[i];
    if (member === undefined) continue;

    if (member.kind === "NamespaceDeclaration") {
      collectAndPruneIn(member.members, ctx);
      continue;
    }

    if (member.kind === "ClassDeclaration") {
      pruneClassGenericMethods(member, ctx);

      if (member.typeParameters.length > 0) {
        if (member.name.length === 0) {
          warn(ctx, "invalid-input", "Generic class without a name; ignored.");
          members.splice(i, 1);
          continue;
        }
        registerTemplate(member, members, ctx);
        members.splice(i, 1);
      }
      continue;
    }

    if (
      (member.kind === "MethodDeclaration" || member.kind === "DelegateDeclaration") &&
      member.typeParameters.length > 0
    ) {
      if (member.name.length === 0) {
        warn(ctx, "invalid-input", `Generic ${member.kind} without a name; ignored.`);
        members.splice(i, 1);
        continue;
      }
      registerTemplate(member, members, ctx);
      members.splice(i, 1);
    }
  }
}

function pruneClassGenericMethods(klass: ClassDeclaration, ctx: MonoContext): void {
  for (let j = klass.members.length - 1; j >= 0; j--) {
    const cm = klass.members[j];
    if (cm?.kind === "MethodDeclaration" && cm.typeParameters.length > 0) {
      const qualified = `${klass.name}.${cm.name}`;
      warn(
        ctx,
        "class-generic-method-unsupported",
        `Generic method '${qualified}' inside a class is not supported by the current engine; declaration was removed.`,
        { templateName: qualified },
      );
      klass.members.splice(j, 1);
    }
  }
}

function registerTemplate(
  member: ClassDeclaration | MethodDeclaration | DelegateDeclaration,
  host: TopLevelMember[],
  ctx: MonoContext,
): void {
  if (ctx.templates.has(member.name)) {
    warn(
      ctx,
      "duplicate-template",
      `Duplicate generic template '${member.name}'; the previous registration was overridden.`,
      { templateName: member.name },
    );
  }
  // Validate type-parameter names are non-empty.
  for (const tp of member.typeParameters) {
    if (tp.name.length === 0) {
      warn(ctx, "invalid-input", `Type parameter without a name in '${member.name}'.`, {
        templateName: member.name,
      });
    }
  }

  ctx.templates.register({
    name: member.name,
    kind: member.kind,
    typeParameters: member.typeParameters.map(deepClone),
    node: deepClone(member),
    host,
  });
}

// ============================================================================
// Step 3 — Usage Discovery & flat-name rewrite
// ============================================================================

/**
 * Walks `root` looking for generic usage sites and rewrites each one to
 * its flat name **in place**:
 *
 *   `Box<Integer>`              → `Box_Integer`           (TypeReference)
 *   `New Box<Integer>(10)`      → `New Box_Integer(10)`   (ObjectCreationExpression.type)
 *   `ProcessItem<Integer>(10)`  → `ProcessItem_Integer(10)` (MethodInvocation)
 *
 * Each rewritten usage also enqueues a {@link PendingInstantiation} so
 * step 4 can produce the corresponding concrete declaration.
 *
 * Type arguments are processed bottom-up (post-order), so
 * `TList<TList<Integer>>` first rewrites the inner `TList<Integer>` into
 * `TList_Integer` (clearing the inner type-arg list), then the outer site
 * sees the already-flat inner reference and produces
 * `TList_TList_Integer`.
 *
 * Side effect: detects flat-name collisions (two structurally different
 * usages collapsing to the same flat name) and emits a
 * `flat-name-collision` warning when it spots one.
 */
function rewriteGenericUsages(root: Node, ctx: MonoContext): void {
  new GenericUsageRewriter(ctx).walk(root);
}

class GenericUsageRewriter extends ASTWalker {
  constructor(private readonly ctx: MonoContext) {
    super();
  }

  protected override visitTypeReference(node: TypeReference): void {
    if (node.typeArguments.length === 0) return;
    if (!this.ctx.templates.has(node.name)) {
      // Unknown template — leave the usage alone so the downstream compiler
      // can surface an error. The walker has already recursed into
      // typeArguments, so any nested *known* generic was rewritten correctly.
      warn(
        this.ctx,
        "unknown-template",
        `Generic usage references unknown template '${node.name}'; left untouched.`,
        { templateName: node.name },
      );
      return;
    }

    const canonical = canonicalNameOf(node);
    const flat = flatNameOf(node);
    detectCollision(this.ctx, flat, canonical);

    const concreteArgs = node.typeArguments.map(deepClone);
    enqueue(this.ctx, { templateName: node.name, concreteArgs, flatName: flat });

    node.name = flat;
    node.typeArguments = [];
  }

  protected override visitMethodInvocation(node: MethodInvocation): void {
    if (node.typeArguments.length === 0) return;
    if (!this.ctx.templates.has(node.methodName)) {
      warn(
        this.ctx,
        "unknown-template",
        `Generic invocation references unknown template '${node.methodName}'; left untouched.`,
        { templateName: node.methodName },
      );
      return;
    }

    // Build a synthetic TypeReference solely to derive canonical/flat names
    // from the method-name + type-arg pair (keeps the helpers single-source).
    const synthetic: TypeReference = {
      kind: "TypeReference",
      name: node.methodName,
      typeArguments: node.typeArguments,
    };
    const canonical = canonicalNameOf(synthetic);
    const flat = flatNameOf(synthetic);
    detectCollision(this.ctx, flat, canonical);

    const concreteArgs = node.typeArguments.map(deepClone);
    enqueue(this.ctx, {
      templateName: node.methodName,
      concreteArgs,
      flatName: flat,
    });

    node.methodName = flat;
    node.typeArguments = [];
  }

  protected override visitOpaqueStatement(node: OpaqueStatement): void {
    let current = node.text;
    const names = new Set(Array.from(this.ctx.templates.names()).map((n) => n.toLowerCase()));

    for (let iter = 0; iter < 100; iter++) {
      const hit = findInnerMostGenericUsage(current, names);
      if (!hit) break;
      if (!hit.known) break;

      const templateName = Array.from(this.ctx.templates.names()).find(
        (n) => n.toLowerCase() === hit.base.toLowerCase(),
      );
      const template = templateName ? this.ctx.templates.get(templateName) : undefined;
      if (!template) break;

      if (template.typeParameters.length !== hit.typeArgs.length) {
        warn(
          this.ctx,
          "arity-mismatch",
          `Arity mismatch for '${template.name}': expected ${String(template.typeParameters.length)} type arguments, got ${String(hit.typeArgs.length)}.`,
          { templateName: template.name },
        );
        break;
      }

      const concreteArgs = hit.typeArgs.map((arg) => {
        return { kind: "TypeReference" as const, name: arg, typeArguments: [] };
      });

      const flat = flatNameFromParts(template.name, concreteArgs);
      const canonical = `${template.name}<${hit.typeArgs.join(",")}>`;
      detectCollision(this.ctx, flat, canonical);

      enqueue(this.ctx, { templateName: template.name, concreteArgs, flatName: flat });

      current = current.slice(0, hit.start) + flat + current.slice(hit.end);
    }
    node.text = current;
  }
}

function detectCollision(ctx: MonoContext, flat: string, canonical: string): void {
  const existing = ctx.flatToCanonical.get(flat);
  if (existing === undefined) {
    ctx.flatToCanonical.set(flat, canonical);
    return;
  }
  if (existing === canonical) return;
  warn(
    ctx,
    "flat-name-collision",
    `Two distinct generic usages '${existing}' and '${canonical}' both flatten to '${flat}'. Rename a source type containing '_' to disambiguate.`,
    { flatName: flat },
  );
}

function enqueue(ctx: MonoContext, pending: PendingInstantiation): void {
  if (ctx.instantiated.has(pending.flatName)) return;
  if (ctx.enqueued.has(pending.flatName)) return;
  ctx.enqueued.add(pending.flatName);
  ctx.worklist.push(pending);
}

// ============================================================================
// Step 4 — Monomorphization & Injection
// ============================================================================

/**
 * Pops pending instantiations one by one, deep-clones the matching
 * template, substitutes type parameters, drops generics from the resulting
 * declaration, and injects it at the top of the host scope.
 *
 * The newly injected declaration is itself walked by
 * {@link rewriteGenericUsages} so any *new* generic references it surfaces
 * (typical for nested generics, e.g. a `List<T>` whose `head` field is
 * `Node<T>`) are scheduled and produced in turn.
 *
 * Bounded by {@link MAX_INSTANTIATIONS}: if the loop exceeds the cap an
 * `instantiation-limit-exceeded` warning is emitted and the drain stops.
 */
function drainWorklist(ctx: MonoContext): void {
  let processed = 0;

  while (ctx.worklist.length > 0) {
    if (processed >= MAX_INSTANTIATIONS) {
      warn(
        ctx,
        "instantiation-limit-exceeded",
        `Aborted after ${String(MAX_INSTANTIATIONS)} instantiations; remaining ${String(ctx.worklist.length)} entries dropped.`,
      );
      ctx.worklist.length = 0;
      return;
    }

    const pending = ctx.worklist.shift();
    if (pending === undefined) continue;

    if (!ctx.instantiated.register(pending.flatName)) {
      // ODR: already emitted; discard.
      continue;
    }

    const template = ctx.templates.get(pending.templateName);
    if (template === undefined) {
      warn(
        ctx,
        "unknown-template",
        `Cannot instantiate '${pending.flatName}': template '${pending.templateName}' is not registered.`,
        { templateName: pending.templateName, flatName: pending.flatName },
      );
      continue;
    }

    if (template.typeParameters.length !== pending.concreteArgs.length) {
      warn(
        ctx,
        "arity-mismatch",
        `Arity mismatch for '${template.name}': expected ${String(template.typeParameters.length)} type arguments, got ${String(pending.concreteArgs.length)}.`,
        { templateName: template.name, flatName: pending.flatName },
      );
      continue;
    }

    const concrete = instantiateTemplate(
      template,
      pending.concreteArgs,
      pending.flatName,
      ctx.templates,
    );

    // If there is a namespace declaration in the compilation unit,
    // inject the concrete declaration inside that namespace, at the end of it.
    // Otherwise, append it to the end of the compilation unit (below imports).
    const namespaceDecl = ctx.unit.members.find(
      (m): m is NamespaceDeclaration => m.kind === "NamespaceDeclaration",
    );

    if (namespaceDecl) {
      namespaceDecl.members.push(concrete);
    } else {
      ctx.unit.members.push(concrete);
    }

    // The freshly instantiated declaration may itself contain generic
    // usages (nested generics) — re-walk so they get scheduled and
    // rewritten too.
    rewriteGenericUsages(concrete, ctx);

    processed += 1;
  }
}

/**
 * Deep-clones the template, applies the type-parameter substitution to
 * every TypeReference inside the clone, drops the type parameters and
 * constraints, and renames the declaration to the flat name.
 *
 * Constraints (`T As BaseItem`) are intentionally discarded: the concrete
 * declaration carries no `<T>` so there is nothing left to constrain.
 */
function instantiateTemplate(
  template: GenericTemplate,
  concreteArgs: readonly TypeReference[],
  flatName: string,
  templates: { has(name: string): boolean },
): ClassDeclaration | MethodDeclaration | DelegateDeclaration {
  const clone = deepClone(template.node);
  const substitution = new Map<string, TypeReference>();
  for (let i = 0; i < template.typeParameters.length; i++) {
    const param = template.typeParameters[i];
    const arg = concreteArgs[i];
    if (param === undefined || arg === undefined) continue;
    if (param.name.length === 0) continue;
    substitution.set(param.name, arg);
  }

  applySubstitution(clone, substitution, templates);

  clone.name = flatName;
  clone.typeParameters = [];

  return clone;
}

/**
 * In-place substitution. Walks `node` and, for every TypeReference whose
 * `name` matches a key in `substitution` AND whose `typeArguments` is
 * empty (a parameter T is always nullary in this dialect), copies the
 * substitute's `name` and a deep clone of its `typeArguments` over the
 * existing node.
 *
 * Substitutes that contain nested type references (e.g. `T → List<X>`) are
 * deep-cloned so subsequent substitutions on different occurrences of `T`
 * do not share aliased subtrees.
 */
function applySubstitution(
  node: Node,
  substitution: ReadonlyMap<string, TypeReference>,
  templates: { has(name: string): boolean },
): void {
  new SubstitutionWalker(substitution, templates).walk(node);
}

class SubstitutionWalker extends ASTWalker {
  constructor(
    private readonly substitution: ReadonlyMap<string, TypeReference>,
    private readonly templates: { has(name: string): boolean },
  ) {
    super();
  }

  protected override visitTypeReference(node: TypeReference): void {
    if (node.typeArguments.length !== 0) return;
    const replacement = this.substitution.get(node.name);
    if (replacement === undefined) return;
    node.name = replacement.name;
    node.typeArguments = replacement.typeArguments.map(deepClone);
  }

  protected override visitOpaqueStatement(node: OpaqueStatement): void {
    const subsStr = new Map<string, string>();
    for (const [k, v] of this.substitution.entries()) {
      subsStr.set(k, flatNameOf(v));
    }
    node.text = substituteTypeParamsInLine(node.text, subsStr, this.templates);
  }
}
