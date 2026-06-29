#!/usr/bin/env node
"use strict";

const path = require("node:path");
const ts = require("typescript");

const workspaceRoot = path.resolve(__dirname, "..");
const workspaces = [
  {
    label: "@data7/core",
    configPath: path.join(workspaceRoot, "packages", "data7-core", "tsconfig.json"),
  },
  {
    label: "vscode-extension-data7",
    configPath: path.join(workspaceRoot, "packages", "data7-vscode", "tsconfig.json"),
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
    console.log("[watch] all workspaces ready");
  }
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
  for (const watchProgram of watchPrograms) {
    watchProgram.close();
  }

  process.exit(exitCode);
}
