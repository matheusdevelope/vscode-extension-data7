/**
 * Resource `data7://meta/snapshot` — surfaces an explicit version +
 * snapshot hash so clients can detect drift after an extension upgrade.
 *
 * The payload mirrors the same hash produced by `DocsGenerator` for
 * `docs/system-library/`, plus the server version (from `package.json`)
 * and a list of advertised namespaces.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DocsGenerator } from "../../system-library/docs-generator";
import { getServerVersion } from "../utils/paths";

const URI = "data7://meta/snapshot";

interface SnapshotPayload {
  readonly version: string;
  readonly snapshotHash: string;
  readonly namespaces: readonly string[];
  readonly capabilities: {
    readonly resources: number;
    readonly tools: number;
    readonly prompts: number;
  };
}

export interface RegisterMetaOptions {
  readonly resourceCount: number;
  readonly toolCount: number;
  readonly promptCount: number;
}

export function registerMeta(server: McpServer, opts: RegisterMetaOptions): void {
  server.registerResource(
    "data7-meta-snapshot",
    URI,
    {
      title: "Snapshot do servidor MCP",
      description: "Versão + hash do catálogo + contagem de capacidades para detecção de drift.",
    },
    (uri) => {
      const payload: SnapshotPayload = {
        version: getServerVersion(),
        snapshotHash: DocsGenerator.computeSnapshotHash(),
        namespaces: DocsGenerator.getNamespaceNames(),
        capabilities: {
          resources: opts.resourceCount,
          tools: opts.toolCount,
          prompts: opts.promptCount,
        },
      };
      return {
        contents: [
          { uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) },
        ],
      };
    },
  );
}
