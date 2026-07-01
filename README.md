# Data7 Dev Studio integration

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/matheusdevelope.vscode-extension-data7?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=matheusdevelope.vscode-extension-data7)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/matheusdevelope.vscode-extension-data7)](https://marketplace.visualstudio.com/items?itemName=matheusdevelope.vscode-extension-data7)
[![CI](https://github.com/matheusdevelope/vscode-extension-data7/actions/workflows/ci.yml/badge.svg)](https://github.com/matheusdevelope/vscode-extension-data7/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

ExtensÃ£o do VS Code que fornece suporte completo de desenvolvimento (Language Server Features) para projetos do **ERP Data7**, manipulando arquivos `.bas` (Data7 Basic) e projetos `.7Proj` (XML).

## Features

- Quick Fixes do linter permanecem disponiveis quando o VS Code entrega o range sem `context.diagnostics`; `shared-return-global-function` tambem oferece correcao para introduzir uma variavel temporaria antes do retorno global em `Shared Function`.
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
- O linter aceita indexacao em `Variant`/`String`, resolve chamadas sem receiver respeitando imports antes de homonimos globais e reconhece `Net`/`ftBinary`/`ftASCII` como itens nativos da System Library.
- A System Library cobre flags de `Forms.GridConfigs` usadas em projetos legados e `TStringList`/`TStrings` podem ser indexados diretamente com `lista[i]`.
- A System Library tambem cobre as funcoes nativas de primitivos do manual `Funcoes Projetos Basic.txt`, incluindo conversoes e helpers de `String`/`AnsiString`, inteiros, floats, `Currency`, `Boolean`, chars e `TDateTime`.
- `private-member-access` permanece estrito, destaca o token exato do membro privado em cadeias longas e o autocomplete nao sugere membros `Private` fora da classe declarante. `redundant-terminal-exit` remove `Exit`/`Return` vazio terminal sem confundir com `missing-return-value`.
- Quick Fixes corretivos aparecem antes das supressoes, supressoes de linha sao emitidas com `data7:disable-next-line`, `dead-code` agrupa blocos inalcanÃ§aveis e o arquivo `.bas` ativo pode ser corrigido pelo comando `Data7: Linter - Corrigir Arquivo Atual`.
- Diagnosticos `missing-mybase-new` e `missing-mybase-free` valem apenas para `Class`; `Structure` e tratada como estatica e nao recebe `Sub New`, `Sub Free` ou quick fix de destrutor.
- O linter respeita escopo de variavel de `Catch`, aceita guardas legados `Exit Sub` em `Function` e limita `chained-global-function-assignment` a atribuicoes cujo RHS e diretamente a cadeia de funcao global.
- O motor de diagnosticos usa um walker AST unico que fornece contexto para rules modulares de imports, membros, tipos, fluxo, arrays e ciclo de vida, preservando os mesmos codigos e payloads para Quick Fixes.
- Instrucoes `Declare` seguem a sintaxe nativa: o nome nao recebe `()`, e parametros ficam depois de `Lib`/`Alias`; o quick fix `declare-name-parentheses` remove parenteses indevidos do nome.
- A execuÃ§Ã£o via F5 usa `data7.json#opcoes` como fonte principal para conexÃ£o, empresa, filial e usuÃ¡rio; `data7.databaseConnectionId` e apenas fallback para execuÃ§Ã£o direta de `.7Proj` fora de um projeto decomposto.
- Antes de iniciar o Executor no F5, o projeto Ã© reanalisado pelo parser/linter e a execuÃ§Ã£o Ã© cancelada se houver erro. Chamadas qualificadas em namespaces/tipos, como `console.clear()`, tambÃ©m sÃ£o validadas como `unknown-member` quando o membro nÃ£o existe.
- Logs de execuÃ§Ãµes ficam acumulados no canal dedicado `Data7 Logs`, separado do output interno da extensÃ£o.
- A validacao de modulos ignora acessos abreviados de `With` (`.Membro`), evitando falso `module-not-found` com nome vazio.
- A System Library inclui aliases iniciais para `System.IOUtils.TFile`, `System.IOUtils.TPath` e `IO.File.ZipFile`; chamadas estaticas dessas classes nao sao tratadas como modulos externos.
- Warnings `unused-import` oferecem Quick Fix para remover a diretiva `Imports`, inclusive quando o VS Code fornece um codigo de diagnostico estruturado.
- **OtimizaÃ§Ãµes de Performance do Linter**: Cache global de heranÃ§a de membros ($O(1)$) e detecÃ§Ã£o inteligente de delta de namespaces. ReavaliaÃ§Ã£o de dependÃªncias em cascata movida exclusivamente para o evento de salvamento, otimizando a digitaÃ§Ã£o. DiagnÃ³stico de `return-unrecommended` ignora propriedades `Property Get` por nÃ£o suportarem `Exit Property` nativamente.

### IntelliSense e validaÃ§Ã£o

- **Autocompletar** inteligente sensÃ­vel ao contexto (classes, namespaces, mÃ©todos, propriedades, eventos).
- **Auto-importaÃ§Ã£o**: ao escolher um tipo de namespace nÃ£o importado, a diretiva `Imports` Ã© adicionada automaticamente.
- **Hover** com assinatura completa do sÃ­mbolo, ancestrais e descriÃ§Ã£o.
- **Go to Definition** (`F12`), **Find All References** (`Shift+F12`), **Rename** (`F2`).
- **Outline / Breadcrumbs / Sticky scroll** com sÃ­mbolos hierÃ¡rquicos.
- **Signature Help** com destaque do parÃ¢metro atual.
- **Folding** semÃ¢ntico de `Namespace`, `Class`, `Sub`, `Function`, `If`, `For`, `While`.
- **Linter** com diagnÃ³sticos canÃ´nicos (`missing-import`, `unused-import`, `unknown-member`, `module-not-found`, `module-not-declared`, `duplicate-import`, `private-member-access`, `event-signature-mismatch`).
- **Quick Fixes e CorreÃ§Ãµes em Massa**: AÃ§Ãµes rÃ¡pidas individuais e em lote ("Aplicar a todas as ocorrÃªncias no arquivo") para importar/remover dependÃªncias, instalar mÃ³dulos ausentes, resolver erros de escrita ("VocÃª quis dizer X?") e adicionar `()` em instanciaÃ§Ãµes `New Tipo`.
- O parser/transpiler preserva arrays nativos fixos do PaxCompiler/Data7 Basic, como `Private _containers(10) As Container` e `Dim _matrix(10, 5) As Integer`.
- O parser/linter aceita propriedades indexadas com multiplos argumentos em colchetes, como `Grid.Cells[0, 1]`, alem da forma com parenteses; metodos/funcoes seguem restritos a parenteses, e `[]` tambem permanece valido para arrays e matrizes nativas.

### Sistema de projeto

Os diagnÃƒÂ³sticos de sintaxe/estilo agora cobrem `finally-block-unsupported`, `elseif-whitespace`, `missing-then`, `return-unrecommended` e `return-assignment-in-catch`, com quick fixes correspondentes para o arquivo atual, `source.fixAll.data7` e correÃ§Ã£o em massa do workspace. Para `missing-then`, comentÃ¡rios inline e seu espaÃ§amento de alinhamento sÃ£o preservados.

- **Decompositor** (`.7Proj` â†’ Ã¡rvore de `.bas`): abre um `.7Proj` e gera a estrutura fÃ­sica do projeto.
- **Builder** (`.bas` â†’ `.7Proj`): empacota a Ã¡rvore de volta no XML do Data7 com escaping seguro, GUID novo e respeitando dependÃªncias.
- **Fluxo manual seguro**: decompÃµe `.7Proj` para ediÃ§Ã£o e recompila sob comando explÃ­cito.
- **Run** (F5): executa o projeto via Executor do Data7.
- **Open in DevStudio**: abre o `.7Proj` no Data7 Developer Studio.

### RepositÃ³rio de mÃ³dulos compartilhados

- **Gerenciamento de DependÃªncias ExplÃ­cito**: DependÃªncias e mÃ³dulos compartilhados agora sÃ£o declarados explicitamente no arquivo `data7.json` (seÃ§Ã£o `dependencies`).
- **Gerenciador de MÃ³dulos tipo npm**: o `ModuleOrchestrator` centraliza install/update/remove em lote, resolve versÃµes disponÃ­veis em repositÃ³rio local (`~/.data7/local_modules`) ou online (GitHub) e mantÃ©m `data7_modules/` sincronizado com o manifesto. A extensÃ£o tambÃ©m espelha sempre os `core_modules` embarcados em `data7_modules/core_modules`, mesmo sem dependÃªncias declaradas, para disponibilizar runtimes de sugars como `mod_tlist`/`TTList`.
- **Sidebar de mÃ³dulos**: o Gerenciador de MÃ³dulos lista mÃ³dulos disponÃ­veis separados por repositÃ³rio local e online, mostra estado instalado/atualizÃ¡vel, permite marcar mÃºltiplos itens por checkbox e executar instalar, atualizar ou remover pela barra da view ou pelo menu do item.
- **CatÃ¡logo online por releases**: mÃ³dulos online sÃ³ entram no catÃ¡logo quando existe uma release com tag vÃ¡lida no formato `<modulo>-v<versao>`; o catÃ¡logo Ã© cacheado e reconsultado em intervalo longo para reduzir rate limit da API do GitHub.
- **PublicaÃ§Ã£o segura**: antes de autenticar no GitHub, criar fork ou abrir PR, a extensÃ£o verifica se o mÃ³dulo jÃ¡ existe online. Se nÃ£o houver alteraÃ§Ã£o real, a publicaÃ§Ã£o Ã© bloqueada; se houver alteraÃ§Ã£o sem versÃ£o maior, a extensÃ£o exige bump de versÃ£o.
- **Unpublish online**: mÃ³dulos publicados podem ser removidos do catÃ¡logo por PR de unpublish. A remoÃ§Ã£o Ã© permitida somente para `module.publisher` registrado no manifesto publicado ou para o dono do repositÃ³rio de mÃ³dulos.
- **Projetos publicÃ¡veis como mÃ³dulo**: `data7.json` pode declarar `module.name` como nome canÃ´nico do pacote. A extensÃ£o usa esse nome na publicaÃ§Ã£o e impede instalar o prÃ³prio mÃ³dulo como dependÃªncia dele mesmo.
- **SincronizaÃ§Ã£o**: A extensÃ£o baixa e sincroniza automaticamente dependÃªncias ausentes para a pasta `data7_modules/` e mantÃ©m `data7_modules/core_modules/` alinhado com a versÃ£o instalada da extensÃ£o. O construtor injeta automaticamente a flag `@Module-Imported` em arquivos de dependÃªncia externa para evitar conflitos na decomposiÃ§Ã£o.
- RepositÃ³rio privado de mÃ³dulos isolado (`globalStoragePath`) que evita poluir o disco.
- MÃ³dulos locais do prÃ³prio projeto vivem nativamente em `src/`, sem a obrigatoriedade da flag `@Module`.
- MÃ³dulos orientados a objeto usam `TTObject` para permitir armazenamento seguro em `TTList` e descarte determinÃ­stico de recursos.
- O sugar `array-list` expande `map`, `filter`, `find`, `findIndex`, `some`, `every`, `reduce` e `forEach` sobre `TTList`; `map`/`filter` aceitam arrow de expressao ou bloco com `Return` final, inclusive em `Return lista.map(...)` de funcoes que retornam `TTList_*`.
- O sugar declarativo `Enun X` gera tipos derivados de `TEnum`, uma base `TTObject` com cache de opÃ§Ãµes e suporte a coleÃ§Ãµes, sem conflitar com `Enum X` nativo.
- Os mÃ³dulos core usam `mod_logger` como Ãºnico fluxo de logging; ele formata `TDateTime`, `TTObject` e objetos nativos de acordo com seu tipo concreto.

Exemplo mÃ­nimo de projeto publicÃ¡vel como mÃ³dulo:

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

O projeto Ã© estruturado como um monorepo via NPM Workspaces, contendo:

- `@data7/core`: Kernel da linguagem (parser, linter, builder, indexador) independente do VS Code.
- `@data7/cli`: Interface CLI para integraÃ§Ã£o contÃ­nua (CI) e uso standalone.
- `vscode-extension-data7`: A extensÃ£o grÃ¡fica do VS Code.

O `@data7/core` nao importa o modulo runtime `vscode`; ele usa um adapter puro em `src/platform/vscode-api.ts`. A extensao instala a API real do VS Code no `activate`, enquanto CLI e MCP usam a implementacao standalone do core.

### DocumentaÃ§Ã£o da System Library

- **`Data7: Gerar DocumentaÃ§Ã£o da System Library`** â€” gera `.md` por namespace com classes, eventos, propriedades, cadeia de heranÃ§a e cross-links.
- **`Data7: Sincronizar DocumentaÃ§Ã£o no AGENTS.md`** â€” injeta um bloco delimitado no `AGENTS.md` do projeto, mantido idempotentemente, para agentes de IA (Cursor/Copilot Chat) lerem automaticamente.

## Como comeÃ§ar

1. Instale a extensÃ£o (ou rode em modo dev com `F5` dentro deste repositÃ³rio).
2. Abra uma pasta contendo um arquivo `.7Proj` â€” a extensÃ£o oferecerÃ¡ decompor para ediÃ§Ã£o no VS Code.
3. Configure o caminho do Executor em **Settings** â†’ `data7.executorPath` (a extensÃ£o tambÃ©m perguntarÃ¡ na 1Âª execuÃ§Ã£o).
4. Use `F5` para rodar o projeto, `Ctrl+Shift+B` para compilar.

## Empacotamento VSIX

Use `npm run build:extension -w vscode-extension-data7` ou rode o mesmo comando dentro de `packages/data7-vscode`. O prepublish compila `@data7/core`, gera o bundle minificado da extensÃ£o com `esbuild`, copia os assets runtime para a pasta do pacote e chama `vsce package --no-dependencies` para nÃ£o seguir os links dos workspaces do monorepo.

## Comandos principais

| Comando                                          | Atalho             | DescriÃ§Ã£o                                                 |
| ------------------------------------------------ | ------------------ | ----------------------------------------------------------- |
| `Data7: Abrir Projeto`                           | â€”                | DecompÃµe um `.7Proj` em estrutura `.bas` editÃ¡vel         |
| `Data7: Criar Novo Projeto`                      | â€”                | Cria um projeto Data7 do zero                               |
| `Data7: Compilar/Rebuildar Projeto`              | `Ctrl+Shift+B`     | Empacota a Ã¡rvore atual no `.7Proj`                        |
| `Data7: Executar Projeto`                        | `F5`               | Roda no Executor do Data7                                   |
| `Data7: Abrir no Developer Studio`               | â€”                | Abre no IDE legado                                          |
| `Data7: Instalar MÃ³dulo Compartilhado`          | â€”                | Sincroniza um mÃ³dulo do repositÃ³rio para `data7_modules/` |
| `Data7: Instalar MÃ³dulos Selecionados`          | â€”                | Instala os mÃ³dulos marcados no Gerenciador de MÃ³dulos     |
| `Data7: Atualizar DependÃªncias do Projeto`      | â€”                | Refresh completo de `data7.json#dependencies`               |
| `Data7: Remover MÃ³dulos Selecionados`           | â€”                | Remove mÃ³dulos marcados do manifesto e de `data7_modules/` |
| `Data7: Gerar DocumentaÃ§Ã£o da System Library`  | â€”                | Gera `.md` por namespace em `docs/system-library/`          |
| `Data7: Sincronizar DocumentaÃ§Ã£o no AGENTS.md` | â€”                | Injeta bloco gerado no `AGENTS.md` do workspace             |
| `Data7: Mostrar SaÃ­da`                          | â€”                | Abre o canal "Data7" no painel Output                       |
| `Data7: Reiniciar/Rodar Linter no Projeto`       | â€”                | Reavalia todo o projeto e exibe resumo de diagnÃ³sticos     |
| `Data7: Linter - Corrigir Arquivo Atual`         | `Ctrl+Alt+Shift+F` | Aplica Quick Fixes corretivos no `.bas` ativo               |

## ConfiguraÃ§Ãµes

Veja `Settings` â†’ busca por `data7.`:

| Chave                                           | Tipo     | Default                                             | DescriÃ§Ã£o                                                                                                                                                                     |
| ----------------------------------------------- | -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data7.executorPath`                            | string   | â€”                                                 | Caminho do `Executor.exe` ou `D7MG.exe`                                                                                                                                         |
| `data7.sharedModulesPath`                       | string   | â€”                                                 | Pasta global de mÃ³dulos compartilhados                                                                                                                                         |
| `data7.userName` / `companyCode` / `branchCode` | int      | `1`                                                 | CÃ³digos passados ao Executor (`-U` / `-E` / `-F`)                                                                                                                              |
| `data7.databaseConnectionId`                    | string   | â€”                                                 | Fallback de conexÃ£o (`-C`) apenas para executar `.7Proj` diretamente; projetos com `data7.json` usam `opcoes.identificacaoBancoDados`                                          |
| `data7.exclude`                                 | string[] | `["**/node_modules/**", "**/.git/**", "**/out/**"]` | Globs ignorados pelo indexador e pelo linter. `data7_modules/**` Ã© tratado separadamente: indexado para resoluÃ§Ã£o de tipos, mas o linter nÃ£o emite diagnÃ³sticos sobre eles |
| `data7.diagnosticSeverity`                      | object   | `{}`                                                | Sobrescreve a severidade por cÃ³digo (`{"unused-import": "info"}`)                                                                                                              |
| `data7.autoFormatOnSave`                        | bool     | `false`                                             | Formata arquivos `.bas` automaticamente ao salvar                                                                                                                               |
| `data7.features`                                | object   | veja abaixo                                         | Habilita recursos opcionais por categoria: linguagem, automaÃ§Ãµes de workspace/save/build e prÃ©via                                                                            |

`data7.features` mantÃ©m os recursos existentes ativos por padrÃ£o, exceto o auto-fix antes do build, que fica desligado para evitar uma varredura completa a cada execuÃ§Ã£o. Exemplo para usar somente o nÃºcleo, sem extensÃµes de linguagem nem automaÃ§Ãµes de workspace:

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

`data7.sugars` continua selecionando IDs individuais quando `features.language.sugars` estÃ¡ ativo. Com `features.diagnostics.enabled: true`, o linter live acompanha arquivos `.bas` fÃ­sicos abertos; o comando **Data7: Reiniciar/Rodar Linter no Projeto** analisa o workspace inteiro e mantÃ©m os resultados no painel Problems atÃ© nova anÃ¡lise, limpeza ou alteraÃ§Ã£o do arquivo. `features.diagnostics.lintWorkspaceOnStartup` executa essa varredura completa ao abrir a IDE quando habilitado, mas fica desligado por padrÃ£o para evitar custo inicial em projetos grandes. `features.build.autoFixBeforeBuild` fica desligado por padrÃ£o para evitar correÃ§Ãµes automÃ¡ticas antes de F5, build ou Developer Studio; quando ligado, processa somente os `.bas` alterados desde o Ãºltimo build da sessÃ£o. Mesmo com auto-fix desligado, o F5 reanalisa o projeto e nÃ£o inicia o Executor enquanto houver erros de parser/linter. Build, execuÃ§Ã£o e abertura no Developer Studio mantÃªm snapshots em `.data7/build-cache/`: se `src/`, `data7_modules/`, `data7.json` e o `.7Proj` de saÃ­da nÃ£o mudaram, a extensÃ£o pula o empacotamento e abre/executa imediatamente; quando hÃ¡ mudanÃ§a, o Builder reutiliza transpilaÃ§Ãµes cacheadas dos arquivos inalterados. O F5 gera sua variante com logger em `.data7/run/*.run.7Proj`, preservando o `.7Proj` standard usado pelo Developer Studio. Para uma correÃ§Ã£o explÃ­cita no editor atual, use **Data7: Linter - Corrigir Arquivo Atual**; para o workspace inteiro, use **Data7: Corrigir Erros de Sintaxe/Estilo no Projeto Completo**. A flag legada `data7.autoFormatOnSave` continua sendo aceita; prefira `data7.features.save.autoFormatOnSave` para instalaÃ§Ãµes novas. Recursos registrados na ativaÃ§Ã£o (detecÃ§Ã£o de projeto e prÃ©via) passam a valer apÃ³s recarregar a janela.

O manifesto `data7.json` aceita o bloco `build.optimization` para o pipeline de otimizaÃ§Ã£o em implantaÃ§Ã£o: `minify.enabled`, `minify.stripComments`, `minify.removeUnused`, `minify.mergeNamespaces`, `uglify.enabled` e `sourceMap`. As chaves legadas `opcoes.minify` e `opcoes.stripComments` continuam aceitas por compatibilidade.

## Suprimir diagnÃ³sticos com comentÃ¡rios

Use comentÃ¡rios inline para suprimir diagnÃ³sticos do linter sem desativar a regra globalmente:

```basic
' Suprime TODOS os diagnÃ³sticos nesta linha
me.x = y  ' data7:disable-line

' Suprime apenas cÃ³digos especÃ­ficos (separe por vÃ­rgula)
g.PopupMenu = Nothing  ' data7:disable-line unsupported-member

' Suprime na prÃ³xima linha nÃ£o-vazia (Ãºtil para gerar handler temporÃ¡rio)
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

- `' data7:disable-line` â€” suprime todos os cÃ³digos na mesma linha.
- `' data7:disable-line CODE1,CODE2` â€” suprime apenas cÃ³digos listados.
- `' data7:disable-next-line` â€” aplica Ã  prÃ³xima linha nÃ£o-vazia.
- `REM data7:disable-line` â€” `REM` tambÃ©m Ã© aceito como comentÃ¡rio Data7 Basic.
- `' data7:external-type Tipo` - aceita um tipo nativo/externo na declaracao da linha atual; a variavel passa a se comportar como `Variant` para validacao de membros.
- `' data7:external-type Tipo scope=block` - aceita o tipo no bloco imediatamente abaixo ou no bloco onde a diretiva esta.
- `' data7:external-type Tipo scope=file` - aceita o tipo em todo o arquivo.

Os cÃ³digos disponÃ­veis estÃ£o na seÃ§Ã£o de [DiagnÃ³sticos canÃ´nicos](./project_context.md#44-cÃ³digos-canÃ´nicos-de-diagnÃ³stico-srcdiagnosticsdiagnostic-codests) do `project_context.md`. O **quick fix** "Suprimir warning aqui" tambÃ©m adiciona automaticamente a diretiva.

## Workspace Trust

A extensÃ£o declara `untrustedWorkspaces.supported: "limited"`. Em workspaces nÃ£o confiÃ¡veis:

- âœ… Continuam ativos: IntelliSense de leitura, hover, navegaÃ§Ã£o, documentaÃ§Ã£o da System Library.
- âŒ Ficam desabilitados: build/run via Executor, modificaÃ§Ã£o do `.7Proj`, escrita no repositÃ³rio privado.

## Arquitetura

Veja [`project_context.md`](./project_context.md) para a descriÃ§Ã£o arquitetural completa, e [`docs/system-library/README.md`](./docs/system-library/README.md) para a referÃªncia gerada de tipos nativos do ERP.

Para mudanÃ§as no transpiler, parser ou aÃ§Ãºcares sintÃ¡ticos, siga tambÃ©m o contrato de [`docs/sugar-architecture.md`](./docs/sugar-architecture.md): cada sugar Ã© isolado em `src/project/sugars/plugins/<id>/`, e sua configuraÃ§Ã£o nÃ£o pode causar perda de cÃ³digo.

O parser preserva cadeias condicionais escritas como `ElseIf` ou `Else If`, serializando-as na forma canÃ´nica `ElseIf`.
TambÃ©m preserva `Throw` inline e usa as declaraÃ§Ãµes de tipo do cÃ³digo para evitar conversÃµes `CStr` redundantes.

## Desenvolvimento

```bash
npm install
npm run compile      # compila os workspaces em ordem: core -> vscode -> cli
npm run watch        # recompila core, vscode e cli em modo incremental
npm test             # roda toda a suÃ­te de testes (node --test)
```

Para depurar a extensÃ£o, abra este repositÃ³rio no VS Code e pressione `F5` para iniciar a Extension Host. O pre-launch task `npm: watch` espera a primeira compilaÃ§Ã£o de todos os workspaces; depois, alteraÃ§Ãµes em `packages/data7-core`, `packages/data7-vscode` e `packages/data7-cli` sÃ£o recompiladas em background. Use `Ctrl+R` na Extension Host para recarregar a IDE com os artefatos recÃ©m-gerados.

## LicenÃ§a

[MIT](./LICENSE)

Nota de IntelliSense: em arquivos `.bas`, a lista de autocomplete abre automaticamente ao digitar `.`. No gatilho manual (`Ctrl+Space`) e nas conclusÃµes por membro, a ordenaÃ§Ã£o prioriza bloco, mÃ©todo, classe, heranÃ§a, namespace e global, sempre em ordem alfabÃ©tica dentro de cada escopo.
