import * as fs from "fs";
import * as path from "path";
import type { ProjectMetadata, VirtualFolder, ModuleMetadata } from "./project-metadata";
import { escapeXml } from "../utils/xml-helpers";
import { generateProjectGuid } from "../utils/guid";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { PROJECT_CONFIG_FILENAME } from "../infra/constants";

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
          const char = trimmed[i];
          if (char === '"') {
            inString = !inString;
            compressed += char;
            i++;
          } else if (inString) {
            compressed += char;
            i++;
          } else if (/\s/.test(char)) {
            compressed += " ";
            while (i < trimmed.length && /\s/.test(trimmed[i])) {
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

  public static buildProject(
    workspaceDir: string,
    outputFilePath: string,
    _sharedModulesDir?: string,
  ): string {
    const configPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) {
      throw new Error("Configuração do projeto (data7.json) não encontrada no workspace.");
    }

    const metadata = JSON.parse(fs.readFileSync(configPath, "utf-8")) as ProjectMetadata;
    const srcDir = path.join(workspaceDir, "src");
    const data7ModulesDir = path.join(workspaceDir, "data7_modules");

    if (!fs.existsSync(srcDir)) {
      throw new Error("Pasta src/ não encontrada no workspace.");
    }

    const mainCodePath = path.join(srcDir, "Principal.bas");
    if (!fs.existsSync(mainCodePath)) {
      throw new Error("Código principal src/Principal.bas não encontrado.");
    }
    const mainCodeRaw = fs.readFileSync(mainCodePath, "utf-8");
    const minify = !!metadata.opcoes.minify;
    const stripComments = !!metadata.opcoes.stripComments;
    const mainCode = this.optimizeCode(mainCodeRaw, minify, stripComments);

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
      if (idx !== -1) {
        virtualFolders[idx].nome = `Unidades (${totalModulesCount})`;
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

    interface ModuleData {
      name: string;
      code: string;
      folderId: string;
      aberto: boolean;
      ordemAbertura: number;
    }

    const modulesToCompile: ModuleData[] = [];
    const newModulesMetadata: Record<string, ModuleMetadata> = {};

    srcFiles.forEach((filePath) => {
      const filename = path.basename(filePath, ".bas");
      if (filename === "Principal") return;

      const relFileDir = path.relative(srcDir, path.dirname(filePath));
      const folderId = relFileDir ? (foldersByPath.get(relFileDir) ?? rootFolderId) : rootFolderId;
      const rawCode = fs.readFileSync(filePath, "utf-8");
      const code = this.optimizeCode(rawCode, minify, stripComments);

      // The record is typed as `Record<string, ModuleMetadata>`, so without
      // `noUncheckedIndexedAccess` TS treats the lookup as defined. At
      // runtime the entry may be missing, so we cast to `| undefined` to
      // make the fallback observable to the linter.
      const meta = (metadata.modulesMetadata[filename] as ModuleMetadata | undefined) ?? {
        nome: filename,
        aberto: true,
        ordemAbertura: 0,
        pastaId: folderId,
      };
      const moduleMeta: ModuleMetadata = {
        nome: filename,
        aberto: meta.aberto,
        ordemAbertura: meta.ordemAbertura,
        pastaId: folderId,
      };
      newModulesMetadata[filename] = moduleMeta;

      modulesToCompile.push({
        name: filename,
        code,
        folderId,
        aberto: moduleMeta.aberto,
        ordemAbertura: moduleMeta.ordemAbertura,
      });
    });

    if (fs.existsSync(data7ModulesDir)) {
      const dependencyFiles = fs.readdirSync(data7ModulesDir).filter((f) => f.endsWith(".bas"));
      if (dependencyFiles.length > 0) {
        const data7ModulesFolder = virtualFolders.find(
          (f) => f.nome === "data7_modules" && f.pastaId === rootFolderId,
        );
        let data7ModulesFolderId = data7ModulesFolder?.id;
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

          const code = this.optimizeCode(rawCode, minify, stripComments);
          modulesToCompile.push({
            name: filename,
            code,
            folderId: data7ModulesFolderId,
            aberto: false,
            ordemAbertura: 0,
          });
        });
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

    const xml = this.assembleXml(metadata, mainCode, orderedFolders, modulesToCompile);

    const outputDir = path.dirname(outputFilePath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputFilePath, xml, "utf-8");

    metadata.virtualFolders = orderedFolders;
    metadata.modulesMetadata = newModulesMetadata;
    fs.writeFileSync(configPath, JSON.stringify(metadata, null, 2), "utf-8");

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
}

// Re-export shared metadata types for callers that previously imported from `builder.ts`.
export type { ProjectMetadata, VirtualFolder, ModuleMetadata } from "./project-metadata";
