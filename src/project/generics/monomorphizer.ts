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
  type Statement,
  type TopLevelMember,
  type TypeReference,
  type Expression,
} from "../ast/ast";
import { deepClone } from "../ast/clone";
import { type GenericTemplate, GlobalInstantiatedSet, TemplateRegistry } from "./registry";
import type { MonomorphizationWarning, MonomorphizationWarningCode } from "./warnings";
import { substituteTypeParamsInLine } from "./substitute";
import { findInnerMostGenericUsage } from "../../analysis/generics-analyzer";
import { parseBasic, GenericsParserPlugin } from "../parser";
import { SugarRegistry } from "../sugar-registry";
import { SugarEngine } from "../sugars";

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

export interface MonomorphizerOptions {
  readonly isTypeDescendantOf?: (typeName: string, baseTypeName: string) => boolean | undefined;
  readonly externalTemplates?: readonly ExternalGenericTemplate[];
  readonly requestedInstantiations?: readonly RequestedGenericInstantiation[];
}

export interface ExternalGenericTemplate {
  readonly name: string;
  readonly typeParams: readonly string[];
}

export interface RequestedGenericInstantiation {
  readonly templateName: string;
  readonly typeArgs: readonly string[];
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
  constructor(private readonly options: MonomorphizerOptions = {}) {}

