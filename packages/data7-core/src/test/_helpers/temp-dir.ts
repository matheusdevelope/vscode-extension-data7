import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Runs `fn` inside a freshly-created temporary directory whose path is
 * `os.tmpdir()/d7-test-XXXXXX`. The directory is removed (recursively, force)
 * after `fn` resolves or throws — guaranteeing cleanup even on assertion
 * failure.
 *
 * Replaces the `mkdtempSync` + `try / finally rmSync` boilerplate that was
 * duplicated across `builder.test.ts`, `dependency-scanner.test.ts`,
 * `activation-service.test.ts` and `docs-service.test.ts`.
 */
export async function withTempDir<T>(fn: (dir: string) => T | Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d7-test-"));
  try {
    return await fn(dir);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Synchronous variant for callers that cannot use async/await (e.g. legacy
 * sync tests). Prefer {@link withTempDir} for new code.
 */
export function withTempDirSync<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d7-test-"));
  try {
    return fn(dir);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}
