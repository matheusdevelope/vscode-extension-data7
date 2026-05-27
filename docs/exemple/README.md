# Exemplos canônicos Data7 Basic

Esta pasta agrupa exemplos pequenos, autocontidos e **versionados** de código `.bas` (e mini-projetos `.7Proj`). Cada arquivo serve a três audiências de uma só vez:

1. **Devs do ERP Data7** — referência rápida do uso correto de cada feature da linguagem.
2. **Extensão `vscode-extension-data7`** — fixtures carregados pelos testes (`loadExample(...)`) para garantir que o linter, o transpilador e os Code Actions cobrem exatamente os cenários documentados.
3. **Agentes de IA** — contexto de alta qualidade injetado em prompts (via `AGENTS.md` ou referências diretas) sobre como a linguagem deve ser escrita.

A política de criação destes arquivos é uma exceção explícita à regra "não criar docs proativamente" em `coding_standards.mdc` — eles são tratados como *insumos versionados*, não como documentação acessória.

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

## Índice de exemplos (40 arquivos)

> Gerado automaticamente por `scripts/generate-examples-index.js`. Edite os cabeçalhos dos `.bas` em vez deste bloco.

### sugar (25)

| Caminho | Demonstra | Diagnósticos | Requer |
|---|---|---|---|
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
| [`sugar/interpolation/_expected/01-simple.bas`](./sugar/interpolation/_expected/01-simple.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/interpolation/_expected/02-multiple-expressions.bas`](./sugar/interpolation/_expected/02-multiple-expressions.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/interpolation/_expected/03-escaped-braces.bas`](./sugar/interpolation/_expected/03-escaped-braces.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/interpolation/01-simple.bas`](./sugar/interpolation/01-simple.bas) | $"..." com uma expressão única — vira `"prefix " & (expr)` | `none` | — |
| [`sugar/interpolation/02-multiple-expressions.bas`](./sugar/interpolation/02-multiple-expressions.bas) | $"..." com várias expressões — cada `{x}` vira `& (x) &` | `none` | — |
| [`sugar/interpolation/03-escaped-braces.bas`](./sugar/interpolation/03-escaped-braces.bas) | chaves literais via `{{` e `}}` — preservadas como `{` e `}` no output | `none` | — |
| [`sugar/interpolation/04-invalid-empty-expression.bas`](./sugar/interpolation/04-invalid-empty-expression.bas) | $"...{}..." sem expressão dentro das chaves — emite invalid-interpolation | `invalid-interpolation@9` | — |
| [`sugar/ternary/_expected/01-dim-assignment.bas`](./sugar/ternary/_expected/01-dim-assignment.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/ternary/_expected/02-reassignment.bas`](./sugar/ternary/_expected/02-reassignment.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/ternary/_expected/03-member-assignment.bas`](./sugar/ternary/_expected/03-member-assignment.bas) | (sem @demonstrates) | `(sem @diagnostics)` | — |
| [`sugar/ternary/01-dim-assignment.bas`](./sugar/ternary/01-dim-assignment.bas) | ternário no RHS de Dim — expandido para If/Then/Else multi-linha | `none` | — |
| [`sugar/ternary/02-reassignment.bas`](./sugar/ternary/02-reassignment.bas) | ternário em reassignment (sem Dim) — só emite o If/Then/Else | `none` | — |
| [`sugar/ternary/03-member-assignment.bas`](./sugar/ternary/03-member-assignment.bas) | ternário atribuindo a `obj.prop` — funciona como reassignment | `none` | — |

### diagnostics (14)

| Caminho | Demonstra | Diagnósticos | Requer |
|---|---|---|---|
| [`diagnostics/duplicate-import/trigger.bas`](./diagnostics/duplicate-import/trigger.bas) | o mesmo Imports declarado duas vezes no cabeçalho do arquivo | `duplicate-import@7` | — |
| [`diagnostics/event-signature-mismatch/trigger.bas`](./diagnostics/event-signature-mismatch/trigger.bas) | handler atribuído a OnClick (TNotifyEvent espera 1 parâmetro Sender) mas o handler tem 0 | `event-signature-mismatch@11` | — |
| [`diagnostics/invalid-interpolation/trigger.bas`](./diagnostics/invalid-interpolation/trigger.bas) | string interpolada com `{}` vazio — parser não consegue produzir expansão | `invalid-interpolation@8` | — |
| [`diagnostics/missing-import/after-quickfix.bas`](./diagnostics/missing-import/after-quickfix.bas) | resultado de aplicar o Quick Fix "Importar mod_resources" sobre diagnostics/missing-import/trigger | `none` | — |
| [`diagnostics/missing-import/trigger.bas`](./diagnostics/missing-import/trigger.bas) | tipo de outro módulo do workspace usado sem o Imports correspondente | `missing-import@9` | `módulo "mod_resources" exportando "TResourceLoader" no workspace` |
| [`diagnostics/module-not-declared/trigger.bas`](./diagnostics/module-not-declared/trigger.bas) | módulo existe no repositório privado mas não foi adicionado a data7.json#dependencies | `module-not-declared@6` | `módulo "mod_shared_utility" no repositório privado E ausência da entrada em data7.json` |
| [`diagnostics/module-not-found/trigger.bas`](./diagnostics/module-not-found/trigger.bas) | Imports de um módulo que não existe no workspace, repositório privado, nem System Library | `module-not-found@6` | `nenhum módulo "mod_unknown_module" instalado em lugar nenhum` |
| [`diagnostics/not-enumerable/trigger.bas`](./diagnostics/not-enumerable/trigger.bas) | For Each sobre tipo do workspace sem propriedade Count + indexer inteiro | `not-enumerable@12` | — |
| [`diagnostics/private-member-access/trigger.bas`](./diagnostics/private-member-access/trigger.bas) | acesso a membro Private de uma classe a partir de outra classe | `private-member-access@13` | `módulo "mod_vault" exportando a classe Vault com campo Private "secret"` |
| [`diagnostics/ternary-context-unsupported/trigger.bas`](./diagnostics/ternary-context-unsupported/trigger.bas) | ternário em contexto não-assignment (Print) — não é expansível | `ternary-context-unsupported@8` | — |
| [`diagnostics/unknown-member/trigger.bas`](./diagnostics/unknown-member/trigger.bas) | acesso a propriedade inexistente (typo) — emite unknown-member com "did you mean Align?" | `unknown-member@11` | — |
| [`diagnostics/unknown-suppression-code/trigger.bas`](./diagnostics/unknown-suppression-code/trigger.bas) | diretiva data7:disable-line referenciando código inexistente em DiagnosticCodes | `unknown-suppression-code@7` | — |
| [`diagnostics/unsupported-member/trigger.bas`](./diagnostics/unsupported-member/trigger.bas) | acesso a propriedade marcada isUnsupported=true na System Library (não traduzida pelo compilador Data7) | `unsupported-member@11` | — |
| [`diagnostics/unused-import/trigger.bas`](./diagnostics/unused-import/trigger.bas) | diretiva Imports declarada mas nenhum símbolo do namespace é referenciado | `unused-import@5` | — |

### builder (1)

| Caminho | Demonstra | Diagnósticos | Requer |
|---|---|---|---|
| [`builder/round-trip-minimal/src/Principal.bas`](./builder/round-trip-minimal/src/Principal.bas) | projeto Data7 mínimo válido para exercitar Builder → Decompiler → Builder | `none` | — |
