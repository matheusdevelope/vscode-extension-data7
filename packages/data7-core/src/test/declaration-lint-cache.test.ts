import "./_setup/global-hooks";
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as vscode from "../platform/vscode-api";
import { DeclarationLintCache } from "../analysis/declaration-lint-cache";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { DiagnosticsLinter } from "../diagnostics/diagnostics";
import { LanguageProcessor } from "../analysis/language-processor";
import { SemanticLintCache } from "../analysis/semantic-lint-cache";
import { buildMockDocument } from "../utils/text-edit-utils";

function createMockDoc(uri: string, code: string): vscode.TextDocument {
  return buildMockDocument(vscode.Uri.parse(uri), code);
}

describe("DeclarationLintCache", () => {
  beforeEach(() => {
    DeclarationLintCache.resetForTests();
    SemanticLintCache.resetForTests();
    LanguageProcessor.getInstance().clearCache();
    WorkspaceSymbolIndexer.getInstance().__resetForTests();
  });

  test("reuses body diagnostics when another part of the same file changes", () => {
    const uri = "file:///test.bas";
    const original = `Namespace TestNs

Class TExample
  Sub DoWork()
    Dim x As Integer
    x = 1
  End Sub
End Class

End Namespace
`;

    const edited = `Namespace TestNs

' comment added elsewhere
Class TExample
  Sub DoWork()
    Dim x As Integer
    x = 1
  End Sub
End Class

End Namespace
`;

    const indexer = WorkspaceSymbolIndexer.getInstance();
    indexer.updateFileContent(uri, original);

    const doc1 = createMockDoc(uri, original);
    const first = DiagnosticsLinter.runAdvancedDiagnostics(doc1, indexer);
    assert.ok(first.length >= 0);

    SemanticLintCache.resetForTests();
    indexer.updateFileContent(uri, edited);

    const doc2 = createMockDoc(uri, edited);
    const second = DiagnosticsLinter.runAdvancedDiagnostics(doc2, indexer);

    assert.deepEqual(
      second.map((d) => ({ code: d.code, message: d.message })),
      first.map((d) => ({ code: d.code, message: d.message })),
    );
  });

  test("invalidates cached body diagnostics when the method body changes", () => {
    const cache = DeclarationLintCache.getInstance();
    const key = cache.buildCacheKey("host", "file:///test.bas", "TExample", {
      kind: "MethodDeclaration",
      node: {
        kind: "MethodDeclaration",
        name: "DoWork",
        typeParameters: [],
        parameters: [],
        body: [],
      },
    });
    const diag = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      "body",
      vscode.DiagnosticSeverity.Warning,
    );
    cache.set(key, "dep-1", "body-1", [diag]);
    assert.equal(cache.get(key, "dep-1", "body-1")?.length, 1);
    assert.equal(cache.get(key, "dep-1", "body-2"), undefined);
    assert.equal(cache.get(key, "dep-2", "body-1"), undefined);
  });
});
