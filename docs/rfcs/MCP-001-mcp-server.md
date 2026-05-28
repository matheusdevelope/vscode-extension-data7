<!--
status: Proposed
author: matheusdevelope
created: 2026-05-28
updated: 2026-05-28
supersedes: -
superseded-by: -
-->

# MCP-001 — MCP Server embutido para orientar IA em Data7 Basic

## 1. Resumo executivo

Embutir um servidor **MCP (Model Context Protocol)** dentro da extensão `vscode-extension-data7` para fornecer a agentes de IA (Cursor, Claude Desktop, Continue) **contexto estruturado** sobre a linguagem Data7 Basic — especificação, exemplos canônicos, catálogo nativo, exemplos oficiais do ERP — além de **ferramentas executáveis** (linter, transpilador) que rodam fora do extension host.

A entrega substitui o atual mecanismo `data7.injectSystemLibraryDocs` (que injeta ~62 k tokens em `AGENTS.md`) por um servidor stdio lazy que devolve só o que o agente pedir, viabilizando catálogos grandes como `Forms.*` (~71 k tokens em um único arquivo hoje) sem estourar o context-window do LLM.

## 2. Motivação

### 2.1 Limite do approach atual

O comando `data7.injectSystemLibraryDocs` injeta um bloco delimitado em `AGENTS.md` com a System Library inteira:

| Insumo | Tamanho mensurado |
|---|---:|
| `AGENTS.md` injetado hoje (3 735 linhas) | **~62 k tokens** |
| `docs/system-library/Forms.md` sozinho (212 KB) | **~71 k tokens** (não cabe injetado completo) |
| `docs/linguagem-basic/*.md` (14 capítulos) | **~10 k tokens** |

Resultado prático: o agente carrega 62 k tokens só pra eventualmente usar o nome `Collections.StringList.Add`. E `Forms.*` (o namespace mais útil) **não cabe** no injetado. Cada keystroke do agente paga esse contexto.

### 2.2 Lacuna não-resolvida: feedback executável

`AGENTS.md` é texto. O agente não consegue perguntar "estou quebrando alguma coisa?" — não há como rodar o linter ou o transpilador a partir do agente. Hoje a única forma de feedback é o usuário olhar a aba **Problems** do VS Code.

### 2.3 Insumos versionados ainda não consumidos

A análise de `docs/Documentação Data7/` (RFC § 3.4) revelou **140 exemplos oficiais em Data7 Basic** em HTMLs versionados que **nenhum código da extensão consome hoje**. Para cada método nativo (`Collections.StringList.Add`, `TJSONObject.Has`, `Net.TFTP.Connect`, …), há um exemplo escrito pela própria equipe do ERP, com a sintaxe canônica de chamada e o padrão idiomático de uso. Esse ativo é exatamente o que um agente precisa para gerar código correto na primeira tentativa.

## 3. Inventário de insumos

Toda a infraestrutura necessária para um MCP **já existe** no repo. A tabela abaixo mapeia cada capacidade do MCP ao endereço exato de onde será extraída.

### 3.1 Documentação textual versionada

| Insumo | Quantidade | Tamanho | Status |
|---|---:|---:|---|
| `docs/linguagem-basic/*.md` (capítulos top-level) | 14 arquivos | 2 329 linhas / 124 KB | Já existe, estável |
| `docs/exemple/**/*.bas` (com header `@example`) | 84/107 arquivos | sugar=71, diagnostics=35, builder=1 | Já existe |
| `docs/exemple/sugar/` (subpastas, 1 por açúcar) | 31 subpastas | — | Já existe |
| `docs/exemple/diagnostics/` (subpastas, 1 por código) | 34 subpastas | — | Já existe |
| `docs/system-library/*.md` (gerados) | 12 arquivos | 279 KB | Gerados por `DocsGenerator` |
| `docs/Documentação Data7/**/*.html` | 183 arquivos | 12 MB HTML (~1,3 MB de miolo útil) | Já existe, não-consumido hoje |
| `docs/Documentação Data7/**/instrução.txt` | 9 arquivos | 35 KB | Consumido por `instrucao-coverage.test.ts` |
| `docs/levantamentos/grid.txt` (autocomplete bruto TMS) | 1 arquivo | 807 linhas | Material de pesquisa |
| `docs/linguagem-basic/mod_card_grouper/**` (projeto real) | 47 mod_lib + 8 src + 1 `.7Proj` | 10 826 linhas de `.bas` | Já existe |

