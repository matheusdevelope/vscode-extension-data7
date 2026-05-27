import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { logger } from "../infra/logger";
import { isSafeSegment, safeJoinInside } from "../utils/path-safety";
import { DocsGenerator } from "../system-library/docs-generator";

const ALL_LABEL = "$(globe) Todos os namespaces";
const AGENTS_BLOCK_START = "<!-- data7:system-library:start -->";
const AGENTS_BLOCK_END = "<!-- data7:system-library:end -->";

/**
 * Implements the documentation commands for the System Library.
 *
 * - `data7.generateSystemLibraryDocs`: pick namespaces, pick a folder, write
 *   one Markdown file per namespace + `README.md` index.
 * - `data7.injectSystemLibraryDocs`: inject (or refresh) a delimited block
 *   inside `AGENTS.md` at the workspace root, so AI agents pick the docs up
 *   automatically without manual file attachments.
 *
 * Both commands are safe in untrusted workspaces — they only write into paths
 * explicitly confirmed by the user (validated via `safeJoinInside`).
 */
export class DocsService {
  // ===========================================================================
  // Generate docs (one file per namespace + index)
  // ===========================================================================

  public static async generateDocs(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showWarningMessage(
        "Abra uma pasta de workspace para gerar a documentação da System Library.",
      );
      return;
    }
    const workspaceDir = folders[0].uri.fsPath;

    const selected = await this.pickNamespaces();
    if (!selected || selected.length === 0) return;

    const outDir = await this.pickOutputFolder(workspaceDir);
    if (!outDir) return;

