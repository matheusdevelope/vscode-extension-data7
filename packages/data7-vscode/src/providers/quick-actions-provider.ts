import { COMMAND_IDS } from "@data7/core";
import * as vscode from "vscode";

export class QuickActionItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly commandId: string,
    public readonly iconName: string,
    public readonly tooltipText: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltipText;
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.command = {
      title: label,
      command: commandId
    };
  }
}

export class QuickActionsProvider implements vscode.TreeDataProvider<QuickActionItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<QuickActionItem | undefined | null | void> =
    new vscode.EventEmitter<QuickActionItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<QuickActionItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: QuickActionItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: QuickActionItem): vscode.ProviderResult<QuickActionItem[]> {
    if (element) return [];

    return [
      new QuickActionItem(
        "Executar Linter no Workspace",
        COMMAND_IDS.runLinter,
        "search",
        "Executa a análise estática em busca de erros no projeto ativo."
      ),
      new QuickActionItem(
        "Corrigir Código",
        COMMAND_IDS.fixActiveFile,
        "lightbulb",
        "Corrige erros de formatação e boas práticas no arquivo ativo."
      ),
      new QuickActionItem(
        "Abrir Projeto",
        COMMAND_IDS.openProject,
        "folder",
        "Abre um projeto existente."
      ),
      new QuickActionItem(
        "Novo Projeto",
        COMMAND_IDS.newProject,
        "add",
        "Cria um novo projeto."
      ),
      new QuickActionItem(
        "Abrir no DevStudio",
        COMMAND_IDS.openDevStudio,
        "link-external",
        "Abre o projeto ativo no DevStudio."
      ),
      new QuickActionItem(
        "Compilar Projeto",
        COMMAND_IDS.build,
        "tools",
        "Compila o projeto ativo (.7proj)."
      ),
      new QuickActionItem(
        "Executar Projeto",
        COMMAND_IDS.runProject,
        "play",
        "Executa o projeto ativo no simulador/executável."
      ),
      new QuickActionItem(
        "Publicar Módulo Localmente",
        COMMAND_IDS.publishLocal,
        "cloud-upload",
        "Valida e publica o módulo ativo no repositório privado local."
      ),
      new QuickActionItem(
        "Publicar Módulo Online",
        COMMAND_IDS.publishOnline,
        "cloud",
        "Valida e publica o módulo ativo no repositório remoto público."
      ),
      new QuickActionItem(
        "Sugerir Dependências (Auto-Scan)",
        COMMAND_IDS.suggestDependencies,
        "question",
        "Escaneia o projeto e sugere a inclusão de dependências ausentes."
      ),
      new QuickActionItem(
        "Sincronizar Dependências",
        COMMAND_IDS.updateDependencies,
        "sync",
        "Instala ou atualiza as dependências do projeto ativo."
      ),
      new QuickActionItem(
        "Sincronizar AGENTS.md",
        COMMAND_IDS.injectSystemLibraryDocs,
        "book",
        "Sincroniza a documentação da System Library no arquivo AGENTS.md."
      )
    ];
  }
}
