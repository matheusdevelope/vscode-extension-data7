# Changelog

Todas as mudanças notáveis a este projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado (System Library — namespace `Net`)

- **`Net.TFTP`** — cliente FTP do ERP Data7 documentado em `docs/Documentação Data7/Net/`:
  - 6 propriedades (`Host`, `Passive`, `Password`, `Port`, `TransferType`, `UserName`).
  - 8 métodos (`Connect`, `Disconnect`, `ChangeDir`, `List`, `Get`, `Put`, `Delete`, `Rename`).
  - 1 membro obsoleto (`Connected`) marcado como `isUnsupported: true` — o linter emite `unsupported-member` quando referenciado.
- Novos arquivos: `src/system-library/Net/Net.ts` (namespace) e `src/system-library/Net/TFTP.ts` (classe).
- `SystemContainer` em `src/system-library/types.ts` ganhou as entradas `"Net"` e `"TFTP"`.
- `docs/system-library/Net.md` agora é gerado pelo `npm run docs:system-library` (era a única pasta de `docs/Documentação Data7/` sem cobertura na System Library — o `Imports Net` antes emitia falso `module-not-found`).

### Refatorado (eliminação de exceções arquiteturais)

- **`src/analysis/module-resolver.ts`** (novo) — extrai a lógica de resolução de "namespace → arquivo `.bas`" antes embutida em `providers/document-link-provider.ts`. Faz lookup em duas etapas (workspace via `WorkspaceSymbolIndexer`, depois repositório privado via `infra/extension-paths`).
- **`src/infra/extension-paths.ts`** (novo) — single source of truth para o path do repositório privado (`getRepoBasPath`). Inicializado por `RepositoryService.initialize(context)` durante a ativação; tem fallback `~/.data7_extension/repository` para callers pre-activate / testes.
- **`providers/document-link-provider.ts`** agora é um adapter de ~50 linhas (era ~120) que chama `resolveNamespaceFile()` do `analysis/`. **Não importa mais `services/`** — a exceção `data7/document-link-provider-exception` foi removida do `eslint.config.mjs`. A fence `providers/` ↛ `services/` agora vale sem exceções.

### Refatorado (`extension.ts` mais focado)

- **`src/commands.ts`** (novo) — exporta `registerCommands(context)`, consumindo `COMMAND_IDS` de `infra/constants`. Lista os 15 comandos `data7.*` em um único `Array<[id, handler]>` mapped para `vscode.commands.registerCommand`.
- **`src/providers/registration.ts`** (novo) — exporta `registerLanguageProviders(context)` que instancia e registra os 13 providers. Tem override `data7/providers-registration-exception` no ESLint para permitir os imports cross-provider (é o único módulo que precisa).
- **`src/extension.ts`** reduzido de 215 para ~130 linhas — `activate()` agora só orquestra (`initLogger`, `RepositoryService.initialize`, `registerWorkspaceListeners`, `registerCommands`, `registerLanguageProviders`, `DiagnosticService.initialize`, `ActivationService.initializeWorkspace`, `SyncWatcher.startAutoSync`).

### Refatorado (reorganização do suite de testes)

- **`src/test/` agora espelha 1-para-1 a estrutura de `src/`** — testes antes top-level migrados para subpastas dedicadas:
  - `src/test/symbol-indexer.test.ts` → `src/test/analysis/symbol-indexer.test.ts`
  - `src/test/dependency-scanner.test.ts` → `src/test/analysis/dependency-scanner.test.ts`
  - `src/test/type-resolver.test.ts` → `src/test/analysis/type-resolver.test.ts`
  - `src/test/diagnostic-codes.test.ts` → `src/test/diagnostics/diagnostic-codes.test.ts`
  - `src/test/linter.test.ts` → `src/test/diagnostics/diagnostics.test.ts` (renomeado)
  - `src/test/builder.test.ts` → `src/test/project/builder.test.ts`
  - `src/test/configuration.test.ts` → `src/test/infra/configuration.test.ts`
  - `src/test/system-library.test.ts` → `src/test/system-library/system-library.test.ts`
