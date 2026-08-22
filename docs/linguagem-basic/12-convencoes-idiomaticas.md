# 12 — Convenções idiomáticas

> Padrões de uso recorrentes em projetos Data7 reais — as "boas práticas de facto" extraídas de [`mod_card_grouper/`](./mod_card_grouper) e da System Library.

## 0. Hierarquia de coleções

Para **código novo**, prefira os recursos modernos da extensão antes de padrões legados:

| Cenário | Preferir | Fallback legado |
|---|---|---|
| Coleção tipada nova | `Dim items[] As T` / `Function F(p[] As T)` + literais `[...]` + `.Filter/.Map/.Reduce` | — |
| Objetos de domínio | `TTList<T>` via `mod_tlist` + array-list | Subclasse `Inherits TTList<T>` quando `Filter` retorna tipo concreto ([`04-subclass-filter.bas`](../example/sugar/array-list/04-subclass-filter.bas)) |
| Iteração simples | `For Each` sobre `TTList` / `[]` | `For Each` sobre `StringList` |
| Strings / interop ERP | `StringList` + `Imports Collections` | — |
| Enum rico | `Enun X / End Enun` (sugar → `TEnum`) | `data7_TEnum_pattern` com `form: "expanded"` só se precisar customizar a classe |
| Boilerplate CType/delegates | **Evitar** em código novo | Prompt MCP `data7_typed_recordlist` |

Exemplos canônicos de array-list:

- [`sugar/array-list/01-primitive-filter-map-reduce`](../example/sugar/array-list/01-primitive-filter-map-reduce.bas) — primitivos, Filter/Map/Reduce
- [`sugar/array-list/02-object-windowing-chains`](../example/sugar/array-list/02-object-windowing-chains.bas) — objetos, First/Last/Slice
- [`sugar/array-list/03-four-stage-chain`](../example/sugar/array-list/03-four-stage-chain.bas) — cadeia multi-estágio
- [`sugar/array-list/04-subclass-filter`](../example/sugar/array-list/04-subclass-filter.bas) — subclasse quando Filter retorna tipo concreto

Requisitos: `language.sugars` e `language.generics` habilitados nas configurações da extensão (`data7.features`).

> **Nota sobre `mod_card_grouper`**: o projeto de referência usa padrões de produção anteriores (subclasses `TTList` manuais). Trate-o como exemplo de telas e domínio ERP, não como modelo para coleções novas.

## 1. Enum rico — sugar `Enun` (padrão)

Para enums ricos além do `Enum` nativo simples, **declare com o sugar** `Enun` / `End Enun`. O tooling materializa `Class X Inherits TEnum` no build; **não** escreva a classe expandida à mão no fluxo normal.

```basic
Imports mod_tenum

Namespace mod_card_adm

   Enun CardAdm
      Stone = "Stone"
      Cielo = "Cielo"
      ' Valor numérico vira String na materialização:
      ' RedeCard = 23
   End Enun

End Namespace
```

Uso da superfície materializada (factories, Load, membros de `TEnum`):

```basic
Dim adm As CardAdm = CardAdm.Stone

If adm.IsValue(CardAdm.Cielo) Then
   ' ...
End If

Select adm
   Case CardAdm.Stone
      ' ...
   Case CardAdm.Cielo
      ' ...
End Select

Dim label As String = adm.AsString
Dim loaded As CardAdm = CardAdm.Load("Stone")

For Each opt As String In CardAdm.GetOptions().Split(";")
   ' ...
Next
```

**API que o sugar disponibiliza** (após materialização):

- Factories Shared por valor (`CardAdm.Stone`, …) — sem parênteses na declaração.
- `Load(String)` / `Load(Integer)` / `Load(CardAdm)` e `GetOptions()`.
- Instância: `.AsString`, `.AsInteger`, `.AsOption`, `.IsValue(...)` (herdados de `TEnum`).
- Sem construtor local: a base fornece `New(Integer, String)`.
- Descrições são sempre `String` — entradas numéricas no sugar (`RedeCard = 23`) viram `"23"`.

