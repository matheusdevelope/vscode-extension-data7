#!/usr/bin/env node
/* eslint-disable */
/**
 * Generates Markdown documentation for every namespace registered in the System Library.
 *
 * Usage:
 *   npm run compile && node scripts/generate-system-library-docs.js [outputDir] [...namespaces]
 *
 * - `outputDir`  Optional. Defaults to `docs/system-library/` at the repo root.
 * - `namespaces` Optional. When provided, only the listed namespaces are emitted;
 *                otherwise every namespace is emitted plus an `index.md` README.
 *
 * Thin wrapper around `DocsGenerator` (src/system-library/docs-generator.ts) — the
 * same logic backs the in-IDE command `Data7: Gerar Documentação da System Library`.
 */
const path = require("path");
const fs = require("fs");

const { DocsGenerator } = require(path.join("..", "out", "system-library", "docs-generator"));

const args = process.argv.slice(2);
const outputDir = path.resolve(args[0] || path.join(__dirname, "..", "docs", "system-library"));
const explicitNamespaces = args.slice(1);

fs.mkdirSync(outputDir, { recursive: true });

const available = DocsGenerator.getNamespaceNames();
const namespaces =
  explicitNamespaces.length > 0
    ? explicitNamespaces.filter((n) => available.includes(n))
    : available;

if (namespaces.length === 0) {
  console.error("Nenhum namespace válido encontrado. Disponíveis:", available.join(", "));
  process.exit(1);
}

let totalBytes = 0;
for (const ns of namespaces) {
  const md = DocsGenerator.generateNamespaceMarkdown(ns);
  const outFile = path.join(outputDir, `${ns}.md`);
  fs.writeFileSync(outFile, md, "utf-8");
  totalBytes += Buffer.byteLength(md, "utf-8");
  console.log(
    `  + ${path.relative(process.cwd(), outFile)} (${(Buffer.byteLength(md, "utf-8") / 1024).toFixed(1)} KB)`,
  );
}

const indexMd = DocsGenerator.generateIndexMarkdown(namespaces);
const indexPath = path.join(outputDir, "README.md");
fs.writeFileSync(indexPath, indexMd, "utf-8");
console.log(`  + ${path.relative(process.cwd(), indexPath)} (índice)`);

console.log(
  `\nOK — ${namespaces.length} namespace(s), ${(totalBytes / 1024).toFixed(1)} KB em ${outputDir}.`,
);