### 3.2 Catálogo tipado (lingua franca dos símbolos)

| Métrica | Valor |
|---|---:|
| Arquivos TS em `src/system-library/` | **198** |
| Linhas totais | **25 592** |
| Namespaces na união `SystemContainer` | **11 namespaces + ~95 classes** |
| Símbolos agregados (`SYSTEM_SYMBOLS`) | Endereço: [`src/system-library/index.ts`](../../src/system-library/index.ts) |
| Lookups O(1) já prontos | `lookupSystemByName`, `lookupSystemByContainer`, `lookupSystemClassByName`, `lookupSystemNamespaceOrClassByName` |
| Hash determinístico do snapshot | `DocsGenerator.computeSnapshotHash()` — SHA-256 truncado em 12 hex |

### 3.3 Comportamento executável reaproveitável

| Capacidade | Endereço | Linhas | Depende de `vscode`? |
|---|---|---:|---|
| `SugarTranspiler.transpile()` | [`src/project/transpiler.ts:1674`](../../src/project/transpiler.ts) | 1 616 | **Não** (puro) |
| `DiagnosticsLinter.runAdvancedDiagnostics()` | [`src/diagnostics/diagnostics.ts:271`](../../src/diagnostics/diagnostics.ts) | 969 | Sim (runtime) |
| `WorkspaceSymbolIndexer.createDetached()` | [`src/analysis/symbol-indexer.ts:607`](../../src/analysis/symbol-indexer.ts) | 1 049 | Sim (runtime) |
| `TypeResolver` | [`src/analysis/type-resolver.ts:19`](../../src/analysis/type-resolver.ts) | — | Type-only |
| `detectEnumerable()` | [`src/analysis/enumerable-detector.ts:46`](../../src/analysis/enumerable-detector.ts) | — | **Não** |
| `DocsGenerator` | [`src/system-library/docs-generator.ts:13`](../../src/system-library/docs-generator.ts) | 494 | **Não** |
| `parseExampleHeader()` | [`src/test/_helpers/fixtures.ts:85`](../../src/test/_helpers/fixtures.ts) | 50 | **Não** |
| `vscode-mock` (override de `Module.prototype.require`) | [`src/test/_setup/vscode-mock.ts:1`](../../src/test/_setup/vscode-mock.ts) | 490 | n/a (é o próprio mock) |

### 3.4 Descoberta: `docs/Documentação Data7/**/*.html`

Pasta de **68,5 MB total**, distribuída assim:

| Extensão | Arquivos | Bytes |
|---|---:|---:|
| `.html` (referência API oficial do ERP) | 183 | 12,3 MB |
| `.css` (estilos do site original) | 807 | 28,9 MB |
| `.baixados` (scripts JS espelhados) | 1 326 | 26,1 MB |
| `.png` | 1 747 | 1,4 MB |
| `.gif` | 534 | 40 KB |
| `.php` | 48 | 3,0 MB |
| `.txt` (`instrução.txt`) | 9 | 35 KB |

**99 % do peso é asset do site espelhado**. O miolo extraível é ~1,3 MB.

