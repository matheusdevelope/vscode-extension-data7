import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { PROJECT_CONFIG_FILENAME } from "./project-config";
import type { BuildOptimizationOptions, BuildOptimizationOverride } from "./optimizer";
import type { SugarEngineOptions } from "./sugar-registry";

export const BUILD_SNAPSHOT_SCHEMA_VERSION = 3;

export interface BuildSnapshotOptions {
  readonly vscodeLoggerFilePath?: string;
  readonly sugarOptions?: SugarEngineOptions;
  readonly genericsEnabled?: boolean;
  readonly validateTranspiled?: boolean;
  readonly optimizationOptions?: BuildOptimizationOptions;
  readonly optimizationOverride?: BuildOptimizationOverride;
}

export interface BuildSnapshotEntry {
  readonly kind: "file" | "directory";
  readonly relativePath: string;
  readonly size?: number;
  readonly sha256?: string;
}

export interface BuildSnapshot {
  readonly schemaVersion: number;
  readonly workspaceDir: string;
  readonly outputFilePath: string;
  readonly optionsKey: string;
  readonly entries: readonly BuildSnapshotEntry[];
  readonly hash: string;
}

export interface FileContentFingerprint {
  readonly size: number;
  readonly sha256: string;
}

interface BuildSnapshotManifest {
  readonly schemaVersion: typeof BUILD_SNAPSHOT_SCHEMA_VERSION;
  readonly hash: string;
  readonly outputFilePath: string;
  readonly outputFingerprint: FileContentFingerprint;
}

export function computeBuildSnapshot(
  workspaceDir: string,
  outputFilePath: string,
  options: BuildSnapshotOptions = {},
): BuildSnapshot {
  const workspaceRoot = path.resolve(workspaceDir);
  const entries = collectBuildInputs(workspaceRoot);
  const optionsKey = stableStringify({
    genericsEnabled: options.genericsEnabled ?? true,
    sugarOptions: options.sugarOptions ?? null,
    optimizationOptions: options.optimizationOptions ?? null,
    optimizationOverride: options.optimizationOverride ?? null,
    validateTranspiled: options.validateTranspiled === true,
    vscodeLoggerFilePath: normalizeOptionalPath(options.vscodeLoggerFilePath),
  });
  const payload = {
    schemaVersion: BUILD_SNAPSHOT_SCHEMA_VERSION,
    outputFilePath: normalizePathForSnapshot(path.resolve(outputFilePath), workspaceRoot),
    optionsKey,
    entries,
  };
  const hash = hashText(stableStringify(payload));

  return {
    schemaVersion: BUILD_SNAPSHOT_SCHEMA_VERSION,
    workspaceDir: normalizePathForSnapshot(workspaceRoot),
    outputFilePath: normalizePathForSnapshot(path.resolve(outputFilePath), workspaceRoot),
    optionsKey,
    entries,
    hash,
  };
}

export function isBuildSnapshotFresh(snapshot: BuildSnapshot): boolean {
  const manifest = readSnapshotManifest(snapshot);
  if (!manifest) return false;
  if (manifest.hash !== snapshot.hash) return false;
  if (manifest.outputFilePath !== snapshot.outputFilePath) return false;
  return equalFileFingerprint(
    manifest.outputFingerprint,
    fingerprintFile(resolveSnapshotOutputPath(snapshot)),
  );
}

export function recordBuildSnapshot(snapshot: BuildSnapshot): void {
  const outputFingerprint = fingerprintFile(resolveSnapshotOutputPath(snapshot));
  if (!outputFingerprint) return;

  const manifest: BuildSnapshotManifest = {
    schemaVersion: BUILD_SNAPSHOT_SCHEMA_VERSION,
    hash: snapshot.hash,
    outputFilePath: snapshot.outputFilePath,
    outputFingerprint,
  };
  const manifestPath = getSnapshotManifestPath(snapshot);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

export function fingerprintFile(filePath: string): FileContentFingerprint | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return undefined;
  return {
    size: stat.size,
    sha256: hashBuffer(fs.readFileSync(filePath)),
  };
}

