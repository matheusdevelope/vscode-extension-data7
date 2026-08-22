import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { assertTranspiledNativeSyntax } from "../../project/validate-native-syntax";

describe("assertTranspiledNativeSyntax", () => {
  test("accepts parseable native Data7 Basic", () => {
    assert.doesNotThrow(() =>
      assertTranspiledNativeSyntax([
        {
          fileUri: "file:///mod_ok.bas",
          code: "Namespace ns\n  Class Foo\n    Public Sub Run()\n    End Sub\n  End Class\nEnd Namespace\n",
        },
      ]),
    );
  });

  test("does not walk semantics — unknown members are not a build abort", () => {
    assert.doesNotThrow(() =>
      assertTranspiledNativeSyntax([
        {
          fileUri: "file:///mod_unknown.bas",
          code: "Namespace ns\n  Sub Main()\n    missing.Nope()\n  End Sub\nEnd Namespace\n",
        },
      ]),
    );
  });

  test("aborts when transpiled output is not native-parseable", () => {
    assert.throws(
      () =>
        assertTranspiledNativeSyntax([
          {
            fileUri: "file:///mod_broken.bas",
            code: "Namespace ns\n  Class Foo\n    Public Sub Run(\n",
          },
        ]),
      /sintaxe nativa em mod_broken\.bas/,
    );
  });
});
