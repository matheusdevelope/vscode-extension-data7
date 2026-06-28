/**
 * Walks backward from endIndex - 1, skipping balanced parentheses and brackets,
 * to find the start of the member access chain.
 */
export function getChainPrefix(line: string, endIndex: number): string {
  let i = endIndex - 1;
  let parenDepth = 0;
  let inString = false;

  while (i >= 0) {
    const c = line[i];
    if (c === undefined) {
      break;
    }
    if (c === '"') {
      inString = !inString;
      i--;
      continue;
    }
    if (inString) {
      i--;
      continue;
    }

    if (c === ")") {
      parenDepth++;
      i--;
      continue;
    } else if (c === "(") {
      parenDepth--;
      if (parenDepth < 0) {
        break;
      }
      // The `(` just closed a balanced paren group — it is part of the
      // call expression and must NOT be checked against the top-level
      // character filter.
      i--;
      continue;
    }

    if (parenDepth === 0) {
      // At top level of the chain, we only allow alphanumeric, _, and .
      if (c === "." || /[a-zA-Z0-9_]/.test(c)) {
        // Ok, continue
      } else {
        // Any other character (including space/tab, =, +, -, comma at top level) stops the chain
        break;
      }
    }
    i--;
  }

  return line.substring(i + 1, endIndex).trim();
}
