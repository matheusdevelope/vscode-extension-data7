import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { formatParameter, formatParameterList } from "../../utils/format-helpers";
import type { ParameterInfo } from "../../analysis/symbol-indexer";

function param(p: Partial<ParameterInfo> & { name: string }): ParameterInfo {
  return {
    name: p.name,
    type: p.type ?? "",
    isByRef: p.isByRef ?? false,
    isOptional: p.isOptional ?? false,
    defaultValue: p.defaultValue,
  };
}

describe("formatParameter", () => {
  test("renders a bare name when there is no type", () => {
    assert.equal(formatParameter(param({ name: "x" })), "x");
  });

  test('appends "As <Type>" when type is provided', () => {
    assert.equal(formatParameter(param({ name: "x", type: "Integer" })), "x As Integer");
  });

  test('prefixes "ByRef" when isByRef is true', () => {
    assert.equal(
      formatParameter(param({ name: "out", type: "Integer", isByRef: true })),
      "ByRef out As Integer",
    );
  });

  test('prefixes "Optional" when isOptional is true and no default value', () => {
    assert.equal(
      formatParameter(param({ name: "flag", type: "Boolean", isOptional: true })),
      "Optional flag As Boolean",
    );
  });

  test('does NOT prefix "Optional" when a default value implies the optional-ness', () => {
    const result = formatParameter(
      param({
        name: "flag",
        type: "Boolean",
        isOptional: true,
        defaultValue: "False",
      }),
    );
    assert.equal(result, "flag As Boolean = False");
  });

  test("preserves the order ByRef → Optional → name → type → default", () => {
    const result = formatParameter(
      param({
        name: "p",
        type: "Integer",
        isByRef: true,
        isOptional: true,
      }),
    );
    assert.equal(result, "ByRef Optional p As Integer");
  });
});

describe("formatParameterList", () => {
  test('returns "()" when there are no parameters', () => {
    assert.equal(formatParameterList(undefined), "()");
    assert.equal(formatParameterList([]), "()");
  });

  test("joins multiple parameters with a comma and space", () => {
    assert.equal(
      formatParameterList([
        param({ name: "a", type: "String" }),
        param({ name: "b", type: "Integer" }),
      ]),
      "(a As String, b As Integer)",
    );
  });
});
