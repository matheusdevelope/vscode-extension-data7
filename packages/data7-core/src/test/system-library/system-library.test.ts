import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { SYSTEM_SYMBOLS } from "../../system-library";
import type { SymbolInfo } from "../../analysis/symbol-indexer";

/**
 * Structural validation of the System Library — guarantees the inheritance
 * chain for the most-used collection types stays anchored to the right
 * ancestors. Catches accidental restructuring of `system-library/**`.
 */
describe("System Library — inheritance chain", () => {
  const findClass = (name: string, container?: string): SymbolInfo | undefined =>
    SYSTEM_SYMBOLS.find(
      (s) =>
        s.name === name &&
        s.kind === "class" &&
        (container === undefined || s.containerName === container),
    );

  const findMember = (memberName: string, container: string): SymbolInfo | undefined =>
    SYSTEM_SYMBOLS.find((s) => s.name === memberName && s.containerName === container);

  describe("Collections.StringList → Collections.TStringList → Collections.TStrings → System.Classes.TPersistent → System.Classes.TObject", () => {
    test("Collections.StringList inherits Collections.TStringList", () => {
      const c = findClass("StringList", "Collections");
      assert.ok(c, "Collections.StringList must exist");
      assert.equal(c.inheritsFrom, "Collections.TStringList");
    });

    test("Collections.TStringList inherits Collections.TStrings (no intermediate)", () => {
      const c = findClass("TStringList", "Collections");
      assert.ok(c);
      assert.equal(c.inheritsFrom, "Collections.TStrings");
    });

    test("Collections.TStrings inherits System.Classes.TPersistent", () => {
      const c = findClass("TStrings", "Collections");
      assert.ok(c);
      assert.equal(c.inheritsFrom, "System.Classes.TPersistent");
    });

    test("System.Classes.TPersistent inherits System.Classes.TObject", () => {
      const c = findClass("TPersistent", "System.Classes");
      assert.ok(c);
      assert.equal(c.inheritsFrom, "System.Classes.TObject");
    });

    test("System.Classes.TObject is the root class (no parent)", () => {
      const c = findClass("TObject", "System.Classes");
      assert.ok(c);
      assert.equal(c.inheritsFrom, undefined);
    });
  });

  describe("global aliases", () => {
    test("global TObject inherits System.Classes.TObject", () => {
      const c = SYSTEM_SYMBOLS.find(
        (s) => s.name === "TObject" && s.kind === "class" && !s.containerName,
      );
      assert.ok(c);
      assert.equal(c.inheritsFrom, "System.Classes.TObject");
    });

    test("global TPersistent inherits global TObject", () => {
      const c = SYSTEM_SYMBOLS.find(
        (s) => s.name === "TPersistent" && s.kind === "class" && !s.containerName,
      );
      assert.ok(c);
      assert.equal(c.inheritsFrom, "TObject");
    });
  });

  describe("legacy System.Classes entries are NOT re-declared in Collections", () => {
    test("System.Classes.TStrings no longer exists (consolidated into Collections.TStrings)", () => {
      const c = SYSTEM_SYMBOLS.find(
        (s) => s.name === "TStrings" && s.containerName === "System.Classes",
      );
      assert.equal(c, undefined);
    });

    test("System.Classes.TStringList no longer exists (consolidated into Collections.TStringList)", () => {
      const c = SYSTEM_SYMBOLS.find(
        (s) => s.name === "TStringList" && s.containerName === "System.Classes",
      );
      assert.equal(c, undefined);
    });
  });

  describe("member presence on key collection classes", () => {
    test("Collections.TStringList exposes its own Sort and Find", () => {
      assert.ok(findMember("Sort", "TStringList"));
      assert.ok(findMember("Find", "TStringList"));
    });

    test("Collections.TStrings exposes Add / Count / Text / IndexOf", () => {
      assert.ok(findMember("Add", "TStrings"));
      assert.ok(findMember("Count", "TStrings"));
      assert.ok(findMember("Text", "TStrings"));
      assert.ok(findMember("IndexOf", "TStrings"));
    });

    test("Collections.TStrings exposes Item as default indexed property", () => {
      const item = findMember("Item", "TStrings");
      assert.ok(item);
      assert.equal(item.kind, "indexed-property");
      assert.equal(item.type, "String");
      assert.equal(item.parameters?.[0]?.type, "Integer");
    });

    test("System.Classes.TPersistent uses the fully-qualified containerName for its members", () => {
      assert.ok(findMember("Assign", "System.Classes.TPersistent"));
      assert.ok(findMember("GetNamePath", "System.Classes.TPersistent"));
    });
  });

  describe("Forms.Grid catalog (native API verified)", () => {
    const findDelegate = (name: string): SymbolInfo | undefined =>
      SYSTEM_SYMBOLS.find((s) => s.name === name && s.kind === "delegate");

    const findGridMember = (name: string): SymbolInfo | undefined =>
      SYSTEM_SYMBOLS.find((s) => s.name === name && s.containerName === "Grid");

    test("TCanEditCellEvent is Sender, ARow, ACol, ByRef CanEdit", () => {
      const d = findDelegate("TCanEditCellEvent");
      assert.ok(d, "TCanEditCellEvent must exist");
      assert.deepEqual(
        d.parameters?.map((p) => p.name),
        ["Sender", "ARow", "ACol", "CanEdit"],
      );
      assert.equal(d.parameters?.[3]?.isByRef, true);
    });

    test("TDblClickCellEvent is pSender, pRow, pCol", () => {
      const d = findDelegate("TDblClickCellEvent");
      assert.ok(d, "TDblClickCellEvent must exist");
      assert.deepEqual(
        d.parameters?.map((p) => p.name),
        ["pSender", "pRow", "pCol"],
      );
    });

    test("TCellValidateEvent has ByRef AValue and ByRef AValid", () => {
      const d = findDelegate("TCellValidateEvent");
      assert.ok(d, "TCellValidateEvent must exist");
      assert.deepEqual(
        d.parameters?.map((p) => p.name),
        ["Sender", "ACol", "ARow", "AValue", "AValid"],
      );
      assert.equal(d.parameters?.[3]?.isByRef, true);
      assert.equal(d.parameters?.[4]?.isByRef, true);
    });

    test("Col and Row are documented as 0-based", () => {
      const col = findGridMember("Col");
      const row = findGridMember("Row");
      assert.match(col?.description ?? "", /0-based/);
      assert.match(row?.description ?? "", /0-based/);
      assert.doesNotMatch(col?.description ?? "", /1-based/);
      assert.doesNotMatch(row?.description ?? "", /1-based/);
    });

    test("ColCount counts non-hidden columns", () => {
      const colCount = findGridMember("ColCount");
      assert.match(colCount?.description ?? "", /não ocultas/i);
    });

    test("PermiteMarcarExclusao documents the hidden extra column", () => {
      const flag = findGridMember("PermiteMarcarExclusao");
      assert.match(flag?.description ?? "", /coluna oculta extra/);
      assert.match(flag?.description ?? "", /UnHideColumnsAll/);
    });

    test("UnHideColumnsAll warns about PermiteMarcarExclusao", () => {
      const method = findGridMember("UnHideColumnsAll");
      assert.match(method?.description ?? "", /PermiteMarcarExclusao/);
    });

    test("RealColIndex warns against mixing with Cells / ColWidth", () => {
      const method = findGridMember("RealColIndex");
      assert.match(method?.description ?? "", /não é o índice de Cells/i);
    });
  });

  describe("Forms.GridConfigs", () => {
    test("exposes visual option flags used by legacy Grid.Configs code", () => {
      for (const name of [
        "FixedVerLine",
        "FixedHorzLine",
        "VerLine",
        "HorzLine",
        "RowSizing",
        "ColSizing",
        "RowMoving",
        "ColMoving",
        "RowSelect",
        "FixedColClick",
        "FixedRowClick",
        "FixedHotTrack",
      ]) {
        const member = findMember(name, "GridConfigs");
        assert.ok(member, `GridConfigs.${name} must exist`);
        assert.equal(member.kind, "property");
        assert.equal(member.type, "Boolean");
      }
    });
  });
});
