/**
 * Prompt `data7_typed_recordlist` — generates the legacy typed
 * subclass of `TTList` with CType/delegates. Use only for legacy
 * integration or when Filter must return a concrete subclass type.
 * For new code, prefer `data7_array_list_collection`.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function buildPattern(elementTypeName: string): string {
  const listName = `${elementTypeName}List`;
  const findDelegate = `${elementTypeName}FindDelegate`;
  const mapDelegate = `${elementTypeName}MapDelegate`;
  const forEachDelegate = `${elementTypeName}ForEachDelegate`;

  const lines: string[] = [];
  lines.push(
    `Delegate Function ${findDelegate}(pValue As ${elementTypeName}, i As Integer, extra As Variant) As Boolean`,
  );
  lines.push(
    `Delegate Function ${mapDelegate}(pValue As ${elementTypeName}, i As Integer, extra As Variant) As ${elementTypeName}`,
  );
  lines.push(
    `Delegate Sub ${forEachDelegate}(pValue As ${elementTypeName}, i As Integer, extra As Variant)`,
  );
  lines.push("");
  lines.push(`Class ${listName}`);
  lines.push(`   Inherits TTList`);
  lines.push("");
  lines.push(`   Sub New()`);
  lines.push(`      MyBase.New("${listName}")`);
  lines.push(`   End Sub`);
  lines.push("");
  lines.push(`   Property Item(pIndex As Integer) As ${elementTypeName}`);
  lines.push(`      Get`);
  lines.push(`         Item = CType(MyBase.Take(pIndex), ${elementTypeName})`);
  lines.push(`      End Get`);
  lines.push(`      Set(pValue As ${elementTypeName})`);
  lines.push(`         me.SetItem(pIndex, pValue)`);
  lines.push(`      End Set`);
  lines.push(`   End Property`);
  lines.push("");
  lines.push(`   Function Take(pIndex As Integer) As ${elementTypeName}`);
  lines.push(`      Take = CType(MyBase.Take(pIndex), ${elementTypeName})`);
  lines.push(`   End Function`);
  lines.push("");
  lines.push(`   Function First As ${elementTypeName}`);
  lines.push(`      First = CType(MyBase.First, ${elementTypeName})`);
  lines.push(`   End Function`);
  lines.push("");
  lines.push(`   Function Last As ${elementTypeName}`);
  lines.push(`      Last = CType(MyBase.Last, ${elementTypeName})`);
  lines.push(`   End Function`);
  lines.push("");
  lines.push(
    `   Function Find(handler As ${findDelegate}, extra As Variant) As ${elementTypeName}`,
  );
  lines.push(`      Find = CType(MyBase.Find(handler, extra), ${elementTypeName})`);
  lines.push(`   End Function`);
  lines.push("");
  lines.push(`   Function Filter(handler As ${findDelegate}, extra As Variant) As ${listName}`);
  lines.push(`      Filter = CType(MyBase.Filter(handler, extra), ${listName})`);
  lines.push(`   End Function`);
  lines.push("");
  lines.push(`   Sub ForEach(handler As ${forEachDelegate}, extra As Variant)`);
  lines.push(`      MyBase.ForEach(handler, extra)`);
  lines.push(`   End Sub`);
  lines.push("");
  lines.push(`   Function Map(handler As ${mapDelegate}, extra As Variant) As ${listName}`);
  lines.push(`      Map = CType(MyBase.Map(handler, extra), ${listName})`);
  lines.push(`   End Function`);
  lines.push("");
  lines.push(`End Class`);

  return lines.join("\n");
}

export function registerTypedRecordList(server: McpServer): void {
  server.registerPrompt(
    "data7_typed_recordlist",
    {
      title: "Subclasse tipada de TTList (legado)",
      description:
        "Gera subclasse TTList com delegates Find/Map/ForEach e re-tipagem via CType. Use somente para integração legada ou quando Filter retorna subclasse concreta. Para código novo, prefira data7_array_list_collection.",
      argsSchema: {
        elementTypeName: z
          .string()
          .min(1)
          .describe('Nome da classe-elemento. Exemplo: "CardRecord", "PaymentRecord".'),
      },
    },
    (args) => {
      const code = buildPattern(args.elementTypeName);
      return {
        description: `TTList tipado para ${args.elementTypeName}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Crie a subclasse tipada legada \`${args.elementTypeName}List\` usando o padrão TTList com CType. ` +
                "Use **somente** para integração com código legado ou quando Filter precisa retornar subclasse concreta. " +
                "Para código novo, prefira `data7_array_list_collection` com `Dim items[] As T`.\n\n" +
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
