# Changelog

Todas as mudanças notáveis a este projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado
- **Language Server `@data7/lsp` (Fase 3 / LSP-001):** novo pacote com servidor stdio (`vscode-languageserver`), `AnalysisHost` sobre a API do LSP, sync incremental de documentos e `publishDiagnostics`. A extensão ganha `LanguageServerService` (`vscode-languageclient`) atrás da flag `features.diagnostics.useLanguageServer` (default `false` — caminho legado inalterado). RFC em `docs/rfcs/LSP-001-language-server.md`.
- **`AnalysisHost` (Fase 2 do motor de análise):** fronteira headless em `analysis/analysis-host.ts`. Documentos abertos, pastas do workspace, filesystem e log deixam de ser lidos ad hoc de `vscode.workspace` / `node:fs` no indexador, `LanguageProcessor`, `AnalysisCache` e `DependencyScanner`. A extensão instala `createVscodeAnalysisHost`; MCP/CLI/testes usam `createNodeAnalysisHost` (com `setOpenDocuments` no lugar de mutar `textDocuments`).

### Alterado
- **Motor de análise — Fase 1 do plano em `REFACTOR-ANALYSIS-ENGINE.md`:** os modelos de invalidação e agendamento foram reescritos para eliminar diagnósticos obsoletos e o custo por tecla. Principais mudanças:
  - **Change set acumulado por arquivo:** o delta de cada arquivo (`FileChangeSet`) se acumula entre ciclos de lint e só é fechado por `takeChangeSet`, em vez de refletir apenas a última tecla. Editar uma assinatura pública e continuar digitando não cancela mais a propagação no save; falhas de propagação devolvem o delta com `restoreChangeSet`.
  - **Invalidação granular de membros:** `findMemberCache`, `allMembersForTypeCache`, `ownMembersForClassCache` e `inheritedMembersForClassCache` viraram `MemberCache`, que rastreia o arquivo declarante de cada entrada. Edição de corpo invalida só o arquivo editado; a limpeza total ficou reservada a mudanças de API/namespace.
  - **Grafo de dependências correto e fingerprint O(1):** `WorkspaceDependencyGraph` passa a suportar múltiplos declarantes por namespace (`declarersByNamespace`) e expõe `getTransitiveDependents`. A revisão de `Principal.bas` usada no fingerprint de lint é memoizada, tirando o custo O(arquivos) do caminho de check.
  - **Agendador funcional:** `CheckScheduler` ganhou driver de idle com fatias de ~15 ms, fila de prioridade em 6 níveis (`active`, `visible`, `open`, `dependent`, `transitive`, `background`), limite de capacidade com despejo do nível mais baixo, cancelamento e reenfileiramento do trabalho abortado.
  - **Cancelamento cooperativo real:** o token chega até o linter — `warmLintTypeResolutionIndexes`, `buildExpressionTypeMap` (a cada 64 nós) e as passagens de validação verificam cancelamento e abortam cedo. A supressão de lint live durante o save passou de janela de tempo para versão de documento.
  - **Snapshot imutável:** `FileSnapshot` é somente leitura; resultados de bind/check são publicados atomicamente em snapshots derivados, com guarda de versão e hash, em vez de mutar o snapshot em uso.
  - **Caminho da tecla sem trabalho pesado:** `AnalysisProgram.update` é debounceado por documento (50 ms) e `LanguageProcessor.getOrParse` decide cache hit por `version` (quando disponível) ou hash de conteúdo, sem comparar strings inteiras.
  - **`unused-code` incremental:** os parses da análise de alcançabilidade são memoizados em `ReachabilityParseCache`, a lista de `.bas`/`.d7b` do workspace é cacheada, os módulos vêm do índice em vez do disco e o refresh é serializado com recoalescência.
  - **Ciclo de vida de arquivos:** `closeDocument` (libera memória, mantém indexado) e `deleteFile` (remove do índice) são operações distintas; `renameFile` é atômico; o watcher cobre `.bas` e `.d7b`; salvar um arquivo sem alteração real não força reparse.
  - **Resiliência:** falha na indexação inicial não deixa mais o linter morto (`markWorkspaceIndexReady` roda em `finally`); mudanças em `data7.json` limpam os caches certos; `LanguageProcessor` só descarta a AST quando a configuração que afeta parsing muda.

### Adicionado
- **Comando `data7.linter.restartAnalysis`:** reinicia o motor de análise em ordem — limpa estado e Problems, zera caches, recria índice e republica diagnósticos — sem exigir recarregar a janela.

### Corrigido
- **Genéricos — template indexado depois do uso:** um arquivo que usa `TList<Integer>` e é indexado antes do arquivo que declara `Class TList<T>` ficava permanentemente sem as instanciações planas (`TList_Integer`), quebrando hover, completions e assinatura. O índice agora registra a revisão de templates com que cada arquivo foi expandido e reexpande os defasados na próxima leitura.
- **Diagnósticos vindos do worker sem Quick Fix:** `SerializedLintDiagnostic` passa a transportar `data`, `tags` e `relatedInformation`, então diagnósticos produzidos em worker mantêm o payload tipado que as Code Actions consomem.
- **Quick Fix `missing-mybase-new`:** `Sub New()` passa a ser inserido no **topo** da classe (logo após a linha `Class`), e não antes do `End Class` — assim convive com `Sub Free()` no fix-all sem colidir na mesma posição.
- **Fix-all / merge de edições:** inserts na mesma linha mas em colunas distintas (ex.: `Sub New` no col 0 e remoção de `Public` no campo seguinte) deixam de ser tratados como conflito — o merge usava comparação só por linha e descartava o construtor.
- **Linter / Problems stale após análise ou correção em massa:** limpa a coleção Problems e invalida caches de check/lint antes de republicar; o índice é atualizado durante o lint (sem reparse síncrono prévio de todo o projeto) e `.data7/analysis-cache.json` é regravado ao final. O batch atualiza o índice a cada escrita e reanalisa o conjunto ao terminar.
- **Propagação a dependentes (sem regressão de performance):** no save com mudança de API, só importers do grafo (e o projeto inteiro se o trigger for `Principal.bas`). Arquivos com Problems sem aresta `Imports` só entram no fan-out em `fixActiveFile` (force). Comandos da notificação usam `data7.linter.*`.
- **Linter — `missing-import` em `migracoes.migrar` (Principal):** namespace `migracoes` deixa de ser confundido com o campo privado homônimo em `ServicosCampos`; acesso qualificado a namespace não exige `Imports`.
- **Quick Fix `return-unrecommended` em `Return` multilinha (`+_`)**: o fix passa a substituir o span completo da expressão (não só a primeira linha) e a usar o texto-fonte original — evita orphanar continuações e remover `()`/`CHAR(13)` ao reconstruir via AST.
- **Linter — falsos positivos em projeto real (Conciliacao):** campo `grid As Grid` deixa de ser tratado como acesso estático a `Forms.Grid`; `migracoes.migrar` resolve o namespace (não o campo privado homônimo); `pesquisaPadrao.Pesquisa.Natureza` preserva o container qualificado; casts `Cliente(x)` / indexador `_arquivos(i)` / `Property Global` / `toString(",0.00")` / `TFTP.Get|Put|List` / `File.GetFiles(TStringList)` / `Campos` vs `modeloCampos.Campos` passam a alinhar com o compilador Data7.
- **Linter — Problems stale após correção:** o ajuste em massa passa a republicar (ou limpar) diagnósticos para cada arquivo analisado, inclusive quando o disco já está limpo; o watcher de `.bas` agenda refresh debounceado de arquivos com Problems publicados; `DiagnosticCollection` reutiliza a mesma Uri canônica no set/delete (evita órfãos por casing no Windows).
- **Quick Fix `call-parentheses-mismatch` em mismatch de aridade:** diagnósticos de assinatura/argumentos (`AddCustomHeader(umArg)` quando a assinatura exige dois) deixam de anexar payload de edição e o Quick Fix não oferece mais "Adicionar parenteses '()'", evitando reescrever `foo(arg)` em `foo()(arg)` no save / fix-all.
- **Uglify — `GetDefault().Printe` (função bare no namespace):** o tipo de retorno de funções de namespace sem receptor (`GetDefault() As Logger`) passa a alimentar o rename de `.Printe` / membros colidentes na cadeia.
- **Uglify — overloads `Last() As TItem` vs `Last(n) As TList`:** o índice guarda aridade→tipo de retorno e a cadeia `Fields.Last().Options` usa o overload de 0 args (`TField`), não o de lista.
- **Uglify — classes homônimas em namespaces diferentes (`mod_enum.TEnum` vs `mod_tenum.TEnum`):** o índice de tipos passa a chavear `namespace.tipo` e não mescla membros de classes com o mesmo nome simples em namespaces distintos — evita `_value As Integer` sobrescrever `_value As BaseEnum` e deixar `me._value.AsString` sem rename.
- **Uglify — `With Namespace.Fn()` (ex.: `With console.Block()` → `.Prop`):** namespaces entram no índice de tipos com membros top-level e tipo de retorno, para o `With` resolver `ObjectPrinter` e renomear `.Prop`/`.Close`/`.Text`.
- **Uglify — `Namespace.Member` (`console.Printe` / `console.AlwaysPrint`):** membros top-level do namespace passam a ser rastreados e renomeados nas chamadas/acessos qualificados; o `Print` global permanece intacto.
- **Uglify — nested class vs Property homônimo (`WinAPI.Window` → `z35`):** `Outer.Nested` passa a usar o mapa `nestedTypes` do tipo pai; renames de members só aplicam quando o receiver declara o membro (evita `Variant.SendKeys` herdar o rename de `Sub SendKeys`). Classes aninhadas entram no índice de tipos do pai para resolver `Outer.Nested.Method`.
- **Uglify — `Select Case` / `Case Type.Member()` e `Namespace.Type.GetOptions()`:** os `values` de cada `Case` passam a ser reescritos (antes só o discriminante e o body); `MemberAccess` `Namespace.Type` resolve o tipo do member para gate de colisão com System Library (ex.: `GetOptions`).
- **Uglify — `e.Touch()` no Principal após renomear `Sub Touch`:** `Dim` top-level (seeds do `Principal.bas`, fora de `Sub`/`Function`) passa a alimentar o mapa nome→tipo antes do rename, para que chamadas com receiver de tipo de usuário renomeiem membros que colidem com a System Library (`Touch`). Sem o bind, a declaração era uglificada e a chamada ficava `Touch` → erro do compilador Data7.
- **Prune — `_form.Show()` / receiver local com membro herdado:** `Using`/`Dim`/parâmetros passam a alimentar um mapa local nome→tipo; `receiver.Member` resolve o membro na cadeia `Inherits` (ex.: `TFormCard` → `TFormBase.Show`) mesmo quando só o namespace do tipo concreto está em `Imports`.
- **Prune — falso keep via cadeias globais (`Take`/`Data`/`Format`/`Item`):** `enqueueMembersFromPrecedingMemberType` e `enqueueMembersOnNamedType` só seguem predecessores/tipos **já vivos** (não mais todos os `Take`/`Data`/`Format` do projeto). `enqueueMemberOnTypeAndBases` só enfileira o tipo quando o membro existe nele. Evita manter `Ambient`/`mod_printer`/`mod_database` a partir de `BaseList.Copy` → `Take().Copy()`, `HttpResponseData` a partir de `navigator.Data.Open()`, `ImageFormat` a partir de `me.Format.Free()`, e `TData7Report` a partir de `Items.Item(i).Shortcut`, sem regredir `.Value.AsString` nem `Namespace.Type.GetOptions()`.
- **Prune — `Namespace.Type.SharedMember` e cadeias `.Value.AsString`:** `mod_ns.SomeType.GetOptions()` passa a resolver o membro no tipo pelo nome mesmo sem `Imports` do namespace do tipo; cadeias encadeadas continuam propagando pelo tipo de resultado do predecessor (`Value` → `TTValue` → `AsString`).
- **Prune — Principal globals mortos e vazamento via `.Free()`:** `Dim`/`Const`/classes do `Principal.bas` só entram no grafo quando referenciados por statements de entrada (não mais todo `Dim` no topo). `isCandidateInScope` trata o Principal como fonte de **globais top-level** apenas — membros de classes locais do Principal não são visíveis como callables não qualificados a partir de outros módulos (evitava que `.Free()` em `mod_logger` mantivesse `GlobalDeadClass`).
- **Builder — basename de módulo duplicado:** dois `.bas` com o mesmo nome em pastas diferentes (ex.: `src/mod_entry.2.bas` e `src/scenarios/mod_entry.2.bas`) colidiam na chave do `.7Proj`, sobrescrevendo o código (last-write-wins) e emitindo duas tags XML iguais. O build agora falha com erro explícito pedindo basenames únicos; namespaces parciais continuam com arquivos distintos (`mod_entry.1` / `mod_entry.2`).
- **Linter — `unknown-symbol` em Subs do mesmo Namespace (arquivo peer):** `findUnqualifiedCallable` passa a resolver callables declarados em outros arquivos do mesmo `Namespace` sem exigir `Imports` (paridade com variáveis/tipos e com o compilador Data7).
- **Prune — overloads, Imports de system library, Me/MyBase herdados e Overrides polimórficos:** sobrecargas que compartilham a mesma chave (`Log`/`IndexOf`) passam a ser analisadas em conjunto — tipos só referenciados em siblings (`FindDel`) e helpers de namespace (`ObjectAsString`, `LoggerLevelFromString`) permanecem vivos. `unusedImports` só remove `Imports` de namespaces do projeto mortos; `Imports Collections`/`IO` (e demais externos) são preservados. `Me.Member`/`MyBase.Member` percorrem a cadeia de `Inherits` (inclusive em outro namespace) para não podar helpers `Protected` da base (`BuildLogger` em `TTObject`). Quando um membro virtual fica vivo na base e a subclasse também está viva, os `Overrides` correspondentes são mantidos (ex.: `TransportConsole.Log` não pode sumir se `LogTransport.Write` chama `me.Log`).
- **Bootstrap — Extension Host congelado após indexar:** com `lintWorkspaceOnStartup: true`, o lint paralelo clonava o conteúdo de todos os `.bas` (ex.: `mod_data7_utils.bas` ~1.1 MB) para cada worker via `postMessage`, travando hover/providers. O snapshot dos workers deixa de incluir `content`; o lint de startup é adiado 5 s; workers têm timeout de 60 s com fallback sequencial.
- **Ativação / linter fora de projeto Data7:** o manifesto passa a usar `workspaceContains:data7.json` (em vez de `**/*.bas` / `**/*.7proj`) para bootstrap de projeto. Abrir um `.bas` ainda ativa o suporte básico de idioma (implícito via `onLanguage:d7basic`), mas indexação, linter live/workspace e refresh de dependências só rodam quando uma pasta do workspace tem `data7.json` na raiz — evita análise no monorepo da própria extensão e em workspaces com fixtures aninhadas.

