import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as vscode from "../platform/vscode-api";
import { SemanticLintCache } from "../analysis/semantic-lint-cache";
import { WorkspaceDependencyGraph } from "../analysis/workspace-dependency-graph";
import type { FileSymbols } from "../analysis/symbol-indexer";

function fileSymbols(
  fileUri: string,
  namespace: string,
  imports: readonly string[] = [],
): FileSymbols {
  return {
    fileUri,
    filePath: fileUri,
    content: "",
    imports: [...imports],
    symbols: [
      {
        name: namespace,
        kind: "namespace",
        type: "Namespace",
        isShared: true,
        isPrivate: false,
        range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
        fileUri,
      },
    ],
  };
}

describe("SemanticLintCache", () => {
  test("should return cached diagnostics when fingerprint matches", () => {
    SemanticLintCache.resetForTests();
    const cache = SemanticLintCache.getInstance();
    const diag = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      "test",
      vscode.DiagnosticSeverity.Error,
    );
    cache.set("host", "file:///a.bas", "fp-1", [diag]);
    const hit = cache.get("host", "file:///a.bas", "fp-1");
    assert.ok(hit);
    assert.equal(hit.length, 1);
    assert.equal(cache.get("host", "file:///a.bas", "fp-2"), undefined);
  });

  test("should invalidate dependents via dependency graph", () => {
    SemanticLintCache.resetForTests();
    const graph = new WorkspaceDependencyGraph();
    graph.registerFile(fileSymbols("file:///a.bas", "ModA"));
    graph.registerFile(fileSymbols("file:///b.bas", "ModB", ["ModA"]));

    const cache = SemanticLintCache.getInstance();
    const diag = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      "test",
      vscode.DiagnosticSeverity.Error,
    );
    cache.set("host", "file:///a.bas", "fp-a", [diag]);
    cache.set("host", "file:///b.bas", "fp-b", [diag]);

    cache.invalidateDependents("host", "file:///a.bas", graph);
    assert.equal(cache.get("host", "file:///a.bas", "fp-a")?.length, 1);
    assert.equal(cache.get("host", "file:///b.bas", "fp-b"), undefined);
  });
});
