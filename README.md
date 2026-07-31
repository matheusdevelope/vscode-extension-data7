# Data7 Dev Studio integration

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/matheusdevelope.vscode-extension-data7?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=matheusdevelope.vscode-extension-data7)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/matheusdevelope.vscode-extension-data7)](https://marketplace.visualstudio.com/items?itemName=matheusdevelope.vscode-extension-data7)
[![CI](https://github.com/matheusdevelope/vscode-extension-data7/actions/workflows/ci.yml/badge.svg)](https://github.com/matheusdevelope/vscode-extension-data7/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Extensão do VS Code que fornece suporte completo de desenvolvimento (Language Server Features) para projetos do **ERP Data7**, manipulando arquivos `.bas` (Data7 Basic) e projetos `.7Proj` (XML).

## Features

- O linter resolve campos homônimos a tipos do sistema como instância (`grid.LoadFromXLS`), namespaces vs campos privados (`migracoes.migrar`), tipos qualificados homônimos, casts `Tipo(expr)`, indexador `lista(i)`, `Property Global`, `toString(format)` e `StringList`/`TStringList` intercambiáveis.
- Quick Fixes do linter permanecem disponiveis quando o VS Code entrega o range sem `context.diagnostics`; `shared-return-global-function` tambem oferece correcao para introduzir uma variavel temporaria antes do retorno global em `Shared Function`.
- O linter publica `unterminated-block` para blocos sem fechamento e os providers de completion, hover, definition, semantic tokens, references e rename ignoram comentarios/strings.
- O parser recupera member access incompleto localmente: `obj.` sem `_` gera `incomplete-member-access`, nao consome comentarios/proximas linhas e nao duplica `unknown-member` com membro vazio.
- Autocomplete apos casts dentro de chamadas, como `CStr(Form(pItem).)`, resolve o receiver sob o cursor; o Quick Fix de chamada sem parenteses envolve a chamada raiz (`Print(...)`) sem alterar cadeias internas.
- O formatter preserva indentacao de chamadas/cadeias multiline com lambdas VB-like, arrays literais, continuation `_` e linhas terminadas em `.`, sem deslocar comentarios e `Return` para a coluna zero. Lambdas de bloco coladas em chamadas, como `ForEach(Sub...)`, sao reposicionadas para a forma canonica multiline.
- O parser/linter ignora comentarios em listas de argumentos multiline, resolve parametros/variaveis delegate chamados como funcao (`pRegra(...)`) e reporta `missing-import` para chamadas nao qualificadas a funcoes de namespaces nao importados.
- `loose-value-statement` cobre cadeias de valor standalone como `pItem.Margins.Bottom`, inclusive quando o receiver e `TObject`/`Variant` ou nao foi resolvido.
- O linter preserva a identidade da classe ativa ao resolver `Me`/`MyBase`, evitando confundir campos homonimos declarados em classes diferentes ou em dependencias com o mesmo nome.
- Toda `Class` deve declarar ao menos um `Sub New`; o diagnostico `missing-mybase-new` cria o construtor sem parametros ou insere `MyBase.New()` quando ele esta ausente.
- Acessos a membros de variaveis tipadas com tipos inexistentes ou inacessiveis tambem sao diagnosticados, alem do `unknown-type` da declaracao.
- Tipos nativos/externos sem declaracao podem ser liberados pontualmente com `' data7:external-type <Tipo>`; o Quick Fix de `unknown-type` adiciona a diretiva na declaracao, no escopo ou no arquivo.
- Autocomplete e Go to Definition usam o acesso encadeado sob o cursor mesmo em linhas com multiplas cadeias, preservando a inferencia correta do receiver.
- Imports desconhecidos sao reportados como erro `module-not-found`; `unused-import` e emitido apenas para namespaces conhecidos do workspace ou da System Library que nao sao referenciados.
- O Quick Fix de `Return` permanece disponivel mesmo quando o VS Code nao preserva os metadados internos do diagnostico.

- O Quick Fix de `Return` atribui diretamente o valor fora de condicionais e adiciona `Exit Function` ou `Exit Property` apenas dentro de ramificacoes. Dentro de `Catch`, Function/Property preservam `Return` e o diagnostico `return-assignment-in-catch` troca retorno por atribuicao para `Return`. `MyBase.Free()` e inserido no fim do `Sub Free`, depois das liberacoes de recursos da classe.

- O linter reconhece dependencias transitivas entre `Imports`, promocao numerica sem perda e a API global de compatibilidade `dateUtils.toStringFormat(...)`.
- O linter resolve variaveis globais declaradas no escopo superior, com prioridade para `Principal.bas`, e escolhe overloads por compatibilidade de tipos dos argumentos.
- Multiplas chamadas do mesmo overload na mesma linha (ex.: `EnumToInt(TFileMode.Open()), EnumToInt(TFileAccess.Read())`) resolvem cada site independentemente; primitivos correlacionados (`Char`/`String`, `Integer`/`Long`, etc.) sao aceitos como compativeis.
- O linter aceita indexacao em `Variant`/`String`, resolve chamadas sem receiver respeitando imports antes de homonimos globais e reconhece `Net`/`ftBinary`/`ftASCII` como itens nativos da System Library.
- A System Library cobre flags de `Forms.GridConfigs` usadas em projetos legados e `TStringList`/`TStrings` podem ser indexados diretamente com `lista[i]`.
- A System Library tambem cobre as funcoes nativas de primitivos do manual `Funcoes Projetos Basic.txt`, incluindo conversoes e helpers de `String`/`AnsiString`, inteiros, floats, `Currency`, `Boolean`, chars e `TDateTime`.
- `private-member-access` permanece estrito, destaca o token exato do membro privado em cadeias longas e o autocomplete nao sugere membros `Private` fora da classe declarante. `redundant-terminal-exit` remove `Exit`/`Return` vazio terminal sem confundir com `missing-return-value`.
- Quick Fixes corretivos aparecem antes das supressoes, supressoes de linha sao emitidas com `data7:disable-next-line`, `unreachable-declaration` agrupa blocos inalcançaveis e o arquivo `.bas` ativo pode ser corrigido pelo comando `Data7: Linter - Corrigir Arquivo Atual`.
- Diagnosticos `missing-mybase-new` e `missing-mybase-free` valem apenas para `Class`; `Structure` e tratada como estatica e nao recebe `Sub New`, `Sub Free` ou quick fix de destrutor.
- O linter respeita escopo de variavel de `Catch`, aceita guardas legados `Exit Sub` em `Function` e limita `chained-global-function-assignment` a atribuicoes cujo RHS e diretamente a cadeia de funcao global.
- O motor de diagnosticos usa um walker AST unico que fornece contexto para rules modulares de imports, membros, tipos, fluxo, arrays e ciclo de vida, preservando os mesmos codigos e payloads para Quick Fixes.
- Instrucoes `Declare` seguem a sintaxe nativa: o nome nao recebe `()`, e parametros ficam depois de `Lib`/`Alias`; o quick fix `declare-name-parentheses` remove parenteses indevidos do nome.
- A execução via F5 usa `data7.json#opcoes` como fonte principal para conexão, empresa, filial e usuário; `data7.databaseConnectionId` e apenas fallback para execução direta de `.7Proj` fora de um projeto decomposto.
- Antes de iniciar o Executor no F5, o projeto é reanalisado pelo parser/linter e a execução é cancelada se houver erro. Chamadas qualificadas em namespaces/tipos, como `console.clear()`, também são validadas como `unknown-member` quando o membro não existe.
- Quando o F5 e cancelado por erros do linter, os diagnosticos sao publicados e o painel Problems e aberto automaticamente para navegacao.
- Logs de execuções ficam acumulados no canal dedicado `Data7 Logs`, separado do output interno da extensão.
- A validacao de modulos ignora acessos abreviados de `With` (`.Membro`), evitando falso `module-not-found` com nome vazio. Dentro de `With` (inclusive aninhado), autocomplete e hover apos `.` listam membros do objeto ativo; chamadas como `print .Text` geram `call-parentheses-mismatch` em vez de `loose-value-statement`.
- A System Library inclui aliases iniciais para `System.IOUtils.TFile`, `System.IOUtils.TPath` e `IO.File.ZipFile`; chamadas estaticas dessas classes nao sao tratadas como modulos externos.
- Warnings `unused-import` oferecem Quick Fix para remover a diretiva `Imports`, inclusive quando o VS Code fornece um codigo de diagnostico estruturado.
- **Otimizações de Performance do Linter**: Cache global de herança de membros ($O(1)$) e detecção inteligente de delta de namespaces. Reavaliação de dependências em cascata movida exclusivamente para o evento de salvamento, otimizando a digitação. Diagnóstico de `return-unrecommended` ignora propriedades `Property Get` por não suportarem `Exit Property` nativamente.

### IntelliSense e validação

- **Autocompletar** inteligente sensÃ­vel ao contexto (classes, namespaces, métodos, propriedades, eventos).
- **Auto-importação**: ao escolher um tipo de namespace não importado, a diretiva `Imports` é adicionada automaticamente.
- **Hover** com assinatura completa do sÃ­mbolo, ancestrais e descrição.
- **Go to Definition** (`F12`), **Find All References** (`Shift+F12`), **Rename** (`F2`).
- **Outline / Breadcrumbs / Sticky scroll** com sÃ­mbolos hierárquicos.
- **Signature Help** com destaque do parâmetro atual.
- **Folding** semântico de `Namespace`, `Class`, `Sub`, `Function`, `If`, `For`, `While`.
- **Linter** com diagnósticos canônicos (`missing-import`, `unused-import`, `unused-code`, `unreachable-declaration`, `unknown-member`, `module-not-found`, `module-not-declared`, `duplicate-import`, `private-member-access`, `event-signature-mismatch`).
- **Quick Fixes e Correções em Massa**: Ações rápidas individuais e em lote ("Aplicar a todas as ocorrências no arquivo") para importar/remover dependências, instalar módulos ausentes, resolver erros de escrita ("Você quis dizer X?") e adicionar `()` em instanciações `New Tipo`.
- O parser/transpiler preserva arrays nativos fixos do PaxCompiler/Data7 Basic, como `Private _containers(10) As Container` e `Dim _matrix(10, 5) As Integer`.
- Lambdas materializadas em cadeias `TTList.Filter(...).Map_*(...).Reduce_*` preservam a assinatura completa do delegate, incluindo `extra As Variant`, e `Every` emite `Not (<comparacao>)` para manter a precedencia correta.
- O monomorfizador materializa retornos genericos fluentes de qualquer classe concreta, evitando metodos ausentes em cadeias como `Classe<T>.Metodo<TOut>() As OutraClasse<TOut>` e descartando usos ainda abertos como `Classe<T>` em comentarios ou templates.
- O parser/linter aceita propriedades indexadas com multiplos argumentos em colchetes, como `Grid.Cells[0, 1]`, alem da forma com parenteses; metodos/funcoes seguem restritos a parenteses, e `[]` tambem permanece valido para arrays e matrizes nativas.

### Sistema de projeto

Os diagnÃƒÂ³sticos de sintaxe/estilo agora cobrem `finally-block-unsupported`, `elseif-whitespace`, `missing-then`, `return-unrecommended` e `return-assignment-in-catch`, com quick fixes correspondentes para o arquivo atual, `source.fixAll.data7` e correção em massa do workspace. Para `missing-then`, comentários inline e seu espaçamento de alinhamento são preservados.

- **Decompositor** (`.7Proj` â†’ árvore de `.bas`): abre um `.7Proj` e gera a estrutura fÃ­sica do projeto.
- **Builder** (`.bas` â†’ `.7Proj`): empacota a árvore de volta no XML do Data7 com escaping seguro, GUID novo e respeitando dependências; pastas virtuais são reconciliadas de forma case-insensitive (evita duplicar `Modules`/`modules` no Windows).
- **Fluxo manual seguro**: decompõe `.7Proj` para edição e recompila sob comando explÃ­cito.
- **Run** (F5): executa o projeto via Executor do Data7.
- **Open in DevStudio**: abre o `.7Proj` no Data7 Developer Studio.

### Repositório de módulos compartilhados

- **Gerenciamento de Dependências ExplÃ­cito**: Dependências e módulos compartilhados agora são declarados explicitamente no arquivo `data7.json` (seção `dependencies`).
- **Gerenciador de Módulos tipo npm**: o `ModuleOrchestrator` centraliza install/update/remove em lote, resolve versões disponíveis em repositório local (`~/.data7/local_modules`) ou online (GitHub) e mantém `data7_modules/` sincronizado com o manifesto. A extensão também espelha sempre os `core_modules` embarcados em `data7_modules/core_modules`, mesmo sem dependências declaradas, para disponibilizar runtimes de sugars como `mod_tlist`/`TTList`.
- **Sidebar de módulos**: o Gerenciador de Módulos lista módulos disponíveis separados por repositório local e online, mostra estado instalado/atualizável, permite marcar múltiplos itens por checkbox e executar instalar, atualizar ou remover pela barra da view ou pelo menu do item.
- **Catálogo online por releases**: módulos online só entram no catálogo quando existe uma release com tag válida no formato `<modulo>-v<versao>`; o catálogo é cacheado e reconsultado em intervalo longo para reduzir rate limit da API do GitHub.
- **Publicação segura**: antes de autenticar no GitHub, criar fork ou abrir PR, a extensão verifica se o módulo já existe online. Se não houver alteração real, a publicação é bloqueada; se houver alteração sem versão maior, a extensão exige bump de versão.
- **Unpublish online**: módulos publicados podem ser removidos do catálogo por PR de unpublish. A remoção é permitida somente para `module.publisher` registrado no manifesto publicado ou para o dono do repositório de módulos.
- **Projetos publicáveis como módulo**: `data7.json` pode declarar `module.name` como nome canÃ´nico do pacote. A extensão usa esse nome na publicação e impede instalar o próprio módulo como dependência dele mesmo.
- **Sincronização**: A extensão baixa e sincroniza automaticamente dependências ausentes para a pasta `data7_modules/` e mantém `data7_modules/core_modules/` alinhado com a versão instalada da extensão. O construtor injeta automaticamente a flag `@Module-Imported` em arquivos de dependência externa para evitar conflitos na decomposição.
- Repositório privado de módulos isolado (`globalStoragePath`) que evita poluir o disco.
- Módulos locais do próprio projeto vivem nativamente em `src/`, sem a obrigatoriedade da flag `@Module`.
- Módulos orientados a objeto usam `TTObject` para permitir armazenamento seguro em `TTList` e descarte determinÃ­stico de recursos.
- Lambdas usam sintaxe VB-like (`Function(...) expr`, bloco `Function ... End Function` ou `Sub ... End Sub`) e sao validadas contra delegates pelo linter, incluindo o corpo da lambda e os tipos dos argumentos nas chamadas internas. Elas podem ser passadas como argumentos em chamadas multiline, chamadas encadeadas com continuacao explicita `_` apos o ponto, metodos genericos como `Reduce<Double>(...)`, referencias de metodo compativeis com delegates, como `Find(Helper.FindMaiorQue4)`, e campos delegate chamados como metodo, como `OnExecute(...)`. Em `Function` lambda, use `Return` para devolver valores em blocos; retorno por atribuicao ao nome da funcao nao se aplica porque a lambda nao tem nome. O sugar `array-list` aproveita esse suporte para expandir `map`, `filter`, `find`, `findIndex`, `some`, `every`, `reduce` e `forEach` sobre `TTList`, inclusive em `Return lista.map(...)` de funcoes que retornam `TTList_*`; `Map<TOut>` infere o tipo de saida pelo retorno da lambda e `Reduce<TAcc>` materializa handlers com a assinatura completa do delegate. Hover, completion e semantic tokens exibem campos delegate com a assinatura callable esperada.
- O sugar declarativo `Enun X` gera tipos derivados de `TEnum`, uma base `TTObject` com cache de opções e suporte a coleções, sem conflitar com `Enum X` nativo.
- Os módulos core usam `mod_logger` como único fluxo de logging; ele formata `TDateTime`, `TTObject` e objetos nativos de acordo com seu tipo concreto.

Exemplo mÃ­nimo de projeto publicável como módulo:

```json
{
  "nome": "forms",
  "version": "1.0.0.0",
  "module": {
    "enabled": true,
    "name": "forms",
    "repository": "matheusdevelope/data7-modules",
    "publisher": "usuario-github"
  },
  "dependencies": {}
}
```

### Arquitetura (Monorepo)

O projeto é estruturado como um monorepo via NPM Workspaces, contendo:

- `@data7/core`: Kernel da linguagem (parser, linter, builder, indexador) independente do VS Code.
- `@data7/cli`: Interface CLI para integração contÃ­nua (CI) e uso standalone.
- `vscode-extension-data7`: A extensão gráfica do VS Code.

O `@data7/core` nao importa o modulo runtime `vscode`; ele usa um adapter puro em `src/platform/vscode-api.ts`. A extensao instala a API real do VS Code no `activate`, enquanto CLI e MCP usam a implementacao standalone do core.

O servidor MCP (`docs/mcp/`) orienta agentes de IA a preferir recursos modernos da linguagem — sugar `array-list`, generics (`TTList<T>`) e `Enun` — em vez de padroes legados como `StringList` manual ou subclasses `TTList` com CType. Consulte `data7://idioms` no cliente MCP.

### Documentação da System Library

- **`Data7: Gerar Documentação da System Library`** â€” gera `.md` por namespace com classes, eventos, propriedades, cadeia de herança e cross-links.
- **`Data7: Sincronizar Documentação no AGENTS.md`** â€” injeta um bloco delimitado no `AGENTS.md` do projeto, mantido idempotentemente, para agentes de IA (Cursor/Copilot Chat) lerem automaticamente.

## Como começar

1. Instale a extensão (ou rode em modo dev com `F5` dentro deste repositório).
2. Abra uma pasta contendo um arquivo `.7Proj` â€” a extensão oferecerá decompor para edição no VS Code.
3. Abra **Data7: Configurações** na sidebar **Ações Rápidas** (seção Configuração) e configure o caminho do Executor (a extensão também perguntará na 1ª execução).
4. Use `F5` para rodar o projeto, `Ctrl+Shift+B` para compilar.

## Empacotamento VSIX

Use `npm run build:extension -w vscode-extension-data7` ou rode o mesmo comando dentro de `packages/data7-vscode`. O prepublish compila `@data7/core`, gera o bundle minificado da extensão com `esbuild`, copia os assets runtime para a pasta do pacote e chama `vsce package --no-dependencies` para não seguir os links dos workspaces do monorepo.

## Comandos principais

Comandos aparecem na paleta agrupados por categoria (`Data7`, `Data7 Projeto`, `Data7 Módulos`, `Data7 Linter`, etc.). Acesso rápido pela sidebar **Ações Rápidas** (agrupadas por seção).

| Comando (paleta)                          | Atalho             | Descrição                              |
| ----------------------------------------- | ------------------ | -------------------------------------- |
| `Data7: Configurações`                    | —                  | Editor interno de configurações        |
| `Data7 Projeto: Novo Projeto`             | `Ctrl+Alt+N`       | Cria projeto com `data7.json` completo |
| `Data7 Projeto: Abrir Projeto`            | `Ctrl+Alt+O`       | Decompõe `.7Proj` em `.bas` editável   |
| `Data7 Projeto: Compilar`                 | `Ctrl+Shift+B`     | Empacota no `.7Proj`                   |
| `Data7 Projeto: Executar`                 | `F5`               | Roda no Executor                       |
| `Data7 Projeto: Decompor`                 | `Ctrl+Alt+X`       | Decompõe in-place o projeto ativo      |
| `Data7 Módulos: Instalar Módulo`          | `Ctrl+Alt+I`       | Instala módulo do repositório          |
| `Data7 Módulos: Sincronizar Dependências` | `Ctrl+Alt+U`       | Atualiza `data7.json#dependencies`     |
| `Data7 Linter: Analisar Projeto`          | `Ctrl+Alt+L`       | Linter em todo o workspace             |
| `Data7 Linter: Corrigir Arquivo`          | `Ctrl+Alt+Shift+F` | Quick fixes no `.bas` ativo            |
| `Data7 Linter: Corrigir Projeto`          | `Ctrl+Alt+F`       | Correções em todo o workspace          |
| `Data7 Prévia: Prévia (Lado a Lado)`      | `Ctrl+Alt+P`       | Código transpilado ao lado             |
| `Data7: Mostrar Saída`                    | `Ctrl+Alt+Shift+O` | Canal de log da extensão               |

Comandos exclusivos de contexto (Gerenciador de Módulos, menu do editor) não aparecem na paleta: instalar/atualizar/remover selecionados, prévia na aba atual, instalação em lote via quick fix.

## Configurações

Todas as opções da extensão ficam no editor interno **Data7: Configurações** (`data7.settings.open`), persistidas em `extension-settings.json` no armazenamento global da extensão.

| Grupo               | Opções                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| Ambiente            | `executorPath`, `sharedModulesPath`                                      |
| Execução (fallback) | `userName`, `companyCode`, `branchCode`, `databaseConnectionId`          |
| Indexação / linter  | `exclude`, `diagnosticSeverity`                                          |
| Funcionalidades     | `features.*` (generics, sugars, linter, save, build, preview, workspace) |
| Açúcares            | `sugars.enabled`, `sugars.enabledIds`, `sugars.disabledIds`              |

Projetos usam `data7.json` para metadados de build e execução (`opcoes.*`, `build.optimization`, `dependencies`). Novos projetos já nascem com o bloco completo `build.optimization`.

`data7.features` mantém os recursos existentes ativos por padrão, exceto o auto-fix antes do build, que fica desligado para evitar uma varredura completa a cada execução. Exemplo para usar somente o núcleo, sem extensões de linguagem nem automações de workspace:

```json
{
  "data7.features": {
    "language": { "generics": false, "sugars": false },
    "diagnostics": { "enabled": true, "lintWorkspaceOnStartup": false },
    "workspace": {
      "detectProjectFiles": false,
      "installMcpServerOnStartup": false
    },
    "save": { "autoFixOnSave": false, "autoFormatOnSave": false },
    "build": { "autoFixBeforeBuild": false },
    "preview": { "enabled": false }
  }
}
```

`data7.sugars` continua selecionando IDs individuais quando `features.language.sugars` está ativo. Com `features.diagnostics.enabled: true`, o linter live acompanha arquivos `.bas` físicos abertos **apenas em workspaces com `data7.json` na raiz**, com debounce de 400 ms e re-lint incremental de dependentes (grafo de imports + arquivos que ainda têm Problems; `Principal.bas` espalha para o projeto); o comando **Data7: Reiniciar/Rodar Linter no Projeto** limpa Problems, invalida caches/`.data7/analysis-cache.json` e reanalisa o workspace inteiro. Abrir um `.bas` fora de um projeto Data7 mantém o processamento básico de idioma, sem indexação nem linter de projeto. `features.diagnostics.lintWorkspaceOnStartup` executa essa varredura completa ao abrir a IDE quando habilitado, mas fica desligado por padrão para evitar custo inicial em projetos grandes. Para medir gargalos do motor de lint em um projeto real, use `npm run lint:benchmark -w @data7/core` (variável `DATA7_BENCHMARK_WORKSPACE` opcional; padrão `Modules/demo` — referência atual: ~34s cold sequencial / ~13s cold com worker threads (8 cores) / ~109ms warm para 85 arquivos). O motor usa cache semântico por arquivo (`SemanticLintCache`), cache por corpo de método/propriedade (`DeclarationLintCache`), cache consolidado de resolução de tipos (`lint-type-resolution-cache`), índices de escopo (`LintUnitIndex`, `LocalScopeIndex`, `FileLineContextIndex`), resolução lazy de overloads (`pickCallableMember`) e pool de worker threads (`lint-worker-pool`) para varredura cold multi-core via snapshot do indexador. Na extensão, o comando **Data7: Reiniciar/Rodar Linter no Projeto** e `features.diagnostics.lintWorkspaceOnStartup` usam worker threads para arquivos fechados; `DATA7_LINT_CONCURRENCY`, `DATA7_LINT_WORKERS` e `DATA7_LINT_USE_WORKERS=0` (desliga workers) ajustam o comportamento. O lint live aguarda o fim da indexação inicial, coalesce propagação a dependentes e suprime refresh redundante após correções automáticas; a correção em massa reanalisa o conjunto após limpar Problems. Defina `DATA7_LINT_PROFILE=1` no ambiente de debug para logs por estágio no canal Data7. `features.build.autoFixBeforeBuild` fica desligado por padrão para evitar correções automáticas antes de F5, build ou Developer Studio; quando ligado, processa somente os `.bas` alterados desde o último build da sessão. Mesmo com auto-fix desligado, o F5 reanalisa o projeto e não inicia o Executor enquanto houver erros de parser/linter. Build, execução e abertura no Developer Studio mantêm snapshots em `.data7/build-cache/`: se `src/`, `data7_modules/`, `data7.json` e o `.7Proj` de saÃ­da não mudaram, a extensão pula o empacotamento e abre/executa imediatamente; quando há mudança, o Builder reutiliza transpilações cacheadas dos arquivos inalterados. O F5 gera sua variante com logger em `.data7/run/*.run.7Proj`, preservando o `.7Proj` standard usado pelo Developer Studio. Para uma correção explÃ­cita no editor atual, use **Data7: Linter - Corrigir Arquivo Atual**; para o workspace inteiro, use **Data7: Corrigir Erros de Sintaxe/Estilo no Projeto Completo**. A flag legada `data7.autoFormatOnSave` continua sendo aceita; prefira `data7.features.save.autoFormatOnSave` para instalações novas. Recursos registrados na ativação (detecção de projeto e prévia) passam a valer após recarregar a janela.

O linter também cobre regras de robustez usadas nos demos: acesso de membro incompleto (`obj.`), `Const` tipada, `Shared` inválido fora de rotinas/estado `Private Shared`, `Public` redundante, declarações não usadas, acesso solto a campo/propriedade/constante, `invalid-declaration` para `Overrides` mal formado ou sem base `Overridable`/`MustOverride`, e supersets de herança `MustInherit`/`NotInheritable`/`MustOverride`. Esses modificadores de herança existem para análise da extensão e são removidos antes do código final entregue ao compilador Data7.

O manifesto `data7.json` aceita o bloco `build.optimization` para o pipeline de otimização em implantação: `minify.enabled`, `minify.stripComments`, `minify.collapseWhitespace` (default `false`), `prune.enabled`/`prune.report`/`prune.alwaysInclude`/`prune.remove.*` (inclui `localVariables` para DCE de `Dim`/`Const` locais), `uglify.enabled` e `sourceMap`. O passe `prune` remove declarações não usadas a partir de `Principal.bas`/`Main` (namespaces, classes, methods, etc.), com cada unidade chaveável em `prune.remove`. O linter reutiliza o mesmo motor de reachability e emite `unused-code` no editor para validar o que o prune removeria. Minify é só textual; remoção semântica é exclusiva do prune. Com `uglify.enabled`, o build renomeia namespaces/tipos/membros/locais de usuário para nomes curtos (System Library e `@data7:keep-name` preservados). Com `sourceMap` (default `true`), o build grava `<projeto>.7Proj.map.json` (e, se uglificar, `<projeto>.uglify-map.json`) ao lado do `.7Proj` e em `.data7/build/`, mapeando linhas/símbolos gerados de volta ao `.bas` original. Ao abrir o `.7Proj` no VS Code, **Hover** e **Go to Definition** (`F12`) sobre uma linha dentro de `<Codigo>` saltam para o fonte original e, quando o identificador foi uglificado, mostram o nome de origem.

## Suprimir diagnósticos com comentários

Use comentários inline para suprimir diagnósticos do linter sem desativar a regra globalmente:

```basic
' Suprime TODOS os diagnósticos nesta linha
me.x = y  ' data7:disable-line

' Suprime apenas códigos especÃ­ficos (separe por vÃ­rgula)
g.PopupMenu = Nothing  ' data7:disable-line unsupported-member

' Suprime na próxima linha não-vazia (útil para gerar handler temporário)
' data7:disable-next-line missing-import
Dim t As TipoNaoImportado

' Aceita um tipo nativo/externo apenas nesta declaracao.
Dim retorno As RetornoDelphi  ' data7:external-type RetornoDelphi

' Aceita o tipo no bloco imediatamente abaixo.
' data7:external-type TNative scope=block
Sub Run()
   Dim native As TNative
   native.QualquerMembro = 1
End Sub

' Aceita o tipo no arquivo inteiro.
' data7:external-type TJSONObject scope=file
```

Sintaxe aceita:

- `' data7:disable-line` â€” suprime todos os códigos na mesma linha.
- `' data7:disable-line CODE1,CODE2` â€” suprime apenas códigos listados.
- `' data7:disable-next-line` â€” aplica Ã  próxima linha não-vazia.
- `REM data7:disable-line` â€” `REM` também é aceito como comentário Data7 Basic.
- `' data7:external-type Tipo` - aceita um tipo nativo/externo na declaracao da linha atual; a variavel passa a se comportar como `Variant` para validacao de membros.
- `' data7:external-type Tipo scope=block` - aceita o tipo no bloco imediatamente abaixo ou no bloco onde a diretiva esta.
- `' data7:external-type Tipo scope=file` - aceita o tipo em todo o arquivo.

Os códigos disponíveis estão na seção de [Diagnósticos canÃ´nicos](./project_context.md#44-códigos-canÃ´nicos-de-diagnóstico-srcdiagnosticsdiagnostic-codests) do `project_context.md`. O **quick fix** "Suprimir warning aqui" também adiciona automaticamente a diretiva.

## Workspace Trust

A extensão declara `untrustedWorkspaces.supported: "limited"`. Em workspaces não confiáveis:

- âœ… Continuam ativos: IntelliSense de leitura, hover, navegação, documentação da System Library.
- âŒ Ficam desabilitados: build/run via Executor, modificação do `.7Proj`, escrita no repositório privado.

## Arquitetura

Veja [`project_context.md`](./project_context.md) para a descrição arquitetural completa, e [`docs/system-library/README.md`](./docs/system-library/README.md) para a referência gerada de tipos nativos do ERP.

Para mudanças no transpiler, parser ou açúcares sintáticos, siga também o contrato de [`docs/sugar-architecture.md`](./docs/sugar-architecture.md): cada sugar é isolado em `src/project/sugars/plugins/<id>/`, e sua configuração não pode causar perda de código.

O parser preserva cadeias condicionais escritas como `ElseIf` ou `Else If`, serializando-as na forma canÃ´nica `ElseIf`.
Também preserva `Throw` inline e usa as declarações de tipo do código para evitar conversões `CStr` redundantes.

## Desenvolvimento

```bash
npm install
npm run compile      # compila os workspaces em ordem: core -> vscode -> cli
npm run watch        # recompila core, vscode e cli em modo incremental
npm test             # roda toda a suÃ­te de testes (node --test)
```

Para depurar a extensão, abra este repositório no VS Code e pressione `F5` para iniciar a Extension Host. O pre-launch task `npm: watch` espera a primeira compilação de todos os workspaces; depois, alterações em `packages/data7-core`, `packages/data7-vscode` e `packages/data7-cli` são recompiladas em background. Use `Ctrl+R` na Extension Host para recarregar a IDE com os artefatos recém-gerados.

## Licença

[MIT](./LICENSE)

Nota de IntelliSense: em arquivos `.bas`, a lista de autocomplete abre automaticamente ao digitar `.`. No gatilho manual (`Ctrl+Space`) e nas conclusões por membro, a ordenação prioriza bloco, método, classe, herança, namespace e global, sempre em ordem alfabética dentro de cada escopo. Em acessos por receiver (`obj.`), hover e autocomplete usam o tipo concreto resolvido para `obj`; se o membro nao existir nesse tipo, o provider nao reaproveita um simbolo global homonimo de outro escopo.
