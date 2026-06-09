# 02 — Tipos

> Sistema de tipos do Data7 Basic. Primitivos, classes, `Variant`, `NULL`, conversões, declaração.

## Declaração de variáveis

```basic
Dim <nome> As <Tipo>                  ' declaração sem inicialização (default = NULL / 0 / "")
Dim <nome> As <Tipo> = <expr>         ' declaração com valor inicial
Dim <nome> = <expr>                   ' tipo inferido do RHS (`Variant` se não inferível)
Dim <nome> As New <Tipo>(<args>)      ' construção inline (atalho de `Dim x As T = New T(args)`)
```

`Dim` é a forma canônica em escopo local (corpo de método). Em **escopo de classe** o modificador de visibilidade vai no lugar:

```basic
Private _id As Integer
Public Nome As String
ReadOnly Adm As CardAdm
```

## Primitivos

A lista canônica vive em [`src/utils/primitive-types.ts`](../../src/utils/primitive-types.ts). Os primitivos relevantes em código de aplicação:

| Tipo | Domínio | Default | Notas |
|---|---|---|---|
| `Integer` | inteiro 32 bits com sinal | `0` | inteiro padrão; também `Long` (alias 32 bits) |
| `Long` | inteiro 64 bits no Data7 (Int64) | `0` | usado em IDs |
| `Double` | ponto flutuante 64 bits | `0.0` | inclui `Single` (32 bits), `Real` (alias `Double`), `Extended` |
| `Boolean` | `True` / `False` | `False` | comparações curto-circuito com `And`/`Or` |
| `String` | string de comprimento variável | `""` | UTF-16 internamente (`UnicodeString`) |
| `Char` | um caractere | `Chr(0)` | raramente usado direto |
| `Byte` | inteiro 8 bits sem sinal | `0` | |
| `Variant` | qualquer valor — discriminado em runtime | `NULL` (Empty) | escape hatch para tipagem dinâmica |
| `Pointer` | endereço bruto | `nil` | uso restrito (`GetMem`, `Move`) |

Outros tipos primitivos aceitos pelo linter (vindos da herança Delphi/VCL) — você pode encontrá-los em assinaturas da System Library mas raramente declara em código de aplicação: `Cardinal`, `Decimal`, `Short`, `ShortString`, `WideChar`, `LongInt`, `HMODULE`, `HRESULT`, `TGUID`, `THandle`, `TVarType`, `TClass`, `PVOID`, `IInterface`.

## Tipos de data e hora

| Tipo | Conteúdo | Conversão |
|---|---|---|
| `TDateTime` | Data + hora (alias de `Double`) | `.AddDays(n)`, `.AddMonths(n)`, `.ToString(format)`, `.Year`, `.Month`, `.Day`, `.Hour`, `.Minute`, `.Second` |
| `Date` | Só a porção de data | `.IsDate`, `.IsDateTime`, `.IsTime` |

Vide [`docs/system-library/System.md`](../system-library/System.md) para o catálogo completo de membros.

## `NULL` / `Nothing`

`NULL` é o literal canônico para "ausência de valor" em Data7 Basic. A gramática TextMate também reconhece `Nothing` (alias importado do VB.NET) como sinônimo, mas a **convenção do código real do ERP é `NULL`** — vide [`docs/linguagem-basic/mod_card_grouper/`](./mod_card_grouper). Use `NULL` em código novo; `Nothing` é tolerado para compatibilidade.

```basic
If pAdm = NULL Then Return ""
If me._pipe.Schema <> NULL Then ... End If
ativo = condicao ? True : False
```

Comparações usam `=` e `<>` — **não** existe `Is Nothing` nem `Is Null`.

`NULL` em uma `String` é distinto de `""`:

```basic
Dim s As String           ' s = "" por default
Dim v As Variant          ' v = NULL por default
Dim p As TForm            ' p = NULL (objetos não inicializados são NULL)
```