Prompt MCP: `data7_TEnum_pattern` (default `form: "enun"`). Vide [10-acucares-atuais.md § D1](./10-acucares-atuais.md#fase-d--enum-declarativo). `Enum X / End Enum` é reservado para o enum nativo do compilador.

### 1.1 Forma expandida (só customização)

Use a classe `Inherits TEnum` completa **apenas** quando precisar alterar a materialização (lógica extra em `Load`, campos adicionais, etc.). Prompt: `data7_TEnum_pattern` com `form: "expanded"`.

```basic
Class CardAdm
   Inherits TEnum

   Private Shared Sub Initialize()
      If TEnum._IsCached("CardAdm", "Stone") Then Exit Sub
      TEnum._AddEnumItem("CardAdm", New CardAdm(0, "Stone"))
      TEnum._AddEnumItem("CardAdm", New CardAdm(1, "Cielo"))
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
      Load = CardAdm(TEnum._GetCache("CardAdm", pValue))
   End Function

   Shared Function Load(pValue As String) As CardAdm
      CardAdm.Initialize()
      Load = CardAdm(TEnum._GetCache("CardAdm", pValue))
   End Function

   Shared Function GetOptions() As String
      CardAdm.Initialize()
      GetOptions = TEnum._GetEnumOptions("CardAdm")
   End Function

End Class
```

## 2. Padrão `TTList` tipado

### 2.1 Padrão moderno (preferido): `array-list` + generics

Para coleções tipadas novas, use o sugar `array-list` sobre `TTList<T>` (`mod_tlist`):

```basic
Imports mod_tlist

Namespace mod_domain
   Sub Processar()
      Dim records[] As CardRecord = [New CardRecord(), New CardRecord()]

      Dim ativos[] As CardRecord = records.Filter(
         Function(p As CardRecord) As Boolean p.Ativo
      )

      Dim total As Double = ativos. _
         Map<Double>(Function(p As CardRecord) As Double p.Valor). _
         Reduce<Double>(Function(acc As Double, v As Double) As Double acc + v, 0.0)

      For Each item As CardRecord In ativos
         item.Processar()
      Next
   End Sub
End Namespace
```

Quando `Filter` precisa retornar uma subclasse concreta (ex.: `Pessoas` em vez de `TTList<Pessoa>`), use `Class Pessoas Inherits TTList<Pessoa>` — vide [`04-subclass-filter.bas`](../example/sugar/array-list/04-subclass-filter.bas).

Generics e monomorfização: vide [07-generics.md](./07-generics.md). Prompt MCP para gerar coleção moderna: `data7_array_list_collection`.

### 2.2 Fallback legado (pré-generics / integração)

Use **somente** para integração com código legado ou quando a API exige subclasse com re-tipagem manual via CType. O prompt MCP `data7_typed_recordlist` gera este boilerplate:

```basic
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

**Características do fallback**:

- Cada método herdado é "**re-typed**" via `CType(MyBase.<X>(), CardRecord)`.
- Delegates dedicados (`CardRecordFindDelegate`, `CardRecordMapDelegate`, `CardRecordForEachDelegate`) com `T = CardRecord` resolvido.
- Métodos funcionais (`Find`, `Filter`, `ForEach`, `Map`) carregam `extra As Variant` para emular captura.

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

Esse padrão "**covariância manual**" é a forma idiomática quando a base retorna tipo abstrato e o filho quer retornar tipo concreto. Vide [Padrão TTList tipado](#2-padrão-TTList-tipado) acima.

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

## 10. Nomes de Namespace

Um `Namespace` declarado pelo usuário segue o mesmo charset dos identificadores:

- Caracteres: letras, números e underscore (`_`).
- Deve começar com letra ou underscore.
- **Nunca use pontos (`.`)** na declaração — pontos são só para acesso qualificado (`mod_foo.Bar`) ou alguns `Imports` da System Library (`System.Classes`).

```basic
' Certo
Namespace mod_card_record
End Namespace

' Errado — pontos na declaração
' Namespace mod.card.record
```

Convenção: nome do arquivo ≈ nome do namespace (`mod_card_record.bas` → `Namespace mod_card_record`).

## 11. Imports no topo, sem self-import e sem ciclos

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

**Regras obrigatórias:**

1. **Nunca** importe o namespace declarado no mesmo arquivo (`Imports mod_card_extractor` dentro de `Namespace mod_card_extractor` → [`circular-import`](./13-diagnostic-codes.md#circular-import)).
2. **Imports circulares não são aceitos** (A↔B ou ciclos transitivos). O linter emite `circular-import`.
3. Se um ciclo parecer necessário: **reestruture** (extraia o tipo/método compartilhado para um terceiro módulo) **ou** use o **nome qualificado sem `Imports`**:

```basic
' Evita Imports mod_outro quando o import fecharia um ciclo
Dim parser As mod_outro.XMLParser
Call mod_outro.Processar(dados)
```

Forma: `nome_do_namespace.NomeDoMetodoOuTipoOuVariavel`. Detalhes em [08-modulos-e-imports.md](./08-modulos-e-imports.md).

## 12. Nomenclatura de campos privados

`_camelCase`:

```basic
Private _form As TPipelineForm
Private _inputAdm As CardAdm
Private _lastError As String
```

Campos públicos: `PascalCase` (`Nome`, `Idade`, `Estabelecimento`).

Parâmetros: `p<Nome>` (`pIndex`, `pValue`, `pName`).

## 13. Sobrecargas de delegate com e sem `extra`

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
