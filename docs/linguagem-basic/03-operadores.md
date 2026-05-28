# 03 — Operadores

> Operadores aritméticos, lógicos, comparação, concatenação e açúcares atuais (ternário e interpolação).

## Atribuição

```basic
x = 42                     ' atribuição simples
me._id = pIndex             ' atribuição em campo
form.Caption = "Janela"     ' atribuição em propriedade
```

Não existem operadores de atribuição composta (`+=`, `-=`, `*=`, `&=`) nativamente — escreva `x = x + n` à mão.

## Aritméticos

| Operador | Significado | Aplicável a |
|---|---|---|
| `+` | adição (numéricos) ou concatenação de strings | numéricos, `String`, `Variant` |
| `-` | subtração / negação unária | numéricos |
| `*` | multiplicação | numéricos |
| `/` | divisão de ponto flutuante (sempre `Double`) | numéricos |
| `\` | divisão inteira (descarta a parte fracionária) | inteiros |
| `Mod` | resto da divisão | inteiros |
| `^` | exponenciação (potência) | numéricos |

**Atenção a `+` com `String`:** funciona para concatenação, mas se um lado for `Variant` o resultado pode coerce surpreendentemente. Para concatenação use preferencialmente `&`:

```basic
Dim s1 As String = "Olá " + nome      ' funciona, mas...
Dim s2 As String = "Total " + 42      ' erro de tipo em runtime
Dim s3 As String = "Total " & 42      ' OK — & coerce numérico para String
```

## Concatenação de strings

```basic
Dim msg As String = "Olá, " & nome & "! Idade: " & idade
```

`&` é o operador BASIC canônico de concatenação. Coerce automaticamente cada operando para `String`. Use sempre que possível ao invés de `+`.

## Comparação

| Operador | Significado |
|---|---|
| `=` | igualdade |
| `<>` | desigualdade |
| `<`, `>`, `<=`, `>=` | comparação ordinal |

**Não há `==` nem `!=`** — o operador de igualdade é o mesmo `=` da atribuição (o contexto sintático distingue).

```basic
If pAdm = CardAdm.Stone Then ... End If
If me._pipe.Schema <> NULL Then ... End If
If valor >= 1000 Then ... End If
```

Comparação de strings é **case-sensitive** por default. Para case-insensitive use `UCase(s1) = UCase(s2)` ou `LCase(s1) = LCase(s2)` (vivem em `Globals/`).

## Lógicos

| Operador | Significado | Curto-circuito? |
|---|---|---|
| `And` | E lógico | Não (avalia ambos os lados) |
| `Or` | OU lógico | Não |
| `Not` | NÃO lógico | — |
| `Xor` | OU exclusivo | Não |
| `AndAlso` | E com curto-circuito (raro em Data7; nem sempre disponível) | Sim |
| `OrElse` | OU com curto-circuito (idem) | Sim |

Curto-circuito **não** é garantido pelo `And`/`Or` clássicos do Basic. Para proteger acesso a membros use `If` aninhado:

```basic
' RUIM: pode dar AV se Schema for NULL
If me._pipe.Schema <> NULL And me._pipe.Schema.SupportedGroupers.Count > 0 Then ...

' BOM:
If me._pipe.Schema <> NULL Then
   If me._pipe.Schema.SupportedGroupers.Count > 0 Then
      ...
   End If
End If
```

## Operadores em nível de bit

| Operador | Significado |
|---|---|
| `And`, `Or`, `Xor`, `Not` | mesmas keywords servem para bit-a-bit quando os operandos são inteiros |
| `Shl`, `Shr` | shift left / right (raros em Data7) |

A sobrecarga semântica entre lógico e bit-a-bit é resolvida pelo tipo dos operandos.

## Precedência (resumida)

Da maior para a menor:

1. `^` (exponenciação)
2. `-` (negação unária), `Not`
3. `*`, `/`, `\`, `Mod`
4. `+`, `-`, `&`
5. `=`, `<>`, `<`, `>`, `<=`, `>=`
6. `And`, `Or`, `Xor`, `AndAlso`, `OrElse`
7. `?` `:` (ternário sugar — só em RHS de assignment)

Use parênteses sem medo — eles **não** afetam performance e ajudam o leitor:

```basic
If (a > b) And ((c = 0) Or (d <> NULL)) Then ... End If
```

## Açúcares atuais

### Ternário (`?` `:`) — açúcar transpilado

```basic
Dim status As String = saldo > 0 ? "positivo" : "negativo"
```

Expande para:

```basic
Dim status As String
If saldo > 0 Then
   status = "positivo"
Else
   status = "negativo"
End If
```

Contextos suportados:

- `Dim x [As T] = c ? a : b`
- `x = c ? a : b`
- `obj.prop = c ? a : b`

Contextos NÃO suportados (emitem [`ternary-context-unsupported`](./13-diagnostic-codes.md#ternary-context-unsupported)):

- `Print c ? a : b`
- `Return c ? a : b`
- `Foo(c ? a : b)` (dentro de chamada)

Exemplos canônicos: [`docs/exemple/sugar/ternary/`](../exemple/sugar/ternary).

### String interpolation (`$"..."`) — açúcar transpilado

```basic
Dim s As String = $"Olá, {nome}! Você tem {idade} anos."
```

Expande para:

```basic
Dim s As String = "Olá, " & (nome) & "! Você tem " & (idade) & " anos."
```

Chaves literais: `{{` e `}}` viram `{` e `}` na saída:

```basic
Dim json As String = $"{{ ""value"": {v} }}"  ' → "{ ""value"": " & (v) & " }"
```

Falhas comuns (emitem [`invalid-interpolation`](./13-diagnostic-codes.md#invalid-interpolation)):

- `$"abc` — string não terminada
- `$"foo {bar` — `{` sem `}`
- `$"foo {} bar"` — expressão vazia

Exemplos canônicos: [`docs/exemple/sugar/interpolation/`](../exemple/sugar/interpolation).

## Açúcares planejados

Vide [10-acucares-atuais.md § Planejados](./10-acucares-atuais.md#planejados) para a lista completa de operadores TS-inspired que serão adicionados (null-coalescing `??`, optional chaining `?.`, logical assignment `||=`/`&&=`/`??=`, pipe `|>`, etc.).

## Cross-references

- [`src/utils/ternary.ts`](../../src/utils/ternary.ts) — parser do ternário.
- [`src/utils/interpolation.ts`](../../src/utils/interpolation.ts) — parser da interpolação.
- [`docs/system-library/System.md`](../system-library/System.md) — funções matemáticas (`Abs`, `Sin`, `Sqrt`, …).
- [`docs/system-library/Globals/...`](../system-library/README.md) — `UCase`, `LCase`, `InStr`, `Left`, `Mid`, `CInt`, `CDbl`, `CStr`.