Acessar membro de um objeto `NULL` gera Access Violation em runtime. Use guarda explícita (`If obj <> NULL Then ...`) ou o sugar [`?.`](./10-acucares-atuais.md#fase-a--quick-wins-de-assignment) nos contextos suportados pelo transpilador.

## `Variant`

`Variant` carrega valor + tipo dinamicamente. Usado para:

- Parâmetros que aceitam múltiplos tipos (`Optional pValue As Variant = ""`).
- Retornos de leitura genérica (`pDataSet.Field("X").Value` retorna `Variant`).
- Workaround para falta de generics em coleções heterogêneas.
- Captura emulada em delegates: `extra As Variant` (vide [06-delegates.md](./06-delegates.md)).

```basic
Dim v As Variant
v = 42
v = "agora string"
v = pessoa
v = NULL
```

A função `VarType(v)` retorna um código `TVarType` identificando o tipo atual. Tipos enumerados (`varNull`, `varEmpty`, `varInteger`, `varString`, etc.) vivem em `System`.

## Conversões

### Cast funcional (`CType`)

A forma canônica de cast é a função `CType(expr, T)`:

```basic
Item = CType(MyBase.Take(pIndex), CardRecord)
Find = CType(MyBase.Find(handler, extra), CardRecord)
```

`CType` lança exceção em runtime quando o objeto **não** é compatível com `T` na hierarquia. Use `obj.InheritsFrom(T)` ou `obj.ClassNameIs("T")` para checar antes.

### Conversões de tipo primitivo

Vivem em `Globals/` e estão disponíveis sem `Imports`:

| Função | De → Para |
|---|---|
| `CInt(v)` | Variant/String → Integer |
| `CDbl(v)` | Variant/String → Double |
| `CStr(v)` | Variant → String |
| `TryStrToInt(s, ByRef result)` | String → Integer com indicador de sucesso |
| `Chr(n)` | Integer → Char |
| `Ord(c)` | Char → Integer |
| `Trunc(d)`, `Round(d)`, `Int(d)`, `Frac(d)` | Double → Integer / parte fracionária |

### Acessores tipados de campo de DataSet

Para acessar valores tipados em uma consulta SQL:

```basic
Dim nome As String = qry.Field("Nome").AsString
Dim valor As Double = qry.Field("Valor").AsFloat
Dim data As TDateTime = qry.Field("DataEmissao").AsDateTime
Dim ativo As Boolean = qry.Field("Ativo").AsBoolean
```

Vide [`docs/system-library/SQL.md`](../system-library/SQL.md).

## Aliases comuns

Esses nomes aparecem em assinaturas da System Library. São **aliases** — equivalem ao tipo da direita:

| Alias | Significa |
|---|---|
| `Long` | `Integer` de 64 bits (Int64) no Data7 |
| `LongWord`, `Cardinal` | inteiro 32 bits sem sinal |
| `Real` | `Double` |
| `Extended` | `Double` de precisão estendida (80 bits no Delphi clássico) |
| `Single` | `Double` de precisão simples (32 bits) |
| `UnicodeString` | `String` |
| `ShortString` | string Pascal-style com limite de 255 bytes |
| `WideChar` | `Char` UTF-16 |
| `TClass` | metaclasse (referência ao tipo, retornado por `obj.ClassType()`) |

## Tipos de coleção

A única coleção genérica nativa é `Collections.StringList` (lista de strings, opcionalmente com objetos pareados). Para outras necessidades:

- **`Variant` + arrays do Delphi**: aceitos pelo runtime mas raros em código novo.
- **Classes tipadas derivando de uma `TRecordList` base** (padrão idiomático — vide [12-convencoes-idiomaticas.md](./12-convencoes-idiomaticas.md)).
- **Futuro `TList<T>` via monomorfização**: vide [07-generics.md](./07-generics.md).

## Tipos do runtime core do ERP

Diferente dos namespaces da [System Library](./09-system-library.md), o ERP injeta no escopo **global** uma coleção de classes "infraestruturais" usadas por código de aplicação. A gramática TextMate ([`syntaxes/d7basic.tmLanguage.json`](../../syntaxes/d7basic.tmLanguage.json)) destaca esses tipos como reservados:

| Tipo | Domínio |
|---|---|
| `ObjectPrinter` | Construtor de logs estruturados (base do padrão `console.Block` — vide [12-convencoes-idiomaticas.md](./12-convencoes-idiomaticas.md)) |
| `Transport` / `TransportList` | Modelo de transporte de dados entre camadas (DTO + lista) |
| `BaseList` / `BaseItem` | Bases para coleções tipadas (`CardRecordList` herda de `TRecordList` que herda de `BaseList`) |
| `Certificado` / `CertificadoList` | Manipulação de certificados digitais (NF-e, assinatura) |
| `Logger` / `LogInfo` | Sistema de logging para o output do Executor |
| `SQL.Command` | Atalho qualificado para `Command` no namespace `SQL` |
| `TJSONObject` / `TJSONArray` | JSON globais (sem `Imports`) |
| `Exception` | Classe base de exceções (sem `Imports`) |

Esses tipos **não vivem em `docs/system-library/`** porque não são parte do "namespace canônico" (eles ficam disponíveis sem `Imports`). Em código novo prefira a forma canônica `Imports Collections / StringList` em vez do alias qualificado `Collections.StringList`.

## Cross-references

- [`docs/system-library/System.md`](../system-library/System.md) — namespace `System` com `TDateTime`, `IOUtils`, funções globais.
- [`docs/system-library/Collections.md`](../system-library/Collections.md) — `StringList`, `TStringList`, `TStrings`.
- [`docs/system-library/System.Classes.md`](../system-library/System.Classes.md) — `TObject`, `TPersistent`.
- [`src/utils/primitive-types.ts`](../../src/utils/primitive-types.ts) — conjunto canônico que o linter respeita.
