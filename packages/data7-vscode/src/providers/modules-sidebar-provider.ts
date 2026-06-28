import * as vscode from "vscode";
import { logger } from "@data7/core";

import * as path from "path";
import * as fs from "fs";
import { ManifestRegistry, RepositoryQueryService, ModuleOrchestrator } from "@data7/core";
import { ProjectService } from "../services/project-service";
import { DependencyService } from "../services/dependency-service";

export class ModuleTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly version: string,
    public readonly type: "local" | "online" | "missing",
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    super(label, collapsibleState);
    
    // Add tag to the description
    const tag = type === "local" ? "[💻 Local]" : type === "online" ? "[🌐 Online]" : "[⚠️ Ausente]";
    this.description = `${tag} v${version}`;
    
    // Set appropriate context value for action buttons
    this.contextValue = `module-${type}`;

    // Add checkbox (VS Code 1.80+)
    this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;

    // Use built-in icons
    if (type === "local") {
      this.iconPath = new vscode.ThemeIcon("device-desktop");
    } else if (type === "online") {
      this.iconPath = new vscode.ThemeIcon("globe");
    } else {
      this.iconPath = new vscode.ThemeIcon("warning");
    }
  }
}

export class ModulesSidebarProvider implements vscode.TreeDataProvider<ModuleTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ModuleTreeItem | undefined | null | void> = 
    new vscode.EventEmitter<ModuleTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ModuleTreeItem | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  private items: ModuleTreeItem[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    // Run background scan on startup to warn about available upgrades
    this.runBackgroundUpdateScan();
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: ModuleTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: ModuleTreeItem): Promise<ModuleTreeItem[]> {
    if (element) return [];

    const activeProject = ProjectService.getActiveProject();
    if (!activeProject) {
      return [];
    }

    const manifestPath = path.join(activeProject.workspaceDir, ManifestRegistry.FILENAME);
    const manifest = ManifestRegistry.read(manifestPath);
    if (!manifest) {
      return [];
    }

    const items: ModuleTreeItem[] = [];
    const deps = manifest.dependencies;

    for (const [depName, version] of Object.entries(deps)) {
      // Determine source type of dependency
      let type: "local" | "online" | "missing" = "missing";

      if (RepositoryQueryService.findLocalPrivateModule(depName)) {
        type = "local";
      } else {
        try {
          const onlineManifest = await RepositoryQueryService.fetchOnlineModuleManifest(depName);
          if (onlineManifest) {
            type = "online";
          }
        } catch {
          // Keep as missing if fetch failed
        }
      }

      items.push(new ModuleTreeItem(depName, version, type));
    }

    this.items = items;
    return items;
  }

  /**
   * Performs a background scan comparing active project dependency versions with the registry.
   */
  private async runBackgroundUpdateScan(): Promise<void> {
    // Wait a brief delay after start
    await new Promise(resolve => setTimeout(resolve, 5000));

    const activeProject = ProjectService.getActiveProject();
    if (!activeProject) return;

    const manifestPath = path.join(activeProject.workspaceDir, ManifestRegistry.FILENAME);
    const manifest = ManifestRegistry.read(manifestPath);
    if (!manifest) return;

    const upgradesAvailable: string[] = [];

    for (const [depName, currentVersion] of Object.entries(manifest.dependencies)) {
      try {
        // Check local private module upgrade
        const local = RepositoryQueryService.findLocalPrivateModule(depName);
        if (local && this.isNewerVersion(local.manifest.version, currentVersion)) {
          upgradesAvailable.push(`${depName} (💻 Local: v${local.manifest.version})`);
          continue;
        }

        // Check online module upgrade
        const online = await RepositoryQueryService.fetchOnlineModuleManifest(depName);
        if (online && this.isNewerVersion(online.version, currentVersion)) {
          upgradesAvailable.push(`${depName} (🌐 Online: v${online.version})`);
        }
      } catch {
        // Ignore background query errors
      }
    }

    if (upgradesAvailable.length > 0) {
      const message = `Versões mais recentes encontradas para dependências em uso:\n${upgradesAvailable.join("\n")}`;
      const action = "Atualizar Tudo";
      vscode.window.showInformationMessage(message, action).then(selected => {
        if (selected === action) {
          vscode.commands.executeCommand("data7.modules.updateDependencies");
        }
      });
    }
  }

  private isNewerVersion(available: string, current: string): boolean {
    const p1 = available.split(".").map(Number);
    const p2 = current.split(".").map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const v1 = p1[i] ?? 0;
      const v2 = p2[i] ?? 0;
      if (v1 > v2) return true;
      if (v1 < v2) return false;
    }
    return false;
  }

  public getSelectedItems(): ModuleTreeItem[] {
    return this.items.filter(item => item.checkboxState === vscode.TreeItemCheckboxState.Checked);
  }
}
