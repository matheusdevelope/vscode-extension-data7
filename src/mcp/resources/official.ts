/**
 * Resource family `data7://official/<qualifiedName>` — serves the
 * official ERP-documented examples extracted from `docs/Documentação Data7/`.
 *
 * The articles bundle is produced by `scripts/extract-official-articles.js`
 * (executed in M1.5) and lives at `out/mcp/data/articles.json`. When the
 * bundle is missing (M1 only), the Resource returns a friendly stub.
 */
import * as fs from "fs";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getDataRoot } from "../utils/paths";

const INDEX_URI = "data7://official/index";

export interface OfficialArticle {
  readonly qualifiedName: string;
  readonly signature?: string;
  readonly description?: string;
  readonly example?: string;
  readonly parameters?: string;
  readonly returns?: string;
  readonly isClassIndex?: boolean;
  readonly isTutorial?: boolean;
  readonly members?: readonly string[];
}

let cachedArticles: readonly OfficialArticle[] | undefined;

function loadArticles(): readonly OfficialArticle[] {
  if (cachedArticles) return cachedArticles;
  const dataRoot = getDataRoot();
  if (!dataRoot) {
    cachedArticles = [];
    return cachedArticles;
  }
  const articlesPath = path.join(dataRoot, "articles.json");
  if (!fs.existsSync(articlesPath)) {
    cachedArticles = [];
    return cachedArticles;
  }
  try {
    const raw = fs.readFileSync(articlesPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      cachedArticles = parsed as readonly OfficialArticle[];
      return cachedArticles;
    }
  } catch {
    // fall through
  }
  cachedArticles = [];
  return cachedArticles;
}

export function listOfficialArticles(): readonly OfficialArticle[] {
  return loadArticles().filter((a) => !a.isTutorial);
}

export function findOfficialArticle(qualifiedName: string): OfficialArticle | undefined {
  const lower = qualifiedName.toLowerCase();
  return loadArticles().find((a) => a.qualifiedName.toLowerCase() === lower);
}

function renderArticle(article: OfficialArticle): string {
  const lines: string[] = [];
  lines.push(`# ${article.qualifiedName}`);
  lines.push("");
  if (article.signature) {
    lines.push("**Assinatura:**");
    lines.push("");
    lines.push("```basic");
    lines.push(article.signature);
    lines.push("```");
    lines.push("");
  }
  if (article.description) {
    lines.push("**Descrição:**");
    lines.push("");
    lines.push(article.description);
    lines.push("");
  }
  if (article.parameters) {
    lines.push("**Parâmetros:**");
    lines.push("");
    lines.push(article.parameters);
    lines.push("");
  }
  if (article.returns) {
    lines.push("**Retorno:**");
    lines.push("");
    lines.push(article.returns);
    lines.push("");
  }
  if (article.example) {
    lines.push("**Exemplo:**");
    lines.push("");
    lines.push("```basic");
    lines.push(article.example);
    lines.push("```");
    lines.push("");
  }
  if (article.isClassIndex && article.members?.length) {
    lines.push("**Membros desta classe (links):**");
    lines.push("");
    for (const m of article.members) {
      lines.push(`- \`data7://official/${m}\``);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function buildIndexMarkdown(): string {
  const all = loadArticles();
  if (all.length === 0) {
    return (
      "# Exemplos oficiais — bundle ausente\n\n" +
      "O arquivo `out/mcp/data/articles.json` ainda não foi gerado. Rode `npm run mcp:articles` " +
      "ou aguarde o milestone M1.5 da implementação do MCP."
    );
  }
  const lines: string[] = [];
  lines.push("# Exemplos oficiais do ERP Data7");
  lines.push("");
  lines.push(
    `Total: ${String(all.length)} entradas extraídas de \`docs/Documentação Data7/**/*.html\`.`,
  );
  lines.push("");
  lines.push("| Símbolo qualificado | Tipo |");
  lines.push("|---|---|");
  for (const article of all) {
    const tipo = article.isTutorial ? "tutorial" : article.isClassIndex ? "class-index" : "API";
    lines.push(`| \`${article.qualifiedName}\` | ${tipo} |`);
  }
  return lines.join("\n");
}

export function registerOfficial(server: McpServer): void {
  server.registerResource(
    "data7-official-index",
    INDEX_URI,
    {
      title: "Índice de exemplos oficiais do ERP",
      description: "Lista todos os símbolos com exemplo oficial extraído da Base de Conhecimento.",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: buildIndexMarkdown() }],
    }),
  );

  const template = new ResourceTemplate("data7://official/{qualifiedName}", {
    list: () => ({
      resources: loadArticles().map((article) => ({
        uri: `data7://official/${article.qualifiedName}`,
        name: article.qualifiedName,
        mimeType: "text/markdown",
        description: article.description?.split("\n")[0] ?? "Exemplo oficial do ERP Data7.",
      })),
    }),
  });

  server.registerResource(
    "data7-official-article",
    template,
    {
      title: "Exemplo oficial do ERP Data7",
      description: "Assinatura + descrição + exemplo canônico de um símbolo nativo.",
    },
    (uri, variables) => {
      const raw = variables.qualifiedName;
      const name = Array.isArray(raw) ? raw.join("/") : raw;
      if (!name) {
        return {
          contents: [
            { uri: uri.href, mimeType: "text/plain", text: "Símbolo qualificado ausente na URI." },
          ],
        };
      }
      const article = findOfficialArticle(name);
      if (!article) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text:
                `Símbolo "${name}" sem entrada em articles.json. ` +
                `Verifique data7://official/index ou rode \`npm run mcp:articles\`.`,
            },
          ],
        };
      }
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderArticle(article) }],
      };
    },
  );
}
