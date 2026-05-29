/**
 * Resource `data7://diagnostics/codes` — catalog of every diagnostic
 * emitted by the live linter or by the SugarTranspiler at build time.
 *
 * The payload is rendered from the canonical `DiagnosticCodes` table in
 * `src/diagnostics/diagnostic-codes.ts` plus per-code trigger snippets
 * loaded from `docs/exemple/diagnostics/<code>/trigger.bas` when
 * available.
 */
import * as fs from "fs";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DiagnosticCodes } from "../../diagnostics/diagnostic-codes";
import { getDocsRoot } from "../utils/paths";

const URI = "data7://diagnostics/codes";

interface CodeEntry {
  readonly code: string;
  readonly enumKey: string;
  readonly triggerExamplePath?: string;
}

function loadCatalog(): CodeEntry[] {
  const triggersDir = path.join(getDocsRoot(), "exemple", "diagnostics");
  return Object.entries(DiagnosticCodes).map(([enumKey, code]) => {
    const triggerPath = path.join(triggersDir, code, "trigger.bas");
    return {
      code,
      enumKey,
      triggerExamplePath: fs.existsSync(triggerPath) ? triggerPath : undefined,
    };
  });
}

function buildMarkdown(): string {
  const catalog = loadCatalog();
  const lines: string[] = [];
  lines.push("# Diagnósticos do Data7 Dev Studio");
  lines.push("");
  lines.push(
    `Total: ${String(catalog.length)} códigos. Cada código é emitido com ` +
      "um payload tipado em `Diagnostic.data` para que Code Actions e clientes externos " +
      "possam agir sem regex sobre a mensagem.",
  );
  lines.push("");
  lines.push("| Código | Constante | Exemplo trigger |");
  lines.push("|---|---|---|");
  for (const entry of catalog.sort((a, b) => a.code.localeCompare(b.code))) {
    const triggerLink = entry.triggerExamplePath
      ? `\`data7://examples/diagnostics/${entry.code}/trigger\``
      : "(ainda não documentado)";
    lines.push(`| \`${entry.code}\` | \`${entry.enumKey}\` | ${triggerLink} |`);
  }
  lines.push("");
  lines.push(
    "Para o detalhe de payload + Code Action de cada código, consulte " +
      "`data7://language/diagnostic-codes`.",
  );
  return lines.join("\n");
}

export function registerDiagnosticCodes(server: McpServer): void {
  server.registerResource(
    "data7-diagnostic-codes",
    URI,
    {
      title: "Catálogo de diagnósticos",
      description: "Todos os DiagnosticCodes emitidos pelo linter + transpiler.",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: buildMarkdown() }],
    }),
  );
}
