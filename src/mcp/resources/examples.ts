/**
 * Resource family `data7://examples/<path>` — serves the canonical
 * `.bas` examples from `docs/exemple/` plus the auto-generated index at
 * `data7://examples/index`.
 *
 * Each example carries an `@example` / `@demonstrates` / `@diagnostics`
 * header parsed via the same logic used by `loadExample(...)` in tests.
 * We re-implement the header parser locally (instead of importing from
 * `src/test/_helpers/fixtures.ts`) because the MCP server is production
 * code and must not depend on the test tree.
 */
import * as fs from "fs";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getDocsRoot } from "../utils/paths";

const FOLDER = "exemple";
const INDEX_URI = "data7://examples/index";

export interface ExampleHeader {
  readonly example: string;
  readonly demonstrates: string;
  readonly diagnostics: readonly { readonly code: string; readonly line: number }[];
  readonly transpiledTo?: string;
  readonly requires?: string;
}

export interface ExampleEntry {
  /** Relative path under `docs/exemple/`, forward-slashed, no extension. */
  readonly relativePath: string;
  /** Absolute path on disk. */
  readonly filePath: string;
  /** Parsed header (best-effort; undefined when missing or malformed). */
  readonly header?: ExampleHeader;
  /** Raw `.bas` content. */
  readonly content: string;
}

let cachedExamples: readonly ExampleEntry[] | undefined;

function walkBas(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkBas(full, acc);
    else if (entry.toLowerCase().endsWith(".bas")) acc.push(full);
  }
  return acc;
}

function parseHeader(code: string): ExampleHeader | undefined {
  const tags = new Map<string, string>();
  for (const rawLine of code.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed === "'") break;
    if (!trimmed.startsWith("'")) break;
    const body = trimmed.slice(1).trim();
    if (!body.startsWith("@")) continue;
    const colonIdx = body.indexOf(":");
    if (colonIdx === -1) continue;
    tags.set(body.slice(1, colonIdx).trim().toLowerCase(), body.slice(colonIdx + 1).trim());
  }

  const example = tags.get("example");
  const demonstrates = tags.get("demonstrates");
  const diagnosticsRaw = tags.get("diagnostics");
  if (!example || !demonstrates || diagnosticsRaw === undefined) return undefined;

  const diagnostics: { code: string; line: number }[] = [];
  if (diagnosticsRaw.toLowerCase() !== "none") {
    for (const part of diagnosticsRaw.split(",")) {
      const entry = part.trim();
      if (!entry) continue;
      const atIdx = entry.lastIndexOf("@");
      if (atIdx === -1) continue;
      const code = entry.slice(0, atIdx).trim();
      const line = Number.parseInt(entry.slice(atIdx + 1).trim(), 10);
      if (code && Number.isInteger(line)) diagnostics.push({ code, line });
    }
  }

  return {
    example,
    demonstrates,
    diagnostics,
    transpiledTo: tags.get("transpiled-to"),
    requires: tags.get("requires"),
  };
}

function loadExamples(): readonly ExampleEntry[] {
  if (cachedExamples) return cachedExamples;
  const root = path.join(getDocsRoot(), FOLDER);
  const files = walkBas(root).sort();
  const entries: ExampleEntry[] = [];
  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const relativePath = path
      .relative(root, filePath)
      .replace(/\\/g, "/")
      .replace(/\.bas$/i, "");
    entries.push({
      relativePath,
      filePath,
      content,
      header: parseHeader(content),
    });
  }
  cachedExamples = entries;
  return cachedExamples;
}

export function listExamples(): readonly ExampleEntry[] {
  return loadExamples();
}

export function readExample(relativePath: string): ExampleEntry | undefined {
  const normalised = relativePath.replace(/\\/g, "/").replace(/\.bas$/i, "");
  return loadExamples().find((e) => e.relativePath === normalised);
}

function buildIndexMarkdown(): string {
  const lines: string[] = [];
  lines.push("# Índice de exemplos canônicos Data7 Basic");
  lines.push("");
  lines.push(`Total de exemplos: ${String(loadExamples().length)}.`);
  lines.push("");
  lines.push(
    "Carregue um exemplo específico via `data7://examples/<category>/<slug>` " +
      "(por exemplo `data7://examples/sugar/for-each/01-stringlist-explicit-type`).",
  );
  lines.push("");

  const grouped = new Map<string, ExampleEntry[]>();
  for (const e of loadExamples()) {
    const top = e.relativePath.split("/")[0] ?? "outros";
    let bucket = grouped.get(top);
    if (!bucket) {
      bucket = [];
      grouped.set(top, bucket);
    }
    bucket.push(e);
  }

  for (const [category, items] of Array.from(grouped).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`## ${category} (${String(items.length)})`);
    lines.push("");
    lines.push("| Caminho | Demonstra | Diagnósticos |");
    lines.push("|---|---|---|");
    for (const item of items) {
      const dem = item.header?.demonstrates ?? "(sem @demonstrates)";
      const diag =
        !item.header || item.header.diagnostics.length === 0
          ? "none"
          : item.header.diagnostics.map((d) => `${d.code}@${String(d.line)}`).join(", ");
      lines.push(`| \`${item.relativePath}\` | ${dem} | ${diag} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function registerExamples(server: McpServer): void {
  // Static index resource.
  server.registerResource(
    "data7-examples-index",
    INDEX_URI,
    {
      title: "Índice de exemplos Data7 Basic",
      description: "Lista navegável dos exemplos canônicos com headers @example / @demonstrates.",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: buildIndexMarkdown() }],
    }),
  );

  // Templated resource for a specific example. The RFC 6570 reserved
  // operator `{+path}` is REQUIRED here: example paths contain slashes
  // (`forms/05-grid-com-dados`), and the default `{path}` form compiles
  // to a `([^/,]+)` match pattern that rejects multi-segment URIs — so
  // reads would fail with "Resource not found" even though the resource
  // lists fine. `{+path}` compiles to `(.+)`, capturing the full path.
  const template = new ResourceTemplate("data7://examples/{+path}", {
    list: () => ({
      resources: loadExamples().map((e) => ({
        uri: `data7://examples/${e.relativePath}`,
        name: e.relativePath,
        mimeType: "text/plain",
        description: e.header?.demonstrates ?? "(sem @demonstrates)",
      })),
    }),
  });

  server.registerResource(
    "data7-example",
    template,
    {
      title: "Exemplo canônico Data7 Basic",
      description: "Conteúdo `.bas` versionado em docs/exemple/, com header parseável.",
    },
    (uri, variables) => {
      const raw = variables.path;
      const relPath = Array.isArray(raw) ? raw.join("/") : raw;
      if (!relPath) {
        return {
          contents: [
            { uri: uri.href, mimeType: "text/plain", text: "Caminho de exemplo ausente." },
          ],
        };
      }
      // Strip the implicit prefix some clients add when expanding ResourceTemplate variables.
      const cleaned = relPath.replace(/^\/+/, "");
      const entry = readExample(cleaned);
      if (!entry) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Exemplo desconhecido: "${cleaned}".`,
            },
          ],
        };
      }
      return {
        contents: [{ uri: uri.href, mimeType: "text/plain", text: entry.content }],
      };
    },
  );
}
