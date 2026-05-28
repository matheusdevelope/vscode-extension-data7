# 13 — Diagnostic Codes

> Códigos estáveis emitidos pelo linter da extensão. Fonte canônica: [`src/diagnostics/diagnostic-codes.ts`](../../src/diagnostics/diagnostic-codes.ts).
>
> Toda emissão carrega `code` + opcionalmente `data` (payload tipado) que permite Code Actions agirem sem parsing de mensagem.

## Visão geral

A extensão declara **33 códigos** em `DiagnosticCodes` ([`src/diagnostics/diagnostic-codes.ts`](../../src/diagnostics/diagnostic-codes.ts)). Cada código tem severidade (`error` ou `warning`), payload opcional e Code Action correspondente quando aplicável.

Os códigos se dividem em duas faixas:

1. **Emitidos pelo linter live** (13 originais + 6 de generics) — chamados pelo VS Code a cada keystroke; reportados como `Diagnostic` no editor.
2. **Emitidos pelo `SugarTranspiler` em build-time** ou **planejados para integração futura ao linter live** (14 das Fases A-J do roadmap). Cada um aparece nos exemplos em [`docs/exemple/diagnostics/<code>/`](../exemple/README.md), marcados com `@requires` quando dependem de wiring adicional ao linter.

```ts
export const DiagnosticCodes = {
   MissingImport: "missing-import",
   UnusedImport: "unused-import",
   ModuleNotFound: "module-not-found",
   ModuleNotDeclared: "module-not-declared",
   UnknownMember: "unknown-member",
   DuplicateImport: "duplicate-import",
   PrivateMemberAccess: "private-member-access",
   EventSignatureMismatch: "event-signature-mismatch",
   UnsupportedMember: "unsupported-member",
   NotEnumerable: "not-enumerable",
   UnknownSuppressionCode: "unknown-suppression-code",
   InvalidInterpolation: "invalid-interpolation",
   TernaryContextUnsupported: "ternary-context-unsupported",
   // Generics (Fase 1 do plano "Generics Hardening + AST Parser + Linter Integration")
   UnknownTemplate: "unknown-template",
   GenericArityMismatch: "generic-arity-mismatch",
   DuplicateTemplate: "duplicate-template",
   ClassGenericMethodUnsupported: "class-generic-method-unsupported",
   FlatNameCollision: "flat-name-collision",
   InstantiationLimitExceeded: "instantiation-limit-exceeded",
} as const;
```

## Códigos

### `missing-import`

Tipo de outro namespace usado sem `Imports` correspondente.

```basic
' Sem Imports Collections
Dim list As StringList   ' <-- missing-import
```

**Payload** (`MissingImportPayload`):

```ts
{ code: "missing-import", namespace: "Collections", typeName: "StringList" }
```

**Code Action**: "Importar `Collections`" — adiciona `Imports Collections` no header.

**Severidade**: `error`.

**Exemplos**: [`docs/exemple/diagnostics/missing-import/`](../exemple/diagnostics/missing-import).

---

### `unused-import`

`Imports` declarado mas nenhum símbolo do namespace é referenciado.

```basic
Imports XML           ' <-- unused-import
Namespace m
   ' nenhum uso de XML.*
End Namespace
```

**Payload** (`UnusedImportPayload`):

```ts
{ code: "unused-import", namespace: "XML" }
```

**Code Action**: "Remover `Imports XML`".

**Severidade**: `warning`.

**Exemplos**: [`docs/exemple/diagnostics/unused-import/`](../exemple/diagnostics/unused-import).

---

### `module-not-found`

`Imports mod_x` mas o módulo não existe nem no workspace, nem no repositório privado, nem na System Library.

```basic
Imports mod_unknown_module    ' <-- module-not-found
```

**Payload** (`ModuleNotFoundPayload`):

```ts
{ code: "module-not-found", moduleName: "mod_unknown_module" }
```

**Code Action**: "Instalar módulo" (se disponível em algum repositório remoto futuro).

**Severidade**: `error`.

**Exemplos**: [`docs/exemple/diagnostics/module-not-found/`](../exemple/diagnostics/module-not-found).

---

### `module-not-declared`

Módulo existe no repositório privado mas não foi adicionado a `data7.json#dependencies`.

```basic
Imports mod_shared_utility    ' <-- module-not-declared (existe mas falta no data7.json)
```

