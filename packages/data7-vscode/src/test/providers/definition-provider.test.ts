import "../_setup/global-hooks";
import { WorkspaceSymbolIndexer } from "@data7/core";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";

import { D7BasicDefinitionProvider } from "../../providers/definition-provider";
import { createMockDoc, noopToken, pos } from "../_helpers/mock-doc";

describe("D7BasicDefinitionProvider", () => {
  describe("provideDefinition", () => {
    test("navigates to a workspace class declaration when the cursor is on a referenced type", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const declText = `Namespace mod_def
   Class MyTarget
   End Class
End Namespace`;
      // Register the declaration file as "open" so isFileValid accepts it.
      createMockDoc("file:///def-decl.bas", declText);
      indexer.updateFileContent("file:///def-decl.bas", declText);

      const usageText = `Namespace mod_use
   Class Caller
      Public Sub Run()
         Dim m As MyTarget
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///def-use.bas", usageText);

      const provider = new D7BasicDefinitionProvider();
      const doc = createMockDoc("file:///def-use.bas", usageText);
      const result = await Promise.resolve(provider.provideDefinition(doc, pos(3, 19), noopToken));
      assert.ok(result, "must return a definition Location for the referenced type");
    });

    test("returns nothing when the cursor is on whitespace", async () => {
      const provider = new D7BasicDefinitionProvider();
      const doc = createMockDoc("file:///def-blank.bas", "   \n");
      const result = await Promise.resolve(provider.provideDefinition(doc, pos(0, 0), noopToken));
      assert.equal(result, undefined);
    });

    test("resolves the member under the cursor when a line has repeated member names", async () => {
      const code = `Namespace mod_dense_definition
   Class FirstType
      Property Target As String
         Get
         End Get
      End Property
   End Class

   Class SecondType
      Property Target As Integer
         Get
         End Get
      End Property
   End Class

   Class C
      Public Sub Run()
         Dim first As FirstType
         Dim second As SecondType
         Dim value As String = first.Target & second.Target.ToString()
      End Sub
   End Class
End Namespace`;
      const uri = "file:///def-dense-member.bas";
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      indexer.updateFileContent(uri, code);
      const provider = new D7BasicDefinitionProvider();
      const doc = createMockDoc(uri, code);
      const lines = code.split(/\r?\n/);
      const line = lines.findIndex((entry) => entry.includes("first.Target"));
      const result = await Promise.resolve(
        provider.provideDefinition(doc, pos(line, lines[line]!.indexOf("Target")), noopToken),
      );

      assert.ok(result instanceof vscode.Location, "must return a definition Location");
      assert.equal(result.range.start.line, 2);
    });

    test("resolves Me members from the active class when dependencies duplicate the class name", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      indexer.updateFileContent(
        "file:///data7_modules/core_modules/mod_tenum.bas",
        `Namespace mod_tenum
   Class TEnum
      Protected _value As Integer
   End Class
End Namespace`,
      );

      const uri = "file:///def-local-tenum.bas";
      const code = `Namespace mod_enum
   Class BaseEnum
   End Class

   Class TEnum
      Private _value As BaseEnum
      Public Sub Run()
         Dim current = me._value
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);

      const provider = new D7BasicDefinitionProvider();
      const doc = createMockDoc(uri, code);
      const lines = code.split(/\r?\n/);
      const line = lines.findIndex((entry) => entry.includes("me._value"));
      const result = await Promise.resolve(
        provider.provideDefinition(doc, pos(line, lines[line]!.indexOf("_value")), noopToken),
      );

      assert.ok(result instanceof vscode.Location, "must return a definition Location");
      assert.equal(result.uri.toString(), uri);
      assert.equal(result.range.start.line, 5);
    });
  });
});
