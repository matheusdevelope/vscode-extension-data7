import { SugarsParserPlugin } from "../parser";
import type { ParserPlugin } from "../parser";
import { isDisabledSugarSyntaxLine } from "../parser/sugars-plugin";
import { SugarRegistry } from "./registry";
import type { SugarEngineOptions, SugarUtilityModule } from "./types";

export class SugarEngine {
  private readonly enabled: boolean;
  private readonly enabledIds: Set<string>;

  public constructor(options: SugarEngineOptions = {}) {
    this.enabled = options.enabled ?? true;
    const defaultIds = SugarRegistry.getDefaultEnabledIds();
    const explicitIds =
      options.enabledSugarIds && options.enabledSugarIds.length > 0
        ? new Set(options.enabledSugarIds.map((id) => id.toLowerCase()))
        : undefined;
    const disabledIds = new Set((options.disabledSugarIds ?? []).map((id) => id.toLowerCase()));
    this.enabledIds = new Set<string>();

    for (const id of explicitIds ?? defaultIds) {
      const plugin = SugarRegistry.get(id);
      if (!plugin) continue;
      if (disabledIds.has(plugin.id.toLowerCase())) continue;
      this.enabledIds.add(plugin.id);
    }
  }

  public isEnabled(id: string): boolean {
    if (!this.enabled) return false;
    return this.enabledIds.has(id) || this.enabledIds.has(id.toLowerCase());
  }

  public anyEnabled(): boolean {
    return this.enabled && this.enabledIds.size > 0;
  }

  public getEnabledSugarIds(): Set<string> {
    if (!this.enabled) return new Set();
    return new Set(this.enabledIds);
  }

  public getEnabledSugarIdsInPrecedenceOrder(): string[] {
    if (!this.enabled) return [];
    return SugarRegistry.orderByPrecedence(this.enabledIds);
  }

  public createParserPlugins(): ParserPlugin[] {
    const parserSugarIds = this.getEnabledSugarIds();
    if (!PARSER_SUGAR_IDS.some((id) => parserSugarIds.has(id))) return [];
    // The compatibility parser is configured with only the sugars selected by
    // this engine. Its dispatch never accepts syntax from a disabled sugar.
    return [new SugarsParserPlugin(parserSugarIds)];
  }

  /**
   * Supplies a lossless parser fallback for syntax from disabled sugars.
   * Keeping it as a parser policy (rather than a parser plugin) ensures
   * `createParserPlugins()` constructs syntax handlers only for enabled IDs.
   */
  public createDisabledSyntaxLinePreserver(): ((sourceLine: string) => boolean) | undefined {
    const disabledParserSugarIds = new Set(PARSER_SUGAR_IDS.filter((id) => !this.isEnabled(id)));
    if (disabledParserSugarIds.size === 0) return undefined;
    return (sourceLine) => isDisabledSugarSyntaxLine(sourceLine, disabledParserSugarIds);
  }

  public getUtilityModules(usedSugarIds: Iterable<string>): SugarUtilityModule[] {
    if (!this.anyEnabled()) return [];
    const resolved = SugarRegistry.resolveDependencies(usedSugarIds);
    return SugarRegistry.getUtilityModules(resolved);
  }
}

const PARSER_SUGAR_IDS = [
  "array-list",
  "enum",
  "interpolation",
  "null-coalesce",
  "object-initializer",
  "optional-chain",
  "pipe",
  "return-if",
  "tagged-template",
  "ternary",
  "using",
  "destructure-object",
  "destructure-array",
  "numeric-separator",
  "logical-assignment",
] as const;
