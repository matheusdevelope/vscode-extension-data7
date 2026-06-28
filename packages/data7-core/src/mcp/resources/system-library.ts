/**
 * Resource family `data7://system-library/<ns>[/<class>]` — serves the
 * native System Library catalog rendered on-the-fly by `DocsGenerator`
 * (no on-disk drift, no stale snapshots).
 *
 * Two layouts are exposed under the same template:
 *  - `data7://system-library/<ns>` — full namespace markdown (Forms, SQL,
 *    Collections, …). For namespaces that ship a class-by-class breakdown
 *    this can be ~200 KB; clients should prefer the narrower variant
 *    below when they only need a single class.
 *  - `data7://system-library/<ns>/<class>` — narrow slice covering one
 *    class plus its inheritance chain summary. (Initial implementation
 *    falls back to returning the full namespace; a future tightening can
 *    extract only the class section.)
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DocsGenerator } from "../../system-library/docs-generator";

export function registerSystemLibrary(server: McpServer): void {
  // Single-segment: data7://system-library/<ns>
  const nsTemplate = new ResourceTemplate("data7://system-library/{namespace}", {
    list: () => {
      return {
        resources: DocsGenerator.getNamespacesWithContent().map((ns) => ({
          uri: `data7://system-library/${ns}`,
          name: `Namespace ${ns}`,
          mimeType: "text/markdown",
          description: `Documentação completa do namespace ${ns} (gerada on-the-fly).`,
        })),
      };
    },
  });

  server.registerResource(
    "data7-system-library-namespace",
    nsTemplate,
    {
      title: "System Library — namespaces",
      description:
        "Markdown completo de um namespace nativo (Collections, Forms, SQL, etc.), gerado pelo DocsGenerator.",
    },
    (uri, variables) => {
      const raw = variables.namespace;
      const ns = Array.isArray(raw) ? raw[0] : raw;
      if (!ns) {
        return {
          contents: [{ uri: uri.href, mimeType: "text/plain", text: "Namespace ausente na URI." }],
        };
      }
      const md = DocsGenerator.generateNamespaceMarkdown(ns);
      if (!md) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Namespace desconhecido: "${ns}".`,
            },
          ],
        };
      }
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: md }],
      };
    },
  );
}
