import "../_setup/global-hooks";
import { describe, test, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { DocsGenerator } from "@data7/core";

import { DocsService } from "../../services/docs-service";

import { withTempDir } from "../_helpers/temp-dir";

const AGENTS_START = "<!-- data7:system-library:start -->";
const AGENTS_END = "<!-- data7:system-library:end -->";

/** Wires the `vscode` mock so it sees `tmp` as the active workspace folder. */
function attachWorkspace(tmp: string): void {
  (vscode.workspace as any).workspaceFolders = [
    {
      uri: { fsPath: tmp, toString: () => "file:///" + tmp.replace(/\\/g, "/") },
    },
  ];
  // Default behaviour: pick "all namespaces" from the multi-select QuickPick.
  (vscode.window as any).showQuickPick = async (items: any[]) => {
    const all = items.find((i) => typeof i.label === "string" && i.label.includes("Todos"));
    return all ? [all] : [];
  };
}

describe("DocsService", () => {
  beforeEach(() => {
    (vscode.workspace as any).workspaceFolders = undefined;
  });

  describe("injectIntoAgentsMd", () => {
    test("creates AGENTS.md with a delimited block when the file does not exist", async () => {
      await withTempDir(async (tmp) => {
        attachWorkspace(tmp);
        await DocsService.injectIntoAgentsMd();

        const agentsPath = path.join(tmp, "AGENTS.md");
        assert.ok(fs.existsSync(agentsPath));
        const body = fs.readFileSync(agentsPath, "utf-8");
        assert.ok(body.includes(AGENTS_START));
        assert.ok(body.includes(AGENTS_END));
        assert.ok(body.includes(`Snapshot: ${DocsGenerator.computeSnapshotHash()}`));
        assert.ok(body.includes("# Data7 System Library — referência"));
      });
    });

    test("replaces an existing delimited block in place (idempotent)", async () => {
      await withTempDir(async (tmp) => {
        attachWorkspace(tmp);
        const agentsPath = path.join(tmp, "AGENTS.md");
        fs.writeFileSync(
          agentsPath,
          `# Outro conteúdo\n\nLinha A\n\n${AGENTS_START}\nbloco antigo\n${AGENTS_END}\n\nLinha B\n`,
          "utf-8",
        );

        await DocsService.injectIntoAgentsMd();
        const body = fs.readFileSync(agentsPath, "utf-8");

        assert.ok(body.startsWith("# Outro conteúdo"));
        assert.ok(body.trim().endsWith("Linha B"));
        assert.ok(!body.includes("bloco antigo"));
        assert.ok(body.includes("# Data7 System Library — referência"));

        // Second pass must not duplicate the block.
        await DocsService.injectIntoAgentsMd();
        const body2 = fs.readFileSync(agentsPath, "utf-8");
        const startCount = (body2.match(new RegExp(AGENTS_START, "g")) ?? []).length;
        const endCount = (body2.match(new RegExp(AGENTS_END, "g")) ?? []).length;
        assert.equal(startCount, 1, "idempotent: exactly one start marker");
        assert.equal(endCount, 1, "idempotent: exactly one end marker");
      });
    });

    test("warns and does nothing when no workspace folder is open", async () => {
      (vscode.workspace as any).workspaceFolders = undefined;
      let warned = false;
      (vscode.window as any).showWarningMessage = async () => {
        warned = true;
        return undefined;
      };
      await DocsService.injectIntoAgentsMd();
      assert.equal(warned, true);
    });
  });
});
