import { LANGUAGE_KEYWORD_SET } from "../../language/keywords";
import { SYSTEM_SYMBOLS } from "../../../system-library";

/** Names that must never be allocated or used as local/parameter renames. */
const EXTRA_RESERVED = [
  "me",
  "mybase",
  "myclass",
  "new",
  "free",
  "main",
  "true",
  "false",
  "nothing",
  "null",
  "addressof",
  "get",
  "set",
  "value", // property setter parameter convention
] as const;

let cachedAllReserved: ReadonlySet<string> | undefined;
let cachedLocalReserved: ReadonlySet<string> | undefined;

/**
 * Keywords + System Library symbol/container names (lowercased).
 * Used when deciding whether a *global* declaration may be renamed, and when
 * allocating short names (must not collide with native APIs).
 *
 * Instance members that share a System Library name (e.g. `Touch` on TControl)
 * are intentionally kept so `control.Touch` is not rewritten to a short name.
 */
export function getUglifyReservedNames(): ReadonlySet<string> {
  if (cachedAllReserved) return cachedAllReserved;
  const reserved = new Set<string>();
  for (const keyword of LANGUAGE_KEYWORD_SET) {
    reserved.add(keyword.toLowerCase());
  }
  for (const extra of EXTRA_RESERVED) {
    reserved.add(extra);
  }
  for (const symbol of SYSTEM_SYMBOLS) {
    reserved.add(symbol.name.toLowerCase());
    if (symbol.containerName) {
      for (const part of symbol.containerName.split(".")) {
        if (part.length > 0) reserved.add(part.toLowerCase());
      }
    }
  }
  cachedAllReserved = reserved;
  return reserved;
}

/**
 * Reserved set for method locals / parameters / delegate parameters.
 * Does **not** include System Library member names — `Dim pt` may become `a`
 * without breaking `msg.pt` on system types (member access uses a different path).
 */
export function getUglifyLocalReservedNames(): ReadonlySet<string> {
  if (cachedLocalReserved) return cachedLocalReserved;
  const reserved = new Set<string>();
  for (const keyword of LANGUAGE_KEYWORD_SET) {
    reserved.add(keyword.toLowerCase());
  }
  for (const extra of EXTRA_RESERVED) {
    reserved.add(extra);
  }
  cachedLocalReserved = reserved;
  return reserved;
}

export function isUglifyReservedName(name: string): boolean {
  return getUglifyReservedNames().has(name.toLowerCase());
}

export function isUglifyLocalReservedName(name: string): boolean {
  return getUglifyLocalReservedNames().has(name.toLowerCase());
}
