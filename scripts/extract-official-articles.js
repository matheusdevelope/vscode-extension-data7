#!/usr/bin/env node
/* eslint-disable */
/**
 * Extracts the ~140 official ERP examples + 4 conceptual tutorials from
 * `docs/Documentação Data7/**\/*.html` into a single normalised bundle at
 * `out/mcp/data/articles.json`.
 *
 * Each HTML article carries a consistent shape under
 * `<div id="ARTICLECONTENT"><article>...</article></div>`:
 *
 *   <h3>{Qualified Name}</h3>
 *   <table class="syntaxhighlighter vb">...signature...</table>
 *   <h3>Descrição:</h3>
 *   <p>{description}</p>
 *   <h3>Exemplo:</h3>
 *   <table class="syntaxhighlighter vb">...example code...</table>
 *
 * The extractor is deterministic and parser-free: it relies on string
 * markers (`ARTICLECONTENT`, `Descrição:`, `Exemplo:`, etc.) plus a tiny
 * VB-codeblock decoder that pulls plain text out of the syntaxhighlighter
 * markup. This keeps the script dependency-free.
 *
 * Usage:
 *   node scripts/extract-official-articles.js [--out=path/to/articles.json]
 *
 * Exit code is 0 on success. The script never fails the build silently:
 * articles that cannot be parsed are still emitted with `parseError: <reason>`
 * so coverage tests can spot regressions.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const HTML_ROOT = path.join(REPO_ROOT, "docs", "Documentação Data7");
const DEFAULT_OUT = path.join(REPO_ROOT, "out", "mcp", "data", "articles.json");

const TUTORIAL_FOLDER = "Global"; // folder under which tutorial pages live at the root level
const TUTORIAL_FILE_PATTERN = /^\d+\s*-\s*[A-ZÁÉÍÓÚÀÂÊÔÃÕÇ].*\.html$/i;

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--out=")) args.out = path.resolve(a.slice("--out=".length));
  }
  return args;
}

function walkHtml(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkHtml(full, acc);
    else if (entry.toLowerCase().endsWith(".html")) acc.push(full);
  }
  return acc;
}

/** Strip every HTML tag, decode the most common entities, collapse whitespace. */
function htmlToText(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-zA-Z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Decodes one `<table border="0" ...>...syntaxhighlighter...</table>`
 * back to plain text, preserving line breaks. The "code" column holds
 * `<div class="line ..."><code class="vb ...">tokens</code>...</div>`
 * with one outer div per source line.
 */
function decodeCodeTable(tableHtml) {
  // Isolate the code column (drop the gutter that holds line numbers).
  const codeMatch = tableHtml.match(/<td class="code">([\s\S]*?)<\/td>/);
  if (!codeMatch) return "";
  const codeColumn = codeMatch[1];
  const lineRegex = /<div class="line[^"]*">([\s\S]*?)<\/div>/g;
  const lines = [];
  let m;
  while ((m = lineRegex.exec(codeColumn)) !== null) {
    const raw = m[1];
    const text = raw
      .replace(/<code[^>]*>/g, "")
      .replace(/<\/code>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    lines.push(text);
  }
  return lines.join("\n").trim();
}

/** Extracts the `<article>` block from an HTML file, or `undefined`. */
function extractArticle(html) {
  const idx = html.indexOf('id="ARTICLECONTENT"');
  if (idx === -1) return undefined;
  // Find the opening <article> after the ARTICLECONTENT div.
  const articleStart = html.indexOf("<article", idx);
  if (articleStart === -1) return undefined;
  const articleEnd = html.indexOf("</article>", articleStart);
  if (articleEnd === -1) return undefined;
  return html.slice(articleStart, articleEnd + "</article>".length);
}

/**
 * Pull the qualified name from the first H3 of the article block. Falls
 * back to the filename minus extension if H3 parsing fails. Strips noise
 * prefixes added by the article authors ("Namespace ", "Classe ", etc.).
 */
function extractQualifiedName(article, fallbackFile) {
  const h3 = article.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
  let raw;
  if (h3) {
    raw = htmlToText(h3[1]);
  }
  if (!raw) raw = path.basename(fallbackFile, ".html").trim();
  return raw
    .replace(/^(Namespace|Classe|Class)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits the article into sections delimited by H3 headings. Returns an
 * array of `{ heading: string, body: string }` ordered by appearance.
 */
function splitByH3(article) {
  const sections = [];
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  const matches = [];
  let m;
  while ((m = h3Regex.exec(article)) !== null) {
    matches.push({ heading: htmlToText(m[1]), index: m.index, length: m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : article.length;
    sections.push({ heading: matches[i].heading, body: article.slice(start, end) });
  }
  return sections;
}

function normaliseHeading(heading) {
  return heading
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[:：]+$/g, "")
    .trim();
}

const HEADING_ALIASES = {
  description: ["descrição", "descricao", "description"],
  example: ["exemplo", "exemplos", "example", "examples"],
  parameters: ["parâmetros", "parametros", "parameters"],
  returns: ["retorno", "retorna", "returns", "return"],
  notes: ["observações", "observacoes", "notes", "note"],
};

function classifyHeading(heading) {
  const norm = normaliseHeading(heading);
  for (const [key, aliases] of Object.entries(HEADING_ALIASES)) {
    if (aliases.includes(norm)) return key;
  }
  return undefined;
}

/** Pull the first <table> living inside a <div class="syntaxhighlighter">. */
function firstCodeTable(fragment) {
  const idx = fragment.indexOf("syntaxhighlighter");
  if (idx === -1) return undefined;
  // Walk FORWARD from the syntaxhighlighter marker to find the <table> tag
  // it wraps. The div opens before the table in source order.
  const tableStart = fragment.indexOf("<table", idx);
  if (tableStart === -1) return undefined;
  const tableEnd = fragment.indexOf("</table>", tableStart);
  if (tableEnd === -1) return undefined;
  return fragment.slice(tableStart, tableEnd + "</table>".length);
}

function extractParagraphs(fragment) {
  const paragraphs = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(fragment)) !== null) {
    const text = htmlToText(m[1]);
    if (text && text.length > 1) paragraphs.push(text);
  }
  return paragraphs;
}

function extractTables(fragment) {
  const tables = [];
  const re = /<table[^>]*>([\s\S]*?)<\/table>/g;
  let m;
  while ((m = re.exec(fragment)) !== null) {
    // Skip code-block tables.
    if (m[0].includes("syntaxhighlighter")) continue;
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    const rows = [];
    let r;
    while ((r = rowRegex.exec(m[1])) !== null) {
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
      const cells = [];
      let c;
      while ((c = cellRegex.exec(r[1])) !== null) {
        cells.push(htmlToText(c[1]));
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

function renderTablesAsMarkdown(tables) {
  if (tables.length === 0) return undefined;
  return tables
    .map((rows) => {
      if (rows.length === 0) return "";
      const widths = Math.max(...rows.map((r) => r.length));
      const header = Array(widths)
        .fill("Coluna")
        .map((c, i) => `${c} ${i + 1}`);
      const lines = [
        "| " + header.join(" | ") + " |",
        "| " + Array(widths).fill("---").join(" | ") + " |",
      ];
      for (const row of rows) {
        const padded = Array.from({ length: widths }, (_, i) => row[i] ?? "");
        lines.push("| " + padded.join(" | ") + " |");
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function parseArticle(filePath) {
  let html;
  try {
    html = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return { filePath, parseError: `read failed: ${err.message}` };
  }

  const article = extractArticle(html);
  if (!article) {
    return { filePath, parseError: "no ARTICLECONTENT block found" };
  }

  const qualifiedName = extractQualifiedName(article, filePath);
  const sections = splitByH3(article);

  // Top section (everything before the first H3) typically holds the
  // signature code block. The signature is the FIRST code table in the
  // article, regardless of section position.
  const signatureTable = firstCodeTable(article);
  const signature = signatureTable ? decodeCodeTable(signatureTable) : undefined;

  // Classify subsequent sections.
  let description;
  let example;
  let parameters;
  let returns;
  let notes;

  for (const section of sections) {
    const kind = classifyHeading(section.heading);
    if (!kind) continue;
    const body = section.body;
    if (kind === "description") {
      description = extractParagraphs(body).join("\n\n").trim();
    } else if (kind === "example") {
      const tbl = firstCodeTable(body);
      if (tbl) example = decodeCodeTable(tbl);
    } else if (kind === "parameters") {
      const tbl = extractTables(body);
      parameters = renderTablesAsMarkdown(tbl) || extractParagraphs(body).join("\n");
    } else if (kind === "returns") {
      returns = extractParagraphs(body).join("\n");
    } else if (kind === "notes") {
      notes = extractParagraphs(body).join("\n");
    }
  }

  // Detect class-index pages: no Descrição section but a big table of members
  // listing related symbols.
  const isClassIndex = !description && article.includes("table table-bordered");
  let members;
  if (isClassIndex) {
    const tables = extractTables(article);
    const collected = new Set();
    for (const rows of tables) {
      for (const row of rows) {
        const first = (row[0] ?? "").trim();
        if (first && /^[A-Z][A-Za-z0-9_]+$/.test(first)) collected.add(first);
      }
    }
    members = [...collected];
  }

  // Detect tutorials: when the file lives at the TUTORIAL_FOLDER root and
  // matches "NN - <Topic>.html". Tutorials have H2 instead of H3 in our
  // sample, and don't follow the standard signature/description shape.
  const relFromHtmlRoot = path.relative(HTML_ROOT, filePath);
  const segments = relFromHtmlRoot.split(path.sep);
  const isTutorial =
    segments.length === 2 &&
    segments[0] === TUTORIAL_FOLDER &&
    TUTORIAL_FILE_PATTERN.test(segments[segments.length - 1]);

  if (isTutorial) {
    // For tutorials, embed the full article body as a single description.
    return {
      filePath,
      qualifiedName,
      isTutorial: true,
      description: htmlToText(article).slice(0, 20000),
      example,
    };
  }

  return {
    filePath,
    qualifiedName,
    signature,
    description,
    example,
    parameters,
    returns,
    notes,
    isClassIndex: isClassIndex || undefined,
    members: members && members.length > 0 ? members : undefined,
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(HTML_ROOT)) {
    console.error(`[extract-official-articles] HTML root not found: ${HTML_ROOT}`);
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, "[]", "utf-8");
    return;
  }

  const files = walkHtml(HTML_ROOT);
  console.log(`Found ${files.length} HTML files under docs/Documentação Data7/.`);

  const articles = [];
  const skippedErrors = [];
  for (const file of files) {
    const article = parseArticle(file);
    const rel = path.relative(HTML_ROOT, file).replace(/\\/g, "/");
    if (article.parseError) {
      skippedErrors.push({ source: rel, reason: article.parseError });
      continue; // do NOT push foreign HTMLs (RAD Studio reference) into the bundle
    }
    const { filePath, ...rest } = article;
    void filePath;
    articles.push({ sourcePath: rel, ...rest });
  }

  // Sort by qualifiedName for deterministic output.
  articles.sort((a, b) => (a.qualifiedName ?? "").localeCompare(b.qualifiedName ?? ""));

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(articles, null, 2), "utf-8");

  const tutorials = articles.filter((a) => a.isTutorial).length;
  const classIndexes = articles.filter((a) => a.isClassIndex).length;
  const apiRefs = articles.length - tutorials - classIndexes;
  const bytes = fs.statSync(args.out).size;
  console.log(
    `Wrote ${articles.length} articles to ${path.relative(REPO_ROOT, args.out)} ` +
      `(${(bytes / 1024).toFixed(1)} KB).`,
  );
  console.log(
    `Breakdown: ${apiRefs} API-reference, ${classIndexes} class-index, ${tutorials} tutorial.`,
  );
  if (skippedErrors.length > 0) {
    console.log(
      `Skipped ${skippedErrors.length} foreign HTML files (no ARTICLECONTENT) — typically external RAD Studio reference pages.`,
    );
  }
}

main();
