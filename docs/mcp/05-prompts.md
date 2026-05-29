# 05 — Referência de Prompts

> 4 prompt templates expostos pelo servidor MCP. Cada prompt recebe argumentos tipados (validados via Zod) e devolve uma mensagem `role: "user"` com código Data7 Basic pronto para revisar/colar.

## Resumo

| Prompt                       | Para gerar                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `data7_module_skeleton`      | Esqueleto canônico de um módulo (`'@Module` header + Imports + Namespace + Class).          |
| `data7_baseenum_pattern`     | Classe BaseEnum completa (Initialize lazy + 3 overloads de Load + Shared Function por valor). |
| `data7_typed_recordlist`     | Subclasse tipada de TRecordList (Find/Filter/Map/ForEach + delegates dedicados).            |
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

**O que gera**:

```basic
'@Module
'@Description: mod_payments — descrição do módulo.

' System Library
Imports Collections

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

### `data7_baseenum_pattern`

**Args**:

```json
{
  "enumName": "CardAdm",
  "values": "[{\"id\":0,\"label\":\"Stone\"},{\"id\":1,\"label\":\"Cielo\"}]"
}
```

Aceita também forma CSV simplificada: `"values": "Stone,Cielo"` (ids 0, 1 atribuídos automaticamente).

**O que gera**: a classe BaseEnum completa documentada em [`docs/linguagem-basic/12-convencoes-idiomaticas.md § 1`](../linguagem-basic/12-convencoes-idiomaticas.md), com Initialize lazy, três overloads de Load (por `enum`, `Integer`, `String`), uma Shared Function por valor, e GetOptions().

```basic
Class CardAdm
   Inherits BaseEnum

   Private Shared _Initialized As Boolean

   Private Shared Sub Initialize()
      If _Initialized Then Exit Sub
      BaseEnum._AddEnumItem("CardAdm", New CardAdm(0, "Stone"))
      BaseEnum._AddEnumItem("CardAdm", New CardAdm(1, "Cielo"))
      _Initialized = True
   End Sub

   Shared Function Stone As CardAdm
      Stone = Load("Stone")
   End Function

   ' ... overloads de Load + GetOptions ...
End Class
```

Idiomático. Substitui a falta de `Enum X / End Enum` na linguagem nativa.

### `data7_typed_recordlist`

**Args**:

```json
{
  "elementTypeName": "CardRecord"
}
```

**O que gera**: a subclasse tipada de `TRecordList` + 3 delegates dedicados (`CardRecordFindDelegate`, `CardRecordMapDelegate`, `CardRecordForEachDelegate`), seguindo o padrão de [`docs/linguagem-basic/12-convencoes-idiomaticas.md § 2`](../linguagem-basic/12-convencoes-idiomaticas.md):

```basic
Delegate Function CardRecordFindDelegate(pValue As CardRecord, i As Integer, extra As Variant) As Boolean
Delegate Function CardRecordMapDelegate(pValue As CardRecord, i As Integer, extra As Variant) As CardRecord
Delegate Sub CardRecordForEachDelegate(pValue As CardRecord, i As Integer, extra As Variant)

Class CardRecordList
   Inherits TRecordList

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

Forma idiomática enquanto o monomorfizador AST de generics não está liberado por padrão.

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
- **Continue**: comando `/data7-baseenum-pattern` (slug-ificado).

Todos validam os argumentos via Zod antes de chamar — argumentos inválidos viram erros descritivos na resposta.

## Quando os prompts ajudam a sua IA mais que docs

| Cenário                                                              | Use isto                       |
| -------------------------------------------------------------------- | ------------------------------ |
| "Crie um arquivo novo `mod_xxx` para fazer Y."                       | `data7_module_skeleton`        |
| "Eu preciso de um enum com esses 3 valores."                         | `data7_baseenum_pattern`       |
| "Preciso de uma coleção tipada de `TFoo` com Find/Map/Filter."       | `data7_typed_recordlist`       |
| "Crie uma tela/formulário para X."                                   | `data7_form_skeleton`          |
| "Como ler `TJSONObject`?"                                            | (use o Tool `data7_describe_symbol`, não prompt) |
| "Eu já tenho o código mas quero entender o açúcar."                  | (use Tool `data7_transpile_bas`) |

Os prompts são para **gerar código novo** seguindo padrões consagrados. Tools são para **consultar/auditar** código existente.