### Adicionado
- **Navegação source map no `.7Proj`:** Hover e Go to Definition (`F12`) no idioma `data7project` usam `<projeto>.7Proj.map.json` para abrir a linha do `.bas` original e demanglear identificadores uglificados (`a0` → `Run`).
- **`build.optimization.sourceMap`:** o Builder emite `<projeto>.7Proj.map.json` (ao lado do `.7Proj` e em `.data7/build/`) com segmentos linha gerada→`.bas` original (0-based) compostos por transpile → prune → minify → uglify, e símbolos uglificados. Com `uglify.enabled`, também grava `<projeto>.uglify-map.json` (só `symbols`).
- **`prune.remove.localVariables`:** DCE intra-procedimento remove `Dim`/`Const` locais não usados cujo inicializador é ausente ou livre de efeito colateral. Corpos com `OpaqueStatement` são ignorados; binders de `Using`/`For`/`ForEach`/`Catch` não são removidos. Default `true` (como as demais flags `remove.*`); desligar com `localVariables: false`.
- **`build.optimization.uglify`:** renomeia agressivamente namespaces, tipos, membros e locais de usuário para identificadores curtos (`a`…`z`, `a0`…). Membros cujo nome colide com a System Library (ex.: `Touch`) **são renomeados na declaração** e nas chamadas cujo receiver resolve para um **tipo de usuário**; em receivers de tipo de sistema (`TControl.Touch`) o nome nativo é preservado. Blocos `With` propagam o tipo do alvo para `.Member` / `.Method()` (ex.: `.Close()`). Atribuições de retorno estilo VB (`IndexOf = …`, `Text = …`, `Name = …` em Get) acompanham o nome uglificado da rotina/propriedade. Locais/parâmetros (incl. `Delegate`) e `Declare … Lib` seguem as regras anteriores. `@data7:keep-name` / `@data7:external-api` / `Main`/`New`/`Free` permanecem.
- **Motor `analysis/declaration-reachability` + diagnóstico `unused-code`:** o fechamento Principal/Main/`@data7:keep*`/`alwaysInclude` vive em `packages/data7-core/src/analysis/declaration-reachability/` e é compartilhado pelo analyzer do linter. O VS Code emite hints com `DiagnosticTag.Unnecessary` (fade) para declarações não usadas no grafo do projeto (mesmas flags `build.optimization.prune.remove.*`), com Quick Fix de remoção e exemplos em `docs/example/diagnostics/unused-code/`. `Sub New`/`Sub Free` acompanham a classe viva. `unreachable-declaration` cobre fluxo morto (após `Return`/`Exit`/`Throw`/condicionais constantes). Os códigos legados `unused-declaration` e `dead-code` foram removidos.
- **`build.optimization.prune` (declaração-level):** o prune passa a remover, por flag, namespaces, classes, structures, enums, delegates, methods, declare methods, fields, properties, consts, variables de namespace e `Imports` não usados. Cada unidade é controlada em `prune.remove.*` (default `true` quando o bloco está ausente). Reachability a partir de `Principal`/`Main`, `@data7:keep*` e `alwaysInclude`; atribuições de evento (`Me.Handler`) e `Me`/`MyBase` mantêm membros referenciados. Namespaces parciais no mesmo nome são visíveis entre módulos sem `Imports`.
- **`minify.collapseWhitespace`:** compressão textual de whitespace fica opt-in (default `false`). Minify não remove declarações — isso é exclusivo do prune.
- **MCP — orientação para linguagem moderna:** `data7://idioms` agora abre com preamble de hierarquia de coleções (array-list > TTList > StringList), convenções antes de limitações, e novo prompt `data7_array_list_collection`. Documentação em `docs/linguagem-basic/` (§10/15–17, §0/§2 de convenções, Fase C8 de açúcares) e manual `docs/mcp/` atualizados. `data7_typed_recordlist` reframeado como fallback legado.
- **Testes — array-list + generics:** exemplos canônicos em `docs/example/sugar/array-list/` (primitivos, objetos, cadeia de 4 estágios, subclasse `Pessoas`), fixture compartilhada `ttlist-stub.bas`, helper `array-list-workspace.ts` (monomorfização como no builder), suite `array-list-generics.integration.test.ts` e bloco `array-list + generics integration` em `diagnostics.test.ts`. O `builder.test.ts` cobre build E2E dos exemplos 01 e 03 com `Map_OrdemServico`/`Reduce_String`.

### Alterado
- **Serializer — forma idiomática `As New`:** declarações `Dim`/`Const` (locais/topo) inicializadas com `New T(...)` do mesmo tipo (nome simples equivalente, ignorando qualificação/`casing`) passam a ser emitidas como `Dim x As New T(...)` em vez de `Dim x As T = New T(...)`. `Dim x As New T` (sem `()`) normaliza para `As New T()`. Tipos declarados distintos do construído (`Dim x As Base = New Derived()`) permanecem na forma explícita. **Fields de classe** continuam em `As T = New T(...)` — o compilador Data7 rejeita `As New` em campos.
- **Prune parcial em parse errors:** com `allowPartialParse`, módulos não-Principal que falham no parse mantêm o fonte original e o restante do projeto continua sendo podado; falha em `Principal` ainda aborta o prune.
- **Paridade unused-code ↔ prune:** teste garante que hits do linter são removidos pelo `pruneBuildModules` no mesmo fixture.

### Corrigido
- **Prune — Dim/Const de topo em Principal:** declarações `Dim`/`Const` no topo de `Principal.bas` passam a ser seeds do grafo (não só as refs do inicializador), evitando remover `Dim app As New TApp()` e deixar `app.Run()` órfão.
- **Prune — namespace-only com membros retidos:** quando `prune.remove` desliga remoção interna (`methods`/`classes`/… = `false`) mas mantém `namespaces: true`, o grafo passa a seguir referências de **todas** as declarações que ainda vão no `.7Proj` (não só as alcançáveis). Evita dropar namespaces usados só por métodos “mortos” que permanecem no output (ex.: `mod_card_grouper` ficava com 3 namespaces em vez da clausura completa).
- **Builder — pasta `Modules` duplicada no `.7Proj`:** no Windows, `src/Modules` e metadata `modules` (caixa diferente) eram tratados como pastas distintas porque o mapa de pastas virtuais era case-sensitive enquanto `fs.existsSync` é case-insensitive. O build agora normaliza caminhos de pastas virtuais de forma case-insensitive, colapsa duplicatas existentes e sincroniza o `nome` com a caixa do disco.
- **Linter — `TTList.Map` sem `<TOut>` explícito:** quando a lambda infere um tipo concreto (ex.: `Function(p As Product) As String`), o retorno da chamada passa a ser `TTList<String>` em vez do tipo do receptor (`TTList<Product>`), eliminando falso `type-mismatch` em atribuições encadeadas.
- **Linter — membros de classe no escopo global:** identificadores de campos, métodos e propriedades de instância usados sem qualificação no topo do arquivo (fora de `Sub`/`Function`) passam a emitir `unknown-symbol` (ex.: `PropertyDeExemplo` em `Principal.bas`), em vez de serem tratados como símbolos declarados apenas por existirem no índice do workspace.
- **Linter — `incomplete-property-body`:** declarações `Property Nome As Tipo` em uma única linha, sem bloco `Get`/`Set`/`End Property`, passam a emitir o diagnóstico `incomplete-property-body` (ex.: `Property Nome As String` em `Principal.bas`).
- **Linter — `TTList.Filter` em subclasses:** chamadas como `list.Filter(...)` em uma classe que herda de `TTList<T>` (ex.: `Pessoas` extends `TTList<Pessoa>`) passam a resolver o retorno como o tipo concreto do receptor (`Pessoas`) em vez de `TTList<Pessoa>`, eliminando o falso positivo `type-mismatch` em atribuições como `Dim newList As Pessoas = list.Filter(...)`.
- **Transpiler — lambdas materializadas em cadeias `Filter().Map()`:** parâmetros de delegate deixam de ser emitidos como o tipo genérico literal `T` quando o receptor da lista já é concreto (`TTList<Produto>`, `TTList_Produto`, ou subclasse de `TTList<T>`); a inferência funcional da lista passa a preceder o retorno genérico do catálogo AST.
- **Builder — `Map`/`Reduce` encadeados em listas intermediárias:** o build agora coleta requisições de métodos genéricos por receptor (`TTList_OrdemServico.Map_String`, etc.) a partir dos `.bas` do workspace e materializa os overloads correspondentes em `mod_tlist`, corrigindo erros como `Identificador não declarado "Map_String"` após `Filter().Map<OrdemServico>().Map<String>()`. Tipos definidos em outros namespaces passam a ser qualificados nos delegates/métodos gerados (`mod_exemplo_encadeamento.PecaMoto`, etc.).
- **Transpiler — `Filter`/`Map` em subclasses de `TTList`:** `Dim filtrada As Pessoas = lista.Filter(...)` passa a expandir em loop com `New Pessoas()` + `Push`, em vez de delegar ao `Filter` herdado de `TTList_Pessoa` (que retorna tipo incompatível no compilador Data7). Quando a lambda já está materializada, o resultado flat é copiado via `Push` para uma nova instância da subclasse.
- **Linter — `TTList.Last()` / `First()`:** chamadas sem argumentos passam a resolver o retorno como o tipo do elemento (`Produto` em `TTList<Produto>`), permitindo encadeamentos como `lista.Last().SetNome(...)`; a sobrecarga com limite (`Last(n)`) continua retornando a lista.
- **VSIX — linter de workspace:** o comando **Data7 Linter: Analisar Projeto** falhava com `Cannot find module '...\lint-worker.js'` porque o worker thread do lint paralelo não era empacotado no `.vsix`. O `package:prepare` agora gera `out/lint-worker.js` (bundle esbuild do `@data7/core`) e o `.vscodeignore` passa a incluí-lo no pacote.
- **Teste `SQL.Connection.RDBMS`:** `new-containers.test.ts` ainda esperava `kind: "method"` para `RDBMS`, mas a definição em `SQL/Connection.ts` ya havia sido atualizada para `kind: "property"`/`type: "TRDBMS"` (retorno tipado pelo enum, acessado sem parênteses). O teste foi separado do loop de métodos de transação e passa a validar `kind: "property"` e `type: "TRDBMS"`.
- **Testes de integração e unitários:** Corrigidas regressões nos testes causadas por `System.IOUtils` (desativando testes da lib que não existe, conforme instruído), por inferência de tipo string para `CStr`/`Char`/`Chr`, e ajustando checagens de instanciamento de classes de template genérico para inspecionar diretamente o indexador (evitando o fallback de resolução).
- **Code Actions — isPreferred:** Restaurada e corrigida a marcação `isPreferred = true` de Quick Fixes essenciais (como remoção de modificador público redundante, correção de retorno não recomendado, e primeira sugestão ortográfica) que haviam sido redefinidas incorretamente como `false`, restaurando o correto funcionamento do Fix All.

### Refatorado
- **`system-library/` — DSL semântica centralizada:** `symbol-helpers.ts` ganhou `defineEnum()` (unifica os três estilos legados de enum — `buildEnumVal()` solto, helpers locais como `ak()`/`bs()`, e literais manuais completos — em uma única chamada declarativa), `param()` (atalho para `ParameterInfo`), suporte a `variadicParameters`/`kind`/`indexed` em `MethodSpec`, e `buildGlobalFunctions()` para funções globais sem namespace. `buildClassSymbols` passa a aceitar `kind: "structure"` para records (`TPoint`, `TRect`). 34 arquivos de enum (`TAlign`, `TModalResult`, `TAnchorKind`, `TColor`, `TCursor`, etc.) foram migrados automaticamente para `defineEnum`; `FlatButton`, `TCustomButtonedEdit`, `TCustomEdit`, `TFont`, `TPoint`, `TRect`, `FontConfig`, `TBorderIcon` e `StringList` foram reescritos com `buildClassSymbols`/`param`. `Forms/Grid.ts` teve seus builders locais duplicados (`toProperty`/`toMethod`/`mapParams`/`UNSUP_NOTE`) removidos em favor dos helpers compartilhados, mantendo sua estrutura de tabelas (`properties`/`events`/`methods`). Todas as migrações foram validadas por comparação estrutural do `SYSTEM_SYMBOLS` resultante antes/depois (0 divergências em 3093 símbolos).
- **Correção de duplicidade em `index.ts`:** `TAlign`/`TAlignment` eram espalhados (`...spread`) duas vezes em `SYSTEM_SYMBOLS` (uma vez na seção "Forms — utility", outra na seção "Globals"); a segunda ocorrência foi removida.

