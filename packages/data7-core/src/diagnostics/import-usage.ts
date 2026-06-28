import type { FileSymbols, WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";

/**
 * Finds imports required by modules referenced directly from a source file.
 * Data7 compilation exposes imported modules as a shared dependency graph, so
 * an import can be required by a referenced module even without a local symbol use.
 */
export function collectTransitivelyRequiredImports(
  indexer: WorkspaceSymbolIndexer,
  directlyReferencedImports: ReadonlySet<string>,
): ReadonlySet<string> {
  const filesByNamespace = new Map<string, FileSymbols[]>();
  for (const file of indexer.getAllFileSymbols()) {
    for (const symbol of file.symbols) {
      if (symbol.kind !== "namespace") continue;
      const key = symbol.name.toLowerCase();
      const files = filesByNamespace.get(key) ?? [];
      files.push(file);
      filesByNamespace.set(key, files);
    }
  }

  const requiredImports = new Set<string>();
  const visitedNamespaces = new Set<string>();
  const visitNamespace = (namespace: string): void => {
    const key = namespace.toLowerCase();
    if (visitedNamespaces.has(key)) return;
    visitedNamespaces.add(key);

    for (const file of filesByNamespace.get(key) ?? []) {
      for (const importedNamespace of file.imports) {
        const importedKey = importedNamespace.toLowerCase();
        requiredImports.add(importedKey);
        visitNamespace(importedKey);
      }
    }
  };

  for (const namespace of directlyReferencedImports) visitNamespace(namespace);
  return requiredImports;
}
