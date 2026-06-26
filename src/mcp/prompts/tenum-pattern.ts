/**
 * Prompt `data7_TEnum_pattern` — generates the canonical
 * TEnum-pattern class for a list of values. Data7 Basic has no
 * `Enum` keyword; the conventional substitute is a class that inherits
 * from `TEnum` with lazy initialization, three overloaded `Load`
 * functions and one Shared Function per value.
 *
 * See `docs/linguagem-basic/12-convencoes-idiomaticas.md` for the
 * canonical pattern.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function buildPattern(
  enumName: string,
  values: readonly { id: number | string; label: string }[],
): string {
  const lines: string[] = [];
  lines.push(`Class ${enumName}`);
  lines.push(`   Inherits TEnum`);
  lines.push("");
  lines.push(`   Private Shared _Initialized As Boolean`);
  lines.push("");
  lines.push("   Private Shared Sub Initialize()");
  lines.push("      If _Initialized Then Exit Sub");
  for (const v of values) {
    const id = typeof v.id === "number" ? String(v.id) : `"${v.id}"`;
    lines.push(
      `      TEnum._AddEnumItem("${enumName}", New ${enumName}(${id}, CStr("${v.label}")))`,
    );
  }
  lines.push("      _Initialized = True");
  lines.push("   End Sub");
  lines.push("");
  for (const v of values) {
    lines.push(`   Shared Function ${v.label} As ${enumName}`);
    lines.push(`      ${v.label} = Load("${v.label}")`);
    lines.push("   End Function");
    lines.push("");
  }
  lines.push(`   Shared Function Load(pValue As ${enumName}) As ${enumName}`);
  lines.push(`      Load = Load(pValue.AsString)`);
  lines.push("   End Function");
  lines.push("");
  lines.push(`   Shared Function Load(pValue As Integer) As ${enumName}`);
  lines.push(`      ${enumName}.Initialize()`);
  lines.push(`      Load = ${enumName}(TEnum._GetCache("${enumName}", pValue))`);
  lines.push("   End Function");
  lines.push("");
  lines.push(`   Shared Function Load(pValue As String) As ${enumName}`);
  lines.push(`      ${enumName}.Initialize()`);
  lines.push(`      Load = ${enumName}(TEnum._GetCache("${enumName}", pValue))`);
  lines.push("   End Function");
  lines.push("");
  lines.push("   Shared Function GetOptions() As String");
  lines.push(`      ${enumName}.Initialize()`);
  lines.push(`      GetOptions = TEnum._GetEnumOptions("${enumName}")`);
  lines.push("   End Function");
  lines.push("");
  lines.push("End Class");
  return lines.join("\n");
}

export function registerTEnumPattern(server: McpServer): void {
  server.registerPrompt(
    "data7_TEnum_pattern",
    {
      title: "Padrão TEnum para enumerações Data7 Basic",
      description:
        "Gera a classe canônica que herda de TEnum com Initialize lazy, Shared Function por valor, três overloads de Load e GetOptions(). Use quando a linguagem-alvo não tiver o sugar Enun X / End Enun disponível.",
      argsSchema: {
        enumName: z.string().min(1).describe('Nome da classe enum. Exemplo: "CardAdm".'),
        values: z
          .string()
          .min(1)
          .describe(
            'Lista de valores como JSON ou CSV. Aceita: \'[{"id":0,"label":"Stone"},{"id":1,"label":"Cielo"}]\' ou "Stone,Cielo".',
          ),
      },
    },
    (args) => {
      let parsed: { id: number | string; label: string }[];
      try {
        const json: unknown = JSON.parse(args.values);
        if (Array.isArray(json)) {
          parsed = json
            .map((v: unknown, idx: number) => {
              if (typeof v === "string") return { id: idx, label: v };
              if (v && typeof v === "object") {
                const rec = v as Record<string, unknown>;
                const labelVal = rec.label;
                if (typeof labelVal === "string") {
                  const idVal = rec.id;
                  const id: number | string =
                    typeof idVal === "number" || typeof idVal === "string" ? idVal : idx;
                  return { id, label: labelVal };
                }
              }
              throw new Error("Invalid value entry");
            })
            .filter((v) => typeof v.label === "string");
        } else {
          throw new Error("not an array");
        }
      } catch {
        parsed = args.values
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .map((label, idx) => ({ id: idx, label }));
      }

      const code = buildPattern(args.enumName, parsed);
      return {
        description: `Padrão TEnum gerado para ${args.enumName}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Crie o arquivo do enum ${args.enumName} usando o padrão TEnum abaixo. ` +
                "Esse padrão é a forma idiomática enquanto a linguagem não tiver o sugar `Enun X / End Enun`.\n\n" +
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
