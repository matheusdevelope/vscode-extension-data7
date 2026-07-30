import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import type { ProjectMetadata, VirtualFolder, ModuleMetadata } from "./project-metadata";
import { escapeXml } from "../utils/xml-helpers";
import { generateProjectGuid } from "../utils/guid";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { TypeResolver } from "../analysis/type-resolver";
import { collectGenericsContext } from "../analysis/generics-analyzer";
import { detectEnumerable } from "../analysis/enumerable-detector";
import { lookupSystemByName } from "../system-library";
import { readProjectConfig, writeProjectConfig, PROJECT_CONFIG_FILENAME } from "./project-config";
import {
  SugarTranspiler,
  type TranspileContext,
  type SugarDiagnostic,
  type TranspileResult,
} from "./transpiler";
import { SugarRegistry, type SugarEngineOptions } from "./sugar-registry";
import type {
  ClassGenericMethodRequest,
  ExternalGenericTemplate,
  RequestedGenericInstantiation,
} from "./generics";
import { GenericsMonomorphizer } from "./generics";
import type { TypeReference } from "./ast/ast";
import {
  resolveBuildOptimizationOptions,
  minifyData7Text,
  pruneBuildModules,
  uglifyBuildModules,
  type BuildOptimizationOptions,
  type BuildOptimizationOverride,
} from "./optimizer";
import { topologicalSortModulesByNamespaceDependency } from "./module-dependency-order";

