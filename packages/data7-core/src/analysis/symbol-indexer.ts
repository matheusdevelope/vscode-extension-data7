import * as path from "path";
import * as vscode from "../platform/vscode-api";
import { logger } from "../infra/logger";
import { isExcluded, readConfiguration } from "../infra/configuration";
import {
  collectGenericsContext,
  type GenericTemplateInfo,
  type GenericUsageOccurrence,
} from "./generics-analyzer";
import { SugarRegistry } from "../project/sugar-registry";
import { expandEnumDeclaration } from "../project/sugars/plugins/enum/transformer";
import {
  ASTWalker,
  type ClassDeclaration,
  type CompilationUnit,
  type TypeReference,
  type Node,
  type ParameterDeclaration,
} from "../project/ast/ast";
import { WorkspaceDependencyGraph } from "./workspace-dependency-graph";
import { MemberCache } from "./member-cache";
import { SemanticLintCache } from "./semantic-lint-cache";
import { DeclarationLintCache } from "./declaration-lint-cache";
import { clearLintTypeResolutionCachesForUnit } from "./lint-type-resolution-cache";
import { LanguageProcessor } from "./language-processor";
import { AnalysisCache } from "./analysis-cache";
import { getAnalysisHost } from "./analysis-host";
import { hashContent } from "../utils/content-hash";
import { PRIMITIVE_TYPES } from "../utils/primitive-types";

// Parameter info
export interface ParameterInfo {
  name: string;
  type: string;
  isByRef: boolean;
  isOptional: boolean;
  defaultValue?: string;
}

// Symbol info
export interface SymbolInfo {
  name: string;
  /**
   * `indexed-property` é a forma Delphi de uma propriedade que aceita
   * argumentos (ex.: `Grid.Cells(ACol, ARow)` ou `Grid.ColWidth(ACol)`). É
   * tratada como property pelo resolvedor (sem invocação de método obrigatória)
   * mas o hover/SignatureHelp mostram a lista de parâmetros.
   */
  kind:
    | "namespace"
    | "class"
    | "structure"
    | "delegate"
    | "enum"
    | "enum-member"
    | "method"
    | "property"
    | "indexed-property"
    | "variable"
    | "declare_sub"
    | "declare_function";
  type: string;
  isShared: boolean;
  isPrivate: boolean;
  isProtected?: boolean;
  isConst?: boolean;
  isReadOnly?: boolean;
  isMustOverride?: boolean;
  isOverridable?: boolean;
  /** When true, arity matching accepts any argument count >= required parameters (e.g. VB `Array`). */
  variadicParameters?: boolean;
  isMustInherit?: boolean;
  isNotInheritable?: boolean;
  isShadows?: boolean;
  parameters?: ParameterInfo[];
  nativeArrayRank?: number;
  noParentheses?: boolean;
  /**
   * Overloads adicionais do mesmo método/property indexada — quando preenchido,
   * `parameters` representa a assinatura primária (a primeira mostrada) e
   * `overloads` lista as alternativas. O SignatureHelpProvider exibe todas e
   * destaca a que corresponde ao número de argumentos no call site.
   */
  overloads?: ParameterInfo[][];
  genericTypeParameters?: string[];
  isSyntheticGenericInstantiation?: boolean;
  range: {
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
  };
  fileUri: string;
  containerName?: string; // e.g. NamespaceName or ClassName
  description?: string;
  inheritsFrom?: string;
  /**
   * Marca membros que aparecem no autocomplete da linguagem original mas que o
   * compilador Data7 não traduz. Usados pelo linter para emitir o diagnóstico
   * `unsupported-member` (ver `src/diagnostic-codes.ts`) e pelos providers de
   * completion/hover para exibirem o item como deprecated.
   */
  isUnsupported?: boolean;
  isGenericParam?: boolean;
  constraintName?: string;
}

export interface FileSymbols {
  fileUri: string;
  filePath: string;
  content: string;
  imports: string[];
  symbols: SymbolInfo[];
}

/** Immutable snapshot of indexed workspace symbols for parallel lint workers. */
export interface WorkspaceSymbolIndexSnapshot {
  readonly entries: readonly FileSymbols[];
  readonly fileRevisions: ReadonlyMap<string, number>;
}

function typeRefToString(typeRef: TypeReference | undefined): string | undefined {
  if (!typeRef?.name) return undefined;
  if (typeRef.typeArguments.length === 0) return typeRef.name;
  return `${typeRef.name}<${typeRef.typeArguments
    .map((arg) => typeRefToString(arg) ?? "")
    .join(", ")}>`;
}

function parameterInfoFromDeclaration(p: ParameterDeclaration): ParameterInfo {
  const defaultValue = p.defaultValue ? "" : undefined;
  return {
    name: p.name,
    type: typeRefToString(p.type) ?? "Variant",
    isByRef: resolveParameterIsByRef(p),
    isOptional: p.defaultValue !== undefined,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
  };
}

class SymbolIndexerWalker extends ASTWalker {
  public readonly symbols: SymbolInfo[] = [];
  private activeNamespace: string | undefined;
  private activeClass: string | undefined;

  constructor(
    private readonly fileUri: string,
    private readonly lines: readonly string[],
  ) {
    super();
  }

  public run(unit: CompilationUnit): void {
    this.walk(unit);
  }

