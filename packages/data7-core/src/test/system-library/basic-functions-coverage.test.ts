import "../_setup/global-hooks";
import * as fs from "fs";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { SYSTEM_SYMBOLS } from "../../system-library";
import type { SymbolInfo } from "../../analysis/symbol-indexer";

const BASIC_FUNCTIONS_EXAMPLE =
  "C:/Users/Matheus/Downloads/Telegram Desktop/Data7 Projetos - Manuais - Regras - Scripts e Relatorios/Projetos/Exemplo/Funcoes Projetos Basic.txt";

interface BasicFunctionSignature {
  readonly line: number;
  readonly container: string;
  readonly member: string;
}

function parseBasicFunctionSignatures(filePath: string): BasicFunctionSignature[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return content
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/);
      if (!match) return undefined;
      const [, container, member] = match;
      if (!container || !member) return undefined;
      return { line: index + 1, container, member };
    })
    .filter((signature): signature is BasicFunctionSignature => signature !== undefined);
}

function resolveInChain(startContainer: string, memberName: string): readonly SymbolInfo[] {
  const visited = new Set<string>();
  let currentContainer: string | undefined = startContainer;
  const matches: SymbolInfo[] = [];

  while (currentContainer && !visited.has(currentContainer.toLowerCase())) {
    visited.add(currentContainer.toLowerCase());

    for (const symbol of SYSTEM_SYMBOLS) {
      if (symbol.containerName?.toLowerCase() !== currentContainer.toLowerCase()) continue;
      if (symbol.name.toLowerCase() === memberName.toLowerCase()) matches.push(symbol);
    }

    const parent = SYSTEM_SYMBOLS.find(
      (symbol) =>
        symbol.kind === "class" && symbol.name.toLowerCase() === currentContainer?.toLowerCase(),
    );
    currentContainer = parent?.inheritsFrom;
  }

  return matches;
}

describe("System Library - Funcoes Projetos Basic coverage", () => {
  if (!fs.existsSync(BASIC_FUNCTIONS_EXAMPLE)) {
    test("Skipped (Funcoes Projetos Basic.txt not found)", () => {
      // noop
    });
    return;
  }

  const signatures = parseBasicFunctionSignatures(BASIC_FUNCTIONS_EXAMPLE);

  test("all listed primitive members are present", () => {
    assert.equal(signatures.length, 281);

    const missing = signatures.filter(
      (signature) => resolveInChain(signature.container, signature.member).length === 0,
    );

    assert.deepEqual(
      missing.map((signature) => `${signature.line}:${signature.container}.${signature.member}`),
      [],
    );
  });
});
