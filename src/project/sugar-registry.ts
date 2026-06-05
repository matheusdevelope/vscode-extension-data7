export interface SugarUtility {
  readonly id: string;
  readonly namespace: string;
  readonly dependencies: readonly string[];
  generateCode(): string;
}

export class SugarRegistry {
  private static readonly registry = new Map<string, SugarUtility>();

  public static register(utility: SugarUtility): void {
    this.registry.set(utility.id, utility);
  }

  public static get(id: string): SugarUtility | undefined {
    return this.registry.get(id);
  }

  public static getAll(): SugarUtility[] {
    return Array.from(this.registry.values());
  }

  public static resolveDependencies(usedSugarIds: Iterable<string>): Set<string> {
    const resolved = new Set<string>();
    const queue = Array.from(usedSugarIds);
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (resolved.has(current)) continue;
      resolved.add(current);
      const sugar = this.get(current);
      if (sugar && sugar.dependencies) {
        for (const dep of sugar.dependencies) {
          if (!resolved.has(dep)) {
            queue.push(dep);
          }
        }
      }
    }
    return resolved;
  }
}

// Register Enum Sugar Utility
SugarRegistry.register({
  id: "enum",
  namespace: "core_sugars_enum",
  dependencies: ["list"], // core_sugars_enum depends on core_sugars_list
  generateCode() {
    return [
      "Namespace core_sugars_enum",
      "Class CoreSugarBaseEnum",
      "   Inherits BaseEnum",
      "   Sub New()",
      "      MyBase.New()",
      "   End Sub",
      "   Sub Free()",
      "      MyBase.Free()",
      "   End Sub",
      "End Class",
      "End Namespace"
    ].join("\r\n");
  }
});

// Register List Sugar Utility
SugarRegistry.register({
  id: "list",
  namespace: "core_sugars_list",
  dependencies: [],
  generateCode() {
    return [
      "Namespace core_sugars_list",
      "Class CoreSugarBaseList",
      "   Sub New()",
      "      MyBase.New()",
      "   End Sub",
      "   Sub Free()",
      "      MyBase.Free()",
      "   End Sub",
      "End Class",
      "End Namespace"
    ].join("\r\n");
  }
});
