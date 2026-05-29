# Exemplos canônicos Data7 Basic

Esta pasta agrupa exemplos pequenos, autocontidos e **versionados** de código `.bas` (e mini-projetos `.7Proj`). Cada arquivo serve a três audiências de uma só vez:

1. **Devs do ERP Data7** — referência rápida do uso correto de cada feature da linguagem.
2. **Extensão `vscode-extension-data7`** — fixtures carregados pelos testes (`loadExample(...)`) para garantir que o linter, o transpilador e os Code Actions cobrem exatamente os cenários documentados.
3. **Agentes de IA** — contexto de alta qualidade injetado em prompts (via `AGENTS.md` ou referências diretas) sobre como a linguagem deve ser escrita.

A política de criação destes arquivos é uma exceção explícita à regra "não criar docs proativamente" em `coding_standards.mdc` — eles são tratados como *insumos versionados*, não como documentação acessória.

> **Referência sistemática da linguagem**: para entender a sintaxe geral, tipos, classes, generics e limitações antes de explorar exemplos pontuais, comece por [`docs/linguagem-basic/README.md`](../linguagem-basic/README.md). Esta pasta complementa aquela com exemplos pontuais e fixtures de teste.

## Layout

```
docs/exemple/
├── README.md                          ← este arquivo
├── sugar/                             ← açúcares sintáticos transpilados pelo Builder
│   └── for-each/
│       ├── 01-stringlist-explicit-type.bas
│       ├── 02-stringlist-implicit-type.bas
│       ├── 03-nested-loops.bas
│       ├── 04-not-enumerable.bas
│       └── 05-method-call-operand.bas
├── diagnostics/                       ← 1 pasta por DiagnosticCode
│   ├── missing-import/
│   ├── unused-import/
│   ├── duplicate-import/
│   ├── unknown-member/
│   ├── module-not-found/
│   ├── module-not-declared/
│   ├── private-member-access/
│   ├── event-signature-mismatch/
│   ├── unsupported-member/
│   └── not-enumerable/
└── builder/                           ← mini-projetos para fluxos de build/decompile
    └── round-trip-minimal/
        ├── data7.json
        └── src/Principal.bas
```

## Contrato do header (obrigatório em todo `.bas` da pasta)

Todo arquivo `.bas` em `docs/exemple/` **deve** começar com um bloco de comentários no formato:

```basic
' @example: <caminho-relativo-sem-extensao>
' @demonstrates: <uma frase em português descrevendo o cenário>
' @diagnostics: <none | code@line[, code@line, ...]>
' @transpiled-to: <caminho-relativo-do-sibling> (opcional, só para açúcares)
' @requires: <descrição livre> (opcional, ex.: "workspace com data7.json + dependência X")
'
```

| Tag | Obrigatória | Significado |
|---|---|---|
| `@example` | sim | Identidade estável, igual ao caminho relativo sem `.bas`. É a chave usada em testes e em links. |
| `@demonstrates` | sim | Uma frase. Aparece no índice gerado e em hovers/agent prompts. |
| `@diagnostics` | sim | Lista esperada de diagnósticos no formato `código@linha` (1-based após o header), ou `none`. É a fonte de verdade para o teste `examples-coverage.test.ts`. |
| `@transpiled-to` | opcional | Caminho relativo a esta pasta de um sibling com a forma nativa expandida (usado em `sugar/*/`). |
| `@requires` | opcional | Pré-requisitos não capturáveis pelo header (ex.: módulo no repositório privado). Se presente, testes automáticos pulam o caso ou tratam-no de forma especializada. |

Após o header (linha em branco), vem o código Data7 Basic real.

### Exemplo mínimo

```basic
' @example: sugar/for-each/01-stringlist-explicit-type
' @demonstrates: expansão de For Each com tipo explícito sobre Collections.StringList
' @diagnostics: none
' @transpiled-to: sugar/for-each/_expected/01-stringlist-explicit-type.bas
'
Imports Collections

Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim list As StringList
         For Each item As String In list
            ' corpo
         Next
      End Sub
   End Class
End Namespace
```

