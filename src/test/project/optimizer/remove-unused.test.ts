import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { removeUnusedDeclarations } from "../../../project/optimizer";

describe("removeUnusedDeclarations", () => {
  test("removes unreachable classes and members across modules", () => {
    const result = removeUnusedDeclarations([
      {
        moduleName: "Principal",
        fileUri: "file:///workspace/src/Principal.bas",
        code: `Namespace app
   Class Program
      Public Sub Main()
         Dim helper As THelper = New THelper()
         helper.Touch()
      End Sub

      Public Sub DeadPrincipal()
      End Sub
   End Class
End Namespace`,
      },
      {
        moduleName: "mod_helper",
        fileUri: "file:///workspace/src/mod_helper.bas",
        code: `Namespace mod_helper
   Class THelper
      Public Sub New()
      End Sub

      Public Sub Touch()
         UsedFunction()
      End Sub

      Public Sub DeadMethod()
      End Sub
   End Class

   Class DeadClass
   End Class

   Function UsedFunction() As Integer
      UsedFunction = 1
   End Function

   Function DeadFunction() As Integer
      DeadFunction = 2
   End Function
End Namespace`,
      },
    ]);

    const principal = result.modules.get("Principal") ?? "";
    const helper = result.modules.get("mod_helper") ?? "";

    assert.match(principal, /Sub Main/);
    assert.doesNotMatch(principal, /DeadPrincipal/);
    assert.match(helper, /Class THelper/);
    assert.match(helper, /Sub New/);
    assert.match(helper, /Sub Touch/);
    assert.match(helper, /Function UsedFunction/);
    assert.doesNotMatch(helper, /DeadMethod/);
    assert.doesNotMatch(helper, /DeadClass/);
    assert.doesNotMatch(helper, /DeadFunction/);
  });

  test("falls back to original code when any module cannot be parsed safely", () => {
    const broken = `Namespace app
   Class Broken
`;
    const result = removeUnusedDeclarations([
      {
        moduleName: "Principal",
        fileUri: "file:///workspace/src/Principal.bas",
        code: broken,
      },
    ]);

    assert.equal(result.modules.get("Principal"), broken);
  });
});
