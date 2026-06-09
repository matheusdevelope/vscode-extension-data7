# 09 — System Library

> Visão geral dos namespaces nativos do ERP Data7. Referência detalhada em [`docs/system-library/`](../system-library/README.md).

## O que é

A **System Library** é o conjunto de classes, funções, constantes e namespaces fornecidos pelo runtime do ERP Data7. Equivale ao "standard library" ou "framework class library" em outras linguagens.

A extensão `vscode-extension-data7` modela essa biblioteca em [`src/system-library/`](../../src/system-library/), com um arquivo por símbolo. O autocomplete, hover, signature help e linter consultam esses arquivos para validar o uso correto.

## Os 11 namespaces

| Namespace | Conteúdo principal | `Imports` necessário? |
|---|---|---|
| [`Collections`](../system-library/Collections.md) | `StringList`, `TStringList`, `TStrings` | sim |
| [`Data7`](../system-library/Data7.md) | `Report`, `ProximoCodigo`, `Parametro`, `Criptografar`, `PesquisaPadrao`, … | sim |
| [`Drawing`](../system-library/Drawing.md) | `TCanvas`, `TPen`, `TBrushStyle`, `TPenStyle` | sim |
| [`Environment`](../system-library/Environment.md) | `Execute(file, params, wait)` | sim |
| [`Forms`](../system-library/Forms.md) | `Form`, `Panel`, `Grid`, `TextBox`, `NumberTextBox`, `CommandButton`, `MessageBox`, `Calendar`, … (~200 classes) | sim |
| [`IO`](../system-library/IO.md) | `File`, `Directory` | sim |
| [`Net`](../system-library/Net.md) | `TFTP` | sim |
| [`SQL`](../system-library/SQL.md) | `Connection`, `Command`, `TField`, `TFDParam`, eventos FireDAC | sim |
| [`System`](../system-library/System.md) | `TDateTime`, `IOUtils`, funções RTL (`Abs`, `Length`, `Pos`, `Trunc`, `Round`, `Sin`, …) | sim |
| [`System.Classes`](../system-library/System.Classes.md) | `TObject`, `TPersistent` | sim |
| [`XML`](../system-library/XML.md) | `TXMLDocument`, `IXMLNode`, `IXMLNodeList` | sim |

## Símbolos globais (sem `Imports`)

Vivem em `src/system-library/Globals/` e estão **sempre visíveis**:

### Tipos primitivos / aliases

`String`, `Integer`, `Double`, `Boolean`, `TDateTime`, `Date`, `Variant`, `Char`, `Byte`, `TObject`, `TPersistent`, `Exception`, `TGUID`, `TColor`, `TCursor`, `TPoint`, `TRect`, `TFontStyle`.

### Classes globais

| Classe | Função |
|---|---|
| `TJSONObject` | construção e parsing de JSON |
| `TJSONArray` | array JSON |
| `THTTP` | cliente HTTP/REST |
| `ZipFile` | compactação ZIP |
| `Timer` | timer programável |
| `TKeyEvent`, `TMouseEvent`, `TNotifyEvent` | delegates de eventos VCL |

### Constantes globais

`alClient`, `alLeft`, `alRight`, `alTop`, `alBottom`, `alNone` (alinhamento de controles).
`taLeftJustify`, `taRightJustify`, `taCenter` (alinhamento de texto).
`TLSv1`, `TLSv1_1`, `TLSv1_2`, `TLSv1_3` (versões TLS para HTTP).

### Funções globais

| Função | Uso |
|---|---|
| `CInt(v)` | converter para `Integer` |
| `CDbl(v)` | converter para `Double` |
| `CStr(v)` | converter para `String` |
| `TryStrToInt(s, ByRef r)` | converter `String` → `Integer` com sucesso/falha |
| `Chr(n)` | código → caractere |
| `UCase(s)` | converter para maiúsculas |
| `LCase(s)` | converter para minúsculas |
| `Left(s, n)` | primeiros `n` caracteres |
| `Mid(s, start, len)` | substring |
| `InStr(s, sub)` | índice da primeira ocorrência |
| `Space(n)` | string com `n` espaços |
| `RGB(r, g, b)` | construir cor a partir de RGB |
| `Base64ToFile(b64, path)` | gravar arquivo a partir de Base64 |
| `FileToBase64(path)` | ler arquivo como Base64 |

## Membros `unsupported`

Muitos membros herdados de VCL/Delphi (ex.: `Caption`, `Color`, `Constraints`, `Padding` em formulários) **existem na cadeia de herança** mas o compilador Data7 **não os traduz**. A System Library marca esses com `isUnsupported: true`.

Tentar usá-los dispara o diagnóstico [`unsupported-member`](./13-diagnostic-codes.md#unsupported-member) — um warning indicando que o programador deve usar a alternativa Data7 (`Title`/`Titulo` em vez de `Caption`, etc.).

Exemplo em `docs/system-library/Data7.md`:

> `Report.Caption` — Caption (legenda) herdado de TForm — **use `Title`/`Titulo`**. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member.

## Como a System Library é organizada no código

```
src/system-library/
├── types.ts                       ← união SystemContainer (lista canônica de namespaces)
├── symbol-helpers.ts              ← buildClassSymbols, buildNamespaceSymbols, SYSTEM_RANGE
├── index.ts                       ← agregador SYSTEM_SYMBOLS
├── Collections/
│   ├── Collections.ts             ← símbolo do namespace
│   ├── StringList.ts              ← cada classe em um arquivo
│   ├── TStringList.ts
│   └── TStrings.ts
├── Forms/
│   ├── Forms.ts
│   ├── Form.ts
│   ├── Grid.ts
│   ├── ... (~150 arquivos)
├── ... (outros namespaces)
└── Primitives/
    ├── Integer.ts
    ├── String.ts
    └── ...
```

Cada arquivo exporta `symbols: SystemSymbolInfo[]` contendo membros (campo `name`, `kind`, `type`, `parameters`, `containerName`, `description`, opcionalmente `isUnsupported`).

## Como adicionar um símbolo

1. Adicione o nome do container em `src/system-library/types.ts` (`SystemContainer` union) se for novo.
2. Crie `src/system-library/<NS>/<Symbol>.ts` usando os helpers de `symbol-helpers.ts`.
3. Reexporte através de `src/system-library/<NS>/<NS>.ts`.
4. Atualize `docs/system-library/<NS>.md` (auto-gerado por `npm run docs:system-library` — mas pode regenerar manualmente).
5. Rode `npm run docs:system-library` e os testes de System Library para validar que `src/system-library/` e `docs/system-library/` continuam sincronizados.

## Fonte versionada atual

A árvore atual deste repositório não contém os HTMLs exportados do help-desk do ERP. A fonte versionada consumida pela extensão é [`src/system-library/`](../../src/system-library), e a referência humana gerada fica em [`docs/system-library/`](../system-library/README.md).

Quando uma API nativa divergir do runtime real do ERP, atualize primeiro `src/system-library/<NS>/<Symbol>.ts`, regenere `docs/system-library/` e cubra a mudança com teste focado.

## Cross-references

- [`docs/system-library/README.md`](../system-library/README.md) — índice detalhado.
- Cada `docs/system-library/<NS>.md` — referência por namespace.
- [`src/system-library/`](../../src/system-library) — código-fonte da modelagem.
- [`src/system-library/types.ts`](../../src/system-library/types.ts) — `SystemContainer` (lista canônica).
- [`src/test/system-library/`](../../src/test/system-library) — testes de cobertura e geração da System Library.
