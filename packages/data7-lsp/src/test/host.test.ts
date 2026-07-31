import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { TextDocuments } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createLspAnalysisHost } from "../host";

describe("createLspAnalysisHost", () => {
  test("surfaces open LSP documents and notifies configuration listeners", () => {
    const uri = "file:///workspace/mod_a.bas";
    const doc = TextDocument.create(uri, "d7basic", 1, "Namespace A\nEnd Namespace");
    const documents = {
      get: (u: string): TextDocument | undefined => (u === uri ? doc : undefined),
      all: (): TextDocument[] => [doc],
    } as unknown as TextDocuments<TextDocument>;

    const logs: string[] = [];
    const host = createLspAnalysisHost({
      documents,
      connection: {
        console: {
          info: (m) => logs.push(`info:${m}`),
          warn: (m) => logs.push(`warn:${m}`),
          error: (m) => logs.push(`error:${m}`),
        },
      },
      getWorkspaceFolders: () => [{ uri: "file:///workspace", name: "workspace", index: 0 }],
    });

    const open = host.getOpenDocument(uri);
    assert.ok(open);
    assert.equal(open.getText(), "Namespace A\nEnd Namespace");
    assert.deepEqual(host.getWorkspaceFolders()?.[0]?.name, "workspace");

    let notified = false;
    host.onDidChangeConfiguration((section) => {
      if (section === "data7") notified = true;
    });
    host.notifyConfigurationChanged("data7");
    assert.equal(notified, true);

    host.log("info", "hello");
    assert.ok(logs.some((line) => line.startsWith("info:hello")));
  });
});
