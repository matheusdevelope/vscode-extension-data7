# Contexto e Arquitetura do Projeto: vscode-extension-data7

Este documento consolida o contexto de negócio, regras conceituais, objetivos, arquitetura de software e definições técnicas da extensão VS Code para a linguagem/plataforma do ERP Data7. Ele serve como a **única fonte de verdade conceitual e arquitetural** da extensão para guiar desenvolvimentos futuros.

---

## 1. Objetivos do Projeto

O objetivo principal desta extensão é fornecer suporte completo de desenvolvimento (Language Server Features) no VS Code para desenvolvedores do ERP Data7, editando arquivos de script `.bas` (Data7 Basic) e manipulando arquivos de projeto `.7proj` (formatados em XML).

A extensão provê recursos avançados de:

- Indexação e busca de símbolos no Workspace.
- Autocompetação de código inteligente (IntelliSense) com auto-importação.
- Validação estática de regras de importação e escopos (Advanced Diagnostics/Linter).
- Navegação de código (Hover previews, Go to Definition, Signature Help).
- Formatação de código.
- Compilação e empacotamento (`Builder`) e descompilação (`Decompiler`) de projetos ERP.

---

## 2. Definições Técnicas e Conceituais

### 2.1. Arquivos `.bas` e `.7proj`

- **`.bas`**: Arquivos de script contendo a codificação em Data7 Basic. Podem declarar namespaces, classes, estruturas, métodos, variáveis locais e atributos globais.
- **`.7proj`**: Arquivo XML de projeto estruturado que contém metadados, formulários e todos os scripts `.bas` agregados do projeto do ERP.

### 2.7. Açúcares sintáticos transpilados

A linguagem nativa do ERP é limitada (`For` clássico apenas, sem string interpolation, sem condicional inline). A extensão adiciona **açúcares opcionais expandidos pelo `Builder` antes da serialização do `.7proj`**. O `.bas` em `src/` permanece com o açúcar; só o XML final recebe a forma nativa.

A arquitetura distingue dois tipos de transformação em `src/project/transpiler.ts`:

- **`InlineTransform`**: rewriters intra-linha (token-level) que rodam ANTES do registry. Use para açúcares que aparecem em qualquer coluna (ex.: string interpolation).
- **`SugarRule`**: rules linha-por-linha que produzem expansões multi-linha. Use para açúcares "header" como `For Each ... In ... Next`.

Açúcares atualmente suportados:

#### `For Each <var>[ As <Tipo>] In <expr> ... Next` (enumerable)

- Para qualificar como iterável, o tipo de `<expr>` deve expor `Count As Integer` + um acessor inteiro (precedência `Items` > `Item` > `Strings` > `Objects`).
- A expansão emite `For __idxN = 0 To <src>.Count - 1` + um `Dim` sintético do elemento, materializando `__srcN` se `<expr>` for complexa.
- Detector pure em `src/analysis/enumerable-detector.ts`, consumido pelo transpilador E pelo linter.

#### `For Each <var>[ As Integer] In <start>..<end>` (range)

- Açúcar para `For <var> = <start> To <end>`. Resolução puramente sintática (não consulta tipos).
- Registry-ordered ANTES do generic For Each para evitar que `0..N` seja interpretado como tipo enumerável.
- O `As Integer` explícito é aceito para documentação, mas o `For` nativo não tem binding tipado.

#### `$"Hello {name}, idade {age}"` (string interpolation)

- Expandido para `"Hello " & (name) & ", idade " & (age)` usando `&` (operador Basic canônico).
- Chaves escapadas via `{{` / `}}`. Strings regulares `"..."` e comentários `'...` são preservados verbatim.
- Diagnóstico `invalid-interpolation` (warning) quando malformado: `unterminated-string`, `unterminated-brace`, ou `empty-expression`.
- Parser puro em `src/utils/interpolation.ts` — única fonte de verdade compartilhada por `transpiler.ts` (build) e `diagnostics.ts` (linter live).

#### `cond ? a : b` (ternary em RHS de assignment)

- Expandido para o bloco multi-linha `If cond Then / target = a / Else / target = b / End If` — o Data7 não tem função condicional inline (`IIf`/`Choose`/`Switch` ausentes na System Library), então a forma idiomática nativa é o bloco. Confirmado nos exemplos oficiais de `docs/Documentação Data7/Global/TJSONObject/TJSONObject.Has.html`.
- **Apenas no RHS de assignment** é suportado: `Dim x [As T] = c ? a : b`, `x = c ? a : b`, `obj.prop = c ? a : b`. Qualquer outro contexto (`Print c ? a : b`, `Return c ? a : b`, dentro de chamada de método) emite `ternary-context-unsupported` (warning) e a linha permanece intacta — esses casos requerem refator manual porque a expansão multi-linha mudaria a estrutura visível do código.
- O `Dim`, quando presente, é emitido **separadamente** do bloco `If/Then/Else` para que ambas as branches consigam atribuir ao mesmo target. Comentários inline trailing são reatachados ao `If` header.
- Parser puro em `src/utils/ternary.ts` (`findTopLevelTernary`) — respeita strings `"..."`, interpoladas `$"..."`, comentários `'...` e profundidade de parênteses; encontra a `?`/`:` outermost correta mesmo em ternários aninhados.

