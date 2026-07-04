import { describe, test } from "node:test";
import assert from "node:assert/strict";
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

describe("WorkspaceDependencyGraph", () => {
  test("should return only direct importers of changed namespaces", () => {
    const graph = new WorkspaceDependencyGraph();
    graph.registerFile(fileSymbols("file:///a.bas", "ModA"));
    graph.registerFile(fileSymbols("file:///b.bas", "ModB", ["ModA"]));
    graph.registerFile(fileSymbols("file:///c.bas", "ModC", ["ModB"]));

    const dependents = graph.getDependentFileUris("file:///a.bas");
    assert.deepEqual(dependents, ["file:///b.bas"]);
  });

  test("should not include the trigger file in dependents", () => {
    const graph = new WorkspaceDependencyGraph();
    graph.registerFile(fileSymbols("file:///a.bas", "ModA", ["ModA"]));

    const dependents = graph.getDependentFileUris("file:///a.bas");
    assert.equal(dependents.length, 0);
  });

  test("should propagate extra namespaces from namespace rename detection", () => {
    const graph = new WorkspaceDependencyGraph();
    graph.registerFile(fileSymbols("file:///a.bas", "ModA"));
    graph.registerFile(fileSymbols("file:///b.bas", "ModB", ["OldNs"]));

    const dependents = graph.getDependentFileUris("file:///a.bas", new Set(["OldNs"]));
    assert.deepEqual(dependents, ["file:///b.bas"]);
  });
});