## Convenções de nomenclatura

- **Pastas:** `kebab-case` sempre (`for-each`, `not-enumerable`, `round-trip-minimal`).
- **Arquivos sob `sugar/<sugar>/`:** prefixo numérico `01-`, `02-`, … + slug descritivo. Ordena visualmente o tour do usuário.
- **Arquivos sob `diagnostics/<código>/`:** nomes funcionais — `trigger.bas` (o caso que dispara o warning/erro), `after-quickfix.bas` (o resultado de aplicar o Code Action), `negative.bas` (variação que NÃO deve disparar — opcional).
- **Mini-projetos sob `builder/<cenário>/`:** seguem a estrutura real `data7.json` + `src/Principal.bas` + (opcionalmente) `src/<modulo>.bas`. O nome da pasta descreve o cenário (`round-trip-minimal`, `multi-module-dependency`, …).

## Como os testes consomem

```ts
import { loadExample, parseExampleHeader } from "../_helpers/fixtures";

const code = loadExample("sugar/for-each/01-stringlist-explicit-type.bas");
const header = parseExampleHeader(code);

assert.equal(header.example, "sugar/for-each/01-stringlist-explicit-type");
assert.deepEqual(header.diagnostics, []); // @diagnostics: none

// Use `code` directly with the linter / transpiler / builder.
indexer.updateFileContent("file:///demo.bas", code);
const diags = DiagnosticsLinter.runAdvancedDiagnostics(
  createMockDoc("file:///demo.bas", code),
  indexer,
);
expectNoDiagnostic(diags, DiagnosticCodes.NotEnumerable);
```

O header é puramente comentário Data7 (`' ...`) — o linter ignora naturalmente, então o mesmo arquivo serve sem qualquer pré-processamento.

## Quando adicionar um novo exemplo

Atualize esta pasta sempre que:

- Adicionar um novo `DiagnosticCode` em `src/diagnostics/diagnostic-codes.ts` (regra em `data7_domain.mdc`).
- Adicionar um novo açúcar transpilado em `src/project/transpiler.ts` (regra em `testing.mdc`).
- Adicionar um novo Code Action em `src/providers/code-actions.ts` (regra em `testing.mdc`).

Cada caso novo deve trazer pelo menos o arquivo de "trigger" (cenário que ativa a feature) e estar amarrado ao teste correspondente via `loadExample(...)`.

<!-- BEGIN: auto-generated index — do not edit below by hand -->

## Índice de exemplos (116 arquivos)
## Índice de exemplos (108 arquivos)

> Gerado automaticamente por `scripts/generate-examples-index.js`. Edite os cabeçalhos dos `.bas` em vez deste bloco.

### sugar (71)

