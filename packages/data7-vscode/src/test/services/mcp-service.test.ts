import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { MCPService } from "../../services/mcp-service";

describe("MCPService", () => {
  test("buildClientConfig uses node, forward-slash paths and workspace flag", () => {
    const context = {
      globalStorageUri: vscode.Uri.file(
        "C:\\Users\\Matheus\\AppData\\Roaming\\Code\\User\\globalStorage\\matheusdevelope.vscode-extension-data7",
      ),
      extensionUri: vscode.Uri.file(
        "C:\\Users\\Matheus\\.vscode\\extensions\\matheusdevelope.vscode-extension-data7-0.1.0",
      ),
    } as vscode.ExtensionContext;

    const config = MCPService.buildClientConfig("cursor", context) as {
      mcpServers: { data7: { command: string; args: string[]; env: { DATA7_DOCS_ROOT: string } } };
    };

    assert.equal(config.mcpServers.data7.command, "node");
    assert.deepEqual(config.mcpServers.data7.args, [
      "C:/Users/Matheus/AppData/Roaming/Code/User/globalStorage/matheusdevelope.vscode-extension-data7/mcp/server.bundled.js",
      "--workspace=${workspaceFolder}",
      "--docs-root=C:/Users/Matheus/.vscode/extensions/matheusdevelope.vscode-extension-data7-0.1.0/docs",
    ]);
    assert.equal(
      config.mcpServers.data7.env.DATA7_DOCS_ROOT,
      "C:/Users/Matheus/.vscode/extensions/matheusdevelope.vscode-extension-data7-0.1.0/docs",
    );
  });
});
