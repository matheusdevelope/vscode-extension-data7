/**
 * Prompt `data7_TEnum_pattern` — default: sugar `Enun X / End Enun`.
 * Documents the materialized TEnum API so agents can compare/load/options
 * without hand-writing the expanded class.
 *
 * Pass `form: "expanded"` only for rare customizations that the sugar
 * cannot express. See `docs/linguagem-basic/12-convencoes-idiomaticas.md`.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type EnumValueSpec = { id: number | string; label: string };

function formatDescription(label: string | number): string {
  return `"${label}"`;
}

/** Default declaration form — agents must emit this, not the expanded class. */
export function buildEnunDeclaration(enumName: string, values: readonly EnumValueSpec[]): string {
  const lines: string[] = [];
  lines.push(`Enun ${enumName}`);
  for (const v of values) {
    lines.push(`   ${v.label} = ${formatDescription(v.label)}`);
  }
  lines.push("End Enun");
  return lines.join("\n");
}

/** Expanded class — only when `form: "expanded"` (customization fallback). */
export function buildExpandedTEnumClass(
  enumName: string,
  values: readonly EnumValueSpec[],
): string {
  const lines: string[] = [];
  lines.push(`Class ${enumName}`);
  lines.push(`   Inherits TEnum`);
  lines.push("");
  lines.push("   Private Shared Sub Initialize()");
  if (values.length > 0) {
    const firstDescription = formatDescription(values[0]!.label);
    lines.push(`      If TEnum._IsCached("${enumName}", ${firstDescription}) Then Exit Sub`);
  }
  for (const [index, v] of values.entries()) {
    const ordinal = typeof v.id === "number" ? v.id : index;
    const description = formatDescription(v.label);
    lines.push(
      `      TEnum._AddEnumItem("${enumName}", New ${enumName}(${ordinal}, ${description}))`,
    );
  }
  lines.push("   End Sub");
  lines.push("");
  for (const v of values) {
    const description = formatDescription(v.label);
    lines.push(`   Shared Function ${v.label} As ${enumName}`);
    lines.push(`      ${v.label} = Load(${description})`);
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

function buildApiSurfaceGuide(enumName: string, values: readonly EnumValueSpec[]): string {
  const first = values[0]?.label ?? "Value";
  const second = values[1]?.label ?? first;
  return [
    `## API materializada (use isto — NÃO reescreva a classe)`,
    "",
    `O sugar \`Enun\` é expandido pelo tooling para \`Class ${enumName} Inherits TEnum\`.`,
    "Trate o tipo como se já tivesse esta superfície:",
    "",
    "### Factories Shared (sem parênteses na declaração)",
    ...values.map((v) => `- \`${enumName}.${v.label}\` → instância \`${enumName}\``),
    "",
    "### Load / GetOptions",
    `- \`${enumName}.Load(p As String)\` / \`${enumName}.Load(p As Integer)\` / \`${enumName}.Load(p As ${enumName})\``,
    `- \`${enumName}.GetOptions()\` → String \`"Label=0;Outro=1"\` (ComboBox ERP)`,
    "",
    "### Instância (herdados de TEnum)",
    "- `.AsString` / `.AsInteger` / `.AsOption`",
    "- `.IsValue(p)` — compara com String, Integer ou outra instância",
    "",
    "### Uso típico",
    "```basic",
    `Imports mod_tenum`,
    "",
    `Dim adm As ${enumName} = ${enumName}.${first}`,
    "",
    `If adm.IsValue(${enumName}.${second}) Then`,
    `   ' ...`,
    "End If",
    "",
    `Select adm`,
    `   Case ${enumName}.${first}`,
    "      ' ...",
    `   Case ${enumName}.${second}`,
    "      ' ...",
    "End Select",
    "",
    `Dim label As String = adm.AsString`,
    `Dim loaded As ${enumName} = ${enumName}.Load("${first}")`,
    "```",
    "",
    "### Imports",
    "- Declare `Imports mod_tenum` no módulo (o transpile também injeta se faltar).",
    "- `Enum X / End Enum` nativo é outro recurso (constantes Integer simples) — não confundir com `Enun`.",
  ].join("\n");
}

export function parseEnumValues(raw: string): EnumValueSpec[] {
  try {
    const json: unknown = JSON.parse(raw);
    if (Array.isArray(json)) {
      return json
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
    }
  } catch {
    // fall through to CSV
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((label, idx) => ({ id: idx, label }));
}

function buildEnunPromptMessage(enumName: string, values: readonly EnumValueSpec[]): string {
  const code = buildEnunDeclaration(enumName, values);
  return (
    `## Instrução obrigatória\n\n` +
    `Declare o enum **somente** com o sugar \`Enun\` / \`End Enun\` abaixo. ` +
    `**Não** escreva \`Class ${enumName} Inherits TEnum\` à mão — o SugarTranspiler materializa a classe.\n\n` +
    "```basic\n" +
    code +
    "\n```\n\n" +
    buildApiSurfaceGuide(enumName, values) +
    "\n\n" +
    `Se precisar **customizar** a classe materializada (lógica extra em Load, campos adicionais, etc.), ` +
    `chame de novo este prompt com \`form: "expanded"\`. No fluxo normal, use só o \`Enun\`.`
  );
}

function buildExpandedPromptMessage(enumName: string, values: readonly EnumValueSpec[]): string {
  const code = buildExpandedTEnumClass(enumName, values);
  return (
    `## Forma expandida (customização avançada)\n\n` +
    `Você pediu \`form: "expanded"\`. Use a classe abaixo **somente** quando o sugar \`Enun\` ` +
    `não bastar (customização fora do padrão). Para enums normais, preferir \`Enun\` / \`End Enun\`.\n\n` +
    "```basic\n" +
    code +
    "\n```\n\n" +
    buildApiSurfaceGuide(enumName, values)
  );
}

export function registerTEnumPattern(server: McpServer): void {
  server.registerPrompt(
    "data7_TEnum_pattern",
    {
      title: "Enum rico Data7 — sugar Enun (padrão) ou classe TEnum expandida",
      description:
        "Padrão: gera `Enun X / End Enun` + guia da API materializada (factories, Load, GetOptions, AsString/IsValue). " +
        'Use form="expanded" só para customização rara que exija a classe `Inherits TEnum` completa. ' +
        "Não confundir com `Enum` nativo (constantes Integer).",
      argsSchema: {
        enumName: z.string().min(1).describe('Nome do tipo enum. Exemplo: "CardAdm".'),
        values: z
          .string()
          .min(1)
          .describe(
            'Lista de valores como JSON ou CSV. Aceita: \'[{"id":0,"label":"Stone"},{"id":1,"label":"Cielo"}]\' ou "Stone,Cielo".',
          ),
        form: z
          .enum(["enun", "expanded"])
          .optional()
          .describe(
            'Padrão "enun" (sugar). Passe "expanded" apenas para esqueleto Class Inherits TEnum customizável.',
          ),
      },
    },
    (args) => {
      const parsed = parseEnumValues(args.values);
      const form = args.form === "expanded" ? "expanded" : "enun";
      const text =
        form === "expanded"
          ? buildExpandedPromptMessage(args.enumName, parsed)
          : buildEnunPromptMessage(args.enumName, parsed);

      return {
        description:
          form === "expanded"
            ? `Classe TEnum expandida para ${args.enumName} (customização).`
            : `Sugar Enun gerado para ${args.enumName} (forma padrão).`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text,
            },
          },
        ],
      };
    },
  );
}
