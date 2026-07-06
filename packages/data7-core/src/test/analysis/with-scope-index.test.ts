import { describe, test } from "node:test";
import * as assert from "node:assert/strict";
import { getOrBuildWithScopeIndex } from "../../analysis/with-scope-index";
import { LanguageProcessor } from "../../analysis/language-processor";

describe("WithScopeIndex", () => {
  test("resolves innermost With target for nested blocks", () => {
    const code = `Namespace mod_nested_with
   Class Demo
      Sub Run()
         With New Collections.StringList()
            With New Collections.TStringList()
               Dim x As String = .Text
            End With
            Dim y As String = .Text
         End With
      End Sub
   End Class
End Namespace`;

    const uri = "file:///nested_with.bas";
    const unit = LanguageProcessor.getInstance().getOrParse(uri, code).unit;
    const index = getOrBuildWithScopeIndex(unit);

    const innerLine = code.split(/\r?\n/).findIndex((line) => line.includes("Dim x As String")) + 1;
    const outerLine = code.split(/\r?\n/).findIndex((line) => line.includes("Dim y As String")) + 1;
    assert.ok(innerLine > 0 && outerLine > 0);

    const innerTarget = index.getInnermostTarget(innerLine);
    const outerTarget = index.getInnermostTarget(outerLine);
    assert.equal(innerTarget?.kind, "ObjectCreationExpression");
    assert.equal(outerTarget?.kind, "ObjectCreationExpression");
    assert.notEqual(innerTarget, outerTarget);
  });
});
