/**
 * Tool `data7_list_diagnostic_codes` — enumerates the linter's stable
 * diagnostic codes together with the trigger example path (when one
 * exists under `docs/exemple/diagnostics/<code>/`).
 *
 * Used by agents that want to teach the user the right code action to
 * apply, or to surface "did you mean missing-import?" suggestions.
 */
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DiagnosticCodes } from "../../diagnostics/diagnostic-codes";
import { getDocsRoot } from "../utils/paths";

interface DiagnosticEntry {
  readonly code: string;
  readonly enumKey: string;
  readonly hasTrigger: boolean;
  readonly hasAfterQuickfix: boolean;
}

function buildCatalog(): DiagnosticEntry[] {
  const diagnosticsDir = path.join(getDocsRoot(), "exemple", "diagnostics");
  return Object.entries(DiagnosticCodes).map(([enumKey, code]) => {
    const folder = path.join(diagnosticsDir, code);
    return {
      code,
      enumKey,
      hasTrigger: fs.existsSync(path.join(folder, "trigger.bas")),
      hasAfterQuickfix: fs.existsSync(path.join(folder, "after-quickfix.bas")),
    };
  });
}

export function registerListDiagnosticCodes(server: McpServer): void {
  server.registerTool(
    "data7_list_diagnostic_codes",
    {
      title: "Listar códigos de diagnóstico do linter",
      description:
        "Enumera todos os DiagnosticCodes emitidos pelo linter Data7 com informação de onde encontrar exemplo de trigger e Quick Fix.",
      inputSchema: {
        filter: z
          .string()
          .optional()
          .describe(
            'Substring para filtrar (case-insensitive). Exemplos: "import", "destructure".',
          ),
      },
    },
    (args) => {
      const catalog = buildCatalog();
      const filter = args.filter;
      const filtered = filter
        ? catalog.filter(
            (entry) =>
              entry.code.toLowerCase().includes(filter.toLowerCase()) ||
              entry.enumKey.toLowerCase().includes(filter.toLowerCase()),
          )
        : catalog;
      const text = JSON.stringify(
        {
          total: catalog.length,
          returned: filtered.length,
          entries: filtered,
        },
        null,
        2,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