- **`src/test/util/` → `src/test/utils/`** acompanhando o rename de `src/util/` → `src/utils/`.

### Mudado (services e scripts)

- **`src/system-library/docs-generator.ts`** — `DocsGenerator` movido de `src/services/` para `src/system-library/` (gerador puro, sem `vscode`, só consome `SYSTEM_SYMBOLS` — pertence ao domínio da System Library). `src/services/docs-service.ts` (wrapper VS Code) continua em `services/`.
- **`scripts/audit-system-library.js`** atualizado para `out/utils/primitive-types` (path antigo: `out/util/primitive-types`).
- **`scripts/generate-system-library-docs.js`** atualizado para `out/system-library/docs-generator` (path antigo: `out/services/docs-generator`).

### Refatorado (reorganização do `src/`)

- **Layout por capability** — os 25 arquivos antes achatados em `src/` foram agrupados em 5 pastas seguindo o **Pattern B** (capability-oriented, `microsoft/vscode-python`) com uma fatia de **Pattern C** (domain folder, `microsoft/vscode-pull-request-github`):
  - `src/providers/` — 13 arquivos (11 `*-provider.ts` + `formatter.ts` + `code-actions.ts`).
  - `src/analysis/` — 3 arquivos (`symbol-indexer`, `dependency-scanner`, `type-resolver`).
  - `src/diagnostics/` — 2 arquivos (`diagnostics` linter + `diagnostic-codes` table).
  - `src/project/` — 3 arquivos (`builder`, `decompiler`, `project-metadata`).
  - `src/infra/` — `logger`, `configuration` e o novo `constants.ts`.
  - Camadas: `utils`/`system-library` → `infra` → `analysis` → `diagnostics`/`project` → `providers`/`services` → `extension.ts`.
- **`src/system-library.ts` → `src/system-library/index.ts`** — aggregator agora é o `index.ts` da pasta. Todos os call sites continuam usando `from "../system-library"` (resolver do TypeScript).
- **`src/util/` → `src/utils/`** — pluralizado para alinhar com convenção de `microsoft/vscode-python` e `golang/vscode-go`.
- **`src/system-library/_builder.ts` → `src/system-library/symbol-helpers.ts`** — nome mais descritivo, sem prefixo `_` e sem colisão visual com `src/project/builder.ts`.

### Adicionado (infraestrutura compartilhada)

- **`src/infra/constants.ts`** (novo) — constantes canônicas:
  - `LANGUAGE_IDS` (`d7basic`, `data7project`) — typos viram erro de compilação em vez de dead code.
  - `COMMAND_IDS` — todos os 15 IDs `data7.*` contribuídos pelo manifesto. Importado por `extension.ts`.
  - `CONFIG_NAMESPACE` (`"data7"`), `DIAGNOSTIC_SOURCE` (`"data7"`), `PROJECT_CONFIG_FILENAME` (`"data7.json"`).
  - Aplicado em `extension.ts`, `infra/configuration.ts`, `services/diagnostic-service.ts`, `services/activation-service.ts`, `services/build-service.ts`, `services/dependency-service.ts`, `services/sync-watcher.ts`, `services/project-service.ts`, `providers/hover-provider.ts`, `project/builder.ts`, `project/decompiler.ts`.

### Adicionado (fences arquiteturais)

- **7 blocos `no-restricted-imports` em `eslint.config.mjs`** — um por camada (`infra-isolation`, `analysis-isolation`, `diagnostics-isolation`, `project-isolation`, `services-isolation`, `providers-isolation`, `system-library-isolation`) + override `data7/document-link-provider-exception` para a única dependência provider→service permitida. As fences refletem 1-para-1 o `# Architectural enforcement` em `.cursor/rules/governance.mdc`.

### Mudado (regras e documentação)

