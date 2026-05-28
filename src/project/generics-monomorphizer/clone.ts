import type { Node } from "./ast";

/**
 * Deep clones an AST node tree.
 *
 * Uses Node.js's native `structuredClone` (V8-native, available since
 * Node 17; the project pins `engines.node >=22.13.0` in `package.json`).
 * Works for our AST because every node is a plain JSON-compatible object
 * (no functions, no class instances, no circular references).
 *
 * If the AST ever gains fields that `structuredClone` cannot replicate
 * (Maps, Sets, class instances, Symbol-keyed properties, …), this helper
 * surfaces a `DataCloneError` at call time and we'll need to fall back to
 * a hand-written exhaustive clone keyed on `kind`.
 *
 * The generic constraint `T extends Node` is preserved through the cast so
 * call sites get back the same node subtype they passed in.
 */
export function deepClone<T extends Node>(node: T): T {
  return structuredClone(node);
}
