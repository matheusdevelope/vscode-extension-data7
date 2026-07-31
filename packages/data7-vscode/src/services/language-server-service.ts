import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import { logger, readConfiguration, type Data7Configuration } from "@data7/core";

/**
 * Boots the `@data7/lsp` process when
 * `features.diagnostics.useLanguageServer` is enabled (LSP-001).
 *
 * Default is off: the extension keeps DiagnosticService + local providers.
 */
export class LanguageServerService {
  private static client: LanguageClient | undefined;

  public static isEnabled(): boolean {
    return readConfiguration().features.diagnostics.useLanguageServer === true;
  }

  public static isRunning(): boolean {
    return this.client?.isRunning() === true;
  }

  public static async start(context: vscode.ExtensionContext): Promise<void> {
    if (this.client) {
      return;
    }

    const serverModule = context.asAbsolutePath(path.join("out", "lsp", "server.bundled.js"));
    const serverOptions: ServerOptions = {
      run: { module: serverModule, transport: TransportKind.stdio },
      debug: {
        module: serverModule,
        transport: TransportKind.stdio,
        options: { execArgv: ["--nolazy", "--inspect=6010"] },
      },
    };

    const clientOptions: LanguageClientOptions = {
      documentSelector: [
        { language: "d7basic", scheme: "file" },
        { language: "d7basic", scheme: "untitled" },
      ],
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher("**/*.{bas,d7b}"),
        configurationSection: "data7",
      },
      initializationOptions: {
        settings: readConfiguration() as Data7Configuration,
      },
      outputChannelName: "Data7 Language Server",
    };

    const client = new LanguageClient(
      "data7LanguageServer",
      "Data7 Language Server",
      serverOptions,
      clientOptions,
    );
    this.client = client;
    context.subscriptions.push({
      dispose: () => {
        void this.stop();
      },
    });

    await client.start();
    logger.info("Language Server Data7 iniciado (features.diagnostics.useLanguageServer).");
  }

  public static async stop(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    if (client) {
      await client.stop();
    }
  }
}
