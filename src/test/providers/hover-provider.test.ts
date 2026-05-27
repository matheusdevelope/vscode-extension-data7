import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { D7BasicHoverProvider } from "../../providers/hover-provider";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { createMockDoc, noopToken, pos } from "../_helpers/mock-doc";

describe("D7BasicHoverProvider", () => {
  describe("provideHover", () => {
    test("returns a hover when the cursor sits on a System Library type", async () => {
      const provider = new D7BasicHoverProvider();
      const doc = createMockDoc("file:///hov.bas", "Dim x As TForm\n");
      const hover = (await Promise.resolve(provider.provideHover(doc, pos(0, 12), noopToken))) as
        | { contents: unknown }
        | undefined;
      assert.ok(hover, "hover must not be undefined for a known type");
      assert.ok(hover.contents, "hover must carry contents");
    });

    test("returns nothing when the cursor sits on whitespace", async () => {
      const provider = new D7BasicHoverProvider();
      const doc = createMockDoc("file:///hov-blank.bas", "   \n");
      const hover = await Promise.resolve(provider.provideHover(doc, pos(0, 0), noopToken));
      assert.equal(hover, undefined);
    });

    test('renders the "Não suportado" warning when the member is isUnsupported', async () => {
      // Grid.PopupMenu is currently marked `isUnsupported: true` in Grid.ts.
      const code = `Imports Forms
Namespace mod_h
   Class C
      Public Sub Run()
         Dim g As Grid
         g.PopupMenu = Nothing
      End Sub
   End Class
End Namespace`;
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent("file:///hov_unsup.bas", code);
      const doc = createMockDoc("file:///hov_unsup.bas", code);

      const provider = new D7BasicHoverProvider();
      // Cursor on `PopupMenu`
      const hover = (await Promise.resolve(provider.provideHover(doc, pos(5, 14), noopToken))) as
        | { contents: readonly ({ value?: string } | string)[] }
        | undefined;

      assert.ok(hover, "hover must not be undefined for PopupMenu");
      const text = JSON.stringify(hover.contents);
      assert.match(
        text,
        /N[aã]o suportado/i,
        "hover content should include the unsupported warning",
      );
    });
  });
});
