# 12 — Convenções idiomáticas

> Padrões de uso recorrentes em projetos Data7 reais — as "boas práticas de facto" extraídas de [`mod_card_grouper/`](./mod_card_grouper) e da System Library.

## 1. Padrão `BaseEnum`

Como não há `Enum` nativo, o padrão idiomático é uma classe que herda de `BaseEnum`:

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

   Shared Function Cielo As CardAdm
      Cielo = Load("Cielo")
   End Function

   Shared Function Load(pValue As CardAdm) As CardAdm
      Load = Load(pValue.AsString)
   End Function

   Shared Function Load(pValue As Integer) As CardAdm
      CardAdm.Initialize()
      Load = CardAdm(BaseEnum._GetCache("CardAdm", pValue))
   End Function

   Shared Function Load(pValue As String) As CardAdm
      CardAdm.Initialize()
      Load = CardAdm(BaseEnum._GetCache("CardAdm", pValue))
   End Function

   Shared Function GetOptions() As String
      CardAdm.Initialize()
      GetOptions = BaseEnum._GetEnumOptions("CardAdm")
   End Function

End Class
```

Uso:

```basic
Dim adm As CardAdm = CardAdm.Stone

Select adm
   Case CardAdm.Stone
      ' ...
   Case CardAdm.Cielo
      ' ...
End Select

For Each opt As String In CardAdm.GetOptions().Split(";")
   ' ...
Next
```

**Características**:

- `_Initialized` flag para inicialização lazy (chamada só na primeira chamada a `Load`/`GetOptions`).
- Três overloads de `Load`: por `Integer`, por `String`, por instância (reflexivo).
- `GetOptions` retorna lista delimitada para popular ComboBoxes do ERP.
- Cada valor declarado tem **um Shared Function** com o nome do valor (`Stone`, `Cielo`), retornando a instância.

**Futuro açúcar**: `Enum X / End Enum` que gera essa classe automaticamente (vide [10-acucares-atuais.md § D1](./10-acucares-atuais.md#fase-d--enum-declarativo)).

## 2. Padrão `TRecordList` tipado

Como `StringList` é o único tipo de coleção nativo e não suporta generics, o padrão é **subclasse tipada** de uma `TRecordList` base genérica (que existe em um módulo do workspace, ex.: `mod_base_list`):

```basic
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

   Function Take(pIndex As Integer) As CardRecord
      Take = CType(MyBase.Take(pIndex), CardRecord)
   End Function

   Function First As CardRecord
      First = CType(MyBase.First, CardRecord)
   End Function

   Function Last As CardRecord
      Last = CType(MyBase.Last, CardRecord)
   End Function

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
      Map = CType(MyBase.Map(handler, extra), CardRecordList)
   End Function

End Class
```

**Características**:

- Cada método herdado é "**re-typed**" via `CType(MyBase.<X>(), CardRecord)`.
- Delegates dedicados (`CardRecordFindDelegate`, `CardRecordMapDelegate`, `CardRecordForEachDelegate`) com `T = CardRecord` resolvido.
- Métodos funcionais (`Find`, `Filter`, `ForEach`, `Map`) carregam `extra As Variant` para emular captura.

**Futuro**: monomorfização permitirá que `CardRecordList = TList<CardRecord>` seja escrito **diretamente**, sem subclasse boilerplate (vide [07-generics.md](./07-generics.md)).

## 3. Construtor delegando a base + opções com `With`

```basic
Sub New(pAdm As CardAdm, pName As String)
   MyBase.New("-", "CardGrouper-" + pAdm.AsString + "-" + pName)
   me.Adm = pAdm

   With me.Definition.Fields
      .Add(New TField("Bandeira"))
      .Add(New TField("Produto"))
   End With
End Sub
```

**Convenções**:

- Primeira instrução é `MyBase.New(...)`.
- Inicialização de campos `ReadOnly` é feita logo após.
- Configuração de propriedades agregadas (`.Fields`) usa `With` para legibilidade.

## 4. Padrão `console.Block` para logging estruturado

```basic
With console.Block("CardRecord")
   .Prop("Estabelecimento", me.Estabelecimento)
   .Prop("Bandeira", me.Bandeira)
   .Prop("NumeroParcela", me.NumeroParcela)
   .Prop("DataVenda", me.DataVenda.ToString())
   .Prop("ValorBruto", me.ValorBruto)
   .Close()
   .Printe(pPrint)
   ToString = .Text
   .Free()
