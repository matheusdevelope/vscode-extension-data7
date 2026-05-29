/**
 * In-process end-to-end test of the MCP server. Drives `buildServer()`
 * through the REAL protocol via a linked in-memory transport pair + an
 * MCP `Client`. This validates the parts the count-only `server.test.ts`
 * cannot: that resources actually READ (including multi-segment URIs that
 * exercise the RFC 6570 `{+path}` template), and that tools return
 * sensible payloads.
 *
 * Regression guard: `data7://examples/<category>/<slug>` reads used to
 * fail with "Resource not found" because the template was `{path}`
 * (single-segment) instead of `{+path}` (reserved, multi-segment).
 */
import "../_setup/global-hooks";

import { strict as assert } from "node:assert";
import { describe, test, before, after } from "node:test";

// Shim must be installed before buildServer pulls vscode-touching modules.
import { installVscodeShim } from "../../mcp/runtime/vscode-shim";
installVscodeShim();

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../../mcp/server";

let client: Client;

before(async () => {
  const { server } = buildServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "data7-e2e-test", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
});

after(async () => {
  await client.close();
});

function firstText(result: unknown): string {
  const r = result as { contents?: unknown[]; content?: unknown[] };
  const arr = r.contents ?? r.content ?? [];
  const first = arr[0];
  if (first && typeof first === "object" && "text" in first) {
    const t: unknown = first.text;
    return typeof t === "string" ? t : "";
  }
  return "";
}

describe("MCP server e2e — resource reads", () => {
  test("multi-segment example reads (regression: {+path})", async () => {
    const r = await client.readResource({ uri: "data7://examples/forms/05-grid-com-dados" });
    assert.match(firstText(r), /Cells\(/, "expected the grid example body");
  });

  test("multi-segment real-project file reads", async () => {
    const r = await client.readResource({
      uri: "data7://real-project/src/Principal.bas",
    });
    assert.ok(firstText(r).length > 0, "expected Principal.bas content");
  });

  test("language chapter reads (single segment)", async () => {
    const r = await client.readResource({ uri: "data7://language/construindo-telas" });
    assert.match(firstText(r), /Construindo telas/i);
  });

  test("official article reads (dotted qualified name)", async () => {
    const r = await client.readResource({ uri: "data7://official/Collections.StringList.Add" });
    assert.match(firstText(r), /UnicodeString/);
  });

  test("meta snapshot reports the capability counts", async () => {
    const r = await client.readResource({ uri: "data7://meta/snapshot" });
    const meta = JSON.parse(firstText(r)) as {
      capabilities: { resources: number; tools: number; prompts: number };
    };
    assert.equal(meta.capabilities.resources, 10);
    assert.equal(meta.capabilities.tools, 12);
    assert.equal(meta.capabilities.prompts, 4);
  });
});

describe("MCP server e2e — tools", () => {
  test("tools/list exposes 12 tools", async () => {
    const r = await client.listTools();
    assert.equal(r.tools.length, 12);
  });

  test("data7_list_controls returns instantiable controls, excludes VCL bases", async () => {
    const r = await client.callTool({ name: "data7_list_controls", arguments: { filter: "Text" } });
    const text = firstText(r);
    assert.match(text, /TextBox/);
    assert.doesNotMatch(text, /"name": "TWinControl"/);
  });

  test("data7_describe_symbol(Forms.Grid) includes the form usage hint", async () => {
    const r = await client.callTool({
      name: "data7_describe_symbol",
      arguments: { qualifiedName: "Forms.Grid" },
    });
    const text = firstText(r);
    assert.match(text, /formUsageHint/);
    assert.match(text, /eventos dispon[ií]veis/i);
  });

  test("data7_lint_bas flags a missing import", async () => {
    const r = await client.callTool({
      name: "data7_lint_bas",
      arguments: {
        code: [
          "Namespace m",
          "  Class T",
          "    Dim x As StringList",
          "  End Class",
          "End Namespace",
        ].join("\n"),
      },
    });
    const parsed = JSON.parse(firstText(r)) as {
      diagnostics: { code: string }[];
    };
    assert.ok(parsed.diagnostics.some((d) => d.code === "missing-import"));
  });
});

describe("MCP server e2e — prompts", () => {
  test("prompts/list exposes 4 prompts", async () => {
    const r = await client.listPrompts();
    assert.equal(r.prompts.length, 4);
  });

  test("data7_form_skeleton(list) generates a grid listing screen", async () => {
    const r = await client.getPrompt({
      name: "data7_form_skeleton",
      arguments: { className: "TFormX", namespaceName: "mod_x", layout: "list" },
    });
    const text = r.messages[0]?.content.type === "text" ? r.messages[0].content.text : "";
    assert.match(text, /New Forms\.Grid/);
    assert.match(text, /_atualizar/);
  });
});
