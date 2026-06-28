/**
 * Tool `data7_search_symbol` — query the native System Library catalog by
 * symbol name (with optional container/kind filters). Returns a compact
 * list of `SymbolInfo`-like records.
 *
 * Backed by the O(1) lookups in `src/system-library/index.ts`
 * (`lookupSystemByName`, `lookupSystemByContainer`,
 * `lookupSystemClassByName`). No filesystem access.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { SYSTEM_SYMBOLS, lookupSystemByContainer, lookupSystemByName } from "../../system-library";
import type { SymbolInfo } from "../../analysis/symbol-indexer";

interface MinimalSymbol {
  name: string;
  kind: SymbolInfo["kind"];
  type: string;
  containerName?: string;
  description?: string;
  isUnsupported?: boolean;
}

function project(s: SymbolInfo): MinimalSymbol {
  return {
    name: s.name,
    kind: s.kind,
    type: s.type,
    containerName: s.containerName,
    description: s.description,
    isUnsupported: s.isUnsupported,
  };
}

export function registerSearchSymbol(server: McpServer): void {
  server.registerTool(
    "data7_search_symbol",
    {
      title: "Buscar símbolo na System Library",
      description:
        "Procura classes, funções, propriedades e métodos nativos do Data7 por nome (case-insensitive). Pode filtrar por container (Class/Namespace) e por kind.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "Nome ou prefixo do símbolo a buscar (case-insensitive). " +
              'Exemplos: "StringList", "TJSON", "Add".',
          ),
        container: z
          .string()
          .optional()
          .describe(
            "Restringe o resultado a um container específico (nome de classe ou namespace). " +
              'Exemplo: container="StringList" lista apenas membros dessa classe.',
          ),
        kind: z
          .enum([
            "namespace",
            "class",
            "structure",
            "delegate",
            "method",
            "property",
            "indexed-property",
            "variable",
            "declare_sub",
            "declare_function",
          ])
          .optional()
          .describe('Filtra por kind. Exemplo: kind="class" devolve só tipos.'),
        includeUnsupported: z
          .boolean()
          .optional()
          .describe(
            "Quando false (padrão) ignora membros marcados isUnsupported. Defina true para auditoria.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Máximo de resultados (default 30)."),
      },
    },
    (args) => {
      const limit = args.limit ?? 30;
      const includeUnsupported = args.includeUnsupported ?? false;
      const q = args.query.toLowerCase();

      // Two-pass search:
      //  - exact-name lookup via the O(1) index (preferred — minimal noise).
      //  - prefix/contains scan for fuzzy hits.
      const exact = lookupSystemByName(args.query);
      const containerScoped = args.container ? lookupSystemByContainer(args.container) : undefined;

      const seen = new Set<string>();
      const results: SymbolInfo[] = [];

      const accept = (s: SymbolInfo): void => {
        if (args.kind && s.kind !== args.kind) return;
        if (!includeUnsupported && s.isUnsupported) return;
        if (args.container && s.containerName?.toLowerCase() !== args.container.toLowerCase()) {
          return;
        }
        const key = `${s.containerName ?? ""}.${s.name}.${s.kind}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push(s);
      };

      for (const s of exact) accept(s);
      if (containerScoped) {
        for (const s of containerScoped) {
          if (s.name.toLowerCase().includes(q)) accept(s);
        }
      } else {
        for (const s of SYSTEM_SYMBOLS) {
          if (results.length >= limit * 2) break;
          if (s.name.toLowerCase().includes(q)) accept(s);
        }
      }

      const trimmed = results.slice(0, limit).map(project);
      const text = JSON.stringify(
        {
          query: args.query,
          totalFound: results.length,
          returned: trimmed.length,
          results: trimmed,
        },
        null,
        2,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