| Caminho | Demonstra | Diagnósticos | Requer |
|---|---|---|---|
| [`sugar/auto-new/01-simple.bas`](./sugar/auto-new/01-simple.bas) | Dim x As New T (sem `()`) expandido para `= New T()` | `none` | — |
| [`sugar/cast-function/01-ctype-canonical.bas`](./sugar/cast-function/01-ctype-canonical.bas) | forma canônica de cast no Data7 — CType(expr, T) | `none` | — |
| [`sugar/coalesce-assign/_expected/01-simple.bas`](./sugar/coalesce-assign/_expected/01-simple.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/coalesce-assign/01-simple.bas`](./sugar/coalesce-assign/01-simple.bas) | ??= compound assignment — vira If x = NULL Then x = y | `none` | — |
| [`sugar/decorators/01-singleton.bas`](./sugar/decorators/01-singleton.bas) | decorator @Singleton — ainda exploratório, exemplo do alvo | `none` | — |
| [`sugar/default-indexer/01-basic.bas`](./sugar/default-indexer/01-basic.bas) | convenção `Property Item(...)` para indexação tipada | `none` | — |
| [`sugar/destructure-array/01-basic.bas`](./sugar/destructure-array/01-basic.bas) | Dim [first, second] = lista expandido para Dims com Item(i) | `none` | — |
| [`sugar/destructure-array/02-rest.bas`](./sugar/destructure-array/02-rest.bas) | Dim [first, ...rest] = lista expandido com loop For | `none` | — |
| [`sugar/destructure-object/01-basic.bas`](./sugar/destructure-object/01-basic.bas) | Dim { Nome, Idade } = pessoa expandido em Dims individuais | `none` | — |
| [`sugar/destructure-object/02-rename-default.bas`](./sugar/destructure-object/02-rename-default.bas) | destructuring com rename (As n) e default (= "x") | `none` | — |
| [`sugar/destructure-param/01-basic.bas`](./sugar/destructure-param/01-basic.bas) | convenção atual: declarar Dims no início do corpo manualmente | `none` | — |
| [`sugar/enum-declarative/01-basic.bas`](./sugar/enum-declarative/01-basic.bas) | Enum X / End Enum expandido para Class X Inherits BaseEnum | `none` | — |
| [`sugar/for-each-kv/01-basic.bas`](./sugar/for-each-kv/01-basic.bas) | convenção atual para iterar pares Nome=Valor de uma StringList | `none` | — |
| [`sugar/for-each-range/_expected/01-simple.bas`](./sugar/for-each-range/_expected/01-simple.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/for-each-range/_expected/02-variable-end.bas`](./sugar/for-each-range/_expected/02-variable-end.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/for-each-range/01-simple.bas`](./sugar/for-each-range/01-simple.bas) | For Each i In 0..10 — açúcar para o For clássico com limites numéricos | `none` | — |
| [`sugar/for-each-range/02-variable-end.bas`](./sugar/for-each-range/02-variable-end.bas) | range com expressão variável no limite final (`count - 1`) | `none` | — |
| [`sugar/for-each/_expected/01-stringlist-explicit-type.bas`](./sugar/for-each/_expected/01-stringlist-explicit-type.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/for-each/_expected/02-stringlist-implicit-type.bas`](./sugar/for-each/_expected/02-stringlist-implicit-type.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/for-each/_expected/03-nested-loops.bas`](./sugar/for-each/_expected/03-nested-loops.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/for-each/01-stringlist-explicit-type.bas`](./sugar/for-each/01-stringlist-explicit-type.bas) | For Each com tipo explícito sobre Collections.StringList | `none` | — |
| [`sugar/for-each/02-stringlist-implicit-type.bas`](./sugar/for-each/02-stringlist-implicit-type.bas) | For Each sem "As Tipo" — o transpilador infere String pelo indexer Strings(i) do StringList | `none` | — |
| [`sugar/for-each/03-nested-loops.bas`](./sugar/for-each/03-nested-loops.bas) | For Each aninhado — contadores __idx0 e __idx1 não colidem | `none` | — |
| [`sugar/for-each/04-not-enumerable.bas`](./sugar/for-each/04-not-enumerable.bas) | For Each sobre tipo sem propriedade Count + indexer — emite not-enumerable e Builder mantém a linha intacta | `not-enumerable@12` | — |
| [`sugar/for-each/05-method-call-operand.bas`](./sugar/for-each/05-method-call-operand.bas) | For Each sobre expressão complexa (chamada de método) — exige materialização em variável local antes | `not-enumerable@10` | — |
| [`sugar/function-ref/01-basic.bas`](./sugar/function-ref/01-basic.bas) | function reference convencional (sem `@`) — handler nomeado | `none` | — |
| [`sugar/generic-tlist/_expected/01-basic.bas`](./sugar/generic-tlist/_expected/01-basic.bas) | Class TList<T> monomorfizada para TList_Product | `none` | — |
| [`sugar/generic-tlist/_expected/02-delegate.bas`](./sugar/generic-tlist/_expected/02-delegate.bas) | Delegate Function genérico monomorfizado para tipo concreto | `none` | — |
| [`sugar/generic-tlist/_expected/03-method.bas`](./sugar/generic-tlist/_expected/03-method.bas) | Sub/Function generico livre (nivel namespace) monomorfizado para forma concreta | `none` | — |
| [`sugar/generic-tlist/_expected/03-nested.bas`](./sugar/generic-tlist/_expected/03-nested.bas) | generics aninhados — TList<TList<Integer>> vira TList_TList_Integer | `none` | — |
| [`sugar/generic-tlist/_expected/04-shadowing.bas`](./sugar/generic-tlist/_expected/04-shadowing.bas) | Bug 1 — variavel local nomeada `T` dentro do template NAO e | `none` | — |
| [`sugar/generic-tlist/01-basic.bas`](./sugar/generic-tlist/01-basic.bas) | Class TList<T> monomorfizada para TList_Product | `none` | — |
| [`sugar/generic-tlist/02-delegate.bas`](./sugar/generic-tlist/02-delegate.bas) | Delegate Function genérico monomorfizado para tipo concreto | `none` | — |
| [`sugar/generic-tlist/03-method.bas`](./sugar/generic-tlist/03-method.bas) | Sub/Function generico livre (nivel namespace) monomorfizado para forma concreta | `none` | — |
| [`sugar/generic-tlist/03-nested.bas`](./sugar/generic-tlist/03-nested.bas) | generics aninhados — TList<TList<Integer>> vira TList_TList_Integer | `none` | — |
| [`sugar/generic-tlist/04-shadowing.bas`](./sugar/generic-tlist/04-shadowing.bas) | Bug 1 — variavel local nomeada `T` dentro do template NAO e | `none` | — |
| [`sugar/interpolation/_expected/01-simple.bas`](./sugar/interpolation/_expected/01-simple.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/interpolation/_expected/02-multiple-expressions.bas`](./sugar/interpolation/_expected/02-multiple-expressions.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/interpolation/_expected/03-escaped-braces.bas`](./sugar/interpolation/_expected/03-escaped-braces.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/interpolation/01-simple.bas`](./sugar/interpolation/01-simple.bas) | $"..." com uma expressão única — vira `"prefix " & (expr)` | `none` | — |
| [`sugar/interpolation/02-multiple-expressions.bas`](./sugar/interpolation/02-multiple-expressions.bas) | $"..." com várias expressões — cada `{x}` vira `& (x) &` | `none` | — |
| [`sugar/interpolation/03-escaped-braces.bas`](./sugar/interpolation/03-escaped-braces.bas) | chaves literais via `{{` e `}}` — preservadas como `{` e `}` no output | `none` | — |
| [`sugar/interpolation/04-invalid-empty-expression.bas`](./sugar/interpolation/04-invalid-empty-expression.bas) | $"...{}..." sem expressão dentro das chaves — emite invalid-interpolation | `invalid-interpolation@9` | — |
| [`sugar/lambda/01-no-capture.bas`](./sugar/lambda/01-no-capture.bas) | alternativa nativa enquanto lambdas inline não são transpilados | `none` | — |
| [`sugar/logical-and-assign/_expected/01-simple.bas`](./sugar/logical-and-assign/_expected/01-simple.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/logical-and-assign/01-simple.bas`](./sugar/logical-and-assign/01-simple.bas) | &&= compound assignment — vira If x Then x = y | `none` | — |
| [`sugar/logical-or-assign/_expected/01-simple.bas`](./sugar/logical-or-assign/_expected/01-simple.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/logical-or-assign/01-simple.bas`](./sugar/logical-or-assign/01-simple.bas) | \|\|= compound assignment — vira If Not x Then x = y | `none` | — |
| [`sugar/match/01-basic.bas`](./sugar/match/01-basic.bas) | Match x / Case Is TFoo : ... / End Match expandido para If/ElseIf/End If | `none` | — |
| [`sugar/null-coalesce/_expected/01-dim-assignment.bas`](./sugar/null-coalesce/_expected/01-dim-assignment.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/null-coalesce/01-dim-assignment.bas`](./sugar/null-coalesce/01-dim-assignment.bas) | ?? em Dim — expandido para If/Then/Else multi-linha | `none` | — |
| [`sugar/numeric-separator/_expected/01-simple.bas`](./sugar/numeric-separator/_expected/01-simple.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/numeric-separator/01-simple.bas`](./sugar/numeric-separator/01-simple.bas) | numeric separator `_` em literais — removido na expansão | `none` | — |
| [`sugar/object-init/01-basic.bas`](./sugar/object-init/01-basic.bas) | New T() With { .X = v, .Y = w } expandido para With block | `none` | — |
| [`sugar/optional-chain/_expected/01-property-access.bas`](./sugar/optional-chain/_expected/01-property-access.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/optional-chain/_expected/02-method-call.bas`](./sugar/optional-chain/_expected/02-method-call.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/optional-chain/01-property-access.bas`](./sugar/optional-chain/01-property-access.bas) | ?. em property access — vira If obj <> NULL Then ... | `none` | — |
| [`sugar/optional-chain/02-method-call.bas`](./sugar/optional-chain/02-method-call.bas) | ?. em chamada de método — vira If obj <> NULL Then obj.Method() | `none` | — |
| [`sugar/pipe/01-basic.bas`](./sugar/pipe/01-basic.bas) | \|> operator — data \|> Trim \|> UCase vira UCase(Trim(data)) | `none` | — |
| [`sugar/return-if/01-basic.bas`](./sugar/return-if/01-basic.bas) | Return If cond Then a Else b expandido para If/Then/Return | `none` | — |
| [`sugar/spread-collection/01-basic.bas`](./sugar/spread-collection/01-basic.bas) | convenção atual de inicialização de StringList por Add manual | `none` | — |
| [`sugar/spread-object/01-basic.bas`](./sugar/spread-object/01-basic.bas) | convenção atual usando .Assign() para spread em object init | `none` | — |
| [`sugar/tagged-template/01-sql.bas`](./sugar/tagged-template/01-sql.bas) | tagged template sql$"..." — vira sql.Build("...", expr, ...) | `none` | — |
| [`sugar/ternary/_expected/01-dim-assignment.bas`](./sugar/ternary/_expected/01-dim-assignment.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/ternary/_expected/02-reassignment.bas`](./sugar/ternary/_expected/02-reassignment.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/ternary/_expected/03-member-assignment.bas`](./sugar/ternary/_expected/03-member-assignment.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/ternary/01-dim-assignment.bas`](./sugar/ternary/01-dim-assignment.bas) | ternário no RHS de Dim — expandido para If/Then/Else multi-linha | `none` | — |
| [`sugar/ternary/02-reassignment.bas`](./sugar/ternary/02-reassignment.bas) | ternário em reassignment (sem Dim) — só emite o If/Then/Else | `none` | — |
| [`sugar/ternary/03-member-assignment.bas`](./sugar/ternary/03-member-assignment.bas) | ternário atribuindo a `obj.prop` — funciona como reassignment | `none` | — |
| [`sugar/type-alias/01-basic.bas`](./sugar/type-alias/01-basic.bas) | Type ProductId = String — alias só design-time | `none` | — |
| [`sugar/using/01-simple.bas`](./sugar/using/01-simple.bas) | Using ... End Using expandido para Try/Finally/x.Free() | `none` | — |

