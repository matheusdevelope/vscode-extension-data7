import * as fs from "node:fs";
import * as path from "node:path";
import type { Data7SourceMap } from "./data7-source-map";

/**
 * Persist a Data7 source map next to the `.7Proj` and under `.data7/build/`.
 * Returns the primary path written (beside the project file).
 */
export function writeData7SourceMapFiles(
  workspaceDir: string,
  generatedProjectFile: string,
  sourceMap: Data7SourceMap,
): { readonly besideProject: string; readonly underBuild: string } {
  const json = `${JSON.stringify(sourceMap, null, 2)}\n`;
  const besideProject = `${generatedProjectFile}.map.json`;
  fs.writeFileSync(besideProject, json, "utf-8");

  const buildDir = path.join(workspaceDir, ".data7", "build");
  fs.mkdirSync(buildDir, { recursive: true });
  const underBuild = path.join(buildDir, path.basename(besideProject));
  fs.writeFileSync(underBuild, json, "utf-8");

  if (sourceMap.symbols.length > 0) {
    const uglifyBeside = generatedProjectFile.replace(/\.7Proj$/i, "") + ".uglify-map.json";
    const uglifyPayload = {
      version: 1 as const,
      generatedProjectFile: sourceMap.generatedProjectFile,
      symbols: sourceMap.symbols,
    };
    const uglifyJson = `${JSON.stringify(uglifyPayload, null, 2)}\n`;
    fs.writeFileSync(uglifyBeside, uglifyJson, "utf-8");
    fs.writeFileSync(path.join(buildDir, path.basename(uglifyBeside)), uglifyJson, "utf-8");
  }

  return { besideProject, underBuild };
}
