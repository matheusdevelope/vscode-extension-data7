# 05 — Classes

> Declaração de classes, herança, propriedades, métodos, visibilidade e instanciação.

## Anatomia de uma classe

```basic
Namespace mod_card_record

   Class CardRecord
      Inherits TRecord

      ' --- Campos ---
      Private _id As Integer
      Public Estabelecimento As String
      ReadOnly Adm As CardAdm

      ' --- Construtores ---
      Sub New(pIndex As Integer)
         MyBase.New(pIndex)
         me._id = pIndex
      End Sub

      Sub New(pValue As CardRecord)
         MyBase.New(pValue)
      End Sub

      ' --- Propriedades ---
      Property ID As Integer
         Get
            ID = me._id
         End Get
         Set(pValue As Integer)
            me._id = pValue
         End Set
      End Property

      ' --- Métodos ---
      Function Copy() As CardRecord
         Copy = New CardRecord(me)
      End Function

      Overrides Function ToString(pPrint As Boolean = False) As String
         ToString = "CardRecord(" & me._id & ")"
      End Function

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace
```

## Herança

Toda classe **implicitamente** herda de `TObject` se não especificado. Use `Inherits <BaseClass>` para herança explícita:

```basic
Class CardRecord
   Inherits TRecord     ' herda de TRecord (que herda de TObject)
   ...
End Class
```

A cadeia de herança real do exemplo:

```
CardRecord → TRecord → TObject (System.Classes)
```

**Não há herança múltipla** — apenas single-inheritance.

### `MyBase`

`MyBase` é a referência ao **objeto base** desta instância. Use para:

- Chamar o construtor da base: `MyBase.New(pIndex)`.
- Chamar a versão original de um método sobrescrito: `MyBase.Free()`.
- Acessar métodos da base que foram sombreados.

```basic
Sub New(pIndex As Integer)
   MyBase.New(pIndex)         ' chama TRecord.New(pIndex)
   me._id = pIndex
End Sub

Overrides Function ToString() As String
   ToString = MyBase.ToString() & " [tag=" & me._tag & "]"
End Function
```

A chamada ao construtor da base, quando presente, **deve ser a primeira instrução** do construtor.

### `me`