  override walk(node: Node): void {
    if (node.kind === "NamespaceDeclaration") {
      const prevNamespace = this.activeNamespace;
      this.activeNamespace = node.name;

      const loc = node.loc ?? { startLine: 1, startChar: 0, endLine: 1, endChar: 0 };
      const nsSymbol: SymbolInfo = {
        name: node.name,
        kind: "namespace",
        type: "Namespace",
        isShared: true,
        isPrivate: false,
        range: {
          startLine: loc.startLine - 1,
          startChar: loc.startChar,
          endLine: loc.endLine - 1,
          endChar: loc.endChar,
        },
        fileUri: this.fileUri,
        description: node.comment?.trim() ?? `Namespace ${node.name}`,
      };
      this.symbols.push(nsSymbol);

      super.walk(node);
      this.activeNamespace = prevNamespace;
      return;
    }

    if (node.kind === "ClassDeclaration") {
      const prevClass = this.activeClass;
      this.activeClass = node.name;

      const isStructure = node.modifiers?.includes("structure") ?? false;
      const isPrivate = node.modifiers?.includes("private") ?? false;
      const isProtected = node.modifiers?.includes("protected") ?? false;
      const isShared = node.modifiers?.includes("shared") ?? false;
      const isMustInherit = node.modifiers?.includes("mustinherit") ?? false;
      const isNotInheritable = node.modifiers?.includes("notinheritable") ?? false;

      const loc = node.loc ?? { startLine: 1, startChar: 0, endLine: 1, endChar: 0 };
      const classSymbol: SymbolInfo = {
        name: node.name,
        kind: isStructure ? "structure" : "class",
        type: node.name,
        isShared,
        isPrivate,
        isProtected,
        isMustInherit,
        isNotInheritable,
        range: {
          startLine: loc.startLine - 1,
          startChar: loc.startChar,
          endLine: loc.endLine - 1,
          endChar: loc.endChar,
        },
        fileUri: this.fileUri,
        containerName: prevClass ?? this.activeNamespace,
        description: node.comment?.trim() ?? undefined,
      };
      if (node.typeParameters.length > 0) {
        classSymbol.genericTypeParameters = node.typeParameters.map((tp) => tp.name);
      }
      if (node.baseType) {
        classSymbol.inheritsFrom = typeRefToString(node.baseType);
      }
      this.symbols.push(classSymbol);

      super.walk(node);
      this.activeClass = prevClass;
      return;
    }

    if (node.kind === "MethodDeclaration") {
      const isPrivate = node.modifiers?.includes("private") ?? false;
      const isProtected = node.modifiers?.includes("protected") ?? false;
      const isShared =
        (node.modifiers?.includes("shared") ?? false) ||
        (!this.activeClass && !!this.activeNamespace);

      const loc = node.loc ?? { startLine: 1, startChar: 0, endLine: 1, endChar: 0 };
      const params = node.parameters.map(parameterInfoFromDeclaration);

      const isDeclare = node.modifiers?.includes("declare") ?? false;
      const methodSymbol: SymbolInfo = {
        name: node.name,
        kind: isDeclare ? (node.returnType ? "declare_function" : "declare_sub") : "method",
        type: node.returnType ? (typeRefToString(node.returnType) ?? "Variant") : "Void",
        isShared,
        isPrivate,
        isProtected,
        isMustOverride: node.modifiers?.includes("mustoverride") ?? false,
        isOverridable:
          (node.modifiers?.includes("overridable") ?? false) ||
          (node.modifiers?.includes("overrides") ?? false),
        isShadows: node.modifiers?.includes("shadows") ?? false,
        parameters: params,
        range: {
          startLine: loc.startLine - 1,
          startChar: loc.startChar,
          endLine: loc.endLine - 1,
          endChar: loc.endChar,
        },
        fileUri: this.fileUri,
        containerName: this.activeClass ?? this.activeNamespace,
        description: node.comment?.trim() ?? undefined,
        noParentheses: node.noParentheses,
      };
      if (node.typeParameters.length > 0) {
        methodSymbol.genericTypeParameters = node.typeParameters.map((tp) => tp.name);
      }
      this.symbols.push(methodSymbol);
      return;
    }

    if (node.kind === "DelegateDeclaration") {
      const isPrivate = node.modifiers?.includes("private") ?? false;
      const isProtected = node.modifiers?.includes("protected") ?? false;
      const isShared = node.modifiers?.includes("shared") ?? false;

      const loc = node.loc ?? { startLine: 1, startChar: 0, endLine: 1, endChar: 0 };
      const params = node.parameters.map(parameterInfoFromDeclaration);

      const delegateSymbol: SymbolInfo = {
        name: node.name,
        kind: "delegate",
        type: node.returnType ? (typeRefToString(node.returnType) ?? "Variant") : "Void",
        isShared,
        isPrivate,
        isProtected,
        parameters: params,
        range: {
          startLine: loc.startLine - 1,
          startChar: loc.startChar,
          endLine: loc.endLine - 1,
          endChar: loc.endChar,
        },
        fileUri: this.fileUri,
        containerName: this.activeClass ?? this.activeNamespace,
        description: node.comment?.trim() ?? undefined,
        noParentheses: node.noParentheses,
      };
      if (node.typeParameters.length > 0) {
        delegateSymbol.genericTypeParameters = node.typeParameters.map((tp) => tp.name);
      }
      this.symbols.push(delegateSymbol);
      return;
    }

    if (node.kind === "PropertyDeclaration") {
      const isPrivate = node.modifiers?.includes("private") ?? false;
      const isProtected = node.modifiers?.includes("protected") ?? false;
      const isShared = node.modifiers?.includes("shared") ?? false;

      const loc = node.loc ?? { startLine: 1, startChar: 0, endLine: 1, endChar: 0 };
      const params = node.parameters ?? node.getter?.parameters ?? node.setter?.parameters;
      const parsedParams =
        params && params.length > 0 ? params.map(parameterInfoFromDeclaration) : undefined;

      const propSymbol: SymbolInfo = {
        name: node.name,
        kind: parsedParams ? "indexed-property" : "property",
        type: typeRefToString(node.type) ?? "Variant",
        isShared,
        isPrivate,
        isProtected,
        isMustOverride: node.modifiers?.includes("mustoverride") ?? false,
        isOverridable:
          (node.modifiers?.includes("overridable") ?? false) ||
          (node.modifiers?.includes("overrides") ?? false),
        isShadows: node.modifiers?.includes("shadows") ?? false,
        range: {
          startLine: loc.startLine - 1,
          startChar: loc.startChar,
          endLine: loc.endLine - 1,
          endChar: loc.endChar,
        },
        fileUri: this.fileUri,
        containerName: this.activeClass ?? this.activeNamespace,
        description: node.comment?.trim() ?? undefined,
      };
      if (parsedParams) {
        propSymbol.parameters = parsedParams;
      }
      this.symbols.push(propSymbol);
      return;
    }

    if (node.kind === "FieldDeclaration") {
      const isPrivate = node.modifiers?.includes("private") ?? false;
      const isProtected = node.modifiers?.includes("protected") ?? false;
      const isShared = node.modifiers?.includes("shared") ?? false;

      const loc = node.loc ?? { startLine: 1, startChar: 0, endLine: 1, endChar: 0 };
      const varSymbol: SymbolInfo = {
        name: node.name,
        kind: "variable",
        type: typeRefToString(node.type) ?? "Variant",
        isShared,
        isPrivate,
        isProtected,
        range: {
          startLine: loc.startLine - 1,
          startChar: loc.startChar,
          endLine: loc.endLine - 1,
          endChar: loc.endChar,
        },
        fileUri: this.fileUri,
        containerName: this.activeClass ?? this.activeNamespace,
        description: node.comment?.trim() ?? undefined,
      };
      if (node.nativeArrayDimensions !== undefined) {
        varSymbol.nativeArrayRank = node.nativeArrayDimensions.length;
      }
      this.symbols.push(varSymbol);
      return;
    }

    if (node.kind === "EnumDeclaration") {
      // Sugar Enun materializes as Class Inherits TEnum — index the expanded
      // surface so Load/GetOptions/factories and inherited TEnum members
      // (AsString, IsValue, …) resolve during analysis without expanding the
      // lint AST (which must stay lossless for disabled-sugar / source maps).
      if (node.isSugar) {
        // expandEnumDeclaration returns Statement for the transformer API, but
        // the runtime node is always a ClassDeclaration.
        const expanded = expandEnumDeclaration(node) as unknown as ClassDeclaration;
        // Qualify the base as mod_tenum.TEnum so a homonymous workspace
        // `mod_enum.TEnum` (legacy, different API) cannot win when the Enun
        // file omitted `Imports mod_tenum`. Transpile still emits simple
        // `Inherits TEnum` + injects the import.
        this.walk({
          ...expanded,
          baseType: {
            kind: "TypeReference",
            name: "mod_tenum.TEnum",
            typeArguments: [],
            loc: expanded.baseType?.loc ?? node.loc,
          },
        });
        return;
      }

      const isPrivate = node.modifiers?.includes("private") ?? false;
      const isProtected = node.modifiers?.includes("protected") ?? false;
      const isShared = node.modifiers?.includes("shared") ?? false;

      const loc = node.loc ?? { startLine: 1, startChar: 0, endLine: 1, endChar: 0 };
      const enumSymbol: SymbolInfo = {
        name: node.name,
        kind: "enum",
        type: node.name,
        isShared,
        isPrivate,
        isProtected,
        range: {
          startLine: loc.startLine - 1,
          startChar: loc.startChar,
          endLine: loc.endLine - 1,
          endChar: loc.endChar,
        },
        fileUri: this.fileUri,
        containerName: this.activeNamespace,
        description: node.comment?.trim() ?? undefined,
      };
      this.symbols.push(enumSymbol);

      for (const entry of node.entries) {
        const entryLoc = entry.loc ?? loc;
        this.symbols.push({
          name: entry.name,
          kind: "enum-member",
          type: node.name,
          isShared: true,
          isPrivate: false,
          isConst: true,
          range: {
            startLine: entryLoc.startLine - 1,
            startChar: entryLoc.startChar,
            endLine: entryLoc.endLine - 1,
            endChar: entryLoc.endChar,
          },
          fileUri: this.fileUri,
          containerName: node.name,
          description: `Enum member \`${node.name}.${entry.name}\``,
        });
      }
      return;
    }

    if (node.kind === "VariableDeclaration") {
      if (!this.activeClass) {
        const loc = node.loc ?? { startLine: 1, startChar: 0, endLine: 1, endChar: 0 };
        const varSymbol: SymbolInfo = {
          name: node.name,
          kind: "variable",
          type: typeRefToString(node.type) ?? "Variant",
          isShared: true,
          isPrivate: false,
          isConst: node.isConst,
          range: {
            startLine: loc.startLine - 1,
            startChar: loc.startChar,
            endLine: loc.endLine - 1,
            endChar: loc.endChar,
          },
          fileUri: this.fileUri,
          containerName: this.activeNamespace,
          description: node.comment?.trim() ?? undefined,
        };
        if (node.nativeArrayDimensions !== undefined) {
          varSymbol.nativeArrayRank = node.nativeArrayDimensions.length;
        }
        this.symbols.push(varSymbol);
      }
      return;
    }

    super.walk(node);
  }
}

export class SymbolParser {
  public static parseBasFile(fileUri: string, content: string): FileSymbols {
    // Share the LanguageProcessor parse path (sugars/generics plugins + token cache)
    // so cold indexing stays aligned with live IDE analysis.
    const cached = LanguageProcessor.getInstance().getOrParse(fileUri, content);
    return SymbolParser.parseFromAst(fileUri, content, cached.unit);
  }

  public static parseFromAst(fileUri: string, content: string, unit: CompilationUnit): FileSymbols {
    const lines = content.split(/\r?\n/);
    const fileSymbols: FileSymbols = {
      fileUri,
      filePath: vscode.Uri.parse(fileUri).fsPath,
      content,
      imports: [],
      symbols: [],
    };

    try {
      // Extract imports from top-level ImportsDeclarations
      for (const member of unit.members) {
        if (member.kind === "ImportsDeclaration") {
          fileSymbols.imports.push(member.target);
        }
      }

      const walker = new SymbolIndexerWalker(fileUri, lines);
      walker.run(unit);
      fileSymbols.symbols = walker.symbols;
    } catch (err: unknown) {
      logger.error(`SymbolParser: AST walk failed for ${fileUri}.`, err);
    }

    return fileSymbols;
  }
}

/**
 * Delta accumulated for one file between lint cycles. `apiChanged` drives
 * whether dependents must be re-linted; `changedNamespaces` carries namespace
 * additions/removals so renames still reach the files that imported the old
 * name.
 */
export interface FileChangeSet {
  readonly fileUri: string;
  readonly apiChanged: boolean;
  readonly changedNamespaces: ReadonlySet<string>;
  /** Indexer revision of the file at the moment the set was read. */
  readonly revision: number;
}

interface MutableFileChangeSet {
  apiChanged: boolean;
  readonly changedNamespaces: Set<string>;
}

/** Lowercase namespace names declared by a parsed file. */
function namespaceNamesOf(parsed: FileSymbols | undefined): readonly string[] {
  if (!parsed) return [];
  const names: string[] = [];
  for (const sym of parsed.symbols) {
    if (sym.kind === "namespace") {
      names.push(sym.name.toLowerCase());
    }
  }
  return names;
}

/**
 * Identifies the generic templates a file declares. Two files with the same
 * signature expand identically, so the workspace-wide expansion revision only
 * moves when a template is added, removed, or has its type parameters changed.
 */
function localGenericTemplateSignature(symbols: readonly SymbolInfo[]): string {
  const parts: string[] = [];
  for (const sym of symbols) {
    if (sym.kind !== "class" && sym.kind !== "delegate" && sym.kind !== "method") continue;
    if (!sym.genericTypeParameters || sym.genericTypeParameters.length === 0) continue;
    parts.push(`${sym.kind}:${sym.name}<${sym.genericTypeParameters.join(",")}>`);
  }
  return parts.sort().join("|");
}