End With
```

**Estrutura**:

- `console.Block(<nome>)` abre um bloco nomeado.
- `.Prop(<key>, <value>)` adiciona um par chave-valor.
- `.Close()` fecha o bloco.
- `.Printe(pPrint)` imprime no console se `pPrint = True` (override para silenciar em testes).
- `.Text` retorna o conteúdo formatado.
- `.Free()` libera o block.

Esse pattern é **do código de usuário**, não da System Library — mas é tão difundido que vale documentar como convenção.

## 5. `Free()` herdado: sempre chame `MyBase.Free()` no final

```basic
Sub Free()
   me._card_controller.Free()    ' libera próprios recursos
   MyBase.Free()                  ' libera a base
End Sub
```

**Ordem importa**: libere seus próprios recursos **antes** de chamar `MyBase.Free()` (após esta chamada, `me` pode estar parcialmente destruído).

## 6. `CType(MyBase.X, T)` para reabrir API com tipo específico

```basic
Function Take(pIndex As Integer) As CardRecord
   Take = CType(MyBase.Take(pIndex), CardRecord)
End Function
```

Esse padrão "**covariância manual**" é a forma idiomática quando a base retorna tipo abstrato e o filho quer retornar tipo concreto. Vide [Padrão TRecordList tipado](#2-padrão-trecordlist-tipado) acima.

## 7. `Try/Finally` para recursos manuais

Sem `Using`, libere recursos manualmente:

```basic
Dim form As New TForm
Try
   form.Show()
   ' ...
Finally
   form.Free()
End Try
```

Ou seguindo padrão "abrir/processar/liberar" linear quando não há exceção esperada (vide [`mod_card_grouper/src/Principal.bas`](./mod_card_grouper/src/Principal.bas)):

```basic
Dim _form As New TFormCard("Processar retorno de cartões 3")
_form.Show()
_form.Free()
```

Esse formato é **mais arriscado** (vaza se `Show()` levantar exceção); use `Try/Finally` para código defensivo.

## 8. Encadeamento `.Cell("X").Value.AsDefault`

Para acessar valores de células em coleções tipo grid/record:

```basic
me.Cell("Estabelecimento").Value.AsDefault          ' string padrão
me.Cell("ValorBruto").Value.AsFloat                  ' double
me.Cell("DataVenda").Value.AsDateTime                ' TDateTime
me.Cell("NumeroParcela").Value.AsInteger             ' integer
me.Cell("Ativo").Value.AsBoolean                     ' boolean
```

Essa convenção vem da **classe `TRecord` do projeto base** — não da System Library — mas é universal.

## 9. Estilo de retorno: nome-da-função vs `Return`

**Os dois estilos coexistem.** Recomendação:

- Use `Foo = <expr>` (Pascal/VB6) quando há um único ponto de retorno no fim:

```basic
Function Soma(a As Integer, b As Integer) As Integer
   Soma = a + b
End Function
```

- Use `Return <expr>` quando há early return ou múltiplos pontos:

```basic
Function Validar(pValor As Integer) As Boolean
   If pValor < 0 Then Return False
   If pValor > 1000 Then Return False
   Return True
End Function
```

Misturar ambos no mesmo método é tolerado mas confunde leitores — evite.

## 10. Imports no topo, em blocos lógicos

```basic
'@Module

' System Library
Imports Collections
Imports SQL
Imports Data7

' Módulos do workspace
Imports mod_pipeline_record
Imports mod_pipeline_navigator
Imports mod_card_record
Imports mod_card_adm

Namespace mod_card_extractor
   ' ...
End Namespace
```

Separação visual em blocos (System Library / módulos compartilhados / módulos locais) facilita revisão.

## 11. Nomenclatura de campos privados

`_camelCase`:

```basic
Private _form As TPipelineForm
Private _inputAdm As CardAdm
Private _lastError As String
```

Campos públicos: `PascalCase` (`Nome`, `Idade`, `Estabelecimento`).

Parâmetros: `p<Nome>` (`pIndex`, `pValue`, `pName`).

## 12. Sobrecargas de delegate com e sem `extra`

Para conveniência do caller, todos os métodos que aceitam delegates oferecem **dois overloads**:

```basic
Function Find(handler As CardRecordFindDelegate) As CardRecord
   Find = me.Find(handler, "")     ' delega com extra vazio
End Function

Function Find(handler As CardRecordFindDelegate, extra As Variant) As CardRecord
   Find = CType(MyBase.Find(handler, extra), CardRecord)
End Function
```

## Cross-references

- [`docs/linguagem-basic/mod_card_grouper/`](./mod_card_grouper) — fonte de quase todas as convenções acima.
- [06-delegates.md](./06-delegates.md) — padrão `extra As Variant`.
- [05-classes.md](./05-classes.md) — herança, `MyBase`, `Overrides`.
- [11-limitacoes-conhecidas.md](./11-limitacoes-conhecidas.md) — limitações que motivam essas convenções.