function collectOpenTypeParams(templates: readonly ExternalGenericTemplate[]): ReadonlySet<string> {
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
    const lower = typeArg.toLowerCase();
    for (const openParam of openTypeParams) {
      if (new RegExp(`\\b${escapeRegExp(openParam)}\\b`, "i").test(lower)) return true;
    }
    return false;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function qualifyGenericTypeArgument(
  typeArg: string,
  contextFileUri: string,
  indexer: WorkspaceSymbolIndexer,
): string {
  const trimmed = typeArg.trim();
  if (!trimmed || trimmed.includes(".")) return typeArg;
  if (BUILDER_PRIMITIVE_TYPE_NAMES.has(trimmed.toLowerCase())) return typeArg;

  const symbol = indexer.findSymbolByName(trimmed, contextFileUri);
  if (!symbol?.containerName) return typeArg;
  if (symbol.isSyntheticGenericInstantiation) return typeArg;
  if (symbol.kind !== "class" && symbol.kind !== "structure" && symbol.kind !== "delegate") {
    return typeArg;
  }
  return `${symbol.containerName}.${trimmed}`;
}

function qualifyClassGenericTypeReference(
  typeRef: TypeReference,
  indexer: WorkspaceSymbolIndexer,
  contextFileUri?: string,
): TypeReference {
  const qualifiedName = qualifyGenericTypeArgument(typeRef.name, contextFileUri ?? "", indexer);
  return {
    kind: "TypeReference",
    name: qualifiedName,
    typeArguments: typeRef.typeArguments.map((arg) =>
      qualifyClassGenericTypeReference(arg, indexer, contextFileUri),
    ),
  };
}

function qualifyClassGenericMethodRequests(
  requests: readonly ClassGenericMethodRequest[],
  indexer: WorkspaceSymbolIndexer,
): ClassGenericMethodRequest[] {
  return requests.map((request) => ({
    ...request,
    ownerConcreteArgs: request.ownerConcreteArgs.map((typeRef) =>
      qualifyClassGenericTypeReference(typeRef, indexer),
    ),
    methodConcreteArgs: request.methodConcreteArgs.map((typeRef) =>
      qualifyClassGenericTypeReference(typeRef, indexer),
    ),
  }));
}

const BUILDER_PRIMITIVE_TYPE_NAMES = new Set([
  "boolean",
  "byte",
  "currency",
  "date",
  "double",
  "integer",
  "long",
  "single",
  "string",
  "tdatetime",
  "variant",
  "void",
]);

export interface BuildProjectOptions {
  readonly vscodeLoggerFilePath?: string;
  readonly sugarOptions?: SugarEngineOptions;
  readonly genericsEnabled?: boolean;
  readonly optimizationOptions?: BuildOptimizationOptions;
  readonly optimizationOverride?: BuildOptimizationOverride;
  readonly isExcluded?: (filePath: string) => boolean;
  readonly onWarning?: (message: string) => void;
  readonly validateTranspiled?: (
    sources: readonly TranspiledBuildSource[],
    indexer: WorkspaceSymbolIndexer,
  ) => void;
  /**
   * Conjunto de caminhos absolutos dos arquivos `.bas` atualmente abertos no
   * editor. Quando fornecido, apenas os módulos cujo arquivo consta nesse
   * conjunto serão marcados com `<Aberto>true</Aberto>` no XML de saída.
   * Se ausente, o campo `aberto` do `modulesMetadata` existente é preservado
   * (ou `false` para módulos novos).
   */
  readonly openEditorPaths?: ReadonlySet<string>;
}

export interface TranspiledBuildSource {
  readonly fileUri: string;
  readonly code: string;
}

interface CachedTranspileEntry {
  readonly sourceHash: string;
  readonly contextHash: string;
  readonly result: TranspileResult;
}

const transpileCache = new Map<string, CachedTranspileEntry>();

function sha1(text: string): string {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (typeof value === "function" || typeof value === "symbol") {
    return JSON.stringify(String(value));
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function cloneTranspileResult(result: TranspileResult): TranspileResult {
  return {
    code: result.code,
    diagnostics: [...result.diagnostics],
    ...(result.lineMap ? { lineMap: [...result.lineMap] } : {}),
    ...(result.usedSugars ? { usedSugars: new Set(result.usedSugars) } : {}),
  };
}

/**
 * Packages a workspace tree (`src/Principal.bas`, modules under `src/**`, optional
 * `data7_modules/`) into a single `.7Proj` XML container.
 *
 * XML emission goes through {@link escapeXml} (data7_domain.mdc requires escaping
 * `&`, `<`, `>`, `"`, `'`). GUIDs are produced by {@link generateProjectGuid}
 * (`crypto.randomUUID`). Comment stripping reuses {@link DependencyScanner.stripComments}
 * — never re-implement it locally.
 */
export class Builder {
  public static __resetBuildCacheForTests(): void {
    transpileCache.clear();
  }

  private static optimizeCode(
    code: string,
    optimizationOptions: BuildOptimizationOptions,
    stripCommentsEnabled: boolean,
  ): string {
    return minifyData7Text(code, {
      enabled: optimizationOptions.minify.enabled,
      stripComments: stripCommentsEnabled,
      collapseWhitespace: optimizationOptions.minify.collapseWhitespace,
    });
  }

  private static getDirsRecursive(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        results.push(filePath);
        results = results.concat(this.getDirsRecursive(filePath));
      }
    }
    return results;
  }

  /**
   * Case-insensitive identity for virtual-folder relative paths.
   * Windows (and default macOS) treat `src/Modules` and `src/modules` as the
   * same directory; without normalizing, the builder would keep both entries
   * from metadata and then create a second tree from the on-disk casing.
   */
  private static folderPathKey(relPath: string): string {
    if (!relPath || relPath === "." || relPath === "") return "";
    return relPath
      .replace(/[/\\]+/g, "/")
      .replace(/^\/+|\/+$/g, "")
      .toLowerCase();
  }

  /**
   * `.7Proj` module tags and `modulesMetadata` are keyed by the `.bas` basename.
   * Duplicate basenames in different folders silently collapse content (last-write-wins)
   * while still emitting two XML tags — fail fast instead.
   */
  private static assertUniqueModuleBasenames(
    filePaths: readonly string[],
    workspaceDir: string,
  ): void {
    const firstPathByBase = new Map<string, string>();
    for (const filePath of filePaths) {
      const baseName = path.basename(filePath, path.extname(filePath));
      if (baseName.toLowerCase() === "principal") continue;
      const key = baseName.toLowerCase();
      const previous = firstPathByBase.get(key);
      if (previous !== undefined) {
        const relPrevious = path.relative(workspaceDir, previous) || previous;
        const relCurrent = path.relative(workspaceDir, filePath) || filePath;
        throw new Error(
          `Módulo duplicado "${baseName}": o nome do arquivo .bas deve ser único em todo o projeto ` +
            `(é a chave do módulo no .7Proj).\n` +
            `  - ${relPrevious}\n` +
            `  - ${relCurrent}\n` +
            `Renomeie um dos arquivos. Namespaces parciais usam basenames distintos ` +
            `(ex.: mod_entry.1.bas e mod_entry.2.bas) com o mesmo Namespace.`,
        );
      }
      firstPathByBase.set(key, filePath);
    }
  }

  /**
   * Builds a {@link TranspileContext} backed by a detached indexer scoped to
   * THIS build. Using a detached indexer (instead of the extension singleton)
   * guarantees that build-time pre-indexing does not leak into the live
   * `WorkspaceSymbolIndexer.getInstance()` consumed by providers, and that
   * the build sees a deterministic snapshot built only from files actually
   * on disk under `srcDir` + `data7ModulesDir`.
   */
  private static buildTranspileContext(
    srcDir: string,
    data7ModulesDir: string,
    options: BuildProjectOptions,
  ): { transpileCtx: TranspileContext; indexer: WorkspaceSymbolIndexer } {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const isExcluded = options.isExcluded ?? (() => false);
    const onWarning = options.onWarning ?? (() => undefined);
    this.preIndexDirectory(indexer, srcDir, isExcluded, onWarning);
    if (fs.existsSync(data7ModulesDir)) {
      this.preIndexDirectory(indexer, data7ModulesDir, isExcluded, onWarning);
    }
    const genericsEnabled = options.genericsEnabled !== false;
    const externalGenericTemplates = genericsEnabled
      ? this.collectExternalGenericTemplates(indexer)
      : [];
    const requestedGenericInstantiations = genericsEnabled
      ? this.collectRequestedGenericInstantiations(indexer, externalGenericTemplates)
      : [];
    const requestedClassGenericMethods = genericsEnabled
      ? this.collectRequestedClassGenericMethods(
          indexer,
          srcDir,
          externalGenericTemplates,
          requestedGenericInstantiations,
        )
      : [];
    const transpileCtx = {
      detectEnumerable: (typeName: string, preferredElementType?: string) =>
        detectEnumerable(
          typeName,
          (t) => TypeResolver.getAllMembersForType(t, indexer),
          preferredElementType,
        ),
      isTypeDescendantOf: (typeName: string, baseTypeName: string) =>
        TypeResolver.isSubclassOf(typeName, baseTypeName, indexer),
      resolveTypeImport: (typeName: string) => this.resolveTypeImport(typeName, indexer),
      resolveGlobalSymbolType: (name: string, argumentCount: number) =>
        indexer.findSymbolByName(name)?.type ??
        lookupSystemByName(name).find(
          (symbol) =>
            !symbol.containerName &&
            (!symbol.parameters || symbol.parameters.length === argumentCount),
        )?.type,
      resolveMemberType: (typeName: string, name: string, argumentCount: number) =>
        TypeResolver.findMember(typeName, name, indexer, argumentCount)?.type,
      resolveGlobalSignature: (name: string, argumentCount: number) => {
        const symbol =
          indexer.findSymbolByName(name) ??
          lookupSystemByName(name).find(
            (candidate) =>
              !candidate.containerName &&
              (!candidate.parameters || candidate.parameters.length === argumentCount),
          );
        return symbol
          ? {
              type: symbol.type,
              typeParameters: symbol.genericTypeParameters,
              parameters: symbol.parameters?.map((parameter) => ({
                name: parameter.name,
                type: parameter.type,
                isByRef: parameter.isByRef,
              })),
            }
          : undefined;
      },
      resolveMemberSignature: (typeName: string, name: string, argumentCount: number) => {
        const symbol = TypeResolver.findMember(typeName, name, indexer, argumentCount);
        return symbol
          ? {
              type: symbol.type,
              typeParameters: symbol.genericTypeParameters,
              parameters: symbol.parameters?.map((parameter) => ({
                name: parameter.name,
                type: parameter.type,
                isByRef: parameter.isByRef,
              })),
            }
          : undefined;
      },
      resolveDelegateSignature: (delegateType: string) => {
        const name = delegateType.replace(/<.*>$/, "");
        const symbol =
          indexer.getSymbolsByName(name).find((candidate) => candidate.kind === "delegate") ??
          lookupSystemByName(name).find((candidate) => candidate.kind === "delegate");
        return symbol
          ? {
              type: symbol.type,
              typeParameters: symbol.genericTypeParameters,
              parameters: symbol.parameters?.map((parameter) => ({
                name: parameter.name,
                type: parameter.type,
                isByRef: parameter.isByRef,
              })),
            }
          : undefined;
      },
      resolveListElementType: (typeName: string) =>
        TypeResolver.resolveListElementType(typeName, indexer),
      externalGenericTemplates,
      requestedGenericInstantiations,
      requestedClassGenericMethods,
      genericsEnabled,
      sugarOptions: options.sugarOptions,
    };
    return { transpileCtx, indexer };
  }

  private static resolveTypeImport(
    typeName: string,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const trimmed = typeName.trim();
    if (!trimmed) return undefined;

    const simpleName = trimmed.includes(".")
      ? trimmed.substring(trimmed.lastIndexOf(".") + 1)
      : trimmed;
    if (BUILDER_PRIMITIVE_TYPE_NAMES.has(simpleName.toLowerCase())) return undefined;

    const symbol = indexer.findSymbolByName(simpleName);
    if (!symbol) return undefined;
    if (symbol.isSyntheticGenericInstantiation) {
      if (symbol.containerName) return symbol.containerName;
      if (trimmed.includes(".")) return trimmed.substring(0, trimmed.lastIndexOf("."));
      return undefined;
    }
    if (
      symbol.kind !== "class" &&
      symbol.kind !== "structure" &&
      symbol.kind !== "delegate" &&
      symbol.kind !== "namespace"
    ) {
      return undefined;
    }

    if (symbol.containerName) return symbol.containerName;
    if (trimmed.includes(".")) return trimmed.substring(0, trimmed.lastIndexOf("."));
    return undefined;
  }

  private static collectExternalGenericTemplates(
    indexer: WorkspaceSymbolIndexer,
  ): ExternalGenericTemplate[] {
    const templates: ExternalGenericTemplate[] = [];
    const seen = new Set<string>();
    for (const sym of indexer.getAllSymbols()) {
      if (sym.kind !== "class" && sym.kind !== "delegate" && sym.kind !== "method") {
        continue;
      }
      if (!sym.genericTypeParameters || sym.genericTypeParameters.length === 0) continue;
      const key = sym.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      templates.push({ name: sym.name, typeParams: sym.genericTypeParameters });
    }
    return templates;
  }

  private static collectRequestedGenericInstantiations(
    indexer: WorkspaceSymbolIndexer,
    externalGenericTemplates: readonly ExternalGenericTemplate[],
  ): RequestedGenericInstantiation[] {
    const requests: RequestedGenericInstantiation[] = [];
    const seen = new Set<string>();
    const workspaceTemplateNames = new Set(
      externalGenericTemplates.map((template) => template.name.toLowerCase()),
    );
    const openTypeParams = collectOpenTypeParams(externalGenericTemplates);
    const analysisTemplates = externalGenericTemplates.map((template) => ({
      kind: "class" as const,
      name: template.name,
      typeParams: template.typeParams,
      line: 0,
    }));

    for (const fileSyms of indexer.getAllFileSymbols()) {
      const ctx = collectGenericsContext(fileSyms.content, {
        externalTemplates: analysisTemplates,
      });
      for (const usage of ctx.usages) {
        if (!workspaceTemplateNames.has(usage.templateName.toLowerCase())) continue;
        if (hasOpenGenericTypeArgument(usage.typeArgs, openTypeParams)) continue;
        const key = `${usage.templateName.toLowerCase()}<${usage.typeArgs.join(",")}>`;
        if (seen.has(key)) continue;
        seen.add(key);
        const qualifiedTypeArgs = usage.typeArgs.map((typeArg) =>
          qualifyGenericTypeArgument(typeArg, fileSyms.fileUri, indexer),
        );
        requests.push({
          templateName: usage.templateName,
          typeArgs: qualifiedTypeArgs,
          flatTypeArgs: usage.typeArgs,
        });
      }
    }
    return requests;
  }

  private static collectRequestedClassGenericMethods(
    indexer: WorkspaceSymbolIndexer,
    srcDir: string,
    externalGenericTemplates: readonly ExternalGenericTemplate[],
    requestedGenericInstantiations: readonly RequestedGenericInstantiation[],
  ): ClassGenericMethodRequest[] {
    const genericTemplateSources: string[] = [];
    for (const fileSyms of indexer.getAllFileSymbols()) {
      if (/\bClass\s+TTList\s*</i.test(fileSyms.content)) {
        genericTemplateSources.push(fileSyms.content);
      }
    }
    if (genericTemplateSources.length === 0) return [];

    const usageSources: string[] = [];
    const srcDirNormalized = path.resolve(srcDir).toLowerCase();
    for (const fileSyms of indexer.getAllFileSymbols()) {
      let filePath: string;
      try {
        filePath = fileURLToPath(fileSyms.fileUri);
      } catch {
        continue;
      }
      if (!path.resolve(filePath).toLowerCase().startsWith(srcDirNormalized)) continue;
      if (!filePath.toLowerCase().endsWith(".bas")) continue;
      usageSources.push(fileSyms.content);
    }

    return qualifyClassGenericMethodRequests(
      GenericsMonomorphizer.collectWorkspaceClassGenericMethodRequests({
        externalTemplates: externalGenericTemplates,
        requestedInstantiations: requestedGenericInstantiations,
        genericTemplateSources,
        usageSources,
      }),
      indexer,
    );
  }

  private static buildTranspileCacheContextHash(
    ctx: TranspileContext,
    indexer: WorkspaceSymbolIndexer,
  ): string {
    const publicSymbols = indexer
      .getAllSymbols()
      .filter((symbol) => !symbol.isPrivate)
      .map((symbol) => ({
        name: symbol.name,
        kind: symbol.kind,
        type: symbol.type,
        isShared: symbol.isShared,
        isProtected: symbol.isProtected,
        isConst: symbol.isConst,
        isReadOnly: symbol.isReadOnly,
        parameters: symbol.parameters,
        overloads: symbol.overloads,
        genericTypeParameters: symbol.genericTypeParameters,
        isSyntheticGenericInstantiation: symbol.isSyntheticGenericInstantiation,
        containerName: symbol.containerName,
        inheritsFrom: symbol.inheritsFrom,
        constraintName: symbol.constraintName,
        fileUri: symbol.fileUri,
      }))
      .sort((a, b) =>
        `${a.fileUri}:${a.containerName ?? ""}:${a.kind}:${a.name}`.localeCompare(
          `${b.fileUri}:${b.containerName ?? ""}:${b.kind}:${b.name}`,
        ),
      );

    return sha1(
      stableJson({
        genericsEnabled: ctx.genericsEnabled !== false,
        sugarOptions: ctx.sugarOptions,
        externalGenericTemplates: [...(ctx.externalGenericTemplates ?? [])].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        requestedGenericInstantiations: [...(ctx.requestedGenericInstantiations ?? [])].sort(
          (a, b) =>
            `${a.templateName}<${a.typeArgs.join(",")}>`.localeCompare(
              `${b.templateName}<${b.typeArgs.join(",")}>`,
            ),
        ),
        requestedClassGenericMethods: [...(ctx.requestedClassGenericMethods ?? [])].sort((a, b) =>
          `${a.ownerFlatName}.${a.methodFlatName}`.localeCompare(
            `${b.ownerFlatName}.${b.methodFlatName}`,
          ),
        ),
        publicSymbols,
      }),
    );
  }

  private static transpileWithCache(
    fileUri: string,
    code: string,
    ctx: TranspileContext,
    contextHash: string,
  ): TranspileResult {
    const sourceHash = sha1(code);
    const cacheKey = `${fileUri}\0${sourceHash}\0${contextHash}`;
    const cached = transpileCache.get(cacheKey);
    if (cached?.sourceHash === sourceHash && cached.contextHash === contextHash) {
      return cloneTranspileResult(cached.result);
    }

    const result = SugarTranspiler.transpile(code, ctx);
    transpileCache.set(cacheKey, {
      sourceHash,
      contextHash,
      result: cloneTranspileResult(result),
    });
    return result;
  }

  private static preIndexDirectory(
    indexer: WorkspaceSymbolIndexer,
    dir: string,
    isExcluded: (filePath: string) => boolean,
    onWarning: (message: string) => void,
  ): void {
    if (!fs.existsSync(dir)) return;
    // Respect the user's `data7.exclude` patterns just like the live workspace
    // indexer does — otherwise files the user explicitly excluded (legacy
    // backups, generated stubs) would still inform the type resolver during
    // build and surface stale members.
    if (isExcluded(dir)) return;
    const list = fs.readdirSync(dir);
    for (const entry of list) {
      const full = path.join(dir, entry);
      if (isExcluded(full)) continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        this.preIndexDirectory(indexer, full, isExcluded, onWarning);
        continue;
      }
      const ext = path.extname(entry).toLowerCase();
      if (ext !== ".bas" && ext !== ".d7b") continue;
      try {
        const content = fs.readFileSync(full, "utf-8");
        const uri = pathToFileURL(full).toString();
        indexer.updateFileContent(uri, content);
      } catch (err: unknown) {
        onWarning(
          `Falha ao pré-indexar ${full} para o transpilador: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Reports `not-enumerable` diagnostics produced by {@link SugarTranspiler}
   * into the shared OutputChannel. The Builder stays pure (no `vscode.window`
   * UI here) — the editor-visible warning is owned by the linter rule in
   * `src/diagnostics/diagnostics.ts`.
   */
  private static reportSugarDiagnostics(
    fileLabel: string,
    diagnostics: readonly SugarDiagnostic[],
    onWarning: (message: string) => void,
  ): void {
    if (diagnostics.length === 0) return;
    for (const d of diagnostics) {
      onWarning(
        `Transpiler [${fileLabel}:${(d.line + 1).toString()}]: o tipo "${d.typeName}" ` +
          `não expõe o par Count + indexador esperado pelo "For Each".`,
      );
    }
  }

  public static buildProject(
    workspaceDir: string,
    outputFilePath: string,
    _sharedModulesDir?: string,
    options: BuildProjectOptions = {},
  ): string {
    const configPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    const projectConfig = readProjectConfig(configPath);
    if (!projectConfig) {
      throw new Error("Configuração do projeto (data7.json) não encontrada no workspace.");
    }
    // The Builder needs the FULL ProjectMetadata shape (incl. virtualFolders +
    // modulesMetadata) which the narrowed snapshot does not own. Re-cast the
    // raw record for those fields — `narrow()` already validated the root
    // shape and basic fields above, so this cast is safe.
    const metadata = projectConfig.raw as unknown as ProjectMetadata;
    if (!metadata.virtualFolders) {
      metadata.virtualFolders = [];
    }
    if (!metadata.modulesMetadata) {
      metadata.modulesMetadata = {};
    }
    const srcDir = path.join(workspaceDir, "src");
    const data7ModulesDir = path.join(workspaceDir, "data7_modules");

    if (!fs.existsSync(srcDir)) {
      throw new Error("Pasta src/ não encontrada no workspace.");
    }

    const mainCodePath = path.join(srcDir, "Principal.bas");
    if (!fs.existsSync(mainCodePath)) {
      throw new Error("Código principal src/Principal.bas não encontrado.");
    }

    const optimizationOptions =
      options.optimizationOptions ??
      resolveBuildOptimizationOptions(metadata, options.optimizationOverride);
    const stripComments = this.shouldStripComments(metadata, optimizationOptions);
    const { transpileCtx, indexer: buildIndexer } = this.buildTranspileContext(
      srcDir,
      data7ModulesDir,
      options,
    );
    const transpileCacheContextHash = this.buildTranspileCacheContextHash(
      transpileCtx,
      buildIndexer,
    );

    const globalUsedSugars = new Set<string>();

    const getFilesRecursive = (dir: string, ext: string): string[] => {
      let results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          results = results.concat(getFilesRecursive(filePath, ext));
        } else if (path.extname(file).toLowerCase() === ext) {
          results.push(filePath);
        }
      }
      return results;
    };

    const getVirtualRelPath = (relPath: string): string => {
      if (!relPath || relPath === "." || relPath === "") {
        return "";
      }
      const segments = relPath.split(/[/\\]/);
      if (segments.length >= 2 && segments[1] === "src") {
        segments.splice(1, 1);
      }
      return segments.join("/");
    };

    const getPhysicalPath = (virtualRelPath: string, wsDir: string): string => {
      const srcFolder = path.join(wsDir, "src");
      if (virtualRelPath.startsWith("data7_modules") || virtualRelPath === "data7_modules") {
        const segments = virtualRelPath.split(/[/\\]/);
        if (segments.length >= 2) {
          const moduleName = segments[1] ?? "";
          const rest = segments.slice(2);
          const physicalModuleDir = path.join(wsDir, "data7_modules", moduleName);
          if (rest.length > 0) {
            const srcPath = path.join(physicalModuleDir, "src");
            if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
              return path.join(physicalModuleDir, "src", ...rest);
            }
          }
          return physicalModuleDir;
        }
        return path.join(wsDir, virtualRelPath);
      }
      return path.join(srcFolder, virtualRelPath);
    };

    const srcFiles = getFilesRecursive(srcDir, ".bas");
    const dependencyFilesForUniqueness = fs.existsSync(data7ModulesDir)
      ? getFilesRecursive(data7ModulesDir, ".bas")
      : [];
    this.assertUniqueModuleBasenames([...srcFiles, ...dependencyFilesForUniqueness], workspaceDir);

    const localModulesCount = srcFiles.filter(
      (filePath) => path.basename(filePath, ".bas") !== "Principal",
    ).length;

    let dependencyModulesCount = 0;
    if (fs.existsSync(data7ModulesDir)) {
      dependencyModulesCount = getFilesRecursive(data7ModulesDir, ".bas").filter((filePath) => {
        const rawCode = fs.readFileSync(filePath, "utf-8");
        return this.extractDeclaredNamespacesFromCode(rawCode).length > 0;
      }).length;
    }
    const totalModulesCount = localModulesCount + dependencyModulesCount;

    let rootFolder = metadata.virtualFolders.find(
      (f) => !f.pastaId && f.nome.startsWith("Unidades"),
    );
    const rootFolderId = rootFolder ? rootFolder.id : generateProjectGuid();

    const getVirtualFolderRelPath = (folderId: string): string => {
      const folder = metadata.virtualFolders.find((f) => f.id === folderId);
      if (!folder) return "";
      if (!folder.pastaId || folder.id === rootFolderId) return "";

      if (folder.nome === "data7_modules" && folder.pastaId === rootFolderId) {
        return "data7_modules";
      }

      const parentPath = getVirtualFolderRelPath(folder.pastaId);
      const sanitizedName = folder.nome.replace(/[\\/:*?"<>|]/g, "_");
      return parentPath ? path.join(parentPath, sanitizedName) : sanitizedName;
    };

    const activeFolders = metadata.virtualFolders.filter((folder) => {
      if (!folder.pastaId || folder.id === rootFolderId) return true;
      if (folder.nome === "data7_modules" && folder.pastaId === rootFolderId) {
        return fs.existsSync(data7ModulesDir);
      }
      const relPath = getVirtualFolderRelPath(folder.id);
      const physicalPath = getPhysicalPath(relPath, workspaceDir);
      return fs.existsSync(physicalPath) && fs.statSync(physicalPath).isDirectory();
    });

    const virtualFolders = [...activeFolders];
    if (!rootFolder) {
      rootFolder = {
        nome: `Unidades (${totalModulesCount})`,
        id: rootFolderId,
        pastaId: "",
        aberta: "Sim",
      };
      virtualFolders.push(rootFolder);
    } else {
      const idx = virtualFolders.findIndex((f) => f.id === rootFolderId);
      const found = idx !== -1 ? virtualFolders[idx] : undefined;
      if (found) {
        found.nome = `Unidades (${totalModulesCount})`;
      } else {
        rootFolder.nome = `Unidades (${totalModulesCount})`;
        virtualFolders.push(rootFolder);
      }
    }

    let data7ModulesFolderId: string | undefined;
    if (fs.existsSync(data7ModulesDir)) {
      const data7ModulesFolder = virtualFolders.find(
        (f) => f.nome === "data7_modules" && f.pastaId === rootFolderId,
      );
      data7ModulesFolderId = data7ModulesFolder?.id;
      if (!data7ModulesFolderId) {
        data7ModulesFolderId = generateProjectGuid();
        virtualFolders.push({
          nome: "data7_modules",
          id: data7ModulesFolderId,
          pastaId: rootFolderId,
          aberta: "Nao",
        });
      }
    }

    const physicalDirs = this.getDirsRecursive(srcDir);
    // Keys are normalized with folderPathKey() so Windows case variants collide.
    const foldersByPath = new Map<string, string>();
    const folderRelPathById = new Map<string, string>();

    const buildPathMap = (folderId: string): string => {
      const cached = folderRelPathById.get(folderId);
      if (cached !== undefined) return cached;
      const folder = virtualFolders.find((f) => f.id === folderId);
      if (!folder) return "";
      if (folder.id === rootFolderId) {
        foldersByPath.set("", folder.id);
        folderRelPathById.set(folder.id, "");
        return "";
      }
      const parentPath = buildPathMap(folder.pastaId);
      const sanitizedName = folder.nome.replace(/[\\/:*?"<>|]/g, "_");
      const fullPath = parentPath ? path.join(parentPath, sanitizedName) : sanitizedName;
      const key = this.folderPathKey(fullPath);
      // Prefer the first folder that claims a path; later case-variants are dropped below.
      if (!foldersByPath.has(key)) {
        foldersByPath.set(key, folder.id);
      }
      folderRelPathById.set(folder.id, fullPath);
      return fullPath;
    };
    virtualFolders.forEach((f) => buildPathMap(f.id));

    // Collapse case-variant duplicates left over from earlier builds / renames
    // (e.g. metadata "modules" + on-disk "Modules" both surviving existsSync).
    const discardedFolderIds = new Set<string>();
    const folderIdRemap = new Map<string, string>();
    for (const folder of virtualFolders) {
      if (folder.id === rootFolderId) continue;
      const relPath = folderRelPathById.get(folder.id) ?? buildPathMap(folder.id);
      const key = this.folderPathKey(relPath);
      const keptId = foldersByPath.get(key);
      if (keptId && keptId !== folder.id) {
        discardedFolderIds.add(folder.id);
        folderIdRemap.set(folder.id, keptId);
      }
    }
    if (discardedFolderIds.size > 0) {
      for (const folder of virtualFolders) {
        const remappedParent = folderIdRemap.get(folder.pastaId);
        if (remappedParent) {
          folder.pastaId = remappedParent;
        }
      }
      for (let i = virtualFolders.length - 1; i >= 0; i--) {
        const folder = virtualFolders[i];
        if (folder && discardedFolderIds.has(folder.id)) {
          virtualFolders.splice(i, 1);
          folderRelPathById.delete(folder.id);
        }
      }
    }

    const resolveFolderId = (relPath: string, fallbackId: string): string =>
      foldersByPath.get(this.folderPathKey(relPath)) ?? fallbackId;

    physicalDirs.forEach((dir) => {
      const relPath = path.relative(srcDir, dir);
      const key = this.folderPathKey(relPath);
      const existingId = foldersByPath.get(key);
      if (existingId) {
        const existing = virtualFolders.find((f) => f.id === existingId);
        if (existing) {
          // Sync display name to the casing reported by the filesystem.
          existing.nome = path.basename(relPath);
          folderRelPathById.set(existingId, relPath);
        }
        return;
      }

      const parentDir = path.dirname(relPath);
      let parentId = rootFolderId;
      if (parentDir !== "." && parentDir !== "") {
        parentId = resolveFolderId(parentDir, rootFolderId);
      }

      const newId = generateProjectGuid();
      const folderName = path.basename(relPath);
      virtualFolders.push({ nome: folderName, id: newId, pastaId: parentId, aberta: "Nao" });
      foldersByPath.set(key, newId);
      folderRelPathById.set(newId, relPath);
    });

    if (fs.existsSync(data7ModulesDir) && data7ModulesFolderId) {
      const depDirs = this.getDirsRecursive(data7ModulesDir);
      depDirs.forEach((dir) => {
        const relPath = path.relative(data7ModulesDir, dir);
        const virtualRelPath = getVirtualRelPath(relPath);
        const fullRelPath = path.join("data7_modules", virtualRelPath);
        const key = this.folderPathKey(fullRelPath);
        const existingId = foldersByPath.get(key);
        if (existingId) {
          const existing = virtualFolders.find((f) => f.id === existingId);
          if (existing && virtualRelPath) {
            existing.nome = path.basename(virtualRelPath);
            folderRelPathById.set(existingId, fullRelPath);
          }
          return;
        }

        const parentDir = path.dirname(fullRelPath);
        let parentId = data7ModulesFolderId;
        if (parentDir !== "data7_modules" && parentDir !== "") {
          parentId = resolveFolderId(parentDir, data7ModulesFolderId);
        }

        const newId = generateProjectGuid();
        const folderName = path.basename(virtualRelPath);
        virtualFolders.push({ nome: folderName, id: newId, pastaId: parentId, aberta: "Nao" });
        foldersByPath.set(key, newId);
        folderRelPathById.set(newId, fullRelPath);
      });
    }

    // 1. Transpile all code to collect used sugars
    const mainCodeRaw = fs.readFileSync(mainCodePath, "utf-8");
    const mainUri = pathToFileURL(mainCodePath).toString();
    const mainTranspiledRaw = this.transpileWithCache(
      mainUri,
      mainCodeRaw,
      transpileCtx,
      transpileCacheContextHash,
    );
    const mainTranspiled: TranspileResult = {
      ...mainTranspiledRaw,
      code: this.injectRuntimeLoggerConfig(mainTranspiledRaw.code, options.vscodeLoggerFilePath),
    };
    if (mainTranspiled.usedSugars) {
      for (const s of mainTranspiled.usedSugars) globalUsedSugars.add(s);
    }

    interface TranspiledModule {
      name: string;
      fileUri: string;
      code: string;
      diagnostics: readonly SugarDiagnostic[];
      folderId: string;
      aberto: boolean;
      ordemAbertura: number;
    }
    const transpiledSrcModules: TranspiledModule[] = [];

    srcFiles.forEach((filePath) => {
      const filename = path.basename(filePath, ".bas");
      if (filename === "Principal") return;

      const relFileDir = path.relative(srcDir, path.dirname(filePath));
      const folderId = relFileDir ? resolveFolderId(relFileDir, rootFolderId) : rootFolderId;
      const rawCode = fs.readFileSync(filePath, "utf-8");
      const fileUri = pathToFileURL(filePath).toString();
      const transpiled = this.transpileWithCache(
        fileUri,
        rawCode,
        transpileCtx,
        transpileCacheContextHash,
      );
      if (transpiled.usedSugars) {
        for (const s of transpiled.usedSugars) globalUsedSugars.add(s);
      }

      const modulesMetadata = metadata.modulesMetadata as
        | Record<string, ModuleMetadata>
        | undefined;
      const existingMeta = modulesMetadata?.[filename];
      // When the caller provides the set of open editor paths, use it as the
      // source of truth for `aberto`. Normalize to lower-case for a
      // case-insensitive comparison that works correctly on Windows where
      // `vscode.Uri.fsPath` and `path.join` may differ in drive-letter casing.
      const normalizedFilePath = path.normalize(filePath).toLowerCase();
      const resolvedAberto =
        options.openEditorPaths != null
          ? options.openEditorPaths.has(normalizedFilePath)
          : (existingMeta?.aberto ?? false);
      const meta = existingMeta ?? {
        nome: filename,
        aberto: resolvedAberto,
        ordemAbertura: 0,
        pastaId: folderId,
      };

      transpiledSrcModules.push({
        name: filename,
        fileUri,
        code: transpiled.code,
        diagnostics: transpiled.diagnostics,
        folderId,
        aberto: resolvedAberto,
        ordemAbertura: meta.ordemAbertura,
      });
    });

    const transpiledDepModules: {
      name: string;
      fileUri: string;
      code: string;
      diagnostics: readonly SugarDiagnostic[];
      folderId: string;
    }[] = [];

    if (fs.existsSync(data7ModulesDir) && data7ModulesFolderId) {
      const dependencyFiles = getFilesRecursive(data7ModulesDir, ".bas");
      if (dependencyFiles.length > 0) {
        dependencyFiles.forEach((filePath) => {
          const filename = path.basename(filePath, ".bas");
          const fileDir = path.dirname(filePath);
          const relFileDir = path.relative(data7ModulesDir, fileDir);
          const virtualRelDir = getVirtualRelPath(relFileDir);
          const virtualPath = virtualRelDir
            ? path.join("data7_modules", virtualRelDir)
            : "data7_modules";
          const folderId = resolveFolderId(virtualPath, data7ModulesFolderId!);

          let rawCode = fs.readFileSync(filePath, "utf-8");

          const declaredNamespaces = this.extractDeclaredNamespacesFromCode(rawCode);
          if (declaredNamespaces.length === 0) {
            return;
          }

          if (!rawCode.toLowerCase().includes("@module-imported")) {
            if (rawCode.toLowerCase().includes("@module")) {
              rawCode = rawCode.replace(/@module/i, "@Module-Imported");
            } else {
              rawCode = `'@Module-Imported\r\n` + rawCode;
            }
          }

          const fileUri = pathToFileURL(filePath).toString();
          const transpiled = this.transpileWithCache(
            fileUri,
            rawCode,
            transpileCtx,
            transpileCacheContextHash,
          );
          if (transpiled.usedSugars) {
            for (const s of transpiled.usedSugars) globalUsedSugars.add(s);
          }
          transpiledDepModules.push({
            name: filename,
            fileUri,
            code: transpiled.code,
            diagnostics: transpiled.diagnostics,
            folderId,
          });
        });
      }
    }

    // 2. Resolve transitive sugar dependencies and their utility modules.
    const resolvedSugars = SugarRegistry.resolveDependencies(globalUsedSugars);
    const resolvedSugarUtilities = SugarRegistry.getUtilityModules(resolvedSugars);

    // 3. Prepare virtual sugar modules and the build compile list.
    interface ModuleData {
      name: string;
      code: string;
      folderId: string;
      aberto: boolean;
      ordemAbertura: number;
    }
    interface VirtualSugarModule {
      name: string;
      fileUri: string;
      code: string;
      folderId: string;
    }
    const modulesToCompile: ModuleData[] = [];
    const newModulesMetadata: Record<string, ModuleMetadata> = {};
    const virtualSugarModules: VirtualSugarModule[] = [];

    for (const utility of resolvedSugarUtilities) {
      const virtualSugarCode = utility.generateCode();
      const virtualSugarUri = `file:///synthetic/${utility.namespace}.bas`;
      virtualSugarModules.push({
        name: utility.namespace,
        fileUri: virtualSugarUri,
        code: virtualSugarCode,
        folderId: rootFolderId,
      });
    }

    const onWarning = options.onWarning ?? (() => undefined);

    const codeByModuleName = new Map<string, string>();
    const excludedPrunedModules = new Set<string>();
    codeByModuleName.set("Principal", mainTranspiled.code);
    for (const m of virtualSugarModules) codeByModuleName.set(m.name, m.code);
    for (const m of transpiledSrcModules) codeByModuleName.set(m.name, m.code);
    for (const m of transpiledDepModules) codeByModuleName.set(m.name, m.code);

    const optimizationModuleInputs = (): {
      readonly moduleName: string;
      readonly fileUri: string;
      readonly code: string;
    }[] => [
      {
        moduleName: "Principal",
        fileUri: mainUri,
        code: codeByModuleName.get("Principal") ?? mainTranspiled.code,
      },
      ...virtualSugarModules.map((m) => ({
        moduleName: m.name,
        fileUri: m.fileUri,
        code: codeByModuleName.get(m.name) ?? m.code,
      })),
      ...transpiledSrcModules.map((m) => ({
        moduleName: m.name,
        fileUri: m.fileUri,
        code: codeByModuleName.get(m.name) ?? m.code,
      })),
      ...transpiledDepModules.map((m) => ({
        moduleName: m.name,
        fileUri: m.fileUri,
        code: codeByModuleName.get(m.name) ?? m.code,
      })),
    ];

    if (optimizationOptions.prune.enabled) {
      const pruned = pruneBuildModules(optimizationModuleInputs(), optimizationOptions.prune);
      for (const [moduleName, code] of pruned.modules) {
        codeByModuleName.set(moduleName, code);
      }
      for (const moduleName of pruned.excludedModuleNames) {
        excludedPrunedModules.add(moduleName);
        codeByModuleName.delete(moduleName);
      }
      if (pruned.report && pruned.report.warnings.length > 0) {
        for (const warning of pruned.report.warnings) {
          onWarning(warning);
        }
      }
      if (pruned.report && optimizationOptions.prune.report) {
        onWarning(
          `Prune: ${pruned.report.liveNamespaces.length} namespace(s) kept, ${pruned.report.excludedNamespaces.length} removed, ${pruned.report.excludedModules.length} module(s) dropped.`,
        );
      }
    }

    const pruneActive = optimizationOptions.prune.enabled;
    const moduleCode = (moduleName: string, fallback: string): string | undefined => {
      if (pruneActive && excludedPrunedModules.has(moduleName)) {
        return undefined;
      }
      const resolved = codeByModuleName.get(moduleName);
      if (resolved !== undefined) {
        return resolved;
      }
      if (pruneActive && moduleName.toLowerCase() !== "principal") {
        return undefined;
      }
      return fallback;
    };

    virtualSugarModules.forEach((m) => {
      buildIndexer.updateFileContent(m.fileUri, moduleCode(m.name, m.code) ?? "");
    });
    buildIndexer.updateFileContent(
      mainUri,
      moduleCode("Principal", mainTranspiled.code) ?? mainTranspiled.code,
    );
    transpiledSrcModules.forEach((m) => {
      buildIndexer.updateFileContent(m.fileUri, moduleCode(m.name, m.code) ?? "");
    });
    transpiledDepModules.forEach((m) => {
      buildIndexer.updateFileContent(m.fileUri, moduleCode(m.name, m.code) ?? "");
    });

    options.validateTranspiled?.(
      [
        {
          fileUri: mainUri,
          code: moduleCode("Principal", mainTranspiled.code) ?? mainTranspiled.code,
        },
        ...transpiledSrcModules
          .map((m) => ({ ...m, code: moduleCode(m.name, m.code) }))
          .filter((m): m is typeof m & { code: string } => m.code !== undefined),
        ...transpiledDepModules
          .map((m) => ({ ...m, code: moduleCode(m.name, m.code) }))
          .filter((m): m is typeof m & { code: string } => m.code !== undefined),
      ],
      buildIndexer,
    );

    // 4. Report transpilation diagnostics and optimize/add to compile list
    //    Order: prune (above) → minify → uglify
    this.reportSugarDiagnostics("Principal.bas", mainTranspiled.diagnostics, onWarning);
    let mainCode = this.optimizeCode(
      moduleCode("Principal", mainTranspiled.code) ?? mainTranspiled.code,
      optimizationOptions,
      stripComments,
    );

    virtualSugarModules.forEach((m) => {
      if (excludedPrunedModules.has(m.name)) return;
      const code = moduleCode(m.name, m.code);
      if (!code) return;
      modulesToCompile.push({
        name: m.name,
        code: this.optimizeCode(code, optimizationOptions, stripComments),
        folderId: m.folderId,
        aberto: false,
        ordemAbertura: 0,
      });
    });

    transpiledSrcModules.forEach((m) => {
      if (excludedPrunedModules.has(m.name)) return;
      this.reportSugarDiagnostics(`${m.name}.bas`, m.diagnostics, onWarning);
      const code = moduleCode(m.name, m.code);
      if (!code) return;
      const optimized = this.optimizeCode(code, optimizationOptions, stripComments);

      newModulesMetadata[m.name] = {
        nome: m.name,
        aberto: m.aberto,
        ordemAbertura: m.ordemAbertura,
        pastaId: m.folderId,
      };

      modulesToCompile.push({
        name: m.name,
        code: optimized,
        folderId: m.folderId,
        aberto: m.aberto,
        ordemAbertura: m.ordemAbertura,
      });
    });

    transpiledDepModules.forEach((m) => {
      if (excludedPrunedModules.has(m.name)) return;
      this.reportSugarDiagnostics(`data7_modules/${m.name}.bas`, m.diagnostics, onWarning);
      const code = moduleCode(m.name, m.code);
      if (!code) return;

      modulesToCompile.push({
        name: m.name,
        code: this.optimizeCode(code, optimizationOptions, stripComments),
        folderId: m.folderId,
        aberto: false,
        ordemAbertura: 0,
      });
    });

    if (optimizationOptions.uglify.enabled) {
      const uglifyInputs = [
        { moduleName: "Principal", fileUri: mainUri, code: mainCode },
        ...modulesToCompile.map((m) => ({
          moduleName: m.name,
          fileUri: m.name,
          code: m.code,
        })),
      ];
      const uglified = uglifyBuildModules(uglifyInputs, optimizationOptions.uglify);
      mainCode = uglified.modules.get("Principal") ?? mainCode;
      for (const module of modulesToCompile) {
        const next = uglified.modules.get(module.name);
        if (next !== undefined) {
          module.code = next;
        }
      }
    }
    // Order virtual folders: root first, data7_modules folder next, then the rest.
    const orderedFolders: VirtualFolder[] = [];
    const root = virtualFolders.find((f) => f.id === rootFolderId);
    if (root) orderedFolders.push(root);
    const d7Modules = virtualFolders.find(
      (f) => f.nome === "data7_modules" && f.pastaId === rootFolderId,
    );
    if (d7Modules) orderedFolders.push(d7Modules);
    virtualFolders.forEach((f) => {
      if (f.id !== rootFolderId && !(f.nome === "data7_modules" && f.pastaId === rootFolderId)) {
        orderedFolders.push(f);
      }
    });

    const sortedModulesToCompile = topologicalSortModulesByNamespaceDependency(
      modulesToCompile,
      onWarning,
    );
    const xml = this.assembleXml(metadata, mainCode, orderedFolders, sortedModulesToCompile);

    const outputDir = path.dirname(outputFilePath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputFilePath, xml, "utf-8");

    metadata.virtualFolders = orderedFolders;
    metadata.modulesMetadata = newModulesMetadata;
    writeProjectConfig(configPath, metadata);

    return outputFilePath;
  }

  private static injectRuntimeLoggerConfig(code: string, vscodeLoggerFilePath?: string): string {
    if (!vscodeLoggerFilePath) return code;

    const eol = code.includes("\r\n") ? "\r\n" : "\n";
    const lines = code.split(/\r?\n/);
    let insertIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      if (/^\s*Imports\b/i.test(lines[i] ?? "")) {
        insertIdx = i + 1;
      }
    }

    const escapedPath = vscodeLoggerFilePath.replace(/"/g, '""');
    const injected: string[] = [`mod_logger.ConfigureVSCode("${escapedPath}")`];

    lines.splice(insertIdx, 0, ...injected);
    return lines.join(eol);
  }

  private static shouldStripComments(
    metadata: ProjectMetadata,
    optimizationOptions: BuildOptimizationOptions,
  ): boolean {
    if (optimizationOptions.minify.enabled) {
      return optimizationOptions.minify.stripComments;
    }
    return (
      metadata.build?.optimization?.minify === undefined && metadata.opcoes.stripComments === true
    );
  }

  /**
   * Extracts namespace names imported via `Imports <Name>` statements from
   * already-transpiled Data7 code. This is intentionally a lightweight regex
   * over trivia-level import directives — at this stage the code is transpiled
   * output and `Imports` is structurally unambiguous at the file level.
   */
  /**
   * Extracts namespace names declared via `Namespace <Name>` at the top level
   * of already-transpiled Data7 code.
   */
  private static extractDeclaredNamespacesFromCode(code: string): string[] {
    const namespaces: string[] = [];
    for (const line of code.split(/\r?\n/)) {
      const match = /^\s*Namespace\s+(\S+)/i.exec(line);
      if (match?.[1]) {
        namespaces.push(match[1].trim());
      }
    }
    return namespaces;
  }

  /**
   * Assembles the final XML using {@link escapeXml} for every interpolated text node.
   * Kept as a single method so all escaping decisions live in one place.
   */
  private static assembleXml(
    metadata: ProjectMetadata,
    mainCode: string,
    orderedFolders: VirtualFolder[],
    modulesToCompile: {
      name: string;
      code: string;
      folderId: string;
      aberto: boolean;
      ordemAbertura: number;
    }[],
  ): string {
    const parts: string[] = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>');
    parts.push(
      `<Projeto_Data7 xmlns="http://www.se7esistemas.com.br/developer/2024" Version="${escapeXml(metadata.version)}" Language="${escapeXml(metadata.language)}" Type="Plugin" TargetPlataform="${escapeXml(metadata.targetPlatform)}">`,
    );
    parts.push("  <Opcoes>");
    parts.push(`    <Autor>${escapeXml(metadata.opcoes.autor)}</Autor>`);
    parts.push(`    <Versao>${escapeXml(metadata.opcoes.versao)}</Versao>`);
    parts.push(`    <Informacoes>${escapeXml(metadata.opcoes.informacoes)}</Informacoes>`);
    parts.push(`    <CodEmpresa>${metadata.opcoes.codEmpresa}</CodEmpresa>`);
    parts.push(`    <CodFilial>${metadata.opcoes.codFilial}</CodFilial>`);
    parts.push(`    <NomeUsuario>${escapeXml(metadata.opcoes.nomeUsuario)}</NomeUsuario>`);
    parts.push(`    <PreScript>${escapeXml(metadata.opcoes.preScript)}</PreScript>`);
    parts.push(
      `    <IdentificacaoBancoDados>${escapeXml(metadata.opcoes.identificacaoBancoDados)}</IdentificacaoBancoDados>`,
    );
    parts.push("  </Opcoes>");
    parts.push("  <Nome>Principal</Nome>");
    // ISO-8601 timestamp keeps round-trips deterministic across locales.
    parts.push(`  <Data>${new Date().toISOString()}</Data>`);
    parts.push(`  <Codigo>${escapeXml(mainCode)}</Codigo>`);
    parts.push("  <Aberto>true</Aberto>");
    parts.push("  <OrdemAbertura>0</OrdemAbertura>");
    parts.push("  <ItemAberto>0</ItemAberto>");

    parts.push("  <Pastas>");
    for (const f of orderedFolders) {
      parts.push("    <Pasta>");
      parts.push(`      <Nome>${escapeXml(f.nome)}</Nome>`);
      parts.push(`      <ID>${escapeXml(f.id)}</ID>`);
      parts.push(`      <PastaID>${escapeXml(f.pastaId)}</PastaID>`);
      parts.push(`      <Aberta>${escapeXml(f.aberta)}</Aberta>`);
      parts.push("    </Pasta>");
    }
    parts.push("  </Pastas>");

    parts.push("  <Modulos>");
    for (const m of modulesToCompile) {
      // Module tag names come from filenames (Principal.bas + siblings); they are
      // restricted to identifier characters at the source, so no escape is needed.
      parts.push(`    <${m.name}>`);
      parts.push(`      <Codigo>${escapeXml(m.code)}</Codigo>`);
      parts.push(`      <Aberto>${m.aberto}</Aberto>`);
      parts.push(`      <OrdemAbertura>${m.ordemAbertura}</OrdemAbertura>`);
      parts.push(`      <PastaID>${escapeXml(m.folderId)}</PastaID>`);
      parts.push(`    </${m.name}>`);
    }
    parts.push("  </Modulos>");
    parts.push("</Projeto_Data7>");

    return parts.join("\n") + "\n";
  }
}

// Re-export shared metadata types for callers that previously imported from `builder.ts`.
export type { ProjectMetadata, VirtualFolder, ModuleMetadata } from "./project-metadata";