**Payload** (`ModuleNotDeclaredPayload`):

```ts
{ code: "module-not-declared", moduleName: "mod_shared_utility" }
```

**Code Action**: "Adicionar `mod_shared_utility` ao `data7.json`".

**Severidade**: `warning`.

**Exemplos**: [`docs/exemple/diagnostics/module-not-declared/`](../exemple/diagnostics/module-not-declared).

---

### `unknown-member`

Acesso a propriedade/método inexistente no tipo resolvido.

```basic
Dim form As Form
form.Aline = alTop    ' <-- unknown-member (typo: Aline → Align)
```

**Payload** (`UnknownMemberPayload`):

```ts
{ code: "unknown-member", member: "Aline", suggestions: ["Align", "Alignment"] }
```

**Code Action**: "Did you mean `Align`?" (até 3 sugestões via distância de Levenshtein).

**Severidade**: `error`.

**Exemplos**: [`docs/exemple/diagnostics/unknown-member/`](../exemple/diagnostics/unknown-member).

---

### `duplicate-import`

Mesmo `Imports` declarado mais de uma vez no header.

```basic
Imports Collections
Imports SQL
Imports Collections   ' <-- duplicate-import
```

**Payload**: nenhum (basta a posição).

**Code Action**: "Remover linha duplicada".

**Severidade**: `warning`.

**Exemplos**: [`docs/exemple/diagnostics/duplicate-import/`](../exemple/diagnostics/duplicate-import).

---

### `private-member-access`

Acesso a membro `Private` de uma classe a partir de outra classe.

```basic
Class Vault
   Private secret As String
End Class

Class Caller
   Sub Read(v As Vault)
      Print v.secret      ' <-- private-member-access
   End Sub
End Class
```

**Severidade**: `error`.

**Exemplos**: [`docs/exemple/diagnostics/private-member-access/`](../exemple/diagnostics/private-member-access).

---

### `event-signature-mismatch`

Handler atribuído a um evento `OnXxx` tem assinatura incompatível com o delegate esperado.

```basic
' OnClick espera TNotifyEvent: (Sender As TObject)
me.btn.OnClick = Handle_Click    ' <-- event-signature-mismatch (Handle_Click tem 0 params)

Private Sub Handle_Click()
   ' ...
End Sub
```

**Severidade**: `error`.

**Exemplos**: [`docs/exemple/diagnostics/event-signature-mismatch/`](../exemple/diagnostics/event-signature-mismatch).

---

### `unsupported-member`

Membro existe na cadeia de herança (vindo de VCL/Delphi) mas o compilador Data7 não o traduz.

```basic
Dim rep As Report
rep.Caption = "X"   ' <-- unsupported-member (Caption herdado de TForm não é traduzido)
                     ' use rep.Title = "X" ou rep.Titulo = "X"
```

**Payload** (`UnsupportedMemberPayload`):

```ts
{ code: "unsupported-member", member: "Caption", typeName: "Report" }
```

**Severidade**: `warning`.

**Exemplos**: [`docs/exemple/diagnostics/unsupported-member/`](../exemple/diagnostics/unsupported-member).

---

### `not-enumerable`

`For Each ... In <expr>` mas o tipo de `<expr>` não expõe `Count` + indexer inteiro (`Items`/`Item`/`Strings`/`Objects`).

```basic
Class NotIterable
   Public foo As String
End Class

Dim x As NotIterable
For Each item In x    ' <-- not-enumerable
   ' ...
Next
```

**Payload** (`NotEnumerablePayload`):

```ts
{ code: "not-enumerable", typeName: "NotIterable" }
```

**Severidade**: `warning`.

**Exemplos**: [`docs/exemple/diagnostics/not-enumerable/`](../exemple/diagnostics/not-enumerable).

---

### `unknown-suppression-code`

Diretiva `' data7:disable-line <code>` ou `' data7:disable-next-line <code>` referencia código inexistente em `DiagnosticCodes`.

```basic
' data7:disable-line missig-import   <-- typo (missig → missing)
Dim x As Collections.StringList
```

**Payload** (`UnknownSuppressionCodePayload`):

```ts
{ code: "unknown-suppression-code", suppressedCode: "missig-import" }
```

**Severidade**: `warning`.

**Exemplos**: [`docs/exemple/diagnostics/unknown-suppression-code/`](../exemple/diagnostics/unknown-suppression-code).

