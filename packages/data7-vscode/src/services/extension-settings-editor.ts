import * as vscode from "vscode";
import { type Data7Configuration, COMMAND_IDS, normalizeExtensionSettings } from "@data7/core";

import { ExtensionSettingsService } from "./extension-settings-service";

type WebviewMessage =
  | { type: "ready" }
  | { type: "save"; settings: Data7Configuration }
  | { type: "pickExecutor" }
  | { type: "pickSharedModules" };

/**
 * Webview-based editor for extension-owned settings (`extension-settings.json`).
 */
export class ExtensionSettingsEditor {
  private static panel: vscode.WebviewPanel | undefined;

  public static show(context: vscode.ExtensionContext): void {
    if (ExtensionSettingsEditor.panel) {
      ExtensionSettingsEditor.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "data7ExtensionSettings",
      "Configurações Data7",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    ExtensionSettingsEditor.panel = panel;

    panel.webview.html = ExtensionSettingsEditor.renderHtml(panel.webview, context.extensionUri);

    panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      switch (message.type) {
        case "ready":
          await ExtensionSettingsEditor.postSettings(panel.webview);
          return;
        case "save":
          await ExtensionSettingsService.replaceAll(normalizeExtensionSettings(message.settings));
          vscode.window.showInformationMessage("Configurações Data7 salvas.");
          await ExtensionSettingsEditor.postSettings(panel.webview);
          return;
        case "pickExecutor": {
          const selected = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { Executáveis: ["exe"] },
            title: "Selecione o Executor do Data7 (Executor.exe)",
          });
          const file = selected?.[0];
          if (file) {
            await ExtensionSettingsService.updateField("executorPath", file.fsPath);
            await ExtensionSettingsEditor.postSettings(panel.webview);
          }
          return;
        }
        case "pickSharedModules": {
          const selected = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: "Selecione a pasta de módulos compartilhados",
          });
          const folder = selected?.[0];
          if (folder) {
            await ExtensionSettingsService.updateField("sharedModulesPath", folder.fsPath);
            await ExtensionSettingsEditor.postSettings(panel.webview);
          }
          return;
        }
        default:
          return;
      }
    });

    panel.onDidDispose(() => {
      ExtensionSettingsEditor.panel = undefined;
    });

    void vscode.commands.executeCommand("setContext", "data7.settingsEditorOpen", true);
    panel.onDidDispose(() => {
      void vscode.commands.executeCommand("setContext", "data7.settingsEditorOpen", false);
    });
  }

  private static async postSettings(webview: vscode.Webview): Promise<void> {
    webview.postMessage({
      type: "load",
      settings: ExtensionSettingsService.getSnapshot(),
      settingsFilePath: ExtensionSettingsService.getSettingsFilePath() ?? "",
    });
  }

  private static renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = String(Date.now());
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Configurações Data7</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px 20px 80px; }
    h1 { font-size: 1.25rem; margin: 0 0 4px; }
    .hint { color: var(--vscode-descriptionForeground); margin-bottom: 20px; font-size: 0.9rem; }
    section { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 14px 16px; margin-bottom: 14px; }
    h2 { font-size: 1rem; margin: 0 0 12px; }
    label { display: block; margin: 10px 0 4px; font-size: 0.85rem; }
    input[type="text"], input[type="number"], textarea { width: 100%; box-sizing: border-box; padding: 6px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; }
    textarea { min-height: 72px; font-family: var(--vscode-editor-font-family); }
    .row { display: flex; gap: 8px; align-items: center; }
    .row input { flex: 1; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; border-radius: 4px; padding: 6px 12px; cursor: pointer; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 6px 12px; }
    .checks label { display: flex; align-items: center; gap: 8px; margin: 0; }
    .footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 12px 20px; background: var(--vscode-editor-background); border-top: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; }
    code { font-size: 0.8rem; }
  </style>
