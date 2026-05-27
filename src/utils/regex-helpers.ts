/**
 * Escapes a literal string so it can be safely embedded inside a `RegExp`
 * pattern. Covers every character that has special meaning inside a regex
 * source — including `[`, `]`, `(`, `)`, `*`, `+`, `?`, `.`, `^`, `$`, `|`,
 * `{`, `}` and `\`.
 *
 * Centralised here so the reference / rename / document-link providers do not
 * each carry their own copy.
 */
export function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
