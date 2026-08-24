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

  test("records the enclosing generic template for nested usages", () => {
    const code = [
      "Namespace ns_matrix",
      "  Class TTMatrix<TypeRow>",
      "    Function FilterRows() As TTList<TypeRow>",
      "      Dim result[] As TypeRow = []",
      "      FilterRows = result",
      "    End Function",
      "  End Class",
      "  Class TGridRow",
      "  End Class",
      "  Class TGridData",
      "    Inherits TTMatrix<TGridRow>",
      "  End Class",
      "End Namespace",
      "",
    ].join("\n");

    const ctx = collectGenericsContext(code, {
      externalTemplates: [{ kind: "class", name: "TTList", typeParams: ["T"], line: 0 }],
    });

    const nestedListUsages = ctx.usages.filter(
      (usage) =>
        usage.templateName === "TTList" &&
        usage.typeArgs.length === 1 &&
        usage.typeArgs[0] === "TypeRow",
    );
    assert.ok(nestedListUsages.length >= 1, "expected TTList<TypeRow> usages inside TTMatrix");
    for (const usage of nestedListUsages) {
      assert.equal(usage.enclosingTemplateName, "TTMatrix");
    }

    const outer = ctx.usages.find(
      (usage) =>
        usage.templateName === "TTMatrix" &&
        usage.typeArgs.length === 1 &&
        usage.typeArgs[0] === "TGridRow",
    );
    assert.ok(outer, "expected TTMatrix<TGridRow> usage on TGridData");
    assert.equal(outer.enclosingTemplateName, undefined);
  });
});
