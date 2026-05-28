import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { inferLiteralType } from "../../utils/literal-type-infer";

describe("inferLiteralType", () => {
  describe("string literals", () => {
    test("infers String from a quoted literal", () => {
      assert.equal(inferLiteralType('"abc"'), "String");
    });

    test("infers String from a quoted literal with escaped quotes", () => {
      assert.equal(inferLiteralType('"a""b"'), "String");
    });

    test("infers String from an empty quoted literal", () => {
      assert.equal(inferLiteralType('""'), "String");
    });

    test("infers String from a $-interpolated literal", () => {
      assert.equal(inferLiteralType('$"olá, {nome}"'), "String");
    });
  });

  describe("numeric literals", () => {
    test("infers Integer from an unsigned decimal", () => {
      assert.equal(inferLiteralType("42"), "Integer");
    });

    test("infers Integer from a negative decimal", () => {
      assert.equal(inferLiteralType("-7"), "Integer");
    });

    test("infers Integer from a hex literal", () => {
      assert.equal(inferLiteralType("0xFF"), "Integer");
      assert.equal(inferLiteralType("0X1A2B"), "Integer");
    });

    test("infers Double from decimal point", () => {
      assert.equal(inferLiteralType("3.14"), "Double");
      assert.equal(inferLiteralType("-0.5"), "Double");
      assert.equal(inferLiteralType(".25"), "Double");
    });

    test("infers Double from scientific notation", () => {
      assert.equal(inferLiteralType("1e6"), "Double");
      assert.equal(inferLiteralType("2.5E-3"), "Double");
    });
  });

  describe("boolean and NULL", () => {
    test("infers Boolean from True/False (case-insensitive)", () => {
      assert.equal(inferLiteralType("True"), "Boolean");
      assert.equal(inferLiteralType("false"), "Boolean");
      assert.equal(inferLiteralType("TRUE"), "Boolean");
    });

    test("widens NULL to Variant", () => {
      assert.equal(inferLiteralType("NULL"), "Variant");
      assert.equal(inferLiteralType("null"), "Variant");
    });
  });

  describe("New / CType expressions", () => {
    test("infers the constructed type from New T()", () => {
      assert.equal(inferLiteralType("New StringList()"), "StringList");
      assert.equal(inferLiteralType("New TForm()"), "TForm");
    });

    test("preserves qualified names in New", () => {
      assert.equal(inferLiteralType("New Collections.StringList()"), "Collections.StringList");
    });

    test("infers the target type from CType(_, T)", () => {
      assert.equal(inferLiteralType("CType(MyBase.Take(0), CardRecord)"), "CardRecord");
      assert.equal(inferLiteralType("CType(value, Integer)"), "Integer");
    });
  });

  describe("non-literals", () => {
    test("returns undefined for bare identifiers", () => {
      assert.equal(inferLiteralType("x"), undefined);
      assert.equal(inferLiteralType("foo"), undefined);
    });

    test("returns undefined for binary expressions", () => {
      assert.equal(inferLiteralType("a + b"), undefined);
      assert.equal(inferLiteralType('"x" & "y"'), undefined);
    });

    test("returns undefined for member access without New/CType", () => {
      assert.equal(inferLiteralType("obj.member"), undefined);
      assert.equal(inferLiteralType("obj.method()"), undefined);
    });

    test("returns undefined for empty input", () => {
      assert.equal(inferLiteralType(""), undefined);
      assert.equal(inferLiteralType("   "), undefined);
    });
  });
});
