import * as fs from "node:fs";
import * as path from "node:path";
import { SourceMapLookup } from "./source-map-lookup";

export interface ResolveSourceMapFileOptions {
  /** Workspace root used to look under `.data7/build/`. */
  readonly workspaceDir?: string;
}

/**
 * Locate and load the Data7 source map for a built `.7Proj` path.
 * Prefer `<file>.7Proj.map.json` beside the project; fall back to `.data7/build/`.
 */
export function loadSourceMapForProjectFile(
  projectFilePath: string,
  options: ResolveSourceMapFileOptions = {},
): SourceMapLookup | undefined {
  const beside = `${projectFilePath}.map.json`;
  const candidates = [beside];
  if (options.workspaceDir) {
    candidates.push(path.join(options.workspaceDir, ".data7", "build", path.basename(beside)));
  } else {
    let dir = path.dirname(projectFilePath);
    for (let i = 0; i < 4; i++) {
      candidates.push(path.join(dir, ".data7", "build", path.basename(beside)));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(candidate, "utf-8"));
      const lookup = SourceMapLookup.tryParse(raw);
      if (lookup) return lookup;
    } catch {
      continue;
    }
  }
  return undefined;
}
