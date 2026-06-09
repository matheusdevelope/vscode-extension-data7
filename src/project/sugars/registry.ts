import type { SugarCatalogEntry, SugarPlugin, SugarUtilityModule } from "./types";
import { builtInSugarPlugins } from "./plugins/catalog";

export class SugarRegistry {
  public static readonly DEFAULT_PRIORITY = 100;

  private static readonly plugins = new Map<string, SugarPlugin>();
  private static initialized = false;

  public static register(plugin: SugarPlugin): void {
    this.plugins.set(plugin.id.toLowerCase(), plugin);
  }

  public static get(id: string): SugarPlugin | undefined {
    this.ensureInitialized();
    return this.plugins.get(id.toLowerCase());
  }

  public static getAll(): SugarPlugin[] {
    this.ensureInitialized();
    return Array.from(this.plugins.values());
  }

  public static getDefaultEnabledIds(): Set<string> {
    return new Set(
      this.getAll()
        .filter((plugin) => plugin.enabledByDefault)
        .map((plugin) => plugin.id),
    );
  }

  public static getUtilityModules(pluginIds?: Iterable<string>): SugarUtilityModule[] {
    this.ensureInitialized();
    const plugins =
      pluginIds === undefined
        ? this.getAll()
        : Array.from(pluginIds)
            .map((id) => this.get(id))
            .filter((plugin): plugin is SugarPlugin => plugin !== undefined);

    const modules = new Map<string, SugarUtilityModule>();
    for (const plugin of plugins) {
      for (const module of plugin.utilityModules?.() ?? []) {
        modules.set(module.namespace.toLowerCase(), module);
      }
    }
    return Array.from(modules.values());
  }

  public static resolveDependencies(usedSugarIds: Iterable<string>): Set<string> {
    this.ensureInitialized();
    const resolved = new Set<string>();
    const queue = Array.from(usedSugarIds);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const key = current.toLowerCase();
      if (resolved.has(key)) continue;

      const plugin = this.get(current);
      if (!plugin) continue;
      resolved.add(plugin.id);

      for (const dep of plugin.dependencies ?? []) {
        if (!resolved.has(dep.toLowerCase())) queue.push(dep);
      }
      for (const utility of plugin.utilityModules?.() ?? []) {
        for (const dep of utility.dependencies ?? []) {
          if (!resolved.has(dep.toLowerCase())) queue.push(dep);
        }
      }
    }
    return resolved;
  }

  public static orderByPrecedence(sugarIds: Iterable<string>): string[] {
    this.ensureInitialized();
    const ids = Array.from(this.resolveDependencies(sugarIds));
    ids.sort((a, b) => {
      const left = this.get(a);
      const right = this.get(b);
      const leftPriority = left?.priority ?? this.DEFAULT_PRIORITY;
      const rightPriority = right?.priority ?? this.DEFAULT_PRIORITY;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return (left?.id ?? a).localeCompare(right?.id ?? b);
    });
    return ids;
  }

  public static catalog(): SugarCatalogEntry[] {
    return this.getAll()
      .map((plugin) => ({
        id: plugin.id,
        displayName: plugin.displayName,
        description: plugin.description,
        enabledByDefault: plugin.enabledByDefault,
        priority: plugin.priority ?? this.DEFAULT_PRIORITY,
        dependencies: plugin.dependencies ?? [],
        syntaxKinds: plugin.syntaxKinds ?? [],
        diagnosticCodes: plugin.diagnosticCodes ?? [],
        utilityModules: (plugin.utilityModules?.() ?? []).map((module) => module.namespace),
      }))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.id.localeCompare(b.id);
      });
  }

  private static ensureInitialized(): void {
    if (this.initialized) return;
    this.initialized = true;
    for (const plugin of builtInSugarPlugins) {
      this.register(plugin);
    }
  }
}
