/**
 * Tool `data7_lint_bas` — runs the production `DiagnosticsLinter`
 * against an inline `.bas` snippet and returns the diagnostics as JSON
 * (code + message + range + payload data).
 *
 * Requires the vscode-shim to be installed BEFORE this module is
 * loaded (see `src/mcp/runtime/install-shim.ts`).
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DiagnosticsLinter } from "../../diagnostics/diagnostics";
import type { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { setInlineDocument } from "../runtime/workspace-loader";
import { vscode } from "../runtime/vscode-shim";

interface SerialDiagnostic {
  readonly code: unknown;
  readonly message: string;
  readonly severity: number;
  readonly range: {
    readonly start: { line: number; character: number };
    readonly end: { line: number; character: number };
  };
  readonly data?: unknown;
}

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

function serialise(
  diagnostics: readonly {
    range: unknown;
    message: string;
    severity: number;
    code?: unknown;
    data?: unknown;
  }[],
): SerialDiagnostic[] {
  return diagnostics.map((d) => {
    const range = d.range as {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    return {
      code: d.code,
      message: d.message,
      severity: d.severity,
      range: { start: range.start, end: range.end },
      data: d.data,
    };
  });
}

export interface LintToolDeps {
  readonly getIndexer: () => WorkspaceSymbolIndexer;
}

export function registerLintBas(server: McpServer, deps: LintToolDeps): void {
  server.registerTool(
    "data7_lint_bas",
    {
      title: "Rodar o linter Data7 sobre um trecho de código",
      description:
        "Aplica o DiagnosticsLinter (mesmo do editor) sobre o conteúdo `.bas` informado e devolve a lista de diagnósticos com code, message, severity, range e payload tipado.",
      inputSchema: {
        code: z.string().min(1).describe("Conteúdo `.bas` a lintar."),
        uri: z
          .string()
          .optional()
          .describe(
            "URI opcional. Quando ausente, usa `file:///__inline__.bas`. Útil quando o agente quer simular um arquivo dentro do workspace já indexado.",
          ),
      },
    },
    (args) => {
      const indexer = deps.getIndexer();
      const uri = args.uri ?? "file:///__inline__.bas";
      setInlineDocument(indexer, args.code, uri);
      const doc = buildInlineDoc(uri, args.code);
      // The shim's `vscode.workspace.textDocuments` array is required
      // by some linter paths (isFileValid). Add+remove around the call
      // so we don't leak state.
      const docs = vscode.workspace.textDocuments;
      docs.push(doc);
      let diagnostics: SerialDiagnostic[] = [];
      try {
        const raw = DiagnosticsLinter.runAdvancedDiagnostics(
          doc as unknown as Parameters<typeof DiagnosticsLinter.runAdvancedDiagnostics>[0],
          indexer,
        );
        diagnostics = serialise(raw);
      } finally {
        const idx = docs.indexOf(doc);
        if (idx >= 0) docs.splice(idx, 1);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                uri,
                count: diagnostics.length,
                diagnostics,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
