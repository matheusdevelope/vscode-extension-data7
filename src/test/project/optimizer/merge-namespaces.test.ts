import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { mergeDuplicateNamespaces } from "../../../project/optimizer";

describe("mergeDuplicateNamespaces", () => {
  test("merges duplicate sibling namespaces in a module", () => {
    const result = mergeDuplicateNamespaces([
      {
        moduleName: "Main",
        fileUri: "file:///Main.bas",
        code: `Namespace app
   Class A
   End Class
End Namespace

Namespace app
   Class B
   End Class
End Namespace`,
      },
    ]);

    const code = result.modules.get("Main") ?? "";
    assert.equal((code.match(/Namespace app/g) ?? []).length, 1);
    assert.match(code, /Class A/);
    assert.match(code, /Class B/);
  });

  test("keeps original code when a module cannot be parsed safely", () => {
    const code = "Namespace app\nClass A";
    const result = mergeDuplicateNamespaces([
      {
        moduleName: "Broken",
        fileUri: "file:///Broken.bas",
        code,
      },
    ]);

    assert.equal(result.modules.get("Broken"), code);
  });
});
