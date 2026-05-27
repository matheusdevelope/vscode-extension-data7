import type { ParameterInfo } from "../analysis/symbol-indexer";

/**
 * Renders a single `ParameterInfo` in Data7 Basic surface syntax:
 *
 *     [ByRef ][Optional ]name[ As Type][ = default]
 *
 * Centralises the formatting used by hover previews, signature help and the
 * Markdown docs generator so they stay byte-for-byte consistent.
 */
export function formatParameter(p: ParameterInfo): string {
  let str = "";
  if (p.isByRef) str += "ByRef ";
  if (p.isOptional && !p.defaultValue) str += "Optional ";
  str += p.name;
  if (p.type) str += ` As ${p.type}`;
  if (p.defaultValue) str += ` = ${p.defaultValue}`;
  return str;
}

/**
 * Renders a parameter list with surrounding parens. Empty / undefined lists
 * collapse to `()`.
 */
export function formatParameterList(parameters: ParameterInfo[] | undefined): string {
  if (!parameters || parameters.length === 0) return "()";
  return "(" + parameters.map(formatParameter).join(", ") + ")";
}
