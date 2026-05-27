#!/usr/bin/env node
/* eslint-disable */
/**
 * Regenerates `docs/exemple/README.md` from the `@example` / `@demonstrates`
 * / `@diagnostics` headers of every `.bas` under `docs/exemple/`.
 *
 * Usage:
 *   node scripts/generate-examples-index.js            # writes README.md
 *   node scripts/generate-examples-index.js --check    # CI mode: exit 1 if drifted
 *
 * Keeps the curated handwritten preamble (everything ABOVE the auto-generated
 * marker line) intact and regenerates only the table of examples below it.
 * Headerless `.bas` files are listed under a "Sem header" section so the
 * gap shows up in the README review.
 *
 * Pure Node — no dependency on the compiled `out/` tree.
 */
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const EXAMPLES_ROOT = path.join(REPO_ROOT, "docs", "exemple");
const README_PATH = path.join(EXAMPLES_ROOT, "README.md");
const MARKER = "<!-- BEGIN: auto-generated index — do not edit below by hand -->";

const args = process.argv.slice(2);
const checkMode = args.includes("--check");

/** Walk `dir` recursively and yield every `.bas` file path. */
function walkBas(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walkBas(full));
    else if (entry.toLowerCase().endsWith(".bas")) out.push(full);
  }
  return out;
}

/** Extract the `@example / @demonstrates / @diagnostics` block from a .bas. */
function parseHeader(content) {
  const tags = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed === "'") break;
    if (!trimmed.startsWith("'")) break;
    const body = trimmed.slice(1).trim();
    if (!body.startsWith("@")) continue;
    const colon = body.indexOf(":");
    if (colon === -1) continue;
    tags[body.slice(1, colon).trim().toLowerCase()] = body.slice(colon + 1).trim();
  }
  return tags;
}

/** Group example entries by their top-level folder (sugar/diagnostics/builder/...). */
function groupByCategory(entries) {
  const groups = new Map();
  for (const e of entries) {
    const top = e.relPath.split(/[\\/]/)[0] || "outros";
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top).push(e);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.relPath.localeCompare(b.relPath));
  }
  return groups;
}

function buildIndex() {
  const files = walkBas(EXAMPLES_ROOT).sort();
  const entries = files.map((f) => {
    const relPath = path.relative(EXAMPLES_ROOT, f).replace(/\\/g, "/");
    const content = fs.readFileSync(f, "utf-8");
    const tags = parseHeader(content);
    return {
      relPath,
      example: tags["example"] || "(sem @example)",
      demonstrates: tags["demonstrates"] || "(sem @demonstrates)",
      diagnostics: tags["diagnostics"] || "(sem @diagnostics)",
      requires: tags["requires"],
    };
  });

  const groups = groupByCategory(entries);
  const totalFiles = entries.length;
  const orderedKeys = ["sugar", "diagnostics", "builder", "outros"].filter((k) => groups.has(k));
  // Keep any unknown top-level folders too, sorted last alphabetically.
  for (const k of [...groups.keys()].sort()) {
    if (!orderedKeys.includes(k)) orderedKeys.push(k);
  }

  let body = `${MARKER}\n\n## Índice de exemplos (${totalFiles} arquivos)\n\n`;
  body += `> Gerado automaticamente por \`scripts/generate-examples-index.js\`. Edite os cabeçalhos dos \`.bas\` em vez deste bloco.\n\n`;

  for (const key of orderedKeys) {
    const list = groups.get(key);
    body += `### ${key} (${list.length})\n\n`;
    body += "| Caminho | Demonstra | Diagnósticos | Requer |\n";
    body += "|---|---|---|---|\n";
    for (const e of list) {
      const requires = e.requires ? `\`${e.requires.replace(/\|/g, "\\|")}\`` : "—";
      body += `| [\`${e.relPath}\`](./${e.relPath}) | ${escapeCell(e.demonstrates)} | \`${escapeCell(e.diagnostics)}\` | ${requires} |\n`;
    }
    body += "\n";
  }

  return body.trimEnd() + "\n";
}

function escapeCell(s) {
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function applyIndex(existingReadme, newIndex) {
  const markerIdx = existingReadme.indexOf(MARKER);
  if (markerIdx === -1) {
    // First run — append the index at the bottom.
    return existingReadme.trimEnd() + "\n\n" + newIndex;
  }
  return existingReadme.slice(0, markerIdx).trimEnd() + "\n\n" + newIndex;
}

function main() {
  if (!fs.existsSync(README_PATH)) {
    console.error(`README not found at ${README_PATH}. Create the file first.`);
    process.exit(2);
  }
  const existing = fs.readFileSync(README_PATH, "utf-8");
  const newIndex = buildIndex();
  const next = applyIndex(existing, newIndex);

  if (checkMode) {
    if (next !== existing) {
      console.error(
        "docs/exemple/README.md is out of sync with the .bas headers. Run `node scripts/generate-examples-index.js` and commit the result.",
      );
      process.exit(1);
    }
    console.log("docs/exemple/README.md is up to date.");
    return;
  }

  fs.writeFileSync(README_PATH, next, "utf-8");
  console.log(`docs/exemple/README.md updated.`);
}

main();
