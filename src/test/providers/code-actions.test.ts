import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { D7BasicCodeActionProvider } from "../../providers/code-actions";
import {
  DiagnosticCodes,
  type MissingImportPayload,
  type ModuleNotDeclaredPayload,
  type ModuleNotFoundPayload,
  type UnknownMemberPayload,
  type UnsupportedMemberPayload,
  type UnusedImportPayload,
  setDiagnosticPayload,
} from "../../diagnostics/diagnostic-codes";
import { createMockDoc, noopToken } from "../_helpers/mock-doc";
import { expectEdit } from "../_helpers/assertions";

function mockDoc(text: string): any {
  // Code action tests don't depend on isFileValid, so skip registration.
  return createMockDoc("file:///x.bas", text, { register: false });
}

function diagWith(
  code: string,
  payload: unknown,
  range = new vscode.Range(0, 0, 0, 5),
): vscode.Diagnostic {
  const d = new vscode.Diagnostic(range, "test", vscode.DiagnosticSeverity.Warning);
  d.code = code;
  setDiagnosticPayload(d, payload as never);
  return d;
}

/**
 * Filters out source.* actions so per-diagnostic tests can assert only on the
 * QuickFixes for the diagnostic they passed in.
 */
function onlyQuickFixes<T extends { kind?: { value?: string } | string }>(actions: T[]): T[] {
  return actions.filter((a) => {
    const v = typeof a.kind === "string" ? a.kind : a.kind?.value;
    return v === "quickfix" || v === undefined;
  });
}

