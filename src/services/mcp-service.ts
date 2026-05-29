/**
 * MCPService — owns the lifecycle of the embedded MCP server binary.
 *
 * The MCP server (built from `src/mcp/`) ships as a single bundled file
 * at `out/mcp/server.bundled.js`. On activation we copy it to
 * `context.globalStorageUri/mcp/server.bundled.js` (idempotent via
 * SHA-256) so external MCP clients (Cursor / Claude Desktop / Continue)
 * can launch it with a stable path that survives extension upgrades and
 * does not change between releases.
 *
 * This service is the **only** module allowed to write to
 * `globalStorageUri/mcp/`. Per `governance.mdc`, providers may not
 * import it.
 *
 * Operations:
 *  - `installMcpServer(context)` — idempotent copy + permissions fix.
 *  - `previewClientConfig(client, context)` — generates ready-to-paste
 *    JSON for the user's MCP client of choice.
 *  - `getServerPath(context)` — absolute path to the installed binary.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";

import { logger } from "../infra/logger";

const MCP_SUBFOLDER = "mcp";
const BUNDLED_NAME = "server.bundled.js";
const HASH_NAME = "server.bundled.js.sha256";

export type McpClientKind = "cursor" | "claude" | "continue";

export class MCPService {
  /**
   * Resolves the absolute path where the MCP binary lives after
   * installation (`context.globalStorageUri/mcp/server.bundled.js`).
   * Pure path computation — does NOT touch the filesystem.
   */
  public static getServerPath(context: vscode.ExtensionContext): string {
    return path.join(context.globalStorageUri.fsPath, MCP_SUBFOLDER, BUNDLED_NAME);
  }

  /**
   * Resolves the absolute path of the bundled binary inside the extension
   * installation (the source for the copy). Returns `undefined` when the
   * bundled artefact is missing (which happens before `npm run mcp:bundle`
   * has ever been executed locally).
   */
  public static getSourceBundle(context: vscode.ExtensionContext): string | undefined {
    const candidate = path.join(context.extensionUri.fsPath, "out", MCP_SUBFOLDER, BUNDLED_NAME);
    return fs.existsSync(candidate) ? candidate : undefined;
  }

  /**
   * Copies the bundled MCP binary from the extension folder into the
   * user's `globalStorage` so external clients can launch it with a
   * stable path. Idempotent: on subsequent activations the SHA-256 of
   * the destination is compared to a stored hash file and the copy is
   * skipped when unchanged.
   */
  public static async installMcpServer(context: vscode.ExtensionContext): Promise<void> {
    const source = MCPService.getSourceBundle(context);
    if (!source) {
      logger.info(
        "MCP: bundle ainda não foi gerado (`npm run mcp:bundle`); auto-instalação ignorada.",
      );
      return;
    }

    const targetDir = path.join(context.globalStorageUri.fsPath, MCP_SUBFOLDER);
    const target = path.join(targetDir, BUNDLED_NAME);
    const hashFile = path.join(targetDir, HASH_NAME);

    try {
      await fs.promises.mkdir(targetDir, { recursive: true });
    } catch (err: unknown) {
      logger.error("MCP: falha ao criar diretório de instalação.", err);
      return;
    }

    let sourceContent: Buffer;
    try {
      sourceContent = await fs.promises.readFile(source);
    } catch (err: unknown) {
      logger.error("MCP: falha ao ler o bundle de origem.", err);
      return;
    }
    const sourceHash = createHash("sha256").update(sourceContent).digest("hex");

    if (fs.existsSync(target) && fs.existsSync(hashFile)) {
      try {
        const storedHash = await fs.promises.readFile(hashFile, "utf-8");
        if (storedHash.trim() === sourceHash) {
          // Already up to date — nothing to do.
          return;
        }
      } catch {
        // fall through to copy
      }
    }

    try {
      await fs.promises.writeFile(target, sourceContent);
      await fs.promises.writeFile(hashFile, sourceHash, "utf-8");
      logger.info(`MCP: servidor instalado em ${target}.`);
    } catch (err: unknown) {
      logger.error("MCP: falha ao instalar o bundle.", err);
    }
  }

  /**
   * Builds a JSON snippet ready to be pasted into the user's MCP client
   * config. The shape is the same `{ mcpServers: { ... } }` accepted by
   * Cursor, Claude Desktop and Continue.
   */
  public static buildClientConfig(
    client: McpClientKind,
    context: vscode.ExtensionContext,
    workspacePath?: string,
  ): Record<string, unknown> {
    const serverPath = MCPService.getServerPath(context);
    const docsRoot = path.join(context.extensionUri.fsPath, "docs");
    const args: string[] = [serverPath];
    if (workspacePath) args.push(`--workspace=${workspacePath}`);
    args.push(`--docs-root=${docsRoot}`);

    const entry = {
      command: process.execPath,
      args,
      env: { DATA7_DOCS_ROOT: docsRoot },
    };

    // All three current clients use the same `mcpServers` shape.
    void client;
    return {
      mcpServers: {
        data7: entry,
      },
    };
  }

  /**
   * Shows the generated config in an information dialog and copies it to
   * the clipboard so the user can paste it directly into their MCP
   * client settings file.
   */
  public static async previewClientConfig(context: vscode.ExtensionContext): Promise<void> {
    const items: { label: string; value: McpClientKind }[] = [
      { label: "Cursor", value: "cursor" },
      { label: "Claude Desktop", value: "claude" },
      { label: "Continue", value: "continue" },
    ];
    const choice = await vscode.window.showQuickPick(items, {
      placeHolder: "Escolha o cliente MCP para gerar a configuração.",
    });
    if (!choice) return;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const config = MCPService.buildClientConfig(choice.value, context, workspaceFolder);
    const json = JSON.stringify(config, null, 2);

    try {
      await vscode.env.clipboard.writeText(json);
    } catch {
      // best-effort; ignore clipboard errors
    }

    const action = await vscode.window.showInformationMessage(
      `Configuração MCP para ${choice.label} copiada para a área de transferência. ` +
        "Cole no arquivo de configuração do seu cliente MCP.",
      "Ver no Output",
    );
    if (action === "Ver no Output") {
      logger.info(`MCP config para ${choice.label}:\n${json}`);
      logger.show();
    }
  }
}
