#!/usr/bin/env node
const path = require("path");
const fs = require("fs");

function requireFirstExisting(candidates) {
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (!error || error.code !== "MODULE_NOT_FOUND") {
        throw error;
      }
    }
  }
  throw new Error(`Nenhum build compativel encontrado:\n${candidates.join("\n")}`);
}

const coreDistRoot = path.resolve(__dirname, "..", "packages", "data7-core", "dist");
const legacyOutRoot = path.resolve(__dirname, "..", "out");

// Load the compiled SYSTEM_SYMBOLS and PRIMITIVE_TYPES
const { SYSTEM_SYMBOLS } = requireFirstExisting([
  path.join(coreDistRoot, "system-library"),
  path.join(legacyOutRoot, "system-library"),
]);
const { PRIMITIVE_TYPES } = requireFirstExisting([
  path.join(coreDistRoot, "utils", "primitive-types"),
  path.join(legacyOutRoot, "utils", "primitive-types"),
]);

// 1. Gather all primitive types and capitalize them nicely
const primitives = Array.from(PRIMITIVE_TYPES).map((p) => {
  return p
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(".");
});

// 2. Gather all class and structure names from the System Library
const classesAndStructures = SYSTEM_SYMBOLS.filter(
  (s) => s.kind === "class" || s.kind === "structure",
).map((s) => s.name);

// 3. Combine, deduplicate case-insensitively, and sort alphabetically
const allTypesSet = new Set();
const normalizedSeen = new Set();

const addType = (t) => {
  const lower = t.toLowerCase();
  if (!normalizedSeen.has(lower)) {
    normalizedSeen.add(lower);
    allTypesSet.add(t);
  }
};

primitives.forEach(addType);
classesAndStructures.forEach(addType);

// Sort alphabetically
const sortedTypes = Array.from(allTypesSet).sort((a, b) =>
  a.localeCompare(b, undefined, { sensitivity: "base" }),
);

// 4. Escape special regex characters (specifically dots)
const escapedTypes = sortedTypes.map((t) => t.replace(/\./g, "\\\\."));

// 5. Build the final RegExp match string
const matchPattern = `(?i)\\\\b(${escapedTypes.join("|")})\\\\b`;

// 6. Update the grammar JSON file
const grammarPath = path.resolve(
  __dirname,
  "..",
  "packages",
  "data7-vscode",
  "syntaxes",
  "d7basic.tmLanguage.json",
);

if (!fs.existsSync(grammarPath)) {
  console.error(`Grammar file not found at: ${grammarPath}`);
  process.exit(1);
}

const grammarContent = fs.readFileSync(grammarPath, "utf8");
const grammarJson = JSON.parse(grammarContent);

if (
  grammarJson.repository &&
  grammarJson.repository.types &&
  grammarJson.repository.types.patterns &&
  grammarJson.repository.types.patterns[0]
) {
  grammarJson.repository.types.patterns[0].match = matchPattern;
  fs.writeFileSync(grammarPath, JSON.stringify(grammarJson, null, 2), "utf8");
  console.log(
    `Successfully updated types in grammar from System Library! Total types: ${sortedTypes.length}`,
  );
} else {
  console.error("Could not find repository.types.patterns[0] inside the grammar JSON.");
  process.exit(1);
}