### diagnostics (36)

| Caminho | Demonstra | Diagnósticos | Requer |
|---|---|---|---|
| [`diagnostics/auto-new-non-default-ctor/trigger.bas`](./diagnostics/auto-new-non-default-ctor/trigger.bas) | Dim x As New T mas T só tem construtor com args — runtime falha | `auto-new-non-default-ctor@5` | `classe TNeedsArgs sem construtor sem-args` |
| [`diagnostics/class-generic-method-unsupported/trigger.bas`](./diagnostics/class-generic-method-unsupported/trigger.bas) | a generic method declared inside a non-generic class | `class-generic-method-unsupported@9` | `only emitted by the AST monomorphization engine (Fase 6); the live linter does not yet detect generic methods inside classes.` |
| [`diagnostics/default-indexer-missing/trigger.bas`](./diagnostics/default-indexer-missing/trigger.bas) | list(i) usado mas o tipo não declara Item(Integer) | `default-indexer-missing@5` | `classe TBag sem Property Item(Integer) no workspace` |
| [`diagnostics/destructure-context-unsupported/trigger.bas`](./diagnostics/destructure-context-unsupported/trigger.bas) | destructure fora de Dim/parâmetro — não suportado | `destructure-context-unsupported@6` | `emissão futura do linter quando destructure for detectado em contexto não-Dim` |
| [`diagnostics/destructure-non-array/trigger.bas`](./diagnostics/destructure-non-array/trigger.bas) | destructure array [a, b] aplicado a tipo não indexável | `destructure-non-array@6` | `classe TPessoa sem Item(Integer) no workspace` |
| [`diagnostics/destructure-too-deep/trigger.bas`](./diagnostics/destructure-too-deep/trigger.bas) | destructure aninhado profundamente — não suportado pelo parser line-based | `destructure-too-deep@6` | `emissão futura do linter quando o parser de destructure detectar aninhamento profundo` |
| [`diagnostics/destructure-unknown-member/trigger.bas`](./diagnostics/destructure-unknown-member/trigger.bas) | destructure faz referência a membro inexistente | `destructure-unknown-member@6` | `classe TPessoa que NÃO tem campo Endereco no workspace` |
| [`diagnostics/duplicate-declaration/trigger.bas`](./diagnostics/duplicate-declaration/trigger.bas) | declaração de duas variáveis locais com o mesmo nome no mesmo método | `duplicate-declaration@7` | — |
| [`diagnostics/duplicate-import/trigger.bas`](./diagnostics/duplicate-import/trigger.bas) | o mesmo Imports declarado duas vezes no cabeçalho do arquivo | `duplicate-import@7` | — |
| [`diagnostics/duplicate-template/trigger.bas`](./diagnostics/duplicate-template/trigger.bas) | two top-level generic declarations share the same name | `duplicate-template@11` | — |
| [`diagnostics/event-signature-mismatch/trigger.bas`](./diagnostics/event-signature-mismatch/trigger.bas) | handler atribuído a OnClick (TNotifyEvent espera 1 parâmetro Sender) mas o handler tem 0 | `event-signature-mismatch@11` | — |
| [`diagnostics/flat-name-collision/trigger.bas`](./diagnostics/flat-name-collision/trigger.bas) | source type carries `_` so two distinct usages collapse to the same flat name | `flat-name-collision@14` | `emitted by the SugarTranspiler at build-time (Fase 6); the live linter does not yet track flat-name collisions.` |
| [`diagnostics/generic-arity-mismatch/trigger.bas`](./diagnostics/generic-arity-mismatch/trigger.bas) | TList<T> declares 1 type parameter but usage supplies 2 args | `generic-arity-mismatch@13` | — |
| [`diagnostics/generic-constraint-violated/trigger.bas`](./diagnostics/generic-constraint-violated/trigger.bas) | constraint Class TList<T As BaseEnum> violada por Integer | `generic-constraint-violated@10` | `classes BaseEnum + CardAdm declaradas no workspace` |
| [`diagnostics/instantiation-limit-exceeded/trigger.bas`](./diagnostics/instantiation-limit-exceeded/trigger.bas) | a generic template that recursively instantiates itself exceeds MAX_INSTANTIATIONS | `instantiation-limit-exceeded@11` | `emitted by the SugarTranspiler at build-time (Fase 6) when the worklist exceeds 10_000 instantiations; the live linter does not run the drain.` |
| [`diagnostics/invalid-interpolation/trigger.bas`](./diagnostics/invalid-interpolation/trigger.bas) | string interpolada com `{}` vazio — parser não consegue produzir expansão | `invalid-interpolation@8` | — |
| [`diagnostics/lambda-capture-unsupported/trigger.bas`](./diagnostics/lambda-capture-unsupported/trigger.bas) | lambda referencia variável local — captura não suportada em Data7 | `lambda-capture-unsupported@7` | `emissão futura do linter quando lambdas inline forem implementados (H3)` |
| [`diagnostics/missing-import/after-quickfix.bas`](./diagnostics/missing-import/after-quickfix.bas) | resultado de aplicar o Quick Fix "Importar mod_resources" sobre diagnostics/missing-import/trigger | `none` | — |
| [`diagnostics/missing-import/trigger.bas`](./diagnostics/missing-import/trigger.bas) | tipo de outro módulo do workspace usado sem o Imports correspondente | `missing-import@9` | `módulo "mod_resources" exportando "TResourceLoader" no workspace` |
| [`diagnostics/module-not-declared/trigger.bas`](./diagnostics/module-not-declared/trigger.bas) | módulo existe no repositório privado mas não foi adicionado a data7.json#dependencies | `module-not-declared@6` | `módulo "mod_shared_utility" no repositório privado E ausência da entrada em data7.json` |
| [`diagnostics/module-not-found/trigger.bas`](./diagnostics/module-not-found/trigger.bas) | Imports de um módulo que não existe no workspace, repositório privado, nem System Library | `module-not-found@6` | `nenhum módulo "mod_unknown_module" instalado em lugar nenhum` |
| [`diagnostics/not-enumerable/trigger.bas`](./diagnostics/not-enumerable/trigger.bas) | For Each sobre tipo do workspace sem propriedade Count + indexer inteiro | `not-enumerable@12` | — |
| [`diagnostics/null-coalesce-context-unsupported/trigger.bas`](./diagnostics/null-coalesce-context-unsupported/trigger.bas) | ?? usado fora de assignment RHS — Print não é assignment | `null-coalesce-context-unsupported@6` | `o diagnóstico é emitido pelo SugarTranspiler em build-time (ainda não wired ao linter live)` |
| [`diagnostics/null-narrowing/01-after-guard.bas`](./diagnostics/null-narrowing/01-after-guard.bas) | TypeResolver propaga NotNull(x) após If x = NULL Then Return | `none` | — |
| [`diagnostics/optional-chain-context-unsupported/trigger.bas`](./diagnostics/optional-chain-context-unsupported/trigger.bas) | ?. usado fora de assignment ou call-statement | `optional-chain-context-unsupported@6` | `o diagnóstico é emitido pelo SugarTranspiler em build-time (ainda não wired ao linter live)` |
| [`diagnostics/optional-chain-too-deep/trigger.bas`](./diagnostics/optional-chain-too-deep/trigger.bas) | cadeia ?. com mais de 3 níveis — refator manual exigido | `optional-chain-too-deep@6` | `o diagnóstico é emitido pelo SugarTranspiler em build-time (ainda não wired ao linter live)` |
| [`diagnostics/private-member-access/trigger.bas`](./diagnostics/private-member-access/trigger.bas) | acesso a membro Private de uma classe a partir de outra classe | `private-member-access@13` | `módulo "mod_vault" exportando a classe Vault com campo Private "secret"` |
| [`diagnostics/readonly-assignment/trigger.bas`](./diagnostics/readonly-assignment/trigger.bas) | atribuição a campo ReadOnly fora do construtor | `readonly-assignment@11` | `emissão futura do linter quando a checagem ReadOnly for implementada (I3)` |
| [`diagnostics/spread-non-persistent/trigger.bas`](./diagnostics/spread-non-persistent/trigger.bas) | spread em New T() With { ...other, ... } mas T não tem Assign | `spread-non-persistent@5` | `classe TPoint sem TPersistent na cadeia` |
| [`diagnostics/ternary-context-unsupported/trigger.bas`](./diagnostics/ternary-context-unsupported/trigger.bas) | ternário em contexto não-assignment (Print) — não é expansível | `ternary-context-unsupported@8` | — |
| [`diagnostics/unknown-member/trigger.bas`](./diagnostics/unknown-member/trigger.bas) | acesso a propriedade inexistente (typo) — emite unknown-member com "did you mean Align?" | `unknown-member@11` | — |
| [`diagnostics/unknown-suppression-code/trigger.bas`](./diagnostics/unknown-suppression-code/trigger.bas) | diretiva data7:disable-line referenciando código inexistente em DiagnosticCodes | `unknown-suppression-code@7` | — |
| [`diagnostics/unknown-template/trigger.bas`](./diagnostics/unknown-template/trigger.bas) | usage of TList<T> without the template declared in scope | `unknown-template@9` | — |
| [`diagnostics/unsupported-member/trigger.bas`](./diagnostics/unsupported-member/trigger.bas) | acesso a propriedade marcada isUnsupported=true na System Library (não traduzida pelo compilador Data7) | `unsupported-member@11` | — |
| [`diagnostics/unused-import/trigger.bas`](./diagnostics/unused-import/trigger.bas) | diretiva Imports declarada mas nenhum símbolo do namespace é referenciado | `unused-import@5` | — |
| [`diagnostics/using-non-disposable/trigger.bas`](./diagnostics/using-non-disposable/trigger.bas) | Using sobre tipo sem Free na cadeia — Builder gera .Free() mesmo assim | `using-non-disposable@5` | `classe TNotDisposable sem Free no workspace` |

