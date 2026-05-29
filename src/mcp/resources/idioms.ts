/**
 * Resource `data7://idioms` — merged view of the language's idiomatic
 * conventions and its known limitations. Helps AI agents understand
 * what NOT to write (no closures with capture, no operator overloading,
 * etc.) and what the canonical workarounds look like (`extra As Variant`,
 * `BaseEnum`, `TRecordList<T>` typed subclasses).
 *
 * Built by concatenating the two source markdowns; both chapters live in
 * `docs/linguagem-basic/` so they remain editable as standalone references
 * AND served together as a single curated resource.
 */
import * as fs from "fs";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getDocsRoot } from "../utils/paths";

const URI = "data7://idioms";

function readChapter(slug: string): string {
  const dir = path.join(getDocsRoot(), "linguagem-basic");
  if (!fs.existsSync(dir)) return "";
  for (const name of fs.readdirSync(dir)) {
    if (name.toLowerCase().endsWith(`-${slug}.md`)) {
      try {
        return fs.readFileSync(path.join(dir, name), "utf-8");
      } catch {
        return "";
      }
    }
  }
  return "";
}

function buildMarkdown(): string {
  const conventions = readChapter("convencoes-idiomaticas");
  const limitations = readChapter("limitacoes-conhecidas");
  const parts: string[] = [];
  parts.push("# Idiomas e limitações de Data7 Basic");
  parts.push("");
  parts.push(
    "Este recurso reúne as duas referências mais úteis para gerar código " +
      "correto na primeira tentativa: o catálogo de **limitações intrínsecas** " +
      "(o que a linguagem não oferece) e o catálogo de **convenções idiomáticas** " +
      "(os padrões que substituem essas limitações).",
  );
  parts.push("");
  if (limitations) {
    parts.push("---");
    parts.push("");
    parts.push(limitations);
  }
  if (conventions) {
    parts.push("---");
    parts.push("");
    parts.push(conventions);
  }
  return parts.join("\n");
}

export function registerIdioms(server: McpServer): void {
  server.registerResource(
    "data7-idioms",
    URI,
    {
      title: "Idiomas e limitações de Data7 Basic",
      description:
        "Conjunto consolidado de limitações intrínsecas + convenções idiomáticas (BaseEnum, TRecordList, extra As Variant).",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: buildMarkdown() }],
    }),
  );
}
