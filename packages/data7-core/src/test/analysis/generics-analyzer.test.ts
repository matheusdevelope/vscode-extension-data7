import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  collectGenericsContext,
  collectGenericsContextFromUnit,
} from "../../analysis/generics-analyzer";
import { parseBasic, GenericsParserPlugin } from "../../project/parser";
import { SugarEngine } from "../../project/sugars";

describe("collectGenericsContextFromUnit", () => {
  test("matches collectGenericsContext without a second parse of the source", () => {
    const code = [
      "Namespace ns_box",
      "  Class Box<T>",
      "    Value As T",
      "  End Class",
      "  Sub Main()",
      "    Dim x As Box<Integer>",
      "  End Sub",
      "End Namespace",
      "",
    ].join("\n");

    const fromCode = collectGenericsContext(code);
    const sugarEngine = new SugarEngine();
    const { unit } = parseBasic(code, {
      plugins: [...sugarEngine.createParserPlugins(), new GenericsParserPlugin()],
    });
    const fromUnit = collectGenericsContextFromUnit(unit, code.split(/\r?\n/));

    assert.deepEqual([...fromUnit.templates.keys()].sort(), [...fromCode.templates.keys()].sort());
    assert.equal(fromUnit.usages.length, fromCode.usages.length);
    assert.deepEqual(
      fromUnit.warnings.map((warning) => warning.code),
      fromCode.warnings.map((warning) => warning.code),
    );
  });
});
