/**
 * Resource family `data7://real-project/<path>` — serves the
 * `mod_card_grouper/` reference project from
 * `docs/linguagem-basic/mod_card_grouper/`.
 *
 * This is a complete, working Data7 project (47 shared modules +
 * 8 source modules + `data7.json` + `.7Proj`) that demonstrates real
 * idiomatic usage. Agents fetch individual files to study the patterns
 * (adapter, schema, extractor, grouper, controller, form).
 */
import * as fs from "fs";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getDocsRoot } from "../utils/paths";

const PROJECT_ROOT = ["linguagem-basic", "mod_card_grouper"];

interface FileEntry {
  /** Relative path inside the project, forward-slashed. */
  readonly relativePath: string;
  readonly filePath: string;
  readonly mimeType: string;
}

let cachedIndex: readonly FileEntry[] | undefined;

function walk(dir: string, baseDir: string, acc: FileEntry[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, baseDir, acc);
      continue;
    }
    const lower = entry.toLowerCase();
    if (
      !(
        lower.endsWith(".bas") ||
        lower.endsWith(".d7b") ||
        lower.endsWith(".json") ||
        lower.endsWith(".7proj") ||
        lower.endsWith(".md")
      )
    ) {
      continue;
    }
    const rel = path.relative(baseDir, full).replace(/\\/g, "/");
    acc.push({
      relativePath: rel,
      filePath: full,
      mimeType:
        lower.endsWith(".bas") || lower.endsWith(".d7b")
          ? "text/plain"
          : lower.endsWith(".json")
            ? "application/json"
            : lower.endsWith(".md")
              ? "text/markdown"
              : "text/xml",
    });
  }
}

function loadIndex(): readonly FileEntry[] {
  if (cachedIndex) return cachedIndex;
  const root = path.join(getDocsRoot(), ...PROJECT_ROOT);
  const acc: FileEntry[] = [];
  walk(root, root, acc);
  acc.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  cachedIndex = acc;
  return cachedIndex;
}

export function listRealProjectFiles(): readonly FileEntry[] {
  return loadIndex();
}

export function registerRealProject(server: McpServer): void {
  // `{+path}` (reserved expansion) so multi-segment paths like
  // `src/mod_card/core/mod_card_record.bas` match on read. The default
  // `{path}` form only matches a single segment (`([^/,]+)`).
  const template = new ResourceTemplate("data7://real-project/{+path}", {
    list: () => ({
      resources: loadIndex().map((entry) => ({
        uri: `data7://real-project/${entry.relativePath}`,
        name: entry.relativePath,
        mimeType: entry.mimeType,
        description: `Arquivo "${entry.relativePath}" do projeto de referência mod_card_grouper.`,
      })),
    }),
  });

  server.registerResource(
    "data7-real-project-file",
    template,
    {
      title: "Projeto Data7 real (mod_card_grouper)",
      description:
        "Projeto completo de referência (~10.8k linhas de .bas) com padrões idiomáticos: BaseEnum, TRecordList, console.Block, adapters, pipelines.",
    },
    (uri, variables) => {
      const raw = variables.path;
      const relPath = Array.isArray(raw) ? raw.join("/") : raw;
      if (!relPath) {
        return {
          contents: [{ uri: uri.href, mimeType: "text/plain", text: "Caminho ausente na URI." }],
        };
      }
      const entry = loadIndex().find((e) => e.relativePath === relPath.replace(/^\/+/, ""));
      if (!entry) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Arquivo desconhecido: "${relPath}".`,
            },
          ],
        };
      }
      try {
        const content = fs.readFileSync(entry.filePath, "utf-8");
        return {
          contents: [{ uri: uri.href, mimeType: entry.mimeType, text: content }],
        };
      } catch {
        return {
          contents: [{ uri: uri.href, mimeType: "text/plain", text: `Falha ao ler "${relPath}".` }],
        };
      }
    },
  );
}
