import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  META_PRIMITIVE_TYPES,
  metaTypesAreEqual,
  parseMetaTypeKind,
  resolveMetaTypeKind,
} from "../../../project/generics/meta-type-kind";
import { TemplateRegistry } from "../../../project/generics/registry";
import type { CompilationUnit, DelegateDeclaration } from "../../../project/ast/ast";

describe("meta-type-kind", () => {
  test("parseMetaTypeKind accepts known labels case-insensitively", () => {
    assert.equal(parseMetaTypeKind("delegate"), "Delegate");
    assert.equal(parseMetaTypeKind("CLASS"), "Class");
    assert.equal(parseMetaTypeKind("Primitive"), "Primitive");
    assert.equal(parseMetaTypeKind("nope"), undefined);
  });

  test("resolveMetaTypeKind classifies primitives and unit delegates", () => {
    const unit: CompilationUnit = {
      kind: "CompilationUnit",
      members: [
        {
          kind: "DelegateDeclaration",
          name: "TClick",
          typeParameters: [],
          parameters: [],
          loc: undefined,
        } satisfies DelegateDeclaration,
      ],
    };
    const templates = new TemplateRegistry();
    assert.equal(
      resolveMetaTypeKind("Integer", {
        unit,
        templates,
        concreteInstantiations: new Map(),
      }),
      "Primitive",
    );
    assert.equal(
      resolveMetaTypeKind("TClick", {
        unit,
        templates,
        concreteInstantiations: new Map(),
      }),
      "Delegate",
    );
    assert.ok(META_PRIMITIVE_TYPES.has("string"));
  });

  test("metaTypesAreEqual matches the concrete type, not ancestors", () => {
    assert.equal(metaTypesAreEqual("MemoTextBox", "MemoTextBox"), true);
    assert.equal(metaTypesAreEqual("Forms.MemoTextBox", "MemoTextBox"), true);
    assert.equal(metaTypesAreEqual("Forms.MemoTextBox", "Forms.MemoTextBox"), true);
    assert.equal(metaTypesAreEqual("Forms.MemoTextBox", "SQL.MemoTextBox"), false);
    assert.equal(metaTypesAreEqual("TextBox", "MemoTextBox"), false);
    assert.equal(metaTypesAreEqual("THandler<Integer>", "THandler<Integer>"), true);
    assert.equal(metaTypesAreEqual("THandler<Integer>", "THandler"), false);
  });
});
