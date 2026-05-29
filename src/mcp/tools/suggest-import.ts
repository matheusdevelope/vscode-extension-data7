/**
 * Tool `data7_suggest_import` — given a type name, returns the
 * `Imports <Namespace>` line(s) the agent should add to make the type
 * resolvable. Looks first at the System Library (`SYSTEM_SYMBOLS`),
 * then at the workspace indexer when one is available.
 *
 * This mirrors the same logic the live `D7BasicCodeActionProvider`
 * follows for the `missing-import` quick fix.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { SymbolInfo, WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { SYSTEM_SYMBOLS } from "../../system-library";

interface Suggestion {
  readonly namespace: string;
  readonly importLine: string;
  readonly source: "system-library" | "workspace";
  readonly typeKind: SymbolInfo["kind"];
}

export interface SuggestImportToolDeps {
  readonly getIndexer: () => WorkspaceSymbolIndexer;
}

function isTypeKind(kind: SymbolInfo["kind"]): boolean {
  return kind === "class" || kind === "structure" || kind === "delegate";
}

export function registerSuggestImport(server: McpServer, deps: SuggestImportToolDeps): void {
  server.registerTool(
    "data7_suggest_import",
    {
      title: "Sugerir cláusula Imports para um tipo",
      description:
        "Devolve a linha `Imports <Namespace>` que o agente deve adicionar para resolver um tipo. Consulta a System Library e o workspace indexado (quando --workspace está ativo).",
      inputSchema: {
        typeName: z
          .string()
          .min(1)
          .describe(
            'Nome simples do tipo (sem namespace). Exemplos: "StringList", "TForm", "TFTP", "TResourceLoader".',
          ),
      },
    },
    (args) => {
      const target = args.typeName.toLowerCase();
      const suggestions: Suggestion[] = [];
      const seen = new Set<string>();

      const accept = (
        ns: string,
        source: Suggestion["source"],
        typeKind: SymbolInfo["kind"],
      ): void => {
        const key = `${source}::${ns}`;
        if (seen.has(key)) return;
        seen.add(key);
        suggestions.push({
          namespace: ns,
          importLine: `Imports ${ns}`,
          source,
          typeKind,
        });
      };

      for (const symbol of SYSTEM_SYMBOLS) {
        if (!isTypeKind(symbol.kind)) continue;
        if (symbol.name.toLowerCase() !== target) continue;
        if (!symbol.containerName) continue;
        // Some catalog entries use the qualified container ("Forms.Form").
        // Trim down to the top-level namespace.
        const ns = symbol.containerName.includes(".")
          ? symbol.containerName.slice(0, symbol.containerName.indexOf("."))
          : symbol.containerName;
        accept(ns, "system-library", symbol.kind);
      }

      try {
        const indexer = deps.getIndexer();
        for (const symbol of indexer.getAllSymbols()) {
          if (!isTypeKind(symbol.kind)) continue;
          if (symbol.name.toLowerCase() !== target) continue;
          if (!symbol.containerName) continue;
          accept(symbol.containerName, "workspace", symbol.kind);
        }
      } catch {
        // Indexer access may fail in --standalone; ignore.
      }

      const text = JSON.stringify(
        {
          typeName: args.typeName,
          count: suggestions.length,
          suggestions,
        },
        null,
        2,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