**Estrutura canônica de cada HTML API-reference** (verificada em amostra de 6 arquivos de namespaces diferentes — ver [Anexo A](#anexo-a-amostra-de-estrutura-html)):

```html
<div id="ARTICLECONTENT"><article>
  <h3>{NomeQualificado}</h3>
  <table class="syntaxhighlighter vb"><!-- assinatura --></table>
  <h3>Descrição:</h3>
  <p>{descrição em português}</p>
  <h3>Exemplo:</h3>
  <table class="syntaxhighlighter vb"><!-- código Data7 Basic --></table>
  <!-- opcional: <h3>Parâmetros:</h3>, <h3>Retorno:</h3>, <h3>Observações:</h3> -->
</article></div>
```

A extração emite `{ qualifiedName, signature, description, example, parameters?, returns? }`. Cobertura: ~140 páginas são API-reference puras, ~38 são class-index (lista de membros agregados), 4 são tutoriais prosaicos (Strings, Data e Hora, Palavras Chave, Tipos de Dados E Funções de Conversão).

**Não há nenhuma referência a essa pasta em `src/`**. Primeiro consumo lógico é o MCP.

### 3.5 Pré-condições já satisfeitas (importante para reduzir risco)

- **Já existe gancho `createDetached()` no indexer** ([`src/analysis/symbol-indexer.ts:607`](../../src/analysis/symbol-indexer.ts)) cujo comentário literal diz: *"Intended for build-time / CLI flows that need a deterministic, isolated view of a project."* — exatamente o caso de uso do MCP.
- **Já existe precedente de scripts Node consumindo `out/` fora do VS Code**: `scripts/generate-system-library-docs.js`, `scripts/audit-system-library.js`, `scripts/generate-examples-index.js`. O MCP é "scripts/" elevado a serviço de longa-duração.
- **`vscode-mock` é 490 linhas, instalado via `Module.prototype.require` override**: portável para qualquer processo Node. Já provado por 51 arquivos de teste em `node --test`.
- **`DocsGenerator` é função pura sem dependência de `vscode`**: pode gerar markdown on-the-fly no MCP, eliminando drift entre `docs/system-library/*.md` e `SYSTEM_SYMBOLS`.

## 4. Proposta

### 4.1 Arquitetura escolhida

**MCP embutido na extensão**, com binário stdio publicado no `globalStorage` do VS Code.

```
┌─ vscode-extension-data7 (host) ────────────────────────────────────┐
│                                                                    │
│   activate() → MCPService.installMcpServer(context)                │
│                  ├─ copia out/mcp/server.js → globalStorageUri/mcp/│
│                  └─ idempotente (hash check)                       │
│                                                                    │
│   src/mcp/                                                         │
│   ├─ server.ts          (@modelcontextprotocol/sdk + stdio)        │
│   ├─ resources/         (10 famílias)                              │
│   ├─ tools/             (11 tools)                                 │
│   ├─ prompts/           (3 templates)                              │
│   └─ runtime/                                                      │
│      ├─ vscode-shim.ts  (cópia adaptada de _setup/vscode-mock.ts)  │
│      └─ workspace-loader.ts  (--workspace=<path>)                  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                            │ stdio
                            ▼
┌─ Cliente MCP externo ──────────────────────────────────────────────┐
│                                                                    │
│   Cursor / Claude Desktop / Continue                               │
│   configurado com:                                                 │
│   { "command": "node",                                             │
│     "args": ["<globalStorage>/mcp/server.js",                      │
│              "--workspace=${workspaceFolder}"] }                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Build pipeline**: `tsc` compila `src/mcp/**` para `out/mcp/**`. Em seguida, **`esbuild` faz bundling** somente do `out/mcp/server.js` (+ deps `@modelcontextprotocol/sdk`) em um único arquivo. Resultado: VSIX cresce ~70-100 KB (vs ~300 KB sem bundling).

### 4.2 Modos de operação

O binário aceita uma flag de modo:

| Flag | Comportamento | Quando usar |
|---|---|---|
| `--standalone` (default) | Lê snapshot via stdin do cliente MCP. Sem acesso a filesystem além de `docs/` e `out/mcp/data/`. | Uso geral, CI, sandboxes |
| `--workspace=<path>` | Carrega `.bas` do workspace para `WorkspaceSymbolIndexer.createDetached()`. Habilita `data7_lint_project`. | Quando o usuário tem workspace Data7 aberto |

### 4.3 Superfície MCP completa

#### Resources (10 famílias, todas lazy)

| URI | Conteúdo | Tamanho típico | Fonte |
|---|---|---:|---|
| `data7://language/<chapter>` | 1 capítulo `.md` (`01-sintaxe`…`13-diagnostic-codes`) | 5-15 KB | `docs/linguagem-basic/` |
| `data7://system-library/<ns>` | Namespace inteiro (gerado on-the-fly) | 1-215 KB | `DocsGenerator.generateNamespaceMarkdown(ns)` |
| `data7://system-library/<ns>/<class>` | Classe específica + cadeia de herança | 1-10 KB | `DocsGenerator` parcial |
| `data7://examples/<category>/<slug>` | 1 `.bas` + header parseado | 0,5-3 KB | `docs/exemple/` |
| `data7://examples/index` | Índice navegável dos 107 exemplos | 5 KB | scan + `parseExampleHeader()` |
| `data7://diagnostics/codes` | Catálogo dos 33 códigos com payloads | 8 KB | `DiagnosticCodes` + scan de `docs/exemple/diagnostics/` |
| `data7://idioms` | Convenções idiomáticas + limitações | 12 KB | merge de `11-` + `12-` |
| `data7://real-project/mod_card_grouper/<file>` | Qualquer `.bas` do projeto real | 0,5-10 KB | leitura direta |
| `data7://official/<qualifiedName>` ← **NOVO §3.4** | Assinatura + descrição + exemplo oficial | 0,5-3 KB | `out/mcp/data/articles.json` |
| `data7://official/index` ← **NOVO §3.4** | Índice dos 140 membros documentados | 8 KB | derivado de `articles.json` |
| `data7://guide/<slug>` ← **NOVO §3.4** | Tutoriais (Strings, Data e Hora, Palavras Chave, Tipos de Dados) | 5-20 KB | extração dos 4 HTMLs tutoriais |
| `data7://meta/snapshot` | `{ hash, version, namespaces[], articlesHash }` | 1 KB | computed |

#### Tools (11)

| Tool | Categoria | Reusa | Esforço |
|---|---|---|---|
| `data7_search_symbol` | Lookup puro | `lookupSystemByName`, `lookupSystemByContainer` | trivial |
| `data7_describe_symbol` | Lookup mesclado | `SYSTEM_SYMBOLS` + `TypeResolver.resolveParent` + `articles.json` quando disponível | baixo |
| `data7_search_examples` | Lookup puro | scan de `docs/exemple/` por `@demonstrates` | baixo |
| `data7_get_canonical_example` | Lookup puro | `loadExample()` + `parseExampleHeader()` | trivial |
| `data7_get_official_example` ← **NOVO §3.4** | Lookup puro | lookup em `articles.json` | trivial |
| `data7_list_diagnostic_codes` | Lookup puro | `DiagnosticCodes` + scan de `docs/exemple/diagnostics/` | trivial |
| `data7_list_sugar` | Lookup puro | extração programática de `RULES` em `transpiler.ts:1602` | baixo |
| `data7_transpile_bas` | Executable puro | `SugarTranspiler.transpile(code, ctx)` + `detectEnumerable` | baixo |
| `data7_lint_bas` | Executable + shim | `vscode-shim` + `createDetached()` + `runAdvancedDiagnostics()` | médio |
| `data7_lint_project` | Executable + shim | `vscode-shim` + workspace loader + linter | médio |
| `data7_suggest_import` | Mixed | `lookupSystemByName` + workspace scan | baixo |

#### Prompts (3)

| Prompt | Input | Saída |
|---|---|---|
| `data7_module_skeleton` | `{ moduleName, namespaceName, baseClass? }` | Esqueleto `'@Module` + `Imports` blocks + `Namespace` + `Class` |
| `data7_baseenum_pattern` | `{ enumName, values: [{ id, label }] }` | Classe BaseEnum completa com `Initialize`, `Load`, `GetOptions`, Shared Functions por valor |
| `data7_typed_recordlist` | `{ elementTypeName }` | Subclasse `TRecordList` com Find/Filter/Map/ForEach + delegates correspondentes |

### 4.4 Fluxo end-to-end (exemplo)

**Antes (com `AGENTS.md`):**

```
Usuário: "Como uso TJSONObject.Has?"
IA: lê os 62 k tokens do AGENTS.md, encontra:
    "TJSONObject.Has(key) — Verifica se a chave existe."
IA: gera código baseado no nome (sem ver exemplo oficial; pode errar sintaxe).
```

**Depois (com MCP):**

```
Usuário: "Como uso TJSONObject.Has?"
IA: chama data7_describe_symbol("TJSONObject.Has")
    → recebe {
        signature: "TJSONObject.Has(Const Key As UnicodeString) As Boolean",
        description: "Retorna true caso encontre um atributo com o mesmo nome...",
        officialExample: "Dim obj As TJSONObject = New TJSONObject()\n..."
      }
IA: copia/adapta o exemplo oficial — código correto na primeira tentativa.
Custo de contexto: ~500 tokens em vez de 62 k.
```

## 5. Decisões travadas

Cada decisão abaixo foi tomada explicitamente (referência em [Anexo B](#anexo-b-decisões-registradas)) e não deve ser revisitada sem nova RFC.

| # | Decisão | Alternativas rejeitadas | Justificativa |
|---:|---|---|---|
| D1 | **Servidor MCP embutido** na extensão (binário em `globalStorage`) | (a) Subpacote no mesmo repo distribuído via npm separado; (b) Pacote npm independente `@matheusdevelope/data7-mcp` | Usuário já tem a extensão; um único instalador. Compatível nativo com Cursor + Claude Desktop + Continue via stdio. |
| D2 | **Transport stdio** | HTTP/SSE local em porta dinâmica | Claude Desktop ainda não suporta HTTP MCP; stdio é o denominador comum dos 3 clientes-alvo. |
| D3 | **Cobertura: Cursor + Claude Desktop + Continue** | Cobrir só Cursor | Usuário declarou usar os três. Stdio cobre os três com config idêntica. |
| D4 | **Escopo da Fase 1 = "everything"** (Resources + lookup tools + executable tools com mock) | (a) Só Resources; (b) Resources + lookup; (c) Tudo readonly + transpile_bas | Maior risco mas maior valor; `vscode-mock` já está provado em 51 arquivos de teste. |
| D5 | **`esbuild` com escopo restrito** (só `out/mcp/server.js`) | (a) Sem bundler (copiar `node_modules` inteiro do SDK); (b) Decidir no M5 | Reduz ~70 % do peso adicional no VSIX (de ~300 KB para ~70-100 KB). |
| D6 | **Atualizar `project_stack.mdc`** para "duas runtime deps: `fast-xml-parser` + `@modelcontextprotocol/sdk`" | (a) Criar seção mais ampla "MCP server dependencies"; (b) Manter regra atual e tratar como dívida técnica | Mais simples e explícito; futura RFC adiciona deps caso a caso. |
| D7 | **Auto-instalação na ativação** do binário MCP em `context.globalStorageUri/mcp/` | (a) Só via comando manual; (b) Sem instalação automática | Idempotente (hash check evita re-cópia desnecessária). Pronto para o usuário sem fricção. |
| D8 | **Extrair `docs/Documentação Data7/` no M1.5** para `out/mcp/data/articles.json` | (a) Adiar para M6+; (b) Manter só como repositório humano; (c) Enriquecer `src/system-library/` primeiro | Ganho qualitativo enorme (140 exemplos oficiais) por 9,5h de esforço. |
| D9 | **Manter os 56 MB de assets** (CSS/PNG/GIF/.baixados) no Git | (a) Remover em commit separado; (b) Mover para Git LFS | Auditoria humana + re-extração segura se a estrutura HTML mudar; tamanho do clone é aceitável para o porte do projeto. |
| D10 | **Páginas-tutorial como `data7://guide/<slug>`** separado | (a) Mesclar conteúdo em `docs/linguagem-basic/`; (b) Ignorar | Distinção clara entre API-reference e prose tutorial preserva expectativa do agente. |
| D11 | **RFC primeiro, código depois** | Ir direto pro M0 | Decisão arquitetural com 11 escolhas; documento revisável antes de mudar regras. |

## 6. Plano de execução

| Milestone | Conteúdo | Saída visível | Esforço (h) |
|---|---|---|---:|
| **M0** | Regulatório: estender `project_stack.mdc` (D6) + nova fence `data7/mcp-isolation` em `eslint.config.mjs` + entrada em `governance.mdc` no grafo de dependências + entrada em `project_structure.mdc` descrevendo `src/mcp/` + atualizar `.vscodeignore` (incluir `out/mcp/**`, excluir `src/mcp/**`) + `package.json` (adicionar `@modelcontextprotocol/sdk` runtime, `esbuild` devDep, scripts `mcp:build` e `mcp:bundle`) | `npm run verify` continua passando | 3,5 |
| **M1** | `src/mcp/server.ts` (bootstrap stdio) + 10 Resources (incluindo `data7://official/*` e `data7://guide/*` como stubs vazios) + `src/services/mcp-service.ts` (auto-install) + comando `data7.installMcpServer` (manual re-install) | `node out/mcp/server.js` lista Resources via stdio | 13 |
| **M1.5** | `scripts/extract-official-articles.js` (varre 178 HTMLs API-reference, emite `out/mcp/data/articles.json`) + 1 teste de cobertura (`src/test/mcp/articles-coverage.test.ts`) + populate dos Resources `data7://official/*` e `data7://guide/*` | `articles.json` (~400 KB) com 140+ entries | 5 |
| **M2** | 7 lookup tools (`search_symbol`, `describe_symbol` [merge com `articles.json`], `search_examples`, `get_canonical_example`, `get_official_example`, `list_diagnostic_codes`, `list_sugar`) | Cursor chama `search_symbol("Grid")` e recebe `Forms.Grid` | 13 |
| **M3** | `src/mcp/runtime/vscode-shim.ts` (cópia adaptada do mock) + `workspace-loader.ts` + `transpile_bas` + `lint_bas` + `lint_project` | Cursor pede `lint_bas("Dim x As StringList")` e recebe `missing-import` | 16 |
| **M4** | `suggest_import` + 3 prompts (`module_skeleton`, `baseenum_pattern`, `typed_recordlist`) | Cursor gera um esqueleto BaseEnum válido | 6 |
| **M5** | Testes end-to-end (1 por tool + 1 smoke por resource family) + walkthrough step 6 ("Instalar MCP") + `src/mcp/README.md` com configs para os 3 clientes MCP | `npm run test` cobre o MCP; usuário tem documentação clara | 12 |
| **Total** | | | **68,5 h (~8,5 dias-pessoa)** |

## 7. Riscos e mitigações

| # | Risco | Severidade | Mitigação |
|---:|---|---|---|
| R1 | `DiagnosticsLinter` consome `vscode` em runtime | Média | Reusar `src/mcp/runtime/vscode-shim.ts` (cópia adaptada de `_setup/vscode-mock.ts`); padrão já provado em 51 arquivos de teste |
| R2 | `Forms.md` (212 KB / ~71 k tokens) é maior que o context-window de alguns LLMs | Alta | Tool `describe_symbol` devolve só a classe, nunca o namespace inteiro; MCP nunca carrega o arquivo todo de uma vez |
| R3 | Drift entre `docs/system-library/*.md` (arquivos) e `SYSTEM_SYMBOLS` (TS) | Baixa | MCP **gera on-the-fly** via `DocsGenerator`; arquivos no disco viram opcionais |
| R4 | `instrução.txt` cobre só 9 % dos namespaces | Média | Tratar como Resource opcional/research; canonical é `SYSTEM_SYMBOLS` (consistência policiada por `instrucao-coverage.test.ts`) |
| R5 | Claude Desktop não suporta HTTP MCP (só stdio) | resolvido por D2 | Stdio é nativo nos 3 clientes |
| R6 | Path do `node` varia entre máquinas (Windows vs Mac) | Média | `MCPService.previewClientConfig(client)` detecta o `node` via `process.execPath` e injeta no config gerado |
| R7 | Usuário pode rodar o MCP com versão velha após `npm update` da extensão | Média | `data7://meta/snapshot` expõe versão + hash; clientes podem alertar drift. Comando `data7.reinstallMcpServer` força re-cópia |
| R8 | `vscode-shim` desincroniza do mock dos testes | Baixa | Documentar em `governance.mdc` que ambos podem evoluir; mock dos testes pode ter superfícies que o shim não precisa, e vice-versa |
| R9 | `@modelcontextprotocol/sdk` viola "single runtime dep" | resolvido por D6 | M0 atualiza `project_stack.mdc` justificando a 2ª dep como integração de feature |
| R10 | Tamanho do VSIX cresce ~70-100 KB com bundling | Baixa | Aceitável; documentar no CHANGELOG.md como parte do roll-out |
| R11 | Extração HTML quebra se a Se7e Sistemas mudar o template das páginas | Baixa | Os HTMLs estão versionados no repo (D9); re-extração é determinística e local. Mudança no template viraria nova RFC. |
| R12 | Páginas class-index têm estrutura diferente das API-reference | Baixa | Extrator detecta pela ausência de H3 "Descrição:" + presença de tabela; emite `{ isClassIndex: true, members: [...] }` |
| R13 | Auto-instalação na ativação atrasa a ativação para usuários com disco lento | Baixa | Hash check primeiro (operação rápida); só copia se necessário. Operação em background com `withProgress` se demorar |

## 8. Mudanças regulatórias necessárias (M0)

### 8.1 `.cursor/rules/project_stack.mdc`

Alterar a linha "*Single runtime dependency: `fast-xml-parser`*" para:

> **Two runtime dependencies**: `fast-xml-parser` (parsing/serialização de `.7proj`) e `@modelcontextprotocol/sdk` (consumido exclusivamente por `src/mcp/`, ver MCP-001).

### 8.2 `.cursor/rules/governance.mdc`

Adicionar no bloco `# Architectural enforcement`:

> **`src/mcp/`** é uma camada de **serviço externo** (roda fora do extension host). Pode depender de `infra/` (type-only), `system-library/`, `analysis/`, `diagnostics/`, `project/`, `utils/`. **Não** pode importar `providers/`, `services/`, `extension`, `infra/configuration.ts` (depende de `vscode.workspace.getConfiguration`), nem `vscode` diretamente. A única forma de consumir API do VS Code é via `src/mcp/runtime/vscode-shim.ts`.

### 8.3 `.cursor/rules/project_structure.mdc`

Adicionar entrada na seção `## Top-level src/ layout`:

> **`src/mcp/`** — servidor MCP (Model Context Protocol) que orienta agentes de IA sobre a linguagem Data7 Basic. Compilado por `tsc` para `out/mcp/**`, depois bundled por `esbuild` em `out/mcp/server.js` (single-file). Estrutura interna: `resources/` (Resources MCP), `tools/` (Tools MCP), `prompts/` (Prompt templates), `runtime/` (`vscode-shim.ts`, `workspace-loader.ts`). O binário é copiado para `context.globalStorageUri/mcp/` na ativação da extensão por `src/services/mcp-service.ts`.

### 8.4 `eslint.config.mjs`

Nova fence:

```js
{
  name: "data7/mcp-isolation",
  files: ["src/mcp/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        {
          group: ["**/providers/**", "**/services/**", "**/extension", "**/infra/configuration"],
          message:
            "src/mcp/ runs outside the extension host; consume infra via runtime/vscode-shim only (MCP-001).",
        },
        {
          group: ["vscode"],
          message:
            "src/mcp/ must not import 'vscode' directly; use src/mcp/runtime/vscode-shim instead (MCP-001).",
        },
        DOCS_EXEMPLE_BAN,
      ],
    }],
  },
},
```

Ajuste paralelo em `services-isolation` para permitir `mcp-service.ts` consumir o binário (`out/mcp/server.js`) como caminho de arquivo, não como módulo importado.

### 8.5 `package.json`

```diff
 "dependencies": {
-  "fast-xml-parser": "^5.8.0"
+  "fast-xml-parser": "^5.8.0",
+  "@modelcontextprotocol/sdk": "^1.x.x"
 },
 "devDependencies": {
+  "esbuild": "^0.24.x",
   ...
 },
 "scripts": {
+  "mcp:build": "tsc -p ./src/mcp/tsconfig.json",
+  "mcp:bundle": "esbuild out/mcp/server.js --bundle --platform=node --target=node22 --outfile=out/mcp/server.bundled.js --external:vscode",
   ...
 }
