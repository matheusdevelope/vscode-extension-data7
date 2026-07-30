import { deepClone } from "../../ast/clone";
import { parseBasic, serializeUnit, BUILD_SERIALIZE_OPTIONS } from "../../parser";
import type { UglifyOptimizationOptions } from "../optimization-options";
import { collectUglifyRenameMaps, type ParsedUglifyModule } from "./collect-renames";
import { applyUglifyRenames } from "./rewrite-names";

export interface UglifyModuleInput {
  readonly moduleName: string;
  readonly fileUri: string;
  readonly code: string;
}

export interface UglifyResult {
  readonly modules: ReadonlyMap<string, string>;
}

/**
 * Aggressive symbol renaming for build output.
 * Renames user namespaces/types/members/locals to short identifiers while
 * preserving System Library names, language keywords, `Main`/`New`/`Free`,
 * and declarations marked `@data7:keep-name` / `@data7:external-api`.
 */
export function uglifyBuildModules(
  modules: readonly UglifyModuleInput[],
  options: UglifyOptimizationOptions,
): UglifyResult {
  if (!options.enabled) {
    return {
      modules: new Map(modules.map((module) => [module.moduleName, module.code])),
    };
  }

  const parsed: ParsedUglifyModule[] = [];
  for (const module of modules) {
    const parse = parseBasic(module.code);
    if (parse.errors.length > 0) {
      // Cross-module renames are unsafe if any unit fails to parse.
      return {
        modules: new Map(modules.map((item) => [item.moduleName, item.code])),
      };
    }
    parsed.push({
      moduleName: module.moduleName,
      code: module.code,
      unit: deepClone(parse.unit),
    });
  }

  const maps = collectUglifyRenameMaps(parsed);
  const result = new Map<string, string>();
  for (const module of parsed) {
    applyUglifyRenames(module.unit, maps);
    result.set(
      module.moduleName,
      serializeUnit(module.unit, {
        eol: module.code.includes("\r\n") ? "\r\n" : "\n",
        ...BUILD_SERIALIZE_OPTIONS,
      }),
    );
  }
  return { modules: result };
}
