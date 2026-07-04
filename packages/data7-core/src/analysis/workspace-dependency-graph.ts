import type { FileSymbols } from "./symbol-indexer";

/**
 * Reverse-dependency index for incremental lint propagation.
 *
 * Maintains namespace → declaring file and namespace → importing files so that
 * a change in file A can re-lint only direct importers instead of scanning
 * the whole workspace.
 */
export class WorkspaceDependencyGraph {
  /** namespace (lower) → fileUri that declares it */
  private readonly namespaceOwners = new Map<string, string>();

  /** namespace (lower) → fileUris that import it */
  private readonly importersByNamespace = new Map<string, Set<string>>();

  /** fileUri (lower) → namespaces declared in that file */
  private readonly declaredNamespacesByFile = new Map<string, Set<string>>();

  /** fileUri (lower) → namespaces imported by that file */
  private readonly importedNamespacesByFile = new Map<string, Set<string>>();

  public clear(): void {
    this.namespaceOwners.clear();
    this.importersByNamespace.clear();
    this.declaredNamespacesByFile.clear();
    this.importedNamespacesByFile.clear();
  }

  public rebuild(allFiles: readonly FileSymbols[]): void {
    this.clear();
    for (const file of allFiles) {
      this.registerFile(file);
    }
  }

  public registerFile(file: FileSymbols): void {
    const fileKey = normalizeUri(file.fileUri);
    this.unregisterFile(fileKey);

    const declared = new Set<string>();
    for (const sym of file.symbols) {
      if (sym.kind !== "namespace") continue;
      const ns = sym.name.toLowerCase();
      declared.add(ns);
      this.namespaceOwners.set(ns, fileKey);
    }
    this.declaredNamespacesByFile.set(fileKey, declared);

    const imported = new Set<string>();
    for (const imp of file.imports) {
      const ns = imp.toLowerCase();
      imported.add(ns);
      let importers = this.importersByNamespace.get(ns);
      if (!importers) {
        importers = new Set<string>();
        this.importersByNamespace.set(ns, importers);
      }
      importers.add(fileKey);
    }
    this.importedNamespacesByFile.set(fileKey, imported);
  }

  public unregisterFile(fileUri: string): void {
    const fileKey = normalizeUri(fileUri);

    const oldDeclared = this.declaredNamespacesByFile.get(fileKey);
    if (oldDeclared) {
      for (const ns of oldDeclared) {
        if (this.namespaceOwners.get(ns) === fileKey) {
          this.namespaceOwners.delete(ns);
        }
      }
    }

    const oldImported = this.importedNamespacesByFile.get(fileKey);
    if (oldImported) {
      for (const ns of oldImported) {
        const importers = this.importersByNamespace.get(ns);
        importers?.delete(fileKey);
        if (importers && importers.size === 0) {
          this.importersByNamespace.delete(ns);
        }
      }
    }

    this.declaredNamespacesByFile.delete(fileKey);
    this.importedNamespacesByFile.delete(fileKey);
  }

  public getDependentFileUris(
    triggerUri: string,
    extraNamespaces: ReadonlySet<string> = new Set<string>(),
  ): readonly string[] {
    const triggerKey = normalizeUri(triggerUri);
    const targetNamespaces = new Set<string>();
    for (const ns of extraNamespaces) {
      targetNamespaces.add(ns.toLowerCase());
    }

    const declared = this.declaredNamespacesByFile.get(triggerKey);
    if (declared) {
      for (const ns of declared) {
        targetNamespaces.add(ns);
      }
    }

    if (targetNamespaces.size === 0) {
      return [];
    }

    const dependents = new Set<string>();
    const visited = new Set<string>([triggerKey]);

    for (const ns of targetNamespaces) {
      // Files that import this namespace
      const importers = this.importersByNamespace.get(ns);
      if (importers) {
        for (const importer of importers) {
          if (importer !== triggerKey) {
            dependents.add(importer);
          }
        }
      }

      // Files that declare the same namespace (shared namespace edge case)
      const owner = this.namespaceOwners.get(ns);
      if (owner && owner !== triggerKey) {
        dependents.add(owner);
      }
    }

    // Files sharing any declared namespace with the trigger
    if (declared && declared.size > 0) {
      for (const [fileKey, fileNamespaces] of this.declaredNamespacesByFile) {
        if (fileKey === triggerKey || visited.has(fileKey)) continue;
        for (const ns of fileNamespaces) {
          if (declared.has(ns)) {
            dependents.add(fileKey);
            break;
          }
        }
      }
    }

    return Array.from(dependents);
  }

  /** namespace (lower) → declaring file URI, when registered. */
  public getDeclaringFileUri(namespace: string): string | undefined {
    return this.namespaceOwners.get(namespace.toLowerCase());
  }
}

function normalizeUri(uri: string): string {
  return uri.toLowerCase();
}