</head>
<body>
  <h1>Configurações Data7</h1>
  <p class="hint">Todas as opções da extensão ficam em <code id="settingsPath"></code>. Não é necessário editar <code>settings.json</code>.</p>

  <section>
    <h2>Ambiente</h2>
    <label for="executorPath">Caminho do Executor</label>
    <div class="row">
      <input id="executorPath" type="text" />
      <button type="button" class="secondary" id="pickExecutor">Procurar…</button>
    </div>
    <label for="sharedModulesPath">Pasta global de módulos compartilhados</label>
    <div class="row">
      <input id="sharedModulesPath" type="text" />
      <button type="button" class="secondary" id="pickSharedModules">Procurar…</button>
    </div>
  </section>

  <section>
    <h2>Execução (fallback para .7Proj direto)</h2>
    <label for="userName">Usuário (-U)</label>
    <input id="userName" type="text" />
    <label for="companyCode">Empresa (-E)</label>
    <input id="companyCode" type="number" min="1" />
    <label for="branchCode">Filial (-F)</label>
    <input id="branchCode" type="number" min="1" />
    <label for="databaseConnectionId">Conexão de banco (-C)</label>
    <input id="databaseConnectionId" type="text" placeholder="UUID da conexão" />
    <p class="hint">Projetos com <code>data7.json</code> usam <code>opcoes.identificacaoBancoDados</code> e <code>opcoes.nomeUsuario</code>.</p>
  </section>

  <section>
    <h2>Indexação e linter</h2>
    <label for="exclude">Padrões ignorados (um por linha)</label>
    <textarea id="exclude"></textarea>
    <label for="diagnosticSeverity">Severidade por código (JSON)</label>
    <textarea id="diagnosticSeverity" placeholder='{ "unused-import": "info" }'></textarea>
  </section>

  <section>
    <h2>Funcionalidades</h2>
    <div class="checks">
      <label><input type="checkbox" id="features.language.generics" /> Generics</label>
      <label><input type="checkbox" id="features.language.sugars" /> Açúcares sintáticos</label>
      <label><input type="checkbox" id="features.diagnostics.enabled" /> Linter ao editar</label>
      <label><input type="checkbox" id="features.diagnostics.lintWorkspaceOnStartup" /> Linter completo ao abrir IDE</label>
      <label><input type="checkbox" id="features.workspace.detectProjectFiles" /> Detectar .7Proj ao abrir pasta</label>
      <label><input type="checkbox" id="features.workspace.installMcpServerOnStartup" /> Instalar MCP ao ativar</label>
      <label><input type="checkbox" id="features.save.autoFixOnSave" /> Quick fixes ao salvar</label>
      <label><input type="checkbox" id="features.save.autoFormatOnSave" /> Formatar ao salvar</label>
      <label><input type="checkbox" id="features.build.autoFixBeforeBuild" /> Quick fixes antes de build/run</label>
      <label><input type="checkbox" id="features.preview.enabled" /> Prévia transpilada</label>
    </div>
  </section>

  <section>
    <h2>Açúcares (IDs)</h2>
    <label><input type="checkbox" id="sugars.enabled" /> Pipeline de açúcares ativo</label>
    <label for="sugars.enabledIds">IDs habilitados (vazio = todos)</label>
    <input id="sugars.enabledIds" type="text" placeholder="for-each, array-list" />
    <label for="sugars.disabledIds">IDs desabilitados</label>
    <input id="sugars.disabledIds" type="text" placeholder="ternary" />
  </section>

  <div class="footer">
    <button type="button" id="save">Salvar configurações</button>
    <button type="button" class="secondary" id="reload">Recarregar</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let current = null;

    function setChecked(id, value) {
      const el = document.getElementById(id);
      if (el) el.checked = !!value;
    }

    function getChecked(id) {
      const el = document.getElementById(id);
      return el ? !!el.checked : false;
    }

    function fillForm(settings) {
      current = settings;
      document.getElementById('executorPath').value = settings.executorPath || '';
      document.getElementById('sharedModulesPath').value = settings.sharedModulesPath || '';
      document.getElementById('userName').value = settings.userName || '';
      document.getElementById('companyCode').value = String(settings.companyCode ?? 1);
      document.getElementById('branchCode').value = String(settings.branchCode ?? 1);
      document.getElementById('databaseConnectionId').value = settings.databaseConnectionId || '';
      document.getElementById('exclude').value = (settings.exclude || []).join('\\n');
      document.getElementById('diagnosticSeverity').value = JSON.stringify(settings.diagnosticSeverity || {}, null, 2);
      setChecked('features.language.generics', settings.features?.language?.generics);
      setChecked('features.language.sugars', settings.features?.language?.sugars);
      setChecked('features.diagnostics.enabled', settings.features?.diagnostics?.enabled);
      setChecked('features.diagnostics.lintWorkspaceOnStartup', settings.features?.diagnostics?.lintWorkspaceOnStartup);
      setChecked('features.workspace.detectProjectFiles', settings.features?.workspace?.detectProjectFiles);
      setChecked('features.workspace.installMcpServerOnStartup', settings.features?.workspace?.installMcpServerOnStartup);
      setChecked('features.save.autoFixOnSave', settings.features?.save?.autoFixOnSave);
      setChecked('features.save.autoFormatOnSave', settings.features?.save?.autoFormatOnSave);
      setChecked('features.build.autoFixBeforeBuild', settings.features?.build?.autoFixBeforeBuild);
      setChecked('features.preview.enabled', settings.features?.preview?.enabled);
      setChecked('sugars.enabled', settings.sugars?.enabled);
      document.getElementById('sugars.enabledIds').value = (settings.sugars?.enabledIds || []).join(', ');
      document.getElementById('sugars.disabledIds').value = (settings.sugars?.disabledIds || []).join(', ');
    }

    function readForm() {
      let diagnosticSeverity = {};
      try {
        diagnosticSeverity = JSON.parse(document.getElementById('diagnosticSeverity').value || '{}');
      } catch (e) {
        alert('JSON inválido em severidade por código.');
        throw e;
      }
      const splitIds = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);
      return {
        executorPath: document.getElementById('executorPath').value.trim(),
        sharedModulesPath: document.getElementById('sharedModulesPath').value.trim(),
        userName: document.getElementById('userName').value.trim(),
        companyCode: Number(document.getElementById('companyCode').value) || 1,
        branchCode: Number(document.getElementById('branchCode').value) || 1,
        databaseConnectionId: document.getElementById('databaseConnectionId').value.trim(),
        exclude: document.getElementById('exclude').value.split(/\\r?\\n/).map((s) => s.trim()).filter(Boolean),
        diagnosticSeverity,
        features: {
          language: {
            generics: getChecked('features.language.generics'),
            sugars: getChecked('features.language.sugars'),
          },
          diagnostics: {
            enabled: getChecked('features.diagnostics.enabled'),
            lintWorkspaceOnStartup: getChecked('features.diagnostics.lintWorkspaceOnStartup'),
          },
          workspace: {
            detectProjectFiles: getChecked('features.workspace.detectProjectFiles'),
            installMcpServerOnStartup: getChecked('features.workspace.installMcpServerOnStartup'),
          },
          save: {
            autoFixOnSave: getChecked('features.save.autoFixOnSave'),
            autoFormatOnSave: getChecked('features.save.autoFormatOnSave'),
          },
          build: {
            autoFixBeforeBuild: getChecked('features.build.autoFixBeforeBuild'),
          },
          preview: {
            enabled: getChecked('features.preview.enabled'),
          },
        },
        sugars: {
          enabled: getChecked('sugars.enabled'),
          enabledIds: splitIds(document.getElementById('sugars.enabledIds').value),
          disabledIds: splitIds(document.getElementById('sugars.disabledIds').value),
        },
      };
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'load') {
        document.getElementById('settingsPath').textContent = message.settingsFilePath || 'extension-settings.json';
        fillForm(message.settings);
      }
    });

    document.getElementById('save').addEventListener('click', () => {
      vscode.postMessage({ type: 'save', settings: readForm() });
    });
    document.getElementById('reload').addEventListener('click', () => vscode.postMessage({ type: 'ready' }));
    document.getElementById('pickExecutor').addEventListener('click', () => vscode.postMessage({ type: 'pickExecutor' }));
    document.getElementById('pickSharedModules').addEventListener('click', () => vscode.postMessage({ type: 'pickSharedModules' }));
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

export function registerExtensionSettingsEditor(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.openSettings, () => {
      ExtensionSettingsEditor.show(context);
    }),
  );
}
