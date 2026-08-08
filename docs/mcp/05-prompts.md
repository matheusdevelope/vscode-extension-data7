# 05 — Referência de Prompts

> 5 prompt templates expostos pelo servidor MCP. Cada prompt recebe argumentos tipados (validados via Zod) e devolve uma mensagem `role: "user"` com código Data7 Basic pronto para revisar/colar.

## Resumo

| Prompt                       | Para gerar                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `data7_module_skeleton`      | Esqueleto canônico de um módulo (`'@Module` header + Imports + Namespace + Class).          |
| `data7_TEnum_pattern`     | **Default:** sugar `Enun X / End Enun` + guia da API materializada. `form: "expanded"` → classe `Inherits TEnum` (só customização). |
| `data7_array_list_collection` | Coleção tipada moderna (`Dim items[] As T`, literais, Filter/Map/Reduce). **Preferido para código novo.** |
| `data7_typed_recordlist`     | Subclasse legada de TTList (Find/Filter/Map/ForEach + delegates + CType). **Somente integração legado.** |
| `data7_form_skeleton`        | Esqueleto de uma tela (Form privado + `_build` com layout `Align` + eventos + `Show`/`Free`). |

## Detalhe por prompt

### `data7_module_skeleton`

**Args**:

```json
{
  "moduleName": "mod_payments",
  "namespaceName": "mod_payments",
  "className": "TPayment",
  "baseClass": "TRecord"     // opcional
}
```

`namespaceName` deve ser um identificador `[A-Za-z_][A-Za-z0-9_]*` (sem pontos). O arquivo gerado **não** importa o próprio namespace; se precisar referenciar outro módulo sem criar ciclo, use `nome_do_namespace.Membro` qualificado (vide `data7://idioms`).

**O que gera**:

```basic
'@Module
'@Description: mod_payments — descrição do módulo.

' Workspace / extensão (coleções tipadas modernas)
Imports mod_tlist
' Imports Collections  ' use apenas para interop ERP (StringList)

Namespace mod_payments

   Class TPayment
      Inherits TRecord

      Private _initialized As Boolean

      Sub New()
         MyBase.New()
         me._initialized = True
      End Sub

      Function Describe() As String
         Describe = "TPayment"
      End Function

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace
```

Quando `baseClass` é omitido, o `Inherits` é suprimido e o `Sub Free()` apenas comenta `' nada a liberar`.

### `data7_TEnum_pattern`

**Args**:

```json
{
  "enumName": "CardAdm",
  "values": "[{\"id\":0,\"label\":\"Stone\"},{\"id\":1,\"label\":\"Cielo\"}]",
  "form": "enun"
}
```

Aceita CSV: `"values": "Stone,Cielo"`. `form` é opcional — default `"enun"`. Passe `"expanded"` só para customização fora do padrão.

**O que gera (default)**: declaração `Enun` + instruções da API materializada (`factories`, `Load`, `GetOptions`, `.AsString` / `.IsValue`), para a IA **não** reescrever a classe `Inherits TEnum`.

```basic
Enun CardAdm
   Stone = "Stone"
   Cielo = "Cielo"
End Enun
```

Uso após materialização (o prompt documenta isto):

```basic
Dim adm As CardAdm = CardAdm.Stone
If adm.IsValue(CardAdm.Cielo) Then ...
Dim s As String = adm.AsString
Dim loaded As CardAdm = CardAdm.Load("Stone")
```

**`form: "expanded"`**: devolve a classe completa `Inherits TEnum` (Initialize / Load×3 / GetOptions) — apenas quando o sugar não basta. Não confundir com `Enum` nativo.

### `data7_array_list_collection`

**Args**:

```json
{
  "elementTypeName": "CardRecord",
  "isObject": true,
  "withFunctionalChain": true
}
```

**O que gera**: padrão moderno com `Imports mod_tlist`, `Dim items[] As T = [...]`, `.Filter/.Map/.Reduce` e `For Each`:

```basic
Imports mod_tlist

Namespace mod_cardrecord_collection
   Class CardRecord
      Sub New()
         MyBase.New()
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Sub ExemploColecao()
      Dim items[] As CardRecord = [
         New CardRecord(),
         New CardRecord()
      ]
      Dim filtrados[] As CardRecord = items.Filter(
         Function(p As CardRecord) As Boolean True
      )
      For Each item As CardRecord In items
         ' processa item
      Next
   End Sub
End Namespace
```

Padrão **preferido** para coleções tipadas novas. Requer `language.sugars` e `language.generics` habilitados.

### `data7_typed_recordlist`

**Args**:

```json
{
  "elementTypeName": "CardRecord"
}
```