#### Invariante de round-trip

Como o passo de transpilação é destrutivo, `build → decompile → build` continua válido **apenas para fontes nativas**. Arquivos sugarados, ao serem build → decompilados, retornam em forma nativa expandida — comportamento intencional documentado em `data7_domain.mdc`.

### 2.2. Módulos e Namespaces

- Um arquivo `.bas` é agrupado sob uma declaração `Namespace nome_do_namespace`.
- Módulos compartilhados são marcados com a tag `@Module` nos comentários e são importados no repositório exclusivo. Eles não contêm a tag `@Module-Imported`.

### 2.3. Principal.bas

- Arquivo de entrada principal de cada projeto. Declarações e tipos definidos na unidade principal (`Principal.bas`) são injetados no contexto global da aplicação e são visíveis em todos os arquivos sem a necessidade de comandos `Imports`.

### 2.4. Repositório Privado de Módulos Compartilhados

- Pasta de armazenamento exclusiva e isolada da extensão (normalmente sob a área de `globalStoragePath` da extensão ou fallback `~/.data7_extension/repository`).
- Guarda os arquivos `.bas` copiados/descompilados de módulos compartilhados que são referenciados em múltiplos projetos.
- O `RepositoryService` gerencia a importação de módulos externos para dentro desta pasta particular. Toda escrita passa por `safeJoinInside` (`src/utils/path-safety.ts`) para impedir path-traversal a partir de nomes de módulo controlados por XML.

### 2.6. Pasta `data7_modules/`

- Subpasta opcional dentro do workspace do projeto (irmã de `src/`) onde a extensão copia as cópias locais dos módulos compartilhados que foram declarados como dependência em `data7.json#dependencies`.
- Sincronizada automaticamente por `DependencyScanner.syncDependencies` (lendo do repositório privado) e empacotada pelo `Builder` dentro de uma `<Pasta>` virtual com o mesmo nome no `.7Proj` resultante.
- Adicionada ao `.gitignore` do projeto por `ProjectService.protectProjectFolder` — não deve ser versionada.

### 2.5. Biblioteca Nativa do Sistema (`System Library`)

- Conjunto de classes, funções e namespaces nativos do próprio ERP (ex: `Forms.Form`, `Drawing.TCanvas`, `SQL.Connection`, `Collections.StringList`, `Data7.Report`).
- Estruturada fisicamente na pasta `src/system-library/` dividida por pastas de namespaces correspondentes.
- Classes globais nativas como `THTTP`, `TJSONObject` e `TJSONArray` pertencem à raiz global (`Globals/`) e não exigem comandos de `Imports`.
- A pasta `src/system-library/types.ts` define a lista estrita de containerNames permitidos (`SystemContainer`) para mitigar erros tipográficos na biblioteca. Quando uma nova classe/alias é adicionada, primeiro estenda essa união e só depois adicione o símbolo.
- O módulo `src/system-library/symbol-helpers.ts` fornece os helpers `buildClassSymbols`, `buildNamespaceSymbols`, as constantes `SYSTEM_RANGE`/`SYSTEM_URI` e a `UNSUP_NOTE`. Arquivos novos do system-library devem usar esses helpers em vez de repetir o boilerplate de `range`, `fileUri`, `isShared`, `isPrivate`, etc.
- Itens marcados `Suportado=Não` nas planilhas de levantamento da pasta `docs/Documentação Data7/` viram `isUnsupported: true` na entrada `SystemSymbolInfo`. O linter emite o diagnóstico `unsupported-member` quando esses membros forem referenciados em `.bas` (ver § 4.4). O override de membros herdados marcados `Não` (ex.: `Caption`/`Color`/`OnGesture` em `Data7.Report`) é feito declarando o mesmo nome no container filho com `isUnsupported: true` — o mesmo padrão usado em `Forms/Grid.ts`.

#### Fontes de levantamento (`docs/Documentação Data7/`)

- Cada subpasta corresponde a um namespace e pode conter **HTML** (documentação textual extraída do article-base do ERP) e/ou um arquivo `instrução.txt` (também aceito como `instrução.cpp` por legado).
- O `instrução.txt` lista, em formato CSV, todo o autocomplete oficial de uma classe ou namespace no formato `Categoria,Nome,Tipo / Assinatura[,Valor],Suportado`. Quando presente, é a fonte canônica para popular a definição em `src/system-library/`.
- O teste `src/test/system-library/instrucao-coverage.test.ts` confronta cada linha da planilha com `SYSTEM_SYMBOLS` em CI: membros marcados `Sim` devem ser resolvíveis pelo container alvo ou pela cadeia de herança; membros exclusivamente marcados `Não` devem ter alguma definição com `isUnsupported: true`.

