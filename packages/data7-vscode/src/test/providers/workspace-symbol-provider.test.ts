import "../_setup/global-hooks";
import { WorkspaceSymbolIndexer } from "@data7/core";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import { D7BasicWorkspaceSymbolProvider } from "../../providers/workspace-symbol-provider";
import { noopToken } from "../_helpers/mock-doc";

describe("D7BasicWorkspaceSymbolProvider", () => {
  describe("provideWorkspaceSymbols", () => {
    test("matches by simple name (case-insensitive substring)", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(
        "file:///ws/mod_x.bas",
        `Namespace mod_x
   Class FooBar
      Public Sub DoSomething()
      End Sub
   End Class
End Namespace`,
      );

      const provider = new D7BasicWorkspaceSymbolProvider();
      const results = (await Promise.resolve(
        provider.provideWorkspaceSymbols("foo", noopToken),
      )) as { name: string }[];
      assert.ok(results.length >= 1);
      assert.ok(results.some((r) => r.name === "FooBar"));
    });

    test("matches by container.name dotted notation", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(
        "file:///ws/mod_x.bas",
        `Namespace mod_x
   Class FooBar
      Public Sub DoSomething()
      End Sub
   End Class
End Namespace`,
      );

      const provider = new D7BasicWorkspaceSymbolProvider();
      const results = (await Promise.resolve(
        provider.provideWorkspaceSymbols("foobar.dos", noopToken),
      )) as { name: string }[];
      assert.ok(results.some((r) => r.name === "DoSomething"));
    });

    test("returns top-level declarations when query is empty", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(
        "file:///ws/mod_y.bas",
        `Namespace mod_y
   Class A
   End Class
   Structure B
   End Structure
End Namespace`,
      );

      const provider = new D7BasicWorkspaceSymbolProvider();
      const results = (await Promise.resolve(provider.provideWorkspaceSymbols("", noopToken))) as {
        name: string;
      }[];
      const names = results.map((r) => r.name);
      assert.ok(names.includes("mod_y"));
      assert.ok(names.includes("A"));
      assert.ok(names.includes("B"));
    });
  });
});
