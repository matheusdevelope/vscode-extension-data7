/**
 * Tool `data7_transpile_bas` — applies the SugarTranspiler to a `.bas`
 * snippet and returns the native expansion + any sugar diagnostics.
 *
 * The SugarTranspiler is pure (no `vscode` import) so this tool works
 * in `--standalone` mode without the shim being absolutely necessary.
 * We still depend on `detectEnumerable` from `src/analysis/`, which
 * walks workspace symbols — when running without `--workspace`, the
 * enumerable detector falls back to System Library data only.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { SugarTranspiler, type TranspileContext } from "../../project/transpiler";
import { detectEnumerable } from "../../analysis/enumerable-detector";
import type { SymbolInfo, WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { lookupSystemByContainer } from "../../system-library";

export interface TranspileToolDeps {
  /** Indexer to consult for enumerable resolution. May be empty in --standalone. */
  readonly getIndexer: () => WorkspaceSymbolIndexer;
}

/**
 * Builds the `lookupMembers` callback that `detectEnumerable` expects:
 * walks workspace symbols first, then falls back to the System Library
 * catalog. Mirrors the same lookup that the live linter uses inside the
 * extension.
 */
function buildMemberLookup(
  indexer: WorkspaceSymbolIndexer,
): (typeName: string) => readonly SymbolInfo[] {
  return (typeName: string) => {
    const workspace = indexer
      .getAllSymbols()
      .filter((s) => s.containerName?.toLowerCase() === typeName.toLowerCase());
    if (workspace.length > 0) return workspace;
    return lookupSystemByContainer(typeName);
  };
}

export function registerTranspileBas(server: McpServer, deps: TranspileToolDeps): void {
  server.registerTool(
    "data7_transpile_bas",
    {
      title: "Expandir açúcares sintáticos para Data7 Basic nativo",
      description:
        "Recebe um trecho de .bas com açúcares (For Each, ternário, interpolação, optional chaining, destructuring, etc.) e devolve a expansão nativa + lista de diagnósticos do transpilador.",
      inputSchema: {
        code: z.string().min(1).describe("Conteúdo `.bas` a transpilar (uma ou mais linhas)."),
        useAstGenerics: z
          .boolean()
          .optional()
          .describe(
            "Quando true, usa o pipeline AST experimental de generics (equivalente a data7.experimental.useAstGenerics).",
          ),
      },
    },
    (args) => {
      const lookupMembers = buildMemberLookup(deps.getIndexer());
      const ctx: TranspileContext = {
        detectEnumerable: (typeName, preferredElementType) =>
          detectEnumerable(typeName, lookupMembers, preferredElementType),
        useAstGenerics: args.useAstGenerics ?? false,
      };
      const result = SugarTranspiler.transpile(args.code, ctx);
      const text = JSON.stringify(
        {
          input: args.code,
          output: result.code,
          diagnostics: result.diagnostics,
        },
        null,
        2,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