---

## 3. Paradigmas de Desenvolvimento e Princípios de Código

A extensão segue estritamente o paradigma de **Orientação a Objetos (OOP)** e adere aos princípios **SOLID** e **DRY** (Don't Repeat Yourself):

- **Single Responsibility (SRP)**: Cada classe tem uma responsabilidade focada e bem definida (ex: `DiagnosticsLinter` para validação, `SymbolParser` para análise de sintaxe de símbolos, `CodeFormatter` para formatação de código).
- **DRY**: Funções utilitárias redundantes de comentários, caminhos ou conversões foram consolidadas como métodos estáticos ou de instância em classes auxiliares especializadas (ex: `DependencyScanner.stripComments`).
- **TypeScript Strict Safety**: Utilização de tipos estritos, uniões e interfaces para validação de fluxos e prevenção de erros em tempo de compilação. O `tsconfig.json` ativa tanto `strict: true` quanto `noUncheckedIndexedAccess: true` — todo acesso indexado (`arr[i]`, `record[k]`, capture group `match[N]`) é tipado `T | undefined` e exige guarda (`??` default, early-return, ou destructuring + `assert.ok` em testes). Convenções detalhadas vivem em `typescript.mdc`.

---

## 4. Regras de Negócio e Lógica dos Componentes

### 4.1. Resolução de Escopo e Linter (Advanced Diagnostics)

O linter realiza validação semântica em duas etapas:

1. **Regra de Visibilidade**:
   - Resolução local: Contexto do Método -> Classe -> Namespace Ativo.
   - Resolução global: Tipos primitivos (`String`, `Integer`, etc.), classes globais (`THTTP`, `TObject`, `TJSONObject`, `TJSONArray`) e declarações presentes na unidade `Principal.bas`.
   - Se o tipo referenciado não pertencer ao escopo local ou global, ele **deve** pertencer a um módulo cujo namespace foi explicitamente importado através de um comando `Imports NomeDoNamespace` no cabeçalho do arquivo, ou ser invocado via notação qualificada direta (`ModuloNamespace.TipoClasse`).
   - Caso contrário, o linter reportará um erro `missing-import` de falta de importação.
2. **Auto-Importação no Autocomplete**:
   - Ao acionar autocomplete (Ctrl + Espaço) sobre um tipo ausente do arquivo, o provedor exibe os namespaces correspondentes. Ao selecionar um item, a extensão insere automaticamente o comando `Imports Namespace` no topo do arquivo `.bas`.
3. **Ações Rápidas (Quick Fixes)**:
   - Se o linter reportar um erro `missing-import`, a extensão sugere correções rápidas (Code Actions) para incluir a declaração `Imports` necessária.
   - O linter anexa um payload estruturado (`MissingImportPayload`) em `Diagnostic.data` com o namespace a importar; o `code-actions.ts` lê o payload em vez de fazer regex sobre a mensagem localizada.

### 4.4. Códigos canônicos de diagnóstico (`src/diagnostics/diagnostic-codes.ts`)

Reservados em `kebab-case` e usados como valor de `Diagnostic.code`. Adições novas devem ser documentadas aqui antes de qualquer uso no código. Cada código tem um payload tipado opcional (`MissingImportPayload`, `UnusedImportPayload`, `ModuleNotFoundPayload`, `ModuleNotDeclaredPayload`, `UnknownMemberPayload`) anexado a `Diagnostic.data` para que o `D7BasicCodeActionProvider` aplique correções sem reparsear a mensagem.

- `missing-import` — um tipo referenciado pertence a um namespace ausente da seção `Imports` do arquivo.
- `unused-import` — uma diretiva `Imports` declarada no cabeçalho não é referenciada pelo restante do arquivo.
- `duplicate-import` — a mesma diretiva `Imports` foi declarada mais de uma vez no cabeçalho.
- `module-not-found` — um módulo referenciado (por `Imports` ou prefixo `mod_*`) não existe nem no workspace, nem no repositório privado, nem na System Library.
- `module-not-declared` — um módulo existe no repositório privado mas não foi adicionado a `data7.json#dependencies`.
- `unknown-member` — um acesso `obj.X` ou `Me.X` referencia um membro inexistente no tipo resolvido. O payload pode incluir até 3 sugestões "Você quis dizer…?" calculadas por Levenshtein.
- `private-member-access` — um acesso `obj.X` referencia um membro `Private` declarado fora da classe atual.
- `event-signature-mismatch` — um handler atribuído a `obj.OnXxx` tem aridade incompatível com a do delegate declarado pela propriedade (ex.: `TNotifyEvent` espera 1 parâmetro).
- `unsupported-member` — o membro acessado em `obj.X` ou `Me.X` está declarado na System Library, mas marcado com `isUnsupported=true` porque o compilador Data7 não traduz aquele membro do autocomplete original (TMS/DevExpress). Emite _Warning_ (não _Error_) para que o usuário possa avaliar a substituição sem bloquear o build local.
- `not-enumerable` — o operando à direita de `In` em `For Each <var>[ As <Tipo>] In <expr>` resolve para um tipo que não expõe a propriedade `Count` mais um acessor inteiro. O `Builder` deixaria a linha intacta no `.7proj` (gerando erro em runtime do executor), por isso emitimos _Warning_ no editor com o payload `NotEnumerablePayload` (`{ code, typeName }`).
- `unknown-suppression-code` — uma diretiva `' data7:disable-line <code>` ou `disable-next-line <code>` referencia um código que não existe em `DiagnosticCodes` (typo ou código removido). Emite _Warning_ com payload `UnknownSuppressionCodePayload` (`{ code, suppressedCode }`) — a diretiva permanece no arquivo, mas o usuário descobre que está silenciando nada.
- `invalid-interpolation` — uma string interpolada `$"..."` está malformada (`unterminated-string` / `unterminated-brace` / `empty-expression`). O parser para na primeira falha, preserva o resto da linha, e emite _Warning_ com payload `InvalidInterpolationPayload` (`{ code, reason }`). O Builder seguirá a mesma análise via `src/utils/interpolation.ts` — diagnóstico no editor e falha no build são sempre coerentes.
- `ternary-context-unsupported` — um ternário `cond ? a : b` foi usado fora do RHS de um assignment (em `Print`, `Return`, argumento de chamada, etc.). O transpilador só consegue expandir o ternário para o bloco multi-linha `If/Then/Else/End If` quando o target da atribuição é claro; outros contextos exigiriam restruturação do código circundante. Emite _Warning_ com payload `TernaryContextUnsupportedPayload` (`{ code, context }`).

Cada código tem um Quick Fix correspondente no `D7BasicCodeActionProvider`:

- `missing-import` → "Importar X"
- `unused-import` / `duplicate-import` → "Remover Imports X"
- `module-not-declared` / `module-not-found` → "Instalar módulo X…" (dispara `data7.installModule`)
- `unknown-member` → até 3 ações "Você quis dizer Y?" que substituem o nome no lugar.
- `unsupported-member` → sem Quick Fix (substituição depende de contexto), apenas o warning visível no diagnostic.
- `not-enumerable` → sem Quick Fix (a substituição depende da forma de iteração que o usuário pretende — converter para `For i = 0 To ... - 1` ou mudar o tipo do operando). Apenas o warning é exibido.
- `unknown-suppression-code` → sem Quick Fix (o usuário pode ter digitado errado ou copiado de um release antigo). Apenas o warning é exibido.
- `invalid-interpolation` → sem Quick Fix (depende de qual chave/escape o usuário esqueceu). Apenas o warning é exibido.
- `ternary-context-unsupported` → sem Quick Fix (a refatoração depende da semântica do código circundante — converter para `If/Then/Else` separado, materializar em variável, etc.). Apenas o warning é exibido.

### 4.2. Compilação (`Builder`)

- Executa a concatenação e validação do projeto `.bas` empacotando-o no arquivo XML final `.7proj`.
- Remove comentários excedentes, realiza escape de caracteres especiais XML (`&`, `<`, `>`, etc.) e gera GUIDs exclusivos de projeto.
- Antes do strip/minify, aplica `SugarTranspiler.transpile` em cada `.bas` (Principal, módulos de `src/` e dependências em `data7_modules/`), expandindo a sintaxe `For Each ... In ... Next` em `For __idx = 0 To <src>.Count - 1` + um `Dim` sintético do elemento. Tipos inválidos (sem `Count`+indexador) ficam intactos no XML final e geram um `logger.warn` rastreável no OutputChannel `Data7`. O round-trip Builder ↔ Decompiler permanece idempotente para fontes nativas; para fontes sugaradas o `Decompiler` devolve a forma expandida.

### 4.3. Descompilação (`Decompiler`)

- Realiza o inverso do Builder: lê o XML de um arquivo `.7proj` e gera a árvore de arquivos individuais `.bas` na estrutura física do projeto.

---

## 5. Estrutura do Diretório de Código (Src)

> A organização interna do `src/` segue **capability-oriented folders** (Pattern B, mirroring `microsoft/vscode-python`) com uma fatia de **domain folder** para o tooling de projeto (Pattern C, mirroring `microsoft/vscode-pull-request-github`). Cada pasta abaixo representa uma camada no grafo de dependências (do leaf para o topo: `util`/`system-library` → `infra` → `analysis` → `diagnostics`/`project` → `providers`/`services` → `extension`). As fences são enforced em `eslint.config.mjs` (`no-restricted-imports` por folder) e documentadas em `.cursor/rules/governance.mdc` § "Architectural enforcement".

### 5.1. Entry point (`src/extension.ts` + `src/commands.ts`)

- `src/extension.ts`: orquestrador da ativação. `activate()` chama, nesta ordem, `initLogger(context)`, `RepositoryService.initialize(context)`, `registerWorkspaceListeners(context)`, `registerCommands(context)`, `registerLanguageProviders(context)`, e os bootstrap de `DiagnosticService` / `ActivationService` / `SyncWatcher`. Não exporta lógica de negócio.
- `src/commands.ts`: declara `registerCommands(context)` — uma única tabela `Array<[CommandId, handler]>` mapeada para `vscode.commands.registerCommand`. Consome `COMMAND_IDS` de `infra/constants` para manter typos fora do escopo do compilador.
- `src/providers/registration.ts`: declara `registerLanguageProviders(context)` — todos os 13 `vscode.languages.register*Provider` em um único arquivo, único lugar do projeto que importa todos os providers ao mesmo tempo (exceção arquitetural explícita em `eslint.config.mjs`).

### 5.2. Infraestrutura compartilhada (`src/infra/`)

Leaf da árvore de dependências. Não importa nada de outras pastas de `src/`.

- `src/infra/logger.ts`: `OutputChannel` único `"Data7"` consumido por toda a extensão. Substitui qualquer `console.*` em código de produção.
- `src/infra/configuration.ts`: Snapshot tipado das chaves `data7.*` declaradas em `package.json#contributes.configuration`. Exporta também `resolveDiagnosticSeverity` (que aplica overrides do usuário) e `isExcluded` (que respeita `data7.exclude`).
- `src/infra/constants.ts`: Constantes canônicas compartilhadas — `CONFIG_NAMESPACE` (`"data7"`), `DIAGNOSTIC_SOURCE` (`"data7"`), `PROJECT_CONFIG_FILENAME` (`"data7.json"`), `LANGUAGE_IDS` (`d7basic`, `data7project`) e `COMMAND_IDS` (todos os 15 IDs `data7.*` contribuídos pelo `package.json`). Importadas como `import { LANGUAGE_IDS, COMMAND_IDS } from "../infra/constants"` em todos os call sites — typos em IDs falham na compilação em vez de virarem dead code.
- `src/infra/extension-paths.ts`: Single source of truth para paths persistentes da extensão. Expõe `getRepoBasPath()` consumido tanto por `services/repository-service` (dono da escrita) quanto por `analysis/module-resolver` (consumidor read-only). `initializeExtensionPaths(context)` é chamado em `extension.ts#activate`. Fallback para `~/.data7_extension/repository` quando rodado fora do extension host (testes).

### 5.3. Análise estática (`src/analysis/`)

Módulos puros (sem registro de provider) consumidos por providers, diagnostics e services.

- `src/analysis/symbol-indexer.ts`: Indexador de arquivos `.bas` em segundo plano para o Workspace e parser de símbolos (`SymbolParser`, `WorkspaceSymbolIndexer`). Expõe `getAllFileSymbols()` para providers de busca workspace-wide (Reference, Rename).
- `src/analysis/dependency-scanner.ts`: Analisador estático de dependências de Imports (`DependencyScanner`). Dono canônico de `stripComments`.
- `src/analysis/type-resolver.ts`: Resolução compartilhada de tipo de variável, classe qualificada e membros herdados (`TypeResolver`). Único módulo onde providers e linter consultam o catálogo de símbolos.
- `src/analysis/module-resolver.ts`: `resolveNamespaceFile(indexer, namespace)` — resolve `Imports MyModule` → caminho do `.bas` que declara o namespace. Procura primeiro no workspace (via indexer), depois no repositório privado (via `infra/extension-paths`). Consumido por `providers/document-link-provider`.

### 5.4. Linter e diagnósticos (`src/diagnostics/`)

- `src/diagnostics/diagnostics.ts`: Motor de validação de escopos e sintaxe (`DiagnosticsLinter`). Emite todos os 9 códigos de diagnóstico, com payloads estruturados para auto-fix.
- `src/diagnostics/diagnostic-codes.ts`: Tabela canônica dos `DiagnosticCode` (9 códigos) e seus 6 payloads tipados (`MissingImportPayload`, `UnusedImportPayload`, `ModuleNotFoundPayload`, `ModuleNotDeclaredPayload`, `UnknownMemberPayload`, `UnsupportedMemberPayload`).

### 5.5. Tooling de projeto (`src/project/`)

- `src/project/builder.ts` e `src/project/decompiler.ts`: Compilador e descompilador de projetos.
- `src/project/project-metadata.ts`: Tipos compartilhados (`ProjectMetadata`, `VirtualFolder`, `ModuleMetadata`) consumidos por `builder` e `decompiler`.

### 5.6. Language Server Providers (`src/providers/` — 13 arquivos)

- `src/providers/completion-provider.ts`: Autocompletação (`D7BasicCompletionProvider`). Reexporta `TypeResolver` apenas para compatibilidade retroativa.
- `src/providers/hover-provider.ts`: Visualização rápida de assinaturas e preview de declarações (`D7BasicHoverProvider`).
- `src/providers/signature-provider.ts`: Dicas de parâmetros de chamadas de métodos (`D7BasicSignatureHelpProvider`).
- `src/providers/definition-provider.ts`: Navegação Go to Definition (`D7BasicDefinitionProvider`).
- `src/providers/document-symbol-provider.ts`: Hierarquia Namespace > Class > Method usada pelo Outline, breadcrumbs e sticky-scroll (`D7BasicDocumentSymbolProvider`).
- `src/providers/workspace-symbol-provider.ts`: Busca de símbolos por workspace para `Ctrl+T` (`D7BasicWorkspaceSymbolProvider`).
- `src/providers/folding-provider.ts`: Folding semântico de `Namespace`/`Class`/`Sub`/`Function`/`If`/`For`/`While`/`Try`/`#Region`/`Imports` (`D7BasicFoldingRangeProvider`).
- `src/providers/reference-provider.ts`: Find All References com varredura whole-word em todo o workspace (`D7BasicReferenceProvider`).
- `src/providers/rename-provider.ts`: Rename Symbol limitado a classes, structures, namespaces, methods, delegates e Declare Sub/Function (`D7BasicRenameProvider`).
- `src/providers/document-link-provider.ts`: Torna `Imports MyModule` clicável (`Ctrl+click`) para abrir o arquivo do módulo (`D7BasicDocumentLinkProvider`). Delega 100% da resolução para `analysis/module-resolver.ts` — não importa `services/`.
- `src/providers/registration.ts`: `registerLanguageProviders(context)` agrupando os 13 `vscode.languages.register*Provider`. Único arquivo da pasta autorizado pelo override `data7/providers-registration-exception` a importar todos os providers ao mesmo tempo.
- `src/providers/formatter.ts`: Embelezamento de código (`D7BasicFormattingProvider`, `CodeFormatter`).
- `src/providers/code-actions.ts`: Quick Fixes para todos os 9 códigos de diagnóstico + Source actions (`source.organizeImports` e `source.fixAll.data7`) (`D7BasicCodeActionProvider`). Importa apenas os tipos canônicos de `src/diagnostics/diagnostic-codes.ts`.
- `src/providers/semantic-tokens-provider.ts`: Coloração semântica (classe/namespace/método/propriedade/evento/variável) baseada nos símbolos resolvidos (`D7BasicSemanticTokensProvider` + `D7BasicSemanticTokensLegend`).

### 5.7. Camada de Serviços (`src/services/`)

- `activation-service.ts` — orquestração de ativação: bootstrap de workspace, status-bar dinâmico (nome do projeto + contagem de deps + erros), detecção de `.7Proj` ao abrir, `resolveProjectFilePath`, `openParentFolder`.
- `project-service.ts` — resolução do projeto ativo, abertura/criação de projetos, validação da conexão de banco.
- `build-service.ts` — comandos de build/run/openInDevStudio. Todo `child_process` usa `spawn` com array de argumentos (sem shell-injection).
- `dependency-service.ts` — detecção, sync e instalação de dependências do `data7.json`.
- `repository-service.ts` — gestão do repositório privado de módulos com path-safety e Workspace Trust.
- `sync-watcher.ts` — bidirectional sync `.bas` ↔ `.7Proj` com debounce.
- `diagnostic-service.ts` — registro do `DiagnosticCollection`, debounce de refresh e cache por workspace.
- `docs-service.ts` — integração VS Code: comandos `data7.generateSystemLibraryDocs` (escreve arquivos em pasta escolhida) e `data7.injectSystemLibraryDocs` (insere bloco delimitado em `AGENTS.md` idempotentemente). O motor puro (`DocsGenerator`) vive em `src/system-library/docs-generator.ts` (ver §5.8).

### 5.8. System Library (`src/system-library/`)

- `src/system-library/`: Coleção dos símbolos nativos do ERP Data7 organizados por subpastas (`Forms/`, `Globals/`, `IO/`, `Net/`, `SQL/`, `Drawing/`, `Collections/`, `Environment/`, `System/`, `System.Classes/`, `XML/`, `Primitives/`, `Data7/`) e validados com tipagem rígida.
- `src/system-library/index.ts`: Agregador de `SYSTEM_SYMBOLS` + lookup indexes em O(1) (`lookupSystemByName`, `lookupSystemByContainer`, `lookupSystemClassByName`, `lookupSystemNamespaceOrClassByName`). É o arquivo resolvido por `import { ... } from "../system-library"` em todos os call sites.
- `src/system-library/types.ts`: Define `SystemContainer` — união estrita de todos os containerNames válidos.
- `src/system-library/symbol-helpers.ts`: Helpers compartilhados (`buildClassSymbols`, `buildNamespaceSymbols`, `SYSTEM_RANGE`, `SYSTEM_URI`, `UNSUP_NOTE`) que eliminam o boilerplate dos arquivos `*.ts` que descrevem uma classe inteira a partir das planilhas `instrução.txt`.
- `src/system-library/docs-generator.ts`: `DocsGenerator` — gerador puro (sem `vscode`) de Markdown por namespace da System Library, com hash determinístico de snapshot, cross-links entre tipos e cadeia de herança expandida em cada classe. Consumido por `services/docs-service.ts` (wrapper VS Code) e por `scripts/generate-system-library-docs.js` (CLI/CI). Vive aqui (não em `services/`) porque é uma função pura sobre `SYSTEM_SYMBOLS` — pertence ao domínio da System Library.
- Aliases auxiliares: `Globals/_event-types.ts` (delegates VCL — `TDragDropEvent`, `TCanResizeEvent`, `TMouseWheelEvent`, …) e `SQL/_aliases.ts` (tipos FireDAC — `TFDDataSetEvent`, `TFilterOptions`, `TDataSetNotifyEvent`, …) declaram os tipos referenciados como `type:` em propriedades das classes principais.

### 5.9. Utilitários (`src/utils/`)

Leaf da árvore de dependências. Cada helper é uma função pura sem registro VS Code. Os módulos `symbol-kind.ts` e `format-helpers.ts` importam **type-only** de `src/analysis/symbol-indexer` (`SymbolInfo`/`ParameterInfo`); nenhum outro util importa de pastas internas.

- `src/utils/xml-helpers.ts`: Único módulo que instancia `fast-xml-parser`. Exporta `parseProjectXml`, `escapeXml`, `decodeHtmlEntities` e helpers de narrowing.
- `src/utils/guid.ts`: Wrapper sobre `crypto.randomUUID()` no formato GUID do Data7.
- `src/utils/path-safety.ts`: Validação anti path-traversal (`safeJoinInside`, `isSafeSegment`).
- `src/utils/debounce.ts`: Helpers `debounce` e `debounceKeyed` consumidos pelo `DiagnosticService` e pelo `SyncWatcher`.
- `src/utils/regex-helpers.ts`: `escapeForRegex(s)` — escape de literais para `RegExp`, consumido pelos providers de Reference/Rename/DocumentLink.
- `src/utils/symbol-kind.ts`: `mapSystemKindToVsCode(s)` — mapeamento canônico `SymbolInfo.kind` → `vscode.SymbolKind`, reusado por DocumentSymbol e WorkspaceSymbol providers.
- `src/utils/format-helpers.ts`: `formatParameter(p)` / `formatParameterList(params)` — renderização canônica de assinaturas de parâmetro em Data7 Basic, reusada por hover-provider e docs-generator.
- `src/utils/primitive-types.ts`: `PRIMITIVE_TYPES` — set canônico de nomes de tipos primitivos/globais usado pelo linter e pelo audit script.
- `src/utils/code-stripper.ts`: `stripCommentsAndStrings(text)` — apaga comentários **e** conteúdo de strings literais preservando colunas; usado pelo RenameProvider para não rewriter identificadores dentro de `"..."`.
- `src/utils/suppression-comments.ts`: Extração de comentários `' data7:disable-line` consumidos pelo linter para suprimir diagnósticos linha-a-linha.

### 5.10. Testes (`src/test/`)

Suíte de testes automatizados unitários e de integração da extensão (**771 asserções em 106 suites distribuídas por 42 arquivos**, organizados em subpastas funcionais que espelham `src/`).

**Estrutura:**

- `_setup/` — `vscode-mock.ts` (override de `require('vscode')`) e `global-hooks.ts` (`beforeEach` único reseta indexer + mock workspace).
- `_helpers/` — `mock-doc.ts` (`createMockDoc`, `pos`, `refContext`, `foldingContext`, `registerOpenDocument`, `resetMockWorkspace`, `noopToken`), `temp-dir.ts` (`withTempDir` async + sync), `assertions.ts` (`expectDiagnostic`, `expectNoDiagnostic`, `expectEdit`, `expectMembers`), `fixtures.ts` (`loadFixture`).
- `providers/` — 1 arquivo por provider (`completion`, `hover`, `definition`, `signature`, `code-actions`, `formatter`, `document-symbol`, `workspace-symbol`, `folding`, `document-link`, `reference`, `rename`, `semantic-tokens-provider`).
- `services/` — 1 arquivo por service exercitado (`activation-service`, `docs-generator`, `docs-service`, `project-service`).
- `system-library/` — `instrucao-coverage.test.ts` (varre cada `instrução.txt` em `docs/Documentação Data7/`) e `new-containers.test.ts`.
- `utils/` — 1 arquivo por helper (`regex-helpers`, `format-helpers`, `primitive-types`, `code-stripper`, `path-safety`, `symbol-kind`, `suppression-comments`).

**Convenções:**

- Cada arquivo abre com `import './_setup/global-hooks'` para registrar o `beforeEach` global.
- Testes agrupados por `describe()` por feature (`Subject - sub-feature`) e nomeados no formato `verb expected when condition`.
- Padronizado para `import { strict as assert } from 'node:assert'`.
- Mock de `TextDocument` exclusivamente via `createMockDoc` (DRY).
- Tempdirs via `withTempDir(async (dir) => ...)` (cleanup garantido).
- `as any` minimizado para < 20 ocorrências via helpers `pos`, `refContext`, `foldingContext`.

### 5.11. Scripts auxiliares (`scripts/`)

- `audit-system-library.js` — auditoria que falha com exit code ≠ 0 quando encontra: descrições stub, eventos `OnXxx: Variant`, `inheritsFrom` órfão, ou tipos desconhecidos.
- `generate-system-library-docs.js` — wrapper CLI sobre `DocsGenerator` para regerar `docs/system-library/` no repositório (usado pelo CI).
- `generate-examples-index.js` — regera o índice de `docs/exemple/README.md` a partir dos headers `@example`/`@demonstrates`/`@diagnostics` de cada `.bas`. Modo `--check` falha com exit code 1 quando o README está fora de sincronia (usado pelo CI). Acessível via `npm run docs:examples` (escrita) e `npm run docs:examples:check` (CI).

### 5.12. Documentação versionada (`docs/`)

- `docs/system-library/` — `README.md` + 1 `.md` por namespace, gerados automaticamente. Cada arquivo carrega o mesmo `Snapshot <hash>` no rodapé para detecção de drift.
- `docs/levantamentos/` — CSVs brutos do autocomplete original do Data7 (TMS/DevExpress/VCL) usados como entrada para popular a System Library. Cada arquivo (ex.: `grid.txt`) lista `Categoria,Nome,Tipo,Suportado` e é a fonte de verdade quando precisamos repopular a definição de uma classe. Mantidos versionados para que mudanças no compilador apareçam como diffs revisáveis.
- `docs/Documentação Data7/` — pasta com a documentação HTML original do ERP organizada por namespace/classe (`Collections/StringList`, `Data7/Report`, `Global/THttp`, `Net/TFTP`, `SQL/Command`, `XML/IXMLNode`, …). Algumas subpastas trazem também um `instrução.txt` (CSV canônico de autocomplete + Suportado, descrito em § 2.5) que serve de fonte para popular a System Library e é verificado em CI por `instrucao-coverage.test.ts`.
- `docs/exemple/` — exemplos canônicos `.bas` (e mini-projetos) usados como referência humana **e** como fixtures de teste. Layout por feature: `sugar/<sugar-name>/` (For Each, etc.), `diagnostics/<código>/` (1 pasta por `DiagnosticCode`), `builder/<cenário>/`. Cada `.bas` abre com um header padronizado (`' @example`, `' @demonstrates`, `' @diagnostics`, e opcionalmente `' @transpiled-to`, `' @requires`) cujo contrato vive em `docs/exemple/README.md`. Carregados pelos testes via `loadExample("sugar/for-each/01-...bas")` para evitar drift entre documentação e cobertura.

### 5.13. Hygiene e CI (raiz)

- `README.md` — descrição completa para usuários do Marketplace.
- `CHANGELOG.md` — versionamento Keep-a-Changelog.
- `LICENSE` — MIT.
- `.vscodeignore` — exclui `src/`, `.cursor/`, `docs/`, `scripts/`, `node_modules/`, mapas TS, etc. do pacote `.vsix`.
- `.github/workflows/ci.yml` — pipeline GitHub Actions: install → compile → test → audit → generate docs em todos os PRs e push para `main`/`master`.

Para rodar todo o pipeline (compile + lint + format + test + audit + verificação de exemplos) localmente, basta:

```bash
npm run verify
```

Para iterar mais rápido durante o desenvolvimento, use os scripts individuais:

```bash
npm run compile        # tsc -p ./
npm run lint           # ESLint (inclui fences arquiteturais)
npm run format:check   # Prettier --check
npm run test           # compile + node --test out/test/**/*.test.js
node scripts/audit-system-library.js
node scripts/generate-system-library-docs.js   # regera docs/system-library/
node scripts/generate-examples-index.js        # regera docs/exemple/README.md
```