### Adicionado
- **Editor de configurações da extensão:** comando `Data7: Configurações` (`data7.settings.open`) com painel webview para Executor, módulos compartilhados, features, açúcares, linter e fallbacks de execução. Persistência em `extension-settings.json` no armazenamento global (migração automática do antigo `settings.json`).
- **Template completo de `data7.json`:** criação de projeto e decompilação incluem `build.optimization` com `sourceMap`, `minify`, `prune` e `uglify`.
- **Sidebar Ações Rápidas agrupada:** seções Configuração, Projeto, Módulos, Qualidade e Ferramentas com acesso a todos os fluxos principais (incluindo decompor, prévia transpilada, MCP e log).
- **`build.optimization.prune` (Fase 1):** novo passe de poda por fechamento de dependências a partir de `Principal.bas`/`Main`. Remove namespaces não alcançados — inclusive dentro do mesmo arquivo com múltiplos namespaces — e exclui módulos inteiros (`src`, `data7_modules`, sugars virtuais) quando não restam namespaces vivos. Suporta `alwaysInclude`, `report` e diretivas `@data7:keep`/`@data7:entrypoint`/`@data7:external-api`.
- **Validação de referências circulares em Imports:** Novo diagnóstico `circular-import` (severidade Error) para detectar ciclos de importação entre namespaces, incluindo auto-importação ou imports transitivos (BFS), enquanto permite acessos qualificados livres de erro.

### Removido
- **`contributes.configuration` (`data7.*` no Settings UI):** use o editor interno da extensão (`data7.settings.open`).
- **`minify.removeUnused` e `minify.mergeNamespaces`:** substituídos pelo bloco `build.optimization.prune`; o passe antigo de remoção global de classes/métodos foi descontinuado.

### Alterado
- **Comandos da extensão:** títulos simplificados e agrupados por categoria na paleta (`Data7 Projeto`, `Data7 Módulos`, `Data7 Linter`, …). Removidos prefixos numéricos (`01 -`, `03 -`). Comandos exclusivos de contexto ocultos da paleta (selecionados no Gerenciador de Módulos, instalação em lote via quick fix, prévia na aba atual, voltar à pasta pai). Atalho de log: `Ctrl+Alt+Shift+O` (antes conflitava com Abrir Projeto).

### Corrigido
- **Ordenação de módulos no build:** o `Builder` passou a ordenar `<Modulos>` com análise AST de dependências de namespace (`Imports`, tipos qualificados e chamadas `mod_foo.Membro`), priorizando usos em declaração sobre `Imports` em ciclos. Corrige falhas do compilador nativo quando unidades como `mod_logger` eram referenciadas no topo do XML antes de serem declaradas.
- **Serialização do build (`.7proj`):** transpiler e prune usam `BUILD_SERIALIZE_OPTIONS` — remove `Public` (modificador padrão do compilador ERP) de declarações e força `()` apenas em nós `MethodInvocation` de Sub/Function (não em campos, propriedades ou acessos `MemberAccess` como `IsException`). `Imports <namespace>` permanece sem parênteses, inclusive dentro de métodos. Referências implícitas sem parênteses no fonte permanecem como estão até resolução de tipo no transpiler.
- **Bloco `With` — linter e IntelliSense:** `print .Text` dentro de `With` deixa de gerar falso `loose-value-statement` e passa a emitir `call-parentheses-mismatch` (warning + Quick Fix para `Print(.Text)`), reconhecendo chamadas de Sub sem parênteses com argumento relativo ao `With`. Autocomplete, hover e resolução de tipo passam a usar um índice de escopo `With` (incluindo aninhamento) para membros com ponto inicial (`.Text`, `.Add`).
- **`Forms.ProcessMessages` e namespaces da System Library:** identificadores de namespace nativo (ex. `Forms`) passam a ser resolvidos como tipo/namespace mesmo sem `Imports`; chamadas qualificadas sem parênteses como `Forms.ProcessMessages` emitem `call-parentheses-mismatch` em vez de `loose-value-statement`.
- **Quick Fix `call-parentheses-mismatch` em `print .Text`:** o `wrapRange` passa a cobrir `.Text` inteiro (não só o ponto), evitando transformar `print .Text` em `print(.)Text`.
- **Quick fixes de módulo:** corrigidos IDs legados (`data7.installModule` → `data7.modules.install`) na barra de status e nos code actions.
- **`build.optimization.prune` — fechamento transitivo em namespaces vivos:** ao marcar um namespace como alcançável, o prune agora varre todo o corpo do namespace (métodos, propriedades e inicializadores de campos) em busca de referências qualificadas. Corrige builds podados que excluíam `mod_logger` mesmo com `mod_console`/`console` vivo após materialização do sugar `logger-print` (`print` → `mod_logger.Printe`). Referências em `New mod_satellite.TClass(...)` também marcam `mod_satellite` como vivo.
- **`call-parentheses-mismatch` em membros de `Enum`:** entradas de `Public Enum` passam a ser indexadas como `enum-member` (constantes), não como métodos; `Case Options.PostgreSQL` deixa de acionar a regra de parênteses.
- **Indexação de `Enum` nativa:** declarações `Public Enum` usam `kind: "enum"` e seus valores `kind: "enum-member"` com `isConst: true`, em vez de serem modelados como classe `TEnum` + métodos. Validação de tipos (`unknown-type`) e resolução qualificada reconhecem `enum` como tipo nomeado.
- **Hover/go-to-definition com homônimos:** `findSymbolByName` prioriza símbolos declarados no arquivo ativo (e no namespace da linha) antes de resolver homônimos globais — ex.: `Options` em `mod_rdbms.bas` aponta para o `Enum` local em vez de `mod_logger.Options()`.
- **Cache de overloads em chamadas não qualificadas:**
- **Compatibilidade de tipos primitivos correlacionados:** `isTypeCompatible` trata `Char`/`String`/`WideChar`/`ShortString` como intercambiáveis e aceita promoção numérica entre `Integer`, `Long`, `Byte`, `Single`, `Double` e demais primitivos numéricos do manual Data7, além de `Unassigned` para `Variant` e tipos não primitivos não resolvidos.
- **Delegates homônimos e referências de método:** resolução contextual de delegates (`FindDel`, `ForEachDel`, etc.) e aceitação de referências de método como argumento delegate (ex.: `New PropsSize(me._handleOnChange, ...)`) quando a assinatura estrutural é compatível.
- **Enums distintos não são intercambiáveis:** tipos que herdam de `TEnum` só são compatíveis entre si quando pertencem ao mesmo enum; evita aceitar `TFileAccess` onde `TFileMode` é esperado fora do overload correto.
- **`Array()` variádico global:** a função nativa `Array` na System Library aceita qualquer aridade ≥ 1; o resolvedor de overloads respeita `variadicParameters`.
- **`SQL.Command.Field`:** retorno tipado como `SQL.TField` para evitar colisão com homônimos de pipeline.
- **`missing-mybase-new`:** classes com apenas métodos `Shared` e `Free`/`Dispose` ficam isentas da exigência de `MyBase.New()` quando não há construtor explícito.
- **Cadeia `Overrides`:** membros com `Overrides` também são tratados como substituíveis na validação de herança.
- **Arrays nativos e delegates:** chamadas no estilo VB `Events(i)` e `Events(i)(arg)` passam a ser tratadas como indexação/invocação de array nativo (não como chamada de delegate com índice inteiro). A propriedade `.Length` em campos `Dim arr(n) As T` deixa de gerar `unknown-member`. Delegates com assinatura estrutural compatível (ex.: `FindDelegate` → `FindDel`, `ForEachDelegate` → `ForEachDel`) são aceitos mesmo com nomes distintos, inclusive nos forwards `MyBase.*` de listas tipadas.
- **Resolução contextual de classes homônimas:** `findClassSymbol` e a cadeia de compatibilidade de tipos agora preferem a classe declarada no mesmo arquivo, no namespace ativo ou em módulos importados antes de homônimos de `core_modules`/System Library (ex.: `mod_enum.TEnum` vs `mod_tenum.TEnum`). Corrige `unknown-member` em `pValue.Value` e `type-mismatch` ao passar subclasses (`TEnum` → `BaseItem`/`BaseEnum`) quando o tipo base é esperado.
- **`findMember` — cache por identidade de classe:** o cache ambíguo por nome simples (`TEnum#Value`) foi removido; lookups passam a reutilizar apenas o cache por `classIdentityKey`, evitando que uma resolução inicial sem contexto “envenene” homônimos posteriores no mesmo arquivo.

### Refatoração e SOLIDificação do Parser de Linguagem (Kernel)
- **Modularização do Parser de Declarações:** Decomposição do arquivo monolítico `parser.ts` em parsers especializados, autocontidos e livres de dependências circulares sob `src/project/parser/declaration-parsers/`:
  - `imports-parser.ts`: Suporte completo a múltiplos imports separados por vírgula em uma única linha (ex. `Imports Forms, mod_winapi`).
  - `namespace-parser.ts`: Parser de declaração de namespaces.
  - `class-parser.ts`: Parser estruturado de classes e structures.
  - `method-parser.ts`: Parser de Sub, Function e DLL externs.
  - `property-parser.ts`: Parser de propriedades da classe.
  - `field-parser.ts`: Parser de campos de classes/structures (restringido para proibir múltiplas variáveis comma-separated em classes/structures).
  - `variable-parser.ts`: Parser de variáveis locais `Dim`.
  - `delegate-parser.ts`: Parser estruturado de delegates.
  - `enum-parser.ts`: Parser de enums nativos e açucarados.
  - `declare-parser.ts`: Parser especializado de imports DLL externos (`Private Declare (Sub|Function) ... Lib ... Alias ...`).
- **Desacoplamento e Modularização de Açúcares Sintáticos (Sugars):**
  - Desacoplamento do parser agregador de açúcares monolítico. Cada açúcar agora possui seu próprio parser plugin sob `src/project/sugars/plugins/<sugar-id>/parser.ts` (ternary, optional-chain, pipe, using, null-coalesce, etc.).
  - Configuração dinâmica de parsers de açúcares no `SugarEngine` a partir dos metadados expostos no registro do catálogo de açúcares.
  - Correção de precedência em parsers infixos de açúcares (ternary `?`, null-coalesce `??`, e pipe `|>`).
- **Correções do Lexer e Linter:**
  - Correção da regra de quebra de linha com caractere de continuação `_`: agora um `_` no final de um identificador (ex. `meu_identificador_`) não é tratado como quebra de linha. A quebra de linha só ocorre se o `_` for precedido por caractere não identificador (ex.: operadores como `+` ou espaços).
  - Remoção de suporte à palavra-chave obsoleta e não funcional `AddressOf`.
  - Atualização do linter de diagnósticos para suportar atribuição direta de event handlers sem `AddressOf` (ex. `OnClick = MeuHandler`) e evitar falso positivo de `call-parentheses-mismatch` nesses cenários.
  - Refatoração do walker de diagnósticos para executar uma pipeline de rules (`imports`, `members`, `types`, `control-flow`, `arrays` e `lifecycle`), mantendo `diagnostics.ts` como orquestrador de contexto e removendo os checkers privados duplicados.

### Arquitetura (Monorepo)
- **Refatoração para Monorepo:** O projeto foi convertido para uma estrutura de monorepo utilizando NPM Workspaces, isolando responsabilidades em pacotes independentes:
  - `@data7/core`: Kernel da linguagem contendo parser, linter, transpiler, CLI-agnostic analyzer e system library.
  - `@data7/cli`: Interface de linha de comando para uso standalone e em CIs.
  - `vscode-extension-data7`: Extensão do VS Code que consome o `@data7/core`.
- **Core sem dependencia runtime do VS Code:** `@data7/core` passou a usar o adapter puro `src/platform/vscode-api.ts` para `Uri`, `Range`, `Diagnostic`, configuracao e workspace. A extensao instala a API real do VS Code somente durante `activate`, enquanto MCP e CLI rodam sem `installVscodeShim` ou `require("vscode")`.
- **Novo Gerenciador de Dependências:** O tratamento de dependências foi desacoplado da flag legada `@Module`. Dependências (módulos de terceiros) agora são declaradas explicitamente em `data7.json` e baixadas sob demanda, sendo tratadas pelo construtor via injecao de `@Module-Imported`. Módulos locais decompilados do próprio projeto agora vivem nativamente em `src/`.
- **Desativação Temporária do Auto-scan:** O auto-scan de dependências e Quick Picks foram temporariamente suspensos (desativados) até uma nova modelagem que comporte projetos onde múltiplos namespaces são exportados por um único módulo.