  monomorphize(unit: CompilationUnit): MonomorphizationResult {
    const ctx: MonoContext = {
      unit,
      templates: new TemplateRegistry(),
      instantiated: new GlobalInstantiatedSet(),
      enqueued: new Set<string>(),
      worklist: [],
      flatToCanonical: new Map<string, string>(),
      warnings: [],
      options: this.options,
      externalTemplates: buildExternalTemplateMap(this.options.externalTemplates ?? []),
      requestableTemplateNames: new Set<string>(),
    };

    // Pre-populate templates from sugar utility modules.
    for (const utility of SugarRegistry.getUtilityModules()) {
      const virtualCode = utility.generateCode();
      const sugarEngine = new SugarEngine();
      const plugins = [...sugarEngine.createParserPlugins(), new GenericsParserPlugin()];
      const parsed = parseBasic(virtualCode, { plugins });
      collectAndPruneIn(parsed.unit.members, ctx, false);
    }

    // Step 1.
    validate(unit, ctx);

    // Step 2.
    collectAndPrune(unit, ctx);

    // Step 3.
    rewriteGenericUsages(unit, ctx);
    enqueueRequestedInstantiations(ctx);

    // Step 4.
    drainWorklist(ctx);
    stripMetaDirectiveMembers(unit.members);

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
  readonly options: MonomorphizerOptions;
  readonly externalTemplates: ReadonlyMap<string, ExternalGenericTemplate>;
  readonly requestableTemplateNames: Set<string>;
}

interface PendingInstantiation {
  readonly templateName: string;
  /** Concrete type arguments (already flat-named, no `<...>` left). */
  readonly concreteArgs: readonly TypeReference[];
  readonly flatName: string;
}

interface KnownTemplate {
  readonly name: string;
  readonly typeParamCount: number;
  readonly internal: boolean;
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
  collectAndPruneIn(unit.members, ctx, true);
}

function collectAndPruneIn(
  members: TopLevelMember[],
  ctx: MonoContext,
  requestable: boolean,
): void {
  for (let i = members.length - 1; i >= 0; i--) {
    const member = members[i];
    if (member === undefined) continue;

    if (member.kind === "NamespaceDeclaration") {
      collectAndPruneIn(member.members, ctx, requestable);
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
        registerTemplate(member, members, ctx, requestable);
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
      registerTemplate(member, members, ctx, requestable);
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
  requestable: boolean,
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
  if (requestable) {
    ctx.requestableTemplateNames.add(member.name.toLowerCase());
  }
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
    const template = getKnownTemplate(this.ctx, node.name);
    if (!template) {
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
    if (template.typeParamCount !== node.typeArguments.length) {
      warn(
        this.ctx,
        "arity-mismatch",
        `Arity mismatch for '${template.name}': expected ${String(template.typeParamCount)} type arguments, got ${String(node.typeArguments.length)}.`,
        { templateName: template.name },
      );
      return;
    }

    const canonical = canonicalNameOf(node);
    const flat = flatNameOf(node);
    detectCollision(this.ctx, flat, canonical);

    const concreteArgs = node.typeArguments.map(deepClone);
    if (template.internal) {
      enqueue(this.ctx, { templateName: template.name, concreteArgs, flatName: flat });
    }

    node.name = flat;
    node.typeArguments = [];
  }

  protected override visitMethodInvocation(node: MethodInvocation): void {
    if (node.typeArguments.length === 0) return;
    const template = getKnownTemplate(this.ctx, node.methodName);
    if (!template) {
      warn(
        this.ctx,
        "unknown-template",
        `Generic invocation references unknown template '${node.methodName}'; left untouched.`,
        { templateName: node.methodName },
      );
      return;
    }
    if (template.typeParamCount !== node.typeArguments.length) {
      warn(
        this.ctx,
        "arity-mismatch",
        `Arity mismatch for '${template.name}': expected ${String(template.typeParamCount)} type arguments, got ${String(node.typeArguments.length)}.`,
        { templateName: template.name },
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
    if (template.internal) {
      enqueue(this.ctx, {
        templateName: template.name,
        concreteArgs,
        flatName: flat,
      });
    }

    node.methodName = flat;
    node.typeArguments = [];
  }

  protected override visitOpaqueStatement(node: OpaqueStatement): void {
    let current = node.text;
    const names = new Set([
      ...Array.from(this.ctx.templates.names()).map((n) => n.toLowerCase()),
      ...Array.from(this.ctx.externalTemplates.keys()),
    ]);

    for (let iter = 0; iter < 100; iter++) {
      const hit = findInnerMostGenericUsage(current, names);
      if (!hit) break;
      if (!hit.known) break;

      const template = getKnownTemplate(this.ctx, hit.base);
      if (!template) break;

      if (template.typeParamCount !== hit.typeArgs.length) {
        warn(
          this.ctx,
          "arity-mismatch",
          `Arity mismatch for '${template.name}': expected ${String(template.typeParamCount)} type arguments, got ${String(hit.typeArgs.length)}.`,
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

      if (template.internal) {
        enqueue(this.ctx, { templateName: template.name, concreteArgs, flatName: flat });
      }

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

function buildExternalTemplateMap(
  templates: readonly ExternalGenericTemplate[],
): ReadonlyMap<string, ExternalGenericTemplate> {
  const result = new Map<string, ExternalGenericTemplate>();
  for (const template of templates) {
    if (!template.name || template.typeParams.length === 0) continue;
    result.set(template.name.toLowerCase(), template);
  }
  return result;
}

function getKnownTemplate(ctx: MonoContext, name: string): KnownTemplate | undefined {
  const internal = ctx.templates.get(name);
  if (internal) {
    return {
      name: internal.name,
      typeParamCount: internal.typeParameters.length,
      internal: true,
    };
  }
  const external = ctx.externalTemplates.get(name.toLowerCase());
  if (external) {
    return {
      name: external.name,
      typeParamCount: external.typeParams.length,
      internal: false,
    };
  }
  return undefined;
}

function enqueueRequestedInstantiations(ctx: MonoContext): void {
  for (const request of ctx.options.requestedInstantiations ?? []) {
    const template = ctx.templates.get(request.templateName);
    if (!template) continue;
    if (!ctx.requestableTemplateNames.has(template.name.toLowerCase())) continue;
    if (hasOpenTemplateTypeArgument(template, request.typeArgs)) continue;
    if (template.typeParameters.length !== request.typeArgs.length) {
      warn(
        ctx,
        "arity-mismatch",
        `Arity mismatch for '${template.name}': expected ${String(template.typeParameters.length)} type arguments, got ${String(request.typeArgs.length)}.`,
        { templateName: template.name },
      );
      continue;
    }
    const concreteArgs = request.typeArgs.map((arg) => ({
      kind: "TypeReference" as const,
      name: arg,
      typeArguments: [],
    }));
    const flatName = flatNameFromParts(template.name, concreteArgs);
    enqueue(ctx, { templateName: template.name, concreteArgs, flatName });
  }
}

function hasOpenTemplateTypeArgument(
  template: GenericTemplate,
  typeArgs: readonly string[],
): boolean {
  const openParams = new Set(template.typeParameters.map((tp) => tp.name.toLowerCase()));
  return typeArgs.some((typeArg) => openParams.has(typeArg.toLowerCase()));
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
      ctx,
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
  ctx: MonoContext,
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

  applySubstitution(clone, substitution, ctx.templates);
  evaluateMetaProgramming(clone, substitution, ctx);

  clone.name = flatName;
  clone.typeParameters = [];


  return clone;
}

function typeRefToSource(typeRef: TypeReference): string {
  if (typeRef.typeArguments.length === 0) return typeRef.name;
  return `${typeRef.name}<${typeRef.typeArguments.map(typeRefToSource).join(", ")}>`;
}

function evaluateMetaProgramming(
  node: ClassDeclaration | MethodDeclaration | DelegateDeclaration,
  substitution: ReadonlyMap<string, TypeReference>,
  ctx: MonoContext,
): void {
  if (node.kind === "ClassDeclaration") {
    for (const member of node.members) {
      if (member.kind === "MethodDeclaration") {
        member.body = filterMetaStatements(member.body, substitution, ctx);
      } else if (member.kind === "PropertyDeclaration") {
        if (member.getter) {
          member.getter.body = filterMetaStatements(member.getter.body, substitution, ctx);
        }
        if (member.setter) {
          member.setter.body = filterMetaStatements(member.setter.body, substitution, ctx);
        }
      }
    }
    return;
  }
  if (node.kind === "MethodDeclaration") {
    node.body = filterMetaStatements(node.body, substitution, ctx);
  }
}

interface MetaFrame {
  readonly parentActive: boolean;
  conditionActive: boolean;
}

function filterMetaStatements(
  statements: Statement[],
  substitution: ReadonlyMap<string, TypeReference>,
  ctx: MonoContext,
): Statement[] {
  const filtered: Statement[] = [];
  const stack: MetaFrame[] = [];

  const isActive = (): boolean => stack.every((frame) => frame.parentActive && frame.conditionActive);

  for (const statement of statements) {
    if (statement.kind === "OpaqueStatement") {
      const directive = parseMetaDirective(statement.text);
      if (directive) {
        if (directive.kind === "if") {
          const parentActive = isActive();
          stack.push({
            parentActive,
            conditionActive:
              parentActive && evaluateMetaCondition(directive.condition, substitution, ctx),
          });
        } else if (directive.kind === "else") {
          const current = stack[stack.length - 1];
          if (current) {
            current.conditionActive = current.parentActive && !current.conditionActive;
          }
        } else {
          stack.pop();
        }
        continue;
      }
    }

    if (isActive()) filtered.push(statement);
  }

  return filtered;
}

type MetaDirective =
  | { readonly kind: "if"; readonly condition: string }
  | { readonly kind: "else" }
  | { readonly kind: "end" };

function parseMetaDirective(text: string): MetaDirective | undefined {
  const trimmed = text.trim();
  const ifMatch = /^<#\s*if\s+(.+?)\s+then\s*#>$/i.exec(trimmed);
  if (ifMatch?.[1]) return { kind: "if", condition: ifMatch[1] };
  if (/^<#\s*else\s*#>$/i.test(trimmed)) return { kind: "else" };
  if (/^<#\s*end\s+if\s*#>$/i.test(trimmed)) return { kind: "end" };
  return undefined;
}

function evaluateMetaCondition(
  condition: string,
  substitution: ReadonlyMap<string, TypeReference>,
  ctx: MonoContext,
): boolean {
  let source = condition.trim();
  let negate = false;
  if (/^not\b/i.test(source)) {
    negate = true;
    source = source.replace(/^not\b/i, "").trim();
  }

  const call = /^TypeSystem\.InheritsFrom\(\s*<?([A-Za-z_]\w*)>?\s*,\s*"([^"]+)"\s*\)$/i.exec(
    source,
  );
  if (!call) return !negate;

  const paramName = call[1];
  const baseTypeName = call[2];
  if (!paramName || !baseTypeName) return !negate;

  const typeRef = substitution.get(paramName);
  if (!typeRef) return !negate;

  const typeName = typeRefToSource(typeRef);
  const result = ctx.options.isTypeDescendantOf?.(typeName, baseTypeName);
  const value = result ?? false;
  return negate ? !value : value;
}

function stripMetaDirectiveMembers(members: TopLevelMember[]): void {
  for (let i = members.length - 1; i >= 0; i--) {
    const member = members[i];
    if (!member) continue;
    if (member.kind === "NamespaceDeclaration") {
      stripMetaDirectiveMembers(member.members);
      continue;
    }
    if (member.kind === "OpaqueStatement" && parseMetaDirective(member.text)) {
      members.splice(i, 1);
    }
  }
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

  override walk(node: Node): void {
    if (node.kind === "Identifier") {
      const replacement = this.substitution.get(node.name);
      if (replacement !== undefined) {
        node.name = replacement.name;
      }
    }
    super.walk(node);
  }

  protected override visitTypeReference(node: TypeReference): void {
    if (node.typeArguments.length !== 0) return;
    const replacement = this.substitution.get(node.name);
    if (replacement === undefined) return;
    node.name = replacement.name;
    node.typeArguments = replacement.typeArguments.map(deepClone);
  }

  protected override visitMethodInvocation(node: MethodInvocation): void {
    if (node.methodName.toLowerCase() === "ctype" && node.arguments.length === 2) {
      const typeArg = node.arguments[1];
      if (typeArg) {
        if (typeArg.kind === "Identifier") {
          const replacement = this.substitution.get(typeArg.name);
          if (replacement !== undefined) {
            typeArg.name = replacement.name;
          }
        } else if (typeArg.kind === "BinaryExpression") {
          const rawExprStr = this.stringifyExpression(typeArg);
          if (rawExprStr.includes("<") || rawExprStr.includes(">")) {
            const substitutedStr = this.substituteParamsInString(rawExprStr);
            const flatName = this.flattenGenericString(substitutedStr);
            if (flatName) {
              node.arguments[1] = {
                kind: "Identifier",
                name: flatName,
                loc: typeArg.loc,
              };
            }
          }
        }
      }
    }
    super.visitMethodInvocation(node);
  }

  private stringifyExpression(expr: Expression): string {
    if (expr.kind === "Identifier") return expr.name;
    if (expr.kind === "BinaryExpression") {
      const leftStr = this.stringifyExpression(expr.left);
      const rightStr = expr.right ? this.stringifyExpression(expr.right) : "";
      return leftStr + expr.operator + rightStr;
    }
    return "";
  }

  private substituteParamsInString(str: string): string {
    let result = str;
    for (const [k, v] of this.substitution.entries()) {
      const flatName = flatNameOf(v);
      const regex = new RegExp(`\\b${k}\\b`, "g");
      result = result.replace(regex, flatName);
    }
    return result;
  }

  private flattenGenericString(str: string): string {
    return str.replace(/<|>/g, (m) => (m === "<" ? "_" : "")).replace(/,/g, "_");
  }

  protected override visitOpaqueStatement(node: OpaqueStatement): void {
    const subsStr = new Map<string, string>();
    for (const [k, v] of this.substitution.entries()) {
      subsStr.set(k, flatNameOf(v));
    }
    node.text = substituteTypeParamsInLine(node.text, subsStr, this.templates);
  }
}
