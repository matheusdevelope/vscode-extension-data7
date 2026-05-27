# Data7 Dev Studio integration

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/matheusdevelope.vscode-extension-data7?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=matheusdevelope.vscode-extension-data7)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/matheusdevelope.vscode-extension-data7)](https://marketplace.visualstudio.com/items?itemName=matheusdevelope.vscode-extension-data7)
[![CI](https://github.com/matheusdevelope/vscode-extension-data7/actions/workflows/ci.yml/badge.svg)](https://github.com/matheusdevelope/vscode-extension-data7/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Extensão do VS Code que fornece suporte completo de desenvolvimento (Language Server Features) para projetos do **ERP Data7**, manipulando arquivos `.bas` (Data7 Basic) e projetos `.7Proj` (XML).

## Features

### IntelliSense e validação

- **Autocompletar** inteligente sensível ao contexto (classes, namespaces, métodos, propriedades, eventos).
- **Auto-importação**: ao escolher um tipo de namespace não importado, a diretiva `Imports` é adicionada automaticamente.
- **Hover** com assinatura completa do símbolo, ancestrais e descrição.
- **Go to Definition** (`F12`), **Find All References** (`Shift+F12`), **Rename** (`F2`).
- **Outline / Breadcrumbs / Sticky scroll** com símbolos hierárquicos.
- **Signature Help** com destaque do parâmetro atual.
- **Folding** semântico de `Namespace`, `Class`, `Sub`, `Function`, `If`, `For`, `While`.
- **Linter** com diagnósticos canônicos (`missing-import`, `unused-import`, `unknown-member`, `module-not-found`, `module-not-declared`, `duplicate-import`, `private-member-access`, `event-signature-mismatch`).
- **Quick Fixes** automáticos para cada código de diagnóstico (importar, remover importação não usada, adicionar a `data7.json#dependencies`, instalar módulo, sugestão "você quis dizer X?").

### Sistema de projeto

- **Decompositor** (`.7Proj` → árvore de `.bas`): abre um `.7Proj` e gera a estrutura física do projeto.
- **Builder** (`.bas` → `.7Proj`): empacota a árvore de volta no XML do Data7 com escaping seguro, GUID novo e respeitando dependências.
- **Sincronização bidirecional** automática `.bas` ↔ `.7Proj`.
- **Run** (F5): executa o projeto via Executor do Data7.
- **Open in DevStudio**: abre o `.7Proj` no Data7 Developer Studio.

### Repositório de módulos compartilhados

- Repositório privado de módulos isolado (`globalStoragePath`) que evita poluir o disco.
- Importação manual ou em lote de `.bas`/`.7Proj` externos.
- Sincronização automática para `data7_modules/` no workspace conforme `data7.json#dependencies`.

### Documentação da System Library

- **`Data7: Gerar Documentação da System Library`** — gera `.md` por namespace com classes, eventos, propriedades, cadeia de herança e cross-links.
- **`Data7: Sincronizar Documentação no AGENTS.md`** — injeta um bloco delimitado no `AGENTS.md` do projeto, mantido idempotentemente, para agentes de IA (Cursor/Copilot Chat) lerem automaticamente.

## Como começar

1. Instale a extensão (ou rode em modo dev com `F5` dentro deste repositório).
2. Abra uma pasta contendo um arquivo `.7Proj` — a extensão oferecerá decompor para edição no VS Code.
3. Configure o caminho do Executor em **Settings** → `data7.executorPath` (a extensão também perguntará na 1ª execução).
4. Use `F5` para rodar o projeto, `Ctrl+Shift+B` para compilar.

## Comandos principais

| Comando                                        | Atalho         | Descrição                                                 |
| ---------------------------------------------- | -------------- | --------------------------------------------------------- |
| `Data7: Abrir Projeto`                         | —              | Decompõe um `.7Proj` em estrutura `.bas` editável         |
| `Data7: Criar Novo Projeto`                    | —              | Cria um projeto Data7 do zero                             |
| `Data7: Compilar/Rebuildar Projeto`            | `Ctrl+Shift+B` | Empacota a árvore atual no `.7Proj`                       |
| `Data7: Executar Projeto`                      | `F5`           | Roda no Executor do Data7                                 |
| `Data7: Abrir no Developer Studio`             | —              | Abre no IDE legado                                        |
| `Data7: Instalar Módulo Compartilhado`         | —              | Sincroniza um módulo do repositório para `data7_modules/` |
| `Data7: Atualizar Dependências do Projeto`     | —              | Refresh completo de `data7.json#dependencies`             |
| `Data7: Gerar Documentação da System Library`  | —              | Gera `.md` por namespace em `docs/system-library/`        |
| `Data7: Sincronizar Documentação no AGENTS.md` | —              | Injeta bloco gerado no `AGENTS.md` do workspace           |
| `Data7: Mostrar Saída`                         | —              | Abre o canal "Data7" no painel Output                     |

## Configurações

Veja `Settings` → busca por `data7.`:

| Chave                                           | Tipo     | Default                                         | Descrição                                                         |
| ----------------------------------------------- | -------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| `data7.executorPath`                            | string   | —                                               | Caminho do `Executor.exe` ou `D7MG.exe`                           |
| `data7.sharedModulesPath`                       | string   | —                                               | Pasta global de módulos compartilhados                            |
| `data7.userCode` / `companyCode` / `branchCode` | int      | `1`                                             | Códigos passados ao Executor (`-U` / `-E` / `-F`)                 |
| `data7.databaseConnectionId`                    | string   | —                                               | UUID da conexão de banco (`-C`); se vazio, lê do `data7.json`     |
| `data7.enableAutoSync`                          | bool     | `true`                                          | Sincronização automática `.bas` ↔ `.7Proj`                        |
| `data7.exclude`                                 | string[] | `["**/node_modules/**", "**/data7_modules/**"]` | Globs ignorados pelo indexador e pelo linter                      |
| `data7.diagnosticSeverity`                      | object   | `{}`                                            | Sobrescreve a severidade por código (`{"unused-import": "info"}`) |
| `data7.autoFormatOnSave`                        | bool     | `false`                                         | Formata arquivos `.bas` automaticamente ao salvar                 |

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

## Desenvolvimento

```bash
npm install
npm run compile      # compila uma vez
npm run watch        # compila em modo incremental
npm test             # roda toda a suíte de testes (node --test)
```

Para depurar a extensão, abra este repositório no VS Code e pressione `F5` para iniciar a Extension Host.

## Licença

[MIT](./LICENSE)