### Adicionado
- **Motor de lint incremental:** `WorkspaceDependencyGraph` mantém o grafo reverso namespace → importadores para re-lintar apenas dependentes diretos após edição/save, com detecção de mudança de namespace em `updateFileContentFromParsed` para evitar loops de revalidação.
- **Cache semântico de lint:** `SemanticLintCache` armazena o resultado de `runAdvancedDiagnostics` por `(uri, fingerprint)` onde o fingerprint combina hash de conteúdo, revisão do arquivo e revisões dos módulos importados/`Principal.bas`; invalidação seletiva de `findMemberCache`/`allMembersForTypeCache` por arquivo em vez de limpar o workspace inteiro a cada keystroke.
- **Cache por declaração no walker:** `DeclarationLintCache` reutiliza diagnósticos do corpo de `Sub`/`Function`/`Property` quando o hash do corpo e o contexto de dependências (imports + `Principal.bas`) permanecem iguais, permitindo re-lint parcial ao editar outra região do mesmo arquivo sem re-percorrer métodos inalterados.
- **TypeResolver — caches de herança:** `ownMembersForClassCache` e `inheritedMembersForClassCache` no indexador, com `findMemberOnClassSymbol` reutilizando `getAllMembersForClassSymbol`; o walker filtra rules por `supportedNodeKinds` para reduzir dispatch em nós irrelevantes.
- **Cold-path do linter (prepasse e índices):** `LintUnitIndex` consolida em um único walk do AST o rastreamento de imports, declarações não usadas e arrays nativos; `LocalScopeIndex` pré-computa escopos locais por linha em um passe por método (eliminando `collectLocalDeclarations` O(linhas × AST)); `FileLineContextIndex` mapeia método/classe/propriedade por linha para lookup O(1); cache de tipos de identificador por `(linha, nome)`; `hasVariableInScope` evita resolução genérica redundante em `unknown-symbol`; no cache hit de `DeclarationLintCache`, o walker pula rules e sub-árvore do corpo; `validateDuplicateDeclarations` enumera rotinas sem walk completo da árvore; `pickCallableMember` resolve overloads de chamada sem inferir tipos de todos os argumentos quando há candidato único; `warmLintTypeResolutionIndexes` pré-aquece índices por arquivo; `findSymbolByName` deixa de remover arquivos do cache durante lookup (corrige invalidação acidental de `Principal.bas` durante lint).
- **Cache consolidado de resolução de tipos:** `lint-type-resolution-cache.ts` centraliza caches por `CompilationUnit` (MemberAccess, retorno de invocação, callables não qualificados, escopos locais, expressões) com invalidação por unidade AST em `LanguageProcessor.invalidate`, alterações de arquivo no indexador e dependentes do grafo de imports.
- **Lint cold paralelo:** `lint-workspace-runner.ts` expõe lotes async (`runWorkspaceLintInBatches`, `resolveLintBatchConcurrency` via `DATA7_LINT_CONCURRENCY`) e pool de worker threads (`runWorkspaceLintWithWorkerPool`, `DATA7_LINT_WORKERS`) com snapshot read-only do indexador (`exportLintSnapshot`/`loadLintSnapshot`) para varredura multi-core sem mutar o singleton do host.
- **Orquestração do linter na extensão:** `DiagnosticService` integra worker pool no comando/varredura de workspace (`lintWorkspace` / `lintWorkspaceOnStartup` / pré-execução F5); bloqueia lint live até `indexWorkspace` concluir; suprime refresh redundante após fix/save programático; coalesce propagação a dependentes; corrige cascata que re-lintava dependentes durante varredura completa; `extension.ts` deixa de apagar diagnósticos de workspace ao fechar aba; FSW ignora `.bas` sujos no editor.
- **Correção:** `updateFileContentFromParsed` com skip por hash de conteúdo não alinhava `fileUri` dos símbolos com o URI do editor; `validateDuplicateDeclarations` passou a comparar arquivos por caminho normalizado (`isSameFileUri`), eliminando falsos `duplicate-declaration` após indexação do workspace.
- **Orquestração live do linter:** debounce por arquivo (400 ms) com contador de geração que descarta análises obsoletas quando o usuário continua digitando; save dispara refresh imediato com propagação a dependentes.
- **Profiler do pipeline:** `LintPipelineProfiler` mede parse, index-update, module-refs, advanced-lint, cache semântico, TypeResolver, publish e propagação; habilitado via `DATA7_LINT_PROFILE=1` na extensão ou `npm run lint:benchmark -w @data7/core` em workspace real.
- Corrigida a materializacao de lambdas em cadeias `TTList.Filter(...).Map_*(...).Reduce_*`, preservando a assinatura completa do delegate com `extra As Variant`, e a expansao de `Every` agora emite `Not (<comparacao>)` para respeitar a precedencia do Data7 Basic.
- Diagnósticos e quick fixes para o demo `teste_arrays`: acesso de membro incompleto, fechamento ausente de bloco (`unterminated-block`), `Const` tipada, `Shared` inválido fora de rotinas/estado privado, `Public` redundante, declaração não usada, statement solto de valor, instanciação de `MustInherit`, herança de `NotInheritable`, contrato `MustOverride` não implementado e combinação inválida de modificadores de classe.
- Suporte de parser/linter aos supersets `MustInherit Class`, `NotInheritable Class` e `MustOverride`, mantendo os modificadores no AST para análise e removendo-os na serialização final entregue ao compilador Data7.
- Providers de completion, hover, definition e signature help passam a ignorar posições dentro de comentários/strings, e o snippet de classe inclui `Sub New()`/`MyBase.New()` e `Sub Free()`/`MyBase.Free()`.
- Providers de references e rename tambem passam a bloquear invocacoes iniciadas dentro de comentarios/strings, compartilhando a mesma guarda baseada no tokenizer.
- A System Library passou a cobrir as 281 assinaturas do manual `Funcoes Projetos Basic.txt` para primitivos (`Boolean`, inteiros, floats, `Currency`, `TDateTime`, `String`/`AnsiString` e chars), com teste de regressao contra o arquivo quando disponivel localmente.
- Gerenciador de módulos com semântica tipo npm no `ModuleOrchestrator`: install, update e remove aceitam múltiplos módulos, resolvem versões disponíveis em repositório local/online, atualizam `data7.json#dependencies` e sincronizam `data7_modules/`.
- Sidebar do Gerenciador de Módulos passa a listar catálogo local e online separadamente, indicar módulos instalados/atualizáveis e oferecer checkboxes com ações de instalar, atualizar e remover por item ou em lote.
- Publicação online de módulos agora executa uma pré-checagem pública antes de autenticar no GitHub: bloqueia republicação sem alterações e exige versão local maior quando o módulo já existe online com conteúdo diferente.
- Catálogo online de módulos passa a ser derivado de releases GitHub com tag `<modulo>-v<versao>`, com cache e revalidação intervalada para reduzir chamadas à API e evitar rate limit.
- Adicionado fluxo de unpublish online via extensão e CLI: a remoção abre PR no repositório de módulos e é permitida somente ao `module.publisher` publicado ou ao dono do repositório.
- Adicionado suporte ao bloco opcional `data7.json#module` para projetos publicáveis como módulo, incluindo `module.name` como nome canônico do pacote e bloqueio de instalação do próprio módulo no projeto ativo.
- Estendida a validação de parênteses faltantes (`call-parentheses-mismatch`) para abranger métodos com todos os argumentos opcionais (parâmetros default) e cadeias de membros internas/intermediárias de uma expressão.
- Adicionado o comando `data7.linter.fixActiveFile` para aplicar `source.fixAll.data7` no arquivo `.bas` ativo, disponivel por command palette, menu de contexto do editor e atalho `Ctrl+Alt+Shift+F`.
- Adicionado Quick Fix para comentar blocos inteiros de `dead-code`, incluindo acao em lote por arquivo.
- Adicionado o diagnostico `chained-global-function-assignment` para alertar atribuicoes diretas a partir de cadeias iniciadas por funcoes globais que o compilador Data7 pode rejeitar.
- Adicionado Quick Fix para chamadas finais sem argumentos e sem `()`, com bulk fix gerado automaticamente a partir da correcao unitaria deterministica.
- Adicionada a opcao `build.optimization.minify.mergeNamespaces` para mesclar blocos `Namespace` duplicados dentro de cada modulo durante o build.
- Implementado cache de membros de herança de classes (`allMembersForTypeCache` no `WorkspaceSymbolIndexer`) que acelera em $O(1)$ a análise de expressões e atribuições complexas no linter, reduzindo tempos de resposta do walker.
- Restrição de reavaliação de arquivos dependentes em cascata apenas para o momento do salvamento do arquivo (`onDidSaveTextDocument`), mantendo o editor sempre leve durante a digitação contínua.

