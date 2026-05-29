/**
 * Tool `data7_get_canonical_example` — returns the full `.bas` content
 * + parsed header of a specific example under `docs/exemple/`.
 *
 * Lighter than reading via the `data7://examples/<path>` Resource for
 * agents that just need the snippet without the URI-template ceremony.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { readExample } from "../resources/examples";

export function registerGetCanonicalExample(server: McpServer): void {
  server.registerTool(
    "data7_get_canonical_example",
    {
      title: "Carregar exemplo canônico Data7 Basic",
      description:
        "Retorna o conteúdo `.bas` e o header parseado de um exemplo específico (formato relativo, sem .bas). Use data7_search_examples para descobrir paths.",
      inputSchema: {
        relativePath: z
          .string()
          .min(1)
          .describe(
            'Caminho relativo a docs/exemple/, sem extensão. Exemplo: "sugar/for-each/01-stringlist-explicit-type".',
          ),
      },
    },
    (args) => {
      const entry = readExample(args.relativePath);
      if (!entry) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  relativePath: args.relativePath,
                  found: false,
                  message: "Exemplo não encontrado. Use data7_search_examples para buscar.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                relativePath: entry.relativePath,
                header: entry.header,
                content: entry.content,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