---

### `invalid-interpolation`

String interpolada `$"..."` malformada.

```basic
Dim s As String = $"oops {} aqui"    ' <-- invalid-interpolation (empty-expression)
Dim s2 As String = $"foo {bar         ' <-- invalid-interpolation (unterminated-brace)
Dim s3 As String = $"abc              ' <-- invalid-interpolation (unterminated-string)
```

**Payload** (`InvalidInterpolationPayload`):

```ts
{ code: "invalid-interpolation", reason: "empty-expression" }
   // ou "unterminated-brace" | "unterminated-string"
```

**Severidade**: `warning` (a linha é preservada verbatim — não bloqueia o build).

**Exemplos**: [`docs/exemple/diagnostics/invalid-interpolation/`](../exemple/diagnostics/invalid-interpolation).

---

### `ternary-context-unsupported`

Ternário `c ? a : b` usado fora de RHS de assignment.

```basic
Print c ? a : b              ' <-- ternary-context-unsupported (não-assignment)
Return c ? a : b             ' <-- mesmo
Foo(c ? a : b)               ' <-- mesmo (dentro de chamada)
```

**Payload** (`TernaryContextUnsupportedPayload`):

```ts
{ code: "ternary-context-unsupported", context: "non-assignment" }
```

**Severidade**: `warning` (a linha é preservada verbatim).

**Exemplos**: [`docs/exemple/diagnostics/ternary-context-unsupported/`](../exemple/diagnostics/ternary-context-unsupported).

---

## Diretivas de supressão

Suprime um diagnóstico específico via comentário inline:

```basic
' Suprime apenas a próxima linha:
' data7:disable-next-line unused-import
Imports XML

' Suprime apenas a linha atual:
Imports XML    ' data7:disable-line unused-import
```

