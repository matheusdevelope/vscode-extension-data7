# Data7 Dev Studio integration

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/matheusdevelope.vscode-extension-data7?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=matheusdevelope.vscode-extension-data7)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/matheusdevelope.vscode-extension-data7)](https://marketplace.visualstudio.com/items?itemName=matheusdevelope.vscode-extension-data7)
[![CI](https://github.com/matheusdevelope/vscode-extension-data7/actions/workflows/ci.yml/badge.svg)](https://github.com/matheusdevelope/vscode-extension-data7/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Extensão do VS Code que fornece suporte completo de desenvolvimento (Language Server Features) para projetos do **ERP Data7**, manipulando arquivos `.bas` (Data7 Basic) e projetos `.7Proj` (XML).

## Features

- O Quick Fix de `Return` permanece disponivel mesmo quando o VS Code nao preserva os metadados internos do diagnostico.

- O Quick Fix de `Return` atribui diretamente o valor fora de condicionais e adiciona `Exit Function` ou `Exit Property` apenas dentro de ramificacoes. Dentro de `Catch`, Function/Property preservam `Return` e o diagnostico `return-assignment-in-catch` troca retorno por atribuicao para `Return`. `MyBase.Free()` e inserido no fim do `Sub Free`, depois das liberacoes de recursos da classe.

- O linter reconhece dependencias transitivas entre `Imports`, promocao numerica sem perda e a API global de compatibilidade `dateUtils.toStringFormat(...)`.
- O linter resolve variaveis globais declaradas no escopo superior, com prioridade para `Principal.bas`, e escolhe overloads por compatibilidade de tipos dos argumentos.
- O linter aceita indexacao em `Variant`/`String`, resolve chamadas sem receiver respeitando imports antes de homonimos globais e reconhece `Net`/`ftBinary`/`ftASCII` como itens nativos da System Library.
- A System Library cobre flags de `Forms.GridConfigs` usadas em projetos legados e `TStringList`/`TStrings` podem ser indexados diretamente com `lista[i]`.
- `private-member-access` permanece estrito, destaca o token exato do membro privado em cadeias longas e o autocomplete nao sugere membros `Private` fora da classe declarante. `redundant-terminal-exit` remove `Exit`/`Return` vazio terminal sem confundir com `missing-return-value`.
- Quick Fixes corretivos aparecem antes das supressoes, supressoes de linha sao emitidas com `data7:disable-next-line`, `dead-code` agrupa blocos inalcançaveis e o arquivo `.bas` ativo pode ser corrigido pelo comando `Data7: Linter - Corrigir Arquivo Atual`.
- Diagnosticos `missing-mybase-new` e `missing-mybase-free` valem apenas para `Class`; `Structure` e tratada como estatica e nao recebe `Sub New`, `Sub Free` ou quick fix de destrutor.
- O linter respeita escopo de variavel de `Catch`, aceita guardas legados `Exit Sub` em `Function` e limita `chained-global-function-assignment` a atribuicoes cujo RHS e diretamente a cadeia de funcao global.
- A execução via F5 usa `data7.json#opcoes` como fonte principal para conexão, empresa, filial e usuário; `data7.databaseConnectionId` e apenas fallback para execução direta de `.7Proj` fora de um projeto decomposto.
- Antes de iniciar o Executor no F5, o projeto é reanalisado pelo parser/linter e a execução é cancelada se houver erro. Chamadas qualificadas em namespaces/tipos, como `console.clear()`, também são validadas como `unknown-member` quando o membro não existe.
- Logs de execuções ficam acumulados no canal dedicado `Data7 Logs`, separado do output interno da extensão.
- A validacao de modulos ignora acessos abreviados de `With` (`.Membro`), evitando falso `module-not-found` com nome vazio.
- A System Library inclui aliases iniciais para `System.IOUtils.TFile`, `System.IOUtils.TPath` e `IO.File.ZipFile`; chamadas estaticas dessas classes nao sao tratadas como modulos externos.
- Warnings `unused-import` oferecem Quick Fix para remover a diretiva `Imports`, inclusive quando o VS Code fornece um codigo de diagnostico estruturado.
- **Otimizações de Performance do Linter**: Cache global de herança de membros ($O(1)$) e detecção inteligente de delta de namespaces. Reavaliação de dependências em cascata movida exclusivamente para o evento de salvamento, otimizando a digitação. Diagnóstico de `return-unrecommended` ignora propriedades `Property Get` por não suportarem `Exit Property` nativamente.

### IntelliSense e validação

- **Autocompletar** inteligente sensível ao contexto (classes, namespaces, métodos, propriedades, eventos).
- **Auto-importação**: ao escolher um tipo de namespace não importado, a diretiva `Imports` é adicionada automaticamente.
- **Hover** com assinatura completa do símbolo, ancestrais e descrição.
- **Go to Definition** (`F12`), **Find All References** (`Shift+F12`), **Rename** (`F2`).
- **Outline / Breadcrumbs / Sticky scroll** com símbolos hierárquicos.
- **Signature Help** com destaque do parâmetro atual.
- **Folding** semântico de `Namespace`, `Class`, `Sub`, `Function`, `If`, `For`, `While`.
- **Linter** com diagnósticos canônicos (`missing-import`, `unused-import`, `unknown-member`, `module-not-found`, `module-not-declared`, `duplicate-import`, `private-member-access`, `event-signature-mismatch`).
- **Quick Fixes e Correções em Massa**: Ações rápidas individuais e em lote ("Aplicar a todas as ocorrências no arquivo") para importar/remover dependências, instalar módulos ausentes, resolver erros de escrita ("Você quis dizer X?") e adicionar `()` em instanciações `New Tipo`.
- O parser/transpiler preserva arrays nativos fixos do PaxCompiler/Data7 Basic, como `Private _containers(10) As Container` e `Dim _matrix(10, 5) As Integer`.
- O parser/linter aceita propriedades indexadas com multiplos argumentos em colchetes, como `Grid.Cells[0, 1]`, alem da forma com parenteses; metodos/funcoes seguem restritos a parenteses, e `[]` tambem permanece valido para arrays e matrizes nativas.

### Sistema de projeto

Os diagnÃ³sticos de sintaxe/estilo agora cobrem `finally-block-unsupported`, `elseif-whitespace`, `missing-then`, `return-unrecommended` e `return-assignment-in-catch`, com quick fixes correspondentes para o arquivo atual, `source.fixAll.data7` e correÃ§Ã£o em massa do workspace. Para `missing-then`, comentários inline e seu espaçamento de alinhamento são preservados.

- **Decompositor** (`.7Proj` → árvore de `.bas`): abre um `.7Proj` e gera a estrutura física do projeto.
- **Builder** (`.bas` → `.7Proj`): empacota a árvore de volta no XML do Data7 com escaping seguro, GUID novo e respeitando dependências.
- **Fluxo manual seguro**: decompõe `.7Proj` para edição e recompila sob comando explícito.
- **Run** (F5): executa o projeto via Executor do Data7.
- **Open in DevStudio**: abre o `.7Proj` no Data7 Developer Studio.

### Repositório de módulos compartilhados

- **Gerenciamento de Dependências Explícito**: Dependências e módulos compartilhados agora são declarados explicitamente no arquivo `data7.json` (seção `dependencies`).
- **Gerenciador de Módulos tipo npm**: o `ModuleOrchestrator` centraliza install/update/remove em lote, resolve versões disponíveis em repositório local (`~/.data7/local_modules`) ou online (GitHub) e mantém `data7_modules/` sincronizado com o manifesto.
- **Sidebar de módulos**: o Gerenciador de Módulos lista módulos disponíveis separados por repositório local e online, mostra estado instalado/atualizável, permite marcar múltiplos itens por checkbox e executar instalar, atualizar ou remover pela barra da view ou pelo menu do item.
- **Catálogo online por releases**: módulos online só entram no catálogo quando existe uma release com tag válida no formato `<modulo>-v<versao>`; o catálogo é cacheado e reconsultado em intervalo longo para reduzir rate limit da API do GitHub.
- **Publicação segura**: antes de autenticar no GitHub, criar fork ou abrir PR, a extensão verifica se o módulo já existe online. Se não houver alteração real, a publicação é bloqueada; se houver alteração sem versão maior, a extensão exige bump de versão.
- **Unpublish online**: módulos publicados podem ser removidos do catálogo por PR de unpublish. A remoção é permitida somente para `module.publisher` registrado no manifesto publicado ou para o dono do repositório de módulos.
- **Projetos publicáveis como módulo**: `data7.json` pode declarar `module.name` como nome canônico do pacote. A extensão usa esse nome na publicação e impede instalar o próprio módulo como dependência dele mesmo.
- **Sincronização**: A extensão baixa e sincroniza automaticamente dependências ausentes para a pasta `data7_modules/`. O construtor injeta automaticamente a flag `@Module-Imported` em arquivos de dependência externa para evitar conflitos na decomposição.
- Repositório privado de módulos isolado (`globalStoragePath`) que evita poluir o disco.
- Módulos locais do próprio projeto vivem nativamente em `src/`, sem a obrigatoriedade da flag `@Module`.
- Módulos orientados a objeto usam `TTObject` para permitir armazenamento seguro em `TTList` e descarte determinístico de recursos.
- O sugar declarativo `Enun X` gera tipos derivados de `TEnum`, uma base `TTObject` com cache de opções e suporte a coleções, sem conflitar com `Enum X` nativo.
- Os módulos core usam `mod_logger` como único fluxo de logging; ele formata `TDateTime`, `TTObject` e objetos nativos de acordo com seu tipo concreto.

Exemplo mínimo de projeto publicável como módulo:

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
- `@data7/cli`: Interface CLI para integração contínua (CI) e uso standalone.
- `vscode-extension-data7`: A extensão gráfica do VS Code.

O `@data7/core` nao importa o modulo runtime `vscode`; ele usa um adapter puro em `src/platform/vscode-api.ts`. A extensao instala a API real do VS Code no `activate`, enquanto CLI e MCP usam a implementacao standalone do core.

### Documentação da System Library

- **`Data7: Gerar Documentação da System Library`** — gera `.md` por namespace com classes, eventos, propriedades, cadeia de herança e cross-links.
- **`Data7: Sincronizar Documentação no AGENTS.md`** — injeta um bloco delimitado no `AGENTS.md` do projeto, mantido idempotentemente, para agentes de IA (Cursor/Copilot Chat) lerem automaticamente.

## Como começar

1. Instale a extensão (ou rode em modo dev com `F5` dentro deste repositório).
2. Abra uma pasta contendo um arquivo `.7Proj` — a extensão oferecerá decompor para edição no VS Code.
3. Configure o caminho do Executor em **Settings** → `data7.executorPath` (a extensão também perguntará na 1ª execução).
4. Use `F5` para rodar o projeto, `Ctrl+Shift+B` para compilar.

## Empacotamento VSIX

Use `npm run build:extension -w vscode-extension-data7` ou rode o mesmo comando dentro de `packages/data7-vscode`. O prepublish compila `@data7/core`, gera o bundle minificado da extensão com `esbuild`, copia os assets runtime para a pasta do pacote e chama `vsce package --no-dependencies` para não seguir os links dos workspaces do monorepo.

## Comandos principais

| Comando                                        | Atalho             | Descrição                                                  |
| ---------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| `Data7: Abrir Projeto`                         | —                  | Decompõe um `.7Proj` em estrutura `.bas` editável          |
| `Data7: Criar Novo Projeto`                    | —                  | Cria um projeto Data7 do zero                              |
| `Data7: Compilar/Rebuildar Projeto`            | `Ctrl+Shift+B`     | Empacota a árvore atual no `.7Proj`                        |
| `Data7: Executar Projeto`                      | `F5`               | Roda no Executor do Data7                                  |
| `Data7: Abrir no Developer Studio`             | —                  | Abre no IDE legado                                         |
| `Data7: Instalar Módulo Compartilhado`         | —                  | Sincroniza um módulo do repositório para `data7_modules/`  |
| `Data7: Instalar Módulos Selecionados`         | —                  | Instala os módulos marcados no Gerenciador de Módulos      |
| `Data7: Atualizar Dependências do Projeto`     | —                  | Refresh completo de `data7.json#dependencies`              |
| `Data7: Remover Módulos Selecionados`          | —                  | Remove módulos marcados do manifesto e de `data7_modules/` |
| `Data7: Gerar Documentação da System Library`  | —                  | Gera `.md` por namespace em `docs/system-library/`         |
| `Data7: Sincronizar Documentação no AGENTS.md` | —                  | Injeta bloco gerado no `AGENTS.md` do workspace            |
| `Data7: Mostrar Saída`                         | —                  | Abre o canal "Data7" no painel Output                      |
| `Data7: Reiniciar/Rodar Linter no Projeto`     | —                  | Reavalia todo o projeto e exibe resumo de diagnósticos     |
| `Data7: Linter - Corrigir Arquivo Atual`       | `Ctrl+Alt+Shift+F` | Aplica Quick Fixes corretivos no `.bas` ativo              |

## Configurações

Veja `Settings` → busca por `data7.`:

| Chave                                           | Tipo     | Default                                             | Descrição                                                                                                                                                                  |
| ----------------------------------------------- | -------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data7.executorPath`                            | string   | —                                                   | Caminho do `Executor.exe` ou `D7MG.exe`                                                                                                                                    |
| `data7.sharedModulesPath`                       | string   | —                                                   | Pasta global de módulos compartilhados                                                                                                                                     |
| `data7.userName` / `companyCode` / `branchCode` | int      | `1`                                                 | Códigos passados ao Executor (`-U` / `-E` / `-F`)                                                                                                                          |
| `data7.databaseConnectionId`                    | string   | —                                                   | Fallback de conexão (`-C`) apenas para executar `.7Proj` diretamente; projetos com `data7.json` usam `opcoes.identificacaoBancoDados`                                      |
| `data7.exclude`                                 | string[] | `["**/node_modules/**", "**/.git/**", "**/out/**"]` | Globs ignorados pelo indexador e pelo linter. `data7_modules/**` é tratado separadamente: indexado para resolução de tipos, mas o linter não emite diagnósticos sobre eles |
| `data7.diagnosticSeverity`                      | object   | `{}`                                                | Sobrescreve a severidade por código (`{"unused-import": "info"}`)                                                                                                          |
| `data7.autoFormatOnSave`                        | bool     | `false`                                             | Formata arquivos `.bas` automaticamente ao salvar                                                                                                                          |
| `data7.features`                                | object   | veja abaixo                                         | Habilita recursos opcionais por categoria: linguagem, automações de workspace/save/build e prévia                                                                          |

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

`data7.sugars` continua selecionando IDs individuais quando `features.language.sugars` está ativo. Com `features.diagnostics.enabled: true`, o linter live acompanha arquivos `.bas` físicos abertos; o comando **Data7: Reiniciar/Rodar Linter no Projeto** analisa o workspace inteiro e mantém os resultados no painel Problems até nova análise, limpeza ou alteração do arquivo. `features.diagnostics.lintWorkspaceOnStartup` executa essa varredura completa ao abrir a IDE quando habilitado, mas fica desligado por padrão para evitar custo inicial em projetos grandes. `features.build.autoFixBeforeBuild` fica desligado por padrão para evitar correções automáticas antes de F5, build ou Developer Studio; quando ligado, processa somente os `.bas` alterados desde o último build da sessão. Mesmo com auto-fix desligado, o F5 reanalisa o projeto e não inicia o Executor enquanto houver erros de parser/linter. Build, execução e abertura no Developer Studio mantêm snapshots em `.data7/build-cache/`: se `src/`, `data7_modules/`, `data7.json` e o `.7Proj` de saída não mudaram, a extensão pula o empacotamento e abre/executa imediatamente; quando há mudança, o Builder reutiliza transpilações cacheadas dos arquivos inalterados. O F5 gera sua variante com logger em `.data7/run/*.run.7Proj`, preservando o `.7Proj` standard usado pelo Developer Studio. Para uma correção explícita no editor atual, use **Data7: Linter - Corrigir Arquivo Atual**; para o workspace inteiro, use **Data7: Corrigir Erros de Sintaxe/Estilo no Projeto Completo**. A flag legada `data7.autoFormatOnSave` continua sendo aceita; prefira `data7.features.save.autoFormatOnSave` para instalações novas. Recursos registrados na ativação (detecção de projeto e prévia) passam a valer após recarregar a janela.

O manifesto `data7.json` aceita o bloco `build.optimization` para o pipeline de otimização em implantação: `minify.enabled`, `minify.stripComments`, `minify.removeUnused`, `minify.mergeNamespaces`, `uglify.enabled` e `sourceMap`. As chaves legadas `opcoes.minify` e `opcoes.stripComments` continuam aceitas por compatibilidade.

## Suprimir diagnósticos com comentários

Use comentários inline para suprimir diagnósticos do linter sem desativar a regra globalmente:

```basic
' Suprime TODOS os diagnósticos nesta linha
me.x = y  ' data7:disable-line

' Suprime apenas códigos específicos (separe por vírgula)
g.PopupMenu = Nothing  ' data7:disable-line unsupported-member

' Suprime na próxima linha não-vazia (útil para gerar handler temporário)
' data7:disable-next-line missing-import
Dim t As TipoNaoImportado
```

Sintaxe aceita:

- `' data7:disable-line` — suprime todos os códigos na mesma linha.
- `' data7:disable-line CODE1,CODE2` — suprime apenas códigos listados.
- `' data7:disable-next-line` — aplica à próxima linha não-vazia.
- `REM data7:disable-line` — `REM` também é aceito como comentário Data7 Basic.

Os códigos disponíveis estão na seção de [Diagnósticos canônicos](./project_context.md#44-códigos-canônicos-de-diagnóstico-srcdiagnosticsdiagnostic-codests) do `project_context.md`. O **quick fix** "Suprimir warning aqui" também adiciona automaticamente a diretiva.

## Workspace Trust

A extensão declara `untrustedWorkspaces.supported: "limited"`. Em workspaces não confiáveis:

- ✅ Continuam ativos: IntelliSense de leitura, hover, navegação, documentação da System Library.
- ❌ Ficam desabilitados: build/run via Executor, modificação do `.7Proj`, escrita no repositório privado.

## Arquitetura

Veja [`project_context.md`](./project_context.md) para a descrição arquitetural completa, e [`docs/system-library/README.md`](./docs/system-library/README.md) para a referência gerada de tipos nativos do ERP.

Para mudanças no transpiler, parser ou açúcares sintáticos, siga também o contrato de [`docs/sugar-architecture.md`](./docs/sugar-architecture.md): cada sugar é isolado em `src/project/sugars/plugins/<id>/`, e sua configuração não pode causar perda de código.

O parser preserva cadeias condicionais escritas como `ElseIf` ou `Else If`, serializando-as na forma canônica `ElseIf`.
Também preserva `Throw` inline e usa as declarações de tipo do código para evitar conversões `CStr` redundantes.

## Desenvolvimento

```bash
npm install
npm run compile      # compila os workspaces em ordem: core -> vscode -> cli
npm run watch        # recompila core, vscode e cli em modo incremental
npm test             # roda toda a suíte de testes (node --test)
```

Para depurar a extensão, abra este repositório no VS Code e pressione `F5` para iniciar a Extension Host. O pre-launch task `npm: watch` espera a primeira compilação de todos os workspaces; depois, alterações em `packages/data7-core`, `packages/data7-vscode` e `packages/data7-cli` são recompiladas em background. Use `Ctrl+R` na Extension Host para recarregar a IDE com os artefatos recém-gerados.

## Licença

[MIT](./LICENSE)

Nota de IntelliSense: em arquivos `.bas`, a lista de autocomplete abre automaticamente ao digitar `.`. No gatilho manual (`Ctrl+Space`) e nas conclusões por membro, a ordenação prioriza bloco, método, classe, herança, namespace e global, sempre em ordem alfabética dentro de cada escopo.
