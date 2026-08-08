#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const workspaceRoot = path.resolve(__dirname, "..");
const vscodePackageRoot = path.join(workspaceRoot, "packages", "data7-vscode");
const corePackageRoot = path.join(workspaceRoot, "packages", "data7-core");

const workspaces = [
  {
    label: "@data7/core",
    configPath: path.join(corePackageRoot, "tsconfig.json"),
  },
  {
    label: "vscode-extension-data7",
    configPath: path.join(vscodePackageRoot, "tsconfig.json"),
  },
  {
    label: "@data7/cli",
    configPath: path.join(workspaceRoot, "packages", "data7-cli", "tsconfig.json"),
  },
];

const statusByWorkspace = new Map(workspaces.map((workspace) => [workspace.label, false]));
const watchPrograms = [];
let shuttingDown = false;
let readyPrinted = false;

/** @type {{ extension: boolean; lintWorker: boolean; mcp: boolean }} */
let pendingBundles = { extension: false, lintWorker: false, mcp: false };
let bundleTimer = undefined;
let bundling = false;
let bundleAgain = false;
const BUNDLE_DEBOUNCE_MS = 400;

const formatHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => workspaceRoot,
  getNewLine: () => ts.sys.newLine,
};

console.log("[watch] starting workspace watchers");

for (const workspace of workspaces) {
  const host = ts.createWatchCompilerHost(
    workspace.configPath,
    {
      preserveWatchOutput: true,
      pretty: false,
    },
    ts.sys,
    ts.createSemanticDiagnosticsBuilderProgram,
    (diagnostic) => reportDiagnostic(workspace.label, diagnostic),
    (diagnostic) => reportWatchStatus(workspace.label, diagnostic),
  );

  const originalAfterProgramCreate = host.afterProgramCreate;
  host.afterProgramCreate = (builderProgram) => {
    originalAfterProgramCreate?.(builderProgram);
    maybeScheduleExtensionBundles(workspace.label, builderProgram);
  };

  watchPrograms.push(ts.createWatchProgram(host));
}

process.on("SIGINT", () => stopAll(130));
process.on("SIGTERM", () => stopAll(143));

function reportDiagnostic(label, diagnostic) {
  writePrefixed(label, ts.formatDiagnostic(diagnostic, formatHost));
}

function reportWatchStatus(label, diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine);
  writePrefixed(label, message);

  if (message.includes("Watching for file changes")) {
    statusByWorkspace.set(label, true);
    printReadyWhenAllWorkspacesAreWatching();
  }
}

function printReadyWhenAllWorkspacesAreWatching() {
  if (readyPrinted) {
    return;
  }

  if ([...statusByWorkspace.values()].every(Boolean)) {
    readyPrinted = true;
    // Exact string required by .vscode/tasks.json problemMatcher endsPattern (F5 preLaunchTask).
    console.log("[watch] all workspaces ready");
    console.log(
      "[watch] extension.js / lint-worker.js will rebundle after clean core/vscode compiles",
    );
  }
}

function allWorkspacesWatching() {
  return [...statusByWorkspace.values()].every(Boolean);
}

/**
 * Extension Host loads esbuild bundles (`out/extension.js`, `out/lint-worker.js`),
 * not tsc emit. Rebuild them after a clean core/vscode compile so F5 stays current.
 */
function maybeScheduleExtensionBundles(label, builderProgram) {
  if (label !== "@data7/core" && label !== "vscode-extension-data7") {
    return;
  }
  if (!allWorkspacesWatching()) {
    return;
  }

  const program = builderProgram.getProgram();
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const hasError = diagnostics.some(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (hasError) {
    return;
  }

  if (label === "@data7/core") {
    scheduleBundles({ extension: true, lintWorker: true, mcp: true });
    return;
  }

  scheduleBundles({ extension: true, lintWorker: false, mcp: false });
}

/**
 * @param {{ extension?: boolean; lintWorker?: boolean; mcp?: boolean }} flags
 */
function scheduleBundles(flags) {
  pendingBundles = {
    extension: pendingBundles.extension || flags.extension === true,
    lintWorker: pendingBundles.lintWorker || flags.lintWorker === true,
    mcp: pendingBundles.mcp || flags.mcp === true,
  };

  if (bundleTimer !== undefined) {
    clearTimeout(bundleTimer);
  }
  bundleTimer = setTimeout(() => {
    bundleTimer = undefined;
    void runPendingBundles();
  }, BUNDLE_DEBOUNCE_MS);
}

async function runPendingBundles() {
  if (bundling) {
    bundleAgain = true;
    return;
  }

  const job = pendingBundles;
  pendingBundles = { extension: false, lintWorker: false, mcp: false };
  if (!job.extension && !job.lintWorker && !job.mcp) {
    return;
  }

  bundling = true;
  const started = Date.now();
  try {
    const esbuild = loadEsbuild();
    /** @type {string[]} */
    const updated = [];

    if (job.mcp) {
      const mcpEntry = path.join(corePackageRoot, "dist", "mcp", "server.js");
      const mcpOut = path.join(corePackageRoot, "dist", "mcp", "server.bundled.js");
      const mcpStaging = path.join(vscodePackageRoot, "out", "mcp", "server.bundled.js");
      if (!fs.existsSync(mcpEntry)) {
        throw new Error(`MCP entry missing: ${mcpEntry}`);
      }
      await esbuild.build({
        entryPoints: [mcpEntry],
        bundle: true,
        platform: "node",
        target: "node22",
        outfile: mcpOut,
        logLevel: "silent",
      });
      fs.mkdirSync(path.dirname(mcpStaging), { recursive: true });
      fs.copyFileSync(mcpOut, mcpStaging);
      updated.push("mcp/server.bundled.js");
    }

    if (job.lintWorker) {
      const workerEntry = path.join(corePackageRoot, "dist", "analysis", "lint-worker.js");
      if (!fs.existsSync(workerEntry)) {
        throw new Error(`lint-worker entry missing: ${workerEntry}`);
      }
      await esbuild.build({
        entryPoints: [workerEntry],
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "node20",
        outfile: path.join(vscodePackageRoot, "out", "lint-worker.js"),
        logLevel: "silent",
      });
      updated.push("lint-worker.js");
    }

    if (job.extension) {
      const extensionEntry = path.join(vscodePackageRoot, "src", "extension.ts");
      await esbuild.build({
        entryPoints: [extensionEntry],
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "node20",
        external: ["vscode"],
        outfile: path.join(vscodePackageRoot, "out", "extension.js"),
        logLevel: "silent",
      });
      updated.push("extension.js");
    }

    console.log(
      `[watch] rebundled ${updated.join(", ")} in ${Date.now() - started}ms (reload Extension Host to pick up)`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[watch] extension bundle failed: ${message}`);
  } finally {
    bundling = false;
    if (
      bundleAgain ||
      pendingBundles.extension ||
      pendingBundles.lintWorker ||
      pendingBundles.mcp
    ) {
      bundleAgain = false;
      scheduleBundles(pendingBundles);
    }
  }
}

function loadEsbuild() {
  const resolved = require.resolve("esbuild", { paths: [corePackageRoot, vscodePackageRoot] });
  return require(resolved);
}

function writePrefixed(label, text) {
  for (const line of text.trimEnd().split(/\r?\n/)) {
    if (line.length > 0) {
      console.log(`[${label}] ${line}`);
    }
  }
}

function stopAll(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  if (bundleTimer !== undefined) {
    clearTimeout(bundleTimer);
    bundleTimer = undefined;
  }
  for (const watchProgram of watchPrograms) {
    watchProgram.close();
  }

  process.exit(exitCode);
}
