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

// Load the compiled keywords definitions
const { NATIVE_CONTROL_KEYWORDS, LOGICAL_OPERATOR_KEYWORDS, CONSTANT_KEYWORDS, SUGAR_KEYWORDS } =
  requireFirstExisting([
    path.join(coreDistRoot, "project", "language", "keywords"),
    path.join(legacyOutRoot, "project", "language", "keywords"),
  ]);

// 1. Prepare and sort lists (length descending for regex stability)
const controlKeywords = [...NATIVE_CONTROL_KEYWORDS, ...SUGAR_KEYWORDS.map((k) => k.canonical)];

const sortRegexList = (list) => {
  return Array.from(new Set(list)).sort((a, b) => {
    if (b.length !== a.length) {
      return b.length - a.length;
    }
    return a.localeCompare(b);
  });
};

const sortedControls = sortRegexList(controlKeywords);
const sortedLogicals = sortRegexList(LOGICAL_OPERATOR_KEYWORDS);
const sortedConstants = sortRegexList(CONSTANT_KEYWORDS);

// 2. Build final patterns
const controlPattern = `(?i)\\b(${sortedControls.join("|")})\\b`;
const logicalPattern = `(?i)\\b(${sortedLogicals.join("|")})\\b`;
const constantPattern = `(?i)\\b(${sortedConstants.join("|")})\\b`;

// 3. Update the grammar JSON file
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

let updatedCount = 0;

if (
  grammarJson.repository &&
  grammarJson.repository.keywords &&
  grammarJson.repository.keywords.patterns
) {
  const controlObj = grammarJson.repository.keywords.patterns.find(
    (p) => p.name === "keyword.control.d7basic",
  );
  if (controlObj) {
    controlObj.match = controlPattern;
    updatedCount++;
  } else {
    console.warn("Could not find keyword.control.d7basic pattern in grammar.");
  }

  const logicalObj = grammarJson.repository.keywords.patterns.find(
    (p) => p.name === "keyword.operator.logical.d7basic",
  );
  if (logicalObj) {
    logicalObj.match = logicalPattern;
    updatedCount++;
  } else {
    console.warn("Could not find keyword.operator.logical.d7basic pattern in grammar.");
  }
} else {
  console.error("Could not find repository.keywords.patterns inside the grammar JSON.");
  process.exit(1);
}

if (
  grammarJson.repository &&
  grammarJson.repository.constants &&
  grammarJson.repository.constants.patterns
) {
  const constantObj = grammarJson.repository.constants.patterns.find(
    (p) => p.name === "constant.language.d7basic",
  );
  if (constantObj) {
    constantObj.match = constantPattern;
    updatedCount++;
  } else {
    console.warn("Could not find constant.language.d7basic pattern in grammar.");
  }
} else {
  console.error("Could not find repository.constants.patterns inside the grammar JSON.");
  process.exit(1);
}

if (updatedCount > 0) {
  fs.writeFileSync(grammarPath, JSON.stringify(grammarJson, null, 2), "utf8");
  console.log(
    `Successfully updated ${updatedCount} patterns in grammar from keywords.ts definition!`,
  );
} else {
  console.error("No patterns were updated in the grammar JSON.");
  process.exit(1);
}
