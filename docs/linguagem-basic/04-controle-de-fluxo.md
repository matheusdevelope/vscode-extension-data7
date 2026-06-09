# 04 — Controle de fluxo

> Estruturas de fluxo: condicionais, loops, switch, exceções e blocos auxiliares.

## `If` / `ElseIf` / `Else`

### Multi-linha

```basic
If pAdm = NULL Then
   Throw New Exception("Invalid CardAdm")
ElseIf pAdm = CardAdm.Stone Then
   Load = mod_card_stone.CardGroupersStone.LoadGrouper(pGrouperName, pAdm)
Else
   Load = NULL
End If
```

### Single-line

Tudo em uma linha sem `End If`:

```basic
If pAdm = NULL Then Return ""
If safeGrouper = "" Then Exit Sub
```

Esse formato funciona para um único statement no `Then`. Para `Else` inline:

```basic
If x > 0 Then y = "positivo" Else y = "negativo"
```

## `For` (loop numérico)

```basic
For i = 0 To 10
   ' i vai de 0 a 10 inclusivo (11 iterações)
Next

For i = 0 To count - 1
   ' i vai de 0 a count-1
Next

For i = 10 To 0 Step -1
   ' decremento explícito via Step
Next
```

A variável do loop é **implicitamente Integer**. Não há `As Integer` no header.

`Exit For` interrompe o loop:

```basic
For i = 0 To 100
   If found Then Exit For
   ' ...
Next
```

## `For Each` — açúcar transpilado

Sintaxe açucarada (vide [10-acucares-atuais.md](./10-acucares-atuais.md)):

```basic
For Each item As String In list
   ' usa item
Next

For Each item In list      ' tipo inferido pelo indexer
   ' ...
Next

For Each i In 0..10        ' range — açúcar de For numérico
   ' ...
Next
```