- **`.cursor/rules/`** — `project_structure`, `architecture`, `governance`, `vscode_extension`, `data7_domain` reescritos para refletir a nova estrutura por camadas (capability-oriented com fatia de domain folder), com nova ordem do grafo de dependências e fences explícitas por pasta.
- **`project_context.md`** — §§ 5.1–5.13 totalmente reorganizadas para mapear 1-para-1 a nova estrutura por pasta; §1 (objetivos) e §4.4 (diagnostic codes) inalterados.

### Removido

- **`src/test/setup.ts` e `src/test/helpers.ts`** — shims retrocompatíveis sem mais consumidores (nenhum teste importava de `../setup` ou `../helpers`). Testes usam diretamente `_setup/global-hooks` e os módulos focados em `_helpers/`.
- **`getRepoBasPath()` em `src/extension.ts`** — re-export morto kept "for backwards compatibility with tests" que nenhum teste mais consumia. Callers usam `RepositoryService.getRepoBasPath()` diretamente.

### Corrigido

- **Typo `docs/Documentação Data7/Envinronment/`** renomeado para `Environment/` para casar com a convenção de namespace usada no resto do repositório.

### Adicionado

- **Expansão da System Library a partir das planilhas `docs/Documentação Data7/`** — cada subpasta com `instrução.txt` (ou o legado `instrução.cpp`) virou definição completa em `src/system-library/`:
  - `Data7.Report` (novo) com cadeia `Form → TForm → … → TObject` e overrides marcados `isUnsupported` (`Caption`, `Color`, `OnGesture`, `Observers`, …).
  - `XML.IXMLNodeList` (novo) — interface IUnknown + propriedade indexada `Nodes`.
  - `XML.IXMLNode` / `XML.TXMLDocument` repopulados com acessores `_Get*`/`_Set*` e overloads de `Create`.
  - `SQL.Command` repopulado com ~140 membros TFDQuery/TFDDataSet/TDataSet/TComponent, marcando os ~30 itens da planilha como `isUnsupported`. `SQL.Connection` ganhou `StartTransaction`, `Commit`, `Rollback`, `InTransaction`, `DefaultSchema`.
  - `System` namespace populado com funções RTL (`GetMem`, `Cos`, `Sqrt`, `Length`, `Pos`, `Copy`, `Move`, `BeginThread`, …), constantes (`Pi`, `MaxLongInt`, `varEmpty…varUString`) e aliases (`TDateTime`, `Longint`, `HRESULT`, `UTF8String`).
  - `TJSONObject` / `TJSONArray` ganharam `Create` (overload vazio), `PutDate`/`PutTime` (`isUnsupported`), `GetDate`/`GetTime`, `LoadFromFile`, `SaveToFile`.
  - `TObject` ganhou `Create`, `Destroy`, `BeforeDestruction`, `SafeCallException`, `GetInterface` (membros comuns referenciados como "herdados de TObject" em todas as planilhas).
  - `TForm` / `TCustomForm` completados com ~30 propriedades faltantes (`AlphaBlend`, `BorderIcons`, `Font`, `FormStyle`, `Position`, `Scaled`, `ShowInTaskBar`, `OnMouseWheel*`, `OnBeforeMonitorDpiChanged`, …).
  - `TControl` ganhou eventos de drag/dock/layout (`OnDockDrop`, `OnDragOver`, `OnEndDock`, `OnCanResize`, `OnContextPopup`, `OnAlignInsertBefore`, `OnShortCut`, `OnHelp`, `OnMouseActivate`, …).
  - `TComponent.VCLComObject` adicionado (estava ausente).
