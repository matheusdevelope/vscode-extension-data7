import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { D7BasicSignatureHelpProvider } from "../../providers/signature-provider";
import { createMockDoc, noopToken, pos } from "../_helpers/mock-doc";

const sigContext = { triggerKind: 0, isRetrigger: false, triggerCharacter: undefined } as any;

describe("D7BasicSignatureHelpProvider", () => {
  describe("provideSignatureHelp", () => {
    test("returns a signature when the cursor sits inside a known method call", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      // Workspace declares `MyClass.Calc(a, b)`.
      const text = `Namespace mod_sig
   Class MyClass
      Public Function Calc(a As Integer, b As Integer) As Integer
      End Function
      Public Sub Demo()
         Dim x As MyClass
         x.Calc(
      End Sub
   End Class
End Namespace`;
      const uri = "file:///sig.bas";
      createMockDoc(uri, text);
      indexer.updateFileContent(uri, text);

      const provider = new D7BasicSignatureHelpProvider();
      // Position right after `x.Calc(`
      const helpLineIndex = 6;
      const lineText = text.split("\n")[helpLineIndex] ?? "";
      const col = lineText.indexOf("(") + 1;
      const help = (await Promise.resolve(
        provider.provideSignatureHelp(
          createMockDoc(uri, text, { register: false }),
          pos(helpLineIndex, col),
          noopToken,
          sigContext,
        ),
      )) as
        | {
            signatures: { label: string; parameters: { label: string }[] }[];
            activeParameter: number;
          }
        | undefined;

      assert.ok(help, "must return SignatureHelp for known method");
      assert.ok(help.signatures.length >= 1);
      const [primarySig] = help.signatures;
      assert.ok(primarySig);
      assert.match(primarySig.label, /Calc/);
      assert.equal(
        help.activeParameter,
        0,
        "cursor right after `(` must point to the first parameter",
      );
    });

    test("advances activeParameter past each typed comma", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const text = `Namespace mod_sig2
   Class C
      Public Sub F(a As Integer, b As Integer, c As Integer)
      End Sub
      Public Sub Demo()
         F(1, 2,
      End Sub
   End Class
End Namespace`;
      const uri = "file:///sig2.bas";
      createMockDoc(uri, text);
      indexer.updateFileContent(uri, text);

      const provider = new D7BasicSignatureHelpProvider();
      // Position right after the second comma — should target the 3rd param.
      const lineIndex = 5;
      const lineText = text.split("\n")[lineIndex] ?? "";
      const col = lineText.lastIndexOf(",") + 1;
      const help = (await Promise.resolve(
        provider.provideSignatureHelp(
          createMockDoc(uri, text, { register: false }),
          pos(lineIndex, col),
          noopToken,
          sigContext,
        ),
      )) as { activeParameter: number } | undefined;

      assert.ok(help);
      assert.equal(help.activeParameter, 2);
    });

    test("returns undefined when the cursor is not inside a call", async () => {
      const provider = new D7BasicSignatureHelpProvider();
      const doc = createMockDoc("file:///sig3.bas", "Dim x As Integer\n");
      const help = await Promise.resolve(
        provider.provideSignatureHelp(doc, pos(0, 5), noopToken, sigContext),
      );
      assert.equal(help, undefined);
    });
  });
});
