# 01 — Sintaxe básica

> Estrutura léxica de um arquivo Data7 Basic: extensões, declarações de topo, comentários e tags semânticas.

## Extensões de arquivo

| Extensão | Conteúdo | Quem produz | Quem consome |
|---|---|---|---|
| `.bas` (alias `.d7b`) | Script Data7 Basic | Programador | Linter, IDE, Builder |
| `.7proj` (alias `.7Proj`) | Projeto agregado em XML | Builder | Compilador Data7 (executor do ERP) |
| `data7.json` | Manifesto do projeto (metadata + `dependencies`) | Programador / extensão | Builder, DependencyService |

As extensões e os IDs de linguagem (`d7basic`, `data7project`) são declarados em [`package.json#contributes.languages`](../../package.json) e referenciados pela gramática TextMate em [`syntaxes/`](../../syntaxes).

## Suporte da extensão (TextMate + language-configuration)

A extensão registra duas linguagens VS Code para `.bas` e `.7proj`:

- **`d7basic`** — Data7 Basic. Gramática TextMate em [`syntaxes/d7basic.tmLanguage.json`](../../syntaxes/d7basic.tmLanguage.json). Aliases reconhecidos: `Data7 Basic`, `d7basic`.
- **`data7project`** — XML do projeto. Reusa a gramática `text.xml` do VS Code.

### Bracket pairs e auto-fechamento

Declarados em [`language-configuration.json`](../../language-configuration.json):

| Par | Auto-close? | Surround? |
|---|---|---|
| `{` `}` | sim | sim |
| `[` `]` | sim | sim |
| `(` `)` | sim | sim |
| `"` `"` | sim (fora de string) | sim |
| `'` `'` | sim (fora de string/comentário) | sim |

### Regras de indentação

A indentação é incrementada nas linhas que começam com:

```
Namespace, Class, Sub, Function, Property, For, If, Else, ElseIf, Select, Do, With, Try, Catch
```

E decrementada nas linhas que começam com:

```
End, Next, Loop, Else, ElseIf, Catch, Finally
```

Quando o auto-formatter está ativo, o VS Code aplica essas regras junto com a convenção do projeto (3 espaços por nível).

### Tokens reconhecidos pela gramática

A gramática TextMate em [`syntaxes/d7basic.tmLanguage.json`](../../syntaxes/d7basic.tmLanguage.json) destaca:

| Categoria | Tokens (case-insensitive) |
|---|---|
| Controle | `Imports`, `Namespace`, `Class`, `Sub`, `Function`, `Property`, `Get`, `Set`, `Shared`, `Inherits`, `Overridable`, `Overrides`, `As`, `Public`, `Private`, `Dim`, `New`, `If`, `Then`, `Else`, `ElseIf`, `End`, `Return`, `Select`, `Case`, `Try`, `Catch`, `Throw`, `For`, `Each`, `In`, `To`, `Step`, `Next`, `While`, `Until`, `Loop`, `Do`, `Exit`, `With`, `MyBase`, `Me` |
| Lógico | `And`, `Or`, `Not`, `Xor` |
| Constantes | `True`, `False`, `NULL`, `Nothing` |
| Tipos primitivos | `Integer`, `Long`, `String`, `Boolean`, `Variant`, `TDateTime`, `Exception`, `TObject` |
| Tipos do runtime ERP | `StringList`, `Collections.StringList`, `ObjectPrinter`, `Transport`, `TransportList`, `BaseList`, `BaseItem`, `SQL.Command`, `TJSONArray`, `TJSONObject`, `Certificado`, `CertificadoList`, `Logger`, `LogInfo` |
| Strings | `"..."` + interpolação `$"..."` com expressões `{expr}` e escape `""`, `{{`, `}}` |

> **Gaps conhecidos da gramática**: `Delegate`, `Protected`, `ReadOnly`, `Optional`, `ByRef`, `ByVal`, `Rem` ainda **não** são reconhecidos como keywords pela TextMate grammar — eles funcionam no linter (que tem sua própria detecção) mas aparecem com cor neutra no editor. Adicioná-los à gramática é uma melhoria pendente.

## Estrutura mínima de um `.bas`

Todo arquivo segue o esqueleto:

```basic
'@Module
'@Description: Resumo do que o módulo faz.

Imports <Namespace1>
Imports <Namespace2>

Namespace <nome_do_modulo>

   Class <NomeDaClasse>
      ' campos, propriedades, métodos
   End Class

End Namespace
```

