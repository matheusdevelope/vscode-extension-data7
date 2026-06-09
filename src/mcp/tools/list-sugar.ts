/**
 * Tool `data7_list_sugar` — enumerates the syntactic sugars implemented
 * by the transpiler. The list is derived from
 * `docs/exemple/sugar/<sugar-name>/` (one subfolder per sugar) because
 * each implemented sugar must carry a canonical example by convention
 * (testing.mdc), making the directory structure the canonical source.
 *
 * For each sugar we also surface the headers of the first
 * `01-*.bas` example to give the agent an at-a-glance description.
 */
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getDocsRoot } from "../utils/paths";
import { listExamples } from "../resources/examples";
import { SugarRegistry } from "../../project/sugars";

interface SugarInfo {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly enabledByDefault: boolean;
  readonly priority: number;
  readonly dependencies: readonly string[];
  readonly utilityModules: readonly string[];
  readonly demonstratesFirst?: string;
  readonly hasExpected: boolean;
  readonly examplesCount: number;
  readonly examples: readonly string[];
}

function buildSugarCatalog(): SugarInfo[] {
  const sugarRoot = path.join(getDocsRoot(), "exemple", "sugar");
  const sugarFolders = fs.existsSync(sugarRoot)
    ? new Set(
        fs
          .readdirSync(sugarRoot)
          .filter((entry) => {
            const full = path.join(sugarRoot, entry);
            return fs.statSync(full).isDirectory();
          }),
      )
    : new Set<string>();

  return SugarRegistry.catalog().map((registered) => {
    const sugar = registered.id;
    const sugarPrefix = `sugar/${sugar}/`;
    const examples = listExamples().filter((e) => e.relativePath.startsWith(sugarPrefix));
    const first = examples
      .filter((e) => !e.relativePath.includes("/_expected/"))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath))[0];
    return {
      name: sugar,
      displayName: registered.displayName,
      description: registered.description,
      enabledByDefault: registered.enabledByDefault,
      priority: registered.priority,
      dependencies: registered.dependencies,
      utilityModules: registered.utilityModules,
      demonstratesFirst: first?.header?.demonstrates,
      hasExpected: sugarFolders.has(sugar) && fs.existsSync(path.join(sugarRoot, sugar, "_expected")),
      examplesCount: examples.length,
      examples: examples.map((e) => e.relativePath).sort(),
    };
  });
}

export function registerListSugar(server: McpServer): void {
  server.registerTool(
    "data7_list_sugar",
    {
      title: "Listar açúcares sintáticos da extensão Data7",
      description:
        "Enumera todos os açúcares atualmente implementados pelo SugarTranspiler (For Each, ternário, interpolação, destructuring, optional chaining, etc.) com link para o exemplo canônico de cada um.",
      inputSchema: {
        includeExpected: z
          .boolean()
          .optional()
          .describe("Quando true (default false), inclui também os arquivos sob _expected/."),
      },
    },
    (args) => {
      const catalog = buildSugarCatalog();
      const projected = catalog.map((entry) => ({
        ...entry,
        examples: args.includeExpected
          ? entry.examples
          : entry.examples.filter((e) => !e.includes("/_expected/")),
      }));
      const text = JSON.stringify({ total: projected.length, sugars: projected }, null, 2);
      return { content: [{ type: "text", text }] };
    },
  );
}