- **`src/system-library/symbol-helpers.ts`** (originalmente `_builder.ts`) — helpers compartilhados `buildClassSymbols`, `buildNamespaceSymbols`, `SYSTEM_RANGE`, `SYSTEM_URI`, `UNSUP_NOTE`. Elimina o boilerplate (`range: { ... }`, `fileUri: "system://library"`, `isShared: false`, `isPrivate: false`) em cada símbolo das classes descritas a partir das planilhas. Aplicado em `Data7/Report.ts`, `SQL/Command.ts`, `System/System.ts`.
- **`src/system-library/Globals/_event-types.ts`** — delegates VCL faltantes (`TDragDropEvent`, `TCanResizeEvent`, `TConstrainedResizeEvent`, `TContextPopupEvent`, `TMouseWheelEvent`, `TMouseWheelUpDownEvent`, `TAlignInsertBeforeEvent`, `TEndDragEvent`, `TUnDockEvent`, `TGetSiteInfoEvent`, `TMethod`, `TDragState`).
- **`src/system-library/SQL/_aliases.ts`** — tipos FireDAC referenciados como `type:` em propriedades de `SQL.Command` (`TFDDataSetEvent`, `TDataSetNotifyEvent`, `TFDAfterApplyUpdatesEvent`, `TFDErrorEvent`, `TFilterRecordEvent`, `TFilterOptions`, `TFDUpdateRecordTypes`, `TFDStoredActivationUsage`, `TRDBMS`, `TFDDataSet`).
- **`src/test/system-library/instrucao-coverage.test.ts`** (novo, +576 asserções) — varre cada `instrução.txt`/`.cpp` e confronta linha a linha com `SYSTEM_SYMBOLS`: membros `Sim` precisam ser resolvíveis pelo container ou cadeia de herança; membros exclusivamente `Não` precisam ter `isUnsupported: true`. Garante que a documentação canônica do ERP e o linter não divergem entre releases.
- **`src/test/system-library/new-containers.test.ts`** (novo, +27 testes) — cobertura pontual de `Data7.Report`, `XML.IXMLNodeList`, `SQL.Connection` (transações), `TJSONObject.PutDate/PutTime` (`isUnsupported`), constantes do namespace `System` e novos delegates SQL.
- **`SemanticTokensProvider`** — coloração baseada em significado (classe / namespace / método / propriedade / evento / variável). Combina símbolos do workspace + System Library; declarado em `package.json#contributes.semanticTokenScopes` para integrar com qualquer tema.
- **Source actions**:
  - `source.organizeImports` — ordena alfabeticamente + remove duplicatas dos `Imports`.
  - `source.fixAll.data7` — agrega todas as quick fixes correntes em um único `WorkspaceEdit`.
- **`contributes.walkthroughs`** — onboarding de 5 passos exibido após instalação (configurar Executor, abrir projeto, F5/Ctrl+Shift+B, IntelliSense, AGENTS.md).
- **`contributes.problemMatchers`** — `data7-build` parseia output do builder e popula o painel "Problems" com link clicável (arquivo:linha:coluna).
- **Trigger char `' '` no `CompletionProvider`** — sugestões automáticas após digitar `Imports `, listando todos os namespaces do SL + workspace.
- **Cache de regex em `isExcluded`** — `Map<pattern, RegExp>` reusado para todos os arquivos do workspace, ao invés de recompilar 1× por path.
- **Cache de regex no linter (`runAdvancedDiagnostics`)** — `wordRegex(name)` e `memberAccessRegexFor(name)` memoizam por chamada de lint.
- Novos testes: `signature-provider.test.ts`, `project-service.test.ts`, `semantic-tokens-provider.test.ts` + 3 testes de Source Actions. Total: **168 testes** (era 156).

### Mudado

- **`isExcluded()` agora é efetivamente consumido** pelo `WorkspaceSymbolIndexer.indexFile` / `scanDir` e pelo `DiagnosticService.refreshDiagnosticsNow`. Antes, a configuração `data7.exclude` era declarada mas ignorada (dead-code).
- **`DocumentSymbolProvider`** — `range` agora cobre o corpo completo de Class/Sub/Function (até `End Xxx`) enquanto `selectionRange` aponta apenas o nome do símbolo. Habilita breadcrumbs/sticky-scroll a indicarem corretamente "estou em qual classe?".
- **`CodeActionKind` declarados** — `providedCodeActionKinds` agora inclui `SourceOrganizeImports` e `SourceFixAll.data7` para que VS Code execute corretamente o filtro de `context.only` em "Source Action…".
- **README.md** ganhou badges Marketplace/CI/License + seção "Suprimir diagnósticos com comentários" documentando `data7:disable-line` e `data7:disable-next-line`.
- **`galleryBanner.color`** definido como `#0a2540` (tema escuro) para destaque no Marketplace.

