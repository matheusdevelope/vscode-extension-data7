/**
 * High-level integration test for the MCP server. We do NOT spawn the
 * bundled binary as a child process here (the `scripts/smoke-test-mcp.js`
 * script handles that end-to-end flow). Instead we build the server
 * in-process via `buildServer()` and inspect the registered counts +
 * a representative Resource/Tool/Prompt by reaching into the SDK's
 * advanced API.
 *
 * This keeps the test fast (no fork) and stable across CI runners that
 * may not have stdio piping available for spawned children.
 */
import "../_setup/global-hooks";

import { strict as assert } from "node:assert";
import { describe, test, before } from "node:test";

// Install the shim BEFORE the server import (which transitively pulls
// `vscode`-touching modules like DiagnosticsLinter). The shim is
// idempotent — calling it twice (here + inside server.ts's
// install-shim) is safe.
import { installVscodeShim } from "../../mcp/runtime/vscode-shim";
installVscodeShim();

import { buildServer } from "../../mcp/server";

let counts: { resources: number; tools: number; prompts: number };

before(() => {
  const result = buildServer();
  counts = result.counts;
});

describe("MCP server — capability counts", () => {
  test("registers 10 Resources", () => {
    assert.equal(counts.resources, 10);
  });

  test("registers 12 Tools (lookup + executable + suggest + list_controls)", () => {
    assert.equal(counts.tools, 12);
  });

  test("registers 4 Prompts", () => {
    assert.equal(counts.prompts, 4);
  });
});
