import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { D7BasicDocumentLinkProvider } from "../../providers/document-link-provider";
import { createMockDoc, noopToken } from "../_helpers/mock-doc";

type LinkArr = { range: { start: { line: number; character: number } }; target?: unknown }[];

describe("D7BasicDocumentLinkProvider", () => {
  describe("provideDocumentLinks", () => {
    test("produces one clickable link per Imports line that resolves to a workspace namespace", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const targetUri = "file:///ws/mod_target.bas";
      indexer.updateFileContent(
        targetUri,
        `Namespace mod_target
   Class C
   End Class
End Namespace`,
      );

      const importingText = `Imports mod_target
Namespace mod_consumer
End Namespace`;
      const provider = new D7BasicDocumentLinkProvider();
      const links = (await Promise.resolve(
        provider.provideDocumentLinks(
          createMockDoc("file:///ws/consumer.bas", importingText),
          noopToken,
        ),
      )) as LinkArr;

      assert.equal(links.length, 1);
      const [link] = links;
      assert.ok(link);
      assert.equal(link.range.start.line, 0);
      assert.equal(link.range.start.character, "Imports ".length);
      assert.ok(link.target);
    });

    test("produces no link when the target namespace is unknown", async () => {
      const provider = new D7BasicDocumentLinkProvider();
      const links = (await Promise.resolve(
        provider.provideDocumentLinks(
          createMockDoc("file:///ws/x.bas", "Imports nonexistent_ns_xyz"),
          noopToken,
        ),
      )) as LinkArr;
      assert.equal(links.length, 0);
    });
  });
});
