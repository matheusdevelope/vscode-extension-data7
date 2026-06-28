const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "packages", "data7-vscode");
const coreRoot = path.join(repoRoot, "packages", "data7-core");

const copies = [
  [path.join(repoRoot, "LICENSE"), path.join(extensionRoot, "LICENSE")],
  [path.join(repoRoot, "README.md"), path.join(extensionRoot, "README.md")],
  [path.join(repoRoot, "CHANGELOG.md"), path.join(extensionRoot, "CHANGELOG.md")],
  [path.join(repoRoot, "docs"), path.join(extensionRoot, "docs")],
  [path.join(coreRoot, "core_modules"), path.join(extensionRoot, "core_modules")],
  [
    path.join(coreRoot, "dist", "mcp", "server.bundled.js"),
    path.join(extensionRoot, "out", "mcp", "server.bundled.js"),
  ],
];

const optionalCopies = [
  [
    path.join(coreRoot, "dist", "mcp", "data"),
    path.join(extensionRoot, "out", "mcp", "data"),
  ],
];

for (const [source, target] of copies) {
  copyRequired(source, target);
}

for (const [source, target] of optionalCopies) {
  if (fs.existsSync(source)) {
    copy(source, target);
  }
}

function copyRequired(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`Required packaging asset not found: ${source}`);
  }
  copy(source, target);
}

function copy(source, target) {
  assertInside(extensionRoot, target);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  console.log(`[prepare-vscode-package] ${path.relative(repoRoot, source)} -> ${path.relative(repoRoot, target)}`);
}

function assertInside(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside extension package: ${target}`);
  }
}
