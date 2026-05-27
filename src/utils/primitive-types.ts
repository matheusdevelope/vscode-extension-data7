/**
 * Canonical set of primitive / globally-available type names (lower-cased)
 * that the linter and the System Library audit script must agree on.
 *
 * Adding a primitive here makes it visible to every consumer simultaneously
 * (linter, audit, future autocompletion filters). Names are compared
 * case-insensitively, so callers should `.toLowerCase()` their input before
 * `.has()`.
 */
export const PRIMITIVE_TYPES: ReadonlySet<string> = new Set([
  "string",
  "integer",
  "double",
  "boolean",
  "tdatetime",
  "date",
  "variant",
  "tobject",
  "void",
  "single",
  "char",
  "byte",
  "long",
  "decimal",
  "short",
  // Delphi-native names that surface in the original autocomplete (TMS/VCL).
  // Treated as primitives so the linter and the audit script don't complain
  // when a Grid property declares its type as `UnicodeString`, `WideChar`,
  // `Pointer`, etc.
  "unicodestring",
  "widechar",
  "pointer",
  "shortstring",
  "longint",
  "pvoid",
  "hresult",
  "iinterface",
  "tclass",
]);
