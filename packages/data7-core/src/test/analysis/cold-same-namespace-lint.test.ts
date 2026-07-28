import assert from "node:assert/strict";
import { describe, test, beforeEach } from "node:test";
import { LanguageProcessor } from "../../analysis/language-processor";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { runLintFileDiagnosticsOnly } from "../../analysis/lint-workspace-runner";
import { SemanticLintCache } from "../../analysis/semantic-lint-cache";
import { DeclarationLintCache } from "../../analysis/declaration-lint-cache";
import { AnalysisProgram } from "../../analysis/analysis-program";
import { DiagnosticCodes } from "../../diagnostics/diagnostic-codes";

/**
 * Regression: cold/worker workspace lint reported missing-import for types
 * declared in the same Namespace (ex.: Screen/Mouse in WinAPI) until the
 * file was opened and saved. Same-namespace access must not require Imports.
 *
 * Also: nested classes (Namespace mod_winapi / Class WinAPI / Class Mouse)
 * must not treat the outer class name as a missing module import.
 */
describe("cold workspace lint same-namespace missing-import", () => {
  beforeEach(() => {
    AnalysisProgram.resetForTests();
    LanguageProcessor.getInstance().clearCache();
    SemanticLintCache.resetForTests();
    DeclarationLintCache.resetForTests();
    WorkspaceSymbolIndexer.getInstance().__resetForTests();
  });

  test("does not emit missing-import for same-namespace types on detached snapshot lint", () => {
    const host = WorkspaceSymbolIndexer.getInstance();
    const fileUri = "file:///d:/proj/src/modules/helpers/mod_winapi.bas";
    const filePath = "d:\\proj\\src\\modules\\helpers\\mod_winapi.bas";
    const content = `
Namespace WinAPI
  Class Screen
    Public Width As Integer
  End Class

  Class Mouse
    Public X As Integer
  End Class

  Class Helper
    Public Sub UseTypes()
      Dim s As Screen
      Dim m As Mouse
    End Sub
  End Class
End Namespace
`.trim();

    host.updateFileContent(fileUri, content);
    const snapshot = host.exportLintSnapshot();

    const detached = WorkspaceSymbolIndexer.createDetached();
    detached.loadLintSnapshot(snapshot);

    const diagnostics = runLintFileDiagnosticsOnly({ uri: fileUri, filePath, content }, detached);

    const missingImport = diagnostics.filter(
      (d) => d.code === DiagnosticCodes.MissingImport || d.code === "missing-import",
    );
    assert.deepEqual(
      missingImport.map((d) => d.message),
      [],
      `unexpected missing-import: ${missingImport.map((d) => d.message).join("; ")}`,
    );
  });

  test("does not emit missing-import when mock document URI form differs from index URI", () => {
    const host = WorkspaceSymbolIndexer.getInstance();
    // Index with one URI spelling; cold lint historically rebuilt mock docs via Uri.file(fsPath).
    const indexedUri = "file:///d%3A/proj/mod_winapi.bas";
    const content = `
Namespace WinAPI
  Class Screen
  End Class

  Class Consumer
    Public Sub Run()
      Dim s As Screen
    End Sub
  End Class
End Namespace
`.trim();

    host.updateFileContent(indexedUri, content);
    const snapshot = host.exportLintSnapshot();
    const detached = WorkspaceSymbolIndexer.createDetached();
    detached.loadLintSnapshot(snapshot);

    const diagnostics = runLintFileDiagnosticsOnly(
      {
        uri: indexedUri,
        filePath: "d:\\proj\\mod_winapi.bas",
        content,
      },
      detached,
    );

    const missingImport = diagnostics.filter(
      (d) =>
        (d.code === DiagnosticCodes.MissingImport || d.code === "missing-import") &&
        d.message.toLowerCase().includes("screen"),
    );
    assert.equal(missingImport.length, 0, missingImport.map((d) => d.message).join("; "));
  });

  test("does not emit missing-import for nested classes under outer class (WinAPI.Mouse)", () => {
    const host = WorkspaceSymbolIndexer.getInstance();
    const fileUri = "file:///d:/proj/src/modules/helpers/mod_winapi.bas";
    const filePath = "d:\\proj\\src\\modules\\helpers\\mod_winapi.bas";
    const content = `
Namespace mod_winapi
  Class WinAPI
    Class Mouse
      Shared Sub LeftClick()
        Mouse.LeftClick()
      End Sub
    End Class

    Class Screen
      Shared Function Width() As Integer
        Width = Screen.Width()
      End Function
    End Class
  End Class
End Namespace
`.trim();

    host.updateFileContent(fileUri, content);
    const snapshot = host.exportLintSnapshot();
    const detached = WorkspaceSymbolIndexer.createDetached();
    detached.loadLintSnapshot(snapshot);

    const diagnostics = runLintFileDiagnosticsOnly({ uri: fileUri, filePath, content }, detached);
    const missingImport = diagnostics.filter(
      (d) =>
        (d.code === DiagnosticCodes.MissingImport || d.code === "missing-import") &&
        /Mouse|Screen|WinAPI/i.test(d.message),
    );
    assert.deepEqual(
      missingImport.map((d) => d.message),
      [],
      `unexpected missing-import: ${missingImport.map((d) => d.message).join("; ")}`,
    );
  });

  test("resolves imported cross-file types on detached snapshot lint", () => {
    const host = WorkspaceSymbolIndexer.getInstance();
    const recordUri = "file:///d:/proj/src/mod_card_record.bas";
    const extractorUri = "file:///d:/proj/src/mod_card_extractor.bas";
    const recordContent = `
Namespace mod_card_record
  Class CardRecord
  End Class
  Class CardRecordList
    Sub Add(p As CardRecord)
    End Sub
  End Class
End Namespace
`.trim();
    const extractorContent = `
Imports mod_card_record
Namespace mod_card_extractor
  Class CardExtractor
    Function Execute() As CardRecordList
      Dim items As New CardRecordList()
      items.Add(New CardRecord())
      Execute = items
    End Function
  End Class
End Namespace
`.trim();

    host.updateFileContent(recordUri, recordContent);
    host.updateFileContent(extractorUri, extractorContent);
    const snapshot = host.exportLintSnapshot();
    const detached = WorkspaceSymbolIndexer.createDetached();
    detached.loadLintSnapshot(snapshot);

    const diagnostics = runLintFileDiagnosticsOnly(
      {
        uri: extractorUri,
        filePath: "d:\\proj\\src\\mod_card_extractor.bas",
        content: extractorContent,
      },
      detached,
    );

    const bad = diagnostics.filter(
      (d) =>
        d.code === DiagnosticCodes.UnknownType ||
        d.code === "unknown-type" ||
        d.code === DiagnosticCodes.MissingImport ||
        d.code === "missing-import",
    );
    assert.deepEqual(
      bad.map((d) => `${String(d.code)}: ${d.message}`),
      [],
      `unexpected type/import diagnostics: ${bad.map((d) => d.message).join("; ")}`,
    );
  });
});