function namespaceSetsDiffer(previous: Iterable<string>, next: ReadonlySet<string>): boolean {
  let previousSize = 0;
  for (const name of previous) {
    previousSize += 1;
    if (!next.has(name)) return true;
  }
  return previousSize !== next.size;
}

export class WorkspaceSymbolIndexer {
  private static hostInstance: WorkspaceSymbolIndexer | undefined;
  private static detachedScopeCounter = 0;
  private cache = new Map<string, FileSymbols>(); // fileUri -> FileSymbols
  public readonly lintCacheScope: string;

  private allSymbolsCache: SymbolInfo[] | null = null;
  private allFileSymbolsCache: FileSymbols[] | null = null;
  private symbolsByNameMap: Map<string, SymbolInfo[]> | null = null;
  private symbolsByContainerMap: Map<string, SymbolInfo[]> | null = null;

  public readonly findMemberCache = new MemberCache<SymbolInfo | undefined>();
  public readonly allMembersForTypeCache = new MemberCache<SymbolInfo[]>();
  public readonly ownMembersForClassCache = new MemberCache<SymbolInfo[]>();
  public readonly inheritedMembersForClassCache = new MemberCache<SymbolInfo[]>();
  private readonly dependencyGraph = new WorkspaceDependencyGraph();
  private readonly fileRevisions = new Map<string, number>();
  private readonly lastUpdateApiChanged = new Map<string, boolean>();
  private principalFileKeysCache: readonly string[] | undefined;
  /** Deltas accumulated per file since the last time propagation consumed them. */
  private readonly pendingChanges = new Map<string, MutableFileChangeSet>();

  /**
   * Generic expansion state (§8.2 — ordering).
   *
   * Flat instantiations (`TList_Product`) are synthesized when a file is
   * indexed, from the templates known at that moment. A cold index visits
   * files in directory order, so a usage indexed before its template used to
   * keep an empty expansion forever. Instead of re-expanding the workspace on
   * every update, each file records the template revision it was expanded
   * against, and stale files are re-expanded lazily on the next read.
   */
  private genericTemplateRevision = 0;
  private readonly genericTemplateSignatures = new Map<string, string>();
  private readonly genericExpansionBases = new Map<string, readonly SymbolInfo[]>();
  private readonly staleGenericExpansions = new Set<string>();
  private refreshingGenericExpansions = false;

  /**
   * Whether the *most recent* update to this file changed its exported shape.
   * Volatile by design — it feeds per-declaration cache decisions. Lint
   * propagation must use {@link takeChangeSet} instead, which accumulates.
   */
  public hasLastUpdateChangedAPI(fileUri: string): boolean {
    const key = this.getCacheKey(fileUri);
    return this.lastUpdateApiChanged.get(key) ?? true;
  }

  /**
   * Accumulates a file's delta between lint cycles.
   *
   * Propagation used to read the delta of the *last keystroke*, so editing a
   * public signature and then typing anything else meant the save no longer
   * re-linted dependents. Deltas now merge into an open change set that only
   * {@link takeChangeSet} closes.
   */
  private recordChange(fileUri: string, apiChanged: boolean, namespaces?: Iterable<string>): void {
    const key = this.getCacheKey(fileUri);
    let pending = this.pendingChanges.get(key);
    if (!pending) {
      pending = { apiChanged: false, changedNamespaces: new Set<string>() };
      this.pendingChanges.set(key, pending);
    }
    pending.apiChanged ||= apiChanged;
    for (const ns of namespaces ?? []) {
      pending.changedNamespaces.add(ns.toLowerCase());
    }
  }

  /** Non-destructive read of the open change set for a file. */
  public peekChangeSet(fileUri: string): FileChangeSet {
    const key = this.getCacheKey(fileUri);
    const pending = this.pendingChanges.get(key);
    return {
      fileUri,
      apiChanged: pending?.apiChanged ?? false,
      changedNamespaces: new Set(pending?.changedNamespaces ?? []),
      revision: this.fileRevisions.get(key) ?? 0,
    };
  }

  /**
   * Reads and closes the open change set. The only sanctioned way to consume a
   * delta — a public mutable set previously let any consumer clear deltas that
   * belonged to another file's propagation.
   */
  public takeChangeSet(fileUri: string): FileChangeSet {
    const result = this.peekChangeSet(fileUri);
    this.pendingChanges.delete(this.getCacheKey(fileUri));
    return result;
  }

  /**
   * Re-opens a change set after a propagation failed, so the delta is retried
   * instead of being silently dropped.
   */
  public restoreChangeSet(changeSet: FileChangeSet): void {
    this.recordChange(changeSet.fileUri, changeSet.apiChanged, changeSet.changedNamespaces);
  }

  /**
   * Records the generic templates `parsed` declares and, when they differ from
   * the previous revision of the file, marks every other expanded file stale so
   * it re-synthesizes its flat instantiations on the next read.
   */
  private trackGenericTemplates(key: string, parsed: FileSymbols | undefined): void {
    const signature = parsed ? localGenericTemplateSignature(parsed.symbols) : "";
    const previous = this.genericTemplateSignatures.get(key) ?? "";
    if (signature === previous) return;

    if (signature === "") {
      this.genericTemplateSignatures.delete(key);
    } else {
      this.genericTemplateSignatures.set(key, signature);
    }

    this.genericTemplateRevision += 1;
    for (const expandedKey of this.genericExpansionBases.keys()) {
      if (expandedKey !== key) this.staleGenericExpansions.add(expandedKey);
    }
  }

  /** The symbols a file was parsed with, before any synthetic generic instance. */
  private preExpansionSymbols(key: string, parsed: FileSymbols): readonly SymbolInfo[] {
    return this.genericExpansionBases.get(key) ?? parsed.symbols;
  }

  /**
   * Expands generics for a file that was just written into the index.
   *
   * Must run *after* `cache.set`: the expansion reads the global symbol table,
   * and a stale table here is exactly what left a usage indexed before its
   * template with an empty expansion.
   */
  private expandGenericsForIndexedFile(key: string, fileUri: string, parsed: FileSymbols): void {
    this.invalidateAggregateSymbolCaches();
    this.genericExpansionBases.delete(key);
    this.trackGenericTemplates(key, parsed);
    this.applyGenericExpansion(key, fileUri, parsed);
    this.invalidateAggregateSymbolCaches();
  }

  /**
   * Synthesizes the flat generic instantiations for `parsed` and remembers the
   * pre-expansion symbols, so a later re-expansion replaces the synthetic
   * entries instead of stacking a second copy on top of them.
   */
  private applyGenericExpansion(key: string, fileUri: string, parsed: FileSymbols): void {
    this.staleGenericExpansions.delete(key);
    if (!readConfiguration().features.language.generics || !hasGenericMarkers(parsed.content)) {
      this.genericExpansionBases.delete(key);
      return;
    }

    const base = this.genericExpansionBases.get(key) ?? parsed.symbols.slice();
    parsed.symbols = base.slice();
    appendGenericInstantiations(parsed, fileUri, parsed.content, this);
    // Kept even when the expansion is empty: the templates this file uses may
    // only be indexed later, and the entry is what makes it re-expandable.
    this.genericExpansionBases.set(key, base);
  }

  /**
   * Re-expands files whose templates changed since they were indexed. Costs a
   * single set lookup when nothing is stale, which is the common case.
   */
  private ensureGenericExpansionsFresh(): void {
    if (this.staleGenericExpansions.size === 0 || this.refreshingGenericExpansions) return;
    this.refreshingGenericExpansions = true;
    try {
      const stale = Array.from(this.staleGenericExpansions);
      this.staleGenericExpansions.clear();
      let changed = false;
      for (const key of stale) {
        const parsed = this.cache.get(key);
        if (!parsed) {
          this.genericExpansionBases.delete(key);
          continue;
        }
        this.applyGenericExpansion(key, parsed.fileUri, parsed);
        changed = true;
      }
      if (changed) this.invalidateAggregateSymbolCaches();
    } finally {
      this.refreshingGenericExpansions = false;
    }
  }

  private clearGenericExpansionState(): void {
    this.genericTemplateSignatures.clear();
    this.genericExpansionBases.clear();
    this.staleGenericExpansions.clear();
  }

  private invalidateAggregateSymbolCaches(): void {
    this.allSymbolsCache = null;
    this.allFileSymbolsCache = null;
    this.symbolsByNameMap = null;
    this.symbolsByContainerMap = null;
  }

  private invalidateLocalCaches(): void {
    this.invalidateAggregateSymbolCaches();
    this.findMemberCache.clear();
    this.allMembersForTypeCache.clear();
    this.ownMembersForClassCache.clear();
    this.inheritedMembersForClassCache.clear();
    this.principalFileKeysCache = undefined;
  }

  /**
   * Two-layer invalidation for a single-file update (§8.2).
   *
   * A body-only edit cannot change what any type exports, so every member
   * resolution outside the edited file stays valid. Only an API change still
   * clears the caches wholesale: inheritance and qualified access can carry the
   * old shape into files the dependency graph does not link.
   */
  private invalidateCachesForFileUpdate(fileUri: string, apiChanged: boolean): void {
    if (apiChanged) {
      this.invalidateLocalCaches();
      return;
    }
    this.invalidateAggregateSymbolCaches();
    const affected = [fileUri];
    this.findMemberCache.invalidateFiles(affected);
    this.allMembersForTypeCache.invalidateFiles(affected);
    this.ownMembersForClassCache.invalidateFiles(affected);
    this.inheritedMembersForClassCache.invalidateFiles(affected);
  }

