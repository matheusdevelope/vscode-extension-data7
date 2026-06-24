# 06 — Delegates

> Tipos de função (`Delegate Sub`/`Delegate Function`), callbacks, eventos e o padrão `extra As Variant` para emular closures.

## O que é um `Delegate`

Um `Delegate` é uma **assinatura de função tipada** — análogo a `type Foo = (x: int) => bool` no TypeScript ou `delegate bool Foo(int x)` no C#.

```basic
Delegate Function CardRecordFindDelegate(pValue As CardRecord, i As Integer, extra As Variant) As Boolean
Delegate Function CardRecordMapDelegate(pValue As CardRecord, i As Integer, extra As Variant) As CardRecord
Delegate Sub CardRecordForEachDelegate(pValue As CardRecord, i As Integer, extra As Variant)
```

- `Delegate Function` retorna valor.
- `Delegate Sub` não retorna nada.
- A assinatura define o **contrato** que qualquer função/método passado deve cumprir.

> **Nota sobre o syntax highlighting**: a gramática TextMate atual ([`syntaxes/d7basic.tmLanguage.json`](../../syntaxes/d7basic.tmLanguage.json)) **não** reconhece `Delegate` como keyword — ela aparece sem destaque especial no editor. O parser, o linter e o pipeline de generics reconhecem corretamente; é apenas uma melhoria pendente do highlighter. Vide [01-sintaxe.md § Gaps conhecidos](./01-sintaxe.md#tokens-reconhecidos-pela-gramática).

## Onde usar

### Callbacks (Filter, Find, Map, ForEach)

O padrão idiomático do Data7 é classe de coleção tipada que expõe operadores de ordem superior:

```basic
Class CardRecordList
   Inherits TTList

   Function Find(handler As CardRecordFindDelegate, extra As Variant) As CardRecord
      Find = CType(MyBase.Find(handler, extra), CardRecord)
   End Function

   Function Filter(handler As CardRecordFindDelegate, extra As Variant) As CardRecordList
      Filter = CType(MyBase.Filter(handler, extra), CardRecordList)
   End Function

   Sub ForEach(handler As CardRecordForEachDelegate, extra As Variant)
      MyBase.ForEach(handler, extra)
   End Sub

   Function Map(handler As CardRecordMapDelegate, extra As Variant) As CardRecordList
      With CType(MyBase.Map(handler, extra), CardRecordList)
         Map = .Copy()
      End With
   End Function

End Class
```

E o caller:

```basic
Class Helper
   Shared Function FindByName(pValue As CardRecord, i As Integer, extra As Variant) As Boolean
      FindByName = (pValue.Nome = CStr(extra))
   End Function
End Class

' Uso:
Dim found As CardRecord = lista.Find(Helper.FindByName, "Coca-cola")
```

### Eventos

Eventos da VCL (botões, formulários, grades) usam delegates pré-definidos pelo System Library:

```basic
' Em Globals/TNotifyEvent.ts:
Delegate Sub TNotifyEvent(Sender As TObject)

' Em Globals/TMouseEvent.ts:
Delegate Sub TMouseEvent(Sender As TObject, Button As TMouseButton, Shift As TShiftState, X As Integer, Y As Integer)
```

Atribuição a um handler de evento:

```basic
me.btnSalvar.OnClick = Handle_btnSalvar_Click

Private Sub Handle_btnSalvar_Click(Sender As TObject)
   ' ...
End Sub
```

Se a assinatura do handler não bater com o delegate esperado, o linter emite [`event-signature-mismatch`](./13-diagnostic-codes.md#event-signature-mismatch).

## Limitações: sem closures com captura

Em TypeScript / C# / Java moderno, lambdas capturam variáveis do escopo enclosing automaticamente:

```typescript
// TypeScript
const limit = 100;
list.filter(item => item.valor > limit);  // 'limit' capturado
```

**Data7 Basic NÃO suporta isso.** O `handler` passado para `Find`/`Filter`/`Map` deve ser uma `Function`/`Sub` **nomeada**, e ela **não vê** variáveis do escopo onde foi chamada.

### Padrão `extra As Variant`

Para contornar, todas as assinaturas de Delegate canônicas do Data7 incluem um parâmetro `extra As Variant`. Esse parâmetro carrega o **estado de captura** que o caller precisaria injetar:

```basic
Class Helper
   Shared Function MaiorQue(pValue As CardRecord, i As Integer, extra As Variant) As Boolean
      MaiorQue = (pValue.Valor > CDbl(extra))
   End Function
End Class

' Uso:
Dim limite As Double = 100
Dim acimaDoLimite As CardRecordList = lista.Filter(Helper.MaiorQue, limite)
```

O `limite` da função externa é passado **explicitamente** como `extra`, e dentro do handler é recuperado via `CDbl(extra)` ou `CType(extra, MeuTipo)`.

Para múltiplos valores capturados, embrulhe em uma classe ou `StringList`:

```basic
Class FilterContext
   Public Limite As Double
   Public Bandeira As String
End Class

Class Helper
   Shared Function AcimaDoLimitePorBandeira(pValue As CardRecord, i As Integer, extra As Variant) As Boolean
      Dim ctx As FilterContext = CType(extra, FilterContext)
      AcimaDoLimitePorBandeira = (pValue.Valor > ctx.Limite) And (pValue.Bandeira = ctx.Bandeira)
   End Function
End Class

' Uso:
Dim ctx As New FilterContext()
ctx.Limite = 100
ctx.Bandeira = "Visa"
Dim filtrados As CardRecordList = lista.Filter(Helper.AcimaDoLimitePorBandeira, ctx)
```

### Overloads sem `extra`

A convenção também é oferecer um overload que dispensa o `extra` quando o handler não precisa:

```basic
Function Find(handler As CardRecordFindDelegate) As CardRecord
   Find = me.Find(handler, "")     ' delega para a versão com extra vazio
End Function

Function Find(handler As CardRecordFindDelegate, extra As Variant) As CardRecord
   Find = CType(MyBase.Find(handler, extra), CardRecord)
End Function
```

## Como o Linter valida

- Atribuição de uma função/método a um campo declarado com tipo `Delegate` é checada: aridade e tipos devem bater.
- Atribuição a `OnClick` / `OnMouseDown` / `OnClose` (eventos da VCL) usa o delegate do System Library e dispara `event-signature-mismatch` quando incompatível.
- Métodos `Shared` e métodos de instância são ambos aceitos como handlers — `Shared` é preferido quando o handler não depende do estado do objeto.

## Delegates do System Library

Os principais:

| Delegate | Assinatura | Onde |
|---|---|---|
| `TNotifyEvent` | `(Sender As TObject)` | `Globals/` — base de muitos eventos |
| `TCloseEvent` | `(Sender As TObject, Action As TCloseAction)` | `Globals/` — `Form.OnClose` |
| `TCloseQueryEvent` | `(Sender As TObject, CanClose As Boolean)` | `Globals/` — `Form.OnCloseQuery` |
| `TMouseEvent` | `(Sender, Button, Shift, X, Y)` | `Globals/` — `OnMouseDown`/`OnMouseUp` |
| `TKeyEvent` | `(Sender, Key, Shift)` | `Globals/` — `OnKeyDown`/`OnKeyUp` |
| `TKeyPressEvent` | `(Sender, ByRef Key As Char)` | `Globals/` — `OnKeyPress` |
| `TDataSetNotifyEvent` | `(DataSet As TDataSet)` | `SQL/` — `AfterOpen`, `BeforeClose`, … |
| `TFilterRecordEvent` | `(DataSet, ByRef Accept)` | `SQL/` — `OnFilterRecord` |

Vide [`docs/system-library/`](../system-library/README.md) para o catálogo completo.

## Convenções relacionadas

Vide [10-acucares-atuais.md](./10-acucares-atuais.md):

- **Function reference com `@`** — `list.Filter(@Helper.FindByName)` (validação compile-time).
- **Lambda sem captura** — `(p As CardRecord, i, x) => p.Valor > 100` gera `Shared Function __lambda_N` automaticamente.

## Cross-references

- [05-classes.md](./05-classes.md) — `Shared` (estáticos), sobrecarga.
- [12-convencoes-idiomaticas.md](./12-convencoes-idiomaticas.md) — TTList tipado, padrão FilterContext.
- [`docs/linguagem-basic/mod_card_grouper/src/mod_card/core/mod_card_record.bas`](./mod_card_grouper/src/mod_card/core/mod_card_record.bas) — exemplo real completo com `CardRecordList` + delegates.
