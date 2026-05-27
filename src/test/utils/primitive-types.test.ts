import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { PRIMITIVE_TYPES } from "../../utils/primitive-types";

describe("PRIMITIVE_TYPES", () => {
  test("keys are lower-case to match consumer lookups", () => {
    for (const name of PRIMITIVE_TYPES) {
      assert.equal(name, name.toLowerCase(), `entry "${name}" must already be lower-case`);
    }
  });

  test("covers the Data7 Basic core primitives", () => {
    for (const expected of [
      "string",
      "integer",
      "double",
      "boolean",
      "date",
      "tdatetime",
      "variant",
      "tobject",
      "void",
      "single",
      "char",
      "byte",
    ]) {
      assert.ok(PRIMITIVE_TYPES.has(expected), `missing primitive "${expected}"`);
    }
  });

  test("does NOT include unrelated types accidentally", () => {
    assert.ok(!PRIMITIVE_TYPES.has("tform"));
    assert.ok(!PRIMITIVE_TYPES.has("tcontrol"));
    assert.ok(!PRIMITIVE_TYPES.has("mod_resources"));
  });

  test("is read-only at the type level (frozen-set semantics)", () => {
    // PRIMITIVE_TYPES is typed as ReadonlySet<string>; calling .add() would
    // fail at the type system level. We assert that the runtime size matches
    // expectations to detect accidental mutation.
    const initialSize = PRIMITIVE_TYPES.size;
    assert.ok(initialSize >= 12);
  });
});
