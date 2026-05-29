/**
 * Tool `data7_get_official_example` — returns the ERP-authored
 * signature + description + worked example for a given qualified name.
 * Reads from `out/mcp/data/articles.json` (M1.5 bundle).
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { findOfficialArticle, listOfficialArticles } from "../resources/official";

export function registerGetOfficialExample(server: McpServer): void {
  server.registerTool(
    "data7_get_official_example",
    {
      title: "Obter exemplo oficial do ERP Data7",
      description:
        "Retorna assinatura + descrição + exemplo canônico de um método/propriedade nativo (extraído da Base de Conhecimento Se7e Sistemas).",
      inputSchema: {
        qualifiedName: z
          .string()
          .min(1)
          .describe(
            'Nome qualificado do símbolo. Exemplos: "Collections.StringList.Add", "TJSONObject.Has", "Net.TFTP.Connect".',
          ),
      },
    },
    (args) => {
      const article = findOfficialArticle(args.qualifiedName);
      if (!article) {
        // Provide actionable feedback: suggest the 5 closest names.
        const lower = args.qualifiedName.toLowerCase();
        const suggestions = listOfficialArticles()
          .filter((a) => a.qualifiedName.toLowerCase().includes(lower.split(".").pop() ?? lower))
          .slice(0, 5)
          .map((a) => a.qualifiedName);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  qualifiedName: args.qualifiedName,
                  found: false,
                  suggestions,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(article, null, 2) }],
      };
    },
  );
}