**O que gera**: subclasse legada de `TTList` + 3 delegates dedicados, seguindo [12-convencoes-idiomaticas.md § 2.2](../linguagem-basic/12-convencoes-idiomaticas.md#22-fallback-legado-pré-generics):

```basic
Delegate Function CardRecordFindDelegate(pValue As CardRecord, i As Integer, extra As Variant) As Boolean
Delegate Function CardRecordMapDelegate(pValue As CardRecord, i As Integer, extra As Variant) As CardRecord
Delegate Sub CardRecordForEachDelegate(pValue As CardRecord, i As Integer, extra As Variant)

Class CardRecordList
   Inherits TTList

   Sub New()
      MyBase.New("CardRecordList")
   End Sub

   Property Item(pIndex As Integer) As CardRecord
      Get
         Item = CType(MyBase.Take(pIndex), CardRecord)
      End Get
      Set(pValue As CardRecord)
         me.SetItem(pIndex, pValue)
      End Set
   End Property

   ' Take / First / Last / Find / Filter / ForEach / Map todas re-tipadas via CType
End Class
```

Forma **legada** — use somente para integração com código existente ou quando `Filter` precisa retornar subclasse concreta. Para código novo, use `data7_array_list_collection`.

### `data7_form_skeleton`

**Args**:

```json
{
  "className": "TFormCadastro",
  "namespaceName": "mod_cadastro",
  "title": "Cadastro de Clientes",
  "layout": "header-content-footer",
  "withButton": true
}
```

`layout` aceita `"simple"` (só conteúdo `alClient`) ou `"header-content-footer"` (3 regiões). `withButton: true` adiciona um `CommandButton` com `OnClick` ligado a um handler + um evento próprio `OnConfirmEvent`.

**O que gera**: uma classe que possui um `Forms.Form` privado, monta a árvore de controles em `_build` com layout por `Align`, fia os eventos e expõe `Show()` / `Free()` — fiel ao idioma de produção documentado em [`docs/linguagem-basic/14-construindo-telas.md`](../linguagem-basic/14-construindo-telas.md):

```basic
Imports Forms

Namespace mod_cadastro

   Class TFormCadastro

      OnConfirmEvent As TNotifyEvent

      Private _form As Forms.Form
      Private _header As Forms.PageControl
      Private _content As Forms.PageControl
      Private _footer As Forms.PageControl
      Private _confirm As Forms.CommandButton

      Sub New(pTitle As String = "Cadastro de Clientes")
         me._build(pTitle)
      End Sub

      Private Sub _build(pTitle As String)
         me._form = New Forms.Form()
         me._form.Caption = pTitle
         ' header alTop / footer alBottom / content alClient (por último)
         ' + CommandButton com OnClick = me._handleConfirm
      End Sub

      Private Sub _handleConfirm(pSender As TObject)
         If me.OnConfirmEvent <> NULL Then me.OnConfirmEvent(me)
      End Sub

      Function Show() As Boolean
         me._form.Show()
         Show = True
      End Function

      Sub Free()
         me._form.Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace
```

O código gerado passa no linter sem diagnósticos.

## Como o cliente MCP invoca

Cada cliente expõe os prompts no menu apropriado:

- **Cursor**: prompts MCP aparecem no menu `/` do chat.
- **Claude Desktop**: na barra de comandos `/`.
- **Continue**: comando `/data7-TEnum-pattern` (slug-ificado).

Todos validam os argumentos via Zod antes de chamar — argumentos inválidos viram erros descritivos na resposta.

## Quando os prompts ajudam a sua IA mais que docs

| Cenário                                                              | Use isto                       |
| -------------------------------------------------------------------- | ------------------------------ |
| "Crie um arquivo novo `mod_xxx` para fazer Y."                       | `data7_module_skeleton`        |
| "Eu preciso de um enum com esses 3 valores."                         | `data7_TEnum_pattern` (default Enun) |
| "Preciso customizar a classe TEnum expandida."                       | `data7_TEnum_pattern` com `form: "expanded"` |
| "Preciso de uma coleção tipada de `TFoo` com Filter/Map."            | `data7_array_list_collection` |
| "Preciso integrar com subclasse TTList legada de `TFoo`."            | `data7_typed_recordlist`       |
| "Crie uma tela/formulário para X."                                   | `data7_form_skeleton`          |
| "Como ler `TJSONObject`?"                                            | (use o Tool `data7_describe_symbol`, não prompt) |
| "Eu já tenho o código mas quero entender o açúcar."                  | (use Tool `data7_transpile_bas`) |

Os prompts são para **gerar código novo** seguindo padrões consagrados. Tools são para **consultar/auditar** código existente.