    await this.writeDocs(outDir, selected);
  }

  // ===========================================================================
  // Inject docs into AGENTS.md
  // ===========================================================================

  public static async injectIntoAgentsMd(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showWarningMessage(
        "Abra uma pasta de workspace para injetar a documentação no AGENTS.md.",
      );
      return;
    }
    const workspaceDir = folders[0].uri.fsPath;
    const agentsPath = path.join(workspaceDir, "AGENTS.md");

    const selected = await this.pickNamespaces();
    if (!selected || selected.length === 0) return;

    const generated = this.buildCombinedMarkdown(selected);
    const block = [
      AGENTS_BLOCK_START,
      `<!-- Snapshot: ${DocsGenerator.computeSnapshotHash()} -->`,
      "<!-- NÃO EDITE ESTE BLOCO MANUALMENTE — gerado pela extensão Data7 Dev Studio. -->",
      "",
      generated.trim(),
      "",
      AGENTS_BLOCK_END,
    ].join("\n");

    let body = "";
    try {
      body = fs.readFileSync(agentsPath, "utf-8");
    } catch {
      body = "";
    }

    let nextBody: string;
    if (body.includes(AGENTS_BLOCK_START) && body.includes(AGENTS_BLOCK_END)) {
      const startIdx = body.indexOf(AGENTS_BLOCK_START);
      const endIdx = body.indexOf(AGENTS_BLOCK_END) + AGENTS_BLOCK_END.length;
      nextBody = body.slice(0, startIdx) + block + body.slice(endIdx);
    } else {
      const prefix = body.trim().length > 0 ? body.trimEnd() + "\n\n" : "";
      nextBody = `${prefix}${block}\n`;
    }

    try {
      fs.writeFileSync(agentsPath, nextBody, "utf-8");
    } catch (err: unknown) {
      logger.error(`Falha ao escrever ${agentsPath}.`, err);
      vscode.window.showErrorMessage(
        `Falha ao escrever AGENTS.md: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    logger.info(`AGENTS.md atualizado com ${selected.length} namespace(s) da System Library.`);

    const openFile = "Abrir AGENTS.md";
    const choice = await vscode.window.showInformationMessage(
      `AGENTS.md atualizado com ${selected.length} namespace(s) (${(Buffer.byteLength(block, "utf-8") / 1024).toFixed(1)} KB).`,
      openFile,
    );
    if (choice === openFile) {
      const doc = await vscode.workspace.openTextDocument(agentsPath);
      await vscode.window.showTextDocument(doc, { preview: false });
    }
  }

  // ===========================================================================
  // Internal steps
  // ===========================================================================

  private static async pickNamespaces(): Promise<string[] | undefined> {
    const namespaces = DocsGenerator.getNamespacesWithContent();
    if (namespaces.length === 0) {
      vscode.window.showWarningMessage(
        "Nenhum namespace com conteúdo encontrado na System Library.",
      );
      return undefined;
    }

    const items: vscode.QuickPickItem[] = [
      { label: ALL_LABEL, description: `Gerar todos (${namespaces.length})`, picked: true },
      { label: "", kind: vscode.QuickPickItemKind.Separator },
      ...namespaces.map((n) => ({ label: n })),
    ];

    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: "Selecione os namespaces a documentar (Esc para cancelar)",
      ignoreFocusOut: true,
      title: "Data7 — Documentação da System Library",
    });
    if (!picked || picked.length === 0) return undefined;

    if (picked.some((p) => p.label === ALL_LABEL)) return namespaces;
    return picked.map((p) => p.label).filter((label) => namespaces.includes(label));
  }

  private static async pickOutputFolder(workspaceDir: string): Promise<string | undefined> {
    const defaultUri = vscode.Uri.file(path.join(workspaceDir, "docs", "system-library"));
    try {
      fs.mkdirSync(defaultUri.fsPath, { recursive: true });
    } catch {
      /* best-effort */
    }

    const choice = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      defaultUri,
      openLabel: "Salvar documentação aqui",
      title: "Data7 — Pasta destino da documentação da System Library",
    });
    if (!choice || choice.length === 0) return undefined;
    return choice[0].fsPath;
  }

  private static async writeDocs(outDir: string, namespaces: string[]): Promise<void> {
    const written: string[] = [];
    const failed: { ns: string; err: string }[] = [];

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Gerando documentação da System Library",
        cancellable: false,
      },
      (progress) =>
        Promise.resolve().then(() => {
          try {
            fs.mkdirSync(outDir, { recursive: true });
          } catch (err) {
            logger.error(`Falha ao criar pasta de destino ${outDir}.`, err);
            throw err;
          }

          const step = 100 / (namespaces.length + 1);

          for (const ns of namespaces) {
            progress.report({ message: ns, increment: step });
            if (!isSafeSegment(ns)) {
              logger.warn(`Pulando namespace com nome inseguro: ${ns}`);
              failed.push({ ns, err: "Nome inseguro como segmento de arquivo" });
              continue;
            }
            try {
              const md = DocsGenerator.generateNamespaceMarkdown(ns);
              if (!md) {
                failed.push({ ns, err: "Geração retornou vazio" });
                continue;
              }
              const outFile = safeJoinInside(outDir, `${ns}.md`);
              fs.writeFileSync(outFile, md, "utf-8");
              written.push(outFile);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              failed.push({ ns, err: message });
              logger.error(`Falha ao gerar documentação do namespace ${ns}.`, err);
            }
          }

          progress.report({ message: "README.md", increment: step });
          try {
            const indexMd = DocsGenerator.generateIndexMarkdown(
              written.map((f) => path.basename(f, ".md")),
            );
            const indexPath = safeJoinInside(outDir, "README.md");
            fs.writeFileSync(indexPath, indexMd, "utf-8");
            written.push(indexPath);
          } catch (err: unknown) {
            logger.error("Falha ao gerar README.md de índice.", err);
          }
        }),
    );

    logger.info(`Documentação gerada: ${written.length} arquivo(s) em ${outDir}.`);
    if (failed.length > 0) {
      logger.warn(
        `Falhou em ${failed.length} namespace(s): ${failed.map((f) => `${f.ns} (${f.err})`).join("; ")}`,
      );
    }

    await this.showCompletionNotification(outDir, written, failed.length, namespaces);
  }

  private static async showCompletionNotification(
    outDir: string,
    written: string[],
    failedCount: number,
    namespaces: string[],
  ): Promise<void> {
    const openIndex = "Abrir índice";
    const openFolder = "Abrir pasta";
    const copyClip = "Copiar markdown";
    const summary =
      failedCount > 0
        ? `Documentação gerada com ${failedCount} falha(s). Veja o Output "Data7" para detalhes.`
        : `Documentação gerada (${written.length} arquivo(s)) em ${outDir}.`;

    const choice = await vscode.window.showInformationMessage(
      summary,
      openIndex,
      openFolder,
      copyClip,
    );

    if (choice === openIndex) {
      const indexFile = path.join(outDir, "README.md");
      if (fs.existsSync(indexFile)) {
        const doc = await vscode.workspace.openTextDocument(indexFile);
        await vscode.window.showTextDocument(doc, { preview: false });
      }
    } else if (choice === openFolder) {
      await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(outDir));
    } else if (choice === copyClip) {
      const combined = this.buildCombinedMarkdown(namespaces);
      await vscode.env.clipboard.writeText(combined);
      vscode.window.showInformationMessage(
        `Markdown copiado para o clipboard (${(Buffer.byteLength(combined, "utf-8") / 1024).toFixed(1)} KB).`,
      );
    }
  }

  /**
   * Concatenates the markdown of every requested namespace plus a small index,
   * suitable for AGENTS.md injection or clipboard copy.
   */
  private static buildCombinedMarkdown(namespaces: string[]): string {
    const parts: string[] = [];
    parts.push("# Data7 System Library — referência");
    parts.push("");
    parts.push(
      "Este bloco é mantido automaticamente pela extensão Data7 Dev Studio. Use-o como contexto para entender as classes, eventos, propriedades e enumerados nativos disponíveis em código Data7 Basic.",
    );
    parts.push("");
    parts.push("## Namespaces disponíveis");
    parts.push("");
    for (const ns of namespaces) parts.push(`- \`${ns}\``);
    parts.push("");
    for (const ns of namespaces) {
      const md = DocsGenerator.generateNamespaceMarkdown(ns);
      if (md) parts.push(md.trim());
      parts.push("");
    }
    return parts.join("\n");
  }
}