### Deprecado

- **`data7.autoFormatOnSave`** — substituído por `editor.formatOnSave` nativo do VS Code (`"[d7basic]": { "editor.formatOnSave": true }`). A configuração continua funcional mas exibe `deprecationMessage` no Settings UI.

### Refatorado (padronização de testes)

- **Reorganização do suite de testes** (`src/test/`):
  - Novas subpastas dedicadas: `_setup/` (vscode-mock + global-hooks), `_helpers/` (mock-doc, temp-dir, assertions, fixtures), `providers/` (12 arquivos um-por-provider), `services/` (activation-service, docs-generator, docs-service), `util/` (6 arquivos um-por-util).
  - **27 arquivos** de teste (era 15), **138 testes** (era 65) — todos passando.
  - Todos os testes agora usam `describe()` blocks com nomes padronizados no formato `Subject - verb when condition`.
- **Splits funcionais**:
  - `diagnostics.test.ts` (341 linhas, 3 áreas) → `linter.test.ts` + `symbol-indexer.test.ts` + `system-library.test.ts`.
  - `diagnostics-new.test.ts` consolidado dentro de `linter.test.ts` com agrupamento por código de diagnóstico.
  - `hover-definition.test.ts` → `providers/hover-provider.test.ts` + `providers/definition-provider.test.ts`.
  - `references-rename.test.ts` → `providers/reference-provider.test.ts` + `providers/rename-provider.test.ts`.
  - `providers.test.ts` (4 providers misturados) → `document-symbol-provider.test.ts`, `workspace-symbol-provider.test.ts`, `folding-provider.test.ts`, `document-link-provider.test.ts`.
  - `autocomplete.test.ts` (testava o `TypeResolver`) renomeado para `type-resolver.test.ts`.
  - `builder.test.ts` "god test" (70 linhas em 1 teste) quebrado em 3 testes focados: build, decompile e round-trip.
- **Helpers reutilizáveis**:
  - `createMockDoc(uri, text, opts)` em `_helpers/mock-doc.ts` — fábrica única de `TextDocument` com opções `register`/`languageId`. Acompanha `pos(line, col)`, `refContext(includeDecl)`, `foldingContext()` para construir parâmetros de provider sem `as any`.
  - `withTempDir(callback)` em `_helpers/temp-dir.ts` — substitui o boilerplate `mkdtempSync` + `try/finally` em `builder`, `dependency-scanner`, `activation-service`, `docs-service`.
  - `expectDiagnostic`, `expectNoDiagnostic`, `expectEdit`, `expectMembers` em `_helpers/assertions.ts` — mensagens de falha autoexplicativas.
  - `loadFixture(name)` em `_helpers/fixtures.ts` — pronto para receber `.bas` longos em `_fixtures/` no futuro.
- **Hooks globais**: `_setup/global-hooks.ts` aplica `beforeEach` único (reset indexer + mock workspace) — elimina o bloco duplicado em 8 arquivos.
- **Tipagem mais forte**: `as any` reduzido de **84 para 15 ocorrências** (-82%) ao introduzir `pos()`, `refContext()`, `foldingContext()` e tipos `Partial<...>` em `_helpers/mock-doc.ts`.
- **Coverage faltante coberto**: novos testes para `regex-helpers`, `format-helpers`, `primitive-types`, `code-stripper`, `path-safety`, `symbol-kind` (utils), `configuration` (`resolveDiagnosticSeverity` + `isExcluded`), `diagnostic-codes` (`DiagnosticCodes` + `setDiagnosticPayload`). Total: **+8 arquivos de teste, +47 testes novos** para módulos antes sem cobertura direta.

### Adicionado (DX de testes)