export function equalFileFingerprint(
  left: FileContentFingerprint | undefined,
  right: FileContentFingerprint | undefined,
): boolean {
  return !!left && !!right && left.size === right.size && left.sha256 === right.sha256;
}

function collectBuildInputs(workspaceRoot: string): BuildSnapshotEntry[] {
  const entries: BuildSnapshotEntry[] = [];
  addFileIfExists(entries, workspaceRoot, path.join(workspaceRoot, PROJECT_CONFIG_FILENAME));
  collectDirectory(entries, workspaceRoot, path.join(workspaceRoot, "src"), {
    includeExtensions: new Set([".bas", ".d7b"]),
    includeDirectories: true,
  });
  collectDirectory(entries, workspaceRoot, path.join(workspaceRoot, "data7_modules"), {
    includeExtensions: new Set([".bas", ".d7b"]),
    includeDirectories: true,
  });
  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function readSnapshotManifest(snapshot: BuildSnapshot): BuildSnapshotManifest | undefined {
  const manifestPath = getSnapshotManifestPath(snapshot);
  if (!fs.existsSync(manifestPath)) return undefined;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(manifestPath, "utf-8"),
    ) as Partial<BuildSnapshotManifest>;
    if (
      parsed.schemaVersion !== BUILD_SNAPSHOT_SCHEMA_VERSION ||
      typeof parsed.hash !== "string" ||
      typeof parsed.outputFilePath !== "string" ||
      !parsed.outputFingerprint ||
      typeof parsed.outputFingerprint.size !== "number" ||
      typeof parsed.outputFingerprint.sha256 !== "string"
    ) {
      return undefined;
    }
    return parsed as BuildSnapshotManifest;
  } catch {
    return undefined;
  }
}

function getSnapshotManifestPath(snapshot: BuildSnapshot): string {
  const cacheKey = hashText(
    stableStringify({
      outputFilePath: snapshot.outputFilePath,
      optionsKey: snapshot.optionsKey,
    }),
  );
  return path.resolve(snapshot.workspaceDir, ".data7", "build-cache", `${cacheKey}.json`);
}

function resolveSnapshotOutputPath(snapshot: BuildSnapshot): string {
  if (path.isAbsolute(snapshot.outputFilePath)) return snapshot.outputFilePath;
  return path.resolve(snapshot.workspaceDir, snapshot.outputFilePath);
}

function collectDirectory(
  entries: BuildSnapshotEntry[],
  workspaceRoot: string,
  dir: string,
  options: {
    readonly includeExtensions: ReadonlySet<string>;
    readonly includeDirectories: boolean;
  },
): void {
  if (!fs.existsSync(dir)) return;
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) return;

  if (options.includeDirectories) {
    entries.push({
      kind: "directory",
      relativePath: normalizePathForSnapshot(dir, workspaceRoot),
    });
  }

  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      collectDirectory(entries, workspaceRoot, fullPath, options);
      continue;
    }
    if (!dirent.isFile()) continue;
    if (!options.includeExtensions.has(path.extname(dirent.name).toLowerCase())) continue;
    addFileIfExists(entries, workspaceRoot, fullPath);
  }
}

function addFileIfExists(
  entries: BuildSnapshotEntry[],
  workspaceRoot: string,
  filePath: string,
): void {
  const fingerprint = fingerprintFile(filePath);
  if (!fingerprint) return;
  entries.push({
    kind: "file",
    relativePath: normalizePathForSnapshot(filePath, workspaceRoot),
    size: fingerprint.size,
    sha256: fingerprint.sha256,
  });
}

function normalizeOptionalPath(filePath: string | undefined): string | null {
  return filePath ? normalizePathForSnapshot(path.resolve(filePath)) : null;
}

function normalizePathForSnapshot(filePath: string, workspaceRoot?: string): string {
  const relative =
    workspaceRoot && isPathInside(filePath, workspaceRoot)
      ? path.relative(workspaceRoot, filePath) || "."
      : filePath;
  const normalized = relative.replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isPathInside(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return (
    relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function stableStringify(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (typeof value === "function" || typeof value === "symbol") {
    return JSON.stringify(String(value));
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text, "utf-8").digest("hex");
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
