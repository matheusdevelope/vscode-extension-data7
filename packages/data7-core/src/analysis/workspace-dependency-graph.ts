import type { FileSymbols } from "./symbol-indexer";

/** Depth cap for {@link WorkspaceDependencyGraph.getTransitiveDependents}. */
export const DEFAULT_DEPENDENT_MAX_DEPTH = 8;

export interface TransitiveDependentsOptions {
  readonly extraNamespaces?: ReadonlySet<string>;
  /** Guards against pathological fan-out in deeply layered projects. */
  readonly maxDepth?: number;
}

/**
 * Reverse-dependency index for incremental lint propagation.
 *
 * Maintains namespace → declaring files and namespace → importing files so that
 * a change in file A can re-lint only the affected files instead of scanning
 * the whole workspace. A namespace may legitimately be declared by several
 * files (a module split across files), so declarers are a set — collapsing them
 * to a single owner made the last registration win and silently dropped the
 * other declarers from propagation and from the lint fingerprint.
 */
export class WorkspaceDependencyGraph {
  /** namespace (lower) → fileUris that declare it */
  private readonly declarersByNamespace = new Map<string, Set<string>>();

  /** namespace (lower) → fileUris that import it */
  private readonly importersByNamespace = new Map<string, Set<string>>();

  /** fileUri (lower) → namespaces declared in that file */
  private readonly declaredNamespacesByFile = new Map<string, Set<string>>();

  /** fileUri (lower) → namespaces imported by that file */
  private readonly importedNamespacesByFile = new Map<string, Set<string>>();

  public clear(): void {
    this.declarersByNamespace.clear();
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
      addToBucket(this.declarersByNamespace, ns, fileKey);
    }
    this.declaredNamespacesByFile.set(fileKey, declared);

    const imported = new Set<string>();
    for (const imp of file.imports) {
      const ns = imp.toLowerCase();
      imported.add(ns);
      addToBucket(this.importersByNamespace, ns, fileKey);
    }
    this.importedNamespacesByFile.set(fileKey, imported);
  }

  public unregisterFile(fileUri: string): void {
    const fileKey = normalizeUri(fileUri);

    const oldDeclared = this.declaredNamespacesByFile.get(fileKey);
    if (oldDeclared) {
      for (const ns of oldDeclared) {
        removeFromBucket(this.declarersByNamespace, ns, fileKey);
      }
    }

    const oldImported = this.importedNamespacesByFile.get(fileKey);
    if (oldImported) {
      for (const ns of oldImported) {
        removeFromBucket(this.importersByNamespace, ns, fileKey);
      }
    }

    this.declaredNamespacesByFile.delete(fileKey);
    this.importedNamespacesByFile.delete(fileKey);
  }

  /**
   * Files directly affected by a change in `triggerUri`: importers of any
   * namespace it declares, plus co-declarers of those namespaces (which share
   * the same scope and therefore see each other's symbols).
   */
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
    for (const ns of targetNamespaces) {
      for (const importer of this.importersByNamespace.get(ns) ?? []) {
        if (importer !== triggerKey) {
          dependents.add(importer);
        }
      }
      // Co-declarers of a shared namespace. Previously this required scanning
      // every indexed file; the declarer buckets make it a direct lookup.
      for (const declarer of this.declarersByNamespace.get(ns) ?? []) {
        if (declarer !== triggerKey) {
          dependents.add(declarer);
        }
      }
    }

    return Array.from(dependents);
  }

  /**
   * Transitive closure of {@link getDependentFileUris}. An API change in `A`
   * reaches `C` when `B` imports `A` and `C` imports `B`; direct-only
   * propagation left `C` showing diagnostics that no longer applied.
   */
  public getTransitiveDependents(
    triggerUri: string,
    options: TransitiveDependentsOptions = {},
  ): readonly string[] {
    const maxDepth = options.maxDepth ?? DEFAULT_DEPENDENT_MAX_DEPTH;
    const triggerKey = normalizeUri(triggerUri);

    const collected = new Set<string>();
    const visited = new Set<string>([triggerKey]);
    let frontier = this.getDependentFileUris(triggerUri, options.extraNamespaces);

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const uri of frontier) {
        const key = normalizeUri(uri);
        if (visited.has(key)) continue;
        visited.add(key);
        collected.add(key);
        // Extra namespaces only apply to the origin: they describe what the
        // trigger renamed, not what its dependents declare.
        next.push(...this.getDependentFileUris(key));
      }
      frontier = next;
    }

    return Array.from(collected);
  }

  /** Every file that declares `namespace`, in stable order. */
  public getDeclaringFileUris(namespace: string): readonly string[] {
    const declarers = this.declarersByNamespace.get(namespace.toLowerCase());
    if (!declarers || declarers.size === 0) return [];
    return Array.from(declarers).sort();
  }

  /**
   * First declaring file for `namespace`, in stable order. Kept for callers
   * that need a single representative; prefer {@link getDeclaringFileUris}
   * when the namespace may be split across files.
   */
  public getDeclaringFileUri(namespace: string): string | undefined {
    return this.getDeclaringFileUris(namespace)[0];
  }
}

function addToBucket(map: Map<string, Set<string>>, key: string, value: string): void {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = new Set<string>();
    map.set(key, bucket);
  }
  bucket.add(value);
}

function removeFromBucket(map: Map<string, Set<string>>, key: string, value: string): void {
  const bucket = map.get(key);
  if (!bucket) return;
  bucket.delete(value);
  if (bucket.size === 0) {
    map.delete(key);
  }
}

function normalizeUri(uri: string): string {
  return uri.toLowerCase();
}
