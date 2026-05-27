#!/usr/bin/env node
/* eslint-disable */
/**
 * Audits SYSTEM_SYMBOLS and prints actionable lists of issues:
 *
 *   1. Symbols missing or with stub `description`.
 *   2. Properties starting with `On` whose type is `Variant`
 *      (should be a delegate like `TNotifyEvent`).
 *      → Symbols marked `isUnsupported: true` are skipped: when the underlying
 *        TMS/DevExpress event is not translated by the Data7 compiler we keep
 *        `type: 'Variant'` honestly instead of fabricating a fake delegate
 *        signature just to silence the audit.
 *   3. Classes with `inheritsFrom` pointing to an unknown type.
 *   4. Container references (`type`) pointing to unknown symbols.
 *
 * Informational sections (do not fail the exit code):
 *
 *   A. Count of `isUnsupported: true` members per container.
 *   B. References to those members from `.bas` files in the workspace.
 *
 * Usage:
 *   npm run compile && node scripts/audit-system-library.js
 *   node scripts/audit-system-library.js --workspace-scan=<dir>   (override scan root)
 *
 * Exit code is non-zero only when issues are found (sections 1-4); informational
 * sections never fail the audit, so this script can still gate CI.
 */
const path = require("path");
const fs = require("fs");
const { SYSTEM_SYMBOLS } = require(path.join("..", "out", "system-library"));
const { PRIMITIVE_TYPES } = require(path.join("..", "out", "utils", "primitive-types"));

// `PRIMITIVE_TYPES` is keyed by lower-case names; normalise inputs before lookup.
function isPrimitive(name) {
  return PRIMITIVE_TYPES.has(String(name).toLowerCase());
}

const knownNames = new Set();
const knownQualified = new Set();
for (const s of SYSTEM_SYMBOLS) {
  if (
    s.kind === "class" ||
    s.kind === "structure" ||
    s.kind === "namespace" ||
    s.kind === "delegate"
  ) {
    knownNames.add(s.name);
    if (s.containerName) knownQualified.add(`${s.containerName}.${s.name}`);
  }
}

function isKnownType(t) {
  if (!t || isPrimitive(t)) return true;
  // Strip generic wrappers (`List<X>`) when they appear.
  const base = t.replace(/<.*$/, "").trim();
  if (isPrimitive(base)) return true;
  if (knownQualified.has(base)) return true;
  // Allow qualified names like `Collections.TStrings` if either part is known.
  const tail = base.includes(".") ? base.split(".").pop() : base;
  return knownNames.has(base) || knownNames.has(tail);
}

function isStubDescription(s) {
  if (!s) return true;
  const trimmed = s.trim();
  if (trimmed.length < 25) return true;
  if (/^TODO|^FIXME|^Stub/i.test(trimmed)) return true;
  return false;
}

// -----------------------------------------------------------------------------
// 1. Missing/stub descriptions
// -----------------------------------------------------------------------------
const stubs = SYSTEM_SYMBOLS.filter(
  (s) =>
    (s.kind === "class" ||
      s.kind === "structure" ||
      s.kind === "namespace" ||
      s.kind === "delegate") &&
    isStubDescription(s.description),
).sort(
  (a, b) =>
    (a.containerName ?? "").localeCompare(b.containerName ?? "") || a.name.localeCompare(b.name),
);

// -----------------------------------------------------------------------------
// 2. Untyped `OnXxx` events (skipping unsupported members)
// -----------------------------------------------------------------------------
const untypedEvents = SYSTEM_SYMBOLS.filter(
  (s) =>
    s.kind === "property" && !s.isUnsupported && /^On[A-Z]/.test(s.name) && s.type === "Variant",
).sort(
  (a, b) =>
    (a.containerName ?? "").localeCompare(b.containerName ?? "") || a.name.localeCompare(b.name),
);

// -----------------------------------------------------------------------------
// 3. Classes whose `inheritsFrom` points to an unknown ancestor
// -----------------------------------------------------------------------------
const orphanInheritance = SYSTEM_SYMBOLS.filter(
  (s) => s.kind === "class" && s.inheritsFrom && !isKnownType(s.inheritsFrom),
).sort((a, b) => a.name.localeCompare(b.name));

// -----------------------------------------------------------------------------
// 4. Members with type pointing to unknown symbol (skip primitives)
// -----------------------------------------------------------------------------
const unknownTypes = SYSTEM_SYMBOLS.filter(
  (s) =>
    (s.kind === "property" || s.kind === "method" || s.kind === "indexed-property") &&
    s.type &&
    !isKnownType(s.type),
).sort(
  (a, b) =>
    (a.containerName ?? "").localeCompare(b.containerName ?? "") || a.name.localeCompare(b.name),
);

