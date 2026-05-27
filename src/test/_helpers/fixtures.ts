import * as fs from "fs";
import * as path from "path";

/**
 * Loads a Data7 Basic fixture file from `src/test/_fixtures/`.
 *
 * Use this to keep test files clean — long `.bas` snippets live in their own
 * `.bas` (or `.7proj`) files under `_fixtures/`, not as inline template
 * strings cluttering the assertion logic.
 *
 * Reserved for **internal-only** fixtures: malformed input, edge cases,
 * oversized projects. For canonical examples that double as language
 * documentation, use {@link loadExample} instead.
 *
 * The path is resolved against this file's directory at test runtime, so it
 * works whether tests run from `src/test/` (ts-node) or `out/test/` (compiled).
 */
export function loadFixture(relativePath: string): string {
  // When compiled, this file lives at `out/test/_helpers/fixtures.js` and the
  // fixtures sit alongside the TS source. Try both locations.
  const candidates = [
    path.join(__dirname, "..", "_fixtures", relativePath), // out/test/_fixtures
    path.join(__dirname, "..", "..", "..", "src", "test", "_fixtures", relativePath), // src/test/_fixtures
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, "utf-8");
  }
  throw new Error(`Fixture not found: ${relativePath}. Looked in:\n  ${candidates.join("\n  ")}`);
}

/**
 * Loads a canonical Data7 Basic example from `docs/exemple/`. Same role as
 * {@link loadFixture}, but the file lives in the public, documentation-grade
 * folder so the same artifact is both a reference for ERP devs and a test
 * fixture for the extension. See `docs/exemple/README.md` for the layout and
 * for the contract of the header comment block.
 *
 * `relativePath` is relative to `docs/exemple/`, e.g.
 * `"sugar/for-each/01-stringlist-explicit-type.bas"`.
 *
 * When the file is missing, the error message lists every candidate path
 * tried so refactors that move the `out/` layout fail loudly instead of
 * silently bypassing the example.
 */
export function loadExample(relativePath: string): string {
  // Walk up from `out/test/_helpers/` (compiled) or `src/test/_helpers/`
  // (source) to the repository root, then into `docs/exemple/`.
  const candidates = [
    path.join(__dirname, "..", "..", "..", "docs", "exemple", relativePath), // out/test/_helpers → repo root
    path.join(__dirname, "..", "..", "..", "..", "docs", "exemple", relativePath), // src/test/_helpers (4 hops via out/)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, "utf-8");
  }
  throw new Error(`Example not found: ${relativePath}. Looked in:\n  ${candidates.join("\n  ")}`);
}

/**
 * Parsed shape of the `' @example / @demonstrates / @diagnostics / …` header
 * block that every `.bas` under `docs/exemple/` opens with.
 *
 * `diagnostics` is an array of `{ code, line }` parsed from
 * `@diagnostics: code@LINE[, code@LINE...]` (or empty when the header reads
 * `@diagnostics: none`). `line` is 1-based and matches the line number shown
 * in the editor — i.e. it counts the header itself.
 */
export interface ExampleHeader {
  readonly example: string;
  readonly demonstrates: string;
  readonly diagnostics: readonly { readonly code: string; readonly line: number }[];
  readonly transpiledTo?: string;
  readonly requires?: string;
}

/**
 * Parses the leading `' @tag: value` block from an example loaded via
 * {@link loadExample}. The header MUST live in the contiguous block of
 * comment lines that opens the file; the parser stops at the first non-comment
 * (or blank) line.
 *
 * Throws when a required tag (`@example`, `@demonstrates`, `@diagnostics`)
 * is missing or malformed — drift between the example header and the test
 * expectation surfaces as a noisy failure, never as silent skip.
 */
export function parseExampleHeader(code: string): ExampleHeader {
  const tags = new Map<string, string>();
  const lines = code.split(/\r?\n/);
  for (const lineText of lines) {
    const trimmed = lineText.trim();
    if (trimmed === "" || trimmed === "'") break;
    if (!trimmed.startsWith("'")) break;
    const body = trimmed.slice(1).trim();
    if (!body.startsWith("@")) continue;
    const colonIdx = body.indexOf(":");
    if (colonIdx === -1) continue;
    const tag = body.slice(1, colonIdx).trim().toLowerCase();
    const value = body.slice(colonIdx + 1).trim();
    tags.set(tag, value);
  }

  const example = tags.get("example");
  const demonstrates = tags.get("demonstrates");
  const diagnosticsRaw = tags.get("diagnostics");
  if (!example) throw new Error("Example header missing required tag @example");
  if (!demonstrates) throw new Error("Example header missing required tag @demonstrates");
  if (diagnosticsRaw === undefined) {
    throw new Error("Example header missing required tag @diagnostics");
  }

  const diagnostics: { code: string; line: number }[] = [];
  if (diagnosticsRaw.toLowerCase() !== "none") {
    for (const part of diagnosticsRaw.split(",")) {
      const entry = part.trim();
      if (!entry) continue;
      const atIdx = entry.lastIndexOf("@");
      if (atIdx === -1) {
        throw new Error(`Invalid @diagnostics entry "${entry}" — expected "code@line".`);
      }
      const code = entry.slice(0, atIdx).trim();
      const line = Number.parseInt(entry.slice(atIdx + 1).trim(), 10);
      if (!code || !Number.isInteger(line)) {
        throw new Error(`Invalid @diagnostics entry "${entry}" — expected "code@line".`);
      }
      diagnostics.push({ code, line });
    }
  }

  return {
    example,
    demonstrates,
    diagnostics,
    transpiledTo: tags.get("transpiled-to"),
    requires: tags.get("requires"),
  };
}
