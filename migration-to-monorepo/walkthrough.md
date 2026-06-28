# Migração para Monorepo e Gerenciador de Módulos Data7

Este documento resume a migração completa do repositório Data7 para uma estrutura de monorepo moderna com workspaces do Node.js, a implementação das classes do Gerenciador de Módulos (Module Manager), a criação de um CLI nativo, a integração da barra lateral (Sidebar) no VS Code e a configuração de automações CI/CD.

## Mudanças Realizadas

A reestruturação foi executada dividindo o repositório nas seguintes partes:

### 1. Estrutura de Monorepo
* **Root Workspace**: Configurado `package.json` com `workspaces: ["packages/*"]` para orquestração geral.
* **`packages/data7-core`**:
  * Contém toda a lógica independente da API do VS Code (análise sintática/semântica, parser, linters, compilador e MCP runtime).
  * Expõe todas as APIs públicas em [index.ts](file:///c:/DEV/Repositories/data7/vscode-extension-data7/packages/data7-core/src/index.ts).
  * Compila de forma independente com TypeScript e inclui o runtime MCP.
* **`packages/data7-vscode`**:
  * Contém os adapters de UI do VS Code (providers de linguagem, services de I/O, comandos e barra lateral).
  * Declarado como dependente de `@data7/core` no `package.json` resolvido localmente pelo NPM workspaces.
* **`packages/data7-cli`**:
  * CLI executável sob o comando `data7` suportando comandos de compilação (`build`), análise estática (`lint`) e sincronização (`sync`).
  * Utiliza o shim oficial (`installVscodeShim()`) na inicialização para rodar fora do host do VS Code.

### 2. Gerenciador de Módulos (Module Manager)
Criadas as quatro classes fundamentais de resolução e ciclo de vida sob `@data7/core/src/modules/`:
* **`ManifestRegistry`**: Manipula a leitura, escrita e validação formal de arquivos `data7.json` de manifesto do projeto.
* **`RepositoryQueryService`**: Consulta as fontes de dependências com ordem de prioridade estrita (projeto -> local private em `~/.data7/vscode/local_modules` -> online public via API GitHub Releases).
* **`DependencySynchronizer`**: Realiza o download ou cópia física e a injeção limpa de módulos dentro de `data7_modules/`.
* **`ModuleOrchestrator`**: Centraliza o orquestrador geral do ciclo de vida e ativa a **proteção ao desenvolvimento ativo**, impedindo substituição de módulos no workspace quando seu namespace coincide com uma dependência externa.

### 3. Integração de UI no VS Code
* **Gerenciador de Módulos Sidebar**: Integrado TreeView no painel esquerdo (`data7-explorer`) mapeando as dependências ativas com as etiquetas `[🌐 Online]` ou `[💻 Local]`.
* **Ações Rápidas & Checkboxes**: Suporta seleção nativa e em lote (checkboxes) para atualizar e instalar dependências.
* **Verificação de Updates em Background**: Varredura silenciosa na inicialização que dispara uma notificação amigável para o usuário caso existam atualizações disponíveis para os módulos ativos.

### 4. Scripts e Workflows de Automação
* **Validação de PR (`scripts/modules-validate-pr.js`)**: Garante barreiras de escopo restritas e atomicidade (apenas 1 módulo alterado por PR) com conformidade estrita de nomenclatura física/lógica.
* **Processador de Releases (`scripts/modules-release-processor.js`)**: Executa em pushes à branch `main` gerando a Tag Git isolada e publicando a GitHub Release automaticamente.
* **Workflows no GitHub (`.github/workflows/`)**:
  * `modules-pr-validation.yml`: Roda a validação de escopo em PRs.
  * `modules-release-processor.yml`: Publica releases dos módulos alterados.
  * `extension-release.yml`: Compila, testa e gera o arquivo `.vsix` da extensão.

### 5. Repositório Local Agnóstico & Publicação Local
* **Caminho Agnóstico**: O repositório privado local foi alterado para `~/.data7/local_modules/`, de modo a não ser acoplado a nenhuma IDE específica.
* **Publicação Local (`publishModuleLocally`)**: Implementada a funcionalidade que:
  * Valida a existência do manifesto `data7.json` e a presença obrigatória do campo `nome`.
  * Valida que a pasta `src/` existe e contém pelo menos um arquivo de extensão `.bas`.
  * Realiza a análise sintática de todos os arquivos `.bas` usando o compilador core (`parseBasic`) para assegurar que nenhum código com erro de compilação ou sintaxe seja publicado.
  * Copia os arquivos validados para a pasta do repositório local privado.
* **Comando CLI**: Integrado o comando `publish-local` ao CLI nativo, permitindo publicar módulos diretamente do terminal.

### 6. Reestruturação da Sidebar no VS Code
* **Quick Actions Tree View**: Criado um novo provedor (`QuickActionsProvider`) contendo atalhos rápidos e fluxos de trabalho comuns:
  * Linter do Workspace
  * Compilação do Projeto
  * Execução do Projeto
  * Publicação Local de Módulo
  * Sincronização de Dependências
  * Sincronização do AGENTS.md
* **Registro de Comando**: Registrado o comando `data7.modules.publishLocal` com barra de progresso nativa do VS Code (`vscode.window.withProgress`) e mensagens informativas.

### 7. Sugestão e Importação de Módulos (Auto-Scan)
* **Varredura Ativa**: Implementada a função `suggestAndInstallDetectedDependencies` para identificar namespaces qualificados ou importados que não pertencem à `system-library` e não estão declarados localmente nem em `data7.json#dependencies`.
* **Notificação Amigável na Inicialização**: Durante a ativação do workspace, a extensão detecta as ausências silenciosamente e exibe uma notificação discreta oferecendo a inclusão ("Adicionar como Dependências").
* **Diálogo de Seleção Interativo**: Caso aceito ou acionado manualmente via comando/Quick Action, apresenta um `QuickPick` de seleção múltipla (com checkboxes) para marcar quais dependências adicionar. A lista de dependências no `data7.json` é então atualizada e sincronizada automaticamente.

---

## Validação e Testes Executados

1. **Compilação Completa**:
   * O pacote core (`@data7/core`), o pacote CLI (`@data7/cli`) e a extensão do VS Code (`vscode-extension-data7`) compilam 100% com sucesso.

2. **Testes do Workspace**:
   * Adicionados testes automatizados cobrindo todos os cenários de sucesso e erro (manifesto inválido, pasta src vazia, arquivos com erro de sintaxe) para a publicação local.
   * Adicionados novos testes unitários para a sugestão de dependências (manual e inicialização/silencioso).
   * **Resultado**: **Todos os 883 testes passaram com sucesso** (703 no core, 180 no VS Code):
     ```text
     [Core Tests]
     ℹ tests 703
     ℹ suites 156
     ℹ pass 703
     ℹ fail 0

     [VS Code Tests]
     ℹ tests 180
     ℹ suites 74
     ℹ pass 180
     ℹ fail 0
     ```

---

## Conclusão
A migração para monorepo e a implementação das funcionalidades adicionais de publicação local, reestruturação da sidebar e o fluxo de sugestão automatizada de dependências estão concluídas e validadas com sucesso. O ambiente está 100% operacional e coberto por testes robustos.
