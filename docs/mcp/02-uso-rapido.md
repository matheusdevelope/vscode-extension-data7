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
    "signature": "TJSONObject.Has(Const Key As UnicodeString) As Boolean",
    "description": "Retorna true caso encontre um atributo com o mesmo nome informado no parâmetro.",
    "example": "Dim obj As TJSONObject = New TJSONObject() ..."
  }
}
```

O `officialExample` vem da Base de Conhecimento do ERP (Se7e Sistemas). É a forma canônica de chamar o método.

## 2. "Crie um BaseEnum para status com Active e Inactive."

**Prompt template acionado**: `data7_baseenum_pattern` com `{ enumName: "Status", values: "Active,Inactive" }`.

**O que esperar**: o agente recebe a classe `Status` completa com:

```basic
Class Status
   Inherits BaseEnum

   Private Shared _Initialized As Boolean

   Private Shared Sub Initialize()
      If _Initialized Then Exit Sub
      BaseEnum._AddEnumItem("Status", New Status(0, "Active"))
      BaseEnum._AddEnumItem("Status", New Status(1, "Inactive"))
      _Initialized = True
   End Sub

   Shared Function Active As Status
      Active = Load("Active")
   End Function

   Shared Function Inactive As Status
      Inactive = Load("Inactive")
   End Function

   ' três overloads de Load ...
   ' GetOptions() ...
End Class
```

O agente apenas copia/edita os identificadores conforme o seu domínio.

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

## 4. "Que açúcar uso para iterar sobre uma `StringList`?"

**Tool acionado**: `data7_list_sugar`.

**O que esperar**: lista de todos os 31 açúcares + exemplo canônico de cada um. Para `for-each`, a entrada inclui:

```json
{
  "name": "for-each",
  "demonstratesFirst": "For Each com tipo explícito sobre Collections.StringList",
  "hasExpected": true,
  "examplesCount": 8,
  "examples": [
    "sugar/for-each/01-stringlist-explicit-type",
    "sugar/for-each/02-stringlist-implicit-type",
    "sugar/for-each/03-nested-loops",
    "sugar/for-each/04-not-enumerable",
    "sugar/for-each/05-method-call-operand"
  ]
}
```

O agente carrega `data7://examples/sugar/for-each/01-stringlist-explicit-type` para ver a forma idiomática completa.

## 5. "Como faço `For Each` no formato nativo Data7?"

**Tool acionado**: `data7_transpile_bas` com um snippet sugarado.

**O que esperar**:

```json
{
  "input": "Imports Collections\nDim list As StringList\nFor Each item As String In list\n   ' uses item\nNext",
  "output": "Imports Collections\nDim list As StringList\nFor __idx0 = 0 To list.Count - 1\n   Dim item As String = list.Strings(__idx0)\n   ' uses item\nNext",
  "diagnostics": []
}
```

Os contadores `__idx0`, `__idx1` … evitam colisão com nomes do usuário. Se o tipo não fosse enumerável, o `diagnostics` traria `not-enumerable`.

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
