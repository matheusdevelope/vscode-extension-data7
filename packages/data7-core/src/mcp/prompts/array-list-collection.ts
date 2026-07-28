/**
 * Prompt `data7_array_list_collection` — generates the modern typed
 * collection pattern using array-list sugar + TTList<T> from mod_tlist.
 * Preferred over `data7_typed_recordlist` for new code.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function buildPattern(
  elementTypeName: string,
  isObject: boolean,
  withFunctionalChain: boolean,
): string {
  const lines: string[] = [];
  lines.push("Imports mod_tlist");
  lines.push("");
  lines.push(`Namespace mod_${elementTypeName.toLowerCase()}_collection`);
  lines.push("");

  if (isObject) {
    lines.push(`   Class ${elementTypeName}`);
    lines.push("      Sub New()");
    lines.push("         MyBase.New()");
    lines.push("      End Sub");
    lines.push("");
    lines.push("      Sub Free()");
    lines.push("         MyBase.Free()");
    lines.push("      End Sub");
    lines.push("   End Class");
    lines.push("");
  }

  lines.push("   Sub ExemploColecao()");
  lines.push(`      Dim items[] As ${elementTypeName} = [`);

  if (isObject) {
    lines.push(`         New ${elementTypeName}(),`);
    lines.push(`         New ${elementTypeName}()`);
  } else {
    lines.push("         1,");
    lines.push("         2,");
    lines.push("         3");
  }

  lines.push("      ]");
  lines.push("");
  lines.push("      items.Push(4)");
  lines.push("");

  if (withFunctionalChain) {
    if (isObject) {
      lines.push(`      Dim filtrados[] As ${elementTypeName} = items.Filter(`);
      lines.push(`         Function(p As ${elementTypeName}) As Boolean True`);
      lines.push("      )");
      lines.push("");
      lines.push("      Dim total As Double = filtrados. _");
      lines.push(`         Map<Double>(Function(p As ${elementTypeName}) As Double 0.0). _`);
      lines.push(
        "         Reduce<Double>(Function(acc As Double, v As Double) As Double acc + v, 0.0)",
      );
    } else {
      lines.push(`      Dim pares[] As ${elementTypeName} = items.Filter(`);
      lines.push(`         Function(pItem As ${elementTypeName}) As Boolean pItem Mod 2 = 0`);
      lines.push("      )");
      lines.push("");
      lines.push(`      Dim soma As ${elementTypeName} = pares.Reduce<${elementTypeName}>(`);
      lines.push(
        `         Function(pAcc As ${elementTypeName}, pItem As ${elementTypeName}) As ${elementTypeName}`,
      );
      lines.push("            Return pAcc + pItem");
      lines.push("         End Function,");
      lines.push("         0");
      lines.push("      )");
    }
    lines.push("");
  }

  lines.push(`      For Each item As ${elementTypeName} In items`);
  lines.push("         ' processa item");
  lines.push("      Next");
  lines.push("   End Sub");
  lines.push("");
  lines.push("End Namespace");

  return lines.join("\n");
}

export function registerArrayListCollection(server: McpServer): void {
  server.registerPrompt(
    "data7_array_list_collection",
    {
      title: "Coleção tipada moderna (array-list)",
      description:
        "Gera coleção tipada com Dim items[] As T, literais [...] e cadeias Filter/Map/Reduce via sugar array-list. Padrão preferido para código novo.",
      argsSchema: {
        elementTypeName: z
          .string()
          .min(1)
          .describe('Nome do tipo elemento. Exemplo: "Product", "Integer", "CardRecord".'),
        isObject: z
          .boolean()
          .optional()
          .describe(
            "Quando true (default), gera classe elemento com Free(). Quando false, usa primitivo.",
          ),
        withFunctionalChain: z
          .boolean()
          .optional()
          .describe("Quando true (default), inclui exemplo Filter/Map/Reduce."),
      },
    },
    (args) => {
      const isObject = args.isObject ?? true;
      const withFunctionalChain = args.withFunctionalChain ?? true;
      const code = buildPattern(args.elementTypeName, isObject, withFunctionalChain);
      return {
        description: `Coleção array-list para ${args.elementTypeName}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Crie uma coleção tipada moderna para \`${args.elementTypeName}\` usando o sugar \`array-list\` ` +
                "(`Dim items[] As T`, literais `[...]`, `.Filter/.Map/.Reduce`). " +
                "Requer `Imports mod_tlist` e `language.sugars` + `language.generics` habilitados. " +
                "Para integração legada com CType/delegates, use `data7_typed_recordlist`.\n\n" +
                "```basic\n" +
                code +
                "\n```",
            },
          },
        ],
      };
    },
  );
}
