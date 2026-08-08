# 02 — Uso rápido (6 cenários típicos)

> Seis perguntas comuns para confirmar que o servidor MCP do Data7 está funcionando no seu cliente. Cada cenário lista a **pergunta** que você faz ao agente, o **tool MCP** que ele deve invocar e o **conteúdo esperado** na resposta. O cenário 6 cobre o objetivo central: **criar telas**.

## 1. "Como uso `TJSONObject.Has`?"

**Tool acionado**: `data7_describe_symbol` com `qualifiedName="TJSONObject.Has"`.

**O que esperar**:

```json
{
  "qualifiedName": "TJSONObject.Has",
  "symbol": {
    "name": "Has",
    "kind": "method",
    "type": "Boolean",
    "containerName": "TJSONObject",
    "parameters": [{ "name": "Key", "type": "String", "isByRef": false, "isOptional": false }]
  },
  "inheritanceChain": [],
  "officialExample": {
    "qualifiedName": "TJSONObject.Has",
    "signature": "TJSONObject.Has(Const Key As String) As Boolean",
    "description": "Retorna true caso encontre um atributo com o mesmo nome informado no parâmetro.",
    "example": "Dim obj As TJSONObject = New TJSONObject() ..."
  }
}
```

O `officialExample` vem da Base de Conhecimento do ERP (Se7e Sistemas). É a forma canônica de chamar o método.

## 2. "Crie um enum rico para status com Active e Inactive."

**Prompt template acionado**: `data7_TEnum_pattern` com `{ enumName: "Status", values: "Active,Inactive" }` (default `form: "enun"`).

**O que esperar**: o agente recebe o sugar `Enun` e a API materializada — **não** a classe `Inherits TEnum` completa:

```basic
Enun Status
   Active = "Active"
   Inactive = "Inactive"
End Enun
```

Com guia de uso: `Status.Active`, `.AsString`, `.IsValue(...)`, `Status.Load(...)`, `GetOptions()`. Só use `form: "expanded"` se precisar customizar a classe gerada.

## 3. "Por que esse arquivo dá `missing-import`?"

**Tool acionado**: `data7_lint_bas` com o conteúdo do arquivo.

**O que esperar**:

```json
{
  "uri": "file:///__inline__.bas",
  "count": 1,
  "diagnostics": [
    {
      "code": "missing-import",
      "message": "...",
      "severity": 0,
      "range": { "start": { "line": 2, "character": 16 }, "end": { ... } },
      "data": { "code": "missing-import", "namespace": "Collections", "typeName": "StringList" }
    }
  ]
}
```

O `data` carrega o payload tipado: o agente sabe exatamente que namespace adicionar via `Imports Collections`. Em seguida ele pode chamar `data7_suggest_import` com `typeName: "StringList"` para confirmar a sugestão.

## 4. "Como crio uma coleção tipada de produtos com Filter e Map?"

**Tools acionados**: `data7://idioms` → `data7_list_sugar` → `data7_get_canonical_example`.

**O que esperar**: o preamble de `data7://idioms` orienta a usar `Dim items[] As T` com sugar `array-list` em vez de `StringList` ou subclasse manual `TTList`, e já lista as regras de Namespace/Imports (nome sem pontos, sem self-import, sem ciclos). Em seguida, `data7_list_sugar` lista o sugar `array-list` com exemplos:

```json
{
  "name": "array-list",
  "demonstratesFirst": "array sugar em primitivos — Filter, Map, Some, Every, IndexOf, Reduce",
  "examples": [
    "sugar/array-list/01-primitive-filter-map-reduce",
    "sugar/array-list/02-object-windowing-chains",
    "sugar/array-list/03-four-stage-chain",
    "sugar/array-list/04-subclass-filter"
  ]
}
```

O agente carrega `data7://examples/sugar/array-list/01-primitive-filter-map-reduce` ou invoca o prompt `data7_array_list_collection` com `{ elementTypeName: "Produto" }`.

## 5. "Como faço `For Each` / array-list no formato nativo Data7?"

**Tool acionado**: `data7_transpile_bas` com um snippet sugarado.

**O que esperar**:

```json
{
  "input": "Imports mod_tlist\nDim numeros[] As Integer = [1, 2, 3]\nFor Each n As Integer In numeros\n   ' uses n\nNext",
  "output": "... expansão nativa com TTList_Integer e loop indexado ...",
  "diagnostics": []
}
```

Para `StringList` (interop ERP), o mesmo tool expande `For Each item As String In list` para `list.Strings(__idx0)`. Se o tipo não for enumerável, `diagnostics` traz `not-enumerable`.

## 6. "Crie uma tela de cadastro" / "Quais controles existem para montar a tela?"

**Tools acionados**: `data7_list_controls` (descobrir os controles) → `data7_form_skeleton` (gerar o esqueleto) → `data7_describe_symbol` (detalhar um controle específico).

Primeiro a IA descobre o que existe sem carregar o namespace inteiro:

```json
// data7_list_controls → (trecho)
{
  "totalForms": 60,
  "returned": 40,
  "controls": [
    { "name": "CommandButton", "isBase": false, "description": "Botão padrão do Data7 (TBotao)..." },
    { "name": "Form", "isBase": false, "description": "Formulário base do Data7 (TfrmFormulario)..." },
    { "name": "Grid", "isBase": false, "description": "Grade de dados (TMS TAdvStringGrid)..." },
    { "name": "PageControl", "isBase": false, "description": "Container de abas (TabSheets)..." },
    { "name": "TextBox", "isBase": false, "description": "Caixa de texto de linha única..." }
  ]
}
```

Depois gera o esqueleto da tela (prompt `data7_form_skeleton` com `layout: "list"` para uma tela de listagem, ou `"header-content-footer"` + `withButton: true` para um cadastro). O código gerado segue o idioma de produção (Form privado + `_build` + layout `Align` + `Show`/`Free`) e passa no linter.

Para um controle específico, `data7_describe_symbol("Forms.Grid")` devolve os membros + o `formUsageHint` — incluindo como instanciar, posicionar com `Align` e **quais eventos** (`OnClick`, `OnChange`, …) o controle expõe.

> Referência completa do idioma de telas: `data7://language/construindo-telas`. Exemplos prontos: `data7://examples/forms/01-formulario-minimo` … `forms/07-abas-pagecontrol`.

## Próximos passos

Quando esses 5 cenários funcionam, o setup está validado. A partir daqui:

- **[06-exemplos-praticos.md](./06-exemplos-praticos.md)** — cenários realistas end-to-end (escrever módulo do zero, refatorar legado, corrigir cross-file).
- **[03-recursos.md](./03-recursos.md)** + **[04-ferramentas.md](./04-ferramentas.md)** — referência completa para construir prompts mais ricos.
