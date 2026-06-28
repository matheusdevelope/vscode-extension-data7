/**
 * Tool `data7_list_controls` — lists the instantiable visual controls of
 * the `Forms` namespace (classes the programmer places on a screen).
 *
 * Motivation: to build a tela, an agent needs to know which controls
 * exist. Without this tool it would have to load the whole
 * `data7://system-library/Forms` resource (~71 k tokens) or guess names.
 * This returns just the control classes + a one-line description
 * (~2 k tokens), so the agent can pick the right control cheaply, then
 * drill into one with `data7_describe_symbol`.
 *
 * "Instantiable control" = a `kind: "class"` symbol whose `containerName`
 * is exactly `"Forms"`. Trunk/base classes (`TControl`, `TWinControl`,
 * …) live under their own container names and are excluded by default
 * because the programmer rarely instantiates them directly.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { SYSTEM_SYMBOLS } from "../../system-library";

interface ControlEntry {
  readonly name: string;
  readonly inheritsFrom?: string;
  readonly description?: string;
  /** `true` for abstract VCL trunk classes the programmer does not instantiate. */
  readonly isBase: boolean;
}

/**
 * Distinguishes the abstract VCL trunk classes (`TControl`, `TWinControl`,
 * `TcxCustomEdit`, `TForm`, …) from the instantiable leaf controls
 * (`Form`, `Panel`, `Grid`, `TextBox`, `TabSheet`, …).
 *
 * Signal: the VCL base classes follow the `T` + uppercase (or `Tcx`)
 * naming convention. The instantiable leaf controls in this catalog use
 * `T` + lowercase (`TextBox`, `Timer`, `TabSheet`, `Topbar`) or no `T`
 * prefix at all (`Form`, `Panel`, `Grid`, `CommandButton`), so the
 * convention separates them cleanly. (A parent-graph signal was rejected
 * because `Form` itself is subclassed by aliases yet must stay listed.)
 */
function isBaseClassName(name: string): boolean {
  return /^T[A-Z]/.test(name) || /^Tcx/i.test(name);
}

/** Exported for unit testing. Returns every Forms class flagged with `isBase`. */
export function collectControls(): ControlEntry[] {
  return SYSTEM_SYMBOLS.filter((s) => s.kind === "class" && s.containerName === "Forms")
    .map((s) => ({
      name: s.name,
      inheritsFrom: s.inheritsFrom,
      description: s.description?.split("\n")[0],
      isBase: isBaseClassName(s.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function registerListControls(server: McpServer): void {
  server.registerTool(
    "data7_list_controls",
    {
      title: "Listar controles visuais do namespace Forms",
      description:
        "Lista os controles instanciáveis do Forms (Form, Panel, Grid, TextBox, CommandButton, PageControl, etc.) com uma linha de descrição cada. Use para descobrir QUAIS controles existem ao montar uma tela; depois aprofunde um com data7_describe_symbol.",
      inputSchema: {
        filter: z
          .string()
          .optional()
          .describe(
            'Substring opcional para filtrar por nome (case-insensitive). Exemplos: "Button", "Text", "Grid".',
          ),
        includeBase: z
          .boolean()
          .optional()
          .describe(
            "Quando true, inclui as classes-base abstratas da VCL (TControl, TWinControl, etc.). Default false — devolve só controles instanciáveis.",
          ),
      },
    },
    (args) => {
      const all = collectControls();
      const includeBase = args.includeBase ?? false;
      const filter = args.filter?.toLowerCase();
      let result = includeBase ? all : all.filter((c) => !c.isBase);
      if (filter) result = result.filter((c) => c.name.toLowerCase().includes(filter));
      const text = JSON.stringify(
        {
          totalForms: all.length,
          returned: result.length,
          controls: result,
        },
        null,
        2,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
