/**
 * Resource `data7://idioms` — merged view of the language's idiomatic
 * conventions and its known limitations. Helps AI agents understand
 * what NOT to write (no closures with capture, no operator overloading,
 * etc.) and what the canonical workarounds look like (`extra As Variant`,
 * `TEnum`, `array-list`, `TTList<T>`).
 *
 * Built by concatenating the two source markdowns; both chapters live in
 * `docs/linguagem-basic/` so they remain editable as standalone references
 * AND served together as a single curated resource.
 */
import * as fs from "fs";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getDocsRoot } from "../utils/paths";

const URI = "data7://idioms";

const PREAMBLE = `# Guia rápido para agentes — preferências de linguagem

> Leia esta seção **antes** de gerar código novo. Requer \`data7.features.language.sugars\` e \`data7.features.language.generics\` habilitados.

## Hierarquia de coleções (código novo)

| Cenário | Preferir | Fallback legado |
|---|---|---|
| Coleção tipada nova | \`Dim items[] As T\` + \`[...]\` + \`.Filter/.Map/.Reduce\` | — |
| Objetos de domínio | \`TTList<T>\` via \`mod_tlist\` + array-list | Subclasse \`Inherits TTList<T>\` quando Filter retorna tipo concreto |
| Iteração simples | \`For Each\` sobre \`TTList\` / \`[]\` | \`For Each\` sobre \`StringList\` |
| Strings / interop ERP | \`StringList\` + \`Imports Collections\` | — |
| Enum rico | \`Enun\` sugar → \`TEnum\` | Prompt \`data7_TEnum_pattern\` |
| Boilerplate CType/delegates | **Evitar** em código novo | Prompt \`data7_typed_recordlist\` |

## Exemplos canônicos (carregue via \`data7://examples/...\`)

- \`data7://examples/sugar/array-list/01-primitive-filter-map-reduce\`
- \`data7://examples/sugar/array-list/02-object-windowing-chains\`
- \`data7://examples/sugar/array-list/03-four-stage-chain\`
- \`data7://examples/sugar/array-list/04-subclass-filter\`

## Prompts MCP para geração

- Coleção moderna: \`data7_array_list_collection\`
- Coleção legada (CType/delegates): \`data7_typed_recordlist\` — somente integração legado
- Enum rico: \`data7_TEnum_pattern\`

## \`mod_card_grouper\` é referência legada para coleções

O projeto em \`data7://real-project/\` usa subclasses \`TTList\` manuais de produção anterior. Use-o para telas e domínio ERP, não como modelo para coleções novas.
`;

function readChapter(slug: string): string {
  const dir = path.join(getDocsRoot(), "linguagem-basic");
  if (!fs.existsSync(dir)) return "";
  for (const name of fs.readdirSync(dir)) {
    if (name.toLowerCase().endsWith(`-${slug}.md`)) {
      try {
        return fs.readFileSync(path.join(dir, name), "utf-8");
      } catch {
        return "";
      }
    }
  }
  return "";
}

function buildMarkdown(): string {
  const conventions = readChapter("convencoes-idiomaticas");
  const limitations = readChapter("limitacoes-conhecidas");
  const parts: string[] = [];
  parts.push("# Idiomas e limitações de Data7 Basic");
  parts.push("");
  parts.push(
    "Este recurso reúne convenções idiomáticas (como escrever código moderno) " +
      "e limitações intrínsecas (o que a linguagem não oferece). " +
      "Convenções vêm **antes** de limitações para orientar agentes na escolha correta.",
  );
  parts.push("");
  parts.push(PREAMBLE);
  if (conventions) {
    parts.push("---");
    parts.push("");
    parts.push(conventions);
  }
  if (limitations) {
    parts.push("---");
    parts.push("");
    parts.push(limitations);
  }
  return parts.join("\n");
}

export function registerIdioms(server: McpServer): void {
  server.registerResource(
    "data7-idioms",
    URI,
    {
      title: "Idiomas e limitações de Data7 Basic",
      description:
        "Guia consolidado para agentes: hierarquia de coleções (array-list, generics), convenções idiomáticas e limitações intrínsecas.",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: buildMarkdown() }],
    }),
  );
}