### Corrigido
- O parser/linter agora ignora linhas de comentario dentro de listas de argumentos multiline, incluindo chamadas genericas fluentes com lambdas, e parametros/variaveis tipados como delegate podem ser invocados diretamente (`pRegra(...)`) sem falso `unknown-symbol`. Chamadas nao qualificadas para funcoes existentes apenas em namespaces nao importados agora geram `missing-import`, em vez de serem aceitas pelo fallback global. Cadeias como `ConectorDeAPI<T>.Parse<TOut>(...).Construir()` preservam o tipo final e nao geram `type-mismatch`, `call-parentheses-mismatch`, `unused-declaration` ou `redundant-terminal-exit` em cascata por falha de parse.
- O monomorfizador agora propaga tipos de retorno genericos em cadeias fluentes de qualquer classe materializada, nao apenas `TTList`, enfileirando a classe retornada para que seus metodos genericos tambem sejam emitidos. Usos com type parameters ainda abertos, inclusive em comentarios/strings ou simbolos sinteticos do indexador, deixam de gerar sobras como `ConectorDeAPI_T` e `TValidador_T`.
- O linter deixou de marcar statements dentro de lambdas `Sub`/`Function` como `dead-code` do metodo externo, evitando falsos positivos em callbacks de `TTList.ForEach`, `Find` e `Reduce`.
- Referencias de metodo passadas para parametros delegate agora sao validadas por assinatura contra o delegate esperado, inclusive nomes genericos materializados como `TFindDel_Integer`, sem comparar diretamente o retorno `Boolean` com o tipo do delegate.
- Campos tipados como delegate agora sao tratados como callables: chamadas como `OnExecute(...)` validam aridade/tipos, lambdas atribuidas a esses campos exigem assinatura exata, e variaveis declaradas em `Using ... As New ...` entram no escopo local usado por linter, hover e completion.
- Hover, completion e semantic tokens passam a exibir campos delegate com a assinatura callable do delegate; hover sobre o prefixo de uma cadeia qualificada, como `mod_testes.Executar()`, mostra o namespace sob o cursor em vez do membro final.
- Invocacoes nao qualificadas que nao resolvem no escopo atual agora emitem `unknown-symbol`, cobrindo chamadas a metodos de namespaces nao importados.
- O formatter passou a preservar a indentacao de chamadas e cadeias multiline com lambdas VB-like, arrays literais, continuation `_`, linhas terminadas em `.` e fechamentos `End Sub)`/`End Function,`, validado contra `teste_arrays/src/antes_de_formatar.bas`. Lambdas de bloco coladas no argumento de chamada, como `ForEach( Sub(...)` ou `ForEach(Sub(...)`, agora sao normalizadas para a forma canonica multiline para evitar cascata de desindentacao.
- O exemplo reduzido `teste_arrays/Principal.bas` deixou de produzir `unknown-member` com membro vazio, `expected-token` no comentario apos `CType(...).Margins.` e falso `missing-mybase-free` quando metodos anteriores estao sem `End Sub`; esses casos agora geram diagnosticos locais (`incomplete-member-access`/`unterminated-block`).
- Completion apos `Form(pItem).` dentro de inicializadores/chamadas como `CStr(Form(pItem).)` resolve o receiver por sufixo da expressao sob o cursor, sem depender de parsear a linha inteira.
- O Quick Fix de `call-parentheses-mismatch` com argumentos passa a substituir a chamada raiz (`Print(...)`) e preserva cadeias internas como `Form(pItem).Caption`.
- `Overrides Nome()` sem `Sub`/`Function`/`Property` agora gera `invalid-declaration`, e `Overrides Sub/Function/Property` tambem e validado contra a classe base: o membro herdado precisa existir e ser `Overridable` ou `MustOverride`.
- `loose-value-statement` tambem cobre cadeias de valor standalone sobre receivers `TObject`/`Variant` ou nao resolvidos, como `pItem.Margins.Bottom`, sem mascarar `unknown-member` em receivers concretos.
- Apos `.` no fim da linha, o parser so continua a cadeia quando ha continuacao explicita com `_`; sem `_`, emite `incomplete-member-access` local e nao consome comentarios ou a proxima instrucao.
- O parser agora aceita lambdas VB-like como argumentos quebrados em multiplas linhas, incluindo `Map(Function...)`, `ForEach(Sub...)` e chamadas genericas como `Reduce<Double>(...)`. A inferencia de tipos propaga parametros locais de lambdas para hover/autocomplete/linter, resolve `TTList<T>` pelo tipo generico real do item e infere o retorno de `TTList.Map<TOut>`/`Reduce<TAcc>` a partir da lambda ou dos argumentos genericos.
- Chamadas encadeadas em `TTList` agora podem quebrar linha apos o ponto quando a linha usa continuacao explicita com `_` (`lista._` / `Filter(...)._` / `Map(...)._`), preservando o receiver correto entre tipos genericos materializados como `TTList_Produto`. `Return` dentro de `Function` lambda deixa de gerar `return-unrecommended`, pois e a forma obrigatoria de retorno nesse contexto.
- Lambdas atribuídas a delegates agora passam pela validação de assinatura sem gerar `type-mismatch` falso entre o tipo de retorno da lambda e o tipo do delegate. `Sub(...) chamada()` de uma linha é tratado como efeito colateral, não como retorno de valor.
- A materialização de lambdas agora replica a assinatura do delegate esperado no método gerado, incluindo parâmetros opcionais/omitidos na lambda fonte e substituição de genéricos como `TFindDel<T>` para `TFindDel<Integer>`. Helpers globais gerados dentro de um `Namespace` passam a ser emitidos dentro do mesmo namespace, preservando acesso a variáveis de escopo de módulo. `Function` lambda materializada passa a baixar cada retorno para uma variável temporária tipada, atribuir ao nome da função gerada e executar `Exit Function`, evitando retorno por expressão direta no código final.
- Helpers globais de lambda (`__Data7LambdaHost`) agora são preservados também quando o arquivo fonte só possui statements globais e o transpiler remove o `Sub __syntheticMethod` temporário. O linter também valida os tipos dos argumentos em chamadas feitas dentro do corpo da lambda, sem confundir a própria lambda com o tipo de retorno dela quando o parâmetro esperado é um delegate.
- A assinatura global de `Print` na System Library passa a aceitar `Variant`, evitando falso `type-mismatch` ao imprimir números, booleanos ou valores de lambdas/listas.
- O monomorfizador agora suporta métodos genéricos declarados dentro de classes, materializando overloads concretos como `TTList_Integer.Map_String` e `TTList_Integer.Reduce_Double` a partir de chamadas `receiver.Map<String>(...)`/`receiver.Reduce<Double>(...)`, inclusive quando o template vive em `data7_modules`. `TTList.Reduce` também passa a aceitar `extra As Variant`, alinhado aos demais métodos funcionais da lista.
- Hover e autocomplete de membros agora resolvem pelo simbolo concreto do tipo do receiver no arquivo/escopo ativo e nao caem mais em membros globais homonimos de outros tipos quando o membro acessado nao pertence ao receiver.
- Ao cancelar o F5 por erros de parser/linter, a extensao publica os diagnosticos e abre o painel Problems para facilitar a navegacao ate os erros que bloquearam a execucao.
- A extensao voltou a sincronizar `core_modules` em `data7_modules/core_modules` na ativacao, criacao/decomposicao de projeto, build, F5 e abertura no DevStudio. A sincronizacao agora espelha a pasta embarcada e reindexa os modulos, garantindo que runtimes de sugars como `mod_tlist`/`TTList` estejam disponiveis para build, transpile e linter.
- Lambdas agora usam somente sintaxe VB-like (`Function(...) expr`, `Function(...) ... End Function`, `Sub(...) ... End Sub`); o suporte legado `=>` foi removido. O linter valida lambdas contra a assinatura do delegate esperado (`lambda-signature-mismatch`) e o transpiler materializa lambdas gerais como metodos gerados, deixando o `array-list` apenas com a otimizacao inline dos loops de `map`, `filter`, `find`, `findIndex`, `some`, `every`, `reduce` e `forEach`.
- O linter nao exige mais `Imports mod_tlist` para referencias `TTList<T>`/`TTList_*` quando o sugar `array-list` esta habilitado, pois esse import e injetado pelo transpiler durante a materializacao.
- O sugar `Enun` e o prompt MCP `data7_TEnum_pattern` agora geram o construtor privado `Sub New(pValue As Integer, pDescription As String)` com `MyBase.New(...)`, mantendo o padrao `TEnum` valido para o diagnostico `missing-mybase-new`.
- O resolvedor de tipos agora escolhe a classe ativa mais interna, ignora classes sintéticas de genéricos e preserva a identidade do arquivo ao resolver membros de `Me`/`MyBase`, evitando falsos `type-mismatch` e `unknown-member` quando `src/` e `data7_modules/` declaram classes com o mesmo nome, como `TEnum._value`.
- `missing-mybase-new` agora também é emitido quando uma classe não declara nenhum `Sub New`; o Quick Fix cria um construtor sem parâmetros com `MyBase.New()` ou apenas insere `MyBase.New()` quando o construtor já existe.
- O linter agora emite `unknown-member` ao acessar membros de variáveis cujo tipo declarado não existe ou não está acessível no escopo, em vez de silenciar o acesso após o `unknown-type`.
- `unknown-type` oferece Quick Fix para registrar tipos nativos/externos via comentário `' data7:external-type <Tipo>`, com escopo por declaração, bloco ou arquivo; variáveis cobertas passam a ser tratadas como `Variant` para evitar falsos `unknown-member` sem desativar o linter inteiro.
- Autocomplete e Go to Definition agora escolhem a cadeia de membro sob o cursor quando uma linha contem multiplos acessos encadeados, evitando inferir o receiver a partir de outro membro mais adiante na mesma linha.
- Imports que apontam para namespaces/modulos desconhecidos agora emitem `module-not-found` em vez de `unused-import`; o warning de import nao utilizado fica restrito a namespaces resolvidos no workspace ou na System Library.
- Quick Fixes do linter agora tambem sao oferecidos quando o VS Code chama o provider com `context.diagnostics` vazio, recuperando os diagnosticos publicados na colecao Problems pelo range; `shared-return-global-function` passou a ter Quick Fix para introduzir temporaria antes do retorno global em `Shared Function`.
- Corrigido o processo de empacotamento de dependências (`data7_modules/`) no `Builder.buildProject` para buscar arquivos `.bas` recursivamente, ignorar unidades de escopo global (como `Principal.bas` de sub-módulos e qualquer outra unidade sem declaração de `Namespace`), remover o nível de diretório `src` de cada dependência promovendo subpastas e arquivos um nível acima na estrutura virtual, e recriar corretamente a estrutura física de subpastas como pastas virtuais no arquivo `.7Proj` XML e no `data7.json` de saída, resolvendo erros de falta de dependências e caminhos inválidos ao compilar.
- Corrigido erro `TypeError: Cannot read properties of undefined (reading 'find')` em `Builder.buildProject` durante o processo de compilação (F5/CTRL+ALT+D) se as propriedades `virtualFolders` ou `modulesMetadata` estiverem ausentes no arquivo `data7.json` do projeto.
- Corrigida a lógica do formatador de código (`CodeFormatter`) no VS Code Extension para suportar a sintaxe `Select <expressão>` (sem a palavra-chave opcional `Case`), evitando que blocos do tipo `Select/End Select` quebrassem e causassem desindentação prematura das funções e linhas subsequentes.
- Corrigido falso positivo de `unknown-member` ao acessar classes aninhadas (nested classes) estaticamente (ex.: `WinAPI.Window.GetForeground()`). O indexador de símbolos agora associa a classe interna ao seu container correto (`activeClass`) e o resolver de tipos localiza a classe aninhada e seus membros estáticos corretamente.
- Corrigido falso positivo de `chained-global-function-assignment` para cadeias de métodos iniciadas por funções nativas da biblioteca do sistema (ex.: `Mid(me.ContentType, pos + 8).Trim()`), restringindo o aviso apenas para funções globais customizadas.
- Corrigida a lógica de resolução de tipo para chamadas a funções/métodos com argumentos opcionais omitidos (parâmetros com valor default) que resultava em falsos positivos de `type-mismatch` (ex.: `Incompatibilidade de tipos: não é possível atribuir 'FormatJson' para 'String'`).
- Corrigido o método `findClassSymbol` no `TypeResolver` para retornar apenas símbolos de tipos reais (`class`, `structure`, `delegate`), impedindo que chamadas de método com mesmo nome fossem falsamente inferidas como conversões de cast.
- Corrigidos falsos positivos de `unknown-member` para chamadas ao método `Append` do tipo primitivo `String` (adicionado `String.Append(pValue: String) As String` à biblioteca nativa do sistema).
- Corrigido o fluxo de debug/watch do monorepo: o `npm run watch` raiz agora inicia os watches dos packages em paralelo, e `npm run compile` compila `@data7/core` antes dos consumidores.
- Quick Fixes especificos agora aparecem antes das supressoes, e a supressao de linha gerada pela extensao usa `data7:disable-next-line` na linha anterior ao diagnostico, incluindo `unsupported-member`.
- Correcoes em massa do workspace agora publicam os diagnosticos recalculados do conteudo final diretamente na colecao Problems, evitando um `refreshAllActive()` redundante apos o batch.
- `dead-code` agora agrupa branches estaticamente inalcancaveis em um unico diagnostico por bloco, em vez de marcar cada statement interno.
- O Quick Fix de `finally-block-unsupported` remove apenas o bloco `Finally` vazio quando nao ha corpo a preservar, em vez de encapsular o `Catch`.
- A configuracao MCP gerada usa `command: "node"`, caminhos com `/` e `--workspace=${workspaceFolder}` quando nao ha workspace fisico resolvido.
- O scanner de dependencias passou a ignorar variaveis, constantes, membros e rotinas declaradas no projeto ao detectar modulos implicitos, evitando promover globais como `_usuario` para `module-not-found`.
- Resolvido o loop infinito de re-entrada no indexador do linter: `updateFileContentFromParsed` agora compara inteligentemente se os namespaces declarados em um arquivo mudaram antes de marcá-los como alterados.
- Configurado o watcher de arquivos `.bas` para ignorar a pasta controlada `data7_modules/`, evitando loops de indexação em cascata.
- Desativado o aviso e quick-fix de `return-unrecommended` para blocos `Property Get`, dado que o compilador nativo do Data7 não suporta a instrução `Exit Property`.
- `missing-mybase-new` e `missing-mybase-free` agora se aplicam somente a classes; `Structure` e seus membros não recebem construtor/destrutor nem quick fix de `Free`.
- Corrigidos falsos positivos de `duplicate-declaration` para variáveis `Catch ex` em blocos distintos, de `missing-return-value` para guardas legados com `Exit Sub` dentro de `Function`, e de `chained-global-function-assignment` quando a cadeia de função global aparece apenas como operando de uma expressão composta.
- Corrigido o `SignatureHelpProvider` para recuperar assinaturas de chamadas qualificadas no documento atual mesmo quando o índice ainda não consegue associar perfeitamente o nome da classe parseada ao tipo inferido.
- Declarados aliases oficiais da System Library (`ByteBool`, `LongBool`, `WordBool`, `TStringDynArray` e `TAnsiStringDynArray`) usados por métodos de `String`/`AnsiString`, removendo pendências da auditoria de símbolos.
- Corrigido falso positivo em instruções `Declare`: declarações válidas sem `()` no nome não recebem mais `declaration-parentheses-mismatch`, e o novo diagnóstico `declare-name-parentheses` oferece Quick Fix para remover `()` indevido antes de `Lib`.
- A execução via F5 agora usa o ID de conexão e os parâmetros do projeto em `data7.json#opcoes` como fonte principal, evitando novo prompt quando `opcoes.identificacaoBancoDados` já foi validado. A configuração global `data7.databaseConnectionId` fica apenas como fallback para execução direta de `.7Proj`.
- Logs de execução do projeto agora são acumulados em uma aba dedicada `Data7 Logs`, sem misturar com o output geral da extensão e sem limpeza automática entre execuções.
- O linter agora valida chamadas qualificadas em namespaces/tipos, emitindo `unknown-member` para métodos inexistentes como `console.clear()`. A execução via F5 reanalisa o projeto antes de build/run e é cancelada quando restam erros de parser/linter.

