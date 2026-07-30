import { isUglifyReservedName } from "./reserved-names";

/**
 * Allocates short identifiers (`a`…`z`, `a0`…`z9`, `a10`…) avoiding reserved
 * and already-taken names.
 */
export class ShortNameAllocator {
  private readonly taken: Set<string>;
  private index = 0;

  public constructor(seedTaken?: Iterable<string>) {
    this.taken = new Set(
      [...(seedTaken ?? [])].map((name) => name.toLowerCase()).filter((name) => name.length > 0),
    );
  }

  public next(): string {
    for (;;) {
      const candidate = indexToName(this.index++);
      const lower = candidate.toLowerCase();
      if (this.taken.has(lower) || isUglifyReservedName(candidate)) continue;
      this.taken.add(lower);
      return candidate;
    }
  }

  public markTaken(name: string): void {
    const lower = name.toLowerCase();
    if (lower.length > 0) this.taken.add(lower);
  }
}

function indexToName(index: number): string {
  // a..z, then a0..z0, a1..z1, ...
  if (index < 26) {
    return String.fromCharCode(97 + index);
  }
  const shifted = index - 26;
  const letter = String.fromCharCode(97 + (shifted % 26));
  const suffix = Math.floor(shifted / 26);
  return `${letter}${suffix}`;
}
