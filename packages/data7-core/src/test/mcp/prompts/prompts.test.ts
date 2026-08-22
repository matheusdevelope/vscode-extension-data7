/**
 * Tests for MCP prompts (module_skeleton, TEnum_pattern / Enun).
 * We exercise generated shapes through the linter and assert the
 * prompt helpers emit Enun by default (not the expanded class).
 */
import "../../_setup/global-hooks";

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { DiagnosticsLinter } from "../../../diagnostics/diagnostics";
import { WorkspaceSymbolIndexer } from "../../../analysis/symbol-indexer";
import { createMockDoc } from "../../_helpers/mock-doc";
import {
  buildEnunDeclaration,
  buildExpandedTEnumClass,
  parseEnumValues,
} from "../../../mcp/prompts/tenum-pattern";

describe("data7_TEnum_pattern — Enun is the default form", () => {
  test("buildEnunDeclaration emits sugar, not Class Inherits TEnum", () => {
    const values = parseEnumValues("Stone,Cielo");
    const code = buildEnunDeclaration("CardAdm", values);
    assert.match(code, /^Enun CardAdm$/m);
    assert.match(code, /^\s{3}Stone = "Stone"$/m);
    assert.match(code, /^\s{3}Cielo = "Cielo"$/m);
    assert.match(code, /^End Enun$/m);
    assert.doesNotMatch(code, /Inherits TEnum|Private Shared|_AddEnumItem/);
  });

  test("buildExpandedTEnumClass remains available for customization", () => {
    const values = parseEnumValues('[{"id":0,"label":"Stone"}]');
    const code = buildExpandedTEnumClass("CardAdm", values);
    assert.match(code, /Class CardAdm/);
    assert.match(code, /Inherits TEnum/);
    assert.match(code, /If TEnum\._IsCached\("CardAdm", "Stone"\) Then Exit Sub/);
    assert.doesNotMatch(code, /_Initialized/);
    assert.match(code, /Shared Function Load\(pValue As String\)/);
    assert.doesNotMatch(code, /^Enun /m);
  });

  test("sugar Enun declaration passes the linter without unknown-member on factories", () => {
    const coreTenum = `Namespace mod_tenum
   Class TEnum
      Property AsString As String
         Get
            AsString = ""
         End Get
      End Property
      Function IsValue(pValue As Variant) As Boolean
         IsValue = False
      End Function
   End Class
End Namespace`;
    const indexer = WorkspaceSymbolIndexer.createDetached();
    createMockDoc("file:///data7_modules/core_modules/mod_tenum.bas", coreTenum);
    indexer.updateFileContent("file:///data7_modules/core_modules/mod_tenum.bas", coreTenum);

    const enun = buildEnunDeclaration("CardAdm", parseEnumValues("Stone,Cielo"));
    const code = [
      "Imports mod_tenum",
      "Namespace mod_card_adm",
      enun
        .split("\n")
        .map((line) => "  " + line)
        .join("\n"),
      "  Sub Run(p As CardAdm)",
      "    Dim s As String = p.AsString",
      "    If p.IsValue(CardAdm.Stone) Then",
      "    End If",
      "  End Sub",
      "End Namespace",
    ].join("\n");
    const uri = "file:///tmp/mod_card_adm_enun.bas";
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    const blockers = diags.filter(
      (d) =>
        d.code !== "unused-import" &&
        d.code !== "missing-import" &&
        d.code !== "unknown-type" &&
        d.code !== "unknown-symbol",
    );
    assert.equal(
      blockers.filter((d) => d.code === "unknown-member").length,
      0,
      JSON.stringify(blockers, null, 2),
    );
  });

  test("does not require Sub New on expanded TEnum subclasses", () => {
    const code = [
      "Namespace mod_card_adm",
      "  Class CardAdm",
      "    Inherits TEnum",
      "    Private Shared Sub Initialize()",
      '      If TEnum._IsCached("CardAdm", "Stone") Then Exit Sub',
      "    End Sub",
      "  End Class",
      "End Namespace",
    ].join("\n");
    const doc = createMockDoc("file:///tmp/mod_card_adm_no_ctor.bas", code);
    const indexer = WorkspaceSymbolIndexer.createDetached();
    indexer.updateFileContent("file:///tmp/mod_card_adm_no_ctor.bas", code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    assert.equal(
      diags.filter((d) => d.code === "missing-mybase-new").length,
      0,
      JSON.stringify(
        diags.filter((d) => d.code === "missing-mybase-new"),
        null,
        2,
      ),
    );
  });
});

describe("data7_module_skeleton — output passes basic parsing", () => {
  test("a minimal module skeleton has no Builder-blocking diagnostics", () => {
    const code = [
      "'@Module",
      "Imports Collections",
      "",
      "Namespace mod_test",
      "  Class TTest",
      "    Sub New()",
      "      MyBase.New()",
      "    End Sub",
      "    Function Describe() As String",
      '      Describe = "T"',
      "    End Function",
      "  End Class",
      "End Namespace",
    ].join("\n");
    const doc = createMockDoc("file:///tmp/mod_test.bas", code);
    const indexer = WorkspaceSymbolIndexer.createDetached();
    indexer.updateFileContent("file:///tmp/mod_test.bas", code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    const blockers = diags.filter(
      (d) =>
        d.code !== "unused-import" &&
        d.code !== "module-not-declared" &&
        d.code !== "missing-mybase-new" &&
        d.code !== "missing-mybase-free",
    );
    assert.equal(blockers.length, 0, JSON.stringify(blockers, null, 2));
  });
});