`me` (em minúsculas) é a referência **ao próprio objeto** (equivalente ao `this` do TS/Java/C# ou `Self` do Delphi/Pascal). Não é case-sensitive (`Me`, `ME` aceitos).

```basic
me._id = pIndex                          ' acessar campo
me.Cell("Bandeira").Value.AsDefault      ' chamar método
```

`me.` é opcional para membros não ambíguos:

```basic
_id = pIndex     ' equivalente a me._id = pIndex
```

Use `me.` quando houver ambiguidade entre campo e parâmetro (`Set(pValue As String) / me._nome = pValue`).

### `Overridable` / `Overrides`

Para tornar um método **sobrescrevível** por descendentes, declare-o como `Overridable` na classe base:

```basic
Class TBase
   Overridable Function ToString() As String
      ToString = "TBase"
   End Function
End Class
```

E na classe descendente, use `Overrides` para fornecer a nova implementação:

```basic
Class TDerived
   Inherits TBase

   Overrides Function ToString(pPrint As Boolean = False) As String
      ToString = "TDerived"
   End Function

   Overrides Sub SetInputSchema(pSchema As String)
      MyBase.SetInputSchema(pSchema)
      ' ...
   End Sub
End Class
```

Regras:

- Sem `Overrides`, o método declarado em um descendente é considerado **novo** (sombreia o herdado em vez de sobrescrever).
- Sem `Overridable` na base, o compilador pode rejeitar o `Overrides` (o ERP é lenient nessa checagem, mas é convenção marcar.)
- Métodos `Shared` **não** podem ser `Overridable`/`Overrides` (estáticos não participam de polimorfismo).

## Visibilidade

| Modificador | Significado |
|---|---|
| `Public` | acessível de qualquer lugar (padrão se omitido) |
| `Private` | só dentro da classe declarante. Acesso externo dispara [`private-member-access`](./13-diagnostic-codes.md#private-member-access) |
| `Protected` | acessível na classe e em descendentes (raramente usado em Data7) |
| `Shared` | membro de classe (estático) — vide [`Shared` abaixo](#shared) |
| `ReadOnly` | só pode ser atribuído no construtor (vide [`ReadOnly`](#readonly)) |

```basic
Private _form As TPipelineForm           ' campo privado
Public Nome As String                    ' campo público (padrão)
Protected _baseConfig As TConfig         ' visível em descendentes
Shared _Initialized As Boolean           ' campo de classe (estático)
ReadOnly Adm As CardAdm                  ' atribuível só no construtor
```

A combinação `Private Shared` é comum para singletons internos:

```basic
Private Shared _Initialized As Boolean
```

## Campos vs. Propriedades

### Campo simples

```basic
Public Nome As String                              ' acesso direto: obj.Nome
Public Idade As Integer = 0                        ' com valor default
Estabelecimento As TField = New TField("Est")      ' com initializer (instância nova por objeto)
```

### Propriedade com `Get`/`Set`

Use propriedade quando precisar de lógica ao ler/escrever:

```basic
Property Bandeira As String
   Get
      Bandeira = me.Cell("Bandeira").Value.AsDefault
   End Get
   Set(pValue As String)
      me.Cell("Bandeira").Value.Value = pValue
   End Set
End Property
```

- O **nome da função getter** (`Bandeira`) é também o "registro de retorno" — atribuir a ele equivale a `Return`.
- `Set(pValue As <Tipo>)` recebe o valor a atribuir.
- Para propriedade **somente leitura**, omita o `Set`.
- Para propriedade **somente escrita**, omita o `Get` (raro).

### Propriedade indexada

```basic
Property Item(pIndex As Integer) As CardRecord
   Get
      Item = CType(MyBase.Take(pIndex), CardRecord)
   End Get
   Set(pValue As CardRecord)
      me.SetItem(pIndex, pValue)
   End Set
End Property
```

Acessada como `list.Item(0)`. O exemplo [`default-indexer`](../example/sugar/default-indexer) documenta a convenção de design-time para `Property Item(...)`; `list(0)` ainda não é reescrito automaticamente pelo transpilador.

## `ReadOnly`

Campos `ReadOnly` só podem ser atribuídos:

1. Na inicialização (`ReadOnly Adm As CardAdm = CardAdm.Stone`).
2. Dentro do construtor (`Sub New`).

Tentativa de atribuir fora disso dispara erro em runtime e o diagnóstico `readonly-assignment` quando o linter consegue identificar o alvo.

```basic
Class CardGrouper
   ReadOnly Adm As CardAdm

   Sub New(pAdm As CardAdm, pName As String)
      MyBase.New("-", "CardGrouper-" + pAdm.AsString + "-" + pName)
      me.Adm = pAdm     ' OK — está no construtor
   End Sub

   Sub TrocarAdm(pNovo As CardAdm)
      me.Adm = pNovo    ' ERRO — fora do construtor
   End Sub
End Class
```

## `Shared` (membros estáticos)

Membros `Shared` pertencem à **classe**, não à instância. Acessados via `ClasseNome.Membro`:

```basic
Class CardAdm
   Inherits TEnum

   Private Shared _Initialized As Boolean

   Private Shared Sub Initialize()
      If _Initialized Then Exit Sub
      TEnum._AddEnumItem("CardAdm", New CardAdm(0, "Stone"))
      _Initialized = True
   End Sub

   Shared Function Stone As CardAdm
      Stone = Load("Stone")
   End Function
End Class

' Uso:
Dim adm As CardAdm = CardAdm.Stone   ' chamada estática
```

`Shared` é equivalente a `static` do C#/Java ou `Shared` do VB.NET.

## Sobrecarga

Vários métodos com o **mesmo nome** mas assinaturas diferentes:

```basic
Function Take(pIndex As String) As CardRecord
   Take = CType(MyBase.TakeFromId(pIndex), CardRecord)
End Function

Function Take(pIndex As Integer) As CardRecord
   Take = CType(MyBase.Take(pIndex), CardRecord)
End Function

Function First As CardRecord
   First = CType(MyBase.First, CardRecord)
End Function

Function First(pLimit As Integer) As CardRecordList
   First = CType(MyBase.Range(pLimit, False), CardRecordList)
End Function
```

A escolha de qual overload chamar acontece em **compile-time** baseada nos tipos dos argumentos passados.

Função/Sub sem parâmetros pode omitir os parênteses na declaração (vide `First` acima — `First As CardRecord`).

## Parâmetros

```basic
Sub Foo(pName As String)                                    ' simples
Sub Foo(pName As String, pCount As Integer = 0)             ' com default (= opcional implícito)
Sub Foo(Optional pName As String = "")                      ' opcional explícito
Sub Foo(ByRef pTotal As Integer)                            ' por referência (saída)
Sub Foo(ByVal pName As String)                              ' por valor (default — explícito raro)
```

- `ByRef` permite ao callee modificar a variável do caller.
- `Optional` (ou valor default) marca como omissível pelo caller — todos os parâmetros à direita também devem ser opcionais.
- Sem modificador a passagem é **por valor**.

## `Sub` vs. `Function`

| Forma | Retorna valor? |
|---|---|
| `Sub` | não — retorno `Void` |
| `Function ... As <Tipo>` | sim |

A função pode retornar pelo **nome da função** (estilo Pascal/VB6) ou via `Return` (estilo VB.NET):

```basic
Function Soma(a As Integer, b As Integer) As Integer
   Soma = a + b      ' atribui ao nome → retorno
End Function

Function Soma2(a As Integer, b As Integer) As Integer
   Return a + b      ' equivalente
End Function
```

## Instanciação

```basic
Dim x As New TForm()                          ' construção inline (mais idiomático)
Dim x As TForm = New TForm()                  ' explícito com As + New
Dim x As TForm                                 ' declaração SEM construção (x = NULL!)
x = New TForm()                                ' construção posterior

' Com argumentos:
Dim _form As New TFormCard("Processar retorno")
```

`Dim x As TForm` sozinho **NÃO** chama o construtor — `x` fica `NULL`. Esse é um pegadinha comum.

## Destruição: `Free` vs `Destroy`

A convenção Delphi/Data7 para liberar memória:

```basic
Dim x As New TForm()
x.Show()
x.Free()      ' libera a instância
```

- **`Free`** é a forma idiomática. Internamente testa `Self <> NULL` antes de chamar `Destroy`.
- **`Destroy`** é o destrutor real, virtual — sobrescrito por descendentes.
- **`DisposeOf`** existe mas raro fora de FireMonkey.

`MyBase.Free()` no `Free` do descendente garante que os recursos da base também são liberados:

```basic
Sub Free()
   me._card_controller.Free()    ' libera próprios recursos
   MyBase.Free()                  ' libera a base
End Sub
```

## Hierarquia `TObject`

Todas as classes ultimately derivam de `System.Classes.TObject`. Membros úteis herdados:

| Membro | Uso |
|---|---|
| `Free()` | libera a instância (idiomática) |
| `Destroy()` | destrutor virtual |
| `ClassName()` | nome da classe como `String` |
| `ClassNameIs(pName)` | testa se o objeto é dessa classe (exato) |
| `ClassType()` | retorna metaclasse `TClass` |
| `ClassParent()` | classe pai direto |
| `InheritsFrom(pClass)` | verdadeiro se herda de `pClass` (transitivo) |
| `Equals(other)` | comparação por identidade (padrão) |
| `ToString()` | representação textual (padrão = nome da classe) |
| `GetHashCode()` | hash do objeto |

Vide [`docs/system-library/System.Classes.md`](../system-library/System.Classes.md).

## Cross-references

- [06-delegates.md](./06-delegates.md) — Delegates (callbacks, eventos).
- [07-generics.md](./07-generics.md) — `Class T<T>` (em progresso).
- [12-convencoes-idiomaticas.md](./12-convencoes-idiomaticas.md) — TEnum pattern, TTList tipado, `console.Block`.
- [`docs/system-library/System.Classes.md`](../system-library/System.Classes.md) — `TObject`, `TPersistent`.
- [`docs/linguagem-basic/mod_card_grouper/`](./mod_card_grouper) — projeto real com vários exemplos.
