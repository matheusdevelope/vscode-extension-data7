Aqui está o documento de especificação definitivo. Ele consolida todo o histórico do nosso planejamento, ajusta a nomenclatura oficial para **data7** e define o plano de migração passo a passo para o "Super Monorepo Centralizado", criando a estratégia ideal para o seu agente de IA executar o projeto a partir de uma branch de desenvolvimento dedicada.

---

````markdown
# Documento de Especificação Técnica: Ecossistema Monorepo Centralizado (data7)

## 1. Visão Geral
Este documento estabelece o roteiro de migração arquitetural e a especificação de recursos do ecossistema **data7**. O objetivo é unificar a extensão de IDE, a futura ferramenta de terminal (CLI), o núcleo compartilhado de regras de negócio e o repositório público de submódulos em um único "Super Monorepo" gerenciado via Node.js Workspaces.

Toda a arquitetura é regida pelos princípios **SOLID** e **DRY**, garantindo isolamento de escopo, extensibilidade e proteção ao código-fonte local.

---

## 2. Fase 1: Roteiro de Migração Arquitetural
Para garantir a segurança do código estável atual, a migração e as implementações seguintes devem ocorrer estritamente em uma branch isolada.

### Instruções para o Agente de IA:
1. **Criação da Branch:** A partir da branch principal (`main`), crie e alterne para uma nova branch de desenvolvimento chamada `feature/migration-to-super-monorepo`.
2. **Inicialização do Workspace:** Na raiz do projeto, configure o `package.json` global para gerenciar os subprojetos e isolar a pasta de distribuição de módulos públicos:

```json
{
  "name": "data7-ecosystem",
  "private": true,
  "engines": {
    "node": ">=20.0.0"
  },
  "workspaces": [
    "packages/*"
  ]
}

````

### Nova Estrutura de Pastas Centralizada

O repositório unificado deverá ser reestruturado exatamente como segue:

```text
/ (Raiz do Repositório Geral - data7)
├── package.json                 # Configuração global de Workspaces
├── .github/workflows/           # Centralização de Pipelines CI/CD
│   ├── modules-pr-validation.yml        # Validação de contribuições externas nos módulos
│   ├── modules-release-processor.yml    # Processamento automático de Git Tags por módulo
│   └── extension-release.yml    # Pipeline futuro para publicação da extensão
│
├── packages/                    # SUBPROJETOS (Workspaces Node)
│   ├── data7-core/              # 🧠 Núcleo de Regras de Negócio (Biblioteca Pura)
│   │   ├── src/                 # Classes: ModuleOrchestrator, ManifestRegistry, etc.
│   │   └── package.json
│   │
│   ├── data7-vscode/            # 🔌 Extensão do VS Code
│   │   ├── src/extension.ts     # Interface com a IDE (Consome @data7/core)
│   │   └── package.json
│   │
│   └── data7-cli/               # 💻 Interface de Linha de Comando (CLI Clean futura)
│       ├── src/cli.ts           # Interface de Terminal (Consome @data7/core)
│       └── package.json
│
├── scripts/                     # Scripts utilitários de automação do CI
│   ├── modules-validate-pr.js
│   └── modules-release-processor.js
│
└── modules/                     # 📦 Repositório Online de Módulos Públicos
    ├── moduloA/
    │   └── data7.json         # Manifesto individual do móduloA
    └── moduloB/
        └── data7.json         # Manifesto individual do móduloB

```

---

## 3. Fase 2: Implementação do Gerenciador de Módulos (`data7-core`)

Assim que a estrutura de pastas for consolidada na branch de migração, a implementação técnica deve iniciar pelo pacote `@data7/core`. Toda a lógica do ciclo de vida dos módulos deve ser encapsulada aqui para servir tanto à extensão (`data7-vscode`) quanto à CLI (`data7-cli`).

### O Manifesto `data7.json`

Cada projeto ou módulo individual possui um arquivo `data7.json` na raiz que serve como cérebro de metadados:

```json
{
  "nome": "nome-do-modulo-ou-projeto",
  "language": "Basic",
  "version": "1.0.0.0",
  "targetPlatform": "Default",
  "opcoes": {
    "autor": "Desenvolvedor",
    "versao": "1.0.0.0",
    "informacoes": "Projeto criado no VS Code",
    "codEmpresa": 1,
    "codFilial": 1,
    "nomeUsuario": "Administrador",
    "preScript": "",
    "identificacaoBancoDados": "6B3204FB-3574-45D3-84F1-57F413F10C4E"
  },
  "virtualFolders": [],
  "modulesMetadata": {},
  "dependencies": {}
}

