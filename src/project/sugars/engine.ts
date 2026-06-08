import { SugarsParserPlugin } from "../parser";
import type { ParserPlugin } from "../parser";
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

  public createParserPlugins(): ParserPlugin[] {
    if (!this.anyEnabled()) return [];
    // The parser still has one compatibility plugin while transforms are being
    // split into dedicated sugar plugins. Keeping construction here makes the
    // engine the only caller that decides whether sugar syntax is accepted.
    return [new SugarsParserPlugin()];
  }

  public getUtilityModules(usedSugarIds: Iterable<string>): SugarUtilityModule[] {
    if (!this.anyEnabled()) return [];
    const resolved = SugarRegistry.resolveDependencies(usedSugarIds);
    return SugarRegistry.getUtilityModules(resolved);
  }
}

