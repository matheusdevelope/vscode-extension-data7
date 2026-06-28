import * as path from "path";

/**
 * Resolves `candidate` against `rootDir` and rejects the result if it escapes the root.
 * Protects against path-traversal payloads (e.g. `..` segments) coming from untrusted
 * input such as XML node names parsed from `.7Proj` files or user-controlled settings.
 *
 * @throws Error if the resolved path is not inside `rootDir`.
 * @returns The normalized absolute path, guaranteed to live inside `rootDir`.
 */
export function safeJoinInside(rootDir: string, ...candidate: string[]): string {
  const normalizedRoot = path.resolve(rootDir);
  const resolved = path.resolve(normalizedRoot, ...candidate);

  const rootWithSep = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : normalizedRoot + path.sep;
  const isInside = resolved === normalizedRoot || resolved.startsWith(rootWithSep);

  if (!isInside) {
    throw new Error(`Caminho rejeitado por estar fora do diretório permitido: ${resolved}`);
  }
  return resolved;
}

/**
 * Validates that a string is a safe single-segment file/folder name:
 * no path separators, no `..`, no NUL byte, no reserved Windows characters.
 * Returns `true` when safe.
 */
export function isSafeSegment(name: string): boolean {
  if (!name || name.length === 0 || name.length > 255) return false;
  if (name === "." || name === "..") return false;
  if (/[\\/\0]/.test(name)) return false;
  if (/[<>:"|?*]/.test(name)) return false;
  return true;
}