Referenciar um código inexistente em uma diretiva dispara [`unknown-suppression-code`](#unknown-suppression-code).

## Códigos de generics (emitidos pelo linter live)

Os seis códigos abaixo são emitidos tanto pelo pipeline de monomorfização ([`src/project/generics-pass.ts`](../../src/project/generics-pass.ts) ou [`src/project/generics-driver.ts`](../../src/project/generics-driver.ts)) no Builder, quanto pelo linter live via `analyzeGenericsPass` (chamado em [`src/diagnostics/diagnostics.ts`](../../src/diagnostics/diagnostics.ts)). Detalhes do pipeline em [07-generics.md](./07-generics.md).

### `unknown-template`

Uso de uma sintaxe genérica (`Foo<Bar>`) onde `Foo` não corresponde a nenhum template declarado no projeto.

```basic
Dim list As TUnknown<Product>    ' <-- unknown-template
```

**Severidade**: `warning`.

**Exemplos**: [`docs/exemple/diagnostics/unknown-template/`](../exemple/diagnostics/unknown-template).

---

### `generic-arity-mismatch`

Quantidade de argumentos de tipo difere da declaração do template.

```basic
Class TPair<K, V>
End Class

Dim p As TPair<Integer>    ' <-- generic-arity-mismatch (espera 2, recebeu 1)
```

**Severidade**: `warning`.

**Exemplos**: [`docs/exemple/diagnostics/generic-arity-mismatch/`](../exemple/diagnostics/generic-arity-mismatch).

---

### `duplicate-template`

Mesmo nome de template declarado mais de uma vez no projeto (afeta resolução).

```basic
Class TList<T> ... End Class
Class TList<U> ... End Class    ' <-- duplicate-template
```

**Severidade**: `warning`.

**Exemplos**: [`docs/exemple/diagnostics/duplicate-template/`](../exemple/diagnostics/duplicate-template).

---

### `class-generic-method-unsupported`

Método genérico declarado *dentro* de uma classe — o pipeline textual não consegue reescrever com segurança e a engine AST ainda não cobre esse caso. A declaração é mantida verbatim e o programa não compila se for chamado.

```basic
Class TFoo
   Public Sub Process<T>(pValue As T)   ' <-- class-generic-method-unsupported
   End Sub
End Class
```

**Workaround**: extrair para função livre no namespace.

**Severidade**: `warning`.

**Exemplos**: [`docs/exemple/diagnostics/class-generic-method-unsupported/`](../exemple/diagnostics/class-generic-method-unsupported).

---

### `flat-name-collision`

Dois templates diferentes produziriam o mesmo flat name após monomorfização (raro; geralmente um `Sub Foo<T>` colidindo com um `Foo_T` declarado manualmente).

**Severidade**: `warning`.

**Exemplos**: [`docs/exemple/diagnostics/flat-name-collision/`](../exemple/diagnostics/flat-name-collision).

---

### `instantiation-limit-exceeded`

Mais de **10.000** instanciações monomórficas distintas — geralmente um loop de geração recursiva sem caso-base (`TList<TList<TList<...>>>` infinito). O Builder aborta a expansão para evitar explosão de memória.

**Severidade**: `warning`.

**Exemplos**: [`docs/exemple/diagnostics/instantiation-limit-exceeded/`](../exemple/diagnostics/instantiation-limit-exceeded).

---

## Códigos novos (Fases A-J, declarados em `DiagnosticCodes`)

Declarados em [`src/diagnostics/diagnostic-codes.ts`](../../src/diagnostics/diagnostic-codes.ts) e emitidos pelo `SugarTranspiler` em build-time. Cada um tem exemplo em [`docs/exemple/diagnostics/<code>/`](../exemple/README.md).

| Código | Quando | Onde emitido | Fase |
|---|---|---|---|
| [`null-coalesce-context-unsupported`](../exemple/diagnostics/null-coalesce-context-unsupported) | `??` fora de assignment RHS | SugarTranspiler | A1 |
| [`optional-chain-context-unsupported`](../exemple/diagnostics/optional-chain-context-unsupported) | `?.` fora de assignment/chamada | SugarTranspiler | A5 |
| [`optional-chain-too-deep`](../exemple/diagnostics/optional-chain-too-deep) | chain `?.` excede 3 níveis | SugarTranspiler | A5 |
| [`using-non-disposable`](../exemple/diagnostics/using-non-disposable) | `Using x As T` mas `T` não tem `Free`/`Dispose` | Planejado (linter) | B2 |
| [`auto-new-non-default-ctor`](../exemple/diagnostics/auto-new-non-default-ctor) | `Dim x As New T` mas `T` exige construtor com args | Planejado (linter) | B3 |
| [`default-indexer-missing`](../exemple/diagnostics/default-indexer-missing) | `list(i)` em tipo sem default indexer | Planejado (linter) | C5 |
| [`generic-constraint-violated`](../exemple/diagnostics/generic-constraint-violated) | `Class TList<T As BaseEnum>` com `T` incompatível | Planejado (linter) | C7 |
| [`destructure-unknown-member`](../exemple/diagnostics/destructure-unknown-member) | `Dim { Foo } = pessoa` mas `pessoa.Foo` não existe | Planejado (linter) | E1 |
| [`destructure-non-array`](../exemple/diagnostics/destructure-non-array) | `Dim [a, b] = x` mas `x` não é indexável | Planejado (linter) | E4 |
| [`destructure-context-unsupported`](../exemple/diagnostics/destructure-context-unsupported) | destructuring fora de `Dim`/parâmetro | Planejado (linter) | E1 |
| [`destructure-too-deep`](../exemple/diagnostics/destructure-too-deep) | aninhamento ≥ 3 níveis | Planejado (linter) | E1 |
| [`spread-non-persistent`](../exemple/diagnostics/spread-non-persistent) | `With { ...other }` mas o tipo não herda de `TPersistent` | Planejado (linter) | F3 |
| [`lambda-capture-unsupported`](../exemple/diagnostics/lambda-capture-unsupported) | corpo do lambda referencia variável do escopo enclosing | Planejado (linter) | H3 |
| [`readonly-assignment`](../exemple/diagnostics/readonly-assignment) | `ReadOnly p As T` recebe atribuição fora do construtor | Planejado (linter) | I3 |

## Cross-references

- [`src/diagnostics/diagnostic-codes.ts`](../../src/diagnostics/diagnostic-codes.ts) — código-fonte com tipos.
- [`src/diagnostics/diagnostics.ts`](../../src/diagnostics/diagnostics.ts) — implementação do linter.
- [`src/providers/code-actions.ts`](../../src/providers/code-actions.ts) — Code Actions correspondentes.
- [`docs/exemple/diagnostics/`](../exemple/README.md) — exemplos canônicos (um por código).
