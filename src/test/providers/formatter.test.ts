import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { CodeFormatter } from "../../providers/formatter";

describe("CodeFormatter", () => {
  describe("formatKeywordsInLine", () => {
    test("capitalises the leading keyword while preserving identifier casing", () => {
      assert.equal(CodeFormatter.formatKeywordsInLine("namespace my_app"), "Namespace my_app");
      assert.equal(CodeFormatter.formatKeywordsInLine("public sub run()"), "Public Sub run()");
      assert.equal(CodeFormatter.formatKeywordsInLine("dim a as string"), "Dim a As string");
    });
  });

  describe("formatCode", () => {
    test("produces 3-space nested indentation for Class > Sub > Dim", () => {
      const code = `Namespace my_app
Class TTest
Public Sub Run()
Dim a As String
End Sub
End Class
End Namespace`;
      const formatted = CodeFormatter.formatCode(code);
      assert.ok(formatted.includes("   Class TTest"));
      assert.ok(formatted.includes("      Public Sub Run()"));
      assert.ok(formatted.includes("         Dim a As String"));
    });
  });
});
