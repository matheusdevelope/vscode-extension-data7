import { randomUUID } from "crypto";

/**
 * Generates a Data7-style GUID in the format `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}`
 * (braces, uppercase, hyphenated) backed by `crypto.randomUUID()` for proper entropy
 * and uniqueness guarantees instead of `Math.random()`.
 */
export function generateProjectGuid(): string {
  return `{${randomUUID().toUpperCase()}}`;
}