- Corrigidos falsos positivos do linter observados no projeto real `Conciliacao de Cartoes V4.8`: indexacao de `Variant`/`String`, chamada sem receiver que deve preferir `Function` importada antes de `Sub` homonima global, membro com o mesmo nome da classe, handlers atribuidos a eventos `On*`, `Imports Net` e constantes FTP `ftBinary`/`ftASCII`.
- A System Library passou a modelar flags legadas de `Forms.GridConfigs` (`FixedVerLine`, `FixedHorzLine`, `VerLine`, `HorzLine`, sizing/moving/select/click/hot-track) e o indexador default `TStrings.Item(Integer) As String`, evitando falsos `unknown-member` e `default-indexer-missing` em projetos reais.
- Mantida a validacao estrita de `Private` fora da classe declarante; o diagnostico `private-member-access` agora destaca exatamente o token do membro em cadeias longas e o autocomplete possui regressao para nao sugerir membros privados fora da classe. Adicionado `redundant-terminal-exit` com Quick Fix para remover `Exit Sub`/`Exit Function`/`Exit Property` ou `Return` vazio no fim efetivo da rotina, sem disparar `missing-return-value`.
- A sincronizacao de dependencias preserva copias locais em `data7_modules/` quando o namespace esta marcado com `'@Module` ou `'@Module-Imported`, mas nao existe no repositorio/core local. Ao decompor `.7Proj`, modulos de dependencia desconhecidos tambem sao materializados em `data7_modules/` para projetos recebidos de terceiros continuarem buildaveis.
- Corrigido o comando **Linter - Analisar Workspace** para manter no painel Problems os diagnosticos de arquivos fechados apos o fim da varredura. Os diagnosticos live de documentos abertos continuam sendo podados ao fechar o arquivo, mas os resultados da analise completa so sao removidos por nova analise, limpeza explicita ou alteracao/remocao do arquivo.
- `data7.features.diagnostics.lintWorkspaceOnStartup` voltou a controlar a analise completa do workspace ao abrir a IDE. A flag permanece desligada por padrao para evitar custo inicial em projetos grandes.
- Corrigidos falsos positivos do linter em projetos Data7 com variaveis globais declaradas no escopo superior, especialmente em `Principal.bas`, como `_usuario` e `_modeloOperacaoConciliacao`. Esses simbolos agora sao indexados e resolvidos como globais de projeto, evitando `unknown-symbol`, `unknown-member` e `module-not-found` em acessos como `_usuario.CodEmpresa`.
- A resolucao de overloads agora considera os tipos dos argumentos, nao apenas a aridade. Chamadas como `_controleTitulos.buscar(empresa, CInt(conta))` selecionam a assinatura `(Integer, Integer) As Titulo` quando existe tambem um overload `(Integer, String) As Titulos`.
- A System Library passou a declarar membros nativos usados por formularios Data7: `Forms.FormButtons.btnOK`, `Forms.ControlGroup.Text`, `Forms.TButtonControl.Text` e `TDateTime.DaySpan(...)`. O diagnostico de duplicidade tambem permite que metodos locais sombreiem metodos importados ou globais nao-tipo, como `Dispose`.
- Corrigido o parser/linter para aceitar propriedades indexadas com multiplos argumentos em colchetes, como `Grid.Cells[0, 1]`, inclusive quando os argumentos sao expressoes parentizadas como `Grid.Cells[1, (Grid.Row + 1_)]`. A sintaxe e preservada e a aridade/tipos da propriedade indexada sao resolvidos. Quando `_` aparece como marcador de continuacao sem quebra de linha efetiva, o linter agora emite `line-continuation-without-break` com Quick Fix para remover o marcador. Metodos/funcoes com colchetes agora sao rejeitados; arrays e matrizes nativas continuam aceitando `[]`.
- Declarados `System.IOUtils.TFile` e `System.IOUtils.TPath` na System Library com os helpers estaticos iniciais usados por modulos Delphi, e adicionado alias qualificado para `IO.File.ZipFile`.
- Corrigido falso `module-not-found` para classes da System Library usadas como chamadas estaticas, como `TFile.Exists(...)` e `File.ExtractName(...)`.
- Corrigido falso `module-not-found` com nome vazio em acessos abreviados de bloco `With`, como `.Title` e `.Refresh()`, que nao devem ser tratados como referencias a namespaces/modulos.
- Corrigida a deteccao/sincronizacao de dependencias para consumir a AST do parser em vez de regex textual para `Imports` e acessos `Namespace.Membro`, evitando falsos modulos como `mod_powershell`, `mod_database` e `mod_rdbms` quando aparecem em strings ou membros locais. A resolucao agora usa o namespace exato e trata como modulo apenas namespaces marcados com `'@Module`.
- Corrigido falso `module-not-found` em acessos estaticos a classes importadas, como `Helper.timeUid()` e `stringHelper.split(...)`, que eram ambiguos com acesso qualificado de namespace.
- Corrigido aviso falso "módulos referenciados não foram encontrados" ao abrir projeto para nomes que pertencem à System Library (`messageBox`, `Directory`, `File`, `TFile`, `TPath`, etc.). O `DependencyService` agora consulta `lookupSystemNamespaceOrClassByName` antes de marcar um nome como módulo ausente, espelhando o guard que já existia no `DiagnosticService`.


### Performance - Developer Studio

- A execução via F5 agora gera a variante com logger em `.data7/run/*.run.7Proj`, evitando sobrescrever o `.7Proj` standard e invalidar o cache usado pelo Developer Studio.

### Performance

- Build, execução e abertura no Developer Studio agora usam snapshot persistente em `.data7/build-cache.json` para pular o empacotamento quando o `.7Proj` já está atualizado; quando há rebuild, o `Builder` reutiliza o transpile cacheado dos arquivos inalterados.
- **Otimização de performance do linter e fix em massa** (`workspace-fix-service`, `diagnostic-service`): os comandos "Analisar projeto" e "Corrigir Tudo (Ajuste em Massa)" agora leem arquivos diretamente do disco via `node:fs` sem abrir editores (`openTextDocument`), eliminando o disparo em cascata de `onDidOpenTextDocument` → linter por cada arquivo. As correções são aplicadas em memória e escritas diretamente em disco via `fs.writeFileSync`, sem `workspace.applyEdit` nem `.save()` por arquivo. Uma flag `isBatchFixInProgress` suprime os debounces de diagnóstico durante o batch; ao final, os diagnosticos recalculados do conteudo corrigido sao publicados diretamente na colecao Problems. O linter em massa ganhou suporte a cancelamento (botão no progresso) e barra de progresso por arquivo. Para projetos com centenas de arquivos, isso elimina virtualmente o congelamento da interface durante essas operações.

### Alterado

- O empacotamento da extensão agora prepara um bundle único com `esbuild`, copia apenas os assets runtime necessários (`docs/`, `core_modules/`, MCP bundled, README/CHANGELOG/LICENSE) para `packages/data7-vscode` e executa `vsce package --no-dependencies`, evitando que links de workspace incluam o monorepo inteiro ou VSIX antigos no pacote final.
- Build, execução e abertura no Developer Studio não executam mais a varredura completa de auto-fix por padrão. A nova flag `data7.features.build.autoFixBeforeBuild` reativa esse comportamento de forma incremental: apenas arquivos `.bas` alterados desde o último build da sessão são reavaliados. O comando explícito `data7.fixAllWorkspace` continua corrigindo todo o projeto.

### Adicionado

- Iniciado o pipeline de otimizacao de build em `src/project/optimizer/`, com contrato tipado para `data7.json#build.optimization`, compatibilidade com `opcoes.minify`/`opcoes.stripComments`, inclusao das flags no cache de build e task tracker em `docs/tasks/optimization-pipeline.md`.
- Implementado o primeiro passe de `build.optimization.minify.removeUnused`, removendo declaracoes Data7 Basic de usuario nao alcancadas por um grafo global AST antes da minificacao textual.
- Implementado o passe `build.optimization.minify.mergeNamespaces`, que mescla namespaces duplicados dentro de cada modulo parseavel e preserva o codigo original quando o modulo tem erro de parse.
- `minify.removeUnused` agora respeita diretivas `@data7:keep`, `@data7:keep-name`, `@data7:entrypoint` e `@data7:external-api` em comentario imediatamente anterior a declaracao.
- Corrigido `stripComments` para nao truncar strings SQL/PowerShell com apostrofos ou aspas escapadas; `build.optimization.minify.stripComments` tambem deixa de ser aplicado quando `minify.enabled` esta desligado.

- `data7.features`: flags por categoria para ativar ou desativar generics, sugars, diagnósticos, varredura inicial do linter, detecção de `.7proj`, auto-instalação do MCP, auto-fix/auto-format ao salvar, auto-fix pré-build e prévia transpilada. A varredura inicial é independente do linter e dos comandos manuais. Os valores padrão preservam a compatibilidade atual, exceto o auto-fix pré-build, que é desativado para evitar atraso em projetos grandes.
- Novo sugar plugin `inline-if` para converter automaticamente declarações `If` inline em bloco `If ... Then ... End If` durante a transpilação.
- Novo diagnóstico `inline-if-then` (Warning) para sugerir a substituição de `If` inline por bloco estruturado, com opções de Quick Fix correspondentes.
- Inicialização automática do linter para todo o projeto (arquivos físicos locais com esquema `file`) ao abrir o workspace.
- Novo comando `data7.runLinter` ("Reiniciar/Rodar Linter no Projeto") para reavaliar todo o projeto sob demanda.
- Exibição de notificação informativa com resumo dos problemas (Erros/Avisos/Informações) após execução do linter de projeto, com botões para "Corrigir Tudo" e "Reiniciar Linter".

### Corrigido

- O parser/transpiler agora preserva arrays nativos de tamanho fixo em declarações `Private _items(10) As Tipo` e matrizes `Dim m(10, 5) As Integer`, sem confundir essa sintaxe com o sugar `[]`.
- O parser voltou a reconhecer `Private Const`/`Public Const` no nível do módulo antes do fallback de campos, evitando falsos `unknown-symbol` no linter para constantes WinAPI como `GWL_STYLE`, `WS_BORDER` e `SWP_*`.
- Declarações nativas `Public Enum Options ... End Enum` agora são preservadas como enum do compilador; o sugar de enum declarativo passou a usar a palavra-chave própria `Enun X ... End Enun`.
- O diagnóstico `dead-code` deixou de marcar comentários inline após `Return` como código inalcançável, evitando falso positivo em blocos `Try/Catch` que retornam no `Catch`.
- Novo diagnóstico `return-assignment-in-catch` alerta quando Function/Property usa retorno por atribuição dentro de `Catch`, com quick-fix para trocar por `Return`.
- O linter live agora reanalisa arquivos `.bas` físicos já abertos na ativação e remove diagnósticos ao fechar ou excluir arquivos; a análise completa do workspace fica restrita aos comandos explícitos.
- A sincronização de dependências agora reavalia o projeto em saves, criação, deleção e rename de `.bas`, promovendo módulos globais quando uma implementação local deixa de suprir um namespace importado.
- Removido completamente o sugar `Match`/`Case Is`, incluindo AST, parser, transformação, formatação e documentação associada.
- O diagnóstico e o Quick Fix de `missing-then` agora reconhecem comentários no fim da linha como terminadores, preservam o alinhamento antes do comentário e evitam inserir `Then` duas vezes em correções em massa.
- O Quick Fix de `return-unrecommended` agora reescreve a linha inteira da declaração `If` inline para o formato de bloco com `End If` (preservando o escopo correto da instrução `Exit`), em vez de apenas substituir o `Return` na linha única.
- O linter agora ignora documentos virtuais sem esquema `file` (como views de diff do Git) para evitar falsos positivos de arquivos modificados/antigos no editor.
- O comando de ajuste em massa (`data7.fixAllWorkspace`) foi aprimorado para resolver de forma inteiramente dinâmica as correções, aplicando o primeiro Quick Fix corretivo real disponível de cada diagnóstico no projeto e ignorando ações de supressão/desativação.
- O Quick Fix de `return-unrecommended` continua disponivel quando o VS Code recria o diagnostico sem o payload interno: a extensao recupera a rotina e o contexto condicional pela estrutura do documento, sem depender da mensagem do warning.

- Os Quick Fixes de `return-unrecommended` agora usam a linha real do documento: fora de condicionais geram apenas a atribuicao do valor de retorno; dentro de condicionais tambem inserem o `Exit` correspondente. O Quick Fix de `missing-mybase-free` voltou a aparecer para diagnosticos estruturados e insere `MyBase.Free()` antes de `End Sub`, apos todas as liberacoes de recursos existentes.

- O parser aceita `Continue`, nomes de método contextuais como `Match` e cadeias `+_` que contenham linhas comentadas. O linter respeita variáveis locais, retorno da função ativa e declarações duplicadas de métodos aceitas pelo Developer Studio; também reconhece `TObjectList`, `String.Left` e `Double.RoundTo`.
- O linter voltou a emitir `finally-block-unsupported` como warning orientativo: `Finally` continua sendo sintaxe aceita pelo Developer Studio, mas a extensão volta a sinalizar o bug conhecido do compilador e oferece Quick Fix para encapsular o `Catch` com `If Assigned(...) Then`.
- A atribuição de retorno de funções e métodos (ex: `FromJson = _value`) agora é considerada válida e não acusa mais falsos positivos de `invalid-assignment-target` ou `unknown-symbol`, mesmo que existam sobrecargas ou múltiplos métodos homônimos cadastrados no indexador do workspace.
- O Quick Fix de remoção de imports não utilizados (`unused-import`) agora realiza a extração do nome do namespace diretamente da linha do documento como fallback quando o payload de diagnóstico do VS Code for omitido ou perdido, garantindo que a ação descritiva "Remover Imports 'X'" continue sendo gerada com robustez.
- O linter preserva imports exigidos transitivamente por modulos usados e aceita promocao numerica sem perda, como `Integer` para `Double`.
- Adicionado suporte de System Library para `dateUtils.toStringFormat(...)`, removendo falsos `unknown-symbol` em projetos legados.
- O linter deixou de reportar falsos `unknown-symbol` e `unused-import` para classes, factories e helpers resolvidos por `Imports <namespace>`, passando a consultar a resolução contextual do `WorkspaceSymbolIndexer` antes de acusar símbolo ausente.
- Instanciações `New Tipo` sem `()` deixaram de aparecer como erro sintático indevido no fluxo do linter e agora geram o warning `object-creation-parentheses-missing`, com Quick Fix para inserir os parênteses.

- Corrigido o empacotamento VSIX removendo a exclusão incorreta de `node_modules/**` no arquivo `.vscodeignore`. Como a extensão principal não é empacotada (bundled), ela dependia de dependências de produção (como `fast-xml-parser` e `zod`) que estavam sendo omitidas do pacote final, causando falha silenciosa de ativação e gerando o erro de comandos não encontrados.
- Adicionados todos os comandos `data7.*` e o idioma `d7basic` (Data7 Basic) sob os `activationEvents` do manifesto `package.json`. Isso evita o erro de comandos não registrados (como "Abrir Projeto" e "Criar Projeto") ao serem invocados antes da ativação da extensão.
- Adicionado listener de mudança de editor ativo (`onDidChangeActiveTextEditor`) e tratamento de arquivo ativo inicial no `extension.ts` para garantir que o prompt de abertura/decomposição de arquivos `.7proj` seja exibido ao visualizar arquivos em outras pastas sem projeto decomposto ativo.
- Implementado controle de arquivos já exibidos (`promptedFiles` Set) no `ActivationService` para evitar loops e notificações duplicadas ao visualizar o mesmo arquivo `.7proj` na mesma sessão do VS Code.

