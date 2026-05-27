import * as fs from "fs";
import * as path from "path";
import type { ProjectMetadata, VirtualFolder } from "./project-metadata";
import { isXmlRecord, parseProjectXml, xmlRecord, xmlText, xmlRawText } from "../utils/xml-helpers";
import { safeJoinInside, isSafeSegment } from "../utils/path-safety";
import { PROJECT_CONFIG_FILENAME } from "../infra/constants";

/**
 * Expands a `.7Proj` XML container back into a workspace tree:
 *   `<outputDir>/src/Principal.bas`
 *   `<outputDir>/src/.../<module>.bas`
 *   `<outputDir>/data7.json`
 *
 * Inverse of {@link Builder.buildProject}. Round-trip is validated by
 * `src/test/builder.test.ts`.
 */
export class Decompiler {
  public static decompileProject(
    filePath: string,
    outputDir: string,
    knownSharedModules?: Set<string>,
  ): ProjectMetadata {
    const xmlContent = fs.readFileSync(filePath, "utf-8");
    const parsed = parseProjectXml(xmlContent);
    const root = xmlRecord(parsed, "Projeto_Data7");

    if (!isXmlRecord(parsed) || Object.keys(root).length === 0) {
      throw new Error("Formato do arquivo .7Proj inválido: tag Projeto_Data7 não encontrada.");
    }

    const opcoesSource = xmlRecord(root, "Opcoes");
    const metadata: ProjectMetadata = {
      nome: path.basename(filePath, path.extname(filePath)),
      language: stringAttr(root, "@_Language") || xmlText(root, "Linguagem", "Basic"),
      version: stringAttr(root, "@_Version") || stringAttr(root, "@_Versão") || "1.0",
      targetPlatform: stringAttr(root, "@_TargetPlataform") || "Default",
      opcoes: {
        autor: xmlText(opcoesSource, "Autor"),
        versao: xmlText(opcoesSource, "Versao") || xmlText(opcoesSource, "Versão", "1.0.0.0"),
        informacoes: xmlText(opcoesSource, "Informacoes"),
        codEmpresa: parseIntSafe(xmlText(opcoesSource, "CodEmpresa"), 1),
        codFilial: parseIntSafe(xmlText(opcoesSource, "CodFilial"), 1),
        nomeUsuario: xmlText(opcoesSource, "NomeUsuario", "Administrador"),
        preScript: xmlText(opcoesSource, "PreScript"),
        identificacaoBancoDados: xmlText(opcoesSource, "IdentificacaoBancoDados"),
      },
      virtualFolders: [],
      modulesMetadata: {},
      dependencies: {},
    };

    const srcDir = path.join(outputDir, "src");
    if (fs.existsSync(srcDir)) {
      fs.rmSync(srcDir, { recursive: true, force: true });
    }
    fs.mkdirSync(srcDir, { recursive: true });

    const mainCode = xmlText(root, "Codigo");
    fs.writeFileSync(path.join(srcDir, "Principal.bas"), mainCode, "utf-8");

    // Parse <Pastas><Pasta>...</Pasta></Pastas> into our typed structure.
    const pastasContainer = xmlRecord(root, "Pastas");
    const pastaRaw = pastasContainer.Pasta;
    const pastasList: unknown[] = Array.isArray(pastaRaw)
      ? pastaRaw
      : pastaRaw !== undefined
        ? [pastaRaw]
        : [];
    for (const p of pastasList) {
      const folder: VirtualFolder = {
        nome: xmlText(p, "Nome"),
        id: xmlText(p, "ID"),
        pastaId: xmlText(p, "PastaID"),
        aberta: xmlText(p, "Aberta", "Nao"),
      };
      metadata.virtualFolders.push(folder);
    }

    const foldersMap: Record<string, { path: string; name: string }> = {};
    const getFolderPath = (folderId: string): string => {
      if (!folderId) return "";
      const cached = foldersMap[folderId];
      if (cached) return cached.path;
      const folder = metadata.virtualFolders.find((f) => f.id === folderId);
      if (!folder) return "";
      // The synthetic root "Unidades (X)" folder maps to the project root.
      if (!folder.pastaId && folder.nome.startsWith("Unidades")) {
        foldersMap[folderId] = { path: "", name: folder.nome };
        return "";
      }
      const parentPath = getFolderPath(folder.pastaId);
      const sanitizedName = folder.nome.replace(/[\\/:*?"<>|]/g, "_");
      const fullPath = parentPath ? path.join(parentPath, sanitizedName) : sanitizedName;
      foldersMap[folderId] = { path: fullPath, name: folder.nome };
      return fullPath;
    };
    metadata.virtualFolders.forEach((f) => getFolderPath(f.id));

    const detectedDeps: Record<string, string> = {};
    const modulosContainer = xmlRecord(root, "Modulos");

    for (const modName of Object.keys(modulosContainer)) {
      // Skip parser meta-keys (XML attributes / whitespace nodes).
      if (modName.startsWith("@_") || modName.startsWith("#")) continue;
      // Reject any name that would escape the workspace root through path traversal.
      if (!isSafeSegment(modName)) {
        throw new Error(`Nome de módulo inválido no .7Proj: "${modName}".`);
      }

      const mod = modulosContainer[modName];
      if (!isXmlRecord(mod)) continue;

      const modCode = xmlText(mod, "Codigo");
      const folderId = xmlRawText(mod, "PastaID");
      const aberto = xmlRawText(mod, "Aberto").toLowerCase() === "true";
      const ordemAbertura = parseIntSafe(xmlRawText(mod, "OrdemAbertura"), 0);

      const lowerModName = modName.toLowerCase();
      const isDependency =
        modCode.toLowerCase().includes("@module-imported") ||
        (knownSharedModules?.has(lowerModName) ?? false);

      if (isDependency) {
        detectedDeps[modName] = "1.0.0.0";
        continue;
      }

      metadata.modulesMetadata[modName] = {
        nome: modName,
        aberto,
        ordemAbertura,
        pastaId: folderId,
      };

      const relFolderPath = (foldersMap[folderId] as { path: string } | undefined)?.path ?? "";
      // safeJoinInside guarantees the resolved path stays inside srcDir.
      const targetFolder = relFolderPath ? safeJoinInside(srcDir, relFolderPath) : srcDir;
      fs.mkdirSync(targetFolder, { recursive: true });

      const destPath = safeJoinInside(targetFolder, `${modName}.bas`);
      fs.writeFileSync(destPath, modCode, "utf-8");
    }

    const configPath = path.join(outputDir, PROJECT_CONFIG_FILENAME);
    metadata.dependencies = detectedDeps;
    fs.writeFileSync(configPath, JSON.stringify(metadata, null, 2), "utf-8");

    return metadata;
  }
}

function stringAttr(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function parseIntSafe(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Re-export shared metadata types so existing imports `from './decompiler'` keep working.
export type { ProjectMetadata, VirtualFolder, ModuleMetadata } from "./project-metadata";
