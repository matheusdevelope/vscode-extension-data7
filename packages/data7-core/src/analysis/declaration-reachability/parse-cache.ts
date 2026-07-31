import { parseBasic, type ParseResult } from "../../project/parser";
import { hashContent } from "../../utils/content-hash";

interface CacheEntry {
  readonly hash: string;
  readonly parse: ParseResult;
}

/**
 * Memoizes the plain (option-free) parses used by declaration reachability.
 *
 * `unused-code` is a whole-project analysis that runs on a debounce while the
 * user types. Re-parsing every module on every pass dominated the extension
 * host's CPU time; entries are keyed by file so a single edit re-parses one
 * module instead of the workspace.
 *
 * The AST cached here is intentionally *not* the one in `LanguageProcessor`:
 * reachability parses without sugar/generics plugins, so the two ASTs are not
 * interchangeable.
 */
export class ReachabilityParseCache {
  private static instance: ReachabilityParseCache | undefined;
  private readonly entries = new Map<string, CacheEntry>();

  public static getInstance(): ReachabilityParseCache {
    ReachabilityParseCache.instance ??= new ReachabilityParseCache();
    return ReachabilityParseCache.instance;
  }

  public static resetForTests(): void {
    ReachabilityParseCache.instance?.clear();
    ReachabilityParseCache.instance = undefined;
  }

  public getOrParse(fileUri: string, code: string): ParseResult {
    const key = fileUri.toLowerCase();
    const hash = hashContent(code);
    const cached = this.entries.get(key);
    if (cached && cached.hash === hash) {
      return cached.parse;
    }
    const parse = parseBasic(code);
    this.entries.set(key, { hash, parse });
    return parse;
  }

  public invalidate(fileUri: string): void {
    this.entries.delete(fileUri.toLowerCase());
  }

  /** Drops entries for files no longer present in the analyzed set. */
  public retainOnly(fileUris: Iterable<string>): void {
    const keep = new Set<string>();
    for (const uri of fileUris) {
      keep.add(uri.toLowerCase());
    }
    for (const key of Array.from(this.entries.keys())) {
      if (!keep.has(key)) {
        this.entries.delete(key);
      }
    }
  }

  public clear(): void {
    this.entries.clear();
  }

  public get size(): number {
    return this.entries.size;
  }
}
