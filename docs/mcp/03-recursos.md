# 03 — Referência de Resources

> 10 famílias de Resources expostas pelo servidor. Todas são **lazy** (carregadas só quando o cliente faz `resources/read`) e seguem o esquema URI `data7://<família>/<chave>`.

## Resumo

| URI / template                                    | Conteúdo                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `data7://language/{chapter}`                      | Um capítulo do `docs/linguagem-basic/` (sintaxe, tipos, operadores, controle de fluxo, classes, delegates, generics, módulos, system-library, açúcares, limitações, convenções idiomáticas, diagnostic codes). |
| `data7://system-library/{namespace}`              | Markdown completo de um namespace nativo (Collections, Forms, SQL, …) gerado on-the-fly por `DocsGenerator`. |
| `data7://examples/{path}`                         | Um `.bas` específico de `docs/exemple/` + header `@example` parseado.                    |
| `data7://examples/index`                          | Índice navegável dos 107 exemplos canônicos.                                              |
| `data7://diagnostics/codes`                       | Catálogo dos 33 `DiagnosticCodes` com referência aos exemplos de trigger/Quick Fix.       |
| `data7://idioms`                                  | Convenções idiomáticas + limitações conhecidas concatenadas em um único documento.        |
| `data7://real-project/{path}`                     | Qualquer arquivo (`.bas`/`.json`/`.7Proj`/`.md`) do projeto de referência `mod_card_grouper`. |
| `data7://official/{qualifiedName}`                | Assinatura + descrição + exemplo oficial de um símbolo nativo, extraído da Base de Conhecimento. |
| `data7://official/index`                          | Lista dos 167 símbolos com exemplo oficial documentado.                                   |
| `data7://guide/{slug}`                            | Tutoriais conceituais (Strings, Data e Hora, Palavras Chave, Tipos de Dados).             |
| `data7://meta/snapshot`                           | Versão do servidor + hash do catálogo + contagem de capacidades.                          |

## Detalhe por família

### `data7://language/{chapter}`

Slugs disponíveis: `readme`, `sintaxe`, `tipos`, `operadores`, `controle-de-fluxo`, `classes`, `delegates`, `generics`, `modulos-e-imports`, `system-library`, `acucares-atuais`, `limitacoes-conhecidas`, `convencoes-idiomaticas`, `diagnostic-codes`, `construindo-telas`.

Uso: explicar uma decisão de design da linguagem ("por que não há closures?"), fundamentar uma escolha idiomática ("por que `&` em vez de `+` para strings?"), ou aprender a montar uma tela (`data7://language/construindo-telas` cobre layout `Align`, hierarquia de pais, eventos e ciclo `Show`/`Free`).

### `data7://system-library/{namespace}`

Namespaces ativos: `Collections`, `Data7`, `Drawing`, `Environment`, `Forms`, `IO`, `Net`, `SQL`, `System`, `System.Classes`, `XML`.

Atenção: `Forms` é o maior namespace (~71 k tokens). Para detalhe de uma classe específica, prefira a tool `data7_describe_symbol` que devolve só os membros relevantes (~1 k tokens).

### `data7://examples/{path}`

`{path}` é o caminho relativo dentro de `docs/exemple/`, sem extensão. Exemplos:

- `data7://examples/sugar/for-each/01-stringlist-explicit-type`
- `data7://examples/diagnostics/missing-import/trigger`
- `data7://examples/diagnostics/missing-import/after-quickfix`
- `data7://examples/builder/round-trip-minimal/src/Principal`

### `data7://examples/index`

Markdown navegável. Útil quando o agente quer "passear" pelos exemplos antes de escolher um.

### `data7://diagnostics/codes`

Para cada `DiagnosticCode`, informa se existe trigger.bas e/ou after-quickfix.bas correspondente. Use a tool `data7_list_diagnostic_codes` para uma resposta JSON-friendly.

### `data7://idioms`

Documento consolidado contendo `11-limitacoes-conhecidas.md` + `12-convencoes-idiomaticas.md`. É o "what NOT to write" + "what to write instead" — leitura essencial para qualquer agente que escreva código Data7.

### `data7://real-project/{path}`

`mod_card_grouper/` é o projeto Data7 de referência: 47 módulos compartilhados em `data7_modules/` + 8 módulos próprios em `src/mod_card/`. Use para mostrar à IA padrões idiomáticos reais (BaseEnum em produção, TRecordList tipado, console.Block, padrão adapter).

Exemplos:

- `data7://real-project/data7.json`
- `data7://real-project/src/Principal.bas`
- `data7://real-project/src/mod_card/core/mod_card_record.bas`
- `data7://real-project/data7_modules/mod_base_list.bas`

### `data7://official/{qualifiedName}`

Cobre ~167 símbolos com **exemplo oficial em Data7 Basic** vindo da Base de Conhecimento Se7e Sistemas. Exemplos:

- `data7://official/Collections.StringList.Add`
- `data7://official/TJSONObject.Has`
- `data7://official/SQL.Command.Open`
- `data7://official/Net.TFTP.Connect`

A query no nome qualificado é case-insensitive. Se o símbolo não existir, a tool `data7_get_official_example` devolve as 5 sugestões mais próximas.

### `data7://official/index`

Markdown listando todos os 167 símbolos com tipo (`API`, `class-index`, `tutorial`).

### `data7://guide/{slug}`

Tutoriais prosaicos (não API-reference). Slugs derivados do título original:

- `data7://guide/strings`
- `data7://guide/data-e-hora`
- `data7://guide/palavras-chave`
- `data7://guide/tipos-de-dados-e-funcoes-de-conversao`

### `data7://meta/snapshot`

Payload JSON:

```json
{
  "version": "0.1.0",
  "snapshotHash": "<12-hex>",
  "namespaces": ["Collections", "Data7", "..."],
  "capabilities": { "resources": 10, "tools": 11, "prompts": 3 }
}
```

Clientes podem comparar `snapshotHash` entre sessões para detectar mudanças na System Library e invalidar cache local.

## Padrão de erro

Quando uma URI é desconhecida ou um parâmetro é inválido, o servidor não falha o read: ele devolve um `contents[0]` com `mimeType: "text/plain"` e uma mensagem orientativa ("Símbolo desconhecido…", "Capítulo não encontrado…"). O agente recebe a explicação imediatamente.
