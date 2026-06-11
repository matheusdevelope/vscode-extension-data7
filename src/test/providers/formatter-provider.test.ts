import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { CodeFormatter } from "../../providers/formatter-provider";

describe("CodeFormatter", () => {
  describe("formatKeywordsInLine", () => {
    test("capitalises the leading keyword while preserving identifier casing", () => {
      assert.equal(CodeFormatter.formatKeywordsInLine("namespace my_app"), "Namespace my_app");
      assert.equal(CodeFormatter.formatKeywordsInLine("public sub run()"), "Public Sub run()");
      assert.equal(CodeFormatter.formatKeywordsInLine("dim a as string"), "Dim a As string");
    });
  });

  describe("formatCode", () => {
    test("produces 4-space nested indentation by default", () => {
      const code = `Namespace my_app
Class TTest
Public Sub Run()
Dim a As String
End Sub
End Class
End Namespace`;
      const formatted = CodeFormatter.formatCode(code);
      assert.ok(formatted.includes("    Class TTest"));
      assert.ok(formatted.includes("        Public Sub Run()"));
      assert.ok(formatted.includes("            Dim a As String"));
    });

    test("uses tabs when VS Code requests tab indentation", () => {
      const code = `Namespace my_app
Class TTest
Sub Run()
Dim a As String
End Sub
End Class
End Namespace`;
      const formatted = CodeFormatter.formatCode(code, { insertSpaces: false, tabSize: 4 });
      assert.ok(formatted.includes("\tClass TTest"));
      assert.ok(formatted.includes("\t\tSub Run()"));
      assert.ok(formatted.includes("\t\t\tDim a As String"));
    });

    test("indents overridden functions and With blocks", () => {
      const code = `Namespace my_app
Class TTest
Overrides Function ToString() As String
With me.BuildLogger(me.Classname)
.Prop("Name", me.Name)
ToString = .Text
End With
End Function
End Class
End Namespace`;
      const formatted = CodeFormatter.formatCode(code);
      assert.ok(formatted.includes("        Overrides Function ToString() As String"));
      assert.ok(formatted.includes("            With me.BuildLogger(me.Classname)"));
      assert.ok(formatted.includes('                .Prop("Name", me.Name)'));
      assert.ok(formatted.includes("            End With"));
      assert.ok(formatted.includes("        End Function"));
    });

    test("indents Select Case branches and branch bodies", () => {
      const code = `Select Case value
Case 1
Return "one"
Case Else
Return "other"
End Select`;
      const formatted = CodeFormatter.formatCode(code);
      assert.equal(
        formatted,
        `Select Case value
    Case 1
        Return "one"
    Case Else
        Return "other"
End Select`,
      );
    });

    test("preserves apostrophes inside strings while detecting real comments", () => {
      const code = `Sub Run()
Dim text As String = "don't indent this as a comment"
If ok Then ' comment
Return text
End If
End Sub`;
      const formatted = CodeFormatter.formatCode(code);
      assert.ok(formatted.includes('    Dim text As String = "don\'t indent this as a comment"'));
      assert.ok(formatted.includes("    If ok Then ' comment"));
      assert.ok(formatted.includes("        Return text"));
    });
  });
});
