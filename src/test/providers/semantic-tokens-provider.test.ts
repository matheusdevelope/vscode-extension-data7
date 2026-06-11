import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import {
  D7BasicSemanticTokensLegend,
  D7BasicSemanticTokensProvider,
} from "../../providers/semantic-tokens-provider";
import { createMockDoc, noopToken } from "../_helpers/mock-doc";

describe("D7BasicSemanticTokensProvider", () => {
  test("legend declares the expected token types in the canonical order", () => {
    assert.deepEqual(D7BasicSemanticTokensLegend.tokenTypes, [
      "class",
      "namespace",
      "method",
      "property",
      "variable",
      "event",
    ]);
  });

  test("tokenises Workspace classes and namespace declarations", async () => {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const uri = "file:///sem.bas";
    const text = `Namespace mod_sem
   Class Foo
      Public Sub Run()
      End Sub
   End Class
End Namespace`;
    createMockDoc(uri, text);
    indexer.updateFileContent(uri, text);

    const provider = new D7BasicSemanticTokensProvider();
    const result = (await Promise.resolve(
      provider.provideDocumentSemanticTokens(
        createMockDoc(uri, text, { register: false }),
        noopToken,
      ),
    )) as { data: Uint32Array };

    assert.ok(result);
    // Token stream is `[line, char, length, type, mod]` repeated.
    const tokenCount = result.data.length / 5;
    assert.ok(tokenCount >= 3, `expected ≥ 3 tokens (Namespace, Class, Sub), got ${tokenCount}`);
  });

  test("skips identifiers inside line comments", async () => {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const uri = "file:///sem-comment.bas";
    const text = `Namespace mod_skip
   ' Foo here should not tokenize
   Class Foo
   End Class
End Namespace`;
    createMockDoc(uri, text);
    indexer.updateFileContent(uri, text);

    const provider = new D7BasicSemanticTokensProvider();
    const result = (await Promise.resolve(
      provider.provideDocumentSemanticTokens(
        createMockDoc(uri, text, { register: false }),
        noopToken,
      ),
    )) as { data: Uint32Array };

    // Walk the token stream and assert no token sits on line 1 (the comment).
    for (let i = 0; i < result.data.length; i += 5) {
      assert.notEqual(result.data[i], 1, "no token may land on a fully-commented line");
    }
  });

  test("skips identifiers inside string literals and trailing comments", async () => {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const uri = "file:///sem-string.bas";
    const text = `Namespace mod_sem
   Class Foo
      Public Sub Run()
         Dim s = "This is a Foo string literal"
         Dim x = 123 ' This is a Foo trailing comment
      End Sub
   End Class
End Namespace`;
    createMockDoc(uri, text);
    indexer.updateFileContent(uri, text);

    const provider = new D7BasicSemanticTokensProvider();
    const result = (await Promise.resolve(
      provider.provideDocumentSemanticTokens(
        createMockDoc(uri, text, { register: false }),
        noopToken,
      ),
    )) as { data: Uint32Array };

    // Find token with type index mapping to 'class' (which is Foo, tokenTypeIdx = 0)
    // There should only be two class tokens: the class definition Foo on line 1, and End Class on line 6.
    // There should be NO class tokens on line 3 (the string literal containing Foo) or line 4 (the trailing comment containing Foo).
    assert.ok(result);
    const classTokensOnLines: number[] = [];
    for (let i = 0; i < result.data.length; i += 5) {
      const line = result.data[i] ?? 0;
      const typeIdx = result.data[i + 3] ?? 0;
      if (typeIdx === 0) {
        // 'class' is index 0 in legend
        classTokensOnLines.push(line);
      }
    }

    assert.ok(classTokensOnLines.includes(1), "should find Class Foo on line 1");
    assert.ok(
      !classTokensOnLines.includes(3),
      "should NOT tokenize Foo inside string literal on line 3",
    );
    assert.ok(
      !classTokensOnLines.includes(4),
      "should NOT tokenize Foo inside trailing comment on line 4",
    );
  });
});
