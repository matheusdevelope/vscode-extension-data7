import * as fs from "fs";
import * as path from "path";
import type { ProjectMetadata, VirtualFolder, ModuleMetadata } from "./project-metadata";
import { escapeXml } from "../utils/xml-helpers";
import { generateProjectGuid } from "../utils/guid";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { TypeResolver } from "../analysis/type-resolver";
import { collectGenericsContext } from "../analysis/generics-analyzer";
import { detectEnumerable } from "../analysis/enumerable-detector";
import { isExcluded } from "../infra/configuration";
import { PROJECT_CONFIG_FILENAME } from "../infra/constants";
import { logger } from "../infra/logger";
import * as vscode from "vscode";
import { DiagnosticsLinter } from "../diagnostics/diagnostics";
import { readProjectConfig, writeProjectConfig } from "./project-config";
import { SugarTranspiler, type TranspileContext, type SugarDiagnostic } from "./transpiler";
import { SugarRegistry } from "./sugar-registry";
import type { ExternalGenericTemplate, RequestedGenericInstantiation } from "./generics";

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
  return typeArgs.some((typeArg) => openTypeParams.has(typeArg.toLowerCase()));
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
  private static optimizeCode(
    code: string,
    minifyEnabled: boolean,
    stripCommentsEnabled: boolean,
  ): string {
    if (!minifyEnabled && !stripCommentsEnabled) {
      return code;
    }

    const lines = code.split(/\r?\n/);
    const resultLines: string[] = [];

    for (const lineText of lines) {
      let cleanLine = lineText;

      if (stripCommentsEnabled) {
        // Reuse the shared comment-stripper (data7_domain.mdc).
        cleanLine = DependencyScanner.stripComments(lineText);
      }

      if (minifyEnabled) {
        const trimmed = cleanLine.trim();
        if (!trimmed) continue;

        let compressed = "";
        let inString = false;
        let i = 0;
        while (i < trimmed.length) {
          // `i < trimmed.length` guarantees `trimmed[i]` is defined; the
          // explicit fallback satisfies `noUncheckedIndexedAccess`.
          const char = trimmed[i] ?? "";
          if (char === '"') {
            inString = !inString;
            compressed += char;
            i++;
          } else if (inString) {
            compressed += char;
            i++;
          } else if (/\s/.test(char)) {
            compressed += " ";
            while (i < trimmed.length && /\s/.test(trimmed[i] ?? "")) {
              i++;
            }
          } else {
            compressed += char;
            i++;
          }
        }
        resultLines.push(compressed);
      } else {
        const trimmed = cleanLine.trim();
        if (!trimmed && cleanLine.length > 0) continue;
        resultLines.push(cleanLine);
      }
    }

    return resultLines.join("\r\n");
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
  ): { transpileCtx: TranspileContext; indexer: WorkspaceSymbolIndexer } {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    this.preIndexDirectory(indexer, srcDir);
    if (fs.existsSync(data7ModulesDir)) {
      this.preIndexDirectory(indexer, data7ModulesDir);
    }
    // Read the experimental feature flag once per build. Falls back to
    // `false` when running outside the VS Code extension host (e.g. in
    // unit tests where `vscode.workspace.getConfiguration` is mocked).
    const externalGenericTemplates = this.collectExternalGenericTemplates(indexer);
    const requestedGenericInstantiations = this.collectRequestedGenericInstantiations(
      indexer,
      externalGenericTemplates,
    );
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
      externalGenericTemplates,
      requestedGenericInstantiations,
    };
    return { transpileCtx, indexer };
  }

  private static resolveTypeImport(
    typeName: string,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const trimmed = typeName.trim();
    if (!trimmed) return undefined;

    const simpleName = trimmed.includes(".") ? trimmed.substring(trimmed.lastIndexOf(".") + 1) : trimmed;
    if (BUILDER_PRIMITIVE_TYPE_NAMES.has(simpleName.toLowerCase())) return undefined;

    const symbol = indexer.findSymbolByName(simpleName);
    if (!symbol) return undefined;
    if (symbol.isSyntheticGenericInstantiation) return undefined;
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
        requests.push({
          templateName: usage.templateName,
          typeArgs: usage.typeArgs,
        });
      }
    }
    return requests;
  }

  private static preIndexDirectory(indexer: WorkspaceSymbolIndexer, dir: string): void {
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
        this.preIndexDirectory(indexer, full);
        continue;
      }
      const ext = path.extname(entry).toLowerCase();
      if (ext !== ".bas" && ext !== ".d7b") continue;
      try {
        const content = fs.readFileSync(full, "utf-8");
        // File URIs use the `file://` scheme so `SymbolParser.parseBasFile`
        // (which calls `vscode.Uri.parse(...).fsPath`) is happy.
        const uri = vscode.Uri.file(full).toString();
        indexer.updateFileContent(uri, content);
      } catch (err: unknown) {
        logger.warn(
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
  ): void {
    if (diagnostics.length === 0) return;
    for (const d of diagnostics) {
      logger.warn(
        `Transpiler [${fileLabel}:${(d.line + 1).toString()}]: o tipo "${d.typeName}" ` +
          `não expõe o par Count + indexador esperado pelo "For Each".`,
      );
    }
  }

  public static buildProject(
    workspaceDir: string,
    outputFilePath: string,
    _sharedModulesDir?: string,
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
    const srcDir = path.join(workspaceDir, "src");
    const data7ModulesDir = path.join(workspaceDir, "data7_modules");

    if (!fs.existsSync(srcDir)) {
      throw new Error("Pasta src/ não encontrada no workspace.");
    }

    const mainCodePath = path.join(srcDir, "Principal.bas");
    if (!fs.existsSync(mainCodePath)) {
      throw new Error("Código principal src/Principal.bas não encontrado.");
    }

    const minify = !!metadata.opcoes.minify;
    const stripComments = !!metadata.opcoes.stripComments;
    const { transpileCtx, indexer: buildIndexer } = this.buildTranspileContext(
      srcDir,
      data7ModulesDir,
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

    const srcFiles = getFilesRecursive(srcDir, ".bas");
    const localModulesCount = srcFiles.filter(
      (filePath) => path.basename(filePath, ".bas") !== "Principal",
    ).length;

    let dependencyModulesCount = 0;
    if (fs.existsSync(data7ModulesDir)) {
      dependencyModulesCount = fs
        .readdirSync(data7ModulesDir)
        .filter((f) => f.endsWith(".bas")).length;
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
      const physicalPath = path.join(srcDir, relPath);
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

    const physicalDirs = this.getDirsRecursive(srcDir);
    const foldersByPath = new Map<string, string>();

    const buildPathMap = (folderId: string): string => {
      const folder = virtualFolders.find((f) => f.id === folderId);
      if (!folder) return "";
      if (folder.id === rootFolderId) {
        foldersByPath.set("", folder.id);
        return "";
      }
      const parentPath = buildPathMap(folder.pastaId);
      const sanitizedName = folder.nome.replace(/[\\/:*?"<>|]/g, "_");
      const fullPath = parentPath ? path.join(parentPath, sanitizedName) : sanitizedName;
      foldersByPath.set(fullPath, folder.id);
      return fullPath;
    };
    virtualFolders.forEach((f) => buildPathMap(f.id));

    physicalDirs.forEach((dir) => {
      const relPath = path.relative(srcDir, dir);
      if (foldersByPath.has(relPath)) return;

      const parentDir = path.dirname(relPath);
      let parentId = rootFolderId;
      if (parentDir !== "." && parentDir !== "") {
        parentId = foldersByPath.get(parentDir) ?? rootFolderId;
      }

      const newId = generateProjectGuid();
      const folderName = path.basename(relPath);
      virtualFolders.push({ nome: folderName, id: newId, pastaId: parentId, aberta: "Sim" });
      foldersByPath.set(relPath, newId);
    });

    // 1. Transpile all code to collect used sugars
    const mainCodeRaw = fs.readFileSync(mainCodePath, "utf-8");
    const mainTranspiled = SugarTranspiler.transpile(mainCodeRaw, transpileCtx);
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
      const folderId = relFileDir ? (foldersByPath.get(relFileDir) ?? rootFolderId) : rootFolderId;
      const rawCode = fs.readFileSync(filePath, "utf-8");
      const transpiled = SugarTranspiler.transpile(rawCode, transpileCtx);
      if (transpiled.usedSugars) {
        for (const s of transpiled.usedSugars) globalUsedSugars.add(s);
      }

      const meta = metadata.modulesMetadata[filename] ?? {
        nome: filename,
        aberto: true,
        ordemAbertura: 0,
        pastaId: folderId,
      };

      transpiledSrcModules.push({
        name: filename,
        fileUri: vscode.Uri.file(filePath).toString(),
        code: transpiled.code,
        diagnostics: transpiled.diagnostics,
        folderId,
        aberto: meta.aberto,
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
    let data7ModulesFolderId: string | undefined;

    if (fs.existsSync(data7ModulesDir)) {
      const dependencyFiles = fs.readdirSync(data7ModulesDir).filter((f) => f.endsWith(".bas"));
      if (dependencyFiles.length > 0) {
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

        dependencyFiles.forEach((file) => {
          const filename = path.basename(file, ".bas");
          let rawCode = fs.readFileSync(path.join(data7ModulesDir, file), "utf-8");

          if (!rawCode.toLowerCase().includes("@module-imported")) {
            if (rawCode.toLowerCase().includes("@module")) {
              rawCode = rawCode.replace(/@module/i, "@Module-Imported");
            } else {
              rawCode = `'@Module-Imported\r\n` + rawCode;
            }
          }

          const transpiled = SugarTranspiler.transpile(rawCode, transpileCtx);
          if (transpiled.usedSugars) {
            for (const s of transpiled.usedSugars) globalUsedSugars.add(s);
          }
          transpiledDepModules.push({
            name: filename,
            fileUri: vscode.Uri.file(path.join(data7ModulesDir, file)).toString(),
            code: transpiled.code,
            diagnostics: transpiled.diagnostics,
            folderId: data7ModulesFolderId!,
          });
        });
      }
    }

    // 2. Resolve transitive sugar dependencies
    const resolvedSugars = SugarRegistry.resolveDependencies(globalUsedSugars);

    // 3. Register virtual sugar modules in build indexer and add to compile list
    interface ModuleData {
      name: string;
      code: string;
      folderId: string;
      aberto: boolean;
      ordemAbertura: number;
    }
    const modulesToCompile: ModuleData[] = [];
    const newModulesMetadata: Record<string, ModuleMetadata> = {};

    for (const sugarId of resolvedSugars) {
      const sugar = SugarRegistry.get(sugarId);
      if (sugar?.namespace) {
        const virtualSugarCode = sugar.generateCode();
        const virtualSugarUri = `file:///synthetic/${sugar.namespace}.bas`;
        buildIndexer.updateFileContent(virtualSugarUri, virtualSugarCode);

        modulesToCompile.push({
          name: sugar.namespace,
          code: this.optimizeCode(virtualSugarCode, minify, stripComments),
          folderId: rootFolderId,
          aberto: false,
          ordemAbertura: 0,
        });
      }
    }

    const mainUri = vscode.Uri.file(mainCodePath).toString();
    buildIndexer.updateFileContent(mainUri, mainTranspiled.code);
    transpiledSrcModules.forEach((m) => {
      buildIndexer.updateFileContent(m.fileUri, m.code);
    });
    transpiledDepModules.forEach((m) => {
      buildIndexer.updateFileContent(m.fileUri, m.code);
    });

    // 4. Run strict linter and optimize/add to compile list
    this.reportSugarDiagnostics("Principal.bas", mainTranspiled.diagnostics);
    this.runStrictNativeLinter(mainUri, mainTranspiled.code, buildIndexer);
    const mainCode = this.optimizeCode(mainTranspiled.code, minify, stripComments);

    transpiledSrcModules.forEach((m) => {
      this.reportSugarDiagnostics(`${m.name}.bas`, m.diagnostics);
      this.runStrictNativeLinter(m.fileUri, m.code, buildIndexer);
      const code = this.optimizeCode(m.code, minify, stripComments);

      newModulesMetadata[m.name] = {
        nome: m.name,
        aberto: m.aberto,
        ordemAbertura: m.ordemAbertura,
        pastaId: m.folderId,
      };

      modulesToCompile.push({
        name: m.name,
        code,
        folderId: m.folderId,
        aberto: m.aberto,
        ordemAbertura: m.ordemAbertura,
      });
    });

    transpiledDepModules.forEach((m) => {
      this.reportSugarDiagnostics(`data7_modules/${m.name}.bas`, m.diagnostics);
      this.runStrictNativeLinter(m.fileUri, m.code, buildIndexer);
      const code = this.optimizeCode(m.code, minify, stripComments);

      modulesToCompile.push({
        name: m.name,
        code,
        folderId: m.folderId,
        aberto: false,
        ordemAbertura: 0,
      });
    });

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

    const xml = this.assembleXml(metadata, mainCode, orderedFolders, modulesToCompile);

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

  private static runStrictNativeLinter(
    fileUri: string,
    code: string,
    indexer: WorkspaceSymbolIndexer,
  ): void {
    indexer.updateFileContent(fileUri, code);

    const mockDoc = {
      uri: vscode.Uri.parse(fileUri),
      languageId: "d7basic",
      version: 1,
      getText: () => code,
    } as unknown as vscode.TextDocument;

    const linter = new DiagnosticsLinter({ strict: true });
    const diagnostics = linter.runDiagnostics(mockDoc, indexer);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    if (errors.length > 0) {
      const filename = path.basename(mockDoc.uri.fsPath);
      const errorMsg = errors
        .map(
          (e) =>
            `[${(e.range.start.line + 1).toString()}:${e.range.start.character.toString()}] ${e.message}`,
        )
        .join("\n");
      logger.error(`[Build] Erro de Linter/Sintaxe Nativa em ${filename}:\n${errorMsg}`);
      throw new Error(
        `O build foi abortado devido a erros de validação strict native em ${filename}:\n${errorMsg}`,
      );
    }
  }
}

// Re-export shared metadata types for callers that previously imported from `builder.ts`.
export type { ProjectMetadata, VirtualFolder, ModuleMetadata } from "./project-metadata";
