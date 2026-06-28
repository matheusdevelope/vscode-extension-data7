import type { SymbolInfo } from "./symbol-indexer";

/**
 * Shape returned by {@link detectEnumerable} when a type qualifies as
 * enumerable for the `For Each` sugar.
 *
 * - `countMember` is the exact case-sensitive member name (e.g. `Count`)
 *   that exposes the element count as an `Integer`.
 * - `indexerMember` is the exact case-sensitive member name (e.g. `Strings`,
 *   `Items`, `Objects`) that accepts a single `Integer` and returns the
 *   element type. May be a `method` or an `indexed-property`.
 * - `elementType` is the declared return type of the indexer (e.g. `String`,
 *   `TObject`, `Variant`). Used both as the default `Dim` type when the user
 *   omits `As <Type>` and as a tiebreaker when multiple indexers exist.
 */
export interface EnumerableInfo {
  readonly countMember: string;
  readonly indexerMember: string;
  readonly elementType: string;
}

/**
 * Preferred indexer names, in priority order, when the user does not
 * disambiguate via `As <Type>`. Matches the conventional Delphi/VCL accessor
 * names so a `Collections.StringList` resolves to `Strings` (not `Objects`)
 * by default.
 */
const PREFERRED_INDEXER_NAMES = ["items", "item", "strings", "objects"] as const;

/**
 * Decides whether `typeName` exposes the `Count` + single-`Integer`-indexer
 * pair required by the `For Each` sugar transpiler.
 *
 * The function is pure: callers inject the member lookup so it can be unit
 * tested without a `WorkspaceSymbolIndexer` and reused by both the linter
 * (`src/diagnostics/`) and the Builder transpiler (`src/project/`).
 *
 * `preferredElementType` (optional) lets the caller propagate the user's
 * explicit `As <Type>` in `For Each item As <Type> In coll`. When supplied,
 * the function prefers an indexer whose return type matches case-insensitively;
 * if no such indexer exists, the function falls back to the conventional
 * name priority and finally to the first matching indexer.
 *
 * Returns `undefined` when no `Count` property or no eligible indexer is found.
 */
export function detectEnumerable(
  typeName: string,
  lookupMembers: (typeName: string) => readonly SymbolInfo[],
  preferredElementType?: string,
): EnumerableInfo | undefined {
  if (!typeName) return undefined;

  const members = lookupMembers(typeName);
  if (members.length === 0) return undefined;

  const count = members.find(
    (m) =>
      m.name.toLowerCase() === "count" &&
      m.kind === "property" &&
      m.type.toLowerCase() === "integer",
  );
  if (!count) return undefined;

  const indexerCandidates = members.filter(
    (m): m is SymbolInfo & { parameters: NonNullable<SymbolInfo["parameters"]> } => {
      if (m.kind !== "method" && m.kind !== "indexed-property") return false;
      if (m.parameters?.length !== 1) return false;
      const firstParam = m.parameters[0];
      if (firstParam?.type.toLowerCase() !== "integer") return false;
      // Indexers must produce a value — `Void` accessors are not enumerable.
      return m.type.toLowerCase() !== "void";
    },
  );
  if (indexerCandidates.length === 0) return undefined;

  if (preferredElementType) {
    const preferredLower = preferredElementType.toLowerCase();
    const match = indexerCandidates.find((m) => m.type.toLowerCase() === preferredLower);
    if (match) {
      return {
        countMember: count.name,
        indexerMember: match.name,
        elementType: match.type,
      };
    }
  }

  for (const preferred of PREFERRED_INDEXER_NAMES) {
    const match = indexerCandidates.find((m) => m.name.toLowerCase() === preferred);
    if (match) {
      return {
        countMember: count.name,
        indexerMember: match.name,
        elementType: match.type,
      };
    }
  }

  // `indexerCandidates.length > 0` was asserted above; the guard satisfies
  // `noUncheckedIndexedAccess` without weakening the contract.
  const fallback = indexerCandidates[0];
  if (!fallback) return undefined;
  return {
    countMember: count.name,
    indexerMember: fallback.name,
    elementType: fallback.type,
  };
}