Para qualificar como **iterável** o tipo precisa expor `Count As Integer` + um acessor inteiro (`Items`, `Item`, `Strings` ou `Objects`). Tipos sem isso disparam [`not-enumerable`](./13-diagnostic-codes.md#not-enumerable) e o Builder preserva a linha verbatim.

## `Select Case`

```basic
Select pAdm
   Case CardAdm.Stone
      Load = mod_card_stone.CardGroupersStone.LoadGrouper(pGrouperName, pAdm)
   Case CardAdm.Cielo
      Load = mod_card_cielo.CardGroupersCielo.LoadGrouper(pGrouperName, pAdm)
   Case Else
      Throw New Exception("Groupers not supported for ADM: " + pAdm.AsString)
End Select
```

A keyword no Data7 é **`Select`** (não `Select Case`). Há suporte a:

- `Case <valor>` — igualdade simples.
- `Case <a>, <b>, <c>` — múltiplos valores.
- `Case Is <op> <expr>` — comparação (`Case Is > 10`).
- `Case <a> To <b>` — intervalo (`Case 1 To 9`).
- `Case Else` — branch padrão.

Não há fall-through entre cases (cada bloco é exclusivo). Não use `Exit Select` — não existe.

## `While` / `Do` / `Loop` / `Until`

A gramática reconhece três formas, todas com semântica equivalente ao Basic clássico:

### `While ... End While`

```basic
While Not done
   ' ...
   If problema Then Exit While
End While
```

### `Do While ... Loop` (pre-test, continua enquanto condição é verdadeira)

```basic
Do While condition
   ' ...
Loop
```

### `Do ... Loop While condition` (post-test)

```basic
Do
   ' executa pelo menos uma vez
Loop While condition
```

### `Do Until ... Loop` (pre-test, continua **até** que a condição seja verdadeira)

```basic
Do Until done
   ' ...
Loop
```

### `Do ... Loop Until condition` (post-test, oposto polar do `Loop While`)

```basic
Do
   ' executa pelo menos uma vez
Loop Until queueEmpty
```

`Exit While` / `Exit Do` para sair antecipadamente. As keywords `While`, `Do`, `Loop`, `Until` são todas reconhecidas pela gramática.

## `Try` / `Catch` / `Finally`

```basic
Try
   me._inputAdm = CardAdm.Load(pSchema)
   me._pipe.Schema = CardSchema.Load(me._inputAdm)
Catch ex As Exception
   me._lastError = ex._GetMessage()
   Throw ex
Finally
   me._loading = False
End Try
```

- `Catch ex As Exception` captura qualquer exceção. Para tipos específicos, use `Catch ex As MeuTipoExcecao`.
- `Throw <expr>` levanta uma exceção. `Throw ex` re-levanta a atual.
- `Throw New Exception("mensagem")` é o padrão.
- `Finally` sempre executa (sucesso ou exceção). Use para `Free()` em recursos manuais ou use o sugar [`Using` em 10-acucares-atuais.md](./10-acucares-atuais.md#fase-b--inicializacao-e-objeto) quando o padrão couber.

## `With`

Bloco com sujeito implícito — economiza repetição quando você acessa vários membros do mesmo objeto:

```basic
With me.Definition.Fields
   .Add(New TField("Bandeira"))
   .Add(New TField("Produto"))
End With

With console.Block("CardRecord")
   .Prop("Estabelecimento", me.Estabelecimento)
   .Prop("Bandeira", me.Bandeira)
   .Close()
   .Printe(pPrint)
   ToString = .Text
   .Free()
End With
```

`.Membro` referencia o alvo do `With`. Aninhamento é tolerado mas raro.

## `Exit`

| Forma | Onde sai |
|---|---|
| `Exit Sub` | sai do procedimento atual |
| `Exit Function` | sai da função atual (use ANTES da atribuição final ao nome) |
| `Exit Property` | sai do acessor `Get`/`Set` atual da propriedade |
| `Exit For` | sai do `For`/`For Each` mais interno |
| `Exit While` | sai do `While` mais interno |
| `Exit Do` | sai do `Do`/`Loop` mais interno (independente da forma `While`/`Until`) |

## `Return`

Forma VB.NET clássica:

```basic
Function Foo() As Integer
   Return 42
End Function
```

Coexiste com a forma Pascal/VB6 tradicional:

```basic
Function Foo() As Integer
   Foo = 42
End Function
```

**Ambas funcionam** — escolha um estilo por projeto. Misturar é tolerado mas confunde leitores.

`Return <expr>` em Sub:

```basic
Sub Foo()
   If x = NULL Then Return
   ' ...
End Sub
```

Aqui `Return` (sem expressão) age como `Exit Sub`.

## `Print`

Statement de saída (não função — sem parênteses):

```basic
Print "Olá, mundo!"
Print status
Print "Resultado: " & valor
```

Onde a saída vai depende do executor do ERP (geralmente um buffer de console interno ou window de debug). Use `console.log(...)` (padrão idiomático do `mod_card_grouper`) para logs estruturados — vide [12-convencoes-idiomaticas.md](./12-convencoes-idiomaticas.md).

## `Throw` / `Exception`

```basic
Throw New Exception("Grouper não implementado na Stone.")
Throw ex                                      ' re-levanta
Throw New ArgumentException("pIndex inválido")  ' tipo específico
```

`Exception` é um tipo global (vive em `Globals/`) com membros como `_GetMessage()`, `Message`, `ClassName()`, etc.

## Anatomia de um método típico

Combinando todos os blocos acima:

```basic
Function LoadGrouper(pGrouperName As String, pAdm As CardAdm) As CardGrouper
   CardGroupersStone.Initialize()

   Select CardGroupersStone.Load(pGrouperName)
      Case CardGroupersStone.BandeiraProduto
         Return New GrouperBandeiraProduto(pAdm)
      Case CardGroupersStone.DataPagamento
         Return New GrouperDataPagamento(pAdm)
      Case Else
         Throw New Exception("Grouper não implementado na Stone.")
   End Select
End Function
```

## Cross-references

- [05-classes.md](./05-classes.md) — `Sub`, `Function`, parâmetros, sobrecarga.
- [10-acucares-atuais.md](./10-acucares-atuais.md) — `For Each`, ternário, interpolação detalhados.
- [`docs/example/sugar/for-each/`](../example/sugar/for-each) — exemplos canônicos de `For Each`.
- [`docs/example/sugar/ternary/`](../example/sugar/ternary) — exemplos canônicos de ternário.
