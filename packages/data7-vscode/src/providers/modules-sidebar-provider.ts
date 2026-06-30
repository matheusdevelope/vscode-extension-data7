import * as vscode from "vscode";
import { ModuleOrchestrator, RepositoryQueryService, type ModuleCatalogEntry } from "@data7/core";
import { ProjectService } from "../services/project-service";

export class ModuleTreeItem extends vscode.TreeItem {
  public checkboxState?: vscode.TreeItemCheckboxState;

  constructor(
    public readonly label: string,
    public readonly itemKind: "section" | "module",
    public readonly moduleName?: string,
    public readonly source?: "local" | "online",
    public readonly version?: string,
    public readonly installed = false,
    public readonly updateAvailable = false,
    public readonly isCurrentProject = false,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
  ) {
    super(label, collapsibleState);

    if (itemKind === "section") {
      this.contextValue = "module-section";
      this.iconPath = new vscode.ThemeIcon("folder");
      return;
    }

    const sourceLabel = source === "local" ? "Local" : "Online";
    const installedLabel = isCurrentProject
      ? "projeto atual"
      : installed
        ? "instalado"
        : "disponível";
    const updateLabel = updateAvailable ? " - atualização disponível" : "";
    this.description = `${sourceLabel} v${version ?? "latest"} - ${installedLabel}${updateLabel}`;
    this.tooltip = this.description;
    this.contextValue = [
      "module",
      source === "local" ? "local" : "online",
      isCurrentProject ? "currentProject" : "notCurrentProject",
      installed ? "installed" : "available",
      updateAvailable ? "updateAvailable" : "current",
    ].join("-");

    if (!isCurrentProject) {
      this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
    }
    this.iconPath =
      source === "local" ? new vscode.ThemeIcon("device-desktop") : new vscode.ThemeIcon("globe");
  }
}

export class ModulesSidebarProvider implements vscode.TreeDataProvider<ModuleTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ModuleTreeItem | undefined | null | void> =
    new vscode.EventEmitter<ModuleTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ModuleTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private items: ModuleTreeItem[] = [];
  private readonly checkedNames = new Map<string, string>();
  private readonly localSection = new ModuleTreeItem(
    "Repositório local",
    "section",
    undefined,
    undefined,
    undefined,
    false,
    false,
    false,
    vscode.TreeItemCollapsibleState.Expanded,
  );
  private readonly onlineSection = new ModuleTreeItem(
    "Repositório online",
    "section",
    undefined,
    undefined,
    undefined,
    false,
    false,
    false,
    vscode.TreeItemCollapsibleState.Expanded,
  );
  private catalog: ModuleCatalogEntry[] = [];

  constructor(context: vscode.ExtensionContext) {
    const startupTimer = setTimeout(() => {
      void this.refreshOnlineCatalogAndScan(false);
    }, 5000);
    context.subscriptions.push({
      dispose: () => clearTimeout(startupTimer),
    });

    const interval = setInterval(
      () => {
        void this.refreshOnlineCatalogAndScan(true);
      },
      30 * 60 * 1000,
    );
    context.subscriptions.push({
      dispose: () => clearInterval(interval),
    });
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: ModuleTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: ModuleTreeItem): Promise<ModuleTreeItem[]> {
    const activeProject = ProjectService.getActiveProject();
    if (!activeProject) {
      return [];
    }

    if (!element) {
      return [this.localSection, this.onlineSection];
    }

    if (element.itemKind !== "section") {
      return [];
    }

    try {
      this.catalog = await ModuleOrchestrator.listCatalog(activeProject.workspaceDir);
    } catch {
      this.catalog = [];
    }
    const source = element === this.localSection ? "local" : "online";
    const items = this.catalog
      .filter((entry) => entry.source === source)
      .map((entry) => this.createModuleItem(entry));
    this.items = items;
    return items;
  }

  public setCheckboxStates(items: readonly [ModuleTreeItem, vscode.TreeItemCheckboxState][]): void {
    for (const [item, state] of items) {
      if (item.itemKind !== "module" || !item.moduleName) continue;
      if (state === vscode.TreeItemCheckboxState.Checked) {
        this.checkedNames.set(item.moduleName.toLowerCase(), item.moduleName);
      } else {
        this.checkedNames.delete(item.moduleName.toLowerCase());
      }
      item.checkboxState = state;
    }
    this._onDidChangeTreeData.fire();
  }

  /**
   * Performs a background scan comparing active project dependency versions with the registry.
   */
  private async refreshOnlineCatalogAndScan(forceRefresh: boolean): Promise<void> {
    const activeProject = ProjectService.getActiveProject();
    if (!activeProject) return;

    let upgradesAvailable: string[] = [];
    try {
      await RepositoryQueryService.listOnlineModuleEntries(forceRefresh);
      upgradesAvailable = (await ModuleOrchestrator.listCatalog(activeProject.workspaceDir))
        .filter((entry) => entry.updateAvailable)
        .map(
          (entry) =>
            `${entry.name} (${entry.source === "local" ? "Local" : "Online"}: v${entry.version})`,
        );
    } catch {
      upgradesAvailable = [];
    }

    if (upgradesAvailable.length > 0) {
      const message = `Versões mais recentes encontradas para dependências em uso:\n${upgradesAvailable.join("\n")}`;
      const action = "Atualizar Tudo";
      vscode.window.showInformationMessage(message, action).then((selected) => {
        if (selected === action) {
          vscode.commands.executeCommand("data7.modules.updateDependencies");
        }
      });
    }
  }

  private createModuleItem(entry: ModuleCatalogEntry): ModuleTreeItem {
    const item = new ModuleTreeItem(
      entry.name,
      "module",
      entry.name,
      entry.source,
      entry.version,
      entry.installed,
      entry.updateAvailable,
      entry.isCurrentProject,
    );
    item.checkboxState = this.checkedNames.has(entry.name.toLowerCase())
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    return item;
  }

  public getSelectedModuleNames(): string[] {
    return Array.from(this.checkedNames.values());
  }

  public getSelectedOrItemModuleNames(item?: ModuleTreeItem): string[] {
    if (item?.itemKind === "module" && item.moduleName) {
      return [item.moduleName];
    }
    return this.getSelectedModuleNames();
  }
}