  /**
   * Cache keys of the project's `Principal.bas` files. Memoized because the
   * lint fingerprint needs the Principal revision on every check, and deriving
   * it by scanning the whole index made fingerprinting O(files in workspace).
   * Membership changes clear it through {@link invalidateLocalCaches}.
   */
  private getPrincipalFileKeys(): readonly string[] {
    if (this.principalFileKeysCache) return this.principalFileKeysCache;
    const keys: string[] = [];
    for (const file of this.cache.values()) {
      if (file.filePath.toLowerCase().endsWith(`${path.sep}principal.bas`)) {
        keys.push(this.getCacheKey(file.fileUri));
      }
    }
    this.principalFileKeysCache = keys;
    return keys;
  }

  private bumpFileRevision(fileUri: string): void {
    const key = this.getCacheKey(fileUri);
    this.fileRevisions.set(key, (this.fileRevisions.get(key) ?? 0) + 1);
  }

  public getFileRevision(fileUri: string): number {
    return this.fileRevisions.get(this.getCacheKey(fileUri)) ?? 0;
  }

  /** True when two URI strings refer to the same workspace file (path-normalized). */
  public isSameFileUri(fileUriA: string, fileUriB: string): boolean {
    return this.getCacheKey(fileUriA) === this.getCacheKey(fileUriB);
  }

  /**
   * Aligns cached symbol URIs with the caller's URI when they denote the same file
   * but use different string forms (e.g. workspace scan vs. open editor).
   */
  private reconcileIndexedFileUri(fileUri: string): boolean {
    const key = this.getCacheKey(fileUri);
    const fileSyms = this.cache.get(key);
    if (!fileSyms || fileSyms.fileUri === fileUri) {
      return false;
    }
    fileSyms.fileUri = fileUri;
    try {
      fileSyms.filePath = vscode.Uri.parse(fileUri).fsPath;
    } catch {
      /* keep existing filePath */
    }
    for (const sym of fileSyms.symbols) {
      sym.fileUri = fileUri;
    }
    return true;
  }

  public buildLintContextFingerprint(fileUri: string, content: string): string {
    const key = this.getCacheKey(fileUri);
    const ownRevision = String(this.fileRevisions.get(key) ?? 0);
    return `${hashContent(content)}|${ownRevision}|${this.buildLintDependencyFingerprint(fileUri)}`;
  }

  /**
   * Cross-file lint context (imported namespaces + Principal.bas) without own-file revision.
   * Used by per-declaration lint cache so unchanged method bodies survive local edits.
   */
  public buildLintDependencyFingerprint(fileUri: string): string {
    const key = this.getCacheKey(fileUri);
    const parts: string[] = [];

    const fileSyms = this.cache.get(key);
    if (fileSyms) {
      const importParts: string[] = [];
      for (const imp of fileSyms.imports) {
        // A namespace may be split across files; keying on a single declarer
        // let edits to the other declarers reuse a stale fingerprint.
        for (const owner of this.dependencyGraph.getDeclaringFileUris(imp)) {
          importParts.push(
            `${owner}:${String(this.fileRevisions.get(this.getCacheKey(owner)) ?? 0)}`,
          );
        }
      }
      importParts.sort();
      if (importParts.length > 0) {
        parts.push(importParts.join(","));
      }
    }

    let principalRevision = 0;
    for (const principalKey of this.getPrincipalFileKeys()) {
      principalRevision = Math.max(principalRevision, this.fileRevisions.get(principalKey) ?? 0);
    }
    parts.push(`p:${String(principalRevision)}`);
    return parts.join("|");
  }

  private notifyLintCacheInvalidation(
    fileUri: string,
    extraNamespaces: ReadonlySet<string> = new Set<string>(),
    apiChanged = true,
  ): void {
    const cached = LanguageProcessor.getInstance().getCached(fileUri);
    if (cached?.unit) {
      clearLintTypeResolutionCachesForUnit(cached.unit);
    }
    const cache = SemanticLintCache.getInstance();
    cache.invalidate(this.lintCacheScope, fileUri);

    if (apiChanged) {
      cache.invalidateDependents(
        this.lintCacheScope,
        fileUri,
        this.dependencyGraph,
        extraNamespaces,
      );
      DeclarationLintCache.getInstance().invalidateFile(this.lintCacheScope, fileUri);
      for (const dependentUri of this.dependencyGraph.getDependentFileUris(
        fileUri,
        extraNamespaces,
      )) {
        DeclarationLintCache.getInstance().invalidateFile(this.lintCacheScope, dependentUri);
        const dependentCached = LanguageProcessor.getInstance().getCached(dependentUri);
        if (dependentCached?.unit) {
          clearLintTypeResolutionCachesForUnit(dependentCached.unit);
        }
      }
    }
  }

  private syncDependencyGraphEntry(fileUri: string): void {
    const fileSyms = this.cache.get(this.getCacheKey(fileUri));
    if (fileSyms) {
      this.dependencyGraph.registerFile(fileSyms);
    } else {
      this.dependencyGraph.unregisterFile(fileUri);
    }
  }

  private rebuildDependencyGraph(): void {
    this.dependencyGraph.rebuild(Array.from(this.cache.values()));
  }

  public getDependentFileUris(
    triggerUri: string,
    extraNamespaces: ReadonlySet<string> = new Set<string>(),
  ): readonly string[] {
    return this.dependencyGraph.getDependentFileUris(triggerUri, extraNamespaces);
  }

  /** Every file that declares `namespace`. A namespace may be split across files. */
  public getDeclaringFileUris(namespace: string): readonly string[] {
    return this.dependencyGraph.getDeclaringFileUris(namespace);
  }

  /**
   * Transitive closure of {@link getDependentFileUris}, used by lint
   * propagation so an API change reaches indirect consumers.
   */
  public getTransitiveDependentFileUris(
    triggerUri: string,
    extraNamespaces: ReadonlySet<string> = new Set<string>(),
  ): readonly string[] {
    return this.dependencyGraph.getTransitiveDependents(triggerUri, { extraNamespaces });
  }

  /**
   * Drops semantic / declaration lint caches for a single file so a forced
   * re-lint cannot reuse stale diagnostics after a cross-file fix.
   */
  public invalidateFileLintCaches(fileUri: string): void {
    const cache = SemanticLintCache.getInstance();
    cache.invalidate(this.lintCacheScope, fileUri);
    DeclarationLintCache.getInstance().invalidateFile(this.lintCacheScope, fileUri);
    const cached = LanguageProcessor.getInstance().getCached(fileUri);
    if (cached?.unit) {
      clearLintTypeResolutionCachesForUnit(cached.unit);
    }
  }

  /**
   * Drops every indexed symbol, revision and dependency edge, restoring the
   * indexer to the state right after construction. Backs the "restart analysis"
   * command so a corrupted index can be recovered without reloading the window.
   */
  public resetIndex(): void {
    this.cache.clear();
    this.fileRevisions.clear();
    this.lastUpdateApiChanged.clear();
    this.pendingChanges.clear();
    this.dependencyGraph.clear();
    this.clearGenericExpansionState();
    this.invalidateLocalCaches();
    SemanticLintCache.getInstance().clear();
    DeclarationLintCache.getInstance().clear();
    if (readConfiguration().features.language.sugars) {
      this.indexVirtualSugarModules();
    }
  }

  // Singleton — the private constructor prevents instantiation outside `getInstance`.
  private constructor(lintCacheScope: string) {
    this.lintCacheScope = lintCacheScope;
    if (readConfiguration().features.language.sugars) {
      this.indexVirtualSugarModules();
    }
  }

  private indexVirtualSugarModules(): void {
    for (const utility of SugarRegistry.getUtilityModules()) {
      const fileUri = `system://sugars/${utility.namespace}.bas`;
      const content = utility.generateCode();
      const parsed = SymbolParser.parseBasFile(fileUri, content);
      this.cache.set(this.getCacheKey(fileUri), parsed);
    }
    this.invalidateLocalCaches();
  }

  public static getInstance(): WorkspaceSymbolIndexer {
    WorkspaceSymbolIndexer.hostInstance ??= new WorkspaceSymbolIndexer("host");
    return WorkspaceSymbolIndexer.hostInstance;
  }

  /**
   * Creates a brand-new indexer instance that does NOT share state with the
   * extension-host singleton. Intended for build-time / CLI flows that need
   * a deterministic, isolated view of a project (no leakage from previously
   * opened workspaces, no mutation that survives the build).
   *
   * Production callers should still prefer {@link getInstance} so that the
   * indexing cache is reused across providers. Use this only when the caller
   * is itself short-lived and owns the lifecycle of the result.
   */
  public static createDetached(): WorkspaceSymbolIndexer {
    WorkspaceSymbolIndexer.detachedScopeCounter++;
    return new WorkspaceSymbolIndexer(`detached-${WorkspaceSymbolIndexer.detachedScopeCounter}`);
  }

  /**
   * Exports a read-only snapshot of the current index for worker-thread lint.
   * Each worker loads the snapshot into its own detached indexer instance.
   */
  public exportLintSnapshot(): WorkspaceSymbolIndexSnapshot {
    const entries: FileSymbols[] = [];
    for (const fileSyms of this.cache.values()) {
      entries.push({
        fileUri: fileSyms.fileUri,
        filePath: fileSyms.filePath,
        content: fileSyms.content,
        imports: [...fileSyms.imports],
        symbols: fileSyms.symbols.map((symbol) => ({ ...symbol })),
      });
    }
    return {
      entries,
      fileRevisions: new Map(this.fileRevisions),
    };
  }