- Completion provider: `.` agora dispara sugestões automaticamente, e a lista passa a ser ordenada por escopo (bloco, método, classe, heranças, namespace e global) com ordem alfabética dentro de cada faixa.

### Corrigido

- O parser agora reconhece declarações `Declare Sub` e `Declare Function` de DLLs (tanto públicas quanto privadas) no nível do namespace, tratando-as como `OpaqueStatement`. Isso impede que a transpilação divida e reformate incorretamente as declarações.

### Alterado

- O parser/serializer agora reconhece `Else If <cond> Then` como ramificação `ElseIf`, preservando a cadeia condicional na transpilação.
- O serializer preserva `Throw` em condicionais inline, e a inferência de concatenação agora resolve o tipo declarado na AST e no catálogo de símbolos, evitando `CStr` redundante.
- O sugar declarativo `Enum` deixou de gerar o wrapper virtual `core_sugars_enum.CoreSugarEnum`; as classes materializadas importam `mod_tenum` e usam `TEnum` diretamente.
- O módulo compartilhado `mod_logger` agora faz todas as classes de domínio herdarem de `TTObject`, com `Assign`, `Clone`, `ToString` e `Dispose` implementados. Isso permite armazená-las diretamente em `TTList` e garante a liberação de recursos de formatos, opções, transportes e loggers.
- `TEnum` agora herda de `TTObject` e implementa cópia, clonagem e descarte, preservando o cache de enums. O `mod_console` foi removido dos módulos core: o `mod_logger` centraliza a saída e serializa `TDateTime`, `TTObject` e outros `TObject` pelo contrato correto.

### Adicionado (Try/Catch Warning, Correções em Massa e Workspace Trust — 2026-06-22)

- **Aviso de Bloco Finally Não Recomendado (`finally-block-unsupported`)**: Adicionado diagnóstico (severidade `Warning`) que sinaliza o uso do bloco `Finally` em estruturas Try/Catch, devido a um bug conhecido no compilador que executa o `Catch` mesmo quando nenhuma exceção é lançada.
  - O warning é suprimido automaticamente se for identificado o workaround `If Assigned(ex) Then` (onde `ex` é a variável da exceção) englobando o corpo do bloco `Catch`.
- **Ações Rápidas em Massa (Bulk Quickfixes)**: Todos os diagnósticos que possuem Quickfixes agora suportam a aplicação em massa em todo o arquivo ativo de forma a agilizar a refatoração:
  - Importar em massa todas as dependências ausentes.
  - Remover em lote todos os `Imports` duplicados ou não utilizados.
  - Declarar ou instalar todas as dependências em lote (utilizando o novo comando `data7.installModulesBulk`).
  - Corrigir em massa nomes de membros/tipos incorretos (sugestões "Você quis dizer...?").
  - Corrigir todas as ocorrências de parênteses em assinaturas/chamadas e métodos `MyBase.New`/`MyBase.Free` ausentes.
  - Resolver em massa todos os avisos de `finally-block-unsupported` aplicando o workaround `If Assigned(ex) Then` em todo o arquivo.
- **Supressão via Comentários**: Garantido que todo diagnóstico gerado pelo linter suporte a desativação tanto no escopo da linha (`' data7:disable-line <code>`) quanto no escopo global do arquivo (`' data7:disable <code>`).
- **Workspace Trust Service**: Adição do `WorkspaceTrustService` no processo de inicialização, que bloqueia compilações, descompilações manuais e gravações no repositório privado em workspaces não confiáveis.
- **Desativação do SyncWatcher Automático**: O watcher de sincronização em tempo real (`SyncWatcher`) foi totalmente desabilitado para evitar concorrências, colisões e reversões de código indesejadas no Windows. O processo de build e descompilação agora é estritamente manual e seguro.
- **Diretrizes e Instruções de Agente (MDC)**: Reconfiguradas as diretrizes nos diretórios `.codex/rules/`, `.antigravity/rules/` e `.cursor/rules/`, incluindo regras de conformidade e o dever de atualizar a documentação (`CHANGELOG.md`, `project_context.md` e `README.md`) a cada entrega importante.

### Corrigido (Try/Catch e Linter — 2026-06-22)

- **Bypass do Linter para Try/Catch com Workaround**: O linter agora verifica a AST do catch body (`isCatchBodyWrappedWithAssignedCheck`) para validar se o workaround já foi aplicado, evitando reportar um warning duplicado ou indevido após a aplicação do Quickfix.

### Adicionado (Generics — metaprogramação e monomorfização por workspace)

- **Diretivas de metaprogramação em templates genéricos**: O parser e o monomorfizador AST agora reconhecem blocos `<# IF ... THEN #>`, `<# ELSE #>` e `<# END IF #>` dentro de templates genéricos.
  - Suporte inicial para `TypeSystem.InheritsFrom(T, "Base")` e `NOT TypeSystem.InheritsFrom(...)`, avaliados em tempo de build/preview para cada instanciação concreta.
  - Permite gerar código especializado sem wrappers para tipos descendentes de `TTObject` e manter wrappers apenas para primitivos, `Variant` e tipos que não herdam da base indicada.
  - O transpiler normaliza placeholders como `TTItem_<T>` e `<T>` antes do parse, permitindo escrever templates legíveis no código fonte.

- **Materialização de generics declarados em outros arquivos/namespaces**: Builder, preview, linter e indexador passaram a montar um contexto global de templates genéricos do workspace.
  - Usos como `TTList<Produto>` em um arquivo consumidor agora solicitam a materialização correspondente no arquivo que declara `TTList<T>`.
  - Referências a templates externos são reescritas para nomes monomorfizados (`TTList_Produto`) sem tentar materializar cópias no arquivo consumidor.
  - Instanciações abertas, como `TTList<T>`, são ignoradas como pedido de materialização concreta para evitar saída espúria como `TTList_T`.

- **IntelliSense para generics externos**: O `WorkspaceSymbolIndexer` guarda conteúdo do arquivo, parâmetros genéricos declarados e símbolos sintéticos de instanciações monomórficas.
  - Hover, autocomplete e resolução de membros funcionam para variáveis top-level e para tipos genéricos importados de outro namespace.
  - Instanciações sintéticas são marcadas internamente para não gerar falso `duplicate-declaration`.

### Alterado (Generics — semântica de constraints e serialização)

- **Parâmetros genéricos sem constraint permanecem abertos**: Declarações como `<T>` ou `<T, K>` não inferem mais `TObject`; apenas `<T As Foo>` restringe `T` a `Foo`/descendentes no linter e no resolvedor.
- **Serialização do build sem `Public` redundante**: Campos e propriedades materializados não emitem mais o modificador `Public` explícito quando esse é o padrão da linguagem; modificadores como `Private`, `Protected`, `Shared`, `Overrides` etc. continuam preservados.
- **Preservação de sintaxe `TypeOf ... Is ...`**: Usos como `If TypeOf pObj Is TTItem<T> Then` e `If TypeOf(pObj) Is TTItem<T> Then` agora são serializados corretamente após monomorfização, sem virar chamada `TypeOf(...)`.

### Corrigido (Preview — generics entre arquivos)

- **Atualização em tempo real do preview com usos genéricos globais**: O preview atualiza o `WorkspaceSymbolIndexer` com os documentos `.bas` abertos antes de transpilar e, quando qualquer fonte muda, dispara refresh também para previews já abertos.
  - Ao adicionar `TTList<Produto>` em `teste.bas`, o preview de `mod_tlist.bas` passa a materializar imediatamente `TTList_Produto`, sem reload da janela.

### Adicionado (Infraestrutura de Açúcares Sintáticos Complexos e Namespaces Utilitários)

- **Arquitetura de Sugars com Namespaces Compartilhados**: Implementada infraestrutura e diretrizes via `SugarRegistry` para apoiar sugars complexos que demandam utilitários compartilhados.
  - Todo sugar complexo materializa a sua classe final no local de uso (ex: a classe `Color` gerada pelo sugar `Enum`) herdando ou referenciando classes utilitárias em um namespace virtual dedicado (ex: `core_sugars_enum.CoreSugarEnum`, que herda de `TEnum`).
  - O transpilador (`transpiler.ts`) rastreia o uso de sugars nos arquivos e injeta automaticamente `Imports <namespace>` no topo dos respectivos arquivos transpilados.
  - O `Builder` resolve recursivamente as dependências transitivas entre sugars (ex: `enum` dependendo de `list`), injeta os módulos utilitários virtuais gerados no `buildIndexer` temporário para validação estrita do linter e empacota-os no XML do `.7Proj` final.
  - O indexador do workspace (`WorkspaceSymbolIndexer`) agora pré-indexa os módulos virtuais de sugars sob URIs `system://sugars/` para que o linter em tempo real e o autocomplete do editor os reconheçam de forma nativa e sem erros.
  - O linter (`diagnostics.ts`) foi ajustado para ignorar a obrigatoriedade de `Sub Free()` em classes que herdem de `CoreSugarEnum`.

### Adicionado (Pipeline AST Completo: Parser, Transpilador, Serializador e Linter)

- **Conversão Automática de Tipos na Concatenção de Strings**: Implementada a conversão automática de tipos não-string em concatenações de string (`&` e `+`) e na interpolação de strings (`$"..."`).
  - Variáveis e literais do tipo `String` permanecem inalterados.
  - Primitivos (`Integer`, `Double`, `Boolean`, `Single`, `Extended`, `TDateTime`) e classes/estruturas (prefixo `T`) invocam o método `.ToString()`.
  - Tipos não resolvidos e `Variant` utilizam a função global `CStr()`.
  - No caso do operador `+`, a conversão é ativada apenas se pelo menos um dos operandos for estaticamente inferido como `String`, prevenindo conversão indesejada em operações aritméticas de adição (ex: `idade + preco`).

- **Transição para Pipeline de AST Completa**: Implementação de pipeline estruturada de nós sintáticos (Statements e Expressions) substituindo processamento baseado em regex e strings opacas dentro de corpos de métodos.
- **Parser de Expressões por Pratt Parsing**: Implementação de parser recursivo de precedência de operadores para tratar adequadamente prioridades de operadores matemáticos, lógicos, ternários e coalescência nula.
- **Suporte a Instruções If em Linha Única**: Adicionado suporte para analisar sintaticamente e serializar instruções condicionais `If` estruturadas em linha única (incluindo ramificações `Else` inline separadas por colons).
- **Rastreamento e Preservação de Parênteses em Assinaturas**: Modificada a análise de cabeçalhos de métodos e delegates para identificar se a assinatura foi escrita sem parênteses (por exemplo, `Shared Function Stone As CardAdm`), preservando essa formatação na serialização através da propriedade `noParentheses`.
- **Propagação de Contexto de Cadeias Opcionais (`?.`)**: Ajustada a verificação do transpiler de optional chaining para propagar recursivamente o contexto de atribuição ou chamada, corrigindo falsos diagnósticos de contexto não suportado em ExpressionStatements.
- **Alternância de Argumentos para Tagged Templates (`sql$"..."`)**: Transpilação de interpolação SQL ajustada para gerar uma lista de argumentos estritamente alternada entre literais de string e expressões de código, iniciando e finalizando sempre com literais de string para conformidade de aridade.
- **Serialização de Literais Booleanos**: Casing padrão ajustado na etapa de serialização para converter booleanos em conformidade com as regras do VB6/VBA (`True` e `False`).
- **Resolução de Conflitos no Parser de Construtores (`New`)**: Corrigido bug no analisador sintático de referências de tipo onde parênteses de construtores de classe vazios eram engolidos como marcadores de arrays, permitindo o correto parsing de instruções encadeadas como blocos `With` ou loops `For`.

### Adicionado (Servidor MCP embutido — contexto para IA)

- **Servidor MCP (Model Context Protocol)** em `src/mcp/`, compilado por `tsc` e empacotado por `esbuild` em `out/mcp/server.bundled.js`. Copiado de forma idempotente para `context.globalStorageUri/mcp/` na ativação (`src/services/mcp-service.ts`), para que clientes externos (Cursor / Claude Desktop / Continue) o lancem via stdio. Decisão arquitetural em `docs/rfcs/MCP-001-mcp-server.md`; manual do usuário em `docs/mcp/`.
- **10 famílias de Resources**: `data7://language/<chapter>`, `data7://system-library/<ns>`, `data7://examples/<path>`, `data7://diagnostics/codes`, `data7://idioms`, `data7://real-project/<file>`, `data7://official/<qualifiedName>`, `data7://guide/<slug>`, `data7://meta/snapshot`.
- **12 Tools**: `data7_search_symbol`, `data7_describe_symbol`, `data7_list_controls`, `data7_search_examples`, `data7_get_canonical_example`, `data7_get_official_example`, `data7_list_diagnostic_codes`, `data7_list_sugar`, `data7_transpile_bas`, `data7_lint_bas`, `data7_lint_project`, `data7_suggest_import`. Os tools executáveis reusam `SugarTranspiler` e `DiagnosticsLinter` (via `src/mcp/runtime/vscode-shim.ts`, que intercepta `require("vscode")` em runtime).
- **4 Prompts**: `data7_module_skeleton`, `data7_TEnum_pattern`, `data7_typed_recordlist`, `data7_form_skeleton` (este com layouts `simple` / `header-content-footer` / `list`).
- **167 exemplos oficiais do ERP** extraídos de `docs/Documentação Data7/**/*.html` por `scripts/extract-official-articles.js` → `out/mcp/data/articles.json`, consultáveis via `data7_get_official_example` e mesclados em `data7_describe_symbol`.
- **2 comandos novos**: `data7.installMcpServer` (re-instalação manual) e `data7.previewMcpClientConfig` (gera JSON pronto para Cursor/Claude/Continue). Walkthrough ganhou o passo 6 "Configurar MCP para sua IA".
- **Dependências runtime**: `@modelcontextprotocol/sdk` + `zod` (peer), restritas a `src/mcp/` pela fence `data7/mcp-deps-isolation`. `esbuild` como devDependency. `project_stack.mdc` atualizado.