```

### Regra de Instalação Explícita e Proteção de Escopo

- **Ação Explícita:** Módulos só entram na lista de dependências do `data7.json` se o usuário solicitar manualmente (via UI ou comando), ou ao fazer a decomposição de um projeto empacotado, a extensão pode sugerir atualizar a lista de dependência verificando os namespaces usados que não existem na lista de dependência e existem nos repositórios locais e públicos.
- **Proteção ao Desenvolvimento Ativo:** Ao abrir um projeto, o `@data7/core` analisa se o namespace em desenvolvimento coincide com o declarado. Caso sim, o orquestrador **bloqueia qualquer substituição, deleção ou sobrescrita**, tratando os arquivos da pasta de trabalho como fonte primária da verdade.

### Pipeline de Resolução Híbrido (Múltiplos Registros)

Ao executar a sincronização ou instalação de dependências, o `@data7/core` segue rigidamente a seguinte fila de busca e prioridade:

1. **Escopo do Projeto Atual:** Valida se é o próprio módulo em edição (aplica a proteção acima).
2. **Registro Local Privado:** Busca na pasta global da IDE do desenvolvedor (ex: `~/.data7/vscode/local_modules/`). Módulos encontrados aqui são clonados/vinculados diretamente e **nunca** sobem para a nuvem pública.
3. **Registro Online Público:** Caso não encontre nas fases anteriores, consome a API do GitHub para baixar o pacote do diretório `modules/` do Monorepo.

---

## 4. Fase 3: Governança e Automação do Repositório (`modules/`)

Os fluxos do GitHub Actions relacionados aos módulos devem rodar de forma isolada, monitorando apenas a pasta `modules/` para garantir que contribuições externas via extensão não interfiram nas ferramentas de desenvolvimento (`packages/*`).

### Workflow 1: Validação de Pull Requests (`modules-pr-validation.yml`)

Disparado quando um usuário utiliza a função pública de publicação na extensão. O script associado (`scripts/modules-validate-pr.js`) executa as seguintes verificações de segurança:

- **Barreira de Escopo:** Bloqueia o PR se hover qualquer arquivo alterado fora do diretório `modules/`.
- **Atomicidade:** Garante que apenas um módulo esteja sendo alterado/adicionado por Pull Request.
- **Conformidade de Nome:** Valida se o nome da pasta física é idêntico ao campo `name` do `data7.json`.

### Workflow 2: Processador de Releases Automático (`modules-release-processor.yml`)

Disparado após o merge de um PR aprovado na branch `main`:

- O script `scripts/modules-release-processor.js` identifica qual pasta dentro de `modules/` foi modificada.
- Lê o incremento de versão no `data7.json`.
- Cria uma Tag Git no padrão `nome-do-modulo-vX.Y.Z` de forma isolada e publica uma GitHub Release oficial documentando a atualização.

---

## 5. Interface com o Usuário (`data7-vscode`)

### Aba Lateral Dedicada (Sidebar View)

- **Painel de Módulos Instalados:** Exibe a lista obtida nas `dependencies` do `data7.json` local. Cada item possui uma caixa de seleção (_checkbox_) para operações em lote.
- **Tags de Origem:** Identificação visual nítida ao lado de cada dependência utilizando os rótulos `[🌐 Online]` ou `[💻 Local]`.
- **Barra de Controle:** Botões para "Instalar Selecionados", "Atualizar Selecionados", "Atualizar Tudo" e "Publicar Módulo" (este último aciona o fluxo de PR automático para o monorepo).
- **Alertas Proativos:** Varredura em segundo plano em segundo plano ao abrir o ambiente. Caso existam novas versões de tags disponíveis na nuvem ou na pasta local para os módulos em uso, exibe uma notificação discreta permitindo a atualização em um clique.

### Paleta de Comandos (Command Palette)

Replicação de 100% dos recursos visuais em comandos de teclado:

- `data7: Instalar Módulo`
- `data7: Atualizar Todos os Módulos`
- `data7: Publicar Módulo Atual`
- `data7: Sincronizar Dependências`

---

## 6. Arquitetura de Classes Recomendada para o Agente de IA (`@data7/core`)

Para manter os princípios **SOLID**, a lógica no pacote core deve ser segregada em componentes especialistas:

1. **`ModuleOrchestrator`:** Classe central que inicializa as escutas do ambiente e delega tarefas aos serviços de acordo com o fluxo escolhido.
2. **`ManifestRegistry`:** Componente responsável estritamente por ler, parsing, validar esquemas de dados e persistir modificações no arquivo `data7.json`.
3. **`RepositoryQueryService`:** Fachada de dados que unifica a busca no sistema de arquivos local (`~/.data7/vscode/local_modules/`) e as requisições de tags à API Rest do GitHub.
4. **`DependencySynchronizer`:** Mecanismo focado no download, descompactação, resolução de colisões de dependências e injeção física de pacotes no diretório de destino do projeto.
