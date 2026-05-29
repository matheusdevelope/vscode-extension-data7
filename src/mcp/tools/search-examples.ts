/**
 * Tool `data7_search_examples` — full-text search across the canonical
 * `.bas` examples under `docs/exemple/`. Searches in headers
 * (`@example`, `@demonstrates`) and in the body content. Returns a
 * compact list of matches with their relative paths so the agent can
 * fetch the full file via `data7_get_canonical_example` or
 * `data7://examples/<path>`.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { listExamples, type ExampleEntry } from "../resources/examples";

interface Match {
  readonly relativePath: string;
  readonly demonstrates?: string;
  readonly diagnostics: readonly { code: string; line: number }[];
  readonly snippet: string;
}

function snippetAround(content: string, needleLower: string): string {
  const idx = content.toLowerCase().indexOf(needleLower);
  if (idx === -1) return content.slice(0, 200);
  const start = Math.max(0, idx - 60);
  const end = Math.min(content.length, idx + 140);
  return (start > 0 ? "…" : "") + content.slice(start, end).replace(/\s+/g, " ").trim();
}

function scoreEntry(entry: ExampleEntry, queryLower: string): number {
  let score = 0;
  if (entry.header?.demonstrates.toLowerCase().includes(queryLower)) score += 5;
  if (entry.relativePath.toLowerCase().includes(queryLower)) score += 3;
  for (const d of entry.header?.diagnostics ?? []) {
    if (d.code.toLowerCase().includes(queryLower)) score += 4;
  }
  if (entry.content.toLowerCase().includes(queryLower)) score += 1;
  return score;
}

export function registerSearchExamples(server: McpServer): void {
  server.registerTool(
    "data7_search_examples",
    {
      title: "Buscar exemplos canônicos Data7 Basic",
      description:
        "Procura por palavra-chave nos headers e corpos dos exemplos versionados em docs/exemple/. Retorna paths para data7_get_canonical_example.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            'Palavra-chave a procurar. Exemplos: "for-each", "BaseEnum", "missing-import", "ternário".',
          ),
        category: z
          .enum(["sugar", "diagnostics", "builder"])
          .optional()
          .describe("Restringe a uma categoria top-level (sugar / diagnostics / builder)."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Máximo de resultados (default 10)."),
      },
    },
    (args) => {
      const limit = args.limit ?? 10;
      const q = args.query.toLowerCase();

      const candidates = args.category
        ? listExamples().filter((e) => e.relativePath.startsWith(`${args.category}/`))
        : listExamples();

      const scored = candidates
        .map((entry) => ({ entry, score: scoreEntry(entry, q) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      const matches: Match[] = scored.map(({ entry }) => ({
        relativePath: entry.relativePath,
        demonstrates: entry.header?.demonstrates,
        diagnostics: entry.header?.diagnostics ?? [],
        snippet: snippetAround(entry.content, q),
      }));

      const text = JSON.stringify(
        {
          query: args.query,
          totalMatches: scored.length,
          matches,
        },
        null,
        2,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