- O bloco de comentários no topo é o **header** do módulo (vide [Tags semânticas](#tags-semânticas) abaixo).
- `Imports` lista os namespaces externos que esse arquivo usa. Diretivas duplicadas disparam o diagnóstico [`duplicate-import`](./13-diagnostic-codes.md#duplicate-import).
- `Namespace nome_do_modulo` agrupa todas as declarações. Convenção: nome igual ao do arquivo (`mod_card_record.bas` → `Namespace mod_card_record`).
- O fechamento `End Namespace` é obrigatório.

`Principal.bas` é a exceção: símbolos declarados nele são injetados no escopo global e visíveis em todos os arquivos sem necessidade de `Imports`. Vide [08-modulos-e-imports.md](./08-modulos-e-imports.md).

## Comentários

Data7 Basic suporta dois estilos:

```basic
' Comentário de linha (do apóstrofo até o fim da linha)
Rem Comentário antigo estilo BASIC (também aceito)

' Comentário trailing após uma instrução ↓
Dim x As Integer = 42  ' explicação inline
```

Não existe comentário de bloco multi-linha. Para parágrafos use múltiplas linhas iniciadas com `'`:

```basic
' Esta classe encapsula o fluxo de processamento de retorno
' de cartões. Recebe um TPipelineController e expõe métodos
' Show/Print/ExportToPdf herdados de Form.
```

Comentários são preservados verbatim pelo Builder (a menos que estejam dentro de blocos transpilados em que a saída perde a estrutura, como `For Each ... Next`).

## Tags semânticas

Tags em comentário do header têm significado para a extensão e para o Builder. Não são "documentação" — são **metadados estruturados**.

| Tag | Onde | Significado |
|---|---|---|
| `'@Module` | Header do arquivo | Marca este `.bas` como um **módulo compartilhável** — elegível para importar em outros projetos via repositório privado. Sem essa tag o arquivo é considerado código local do projeto. |
| `'@Module-Imported` | Header de um `.bas` dentro de `data7_modules/` | Marca a cópia local como **importada** (não-canônica). O canônico vive no repositório privado; arquivos com essa tag não são reexportáveis. |
| `'@Description: ...` | Linha solta | Descrição livre exibida em hover/IntelliSense. |
| `'@example`, `'@demonstrates`, `'@diagnostics`, `'@transpiled-to`, `'@requires` | Apenas em `docs/example/*.bas` | Headers de exemplos canônicos consumidos por testes via `loadExample(...)`. Vide [`docs/example/README.md`](../example/README.md). |
| `' data7:disable-line <code>` ou `' data7:disable-next-line <code>` | Linha solta | Suprime um diagnóstico específico nessa linha (ou na próxima). Código inexistente dispara [`unknown-suppression-code`](./13-diagnostic-codes.md#unknown-suppression-code). |

## Identificadores

- **Case-insensitive**. `me`, `Me`, `ME` são equivalentes. `myList`, `MyList`, `mylist` referenciam a mesma variável.
- Caracteres aceitos: `[A-Za-z_][A-Za-z0-9_]*`.
- Acentos não são aceitos em identificadores (mas são aceitos em literais string).
- Convenções habituais (não são regras da linguagem):
  - **PascalCase** para classes, structures, namespaces (`CardRecord`, `TPipelineForm`).
  - **PascalCase** para métodos e propriedades públicas (`AddParam`, `Count`, `OnGesture`).
  - **`_camelCase`** para campos privados (`_form`, `_inputAdm`).
  - **`p<Algo>`** para parâmetros (`pIndex`, `pValue`, `pName`).
  - **`__nome`** (dois underscores) é reservado para identificadores **sintéticos** emitidos pelo Builder (`__idx0`, `__src0`). Não use em código manual.

## Quebra de linha e ponto-e-vírgula

- Cada instrução ocupa **uma linha**. Não há ponto-e-vírgula no fim.
- Continuação de linha NÃO é suportada (Data7 Basic não tem o `_` do VB6/VB.NET para split de linha longa). Quebre expressões longas usando variáveis intermediárias.
- Linhas em branco são preservadas como separadores visuais; o linter ignora.

## Indentação

- Convenção do ERP: **3 espaços** por nível. O formatador (`vscode-extension-data7`) aplica essa regra.
- Tabs e espaços misturados são tolerados pelo parser, mas o formatador normaliza para espaços.

## Sintaxe canônica resumida

```basic
'@Module

Imports mod_pipeline_record
Imports Collections

Namespace mod_card_record

   Class CardRecord
      Inherits TRecord

      Private _id As Integer

      Sub New(pIndex As Integer)
         MyBase.New(pIndex)
         me._id = pIndex
      End Sub

      Property ID As Integer
         Get
            ID = me._id
         End Get
         Set(pValue As Integer)
            me._id = pValue
         End Set
      End Property

      Function ToString() As String
         ToString = "CardRecord(" & me._id & ")"
      End Function

   End Class

End Namespace
```

Próximos capítulos detalham cada elemento: [tipos](./02-tipos.md), [operadores](./03-operadores.md), [controle de fluxo](./04-controle-de-fluxo.md), [classes](./05-classes.md).