// -----------------------------------------------------------------------------
// A. isUnsupported counts per container (informational)
// -----------------------------------------------------------------------------
const unsupportedByContainer = new Map();
const unsupportedNamesByContainer = new Map();
for (const s of SYSTEM_SYMBOLS) {
  if (!s.isUnsupported) continue;
  const key = s.containerName ?? "(global)";
  unsupportedByContainer.set(key, (unsupportedByContainer.get(key) ?? 0) + 1);
  if (!unsupportedNamesByContainer.has(key)) unsupportedNamesByContainer.set(key, new Set());
  unsupportedNamesByContainer.get(key).add(s.name);
}

// -----------------------------------------------------------------------------
// B. Workspace usage of unsupported members (informational)
// -----------------------------------------------------------------------------
function getScanRoot() {
  const flagged = process.argv.find((a) => a.startsWith("--workspace-scan="));
  if (flagged) return flagged.split("=")[1];
  // Default: scan the parent directory's `src/` if present, otherwise no scan.
  const candidates = [path.resolve(__dirname, "..", "src"), path.resolve(process.cwd(), "src")];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function findBasFiles(root, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      // Skip node_modules / out / .git for performance.
      if (e.name === "node_modules" || e.name === "out" || e.name === ".git") continue;
      findBasFiles(full, acc);
    } else if (e.isFile() && /\.(bas|d7b)$/i.test(e.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const unsupportedUsages = []; // { file, line, member, container }
const scanRoot = getScanRoot();
if (scanRoot && unsupportedNamesByContainer.size > 0) {
  const allUnsupportedNames = new Set();
  for (const names of unsupportedNamesByContainer.values()) {
    for (const n of names) allUnsupportedNames.add(n);
  }

  const basFiles = findBasFiles(scanRoot);
  for (const file of basFiles) {
    let text;
    try {
      text = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      // Strip basic comments before matching.
      const cleaned = line.replace(/'.*$/, "").replace(/\bREM\b.*$/i, "");
      // Match `.MemberName` accesses on each line.
      const memberAccessRegex = /\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
      let m;
      while ((m = memberAccessRegex.exec(cleaned)) !== null) {
        const name = m[1];
        if (allUnsupportedNames.has(name)) {
          unsupportedUsages.push({
            file: path.relative(scanRoot, file).replace(/\\/g, "/"),
            line: idx + 1,
            member: name,
          });
        }
      }
    });
  }
}

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------
function header(title, count) {
  console.log(`\n=== ${title} (${count}) ===`);
}

function printRow(s, extra = "") {
  const ctx = s.containerName ? `${s.containerName}.` : "";
  console.log(`  ${ctx}${s.name}${extra ? `  → ${extra}` : ""}`);
}

const totalIssues =
  stubs.length + untypedEvents.length + orphanInheritance.length + unknownTypes.length;

if (totalIssues === 0) {
  console.log("System Library: nenhum problema detectado.");
} else {
  console.log(`System Library audit — ${totalIssues} item(s) precisam de atenção.`);

  if (stubs.length > 0) {
    header("Classes/tipos sem description ou com description-stub", stubs.length);
    stubs.forEach((s) =>
      printRow(s, s.description ? `"${s.description.slice(0, 60)}"` : "(vazia)"),
    );
  }

  if (untypedEvents.length > 0) {
    header("Eventos OnXxx ainda com type=Variant (deveriam ser delegate)", untypedEvents.length);
    untypedEvents.forEach((s) => printRow(s, "Variant"));
  }

  if (orphanInheritance.length > 0) {
    header("inheritsFrom apontando para tipo não declarado", orphanInheritance.length);
    orphanInheritance.forEach((s) => printRow(s, `inheritsFrom=${s.inheritsFrom}`));
  }

  if (unknownTypes.length > 0) {
    header("type apontando para símbolo não declarado", unknownTypes.length);
    unknownTypes.forEach((s) => printRow(s, `type=${s.type}`));
  }
}

// Informational — never fail the audit.
const totalUnsupported = Array.from(unsupportedByContainer.values()).reduce((a, b) => a + b, 0);
if (totalUnsupported > 0) {
  header(
    `Membros marcados como isUnsupported (informativo) — total ${totalUnsupported}`,
    unsupportedByContainer.size,
  );
  const sortedContainers = Array.from(unsupportedByContainer.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  for (const [container, count] of sortedContainers) {
    console.log(`  ${container.padEnd(40)} ${count}`);
  }
}

if (unsupportedUsages.length > 0) {
  header(
    `Usos de unsupported-member detectados em arquivos .bas (informativo)`,
    unsupportedUsages.length,
  );
  // Sort by file, then line.
  unsupportedUsages.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  // Group consecutive same-file entries for readability.
  let lastFile = "";
  for (const u of unsupportedUsages) {
    if (u.file !== lastFile) {
      console.log(`  ${u.file}`);
      lastFile = u.file;
    }
    console.log(`    L${u.line}: .${u.member}`);
  }
} else if (scanRoot) {
  console.log(
    `\nWorkspace scan em ${path.relative(process.cwd(), scanRoot) || scanRoot}: nenhum uso de unsupported-member detectado.`,
  );
}

process.exit(totalIssues === 0 ? 0 : 1);
