import * as fs from "fs";
import * as path from "path";

/**
 * Loads a Data7 Basic fixture file from `src/test/_fixtures/`.
 *
 * Use this to keep test files clean — long `.bas` snippets live in their own
 * `.bas` (or `.7proj`) files under `_fixtures/`, not as inline template
 * strings cluttering the assertion logic.
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
