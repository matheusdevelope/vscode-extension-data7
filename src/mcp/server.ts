/**
 * MCP server entry point — Model Context Protocol surface for AI agents
 * (Cursor / Claude Desktop / Continue) that want structured context about
 * Data7 Basic.
 *
 * The binary is compiled by `tsc` to `out/mcp/server.js` and then bundled
 * by `esbuild` (npm run mcp:bundle) into `out/mcp/server.bundled.js`,
 * which is the single file copied by `MCPService.installMcpServer` to
 * `context.globalStorageUri/mcp/`.
 *
 * Transport: stdio. CLI flags:
 *   --standalone        (default) read snapshots via stdin only.
 *   --workspace=<path>  preload .bas files from the workspace into a
 *                       detached WorkspaceSymbolIndexer (M3+).
 *   --docs-root=<path>  override the auto-detected `docs/` location.
 *
 * Architectural constraints (MCP-001):
 *  - This file MUST NOT import "vscode" directly.
 *  - This file MUST NOT import providers/, services/, or extension.ts.
 *  - Only `src/mcp/runtime/vscode-shim.ts` may stand in for VS Code API
 *    surface in modules that this file transitively pulls in (e.g.
 *    DiagnosticsLinter).
 *  - The shim is installed as the very first side-effect import below
 *    so that any subsequent `require("vscode")` (triggered by
 *    transitively-imported diagnostics/analysis modules) resolves to
 *    our minimal stand-in. ORDER MATTERS.
 */
import "./runtime/install-shim"; // MUST be the first import — installs vscode-shim before any module touches `vscode`.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerLanguageChapters } from "./resources/language-chapters";
import { registerSystemLibrary } from "./resources/system-library";
import { registerExamples } from "./resources/examples";
import { registerDiagnosticCodes } from "./resources/diagnostic-codes";
import { registerIdioms } from "./resources/idioms";
import { registerRealProject } from "./resources/real-project";
import { registerOfficial } from "./resources/official";
import { registerGuide } from "./resources/guide";
import { registerMeta } from "./resources/meta";
import { registerSearchSymbol } from "./tools/search-symbol";
import { registerDescribeSymbol } from "./tools/describe-symbol";
import { registerSearchExamples } from "./tools/search-examples";
import { registerGetCanonicalExample } from "./tools/get-canonical-example";
import { registerGetOfficialExample } from "./tools/get-official-example";
import { registerListDiagnosticCodes } from "./tools/list-diagnostic-codes";
import { registerListSugar } from "./tools/list-sugar";
import { registerListControls } from "./tools/list-controls";
import { registerTranspileBas } from "./tools/transpile-bas";
import { registerLintBas } from "./tools/lint-bas";
import { registerLintProject } from "./tools/lint-project";
import { registerSuggestImport } from "./tools/suggest-import";
import { registerModuleSkeleton } from "./prompts/module-skeleton";
import { registerBaseEnumPattern } from "./prompts/baseenum-pattern";
import { registerTypedRecordList } from "./prompts/typed-recordlist";
import { registerFormSkeleton } from "./prompts/form-skeleton";
import { createEmptyIndexer, loadWorkspaceIntoIndexer } from "./runtime/workspace-loader";
import { getServerVersion, setDocsRootOverride } from "./utils/paths";
import type { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";

interface CliOptions {
  readonly standalone: boolean;
  readonly workspace?: string;
  readonly docsRoot?: string;
}

function parseCliArgs(argv: readonly string[]): CliOptions {
  let standalone = true;
  let workspace: string | undefined;
  let docsRoot: string | undefined;
  for (const arg of argv) {
    if (arg === "--standalone") standalone = true;
    else if (arg.startsWith("--workspace=")) {
      workspace = arg.slice("--workspace=".length);
      standalone = false;
    } else if (arg.startsWith("--docs-root=")) {
      docsRoot = arg.slice("--docs-root=".length);
    }
  }
  return { standalone, workspace, docsRoot };
}

export interface BuildServerOptions {
  /** Optional workspace path. When provided, M3 tools see a preloaded indexer. */
  readonly workspacePath?: string;
}

/**
 * Builds the server with every Resource / Tool / Prompt registered. Kept
 * separate from `main()` so tests can spin up the server in-process and
 * inspect its capabilities without going through stdio.
 */
export function buildServer(options: BuildServerOptions = {}): {
  server: McpServer;
  counts: { resources: number; tools: number; prompts: number };
  indexer: WorkspaceSymbolIndexer;
} {
  const server = new McpServer(
    {
      name: "data7-mcp",
      version: getServerVersion(),
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
    },
  );

  // Build the shared detached indexer once and share it across tools.
  // - With `--workspace=<path>`, preload every `.bas` so lint/transpile
  //   can resolve cross-file Imports/types.
  // - Without `--workspace`, start empty; the agent supplies snippets
  //   inline through `lint_bas` / `lint_project`.
  const indexer = options.workspacePath
    ? loadWorkspaceIntoIndexer(options.workspacePath).indexer
    : createEmptyIndexer();

  // Resources (10 famílias). Order is purely cosmetic.
  registerLanguageChapters(server);
  registerSystemLibrary(server);
  registerExamples(server);
  registerDiagnosticCodes(server);
  registerIdioms(server);
  registerRealProject(server);
  registerOfficial(server);
  registerGuide(server);

  // Tools — lookup + executable + suggest_import + list_controls.
  registerSearchSymbol(server);
  registerDescribeSymbol(server);
  registerSearchExamples(server);
  registerGetCanonicalExample(server);
  registerGetOfficialExample(server);
  registerListDiagnosticCodes(server);
  registerListSugar(server);
  registerListControls(server);
  registerTranspileBas(server, { getIndexer: () => indexer });
  registerLintBas(server, { getIndexer: () => indexer });
  registerLintProject(server);
  registerSuggestImport(server, { getIndexer: () => indexer });

  // Prompts (4 templates).
  registerModuleSkeleton(server);
  registerBaseEnumPattern(server);
  registerTypedRecordList(server);
  registerFormSkeleton(server);

  const RESOURCE_COUNT = 10;
  const TOOL_COUNT = 12;
  const PROMPT_COUNT = 4;
  // `registerMeta` last so it can carry the final capability counts.
  registerMeta(server, {
    resourceCount: RESOURCE_COUNT,
    toolCount: TOOL_COUNT,
    promptCount: PROMPT_COUNT,
  });

  return {
    server,
    counts: {
      resources: RESOURCE_COUNT,
      tools: TOOL_COUNT,
      prompts: PROMPT_COUNT,
    },
    indexer,
  };
}

export async function main(argv: readonly string[]): Promise<void> {
  const cli = parseCliArgs(argv);
  if (cli.docsRoot) setDocsRootOverride(cli.docsRoot);
  void cli.standalone;

  const { server } = buildServer({ workspacePath: cli.workspace });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// `require.main === module` guard so test code can import this file
// without spinning up stdio.

const isDirectInvocation = require.main === module;
if (isDirectInvocation) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    // Log to stderr — stdout is reserved for the MCP transport.
    process.stderr.write(`[data7-mcp] fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
