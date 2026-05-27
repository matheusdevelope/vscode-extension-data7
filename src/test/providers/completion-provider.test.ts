import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { D7BasicCompletionProvider } from "../../providers/completion-provider";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { createMockDoc, noopToken, pos } from "../_helpers/mock-doc";

interface MockCompletionItem {
  label: string | { label: string };
  detail?: string;
  tags?: number[];
}

function labelOf(item: MockCompletionItem): string {
  return typeof item.label === "string" ? item.label : item.label.label;
}

describe("D7BasicCompletionProvider", () => {
  describe("isUnsupported propagation", () => {
    test("flags Grid.PopupMenu as deprecated and prefixes detail with the warning", async () => {
      const code = `Imports Forms
Namespace mod_cp
   Class C
      Public Sub Run()
         Dim g As Grid
         g.
      End Sub
   End Class
End Namespace`;
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent("file:///cp.bas", code);
      const doc = createMockDoc("file:///cp.bas", code);

      const provider = new D7BasicCompletionProvider();
      // Cursor is positioned right after `g.` on line 5 (0-indexed).
      const items = (await Promise.resolve(
        provider.provideCompletionItems(doc, pos(5, 11), noopToken, {} as vscode.CompletionContext),
      )) as unknown as MockCompletionItem[];

      const popup = items.find((i) => labelOf(i) === "PopupMenu");
      assert.ok(popup, "completion list should include the unsupported PopupMenu member");
      assert.ok(
        popup.tags?.includes(vscode.CompletionItemTag.Deprecated),
        `expected Deprecated tag, got: ${JSON.stringify(popup.tags)}`,
      );
      assert.match(
        popup.detail ?? "",
        /N[aã]o suportado/i,
        `expected detail to mention "Não suportado", got: ${popup.detail}`,
      );
    });

    test("does NOT flag Grid.ColCount (a supported property) as deprecated", async () => {
      const code = `Imports Forms
Namespace mod_cp2
   Class C
      Public Sub Run()
         Dim g As Grid
         g.
      End Sub
   End Class
End Namespace`;
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent("file:///cp2.bas", code);
      const doc = createMockDoc("file:///cp2.bas", code);

      const provider = new D7BasicCompletionProvider();
      const items = (await Promise.resolve(
        provider.provideCompletionItems(doc, pos(5, 11), noopToken, {} as vscode.CompletionContext),
      )) as unknown as MockCompletionItem[];

      const colCount = items.find((i) => labelOf(i) === "ColCount");
      assert.ok(colCount, "completion list should include ColCount");
      assert.ok(
        !colCount.tags?.includes(vscode.CompletionItemTag.Deprecated),
        "ColCount must NOT carry the Deprecated tag",
      );
    });
  });
});
