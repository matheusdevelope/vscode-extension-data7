import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { mapSystemKindToVsCode } from "../../utils/symbol-kind";
import type { SymbolInfo } from "../../analysis/symbol-indexer";

function sym(kind: SymbolInfo["kind"]): SymbolInfo {
  return {
    name: "X",
    kind,
    type: "",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://test",
  };
}

describe("mapSystemKindToVsCode", () => {
  test("maps each known SymbolInfo kind to a stable vscode.SymbolKind", () => {
    const cases: [SymbolInfo["kind"], number][] = [
      ["namespace", vscode.SymbolKind.Namespace],
      ["class", vscode.SymbolKind.Class],
      ["structure", vscode.SymbolKind.Struct],
      ["delegate", vscode.SymbolKind.Event],
      ["method", vscode.SymbolKind.Method],
      ["property", vscode.SymbolKind.Property],
      ["indexed-property", vscode.SymbolKind.Property],
      ["variable", vscode.SymbolKind.Variable],
      ["declare_sub", vscode.SymbolKind.Function],
      ["declare_function", vscode.SymbolKind.Function],
    ];
    for (const [kind, expected] of cases) {
      assert.equal(mapSystemKindToVsCode(sym(kind)), expected, `kind=${kind}`);
    }
  });

  test("falls back to SymbolKind.Object for unknown kinds", () => {
    const weird = { ...sym("class"), kind: "unknown" as unknown as SymbolInfo["kind"] };
    assert.equal(mapSystemKindToVsCode(weird), vscode.SymbolKind.Object);
  });
});
