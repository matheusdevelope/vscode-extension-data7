/**
 * Member-resolution cache whose entries know which file they came from.
 *
 * These caches used to be plain maps cleared wholesale on every indexer update,
 * so typing inside a method body threw away the member resolution of the entire
 * workspace and the next keystroke re-resolved everything from scratch. Tagging
 * each entry with its declaring file lets a body-only edit drop just that file's
 * entries (REFACTOR-ANALYSIS-ENGINE.md §8.2).
 */
export class MemberCache<TValue> {
  private readonly entries = new Map<string, TValue>();
  private readonly keysByFile = new Map<string, Set<string>>();
  /** Entries whose declaring file is unknown; conservatively dropped on any invalidation. */
  private readonly unownedKeys = new Set<string>();

  public has(key: string): boolean {
    return this.entries.has(key);
  }

  public get(key: string): TValue | undefined {
    return this.entries.get(key);
  }

  /**
   * @param ownerFileUri File declaring the type this entry describes. Omit only
   * when the answer is derived from several files and cannot be attributed.
   */
  public set(key: string, value: TValue, ownerFileUri?: string): void {
    this.entries.set(key, value);
    if (ownerFileUri === undefined) {
      this.unownedKeys.add(key);
      return;
    }
    const fileKey = ownerFileUri.toLowerCase();
    let keys = this.keysByFile.get(fileKey);
    if (!keys) {
      keys = new Set<string>();
      this.keysByFile.set(fileKey, keys);
    }
    keys.add(key);
  }

  /** Drops the entries declared by `fileUris`, plus every unattributed entry. */
  public invalidateFiles(fileUris: Iterable<string>): void {
    for (const key of this.unownedKeys) {
      this.entries.delete(key);
    }
    this.unownedKeys.clear();

    for (const fileUri of fileUris) {
      const fileKey = fileUri.toLowerCase();
      const keys = this.keysByFile.get(fileKey);
      if (!keys) continue;
      for (const key of keys) {
        this.entries.delete(key);
      }
      this.keysByFile.delete(fileKey);
    }
  }

  public clear(): void {
    this.entries.clear();
    this.keysByFile.clear();
    this.unownedKeys.clear();
  }

  public get size(): number {
    return this.entries.size;
  }
}