### builder (3)

| Caminho | Demonstra | Diagnósticos | Requer |
|---|---|---|---|
| [`builder/round-trip-minimal/src/Principal.bas`](./builder/round-trip-minimal/src/Principal.bas) | projeto Data7 mínimo válido para exercitar Builder → Decompiler → Builder | `none` | — |
| [`builder/tela-cadastro/src/mod_form_cliente.bas`](./builder/tela-cadastro/src/mod_form_cliente.bas) | módulo de tela de cadastro (Form + TextBox + botão com evento) consumido pelo Principal | `none` | `projeto tela-cadastro (indexado junto com Principal.bas)` |
| [`builder/tela-cadastro/src/Principal.bas`](./builder/tela-cadastro/src/Principal.bas) | entrada do projeto — importa o módulo de tela, instancia, exibe e libera o formulário | `none` | `projeto tela-cadastro (indexado junto com mod_form_cliente.bas)` |

### forms (7)

| Caminho | Demonstra | Diagnósticos | Requer |
|---|---|---|---|
| [`forms/01-formulario-minimo.bas`](./forms/01-formulario-minimo.bas) | tela mínima — classe que possui um Forms.Form privado, monta no _build e expõe Show/Free | `none` | — |
| [`forms/02-layout-header-content-footer.bas`](./forms/02-layout-header-content-footer.bas) | layout de 3 regiões (header alTop / content alClient / footer alBottom) com Line divisória | `none` | — |
| [`forms/03-form-com-eventos.bas`](./forms/03-form-com-eventos.bas) | botão com OnClick ligado a um handler + evento próprio OnSalvarEvent disparado com guarda <> NULL | `none` | — |
| [`forms/04-grid-basico.bas`](./forms/04-grid-basico.bas) | colocação de um Forms.Grid preenchendo o conteúdo da tela (alClient) | `none` | — |
| [`forms/05-grid-com-dados.bas`](./forms/05-grid-com-dados.bas) | Grid com cabeçalho fixo + preenchimento de células via Cells(col, row), ColCount/RowCount/FixedRows | `none` | — |
| [`forms/06-textbox-validacao.bas`](./forms/06-textbox-validacao.bas) | TextBox + NumberTextBox com OnChange ligado a um handler que lê .Text e valida | `none` | — |
| [`forms/07-abas-pagecontrol.bas`](./forms/07-abas-pagecontrol.bas) | PageControl com abas (TabSheet) — cada aba é criada com o PageControl como pai e recebe Caption | `none` | — |