```

E o `compile` passa a chamar `npm run mcp:build && npm run mcp:bundle` no final.

### 8.6 `.vscodeignore`

Garantir que `out/mcp/**` está incluído no VSIX (já é o caso por default) e adicionar uma linha excluindo o source para evitar bloat acidental:

```
# MCP server source — only the bundled out/mcp/server.bundled.js ships
src/mcp/**
out/mcp/server.js
out/mcp/server.js.map
!out/mcp/server.bundled.js
!out/mcp/data/**
```

## 9. Métricas de sucesso

| Métrica | Alvo | Como medir |
|---|---|---|
| Tamanho do VSIX após M5 | crescimento ≤ 150 KB | `ls -l *.vsix` antes/depois |
| Cobertura de exemplos oficiais sobre `SYSTEM_SYMBOLS` (M1.5) | ≥ 70 % dos métodos suportados em `Collections`, `SQL.Command`, `Net.TFTP`, `XML.*`, `Global.TJSONObject` | `articles-coverage.test.ts` |
| Tempo de resposta médio de `data7_describe_symbol` | ≤ 50 ms | log no MCP em modo `--verbose` |
| Tempo de `data7_lint_bas` em arquivo de 200 linhas | ≤ 200 ms | benchmark no M3 |
| Redução de contexto pro agente | 62 k tokens → ≤ 2 k tokens por sessão típica | comparação antes/depois com Cursor logs |
| Cobertura de testes do `src/mcp/` | ≥ 80 % linhas | `npm run test:coverage` |

## 10. Anexos

### Anexo A: amostra de estrutura HTML

Verificado em 6 arquivos de namespaces diferentes (todos confirmaram a estrutura):

- `docs/Documentação Data7/Collections/Collections.StringList.Add.html` (linha 593-602)
- `docs/Documentação Data7/Global/TJSONObject/TJSONObject.Has.html` (linha 635-643)
- `docs/Documentação Data7/Global/11 - Strings.html` (linha 471-...; tutorial, sem H3 Descrição)
- `docs/Documentação Data7/SQL/Command/SQL.Command.html` (class-index com tabela de membros)
- `docs/Documentação Data7/Net/Net.TFTP.Passive.html` (API-reference padrão)
- `docs/Documentação Data7/XML/IXMLNode/XML.IXMLNodeAddChild.html` (API-reference com Parâmetros)

Exemplo de payload extraído:

```json
{
  "qualifiedName": "Collections.StringList.Add",
  "signature": "Collections.StringList.Add(Const S As UnicodeString) As Integer",
  "description": "Adiciona uma string à lista de strings e retorna o índice do item na lista.",
  "example": "Dim texto As Collections.StringList = New Collections.StringList()\n\nPrint texto.Add(\"Se7e\")\nPrint texto.Add(\"Sistemas\")\n\nPrint texto.Text\n\ntexto.Free()"
}
```

### Anexo B: decisões registradas

As decisões D1-D11 da § 5 foram tomadas através das três rodadas de questionário aplicadas na sessão de design:

1. **Rodada 1 (análise inicial)**: usuário definiu *embedded*, *everything*, *all 3 clients*.
2. **Rodada 2 (refinamentos arquiteturais)**: usuário definiu *esbuild restrito*, *update project_stack.mdc*, *auto-install*.
3. **Rodada 3 (após análise de `docs/Documentação Data7/`)**: usuário definiu *extract-now*, *keep-everything (Git)*, *tutorials separados como guides*.
4. **Rodada 4 (planejamento de execução)**: usuário definiu *RFC primeiro*, *único commit RFC* antes de qualquer mudança.

### Anexo C: comandos contribuídos novos

Apenas dois comandos são adicionados ao manifest:

| Command | Categoria | Quando aparece |
|---|---|---|
| `data7.installMcpServer` | Data7 | Sempre (re-instala binário no globalStorage manualmente) |
| `data7.previewMcpClientConfig` | Data7 | Sempre (mostra JSON pronto para Cursor/Claude/Continue) |

A auto-instalação em `activate()` não precisa de comando — roda silenciosamente com idempotência via hash.

### Anexo D: links cruzados

- [`project_context.md`](../../project_context.md) — contexto técnico/arquitetural da extensão.
- [`docs/linguagem-basic/README.md`](../linguagem-basic/README.md) — referência canônica da linguagem.
- [`docs/exemple/README.md`](../exemple/README.md) — exemplos canônicos versionados.
- [`docs/system-library/README.md`](../system-library/README.md) — System Library gerada.
- [`.cursor/rules/governance.mdc`](../../.cursor/rules/governance.mdc) — fences arquiteturais.
- [`.cursor/rules/project_stack.mdc`](../../.cursor/rules/project_stack.mdc) — stack permitida.
- Spec MCP: <https://modelcontextprotocol.io/>
- SDK npm: <https://www.npmjs.com/package/@modelcontextprotocol/sdk>
