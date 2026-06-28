/**
 * Resource family `data7://language/<chapter>` — serves the canonical
 * specification chapters of Data7 Basic from `docs/linguagem-basic/*.md`.
 *
 * Each chapter is a self-contained markdown file (sintaxe, tipos,
 * operadores, controle-de-fluxo, classes, delegates, generics,
 * modulos-e-imports, system-library, acucares-atuais,
 * limitacoes-conhecidas, convencoes-idiomaticas, diagnostic-codes).
 *
 * The resource id is the slug WITHOUT the numeric prefix and `.md`
 * extension, e.g. `data7://language/sintaxe`, `data7://language/tipos`.
 * The numeric prefix on disk (`01-sintaxe.md`) is preserved only for
 * human navigation order.
 */
import * as fs from "fs";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getDocsRoot } from "../utils/paths";

const FOLDER = "linguagem-basic";

interface ChapterEntry {
  /** URI-safe slug used as the chapter id (no numeric prefix). */
  readonly slug: string;
  /** Absolute path to the markdown file. */
  readonly filePath: string;
  /** Display title parsed from the first H1 of the file. */
  readonly title: string;
}

let cachedIndex: readonly ChapterEntry[] | undefined;

/**
 * Discovers every `NN-<slug>.md` (and `README.md`) under
 * `docs/linguagem-basic/`. Skips subfolders and non-markdown files.
 */
function loadIndex(): readonly ChapterEntry[] {
  if (cachedIndex) return cachedIndex;
  const dir = path.join(getDocsRoot(), FOLDER);
  if (!fs.existsSync(dir)) {
    cachedIndex = [];
    return cachedIndex;
  }

  const entries: ChapterEntry[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith(".md")) continue;
    const filePath = path.join(dir, name);
    if (!fs.statSync(filePath).isFile()) continue;

    const base = name.replace(/\.md$/i, "");
    const slug = base.replace(/^\d+-/, "").toLowerCase() || "readme";

    let title = base;
    try {
      const firstLines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/, 5);
      const h1 = firstLines.find((line) => line.startsWith("# "));
      if (h1) title = h1.slice(2).trim();
    } catch {
      // keep default title
    }

    entries.push({ slug, filePath, title });
  }

  entries.sort((a, b) => {
    const aIsReadme = a.slug === "readme";
    const bIsReadme = b.slug === "readme";
    if (aIsReadme && !bIsReadme) return -1;
    if (!aIsReadme && bIsReadme) return 1;
    const aNum = /^(\d+)/.exec(path.basename(a.filePath))?.[1] ?? "999";
    const bNum = /^(\d+)/.exec(path.basename(b.filePath))?.[1] ?? "999";
    return Number(aNum) - Number(bNum);
  });

  cachedIndex = entries;
  return cachedIndex;
}

export function listLanguageChapters(): readonly ChapterEntry[] {
  return loadIndex();
}

export function readLanguageChapter(slug: string): string | undefined {
  const entry = loadIndex().find((c) => c.slug === slug.toLowerCase());
  if (!entry) return undefined;
  try {
    return fs.readFileSync(entry.filePath, "utf-8");
  } catch {
    return undefined;
  }
}

/**
 * Registers the resource template `data7://language/{chapter}` with the
 * MCP server. The `list` callback exposes the full chapter index so
 * clients can discover available slugs without guessing.
 */
export function registerLanguageChapters(server: McpServer): void {
  const template = new ResourceTemplate("data7://language/{chapter}", {
    list: () => {
      return {
        resources: loadIndex().map((entry) => ({
          uri: `data7://language/${entry.slug}`,
          name: entry.title,
          mimeType: "text/markdown",
          description: `Capítulo "${entry.title}" da especificação Data7 Basic.`,
        })),
      };
    },
  });

  server.registerResource(
    "data7-language-chapter",
    template,
    {
      title: "Capítulos da linguagem Data7 Basic",
      description: "Referência canônica de sintaxe, tipos, operadores, classes, generics e mais.",
    },
    (uri, variables) => {
      const rawSlug = variables.chapter;
      const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
      const content = slug ? readLanguageChapter(slug) : undefined;
      if (content === undefined) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Capítulo desconhecido: "${slug ?? ""}".`,
            },
          ],
        };
      }
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: content }],
      };
    },
  );
}
