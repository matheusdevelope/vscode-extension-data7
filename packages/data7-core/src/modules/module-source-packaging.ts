import * as fs from "fs";
import * as path from "path";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { logger } from "../infra/logger";

/**
 * Shared packaging rules for module publish + import:
 * - Only `.bas` files that declare a `Namespace` are publishable / kept after import.
 * - Imported `Principal.bas` is fully commented (isolated-module development entrypoint).
 */

export function basDeclaresNamespace(code: string): boolean {
  return DependencyScanner.getDeclaredNamespaces(code).length > 0;
}

export function isPrincipalBasFileName(fileName: string): boolean {
  return path.basename(fileName).toLowerCase() === "principal.bas";
}

/** Prefix every non-empty, non-comment line with `' ` so the file is inert. */
export function commentOutBasSource(code: string): string {
  const eol = code.includes("\r\n") ? "\r\n" : "\n";
  const endsWithNewline = /\r?\n$/.test(code);
  const lines = code.split(/\r?\n/);
  const lastIsEmpty = endsWithNewline && lines.length > 0 && lines[lines.length - 1] === "";
  const body = lastIsEmpty ? lines.slice(0, -1) : lines;
  const commented = body.map((line) => {
    const trimmed = line.trimStart();
    if (trimmed.length === 0) {
      return line;
    }
    if (trimmed.startsWith("'")) {
      return line;
    }
    return `' ${line}`;
  });
  return commented.join(eol) + (endsWithNewline ? eol : "");
}

/**
 * Keep `.d7form` and `.bas` files that declare at least one Namespace.
 * Entry files without a Namespace (typical development `Principal.bas`) are dropped.
 */
export function selectPublishableModuleSources(srcFiles: readonly string[]): string[] {
  return srcFiles.filter((filePath) => {
    if (!filePath.toLowerCase().endsWith(".bas")) {
      return true;
    }
    const code = fs.readFileSync(filePath, "utf-8");
    return basDeclaresNamespace(code);
  });
}

export interface NormalizeImportedModuleSourcesResult {
  readonly discarded: readonly string[];
  readonly commentedPrincipals: readonly string[];
}

/**
 * After copying a module into `data7_modules/<name>/`:
 * discard `.bas` without Namespace; fully comment any remaining `Principal.bas`.
 */
export function normalizeImportedModuleSources(
  moduleRootDir: string,
): NormalizeImportedModuleSourcesResult {
  const discarded: string[] = [];
  const commentedPrincipals: string[] = [];
  if (!fs.existsSync(moduleRootDir)) {
    return { discarded, commentedPrincipals };
  }

  const basFiles = DependencyScanner.getFilesRecursive(moduleRootDir, [".bas"]);
  for (const filePath of basFiles) {
    const code = fs.readFileSync(filePath, "utf-8");
    if (!basDeclaresNamespace(code)) {
      fs.unlinkSync(filePath);
      discarded.push(filePath);
      logger.info(
        `Descartado arquivo sem Namespace na importação: ${path.relative(moduleRootDir, filePath)}`,
      );
      continue;
    }
    if (!isPrincipalBasFileName(filePath)) {
      continue;
    }
    const commented = commentOutBasSource(code);
    if (commented === code) {
      continue;
    }
    fs.writeFileSync(filePath, commented, "utf-8");
    commentedPrincipals.push(filePath);
    logger.info(
      `Principal.bas importado comentado (entrypoint de desenvolvimento): ${path.relative(moduleRootDir, filePath)}`,
    );
  }
  return { discarded, commentedPrincipals };
}