### Adicionado (Criar telas — orientação de Forms)

- **Capítulo `docs/linguagem-basic/14-construindo-telas.md`** — idioma de composição de telas extraído do framework real (`mod_card_grouper`): layout por `Align`, hierarquia de pais, eventos + `extra As Variant`, ciclo `Show`/`Free`, e padrões de controles ricos (Grid `Cells`, editores `.Text`/`OnChange`, `PageControl`/`TabSheet`). Exposto como `data7://language/construindo-telas`.
- **7 exemplos canônicos** em `docs/example/forms/` (formulário mínimo, layout header/content/footer, eventos, grid básico, grid com dados, validação de TextBox, abas) + 1 mini-projeto buildável `docs/example/builder/tela-cadastro/` (Principal + módulo de tela). Todos passam no linter e no transpiler.
- **Tool `data7_list_controls`** — lista os controles instanciáveis de `Forms` (separando os abstratos VCL `T*` via flag `isBase`), para a IA descobrir o que existe sem carregar o namespace inteiro (~71 k tokens).
- **`data7_describe_symbol` enriquecido** — para controles `Forms`, devolve `formUsageHint` com instanciação, posicionamento por `Align` e os eventos (`On*`) resolvidos pela cadeia de herança.

### Corrigido (Linter — generics)

- **Falso-positivo `unknown-template` no operador `<>`**: `If me.OnXEvent <> NULL Then ...` (idioma de disparo de evento, onipresente em código de tela) era lido pelo analisador de generics como uso genérico `OnXEvent<>` e gerava `unknown-template` espúrio. O detector (`src/analysis/generics-analyzer.ts`) agora rejeita listas de argumentos vazias e argumentos que não começam como tipo (cobre `<>`, `<=`, `< N ...`). Regressões adicionadas em `generics-pass.test.ts`.
### Corrigido (Generics — Substituição de Parâmetros Genéricos em Níveis Profundos)

- **Substituição de Tipos em Níveis Profundos**: Corrigido o lookup de templates no `TemplateRegistry` para ser case-insensitive (`toLowerCase()`), permitindo que a substituição de tipos genéricos em method bodies e instruções (`OpaqueStatement`) funcione corretamente para quaisquer variações de caixa de caracteres. Isso evita que templates referenciados profundamente (como `TListSugarPrimitive<T, K>` dentro de `TListSugar<T, K>`) sejam instanciados incorretamente como templates crus `T` e `K` (ex: `TListSugarPrimitive_T_K`), garantindo que os tipos concretos sejam propagados corretamente por todas as assinaturas e níveis de aninhamento.

### Adicionado (Validação de Declarações Duplicadas e Conflitos de Escopo)

- **Validação de Identificadores Duplicados**: Implementada validação detalhada (linter) que detecta e relata erros (`vscode.DiagnosticSeverity.Error`) para nomes duplicados ou em conflito de escopo, cobrindo do escopo mais profundo (local) ao mais global:
  - **Método (Local)**: Bloqueia identificadores declarados mais de uma vez (ex: `Dim x` duplicado, ou variável com mesmo nome de um parâmetro do método).
  - **Classe (Membros)**: Valida membros de classe redundantes com o mesmo nome e assinatura/tipo de parâmetro, respeitando sobrecargas de método válidas (parâmetros de tipos/quantidades diferentes) e contextos diferenciados (`Shared` vs instância).
  - **Isolamento de Escopo (Prevenção de Falso-Positivos)**: Garante que membros de classe e variáveis/parâmetros locais não entrem em conflito falso-positivo com símbolos externos (tais como funções globais da biblioteca do sistema como `Copy`, `Dispose` e `Length`, ou classes de namespaces importados), uma vez que estes pertencem a namespaces ou contextos de execução isolados.
  - **Conflito de Contexto (Shared vs Instância)**: Garante que variáveis locais em métodos `Shared` conflitem apenas com membros estáticos (`Shared`) da classe, enquanto variáveis em métodos de instância conflitam com todos os membros da classe.
  - **Namespace e Globais**: Impede colisões de nomes entre classes/estruturas e outros símbolos locais, importados via `Imports` ou globais do sistema (`SYSTEM_SYMBOLS` e `Principal.bas`).
- **Exemplo de Teste de Diagnóstico**: Adicionado o exemplo de cobertura `docs/example/diagnostics/duplicate-declaration/trigger.bas` e atualizado o índice de exemplos da extensão.
- **Suíte de Testes**: Implementada uma ampla suíte de testes unitários cobrindo todos os cenários de conflitos e não-conflitos no linter.

### Alterado (Melhoria no Comportamento do Autocomplete)

- **Remoção de Gatilhos Automáticos de Digitação**: Removidos os caracteres de gatilho automático (`.` e `" "`) do `CompletionItemProvider` para evitar que a lista de sugestões pop-up apareça inoportunamente enquanto o usuário digita espaços ou acessa membros.
- **Configuração de Sugestão Manual por Padrão**: Adicionada a seção `configurationDefaults` em `package.json` desabilitando `editor.quickSuggestions` para arquivos `d7basic`. Com isso, sugestões de autocomplete serão exibidas apenas de forma explícita através do atalho padrão do editor (`Ctrl+Space`), liberando o fluxo do teclado para trabalhar harmoniosamente com sugestões inline do GitHub Copilot (tecla `Tab`).

### Refatorado (Padronização Semântica de Comandos e Atalhos)

- **Padronização Global de Categoria**: Adicionada a propriedade `"category": "Data7"` em todos os comandos no manifesto `package.json`, resultando em um prefixo uniforme `Data7: ` no Command Palette do VS Code.
- **Simplificação de Títulos**: Removido o prefixo redundante `"Data7: "` dos títulos individuais dos comandos e refinado os textos de descrição para torná-los mais objetivos e semânticos.
- **Atalhos de Teclado (Keybindings)**: Mapeados atalhos de teclado intuitivos sob o padrão `ctrl+alt` (com cláusulas `when` de contexto de idioma `editorLangId == d7basic` onde apropriado) para todos os comandos da extensão, otimizando o fluxo de trabalho sem conflitar com atalhos padrão do VS Code.

### Alterado (Desativação de Sincronização em Tempo Real)

- **Desativação de Sincronização Automática**: Desativado por completo o monitoramento em tempo real (SyncWatcher) do workspace e do arquivo de projeto final. Salvamentos de arquivos `.bas` ou modificações no `.7Proj` não dispararão mais rebuilds ou decompilações automáticas de forma a evitar concorrências e perdas de alterações locais indesejadas.
- **Decomposição Manual In-place**: Atualizado o comando `data7.decompose` ("Data7: Decompor Projeto (.7Proj → .bas)") para executar a decomposição in-place de forma manual e segura sobre o projeto ativo atual, sincronizando as dependências locais e os símbolos na sequência.
- **Depreciação de Configurações**: Marcadas as propriedades `data7.enableAutoSync` e `data7.sincronizacao` como desativadas/depreciadas no manifesto `package.json`, orientando os usuários a utilizar as ações manuais.

### Adicionado (Inferência de Tipos Genéricos com Constraints)

- **Inferência de Tipos Genéricos**: Adicionado suporte para resolver tipos genéricos baseados em restrições no `TypeResolver`, permitindo que o IntelliSense e o linter identifiquem a tipagem correta de variáveis, parâmetros, campos e expressões baseadas em parâmetros genéricos (ex: `T` em `Class MyClass<T As BaseItem>`).
  - **Mapeamento de Restrições**: Parâmetros genéricos com cláusula `As` (ex: `T As BaseItem`) resolvem para sua classe restritiva (`BaseItem`). Parâmetros sem restrição explícita (ex: `<T>`) resolvem para a classe padrão `TObject`.
  - **Suporte a Tipos Aninhados**: Substitui referências genéricas aninhadas (ex: `TList<T>` resolve para `TList<BaseItem>`, que normaliza para `TList_BaseItem`).
  - **Precedência de Escopo**: Parâmetros definidos no nível do método genérico têm precedência de resolução sobre parâmetros homônimos da classe genérica envolvente.
  - **Suporte a Hover e Definição**: Ao fazer hover sobre `T`, o editor exibe o tipo genérico, descrição e membros públicos herdados da restrição. O comando "Go to Definition" (F12) sobre o tipo `T` redireciona o usuário para a declaração da classe restritiva (ex: `BaseItem`).
  - **Testes**: Adicionados testes unitários correspondentes no arquivo [type-resolver.test.ts](file:///d:/DEV/Projects/data7/vscode-extension-data7/src/test/analysis/type-resolver.test.ts).

### Adicionado (Pré-visualização)

- **Pré-visualização do Código Transpilado em Tempo Real**: Adicionado recurso de visualização do código final transpilado de arquivos `.bas` em tempo real.
  - Oferece duas opções: abrir ao lado (`data7.previewTranspiledCode`, exibido via ícone `$(split-horizontal)` na barra de título do editor ou menu de contexto) ou abrir na aba ativa (`data7.previewTranspiledCodeActive`).
  - Atualização automática em tempo real: edições feitas no editor original atualizam instantaneamente a visualização sem necessidade de salvar o arquivo.
  - Coloração de Sintaxe: o documento virtual de visualização é associado ao language ID `d7basic` para realce de sintaxe correto.
  - **Correção de URIs de Visualização no Windows**: Alterada a estrutura de URIs customizadas do formato opaco (`data7-preview:file%3A...`) para o formato hierárquico padrão (`data7-preview:///...path...?originalScheme=file`), resolvendo uma falha crítica no Windows onde o VS Code não conseguia resolver URIs com caracteres de protocolo e colons codificados no path. Mantido o suporte a parsing legado para retrocompatibilidade com fixtures de testes.
  - **Testes**: Adicionados testes correspondentes no arquivo [preview-service.test.ts](file:///d:/DEV/Projects/data7/vscode-extension-data7/src/test/services/preview-service.test.ts).

### Corrigido (Generics — Injeção de Materialização)

- **Posicionamento de classes materializadas**: Corrigido o bug em ambas as pipelines de genéricos (AST-based e textual) onde as classes materializadas eram inseridas no topo da unidade de compilação (acima dos `Imports`). Agora:
  - Se houver um `Namespace` na unidade de compilação, as classes materializadas são adicionadas ao final desse namespace.
  - Caso contrário, elas são adicionadas ao final da unidade de compilação (ficando sempre abaixo de todos os `Imports`).
- **Testes**: Adicionados testes de unidade correspondentes em [generics-monomorphizer.test.ts](file:///d:/DEV/Projects/data7/vscode-extension-data7/src/test/project/generics-monomorphizer.test.ts) e atualizados os arquivos esperados dos testes golden em `docs/example/sugar/generic-tlist/_expected/`.

### Corrigido (Linter — escopo de membros)

- **Correção da visibilidade padrão de membros**: Alterado o indexador de símbolos para tratar membros de classe sem modificador de visibilidade explícito como `Public` (anteriormente, campos e Win32 `Declare` statements sem modificadores eram assumidos como `Private` por padrão).
- **Evitado falso-positivo na detecção de modificadores**: Ajustada a verificação de modificadores para utilizar limites de palavra (`/\bprivate\b/i`), evitando que identificadores que iniciam ou contêm a substring "private" (como `privateSecret`) fossem classificados incorretamente como privados.
- **Testes**: Adicionados testes de unidade correspondentes em [diagnostics.test.ts](file:///d:/DEV/Projects/data7/vscode-extension-data7/src/test/diagnostics/diagnostics.test.ts).

### Adicionado (Sincronização)

- **Configuração de Sincronização Opcional**: Adicionado suporte para configurar a sincronização em blocos no VS Code (`data7.sincronizacao.modo`) e diretamente no arquivo `data7.json` do projeto (`sincronizacao.modo`).
- **Modos de Sincronização**: Suporte aos modos `"estrutura <> projeto.7proj"`, `"estrutura > projeto.7proj"`, `"projeto.7proj > estrutura"`, e `"disabled"` / `"desativado"`.

### Corrigido (Sincronização — SyncWatcher)

- **Correção definitiva de concorrência e reversão**: Preservados os timestamps no cache em vez de removê-los no primeiro match, solucionando a reversão indevida causada por múltiplos eventos rápidos de gravação de arquivos no Windows. Janela temporal de ignoramento aumentada para 5 segundos.
- **Testes**: Adicionados testes de unidade correspondentes em [sync-watcher.test.ts](file:///d:/DEV/Projects/data7/vscode-extension-data7/src/test/services/sync-watcher.test.ts).

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