- Script `npm run test:watch` (compile + node --test --watch) para iteração local rápida.
- Script `npm run test:coverage` (node --test --experimental-test-coverage) reportando coverage por arquivo.
- Script `npm run audit:system-library` e `npm run docs:system-library` para chamar os scripts auxiliares via npm.
- Workflow `.github/workflows/ci.yml` passou a rodar com `--experimental-test-coverage` em todo PR.

### Corrigido

- `isExcluded()` em `configuration.ts` agora ancora o regex (^…$) — single `*` não cruza barras, evitando falsos positivos de exclusão para padrões como `**/out/*` aplicados a paths profundos.
- **`TypeResolver.findMember` / `getAllMembersForType` agora aceitam containers qualificados como `Forms.Grid`**. Antes, membros declarados com `containerName: "Forms.Grid"` só eram visíveis quando o usuário referenciava o tipo via `Forms.Grid`, não via `Grid`. Isso quebrava silenciosamente a resolução de membros em `Grid` (ColCount, Cells, etc.). O matcher agora aceita `containerName === typeName`, `containerName === shortName` ou `containerName endsWith ".shortName"`.

### Adicionado

- **`Grid.PopupMenu`** declarado em `Forms/Grid.ts` com flag `isUnsupported: true` — o linter emite `unsupported-member` orientando a migrar para alternativas suportadas pelo ERP.

### Refatorado (consolidação)

- **Centralizado `TypeResolver.findMember(type, member, indexer)`** como ponto único de resolução de membros (suporta nomes qualificados + walk completo de `inheritsFrom` workspace+SL). HoverProvider, SignatureHelpProvider, DefinitionProvider e DiagnosticsLinter deixaram de manter cópias próprias (~150 linhas eliminadas).
- **`IMPORTS_REGEX` canônico** em `src/dependency-scanner.ts` (3 variantes: simples, global, anchored). Migrados 6 sites com pequenas variações que antes não aceitavam imports qualificados (`mod_a.mod_b`) — corrige bug latente onde alguns lugares ignoravam essas importações.
- **Novos utilitários extraídos para `src/util/`**: `regex-helpers.ts` (`escapeForRegex`), `symbol-kind.ts` (`mapSystemKindToVsCode`), `format-helpers.ts` (`formatParameter` / `formatParameterList`), `primitive-types.ts` (`PRIMITIVE_TYPES`), `code-stripper.ts` (`stripCommentsAndStrings`).
- **`setDiagnosticPayload(diag, payload)`** em `diagnostic-codes.ts` substitui o cast `(diag as Diagnostic & { data?: unknown }).data = payload` em 7 sites.
- **`createStatusBarButton` helper** em `ActivationService` elimina boilerplate inline dos 3 status-bar items.
- **`src/test/helpers.ts`** com `createMockDoc` / `noopToken` / `resetMockWorkspace` consolida 5 versões duplicadas espalhadas pelos testes (~80 linhas de boilerplate eliminadas).
- **Dead code removido**: `DiagnosticsLinter.checkHasClassMember` (substituído por chamadas diretas a `TypeResolver.findMember`), wrapper `D7BasicCompletionProvider.getAllMembersForType` (testes migrados para `TypeResolver`).
- **`require('fs')` inline** substituído por `import * as fs from 'fs'` em `reference-provider.ts` e `rename-provider.ts`.
- **PRIMITIVE_TYPES** compartilhado entre `diagnostics.ts` e `scripts/audit-system-library.js` — antes cada um mantinha um set divergente.

### Corrigido

- **README**: tabela de comandos refletia atalho `Ctrl+Shift+B` para "Compilar/Rebuildar Projeto" — agora o keybinding real existe em `package.json#contributes.keybindings`.
- **`RenameProvider`** não rewriter mais identificadores que aparecem dentro de string literais `"..."` (incluindo `""` escapado). Antes, renomear `Greeter` substituía também o texto dentro de `"Greeter foi salvo"`.
- **`ReferenceProvider`** com `includeDeclaration: false` agora filtra de fato a localização da declaração (antes retornava tudo).
- **Quick-fix `module-not-declared`** com título "Instalar e declarar módulo \"X\"" descrevendo corretamente o comando `data7.installModule` que dispara (antes dizia apenas "Adicionar ao data7.json").

