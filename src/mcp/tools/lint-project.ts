/**
 * Tool `data7_lint_project` — lints an entire project snapshot
 * (multiple `.bas` files passed inline by the agent) using the same
 * `DiagnosticsLinter` the live extension runs.
 *
 * The MCP client supplies a small in-memory snapshot
 * (`{ files: [{ path, content }] }`), the tool seeds a detached
 * indexer with all of them, then lints each file and groups the
 * diagnostics by file path.
 *
 * Use case: an AI agent rewriting multiple files in a project can
 * verify the partial result without opening VS Code.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DiagnosticsLinter } from "../../diagnostics/diagnostics";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { vscode } from "../runtime/vscode-shim";

interface InlineDoc {
  uri: { toString(): string; fsPath: string };
  languageId: string;
  lineCount: number;
  getText(range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  }): string;
  lineAt(i: number): {
    text: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
  getWordRangeAtPosition(pos: { line: number; character: number }):
    | {
        start: { line: number; character: number };
        end: { line: number; character: number };
      }
    | undefined;
}

function buildInlineDoc(uri: string, text: string): InlineDoc {
  const lines = text.split(/\r?\n/);
  return {
    uri: {
      toString: () => uri,
      fsPath: uri.replace("file:///", "").replace(/\//g, "\\"),
    },
    languageId: "d7basic",
    lineCount: lines.length,
    getText: (range) => {
      if (!range) return text;
      const line = lines[range.start.line] ?? "";
      return line.substring(range.start.character, range.end.character);
    },
    lineAt: (i) => ({
      text: lines[i] ?? "",
      range: {
        start: { line: i, character: 0 },
        end: { line: i, character: (lines[i] ?? "").length },
      },
    }),
    getWordRangeAtPosition: (pos) => {
      const line = lines[pos.line] ?? "";
      const re = /[A-Za-z_]\w*/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        if (pos.character >= m.index && pos.character <= m.index + m[0].length) {
          return {
            start: { line: pos.line, character: m.index },
            end: { line: pos.line, character: m.index + m[0].length },
          };
        }
      }
      return undefined;
    },
  };
}

function pathToUri(p: string): string {
  if (p.startsWith("file:///")) return p;
  const normalised = p.replace(/\\/g, "/");
  return normalised.startsWith("/") ? `file://${normalised}` : `file:///${normalised}`;
}

interface DiagOut {
  readonly code: unknown;
  readonly message: string;
  readonly severity: number;
  readonly range: {
    readonly start: { line: number; character: number };
    readonly end: { line: number; character: number };
  };
  readonly data?: unknown;
}

export function registerLintProject(server: McpServer): void {
  server.registerTool(
    "data7_lint_project",
    {
      title: "Lintar projeto Data7 com snapshot inline",
      description:
        "Recebe um snapshot do projeto ({ files: [{path, content}], ... }) e devolve diagnósticos por arquivo. Útil quando a IA reescreveu múltiplos arquivos e quer validar antes do build.",
      inputSchema: {
        files: z
          .array(
            z.object({
              path: z.string().min(1).describe("Caminho relativo do arquivo (e.g. src/mod_x.bas)"),
              content: z.string().describe("Conteúdo `.bas`."),
            }),
          )
          .min(1)
          .describe("Lista de arquivos a indexar/lintar. Pelo menos 1."),
      },
    },
    (args) => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const docs: { path: string; uri: string; doc: InlineDoc }[] = [];

      for (const file of args.files) {
        const uri = pathToUri(file.path);
        indexer.updateFileContent(uri, file.content);
        docs.push({ path: file.path, uri, doc: buildInlineDoc(uri, file.content) });
      }

      const allDocs = vscode.workspace.textDocuments;
      for (const d of docs) allDocs.push(d.doc);

      const result: Record<string, DiagOut[]> = {};
      try {
        for (const d of docs) {
          const raw = DiagnosticsLinter.runAdvancedDiagnostics(
            d.doc as unknown as Parameters<typeof DiagnosticsLinter.runAdvancedDiagnostics>[0],
            indexer,
          );
          result[d.path] = raw.map((diag) => {
            const range = diag.range as {
              start: { line: number; character: number };
              end: { line: number; character: number };
            };
            const withData = diag as unknown as { data?: unknown };
            return {
              code: diag.code,
              message: diag.message,
              severity: diag.severity,
              range: { start: range.start, end: range.end },
              data: withData.data,
            };
          });
        }
      } finally {
        for (const d of docs) {
          const idx = allDocs.indexOf(d.doc);
          if (idx >= 0) allDocs.splice(idx, 1);
        }
      }

      const totalCount = Object.values(result).reduce((acc, list) => acc + list.length, 0);
      const text = JSON.stringify(
        { filesAnalysed: docs.length, totalDiagnostics: totalCount, byFile: result },
        null,
        2,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
