import { COMMAND_IDS } from "@data7/core";
import * as vscode from "vscode";

export class QuickActionItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly commandId: string,
    public readonly iconName: string,
    public readonly tooltipText: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltipText;
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.command = {
      title: label,
      command: commandId,
    };
  }
}

export class QuickActionSection extends vscode.TreeItem {
  constructor(
    public readonly sectionId: string,
    label: string,
    public readonly children: QuickActionItem[],
    iconName?: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    if (iconName) {
      this.iconPath = new vscode.ThemeIcon(iconName);
    }
  }
}

export type QuickActionTreeNode = QuickActionSection | QuickActionItem;

function item(
  label: string,
  commandId: string,
  iconName: string,
  tooltipText: string,
): QuickActionItem {
  return new QuickActionItem(label, commandId, iconName, tooltipText);
}

function buildQuickActionSections(): QuickActionSection[] {
  return [
    new QuickActionSection(
      "config",
      "Configuração",
      [
        item(
          "Configurações",
          COMMAND_IDS.openSettings,
          "settings-gear",
          "Executor, features, linter, açúcares e fallbacks de execução.",
        ),
        item(
          "Mostrar Saída",
          COMMAND_IDS.showOutput,
          "output",
          "Abre o canal de log da extensão Data7.",
        ),
      ],
      "settings-gear",
    ),
    new QuickActionSection(
      "project",
      "Projeto",
      [
        item(
          "Novo Projeto",
          COMMAND_IDS.newProject,
          "add",
          "Cria um projeto com data7.json completo.",
        ),
        item(
          "Abrir Projeto",
          COMMAND_IDS.openProject,
          "folder-opened",
          "Decompõe um .7Proj em estrutura .bas editável.",
        ),
        item("Compilar", COMMAND_IDS.build, "tools", "Empacota a árvore atual no .7Proj."),
        item("Executar", COMMAND_IDS.runProject, "play", "Executa o projeto no Executor Data7."),
        item(
          "Decompor",
          COMMAND_IDS.decompose,
          "file-code",
          "Decompõe o .7Proj ativo in-place em arquivos .bas.",
        ),
        item(
          "Abrir no Dev Studio",
          COMMAND_IDS.openDevStudio,
          "link-external",
          "Abre o projeto ativo no Developer Studio.",
        ),
      ],
      "folder",
    ),
    new QuickActionSection(
      "modules",
      "Módulos",
      [
        item(
          "Instalar Módulo",
          COMMAND_IDS.installModule,
          "cloud-download",
          "Instala um módulo do repositório no projeto ativo.",
        ),
        item(
          "Sincronizar Dependências",
          COMMAND_IDS.updateDependencies,
          "sync",
          "Instala ou atualiza dependências declaradas no data7.json.",
        ),
        item(
          "Sugerir Dependências",
          COMMAND_IDS.suggestDependencies,
          "search",
          "Escaneia o código e sugere dependências ausentes.",
        ),
        item(
          "Explorar Repositório",
          COMMAND_IDS.exploreRepository,
          "folder-library",
          "Abre o repositório privado de módulos no explorador.",
        ),
        item(
          "Importar para Repositório",
          COMMAND_IDS.importModuleToRepository,
          "archive",
          "Importa um módulo ou projeto para o repositório privado.",
        ),
        item(
          "Publicar Localmente",
          COMMAND_IDS.publishLocal,
          "cloud-upload",
          "Valida e publica o módulo ativo no repositório privado.",
        ),
        item(
          "Publicar Online",
          COMMAND_IDS.publishOnline,
          "cloud",
          "Valida e publica o módulo ativo no repositório remoto.",
        ),
      ],
      "package",
    ),
    new QuickActionSection(
      "quality",
      "Qualidade",
      [
        item(
          "Analisar Projeto",
          COMMAND_IDS.runLinter,
          "refresh",
          "Executa o linter em todo o workspace.",
        ),
        item(
          "Corrigir Arquivo",
          COMMAND_IDS.fixActiveFile,
          "lightbulb",
          "Aplica correções automáticas no arquivo .bas ativo.",
        ),
        item(
          "Corrigir Projeto",
          COMMAND_IDS.fixAllWorkspace,
          "tools",
          "Aplica todas as correções automáticas no workspace.",
        ),
        item(
          "Prévia Transpilada",
          COMMAND_IDS.previewTranspiledCode,
          "split-horizontal",
          "Mostra o código transpilado em editor ao lado.",
        ),
      ],
      "checklist",
    ),
    new QuickActionSection(
      "tools",
      "Ferramentas",
      [
        item(
          "Gerar System Library",
          COMMAND_IDS.generateSystemLibraryDocs,
          "book",
          "Gera documentação .md da System Library.",
        ),
        item(
          "Sincronizar AGENTS.md",
          COMMAND_IDS.injectSystemLibraryDocs,
          "file-add",
          "Injeta documentação da System Library no AGENTS.md.",
        ),
        item(
          "Instalar Servidor MCP",
          COMMAND_IDS.installMcpServer,
          "extensions",
          "Instala ou atualiza o servidor MCP da extensão.",
        ),
        item(
          "Configuração MCP",
          COMMAND_IDS.previewMcpClientConfig,
          "json",
          "Mostra JSON de configuração para clientes MCP.",
        ),
      ],
      "tools",
    ),
  ];
}

export class QuickActionsProvider implements vscode.TreeDataProvider<QuickActionTreeNode> {
  private readonly sections = buildQuickActionSections();
  private readonly _onDidChangeTreeData: vscode.EventEmitter<
    QuickActionTreeNode | undefined | null | void
  > = new vscode.EventEmitter<QuickActionTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<QuickActionTreeNode | undefined | null | void> =
    this._onDidChangeTreeData.event;

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: QuickActionTreeNode): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: QuickActionTreeNode): vscode.ProviderResult<QuickActionTreeNode[]> {
    if (!element) {
      return this.sections;
    }
    if (element instanceof QuickActionSection) {
      return element.children;
    }
    return [];
  }
}