### Adicionado

- **Providers LSP** novos:
  - `DocumentSymbolProvider` — habilita Outline, breadcrumbs, sticky-scroll e `Ctrl+Shift+O`.
  - `WorkspaceSymbolProvider` — habilita `Ctrl+T` para "Go to Symbol in Workspace".
  - `FoldingRangeProvider` — folding semântico de `Namespace`/`Class`/`Sub`/`Function`/`If`/`For`/`While`.
  - `ReferenceProvider` — habilita `Shift+F12` (Find All References).
  - `RenameProvider` — habilita `F2` para renomear classes e métodos no workspace.
  - `DocumentLinkProvider` — torna `Imports MyModule` clicável (Ctrl+click abre o módulo).
- **Diagnósticos** novos:
  - `duplicate-import` — diretiva `Imports` repetida no mesmo arquivo.
  - `private-member-access` — acesso a membro `Private` fora do escopo do tipo.
  - `event-signature-mismatch` — handler atribuído a um `OnXxx` com assinatura incompatível com o delegate.
- **Quick Fixes** novos para os códigos:
  - `unused-import` → "Remover Imports não usado".
  - `module-not-declared` → "Adicionar ao `data7.json#dependencies`".
  - `module-not-found` → "Instalar módulo a partir do repositório".
  - `unknown-member` → "Você quis dizer X?" (sugestão por similaridade).
- **Comandos** novos:
  - `data7.generateSystemLibraryDocs` — gera Markdown da System Library no workspace.
  - `data7.injectSystemLibraryDocs` — injeta bloco delimitado em `AGENTS.md`.
  - `data7.showOutput` — abre o canal "Data7" no painel Output.
- **Status bar** dinâmico com nome do projeto + contagem de dependências + erros do workspace.
- **Configurações** novas: `data7.exclude`, `data7.diagnosticSeverity`, `data7.autoFormatOnSave`.
- **System Library**: 11 eventos novos em `TForm` (`OnActivate`, `OnDeactivate`, `OnCreate`, `OnDestroy`, `OnShow`, `OnHide`, `OnResize`, `OnPaint`, `OnClose`, `OnCloseQuery`, `OnAfterMonitorDpiChanged`); todos os eventos `OnXxx` tipados como delegates concretos em vez de `Variant`.
- **Scripts**: `scripts/audit-system-library.js` (lint da própria System Library) e `scripts/generate-system-library-docs.js` (geração CLI).
- **Testes**: subiu de 14 para >50 testes cobrindo todos os providers e novos diagnósticos.
- **CI**: workflow GitHub Actions rodando compile/test/audit em PRs.

### Mudado

- **Arquitetura**: `extension.ts` reduzido de 274 para ~150 linhas — orquestração de ativação movida para `services/activation-service.ts`.
- **Documentação gerada**: tabelas de eventos separadas das tabelas de propriedades, cadeia de herança com cross-links exibida em cada classe, snapshot hash determinístico no rodapé para versionamento.

### Corrigido

- Auditoria limpou: tipos `Variant` em eventos, descrições stub, `inheritsFrom` órfão.

## [0.1.0] - 2026-05-20

### Adicionado

- Lançamento inicial com providers básicos: `CompletionItemProvider`, `HoverProvider`, `DefinitionProvider`, `SignatureHelpProvider`, `DocumentFormattingEditProvider`, `CodeActionProvider`.
- Diagnósticos canônicos: `missing-import`, `unused-import`, `unknown-member`, `module-not-found`, `module-not-declared`.
- Builder, Decompiler, sincronização bidirecional `.bas` ↔ `.7Proj`.
- Repositório privado de módulos compartilhados com path-safety.
- System Library inicial cobrindo `Forms`, `Globals`, `Drawing`, `Collections`, `IO`, `SQL`, `Environment`, `System`, `System.Classes`, `XML`, `Data7`.
