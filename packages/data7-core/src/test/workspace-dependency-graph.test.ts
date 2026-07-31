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

  describe("multiple declarers per namespace", () => {
    test("keeps every file that declares the same namespace", () => {
      const graph = new WorkspaceDependencyGraph();
      graph.registerFile(fileSymbols("file:///part1.bas", "ModShared"));
      graph.registerFile(fileSymbols("file:///part2.bas", "ModShared"));

      assert.deepEqual(graph.getDeclaringFileUris("ModShared"), [
        "file:///part1.bas",
        "file:///part2.bas",
      ]);
    });

    test("propagates to co-declarers of a shared namespace", () => {
      const graph = new WorkspaceDependencyGraph();
      graph.registerFile(fileSymbols("file:///part1.bas", "ModShared"));
      graph.registerFile(fileSymbols("file:///part2.bas", "ModShared"));

      const dependents = graph.getDependentFileUris("file:///part1.bas");
      assert.deepEqual(dependents, ["file:///part2.bas"]);
    });

    test("unregistering one declarer leaves the others addressable", () => {
      const graph = new WorkspaceDependencyGraph();
      graph.registerFile(fileSymbols("file:///part1.bas", "ModShared"));
      graph.registerFile(fileSymbols("file:///part2.bas", "ModShared"));

      graph.unregisterFile("file:///part2.bas");

      assert.deepEqual(graph.getDeclaringFileUris("ModShared"), ["file:///part1.bas"]);
    });
  });

  describe("getTransitiveDependents", () => {
    test("reaches indirect importers through the closure", () => {
      const graph = new WorkspaceDependencyGraph();
      graph.registerFile(fileSymbols("file:///a.bas", "ModA"));
      graph.registerFile(fileSymbols("file:///b.bas", "ModB", ["ModA"]));
      graph.registerFile(fileSymbols("file:///c.bas", "ModC", ["ModB"]));
      graph.registerFile(fileSymbols("file:///d.bas", "ModD", ["ModC"]));

      const dependents = [...graph.getTransitiveDependents("file:///a.bas")].sort();
      assert.deepEqual(dependents, ["file:///b.bas", "file:///c.bas", "file:///d.bas"]);
    });

    test("terminates on import cycles without repeating files", () => {
      const graph = new WorkspaceDependencyGraph();
      graph.registerFile(fileSymbols("file:///a.bas", "ModA", ["ModC"]));
      graph.registerFile(fileSymbols("file:///b.bas", "ModB", ["ModA"]));
      graph.registerFile(fileSymbols("file:///c.bas", "ModC", ["ModB"]));

      const dependents = [...graph.getTransitiveDependents("file:///a.bas")].sort();
      assert.deepEqual(dependents, ["file:///b.bas", "file:///c.bas"]);
    });

    test("never includes the trigger file", () => {
      const graph = new WorkspaceDependencyGraph();
      graph.registerFile(fileSymbols("file:///a.bas", "ModA", ["ModB"]));
      graph.registerFile(fileSymbols("file:///b.bas", "ModB", ["ModA"]));

      const dependents = graph.getTransitiveDependents("file:///a.bas");
      assert.deepEqual(dependents, ["file:///b.bas"]);
    });

    test("honors the depth cap", () => {
      const graph = new WorkspaceDependencyGraph();
      graph.registerFile(fileSymbols("file:///a.bas", "ModA"));
      graph.registerFile(fileSymbols("file:///b.bas", "ModB", ["ModA"]));
      graph.registerFile(fileSymbols("file:///c.bas", "ModC", ["ModB"]));

      const dependents = graph.getTransitiveDependents("file:///a.bas", { maxDepth: 1 });
      assert.deepEqual(dependents, ["file:///b.bas"]);
    });
  });
});