describe("D7BasicCodeActionProvider", () => {
  describe("missing-import", () => {
    test('inserts "Imports X" at the top of the file', async () => {
      const doc = mockDoc("Class Foo\nEnd Class\n");
      const payload: MissingImportPayload = {
        code: DiagnosticCodes.MissingImport,
        namespace: "Forms",
        typeName: "TForm",
      };
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          new vscode.Range(0, 0, 0, 5),
          { diagnostics: [diagWith(DiagnosticCodes.MissingImport, payload)] } as any,
          noopToken,
        ),
      )) as unknown as {
        title: string;
        kind?: { value?: string };
        edit: { edits: { type: string; text?: string }[] };
      }[];
      const actions = onlyQuickFixes(all);

      assert.equal(actions.length, 1);
      assert.ok(actions[0].title.includes("Forms"));
      expectEdit(actions[0].edit, { type: "insert", textIncludes: "Imports Forms" });
    });
  });

  describe("unused-import / duplicate-import", () => {
    test("unused-import emits a delete action for the offending line", async () => {
      const doc = mockDoc("Imports Forms\nImports SQL\n");
      const payload: UnusedImportPayload = {
        code: DiagnosticCodes.UnusedImport,
        namespace: "Forms",
      };
      const range = new vscode.Range(0, 8, 0, 13);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          { diagnostics: [diagWith(DiagnosticCodes.UnusedImport, payload, range)] } as any,
          noopToken,
        ),
      )) as unknown as {
        title: string;
        kind?: { value?: string };
        edit: { edits: { type: string }[] };
      }[];
      const actions = onlyQuickFixes(all);

      assert.equal(actions.length, 1);
      assert.ok(actions[0].title.includes("Forms"));
      expectEdit(actions[0].edit, { type: "delete" });
    });

    test("duplicate-import also emits a delete action", async () => {
      const doc = mockDoc("Imports Forms\nImports Forms\n");
      const payload: UnusedImportPayload = {
        code: DiagnosticCodes.UnusedImport,
        namespace: "Forms",
      };
      const range = new vscode.Range(1, 8, 1, 13);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          { diagnostics: [diagWith(DiagnosticCodes.DuplicateImport, payload, range)] } as any,
          noopToken,
        ),
      )) as unknown as { kind?: { value?: string }; edit: { edits: { type: string }[] } }[];
      const actions = onlyQuickFixes(all);

      assert.equal(actions.length, 1);
      expectEdit(actions[0].edit, { type: "delete" });
    });
  });

  describe("module-not-declared / module-not-found", () => {
    test("module-not-declared dispatches the data7.installModule command", async () => {
      const doc = mockDoc("Imports mod_x\n");
      const payload: ModuleNotDeclaredPayload = {
        code: DiagnosticCodes.ModuleNotDeclared,
        moduleName: "mod_x",
      };
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          new vscode.Range(0, 0, 0, 5),
          { diagnostics: [diagWith(DiagnosticCodes.ModuleNotDeclared, payload)] } as any,
          noopToken,
        ),
      )) as unknown as {
        title: string;
        kind?: { value?: string };
        command?: { command: string; arguments?: unknown[] };
      }[];
      const actions = onlyQuickFixes(all);

      assert.equal(actions.length, 1);
      assert.ok(actions[0].title.includes("mod_x"));
      assert.equal(actions[0].command?.command, "data7.installModule");
      assert.deepEqual(actions[0].command?.arguments?.[0], "mod_x");
    });

    test("module-not-found dispatches the data7.installModule command", async () => {
      const doc = mockDoc("Imports mod_y\n");
      const payload: ModuleNotFoundPayload = {
        code: DiagnosticCodes.ModuleNotFound,
        moduleName: "mod_y",
      };
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          new vscode.Range(0, 0, 0, 5),
          { diagnostics: [diagWith(DiagnosticCodes.ModuleNotFound, payload)] } as any,
          noopToken,
        ),
      )) as unknown as { kind?: { value?: string }; command?: { command: string } }[];
      const actions = onlyQuickFixes(all);

      assert.equal(actions.length, 1);
      assert.equal(actions[0].command?.command, "data7.installModule");
    });
  });

  describe("unsupported-member", () => {
    test('emits "Comentar linha" and "Suprimir warning" actions', async () => {
      const lineText = "         g.PopupMenu = Nothing";
      const doc = mockDoc(lineText + "\n");
      const range = new vscode.Range(0, 12, 0, 21);
      const payload: UnsupportedMemberPayload = {
        code: DiagnosticCodes.UnsupportedMember,
        member: "PopupMenu",
        typeName: "Grid",
      };
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          { diagnostics: [diagWith(DiagnosticCodes.UnsupportedMember, payload, range)] } as any,
          noopToken,
        ),
      )) as unknown as {
        title: string;
        kind?: { value?: string };
        isPreferred?: boolean;
        edit: { edits: { type: string; text?: string }[] };
      }[];
      const actions = onlyQuickFixes(all);

      assert.equal(actions.length, 2);
      assert.ok(actions[0].title.includes("Comentar"));
      assert.equal(actions[0].isPreferred, true);
      expectEdit(actions[0].edit, { type: "replace", textIncludes: "' " });

      assert.ok(actions[1].title.includes("Suprimir"));
      expectEdit(actions[1].edit, {
        type: "insert",
        textIncludes: "data7:disable-line unsupported-member",
      });
    });
  });

  describe("unknown-member did-you-mean", () => {
    test('emits one "Você quis dizer X?" replacement per Levenshtein suggestion (max 3)', async () => {
      const doc = mockDoc("me.Aling()\n");
      const payload: UnknownMemberPayload = {
        code: DiagnosticCodes.UnknownMember,
        member: "Aling",
        suggestions: ["Align", "Alignment", "Alpha"],
      };
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          new vscode.Range(0, 3, 0, 8),
          { diagnostics: [diagWith(DiagnosticCodes.UnknownMember, payload)] } as any,
          noopToken,
        ),
      )) as unknown as {
        title: string;
        kind?: { value?: string };
        isPreferred?: boolean;
        edit: { edits: { type: string }[] };
      }[];
      const actions = onlyQuickFixes(all);

      assert.equal(actions.length, 3);
      assert.deepEqual(
        actions.map((a) => a.title),
        ['Você quis dizer "Align"?', 'Você quis dizer "Alignment"?', 'Você quis dizer "Alpha"?'],
      );
      assert.equal(actions[0].isPreferred, true);
      for (const action of actions) {
        expectEdit(action.edit, { type: "replace" });
      }
    });
  });

  describe("source actions", () => {
    test("source.organizeImports sorts + dedupes the Imports block", async () => {
      const doc = mockDoc(
        "Imports SQL\nImports Forms\nImports Forms\nImports IO\n\nClass C\nEnd Class\n",
      );
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          new vscode.Range(0, 0, 0, 5),
          { diagnostics: [] } as any,
          noopToken,
        ),
      )) as unknown as {
        title: string;
        kind?: { value?: string };
        edit?: { edits: { type: string; text?: string }[] };
      }[];

      const organize = all.find((a) => a.kind?.value === "source.organizeImports");
      assert.ok(
        organize,
        "source.organizeImports action must be present when there are 2+ Imports",
      );
      const edit = organize.edit?.edits[0];
      assert.equal(edit?.type, "replace");
      // Expect sorted + deduped: Forms, IO, SQL — Forms appears once.
      assert.match(edit?.text ?? "", /Imports Forms\r?\nImports IO\r?\nImports SQL/);
    });

    test("source.organizeImports is NOT emitted when there is only one Imports line", async () => {
      const doc = mockDoc("Imports Forms\nClass C\nEnd Class\n");
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          new vscode.Range(0, 0, 0, 5),
          { diagnostics: [] } as any,
          noopToken,
        ),
      )) as unknown as { kind?: { value?: string } }[];

      assert.ok(
        !all.some((a) => a.kind?.value === "source.organizeImports"),
        "should not emit organize-imports for a single Imports line",
      );
    });

    test("source.fixAll.data7 merges every QuickFix into one atomic WorkspaceEdit", async () => {
      const doc = mockDoc("Class Foo\nEnd Class\n");
      const payload: MissingImportPayload = {
        code: DiagnosticCodes.MissingImport,
        namespace: "Forms",
        typeName: "TForm",
      };
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          new vscode.Range(0, 0, 0, 5),
          { diagnostics: [diagWith(DiagnosticCodes.MissingImport, payload)] } as any,
          noopToken,
        ),
      )) as unknown as { title: string; kind?: { value?: string }; edit?: { edits: unknown[] } }[];

      const fixAll = all.find((a) => a.kind?.value?.startsWith("source.fixAll"));
      assert.ok(fixAll, "source.fixAll.data7 must be present when fixable diagnostics exist");
      assert.ok((fixAll.edit?.edits.length ?? 0) > 0, "fixAll must aggregate at least one edit");
    });
  });
});
