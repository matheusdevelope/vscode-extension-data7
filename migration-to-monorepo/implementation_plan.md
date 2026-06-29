# Plano de Migração: Monorepo Centralizado (data7)

Este plano especifica as etapas necessárias para migrar o projeto da extensão VS Code para um Monorepo gerenciado via Node.js Workspaces e incorporar o Gerenciador de Módulos (Module Manager), CLI e Sidebar multi-seção de forma robusta e independente de IDE.

---

## User Review Required

> [!IMPORTANT]
> **Repositório Privado Local Agnóstico à IDE**
> Para garantir que os módulos privados locais sejam acessíveis de forma agnóstica a qualquer IDE (como VS Code, Cursor ou outra ferramenta futura):
>
> - O caminho do repositório privado local será alterado de `~/.data7/vscode/local_modules` para `~/.data7/local_modules/`.
> - Criaremos a funcionalidade de **Publicação Local**: o comando `data7.modules.publishLocal` (disponível via command palette, botão na sidebar e CLI) validará e copiará o projeto sob desenvolvimento ativo para a pasta correspondente no repositório privado local.

> [!IMPORTANT]
> **Validação Rigorosa na Publicação Local**
> Antes de copiar o módulo para o repositório privado local, o processo fará validações equivalentes às aplicadas no pipeline CI/CD de PR do GitHub:
>
> 1. Presença do manifesto `data7.json` contendo campos válidos de `nome` e `version`.
> 2. Presença de uma pasta `src/` com pelo menos um arquivo de código `.bas`.
> 3. Validação de análise sintática (parser) em todos os arquivos `.bas` do diretório `src/` para garantir que o código compila/analisa sem erros estruturais antes de ser publicado.

> [!IMPORTANT]
> **Orquestrador de Sidebar Multi-Seção**
> Para que a barra lateral não seja de uso exclusivo do Gerenciador de Módulos, reestruturaremos a aba lateral `data7-explorer` do VS Code para conter duas sub-views colapsáveis nativas:
>
> 1. **Ações Rápidas (`data7.quickActionsView`)**: Botões/ações diretas para rodar o Linter, Compilar, Executar, Gerar Docs, Publicar Módulo Localmente e Sincronizar Módulos.
> 2. **Gerenciador de Módulos (`data7.modulesView`)**: Exibe as dependências do projeto ativo com caixas de seleção (checkboxes) e tags de origem (`[🌐 Online]`, `[💻 Local]`).

> [!NOTE]
> **Esclarecimento sobre a Proteção ao Desenvolvimento Ativo**
>
> - A proteção ativa de namespace impede que o Gerenciador de Módulos altere ou delete os arquivos de código sob desenvolvimento ativo localizados na pasta de trabalho do workspace (pasta `src/`).
> - As dependências instaladas temporariamente dentro da pasta `data7_modules/` **são tratadas como descartáveis** e podem ser livremente atualizadas, sobrescritas ou removidas sempre que o usuário rodar comandos de sincronização ou update.

---

## Proposed Changes

### 1. Atualizações no Core (`@data7/core`)

#### [MODIFY] [repository-query-service.ts](file:///c:/DEV/Repositories/data7/vscode-extension-data7/packages/data7-core/src/modules/repository-query-service.ts)

- Alterar o diretório de retorno de `getLocalPrivateModulesPath()` para `path.join(os.homedir(), ".data7", "local_modules")`.

#### [MODIFY] [module-orchestrator.ts](file:///c:/DEV/Repositories/data7/vscode-extension-data7/packages/data7-core/src/modules/module-orchestrator.ts)

- Adicionar o método `publishModuleLocally(workspaceDir: string): Promise<void>`:
  - Carrega o manifesto `data7.json` local.
  - Valida se o campo `nome` e `version` estão declarados.
  - Valida se a pasta `src` existe e contém arquivos `.bas`.
  - Roda o parser nos arquivos `.bas` sob `src` para garantir integridade.
  - Cria o diretório de destino em `~/.data7/local_modules/{nome_do_modulo_em_lowercase}`.
  - Copia o `data7.json` e todos os arquivos `.bas` sob `src` recursivamente.

#### [MODIFY] [index.ts](file:///c:/DEV/Repositories/data7/vscode-extension-data7/packages/data7-core/src/index.ts)

- Certificar-se de que novos símbolos necessários para validação e publicação de módulos estejam exportados no entrypoint.

---

### 2. Atualizações no CLI (`@data7/cli`)

#### [MODIFY] [cli.ts](file:///c:/DEV/Repositories/data7/vscode-extension-data7/packages/data7-cli/src/cli.ts)

- Adicionar comando `publish-local`:
  - Invoca `ModuleOrchestrator.publishModuleLocally(process.cwd())`.
  - Imprime no terminal o progresso de validação e confirmação da cópia física com sucesso.

---

### 3. Atualizações na Extensão VS Code (`packages/data7-vscode`)

#### [MODIFY] [package.json](file:///c:/DEV/Repositories/data7/vscode-extension-data7/packages/data7-vscode/package.json)

- Adicionar a sub-view `data7.quickActionsView` sob a aba lateral `data7-explorer`.
- Registrar o comando `data7.modules.publishLocal` associado à paleta de comandos e a um ícone rápido no menu da sidebar.

#### [NEW] [quick-actions-provider.ts](file:///c:/DEV/Repositories/data7/vscode-extension-data7/packages/data7-vscode/src/providers/quick-actions-provider.ts)

- Provedor de TreeView colapsável que expõe comandos comuns do ecossistema:
  - "Executar Linter" -> dispara `data7.runLinter`
  - "Compilar Projeto" -> dispara `data7.build`
  - "Executar Projeto" -> dispara `data7.project.run`
  - "Publicar Módulo Localmente" -> dispara `data7.modules.publishLocal`
  - "Sincronizar Dependências" -> dispara `data7.modules.updateDependencies`

#### [MODIFY] [extension.ts](file:///c:/DEV/Repositories/data7/vscode-extension-data7/packages/data7-vscode/src/extension.ts)

- Instanciar e registrar `QuickActionsProvider` na inicialização (`data7.quickActionsView`).

#### [MODIFY] [commands.ts](file:///c:/DEV/Repositories/data7/vscode-extension-data7/packages/data7-vscode/src/commands.ts)

- Adicionar handler para `data7.modules.publishLocal`:
  - Roda o processo de publicação local via `@data7/core`.
  - Mostra mensagens de notificação no VS Code em caso de falha de validação ou de sucesso na publicação.
  - Dispara a atualização visual da TreeView de Gerenciador de Módulos.

---

## Verification Plan

### Automated Tests

- Escrever testes em `packages/data7-core/src/test/modules/module-orchestrator.test.ts` validando:
  - Fluxo de sucesso na publicação local (arquivos válidos e manifesto correto).
  - Fluxo de erro por manifesto inválido, arquivos ausentes ou erros sintáticos (deve abortar sem copiar).
  - Comportamento do repositório agnóstico a IDE.
- Rodar a suíte inteira via `npm run test`.

### Manual Verification

- Empacotar e testar a extensão validando a renderização correta de duas seções colapsáveis na Sidebar e a execução limpa de "Publicar Módulo Localmente" em um projeto de teste.
