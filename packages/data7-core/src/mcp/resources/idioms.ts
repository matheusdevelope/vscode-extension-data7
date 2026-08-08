/**
 * Resource `data7://idioms` — merged view of the language's idiomatic
 * conventions and its known limitations. Helps AI agents understand
 * what NOT to write (no closures with capture, no operator overloading,
 * etc.) and what the canonical workarounds look like (`extra As Variant`,
 * `Enun` / TEnum, `array-list`, `TTList<T>`).
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
| Enum rico | \`Enun X / End Enun\` (sugar → TEnum) | \`data7_TEnum_pattern\` com \`form: "expanded"\` só se precisar customizar a classe |
| Boilerplate CType/delegates | **Evitar** em código novo | Prompt \`data7_typed_recordlist\` |

## Namespaces e Imports (obrigatório)

### Nome de \`Namespace\`

- Um namespace **nunca** é declarado com pontos (\`.\`).
- Caracteres aceitos: letras, números e underscore (\`_\`).
- Deve **começar** com letra ou underscore.
- Forma canônica: \`[A-Za-z_][A-Za-z0-9_]*\` (ex.: \`mod_card_record\`, \`_helpers\`).
- **Errado:** \`Namespace mod.card.record\` / \`Namespace 2grid\`.
- **Certo:** \`Namespace mod_card_record\`.
- Pontos existem só em **acesso qualificado** (\`mod_foo.Bar\`) ou em alguns \`Imports\` da System Library (\`System.Classes\`), **não** na declaração \`Namespace\`.

### Nunca importe o próprio namespace

- **Nunca** escreva \`Imports <X>\` no mesmo arquivo que declara \`Namespace <X>\`.
- Isso é auto-import e o linter emite [\`circular-import\`](data7://diagnostics/codes).

### Imports circulares

- **Imports circulares não são aceitos** (A importa B e B importa A, direta ou transitivamente). Diagnóstico: \`circular-import\`.
- Se parecer necessário um ciclo: **reavalie a estrutura** (extraia tipos compartilhados para um terceiro módulo) **ou** use o nome **qualificado sem \`Imports\`**:

\`\`\`basic
' Em vez de Imports mod_outro no arquivo que cria o ciclo:
Dim parser As mod_outro.XMLParser
Call mod_outro.Processar(dados)
\`\`\`

Forma: \`nome_do_namespace.NomeDoMetodoOuTipoOuVariavel\`.

## Exemplos canônicos (carregue via \`data7://examples/...\`)

- \`data7://examples/sugar/array-list/01-primitive-filter-map-reduce\`
- \`data7://examples/sugar/array-list/02-object-windowing-chains\`
- \`data7://examples/sugar/array-list/03-four-stage-chain\`
- \`data7://examples/sugar/array-list/04-subclass-filter\`
- \`data7://examples/diagnostics/circular-import/trigger\` — auto-import / ciclo (não reproduzir)

## Prompts MCP para geração

- Coleção moderna: \`data7_array_list_collection\`
- Coleção legada (CType/delegates): \`data7_typed_recordlist\` — somente integração legado
- Enum rico: \`data7_TEnum_pattern\` — **default \`Enun\`**; \`form: "expanded"\` só para customização

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
        "Guia consolidado para agentes: hierarquia de coleções, regras de Namespace/Imports (nome sem pontos, sem self-import, sem ciclos), convenções idiomáticas e limitações.",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: buildMarkdown() }],
    }),
  );
}
