import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { D7BasicFoldingRangeProvider } from "../../providers/folding-provider";
import { createMockDoc, foldingContext, noopToken } from "../_helpers/mock-doc";

type FoldArr = { start: number; end: number; kind?: number }[];

describe("D7BasicFoldingRangeProvider", () => {
  describe("provideFoldingRanges", () => {
    test("folds Namespace, Class, Sub, Function, If, For", async () => {
      const text = `Namespace mod_z
   Class Demo
      Public Sub A()
         Dim x As Integer
         For i = 1 To 10
            x = x + 1
         Next
      End Sub
      Public Function B() As Integer
         If x > 0 Then
            Return 1
         End If
         Return 0
      End Function
   End Class
End Namespace`;
      const provider = new D7BasicFoldingRangeProvider();
      const ranges = (await Promise.resolve(
        provider.provideFoldingRanges(
          createMockDoc("file:///fold.bas", text),
          foldingContext(),
          noopToken,
        ),
      )) as FoldArr;

      assert.ok(Array.isArray(ranges));
      assert.ok(ranges.length >= 5, `expected ≥ 5 folds, got ${ranges.length}`);
      assert.ok(
        ranges.some((r) => r.start === 0),
        "must emit a fold for the top-level Namespace (line 0)",
      );
    });

    test("emits a single Imports fold spanning contiguous Imports lines", async () => {
      const text = `Imports Forms
Imports SQL
Imports IO

Namespace mod_w
End Namespace`;
      const provider = new D7BasicFoldingRangeProvider();
      const ranges = (await Promise.resolve(
        provider.provideFoldingRanges(
          createMockDoc("file:///imp.bas", text),
          foldingContext(),
          noopToken,
        ),
      )) as FoldArr;

      const importsFold = ranges.find((r) => r.kind === vscode.FoldingRangeKind.Imports);
      assert.ok(importsFold);
      assert.equal(importsFold.start, 0);
      assert.equal(importsFold.end, 2);
    });

    test("folds #Region blocks with the Region kind", async () => {
      const text = `#Region "Helpers"
Sub helper1()
End Sub
Sub helper2()
End Sub
#End Region`;
      const provider = new D7BasicFoldingRangeProvider();
      const ranges = (await Promise.resolve(
        provider.provideFoldingRanges(
          createMockDoc("file:///reg.bas", text),
          foldingContext(),
          noopToken,
        ),
      )) as FoldArr;

      const regionFold = ranges.find((r) => r.kind === vscode.FoldingRangeKind.Region);
      assert.ok(regionFold);
      assert.equal(regionFold.start, 0);
      assert.equal(regionFold.end, 5);
    });
  });
});
