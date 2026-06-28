/**
 * Resource family `data7://guide/<slug>` — serves the prose tutorials
 * embedded in `docs/Documentação Data7/Global/*.html` (Strings, Data e
 * Hora, Palavras Chave, Tipos de Dados E Funções de Conversão).
 *
 * Distinguished from `data7://official/<qualifiedName>` because tutorials
 * are guides ("how to work with X"), not API references ("Class.Method
 * does Y"). Populated by `scripts/extract-official-articles.js` (M1.5),
 * which writes tutorials with `isTutorial: true` into `articles.json`.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { findOfficialArticle, listOfficialArticles, type OfficialArticle } from "./official";

const INDEX_URI = "data7://guide/index";

function listTutorials(): readonly OfficialArticle[] {
  return listOfficialArticles().filter((a) => a.isTutorial);
}

function slugFromQualifiedName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\d+\s*-\s*/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function findTutorialBySlug(slug: string): OfficialArticle | undefined {
  const target = slug.toLowerCase();
  // Match either the raw qualifiedName or the derived slug.
  return listTutorials().find(
    (a) =>
      a.qualifiedName.toLowerCase() === target || slugFromQualifiedName(a.qualifiedName) === target,
  );
}

function buildIndexMarkdown(): string {
  const tutorials = listTutorials();
  if (tutorials.length === 0) {
    return (
      "# Guias — bundle ausente\n\n" +
      "Os tutoriais prosaicos do ERP serão extraídos por `scripts/extract-official-articles.js` " +
      "(milestone M1.5) e expostos aqui."
    );
  }
  const lines: string[] = [];
  lines.push("# Guias prosaicos do ERP Data7");
  lines.push("");
  lines.push("Material conceitual extraído da Base de Conhecimento original.");
  lines.push("");
  for (const tut of tutorials) {
    lines.push(
      `- \`data7://guide/${slugFromQualifiedName(tut.qualifiedName)}\` — ${tut.qualifiedName}`,
    );
  }
  return lines.join("\n");
}

export function registerGuide(server: McpServer): void {
  server.registerResource(
    "data7-guide-index",
    INDEX_URI,
    {
      title: "Guias prosaicos do ERP Data7",
      description: "Tutoriais conceituais (Strings, Data e Hora, Palavras Chave, Tipos de Dados).",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: buildIndexMarkdown() }],
    }),
  );

  const template = new ResourceTemplate("data7://guide/{slug}", {
    list: () => ({
      resources: listTutorials().map((tut) => ({
        uri: `data7://guide/${slugFromQualifiedName(tut.qualifiedName)}`,
        name: tut.qualifiedName,
        mimeType: "text/markdown",
        description: tut.description?.split("\n")[0] ?? "Guia conceitual do ERP Data7.",
      })),
    }),
  });

  server.registerResource(
    "data7-guide",
    template,
    {
      title: "Guia prosaico do ERP Data7",
      description: "Tutorial conceitual de uma área da linguagem (strings, datas, conversões…).",
    },
    (uri, variables) => {
      const raw = variables.slug;
      const slug = Array.isArray(raw) ? raw[0] : raw;
      if (!slug) {
        return {
          contents: [{ uri: uri.href, mimeType: "text/plain", text: "Slug ausente na URI." }],
        };
      }
      // Prefer slug match; fall back to direct qualified-name lookup.
      const tut = findTutorialBySlug(slug) ?? findOfficialArticle(slug);
      if (!tut) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Guia desconhecido: "${slug}". Veja data7://guide/index.`,
            },
          ],
        };
      }
      const body = [tut.description ?? "", "", tut.example ? `\n${tut.example}` : ""].join("\n");
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: body }],
      };
    },
  );
}
