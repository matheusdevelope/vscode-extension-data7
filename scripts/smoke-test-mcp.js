#!/usr/bin/env node
/* eslint-disable */
/**
 * Smoke test: spawns the bundled MCP server, sends an `initialize` +
 * `resources/list` JSON-RPC handshake over stdio, prints the result and
 * exits non-zero if the response shape is unexpected.
 *
 * Not part of `npm run verify` — invoked ad hoc during M1/M5 validation:
 *   node scripts/smoke-test-mcp.js
 */
const { spawn } = require("child_process");
const path = require("path");

const SERVER = path.join(__dirname, "..", "out", "mcp", "server.bundled.js");
const DOCS_ROOT = path.join(__dirname, "..", "docs");

function send(child, msg) {
  child.stdin.write(JSON.stringify(msg) + "\n");
}

function main() {
  const child = spawn(process.execPath, [SERVER, `--docs-root=${DOCS_ROOT}`], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  let buffer = "";
  const pending = new Map();
  let nextId = 1;

  function request(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send(child, { jsonrpc: "2.0", id, method, params });
    });
  }

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf-8");
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && pending.has(msg.id)) {
          const handlers = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) handlers.reject(new Error(JSON.stringify(msg.error)));
          else handlers.resolve(msg.result);
        }
      } catch (err) {
        console.error("[parse error]", err, line);
      }
    }
  });

  (async () => {
    try {
      const init = await request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "0.0.0" },
      });
      console.log("initialize OK:", JSON.stringify(init.serverInfo));

      // Send `initialized` notification as required by spec.
      send(child, { jsonrpc: "2.0", method: "notifications/initialized" });

      const list = await request("resources/list", {});
      const resources = list.resources || [];
      console.log(`resources/list returned ${resources.length} resources.`);
      const sampleUris = resources.slice(0, 10).map((r) => r.uri);
      console.log("Sample URIs:", sampleUris);

      const tpls = await request("resources/templates/list", {});
      const templates = tpls.resourceTemplates || [];
      console.log(`resources/templates/list returned ${templates.length} templates.`);
      const sampleTpls = templates.map((t) => t.uriTemplate);
      console.log("Templates:", sampleTpls);

      // Read one resource to confirm the read path works.
      const read = await request("resources/read", {
        uri: "data7://meta/snapshot",
      });
      console.log("meta/snapshot content preview:", read.contents[0].text.slice(0, 120));

      // Read an official article to confirm M1.5 wiring.
      const official = await request("resources/read", {
        uri: "data7://official/Collections.StringList.Add",
      });
      console.log(
        "official article preview:",
        official.contents[0].text.slice(0, 200).replace(/\n/g, " "),
      );

      // M2: list and call a couple of tools.
      const tools = await request("tools/list", {});
      console.log(
        `tools/list returned ${tools.tools.length} tools:`,
        tools.tools.map((t) => t.name),
      );

      const searchResult = await request("tools/call", {
        name: "data7_search_symbol",
        arguments: { query: "StringList", limit: 3 },
      });
      console.log(
        "data7_search_symbol result preview:",
        searchResult.content[0].text.slice(0, 200).replace(/\n/g, " "),
      );

      const describeResult = await request("tools/call", {
        name: "data7_describe_symbol",
        arguments: { qualifiedName: "Collections.StringList.Add" },
      });
      console.log(
        "describe_symbol describes Add:",
        describeResult.content[0].text.includes('"name": "Add"'),
      );

      // M3 — executable tools.
      const transpileResult = await request("tools/call", {
        name: "data7_transpile_bas",
        arguments: {
          code: 'Dim x As String = 1 > 0 ? "pos" : "neg"',
        },
      });
      const transpiled = JSON.parse(transpileResult.content[0].text);
      console.log("transpile_bas — ternary expanded:", transpiled.output.includes("If "));

      const lintResult = await request("tools/call", {
        name: "data7_lint_bas",
        arguments: {
          code: [
            "Namespace mod_test",
            "  Class T",
            "    Dim x As StringList",
            "  End Class",
            "End Namespace",
          ].join("\n"),
        },
      });
      const lintParsed = JSON.parse(lintResult.content[0].text);
      console.log(
        "lint_bas — missing-import detected:",
        lintParsed.diagnostics.some((d) => d.code === "missing-import"),
      );

      // M4 — suggest_import + prompts.
      const suggestResult = await request("tools/call", {
        name: "data7_suggest_import",
        arguments: { typeName: "StringList" },
      });
      const suggestParsed = JSON.parse(suggestResult.content[0].text);
      console.log(
        "suggest_import — Collections proposed:",
        suggestParsed.suggestions.some((s) => s.namespace === "Collections"),
      );

      const prompts = await request("prompts/list", {});
      console.log(
        `prompts/list returned ${prompts.prompts.length} prompts:`,
        prompts.prompts.map((p) => p.name),
      );

      const baseEnumPrompt = await request("prompts/get", {
        name: "data7_baseenum_pattern",
        arguments: { enumName: "Status", values: "Active,Inactive" },
      });
      console.log(
        "baseenum_pattern generated Initialize():",
        baseEnumPrompt.messages[0].content.text.includes("Initialize"),
      );

      child.kill();
      process.exit(0);
    } catch (err) {
      console.error("[smoke-test failed]", err);
      child.kill();
      process.exit(1);
    }
  })();
}

main();
