import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { parse, serializeUnit } from "../../../project/parser";
import type { CompilationUnit } from "../../../project/generics-monomorphizer/ast";

/**
 * Structural comparison helper. We don't care about `loc` (positions
 * may shift across a parse->serialize->parse cycle because the
 * serializer re-emits headers without preserving column offsets) — only
 * the semantic shape of the AST must round-trip.
 */
function shape(unit: CompilationUnit): unknown {
  return JSON.parse(
    JSON.stringify(unit, (key, value: unknown) => (key === "loc" ? undefined : value)),
  ) as unknown;
}

const FIXTURES: readonly { name: string; source: string }[] = [
  {
    name: "empty",
    source: "",
  },
  {
    name: "namespace + class",
    source: ["Namespace m_demo", "   Class Foo", "   End Class", "End Namespace"].join("\n"),
  },
  {
    name: "generic class",
    source: ["Class TList<T>", "   Public Count As Integer", "End Class"].join("\n"),
  },
  {
    name: "generic delegate",
    source: "Delegate Function Pred<T>(pValue As T) As Boolean",
  },
  {
    name: "sub with opaque body",
    source: ["Sub Add(pValue As Integer)", "   me.Count = me.Count + 1", "End Sub"].join("\n"),
  },
  {
    name: "nested generics in field type",
    source: ["Class C", "   Public x As TList<TList<Integer>>", "End Class"].join("\n"),
  },
];

describe("parser/roundtrip", () => {
  for (const fx of FIXTURES) {
    test(`parse -> serialize -> parse is stable for: ${fx.name}`, () => {
      const first = parse(fx.source);
      const text = serializeUnit(first.unit);
      const second = parse(text);
      assert.deepEqual(shape(second.unit), shape(first.unit));
    });
  }
});
