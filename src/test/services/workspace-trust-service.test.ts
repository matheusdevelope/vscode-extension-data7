import "../_setup/global-hooks";
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import * as vscode from "vscode";
import { WorkspaceTrustService } from "../../services/workspace-trust-service";

describe("WorkspaceTrustService", () => {
  test("blocks write or execution flows when the workspace is untrusted", () => {
    const workspace = vscode.workspace as unknown as { isTrusted: boolean };
    const originalTrust = workspace.isTrusted;
    workspace.isTrusted = false;

    try {
      assert.equal(WorkspaceTrustService.ensureTrusted("workspace não confiável"), false);
    } finally {
      workspace.isTrusted = originalTrust;
    }
  });

  test("allows flows when the workspace is trusted", () => {
    assert.equal(WorkspaceTrustService.ensureTrusted("workspace não confiável"), true);
  });
});