  /**
   * Hydrates a detached indexer from {@link exportLintSnapshot} without touching disk.
   */
  public loadLintSnapshot(snapshot: WorkspaceSymbolIndexSnapshot): void {
    this.cache.clear();
    this.fileRevisions.clear();
    for (const entry of snapshot.entries) {
      this.cache.set(this.getCacheKey(entry.fileUri), {
        fileUri: entry.fileUri,
        filePath: entry.filePath,
        content: entry.content,
        imports: [...entry.imports],
        symbols: entry.symbols.map((symbol) => ({ ...symbol })),
      });
    }
    for (const [key, revision] of snapshot.fileRevisions) {
      this.fileRevisions.set(key, revision);
    }
    this.rebuildDependencyGraph();
    this.invalidateLocalCaches();
  }

  private getCacheKey(fileUri: string): string {
    if (fileUri.toLowerCase().startsWith("file:")) {
      try {
        const filePath = vscode.Uri.parse(fileUri).fsPath;
        return path.normalize(filePath).toLowerCase();
      } catch {
        return fileUri.toLowerCase();
      }
    }
    return fileUri.toLowerCase();
  }

  /**
   * Checks if a file is physically present on disk or currently open in the host.
   */
  public isFileValid(fileUri: string): boolean {
    if (fileUri.startsWith("system://")) {
      return true;
    }
    if (fileUri.startsWith("file:///synthetic-build-dir/") || fileUri.startsWith("file:///proj/")) {
      return true;
    }
    try {
      const host = getAnalysisHost();
      const filePath = vscode.Uri.parse(fileUri).fsPath;
      if (host.fs.existsSync(filePath)) {
        return true;
      }
      if (host.getOpenDocument(fileUri)) {
        return true;
      }
    } catch {
      /* fall through to false */
    }
    return false;
  }

  /**
   * Remove any cached files that no longer exist on disk and are not open in the editor
   */
  public validateCache(): void {
    let pruned = false;
    for (const cacheKey of Array.from(this.cache.keys())) {
      const fileSyms = this.cache.get(cacheKey);
      if (fileSyms && !this.isFileValid(fileSyms.fileUri)) {
        this.cache.delete(cacheKey);
        this.dependencyGraph.unregisterFile(fileSyms.fileUri);
        pruned = true;
      }
    }
    if (pruned) {
      this.invalidateLocalCaches();
    }
  }

