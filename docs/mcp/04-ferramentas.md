# 04 — Referência de Tools

> 12 tools chamáveis pelo cliente MCP. 7 são **lookup** puros (sem efeito colateral), 3 são **executable** (rodam linter/transpiler reais), 1 é **mixed** (busca em System Library + workspace).

## Resumo

| Tool                              | Categoria   | Quando usar                                                                                          |
| --------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `data7_search_symbol`             | lookup      | "Quais símbolos têm 'List' no nome?"                                                                  |
| `data7_describe_symbol`           | lookup      | "Como uso `Collections.StringList.Add`?" (devolve assinatura + descrição + exemplo oficial; para controles Forms, inclui `formUsageHint`) |
| `data7_list_controls`             | lookup      | "Quais controles existem para montar uma tela?"                                                      |
| `data7_search_examples`           | lookup      | "Tem exemplo de optional chaining?"                                                                   |
| `data7_get_canonical_example`     | lookup      | "Me dá o conteúdo de `sugar/ternary/01-dim-assignment`."                                              |
| `data7_get_official_example`      | lookup      | "Me dá o exemplo oficial do ERP para `TJSONObject.Has`."                                              |
| `data7_list_diagnostic_codes`     | lookup      | "Quais códigos de diagnóstico podem aparecer?"                                                        |
| `data7_list_sugar`                | lookup      | "Quais açúcares estão implementados?"                                                                 |
| `data7_transpile_bas`             | executable  | "Como esse açúcar se expande em código nativo?"                                                       |
| `data7_lint_bas`                  | executable  | "Esse trecho passa no linter?"                                                                        |
| `data7_lint_project`              | executable  | "Esses N arquivos juntos passam no linter? (lint cross-file)"                                         |
| `data7_suggest_import`            | mixed       | "Qual `Imports` adiciono para resolver `TForm`?"                                                      |

## Detalhe por tool

### `data7_search_symbol`

**Input**:

```json
{
  "query": "StringList",
  "container": "Collections", // opcional
  "kind": "class",            // opcional
  "includeUnsupported": false, // opcional (default false)
  "limit": 30                 // opcional (default 30, máx 200)
}
```

**Output**: JSON com `query`, `totalFound`, `returned`, `results[]`. Cada result tem `name`, `kind`, `type`, `containerName`, `description`, `isUnsupported`.

### `data7_describe_symbol`

**Input**:

```json
{
  "qualifiedName": "Collections.StringList.Add", // ou nome simples "StringList"
  "includeMembers": false                         // opcional (default false)
}
```

**Output**: JSON com `qualifiedName`, `symbol` (SymbolInfo projetado), `inheritanceChain` (lista de ancestrais), `ownMembers` (quando `includeMembers=true`), `officialExample` (quando articles.json tem entry) e `formUsageHint` (presente só para controles `Forms`: um snippet idiomático de como instanciar e posicionar o controle com `Align`, ou o ciclo `Show`/`Free` para o `Form` raiz).

### `data7_list_controls`

**Input**:

```json
{
  "filter": "Text",        // opcional: substring do nome
  "includeBase": false     // opcional: incluir classes-base abstratas (TControl, TWinControl...). Default false
}
```

**Output**: `{ "totalForms", "returned", "controls[] }`. Cada `control` traz `name`, `inheritsFrom`, `description` e `isBase`. Por padrão devolve só controles instanciáveis (`isBase: false`) — `Form`, `Panel`, `Grid`, `TextBox`, `CommandButton`, `PageControl`, `TabSheet`, etc. — para a IA descobrir o que existe ao montar uma tela sem carregar o namespace `Forms` inteiro (~71 k tokens).

### `data7_search_examples`

**Input**:

```json
{
  "query": "for-each",
  "category": "sugar",        // opcional: "sugar" | "diagnostics" | "builder"
  "limit": 10                 // opcional (default 10)
}
```

**Output**: `matches[]` ordenados por relevância. Cada match traz `relativePath`, `demonstrates`, `diagnostics`, `snippet`.

### `data7_get_canonical_example`

**Input**: `{ "relativePath": "sugar/for-each/01-stringlist-explicit-type" }`

**Output**: `{ "relativePath", "header", "content" }`.

### `data7_get_official_example`

**Input**: `{ "qualifiedName": "Collections.StringList.Add" }`

**Output**: o objeto `OfficialArticle` completo (signature/description/example/parameters/returns). Quando o símbolo não existe, devolve `found: false` + `suggestions[]` com as 5 mais próximas.

### `data7_list_diagnostic_codes`

**Input**: `{ "filter": "import" }` (opcional)

**Output**: cada entry traz `code`, `enumKey`, `hasTrigger`, `hasAfterQuickfix`.

### `data7_list_sugar`

**Input**: `{ "includeExpected": false }` (default false; quando true inclui também os arquivos `_expected/`)

**Output**: cada entry traz `name`, `demonstratesFirst`, `hasExpected`, `examplesCount`, `examples[]`.

### `data7_transpile_bas`

**Input**:

```json
{
  "code": "Dim x As String = c ? \"a\" : \"b\"",
  "useAstGenerics": false      // opcional, equivalente a data7.experimental.useAstGenerics
}
```

**Output**: `{ "input", "output", "diagnostics[] }`. Os `diagnostics` são os `SugarDiagnostic` emitidos pelo transpilador (`not-enumerable`, `invalid-interpolation`, `ternary-context-unsupported`, …).

### `data7_lint_bas`

**Input**:

```json
{
  "code": "...",
  "uri": "file:///foo.bas"    // opcional; default file:///__inline__.bas
}
```

**Output**: `{ "uri", "count", "diagnostics[] }`. Cada `diagnostic` traz `code`, `message`, `severity`, `range`, `data` (payload tipado conforme `diagnostic-codes.ts`).

### `data7_lint_project`

**Input**:

```json
{
  "files": [
    { "path": "src/mod_a.bas", "content": "..." },
    { "path": "src/mod_b.bas", "content": "..." }
  ]
}
```

**Output**: `{ "filesAnalysed", "totalDiagnostics", "byFile": { "src/mod_a.bas": [...], "src/mod_b.bas": [...] } }`.

Usa um `WorkspaceSymbolIndexer.createDetached()` novo para cada chamada — sem leak entre sessões.

### `data7_suggest_import`

**Input**: `{ "typeName": "StringList" }`

**Output**: `{ "typeName", "count", "suggestions[] }`. Cada `suggestion` traz `namespace`, `importLine`, `source` (`"system-library"` ou `"workspace"`), `typeKind`.

## Convenções gerais

- Todos os tools devolvem `content[0]` com `type: "text"` e `text: <JSON-stringified>`. Os clientes MCP típicos (Cursor, Claude Desktop, Continue) re-parseiam o JSON automaticamente.
- Quando o input é inválido segundo o schema Zod, o cliente recebe um erro com a mensagem do Zod — fácil de corrigir.
- Toolschamáveis em massa: agentes podem combinar `search_symbol → describe_symbol → get_official_example` em uma única conversa para entregar uma resposta rica com pouco contexto carregado.
