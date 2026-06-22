import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { D7BasicCodeActionProvider } from "../../providers/code-action-provider";
import {
  DiagnosticCodes,
  type MissingImportPayload,
  type ModuleNotDeclaredPayload,
  type ModuleNotFoundPayload,
  type UnknownMemberPayload,
  type UnsupportedMemberPayload,
  type UnusedImportPayload,
  type FinallyBlockUnsupportedPayload,
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
function onlyQuickFixes<T extends { kind?: { value?: string } | string; title?: string }>(
  actions: T[],
): T[] {
  return actions.filter((a) => {
    const v = typeof a.kind === "string" ? a.kind : a.kind?.value;
    const isSuppression = a.title?.includes("Desabilitar erro");
    return (v === "quickfix" || v === undefined) && !isSuppression;
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
      const [missingFix] = actions;
      assert.ok(missingFix);
      assert.ok(missingFix.title.includes("Forms"));
      expectEdit(missingFix.edit, { type: "insert", textIncludes: "Imports Forms" });
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
      const [unusedFix] = actions;
      assert.ok(unusedFix);
      assert.ok(unusedFix.title.includes("Forms"));
      expectEdit(unusedFix.edit, { type: "delete" });
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
      const [dupFix] = actions;
      assert.ok(dupFix);
      expectEdit(dupFix.edit, { type: "delete" });
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
      const [declareFix] = actions;
      assert.ok(declareFix);
      assert.ok(declareFix.title.includes("mod_x"));
      assert.equal(declareFix.command?.command, "data7.installModule");
      assert.deepEqual(declareFix.command?.arguments?.[0], "mod_x");
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
      const [installFix] = actions;
      assert.ok(installFix);
      assert.equal(installFix.command?.command, "data7.installModule");
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
      const [commentFix, suppressFix] = actions;
      assert.ok(commentFix);
      assert.ok(suppressFix);
      assert.ok(commentFix.title.includes("Comentar"));
      assert.equal(commentFix.isPreferred, true);
      expectEdit(commentFix.edit, { type: "replace", textIncludes: "' " });

      assert.ok(suppressFix.title.includes("Suprimir"));
      expectEdit(suppressFix.edit, {
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
      const [didYouMean] = actions;
      assert.ok(didYouMean);
      assert.equal(didYouMean.isPreferred, true);
      for (const action of actions) {
        expectEdit(action.edit, { type: "replace" });
      }
    });
  });

  describe("declaration-parentheses-mismatch", () => {
    test("emits an edit to insert parentheses () after the declaration name", async () => {
      const doc = mockDoc("Shared Function BandeiraProduto As TObject\n");
      const range = new vscode.Range(0, 16, 0, 31); // range of "BandeiraProduto"
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          {
            diagnostics: [
              diagWith(DiagnosticCodes.DeclarationParenthesesMismatch, undefined, range),
            ],
          } as any,
          noopToken,
        ),
      )) as unknown as {
        title: string;
        kind?: { value?: string };
        isPreferred?: boolean;
        edit: { edits: { type: string; text?: string; position: vscode.Position }[] };
      }[];
      const actions = onlyQuickFixes(all);
      assert.ok(actions.length >= 1);
      const fix = actions.find((a) => a.title.includes("Adicionar parênteses"));
      assert.ok(fix);
      assert.equal(fix.isPreferred, true);
      expectEdit(fix.edit, { type: "insert", textIncludes: "()" });
      assert.equal(fix.edit.edits[0]?.position.character, 31);
    });

    test("does not trust a broad diagnostic range when inserting parentheses", async () => {
      const doc = mockDoc("      Private Function CreateInstance As TTObjectList\n");
      const range = new vscode.Range(0, 6, 0, 49); // broad range covering the whole declaration
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          {
            diagnostics: [
              diagWith(DiagnosticCodes.DeclarationParenthesesMismatch, undefined, range),
            ],
          } as any,
          noopToken,
        ),
      )) as unknown as {
        title: string;
        kind?: { value?: string };
        edit: { edits: { type: string; text?: string; position: vscode.Position }[] };
      }[];
      const fix = onlyQuickFixes(all).find((a) => a.title.includes("Adicionar parênteses"));
      assert.ok(fix);
      expectEdit(fix.edit, { type: "insert", textIncludes: "()" });
      assert.equal(fix.edit.edits[0]?.position.character, 37);
    });
  });

  describe("unknown-type spelling suggestions", () => {
    test("emits did-you-mean suggestions for unknown type names", async () => {
      const doc = mockDoc("Class Foo\nEnd Class\n");
      const payload = {
        code: DiagnosticCodes.UnknownType,
        typeName: "TForme",
        suggestions: ["TForm", "TFormat"],
      };
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          new vscode.Range(0, 0, 0, 5),
          { diagnostics: [diagWith(DiagnosticCodes.UnknownType, payload)] } as any,
          noopToken,
        ),
      )) as any[];
      const actions = onlyQuickFixes(all);
      assert.equal(actions.length, 2);
      assert.deepEqual(
        actions.map((a) => a.title),
        ['Você quis dizer "TForm"?', 'Você quis dizer "TFormat"?'],
      );
      assert.equal(actions[0].isPreferred, true);
    });
  });

  describe("missing-mybase-new quickfix and bulk action", () => {
    test("emits insert of MyBase.New() inside Sub New constructor", async () => {
      const doc = mockDoc("Class Foo\n   Sub New()\n   End Sub\nEnd Class\n");
      const range = new vscode.Range(1, 3, 1, 12);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          {
            diagnostics: [
              diagWith(
                DiagnosticCodes.MissingMyBaseNew,
                { code: DiagnosticCodes.MissingMyBaseNew, className: "Foo" },
                range,
              ),
            ],
          } as any,
          noopToken,
        ),
      )) as any[];
      const actions = onlyQuickFixes(all);
      assert.ok(actions.length >= 1);
      const fix = actions.find((a) => a.title.includes("Adicionar chamada"));
      assert.ok(fix);
      expectEdit(fix.edit, { type: "insert", textIncludes: "MyBase.New()" });
    });
  });

  describe("missing-mybase-free quickfix and bulk action", () => {
    test("emits generate Sub Free edit when Free is missing entirely in Class", async () => {
      const doc = mockDoc("Class Foo\nEnd Class\n");
      const range = new vscode.Range(0, 0, 0, 9);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          {
            diagnostics: [
              diagWith(
                DiagnosticCodes.MissingMyBaseFree,
                { code: DiagnosticCodes.MissingMyBaseFree, className: "Foo" },
                range,
              ),
            ],
          } as any,
          noopToken,
        ),
      )) as any[];
      const actions = onlyQuickFixes(all);
      assert.ok(actions.length >= 1);
      const fix = actions.find((a) => a.title.includes("Gerar método"));
      assert.ok(fix);
      expectEdit(fix.edit, { type: "insert", textIncludes: "Public Sub Free()" });
    });

    test("emits insert MyBase.Free() inside existing Sub Free", async () => {
      const doc = mockDoc("Class Foo\n   Sub Free()\n   End Sub\nEnd Class\n");
      const range = new vscode.Range(1, 3, 1, 13);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          {
            diagnostics: [
              diagWith(
                DiagnosticCodes.MissingMyBaseFree,
                { code: DiagnosticCodes.MissingMyBaseFree, className: "Foo" },
                range,
              ),
            ],
          } as any,
          noopToken,
        ),
      )) as any[];
      const actions = onlyQuickFixes(all);
      assert.ok(actions.length >= 1);
      const fix = actions.find((a) => a.title.includes("Adicionar chamada"));
      assert.ok(fix);
      expectEdit(fix.edit, { type: "insert", textIncludes: "MyBase.Free()" });
    });
  });

  describe("expected-token", () => {
    test("emits an edit to insert 'Then' at the end of the line if missing", async () => {
      const doc = mockDoc("If x <> 1\n");
      const range = new vscode.Range(0, 9, 0, 10);
      const diag = new vscode.Diagnostic(
        range,
        "Expected 'then', got '\\n'.",
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = "expected-token";
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(doc, range, { diagnostics: [diag] } as any, noopToken),
      )) as any[];
      const actions = onlyQuickFixes(all);
      assert.ok(actions.length >= 1);
      const fix = actions.find((a) => a.title.includes("Adicionar 'Then'"));
      assert.ok(fix);
      expectEdit(fix.edit, { type: "insert", textIncludes: " Then" });
    });

    test("emits a bulk fix for every missing Then diagnostic in the file", async () => {
      const doc = mockDoc("If x <> 1\nIf y <> 2\n");
      const firstRange = new vscode.Range(0, 9, 0, 10);
      const secondRange = new vscode.Range(1, 9, 1, 10);
      const first = new vscode.Diagnostic(
        firstRange,
        "Expected 'then', got '\\n'.",
        vscode.DiagnosticSeverity.Warning,
      );
      first.code = "expected-token";
      const second = new vscode.Diagnostic(
        secondRange,
        "Expected 'then', got '\\n'.",
        vscode.DiagnosticSeverity.Warning,
      );
      second.code = "expected-token";

      const originalGetDiagnostics = vscode.languages.getDiagnostics;
      (vscode.languages as any).getDiagnostics = () => [first, second];
      try {
        const provider = new D7BasicCodeActionProvider();
        const all = (await Promise.resolve(
          provider.provideCodeActions(doc, firstRange, { diagnostics: [first] } as any, noopToken),
        )) as any[];
        const bulk = onlyQuickFixes(all).find((a) => a.title.includes("todas as ocorrências"));
        assert.ok(bulk);
        assert.equal(bulk.edit.edits.length, 2);
        expectEdit(bulk.edit, { type: "insert", line: 0, textIncludes: " Then" });
        expectEdit(bulk.edit, { type: "insert", line: 1, textIncludes: " Then" });
      } finally {
        (vscode.languages as any).getDiagnostics = originalGetDiagnostics;
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

  describe("finally-block-unsupported", () => {
    test("finally-block-unsupported with declared catch variable wraps body", async () => {
      const codeText = [
        "Namespace mod_demo",
        "  Sub Run()",
        "    Try",
        '      Print("Try")',
        "    Catch ex As Exception",
        "      Print(ex.Message)",
        "    Finally",
        '      Print("Finally")',
        "    End Try",
        "  End Sub",
        "End Namespace",
      ].join("\n");

      const doc = mockDoc(codeText);
      const payload: FinallyBlockUnsupportedPayload = {
        code: DiagnosticCodes.FinallyBlockUnsupported,
        catchLine: 4,
        catchBodyStartLine: 5,
        catchBodyEndLine: 5,
        catchVarName: "ex",
      };

      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          new vscode.Range(2, 4, 8, 11),
          { diagnostics: [diagWith(DiagnosticCodes.FinallyBlockUnsupported, payload)] } as any,
          noopToken,
        ),
      )) as any[];

      const actions = onlyQuickFixes(all);
      assert.equal(actions.length, 1);
      const [fix] = actions;
      assert.ok(fix);
      assert.match(fix.title, /Encapsular bloco Catch com/);

      // Verify the edit content
      const edits = fix.edit?.edits;
      assert.equal(edits?.length, 1);
      assert.equal(edits[0].type, "replace");
      assert.match(
        edits[0].text,
        /If Assigned\(ex\) Then\r?\n\s{8}Print\(ex\.Message\)\r?\n\s{6}End If/,
      );
    });

    test("finally-block-unsupported without declared catch variable declares ex and wraps body", async () => {
      const codeText = [
        "Namespace mod_demo",
        "  Sub Run()",
        "    Try",
        '      Print("Try")',
        "    Catch",
        '      Print("Error")',
        "    Finally",
        '      Print("Finally")',
        "    End Try",
        "  End Sub",
        "End Namespace",
      ].join("\n");

      const doc = mockDoc(codeText);
      const payload: FinallyBlockUnsupportedPayload = {
        code: DiagnosticCodes.FinallyBlockUnsupported,
        catchLine: 4,
        catchBodyStartLine: 5,
        catchBodyEndLine: 5,
      };

      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          new vscode.Range(2, 4, 8, 11),
          { diagnostics: [diagWith(DiagnosticCodes.FinallyBlockUnsupported, payload)] } as any,
          noopToken,
        ),
      )) as any[];

      const actions = onlyQuickFixes(all);
      assert.equal(actions.length, 1);
      const [fix] = actions;
      assert.ok(fix);
      assert.match(fix.title, /Declarar variável de exceção/);

      const edits = fix.edit?.edits;
      assert.equal(edits?.length, 2);

      // First edit declares _ex
      const catchEdit = edits.find((e: any) => e.text.includes("Catch _ex As Exception"));
      assert.ok(catchEdit);
      assert.equal(catchEdit.type, "replace");

      // Second edit wraps the body
      const bodyEdit = edits.find((e: any) => e.text.includes("If Assigned(_ex) Then"));
      assert.ok(bodyEdit);
      assert.equal(bodyEdit.type, "replace");
    });

    test("finally-block-unsupported bulk fix applies to all occurrences", async () => {
      const codeText = [
        "Namespace mod_demo",
        "  Sub Run()",
        "    Try",
        '      Print("Try 1")',
        "    Catch ex As Exception",
        "      Print(ex.Message)",
        "    Finally",
        '      Print("Finally 1")',
        "    End Try",
        "    Try",
        '      Print("Try 2")',
        "    Catch",
        '      Print("Error 2")',
        "    Finally",
        '      Print("Finally 2")',
        "    End Try",
        "  End Sub",
        "End Namespace",
      ].join("\n");

      const doc = mockDoc(codeText);
      const firstPayload: FinallyBlockUnsupportedPayload = {
        code: DiagnosticCodes.FinallyBlockUnsupported,
        catchLine: 4,
        catchBodyStartLine: 5,
        catchBodyEndLine: 5,
        catchVarName: "ex",
      };
      const secondPayload: FinallyBlockUnsupportedPayload = {
        code: DiagnosticCodes.FinallyBlockUnsupported,
        catchLine: 12,
        catchBodyStartLine: 13,
        catchBodyEndLine: 13,
      };

      const originalGetDiagnostics = vscode.languages.getDiagnostics;
      const diag1 = diagWith(
        DiagnosticCodes.FinallyBlockUnsupported,
        firstPayload,
        new vscode.Range(2, 4, 8, 11),
      );
      const diag2 = diagWith(
        DiagnosticCodes.FinallyBlockUnsupported,
        secondPayload,
        new vscode.Range(10, 4, 16, 11),
      );
      (vscode.languages as any).getDiagnostics = () => [diag1, diag2];

      try {
        const provider = new D7BasicCodeActionProvider();
        const all = (await Promise.resolve(
          provider.provideCodeActions(
            doc,
            new vscode.Range(2, 4, 8, 11),
            { diagnostics: [diag1] } as any,
            noopToken,
          ),
        )) as any[];

        const actions = onlyQuickFixes(all);
        const bulkFix = actions.find((a) => a.title.includes("todos os blocos Catch"));
        assert.ok(bulkFix, "Bulk fix should be available");

        const edits = bulkFix.edit?.edits;
        // The first diagnostic (with ex) has 1 edit (wrap body)
        // The second diagnostic (no catch var) has 2 edits (declare var, wrap body)
        // Total edits = 3
        assert.equal(edits?.length, 3);
      } finally {
        (vscode.languages as any).getDiagnostics = originalGetDiagnostics;
      }
    });
  });

  describe("suppression actions", () => {
    test("generates line and file suppression quick fixes for any diagnostic", async () => {
      const doc = mockDoc("g.PopupMenu = Nothing\n");
      const range = new vscode.Range(0, 0, 0, 21);
      const diag = diagWith("some-diagnostic-code", null, range);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(doc, range, { diagnostics: [diag] } as any, noopToken),
      )) as unknown as {
        title: string;
        kind?: { value?: string };
        edit: { edits: { type: string; text?: string }[] };
      }[];
      const actions = all.filter((a) => {
        const v = typeof a.kind === "string" ? a.kind : a.kind?.value;
        return v === "quickfix" || v === undefined;
      });

      const lineFix = actions.find((a) => a.title.includes("nesta linha"));
      const fileFix = actions.find((a) => a.title.includes("no arquivo inteiro"));

      assert.ok(lineFix);
      assert.ok(fileFix);

      expectEdit(lineFix.edit, {
        type: "insert",
        textIncludes: "data7:disable-line some-diagnostic-code",
      });
      expectEdit(fileFix.edit, {
        type: "insert",
        textIncludes: "data7:disable some-diagnostic-code",
      });
    });
  });

  describe("bulk quickfixes additional tests", () => {
    test("missing-import bulk fix gathers and inserts all missing imports", async () => {
      const doc = mockDoc("Class Foo\nEnd Class\n");
      const diag1 = diagWith(DiagnosticCodes.MissingImport, {
        code: DiagnosticCodes.MissingImport,
        namespace: "Forms",
        typeName: "TForm",
      });
      const diag2 = diagWith(DiagnosticCodes.MissingImport, {
        code: DiagnosticCodes.MissingImport,
        namespace: "SQL",
        typeName: "TQuery",
      });

      const originalGetDiagnostics = vscode.languages.getDiagnostics;
      (vscode.languages as any).getDiagnostics = () => [diag1, diag2];

      try {
        const provider = new D7BasicCodeActionProvider();
        const all = (await Promise.resolve(
          provider.provideCodeActions(
            doc,
            new vscode.Range(0, 0, 0, 5),
            { diagnostics: [diag1] } as any,
            noopToken,
          ),
        )) as any[];

        const actions = onlyQuickFixes(all);
        const bulkFix = actions.find((a) => a.title.includes("todas as dependências em falta"));
        assert.ok(bulkFix, "Bulk fix for missing imports should be present");
        expectEdit(bulkFix.edit, { type: "insert", textIncludes: "Imports Forms" });
        expectEdit(bulkFix.edit, { type: "insert", textIncludes: "Imports SQL" });
      } finally {
        (vscode.languages as any).getDiagnostics = originalGetDiagnostics;
      }
    });

    test("unused-import / duplicate-import bulk fix removes all target lines", async () => {
      const doc = mockDoc("Imports Forms\nImports SQL\nImports Forms\n");
      const diag1 = diagWith(
        DiagnosticCodes.UnusedImport,
        {
          code: DiagnosticCodes.UnusedImport,
          namespace: "Forms",
        },
        new vscode.Range(0, 8, 0, 13),
      );
      const diag2 = diagWith(
        DiagnosticCodes.DuplicateImport,
        {
          code: DiagnosticCodes.UnusedImport,
          namespace: "Forms",
        },
        new vscode.Range(2, 8, 2, 13),
      );

      const originalGetDiagnostics = vscode.languages.getDiagnostics;
      (vscode.languages as any).getDiagnostics = () => [diag1, diag2];

      try {
        const provider = new D7BasicCodeActionProvider();
        const all = (await Promise.resolve(
          provider.provideCodeActions(
            doc,
            new vscode.Range(0, 8, 0, 13),
            { diagnostics: [diag1] } as any,
            noopToken,
          ),
        )) as any[];

        const actions = onlyQuickFixes(all);
        const bulkFix = actions.find((a) =>
          a.title.includes("Remover todos os imports duplicados"),
        );
        assert.ok(bulkFix, "Bulk fix for unused imports should be present");
        assert.equal(bulkFix.edit?.edits.length, 2);
      } finally {
        (vscode.languages as any).getDiagnostics = originalGetDiagnostics;
      }
    });
  });
});