  /**
   * Scan entire workspace recursively for .bas files and index them
   */
  public async indexWorkspace(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined,
  ): Promise<void> {
    this.validateCache();
    if (!workspaceFolders) return;

    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      const diskCache = AnalysisCache.load(folderPath);
      await this.scanDir(folderPath, diskCache);
      // Persist warm symbol metadata for faster subsequent cold starts.
      const files: {
        fileUri: string;
        content: string;
        symbols: FileSymbols;
      }[] = [];
      for (const fileSym of this.cache.values()) {
        const fsPath = fileSym.filePath.toLowerCase();
        const root = folderPath.toLowerCase();
        if (fsPath === root || fsPath.startsWith(root + path.sep.toLowerCase())) {
          files.push({
            fileUri: fileSym.fileUri,
            content: fileSym.content,
            symbols: fileSym,
          });
        }
      }
      AnalysisCache.save(folderPath, files);
    }
    this.rebuildDependencyGraph();
    this.invalidateLocalCaches();
  }

  /**
   * Rewrites `.data7/analysis-cache.json` from the in-memory index for each
   * workspace folder. Used after batch fix / full workspace lint so the on-disk
   * cache matches the symbols that were just re-indexed.
   */
  public persistAnalysisCache(
    workspaceFolders: readonly { readonly uri: { readonly fsPath: string } }[],
  ): void {
    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      const files: {
        fileUri: string;
        content: string;
        symbols: FileSymbols;
      }[] = [];
      for (const fileSym of this.cache.values()) {
        const fsPath = fileSym.filePath.toLowerCase();
        const root = folderPath.toLowerCase();
        if (fsPath === root || fsPath.startsWith(root + path.sep.toLowerCase())) {
          files.push({
            fileUri: fileSym.fileUri,
            content: fileSym.content,
            symbols: fileSym,
          });
        }
      }
      AnalysisCache.save(folderPath, files);
    }
  }

  /**
   * Re-scans a single directory recursively. Used by flows that mutate a
   * narrow slice of the workspace (e.g. `data7_modules/` right after a
   * module import) and want to avoid the cost of re-indexing every file
   * under every workspace folder.
   *
   * Caller is responsible for picking a directory that lives inside the
   * workspace; this method does NOT validate that.
   */
  public async indexDirectory(directoryPath: string): Promise<void> {
    await this.scanDir(directoryPath);
  }

  public deleteWorkspaceFolder(deletedPath: string): void {
    const deletedPathNormalized = deletedPath.endsWith(path.sep)
      ? deletedPath
      : deletedPath + path.sep;
    for (const cacheKey of Array.from(this.cache.keys())) {
      if (cacheKey === deletedPath || cacheKey.startsWith(deletedPathNormalized)) {
        const fileSyms = this.cache.get(cacheKey);
        this.cache.delete(cacheKey);
        if (fileSyms) {
          this.dependencyGraph.unregisterFile(fileSyms.fileUri);
        }
      }
    }
    this.invalidateLocalCaches();
  }

  public renameWorkspaceFolder(oldPath: string, newPath: string): void {
    const oldPathNormalized = oldPath.endsWith(path.sep) ? oldPath : oldPath + path.sep;
    const newPathNormalized = newPath.endsWith(path.sep) ? newPath : newPath + path.sep;

    // Moving cache entries without re-keying the dependency graph left the old
    // URIs registered as namespace declarers, so propagation targeted files
    // that no longer existed and skipped the renamed ones.
    const moveEntry = (fileSyms: FileSymbols, newFileKey: string, newFilePath: string): void => {
      this.dependencyGraph.unregisterFile(fileSyms.fileUri);
      const previousKey = this.getCacheKey(fileSyms.fileUri);
      const revision = this.fileRevisions.get(previousKey) ?? 0;
      this.fileRevisions.delete(previousKey);
      this.lastUpdateApiChanged.delete(previousKey);

      fileSyms.filePath = newFilePath;
      fileSyms.fileUri = vscode.Uri.file(newFilePath).toString();
      fileSyms.symbols.forEach((s) => {
        s.fileUri = fileSyms.fileUri;
      });

      this.cache.set(newFileKey, fileSyms);
      this.fileRevisions.set(newFileKey, revision + 1);
      this.lastUpdateApiChanged.set(newFileKey, true);
      this.dependencyGraph.registerFile(fileSyms);
    };

    for (const cacheKey of Array.from(this.cache.keys())) {
      if (cacheKey === oldPath) {
        const fileSyms = this.cache.get(cacheKey);
        this.cache.delete(cacheKey);
        if (fileSyms) {
          moveEntry(fileSyms, newPath, newPath);
        }
      } else if (cacheKey.startsWith(oldPathNormalized)) {
        const fileSyms = this.cache.get(cacheKey);
        this.cache.delete(cacheKey);
        if (fileSyms) {
          const relative = cacheKey.substring(oldPathNormalized.length);
          const newFilePath = path.join(newPathNormalized, relative);
          moveEntry(fileSyms, newFilePath.toLowerCase(), newFilePath);
        }
      }
    }

    this.invalidateLocalCaches();

    // Also re-scan the new path to ensure any files are fresh
    this.scanDir(newPath).catch((err) => {
      logger.error("Falha ao reindexar caminho renomeado.", err);
    });
  }

  private async scanDir(
    dir: string,
    diskCache?: Map<
      string,
      {
        fileUri: string;
        contentHash: string;
        imports: readonly string[];
        symbols: readonly SymbolInfo[];
      }
    >,
  ): Promise<void> {
    const hostFs = getAnalysisHost().fs;
    if (!hostFs.existsSync(dir)) return;
    if (isExcluded(dir)) return;
    let entries: Awaited<ReturnType<typeof hostFs.readdirWithFileTypes>>;
    try {
      entries = await hostFs.readdirWithFileTypes(dir);
    } catch {
      return;
    }
    let processed = 0;
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.scanDir(filePath, diskCache);
      } else {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === ".bas" || ext === ".d7b") {
          if (isExcluded(filePath)) continue;
          const fileUri = vscode.Uri.file(filePath).toString();
          this.indexFile(fileUri, diskCache);
        }
      }
      processed++;
      // Yield to the event loop so the extension host stays responsive during cold index.
      if (processed % 8 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
  }

  /**
   * Parse and cache a single file by URI
   */
  public indexFile(
    fileUri: string,
    diskCache?: Map<
      string,
      {
        fileUri: string;
        contentHash: string;
        imports: readonly string[];
        symbols: readonly SymbolInfo[];
      }
    >,
  ): void {
    try {
      const filePath = vscode.Uri.parse(fileUri).fsPath;
      if (isExcluded(filePath)) return;
      const key = this.getCacheKey(fileUri);

      const oldParsed = this.cache.get(key);
      if (oldParsed) {
        this.recordChange(fileUri, false, namespaceNamesOf(oldParsed));
      }

      const hostFs = getAnalysisHost().fs;
      if (hostFs.existsSync(filePath)) {
        const content = hostFs.readFileSync(filePath);
        let parsed =
          diskCache !== undefined
            ? AnalysisCache.tryGetFresh(diskCache, fileUri, content)
            : undefined;
        if (!parsed) {
          parsed = SymbolParser.parseBasFile(fileUri, content);
        } else {
          parsed.filePath = filePath;
          // Still warm LanguageProcessor AST cache for providers.
          LanguageProcessor.getInstance().getOrParse(fileUri, content);
        }
        if (readConfiguration().features.language.generics) {
          appendGenericInstantiations(parsed, fileUri, content, this);
        }
        this.cache.set(key, parsed);

        this.bumpFileRevision(fileUri);
        this.lastUpdateApiChanged.set(key, true);
        this.recordChange(fileUri, true, namespaceNamesOf(parsed));
        this.notifyLintCacheInvalidation(fileUri, new Set<string>(), true);
      } else {
        this.cache.delete(key);
        this.bumpFileRevision(fileUri);
        this.lastUpdateApiChanged.set(key, true);
        this.recordChange(fileUri, true);
        this.notifyLintCacheInvalidation(fileUri, new Set<string>(), true);
      }
      this.invalidateLocalCaches();
      this.syncDependencyGraphEntry(fileUri);
    } catch (err: unknown) {
      logger.error(`Erro ao indexar arquivo: ${fileUri}`, err);
    }
  }

  /**
   * Update cache with active text content (useful for open editor changes)
   *
   * When the file contains generic templates / usages, we also run the
   * shared generics analyzer ({@link collectGenericsContext}) and inject
   * flat-named copies of the template members (`TList_Product`, …) into
   * the parsed symbol list, so hover/completion/signature providers
   * surface the substituted members automatically.
   *
   * The expansion is best-effort: it short-circuits when no template is
   * declared, when no usage is observed, or when the arity mismatches —
   * mirroring the warnings already reported by the live linter.
   */
  public updateFileContent(fileUri: string, content: string): void {
    try {
      const key = this.getCacheKey(fileUri);
      const oldParsed = this.cache.get(key);
      if (oldParsed && hashContent(oldParsed.content) === hashContent(content)) {
        if (this.reconcileIndexedFileUri(fileUri)) {
          this.lastUpdateApiChanged.set(key, false);
          this.notifyLintCacheInvalidation(fileUri, new Set<string>(), false);
        }
        return;
      }

      const parsed = SymbolParser.parseBasFile(fileUri, content);

      const oldNamespaces = namespaceNamesOf(oldParsed);
      const newNamespaces = new Set(namespaceNamesOf(parsed));
      const namespacesChanged = namespaceSetsDiffer(oldNamespaces, newNamespaces);

      let apiChanged = true;
      if (oldParsed) {
        apiChanged =
          !areImportsEqual(oldParsed.imports, parsed.imports) ||
          !areSymbolsAPIsEqual(this.preExpansionSymbols(key, oldParsed), parsed.symbols);
      }

      this.cache.set(key, parsed);
      this.expandGenericsForIndexedFile(key, fileUri, parsed);
      this.bumpFileRevision(fileUri);
      this.lastUpdateApiChanged.set(key, apiChanged);
      this.recordChange(fileUri, apiChanged, [...oldNamespaces, ...newNamespaces]);
      this.notifyLintCacheInvalidation(fileUri, new Set<string>(), apiChanged);
      this.invalidateCachesForFileUpdate(fileUri, apiChanged || namespacesChanged);
      this.syncDependencyGraphEntry(fileUri);
    } catch (err: unknown) {
      logger.error(`Erro ao atualizar indexação para: ${fileUri}`, err);
    }
  }

  /**
   * Updates index caching directly using pre-parsed FileSymbols.
   * Avoids parsing the file again when AST is already constructed.
   */
  public updateFileContentFromParsed(fileUri: string, content: string, parsed: FileSymbols): void {
    try {
      const key = this.getCacheKey(fileUri);
      const oldParsed = this.cache.get(key);
      if (oldParsed && hashContent(oldParsed.content) === hashContent(content)) {
        if (this.reconcileIndexedFileUri(fileUri)) {
          this.lastUpdateApiChanged.set(key, false);
          this.notifyLintCacheInvalidation(fileUri, new Set<string>(), false);
        }
        return;
      }

      const oldNamespaces = new Set(namespaceNamesOf(oldParsed));
      const newNamespaces = new Set(namespaceNamesOf(parsed));
      const namespacesChanged = namespaceSetsDiffer(oldNamespaces, newNamespaces);

      parsed.content = content;

      let apiChanged = true;
      if (oldParsed) {
        apiChanged =
          !areImportsEqual(oldParsed.imports, parsed.imports) ||
          !areSymbolsAPIsEqual(this.preExpansionSymbols(key, oldParsed), parsed.symbols);
      }

      this.cache.set(key, parsed);
      this.expandGenericsForIndexedFile(key, fileUri, parsed);
      this.bumpFileRevision(fileUri);
      this.lastUpdateApiChanged.set(key, apiChanged);
      this.recordChange(
        fileUri,
        apiChanged,
        namespacesChanged ? [...oldNamespaces, ...newNamespaces] : [],
      );
      this.notifyLintCacheInvalidation(
        fileUri,
        namespacesChanged ? newNamespaces : new Set<string>(),
        apiChanged,
      );

      this.invalidateCachesForFileUpdate(fileUri, apiChanged || namespacesChanged);
      this.syncDependencyGraphEntry(fileUri);
    } catch (err: unknown) {
      logger.error(`Erro ao atualizar indexação a partir de símbolos parsed para: ${fileUri}`, err);
    }
  }

  /**
   * Remove a file from index
   */
  public removeFile(fileUri: string): void {
    const key = this.getCacheKey(fileUri);
    const oldParsed = this.cache.get(key);
    this.cache.delete(key);
    this.genericExpansionBases.delete(key);
    this.trackGenericTemplates(key, undefined);
    this.bumpFileRevision(fileUri);
    this.lastUpdateApiChanged.set(key, true);
    this.recordChange(fileUri, true, namespaceNamesOf(oldParsed));
    this.notifyLintCacheInvalidation(fileUri, new Set<string>(), true);
    this.invalidateLocalCaches();
    this.syncDependencyGraphEntry(fileUri);
  }

  /**
   * Test-only hook: clears the entire cache so tests start from a known state.
   */
  public __resetForTests(): void {
    this.cache.clear();
    this.pendingChanges.clear();
    this.dependencyGraph.clear();
    this.fileRevisions.clear();
    this.lastUpdateApiChanged.clear();
    this.clearGenericExpansionState();
    if (this.lintCacheScope === "host") {
      SemanticLintCache.resetForTests();
      DeclarationLintCache.resetForTests();
    }
    this.invalidateLocalCaches();
  }

  /**
   * Get symbols for a specific file
   */
  public getFileSymbols(fileUri: string): FileSymbols | undefined {
    this.ensureGenericExpansionsFresh();
    const key = this.getCacheKey(fileUri);
    const fileSyms = this.cache.get(key);
    if (!fileSyms) return undefined;
    // Detached/worker snapshots are authoritative. Host still prunes deleted files.
    if (this.lintCacheScope === "host" && !this.isFileValid(fileSyms.fileUri)) {
      this.cache.delete(key);
      return undefined;
    }
    return fileSyms;
  }

  /**
   * Get all symbols in the workspace
   */
  public getAllSymbols(): SymbolInfo[] {
    this.ensureGenericExpansionsFresh();
    if (this.allSymbolsCache) {
      return this.allSymbolsCache;
    }
    const all: SymbolInfo[] = [];
    for (const fileSym of this.cache.values()) {
      all.push(...fileSym.symbols);
    }
    this.allSymbolsCache = all;
    return all;
  }

  /**
   * Returns every cached `FileSymbols` entry. Used by reference/rename
   * providers that need to scan the file bodies for whole-word matches.
   */
  public getAllFileSymbols(): FileSymbols[] {
    this.ensureGenericExpansionsFresh();
    if (this.allFileSymbolsCache) {
      return this.allFileSymbolsCache;
    }
    const all = Array.from(this.cache.values());
    this.allFileSymbolsCache = all;
    return all;
  }

  private buildSearchMaps(): void {
    if (this.symbolsByNameMap && this.symbolsByContainerMap) return;

    const byName = new Map<string, SymbolInfo[]>();
    const byContainer = new Map<string, SymbolInfo[]>();

    const allSyms = this.getAllSymbols();
    for (const sym of allSyms) {
      const nameKey = sym.name.toLowerCase();
      let nameList = byName.get(nameKey);
      if (!nameList) {
        nameList = [];
        byName.set(nameKey, nameList);
      }
      nameList.push(sym);

      if (sym.containerName) {
        const containerKey = sym.containerName.toLowerCase();
        let containerList = byContainer.get(containerKey);
        if (!containerList) {
          containerList = [];
          byContainer.set(containerKey, containerList);
        }
        containerList.push(sym);
      }
    }

    this.symbolsByNameMap = byName;
    this.symbolsByContainerMap = byContainer;
  }

  public getSymbolsByName(name: string): SymbolInfo[] {
    this.buildSearchMaps();
    return this.symbolsByNameMap?.get(name.toLowerCase()) ?? [];
  }

  public getSymbolsByContainer(containerName: string): SymbolInfo[] {
    this.buildSearchMaps();
    return this.symbolsByContainerMap?.get(containerName.toLowerCase()) ?? [];
  }

  /**
   * Resolve a type or namespace name by scanning imports and the global index
   */
  public findSymbolByName(
    name: string,
    contextFileUri?: string,
    contextLine?: number,
  ): SymbolInfo | undefined {
    const lowerName = name.toLowerCase();

    // 1. O(1) name-map lookup. Prefer workspace copies when duplicates exist.
    //    Hot path does not call fs.existsSync — validateCache / cold index prune stale entries.
    const matches = this.getSymbolsByName(name);
    const contextualMatch = WorkspaceSymbolIndexer.pickContextualNameMatch(
      matches,
      contextFileUri,
      contextLine,
      this,
    );
    const match = contextualMatch ?? WorkspaceSymbolIndexer.preferWorkspaceMatch(matches);
    if (match) {
      return match;
    }

    // 2. If we have imports, look under imported namespaces via container map.
    if (contextFileUri) {
      const fileSym = this.getFileSymbols(contextFileUri);
      if (fileSym) {
        for (const imp of fileSym.imports) {
          const containerSymbols = this.getSymbolsByContainer(imp);
          const qualifiedMatches = containerSymbols.filter(
            (s) => s.name.toLowerCase() === lowerName,
          );
          const preferred = WorkspaceSymbolIndexer.preferWorkspaceMatch(qualifiedMatches);
          if (preferred) {
            return preferred;
          }
          // Also match fully-qualified symbol names stored without container split.
          const qualifiedName = `${imp}.${name}`;
          const byFullName = this.getSymbolsByName(qualifiedName);
          const fullPreferred = WorkspaceSymbolIndexer.preferWorkspaceMatch(byFullName);
          if (fullPreferred) {
            return fullPreferred;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * When homonyms exist across files, prefer a declaration in the active
   * editor file (and its namespace) before falling back to workspace-wide
   * disambiguation.
   */
  private static pickContextualNameMatch(
    matches: readonly SymbolInfo[],
    contextFileUri: string | undefined,
    contextLine: number | undefined,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo | undefined {
    if (!contextFileUri || matches.length <= 1) return undefined;

    const sameFile = matches.filter((symbol) => symbol.fileUri === contextFileUri);
    if (sameFile.length === 0) return undefined;
    if (sameFile.length === 1) return sameFile[0];

    if (contextLine !== undefined) {
      const fileSyms = indexer.getFileSymbols(contextFileUri);
      const activeNamespace = fileSyms
        ? WorkspaceSymbolIndexer.findActiveNamespaceName(fileSyms.symbols, contextLine)
        : undefined;
      if (activeNamespace) {
        const inNamespace = sameFile.filter(
          (symbol) => symbol.containerName?.toLowerCase() === activeNamespace,
        );
        const preferredInNamespace =
          WorkspaceSymbolIndexer.preferTypeLikeSymbol(inNamespace) ??
          WorkspaceSymbolIndexer.preferTypeLikeSymbol(sameFile);
        if (preferredInNamespace) return preferredInNamespace;
      }
    }

    return WorkspaceSymbolIndexer.preferTypeLikeSymbol(sameFile) ?? sameFile[0];
  }

  private static findActiveNamespaceName(
    symbols: readonly SymbolInfo[],
    lineIdx: number,
  ): string | undefined {
    const namespace = symbols.find(
      (symbol) =>
        symbol.kind === "namespace" &&
        lineIdx >= symbol.range.startLine &&
        lineIdx <= symbol.range.endLine,
    );
    return namespace?.name.toLowerCase();
  }

  private static preferTypeLikeSymbol(matches: readonly SymbolInfo[]): SymbolInfo | undefined {
    return matches.find(
      (symbol) =>
        symbol.kind === "class" ||
        symbol.kind === "structure" ||
        symbol.kind === "namespace" ||
        symbol.kind === "delegate" ||
        symbol.kind === "enum",
    );
  }

  /**
   * Returns the first match that belongs to an open workspace folder. Falls
   * back to the first entry otherwise. Centralised so every lookup path
   * applies the same precedence rule.
   */
  private static preferWorkspaceMatch(matches: readonly SymbolInfo[]): SymbolInfo | undefined {
    if (matches.length === 0) return undefined;
    if (matches.length === 1) return matches[0];
    const folders = getAnalysisHost().getWorkspaceFolders() ?? [];
    if (folders.length === 0) return matches[0];
    const isInsideWorkspace = (fileUri: string): boolean => {
      if (fileUri.startsWith("system://")) return false;
      try {
        const fsPath = vscode.Uri.parse(fileUri).fsPath;
        const normalized = path.normalize(fsPath).toLowerCase();
        return folders.some((folder) => {
          const folderPath = path.normalize(vscode.Uri.parse(folder.uri).fsPath).toLowerCase();
          if (normalized === folderPath) return true;
          const prefix = folderPath.endsWith(path.sep) ? folderPath : folderPath + path.sep;
          return normalized.startsWith(prefix);
        });
      } catch {
        return false;
      }
    };
    const workspaceMatch = matches.find((m) => isInsideWorkspace(m.fileUri));
    return workspaceMatch ?? matches[0];
  }
}

// ============================================================================
// Generic instantiation helpers (Fase 7)
// ============================================================================

/**
 * Cheap pre-filter to avoid invoking the analyzer on files that
 * obviously carry no generic usage. Requires an UPPERCASE identifier
 * followed by `<…>` whose body has no inner `<` or newline — rejects
 * comparisons (`If x < y Then`), HTML-like text, and false positives
 * caused by `<=` / `<>` operators.
 *
 * Nested usages like `TList<TList<Integer>>` still match thanks to the
 * inner-most `TList<Integer>` sub-string.
 */
function hasGenericMarkers(content: string): boolean {
  return /\b[A-Z]\w*\s*<[^<>\n]{1,200}>/.test(content);
}

/**
 * Module-level memoization cache so back-to-back hover/completion calls
 * over the same file do not re-tokenize and re-clone the same template
 * members. Keyed by content (the indexer already creates one file entry
 * per URI; the content is the natural cache key for an open editor).
 */
const expansionCache = new WeakMap<object, SymbolInfo[]>();
const expansionCacheKeys = new Map<string, { ref: object; content: string }>();

/**
 * Returns the cached expansion for `fileUri` + `content`, or runs the
 * analyzer + member-cloning pipeline and stores the result. The key is
 * `(fileUri, content)`; when either changes the cache entry is replaced.
 */
function getOrComputeExpansion(
  fileUri: string,
  content: string,
  parsed: FileSymbols,
  indexer: WorkspaceSymbolIndexer,
): SymbolInfo[] {
  const cacheContent = `${content}\n/*external-generics:${genericTemplateCacheSignature(indexer.getAllSymbols(), fileUri)}*/`;
  const cached = expansionCacheKeys.get(fileUri);
  if (cached?.content === cacheContent) {
    const hit = expansionCache.get(cached.ref);
    if (hit) return hit;
  }
  const computed = computeGenericInstantiations(parsed, fileUri, content, indexer);
  const ref = { fileUri, content: cacheContent };
  expansionCacheKeys.set(fileUri, { ref, content: cacheContent });
  expansionCache.set(ref, computed);
  return computed;
}

/**
 * Appends synthetic flat-named symbols (`TList_Product`, …) to the
 * already-parsed `FileSymbols`. Idempotent and best-effort: when there
 * is no generic template or usage, the function returns without
 * touching `parsed`.
 *
 * Reuses the shared analyzer in {@link collectGenericsContext} so the
 * indexer, the live linter, the textual pass and the AST driver all
 * agree on which usages exist and what their flat names are.
 */
function appendGenericInstantiations(
  parsed: FileSymbols,
  fileUri: string,
  content: string,
  indexer: WorkspaceSymbolIndexer,
): void {
  if (!hasGenericMarkers(content)) return;
  const extra = getOrComputeExpansion(fileUri, content, parsed, indexer);
  if (extra.length === 0) return;
  const known = new Set(parsed.symbols.map(symbolKey));
  for (const sym of extra) {
    if (!known.has(symbolKey(sym))) parsed.symbols.push(sym);
  }
}

/**
 * Joins the identifying fields of a SymbolInfo so the synthetic
 * flat-name expansion does not overwrite a textual declaration already
 * present in the file (e.g. a hand-written `Class TList_Product` next
 * to the generic template).
 */
function symbolKey(s: SymbolInfo): string {
  return `${s.containerName ?? ""}::${s.name}#${String(s.range.startLine)}`;
}

/**
 * Core of {@link appendGenericInstantiations} — builds the list of
 * synthetic SymbolInfo entries for `(template, type-args)` pairs
 * observed in `content`.
 *
 * For each usage, we emit one synthetic class symbol plus one cloned
 * member per template member (containerName === template.name). The
 * cloned member's `type`/`parameters[].type` carry the substituted
 * type-arguments so hover/completion show `Add(pValue As Product) As
 * Integer` instead of the raw `T`.
 */
function computeGenericInstantiations(
  parsed: FileSymbols,
  fileUri: string,
  content: string,
  indexer: WorkspaceSymbolIndexer,
): SymbolInfo[] {
  const ctx = collectGenericsContext(content, {
    externalTemplates: collectGenericTemplatesFromSymbols(indexer.getAllSymbols(), fileUri),
  });
  if (ctx.templates.size === 0 || ctx.usages.length === 0) return [];

  // The flat-class needs the namespace its template was declared
  // inside. Build a `template name -> containerName` lookup from the
  // already-parsed symbols so we do not re-derive it textually.
  const namespaceOfTemplate = new Map<string, string | undefined>();
  for (const sym of parsed.symbols) {
    if (sym.kind !== "class" && sym.kind !== "delegate") continue;
    namespaceOfTemplate.set(sym.name.toLowerCase(), sym.containerName);
  }
  for (const sym of indexer.getAllSymbols()) {
    if (sym.kind !== "class" && sym.kind !== "delegate" && sym.kind !== "method") continue;
    if (!sym.genericTypeParameters || sym.genericTypeParameters.length === 0) continue;
    if (!namespaceOfTemplate.has(sym.name.toLowerCase())) {
      namespaceOfTemplate.set(sym.name.toLowerCase(), sym.containerName);
    }
  }

  const result: SymbolInfo[] = [];
  const emitted = new Set<string>();
  const openTypeParams = collectOpenGenericTypeParams(ctx.templates.values());

  for (const usage of ctx.usages) {
    const template = ctx.templates.get(usage.templateName.toLowerCase());
    if (template === undefined) continue;
    if (template.typeParams.length !== usage.typeArgs.length) continue;
    if (hasOpenGenericTypeArgument(usage.typeArgs, openTypeParams)) continue;
    if (emitted.has(usage.flatName)) continue;
    emitted.add(usage.flatName);

    const subs = buildSubstitutions(template, usage);
    if (subs === undefined) continue;

    const containerName = namespaceOfTemplate.get(template.name.toLowerCase());
    const templateSymbol = findGenericTemplateSymbol(parsed.symbols, template, indexer);
    const inheritsFrom = templateSymbol?.inheritsFrom
      ? substituteTypeName(templateSymbol.inheritsFrom, subs)
      : undefined;
    appendSyntheticClass(result, usage, fileUri, containerName, inheritsFrom);
    appendClonedMembers(result, parsed.symbols, template, usage, subs, indexer);
  }

  return result;
}

function findGenericTemplateSymbol(
  source: readonly SymbolInfo[],
  template: GenericTemplateInfo,
  indexer: WorkspaceSymbolIndexer,
): SymbolInfo | undefined {
  const templateLower = template.name.toLowerCase();
  const isTemplateSymbol = (sym: SymbolInfo): boolean =>
    sym.kind === "class" &&
    sym.name.toLowerCase() === templateLower &&
    (sym.genericTypeParameters?.length ?? 0) > 0;

  return source.find(isTemplateSymbol) ?? indexer.getAllSymbols().find(isTemplateSymbol);
}

function collectGenericTemplatesFromSymbols(
  symbols: readonly SymbolInfo[],
  currentFileUri: string,
): GenericTemplateInfo[] {
  const templates: GenericTemplateInfo[] = [];
  const seen = new Set<string>();
  for (const sym of symbols) {
    if (sym.isSyntheticGenericInstantiation) continue;
    if (sym.fileUri === currentFileUri) continue;
    if (sym.kind !== "class" && sym.kind !== "delegate" && sym.kind !== "method") {
      continue;
    }
    if (!sym.genericTypeParameters || sym.genericTypeParameters.length === 0) continue;
    const key = sym.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    templates.push({
      kind: sym.kind,
      name: sym.name,
      typeParams: sym.genericTypeParameters,
      line: sym.range.startLine,
    });
  }
  return templates;
}

function genericTemplateCacheSignature(
  symbols: readonly SymbolInfo[],
  currentFileUri: string,
): string {
  return collectGenericTemplatesFromSymbols(symbols, currentFileUri)
    .map((template) => `${template.kind}:${template.name}<${template.typeParams.join(",")}>`)
    .sort()
    .join("|");
}

function buildSubstitutions(
  template: GenericTemplateInfo,
  usage: GenericUsageOccurrence,
): Map<string, string> | undefined {
  const subs = new Map<string, string>();
  for (let i = 0; i < template.typeParams.length; i++) {
    const tp = template.typeParams[i];
    const ta = usage.typeArgs[i];
    if (!tp || !ta) return undefined;
    subs.set(tp, ta);
  }
  return subs;
}

function collectOpenGenericTypeParams(
  templates: Iterable<GenericTemplateInfo>,
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const template of templates) {
    for (const typeParam of template.typeParams) {
      result.add(typeParam.toLowerCase());
    }
  }
  return result;
}

function hasOpenGenericTypeArgument(
  typeArgs: readonly string[],
  openTypeParams: ReadonlySet<string>,
): boolean {
  return typeArgs.some((typeArg) => {
    for (const openParam of openTypeParams) {
      if (new RegExp(`\\b${escapeRegExp(openParam)}\\b`, "i").test(typeArg)) return true;
    }
    return false;
  });
}

function appendSyntheticClass(
  out: SymbolInfo[],
  usage: GenericUsageOccurrence,
  fileUri: string,
  containerName: string | undefined,
  inheritsFrom: string | undefined,
): void {
  out.push({
    name: usage.flatName,
    kind: "class",
    type: usage.flatName,
    isShared: false,
    isPrivate: false,
    range: {
      startLine: usage.line,
      startChar: usage.column,
      endLine: usage.line,
      endChar: usage.column + usage.flatName.length,
    },
    fileUri,
    containerName,
    inheritsFrom,
    isSyntheticGenericInstantiation: true,
    description: `Instanciacao monomorfica de ${usage.templateName}<${usage.typeArgs.join(", ")}>.`,
  });
}

function appendClonedMembers(
  out: SymbolInfo[],
  source: readonly SymbolInfo[],
  template: GenericTemplateInfo,
  usage: GenericUsageOccurrence,
  subs: ReadonlyMap<string, string>,
  indexer: WorkspaceSymbolIndexer,
): void {
  const templateLower = template.name.toLowerCase();
  let lookupSource = source;
  const hasTemplateMembers = source.some(
    (sym) => sym.containerName?.toLowerCase() === templateLower,
  );
  if (!hasTemplateMembers) {
    const workspaceSymbols = indexer.getAllSymbols();
    const hasWorkspaceTemplateMembers = workspaceSymbols.some(
      (sym) => sym.containerName?.toLowerCase() === templateLower,
    );
    if (hasWorkspaceTemplateMembers) {
      lookupSource = workspaceSymbols;
    }
  }
  for (const sym of lookupSource) {
    if (sym.containerName?.toLowerCase() !== templateLower) continue;
    const clone: SymbolInfo = {
      ...sym,
      type: substituteTypeName(sym.type, subs),
      containerName: usage.flatName,
      isSyntheticGenericInstantiation: true,
    };
    if (sym.parameters !== undefined) {
      clone.parameters = sym.parameters.map((p) => ({
        ...p,
        type: substituteTypeName(p.type, subs),
      }));
    }
    out.push(clone);
  }
}

/**
 * Substitutes whole-word type parameter names inside a type string. The
 * substring `T` inside `TList` must NOT be rewritten, so we anchor with
 * `\b`. Type parameters are always plain identifiers (ASCII letters,
 * digits, underscore), so no regex escaping is needed.
 */
function substituteTypeName(type: string, subs: ReadonlyMap<string, string>): string {
  if (subs.size === 0 || type.length === 0) return type;
  let out = type;
  for (const [tp, ta] of subs) {
    out = out.replace(new RegExp(`\\b${tp}\\b`, "g"), ta);
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveParameterIsByRef(p: {
  type: TypeReference;
  isByRef?: boolean;
  isByVal?: boolean;
}): boolean {
  if (p.isByRef === true) return true;
  if (p.isByVal === true) return false;
  const typeStr = typeRefToString(p.type) ?? "Variant";
  const typeLower = typeStr.toLowerCase();
  if (PRIMITIVE_TYPES.has(typeLower) || typeLower === "variant") {
    return false;
  }
  return true;
}

export function areImportsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
}

function serializeParam(p: ParameterInfo): string {
  return `${p.name}:${p.type}:${p.isByRef ? "ref" : "val"}:${p.isOptional ? "opt" : "req"}:${p.defaultValue ?? ""}`;
}

function serializeSymbolAPI(s: SymbolInfo): string {
  const parts = [
    s.containerName?.toLowerCase() ?? "",
    s.kind,
    s.name.toLowerCase(),
    s.type.toLowerCase(),
    s.isShared ? "shared" : "",
    s.isPrivate ? "private" : "",
    s.isProtected ? "protected" : "",
    s.isConst ? "const" : "",
    s.isReadOnly ? "readonly" : "",
    s.isMustOverride ? "mustoverride" : "",
    s.isOverridable ? "overridable" : "",
    s.variadicParameters ? "variadic" : "",
    s.isMustInherit ? "mustinherit" : "",
    s.isNotInheritable ? "notinheritable" : "",
    s.isShadows ? "shadows" : "",
    s.nativeArrayRank !== undefined ? `rank:${s.nativeArrayRank}` : "",
    s.noParentheses ? "noparen" : "",
    s.inheritsFrom?.toLowerCase() ?? "",
    s.isUnsupported ? "unsupported" : "",
    s.isGenericParam ? "genparam" : "",
    s.constraintName?.toLowerCase() ?? "",
  ];

  if (s.genericTypeParameters) {
    parts.push(
      `gtp:[${s.genericTypeParameters
        .map((p) => p.toLowerCase())
        .sort()
        .join(",")}]`,
    );
  }

  if (s.parameters) {
    parts.push(`params:[${s.parameters.map(serializeParam).join(",")}]`);
  }

  if (s.overloads) {
    parts.push(
      `overloads:[${s.overloads.map((overload) => overload.map(serializeParam).join(",")).join(";")}]`,
    );
  }

  return parts.join("|");
}

export function areSymbolsAPIsEqual(
  oldSyms: readonly SymbolInfo[],
  newSyms: readonly SymbolInfo[],
): boolean {
  if (oldSyms.length !== newSyms.length) return false;

  const oldSerialized = oldSyms.map(serializeSymbolAPI).sort();
  const newSerialized = newSyms.map(serializeSymbolAPI).sort();

  for (let i = 0; i < oldSerialized.length; i++) {
    if (oldSerialized[i] !== newSerialized[i]) {
      return false;
    }
  }
  return true;
}
