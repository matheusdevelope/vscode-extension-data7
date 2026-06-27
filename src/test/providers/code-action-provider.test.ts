import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { D7BasicCodeActionProvider } from "../../providers/code-action-provider";
import {
  DiagnosticCodes,
  LegacyDiagnosticCodes,
  type MissingImportPayload,
  type ModuleNotDeclaredPayload,
  type ModuleNotFoundPayload,
  type UnknownMemberPayload,
  type UnsupportedMemberPayload,
  type UnusedImportPayload,
  type FinallyBlockUnsupportedPayload,
  type ElseIfWhitespacePayload,
  type LineContinuationWithoutBreakPayload,
  type MissingThenPayload,
  type ReturnUnrecommendedPayload,
  type ReturnAssignmentInCatchPayload,
  type InlineIfThenPayload,
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

function offsetAt(text: string, line: number, character: number): number {
  const lines = text.split("\n");
  let offset = 0;
  for (let index = 0; index < line; index++) {
    offset += (lines[index]?.length ?? 0) + 1;
  }
  return offset + character;
}

function applyReplaceEdit(
  text: string,
  edit: {
    type: string;
    range?: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    text?: string;
  },
): string {
  assert.equal(edit.type, "replace");
  assert.ok(edit.range);
  const start = offsetAt(text, edit.range.start.line, edit.range.start.character);
  const end = offsetAt(text, edit.range.end.line, edit.range.end.character);
  return `${text.slice(0, start)}${edit.text ?? ""}${text.slice(end)}`;
}

function applyInsertEdit(
  text: string,
  edit: {
    type: string;
    position?: { line: number; character: number };
    text?: string;
  },
): string {
  assert.equal(edit.type, "insert");
  assert.ok(edit.position);
  const offset = offsetAt(text, edit.position.line, edit.position.character);
  return `${text.slice(0, offset)}${edit.text ?? ""}${text.slice(offset)}`;
}

function applyDeleteEdit(
  text: string,
  edit: {
    type: string;
    range?: {
      start: { line: number; character?: number };
      end?: { line: number; character?: number };
    };
  },
): string {
  assert.equal(edit.type, "delete");
  assert.ok(edit.range);
  assert.ok(edit.range.end);
  const start = offsetAt(text, edit.range.start.line, edit.range.start.character ?? 0);
  const end = offsetAt(text, edit.range.end.line, edit.range.end.character ?? 0);
  return `${text.slice(0, start)}${text.slice(end)}`;
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

    test("unused-import emits a delete action when VS Code provides a structured code", async () => {
      const doc = mockDoc("Imports tryParser\n");
      const range = new vscode.Range(0, 8, 0, 17);
      const diagnostic = diagWith(DiagnosticCodes.UnusedImport, undefined, range);
      diagnostic.code = {
        value: DiagnosticCodes.UnusedImport,
        target: vscode.Uri.parse("https://data7.dev/diagnostics/unused-import"),
      };
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(doc, range, { diagnostics: [diagnostic] } as any, noopToken),
      )) as unknown as {
        title: string;
        kind?: { value?: string };
        edit: { edits: { type: string }[] };
      }[];
      const actions = onlyQuickFixes(all);

      assert.equal(actions.length, 1);
      const [unusedFix] = actions;
      assert.ok(unusedFix);
      assert.equal(unusedFix.title, 'Remover Imports "tryParser"');
      expectEdit(unusedFix.edit, { type: "delete" });
    });

    test("unused-import falls back to Remover esta linha if the line is not parseable", async () => {
      const doc = mockDoc("Some invalid line text\n");
      const range = new vscode.Range(0, 0, 0, 10);
      const diagnostic = diagWith(DiagnosticCodes.UnusedImport, undefined, range);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(doc, range, { diagnostics: [diagnostic] } as any, noopToken),
      )) as unknown as {
        title: string;
        kind?: { value?: string };
        edit: { edits: { type: string }[] };
      }[];
      const actions = onlyQuickFixes(all);
      assert.equal(actions.length, 1);
      const [unusedFix] = actions;
      assert.ok(unusedFix);
      assert.equal(unusedFix.title, "Remover esta linha");
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

  describe("object-creation-parentheses-missing", () => {
    test("emits an edit to insert parentheses () after the instantiated type", async () => {
      const doc = mockDoc("Dim file As StringList = New StringList\n");
      // TypeReference locations currently point to the type's first character.
      const range = new vscode.Range(0, 29, 0, 29);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          {
            diagnostics: [
              diagWith(DiagnosticCodes.ObjectCreationParenthesesMissing, undefined, range),
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
      const fix = actions.find((a) => a.title.includes("instanci"));
      assert.ok(fix);
      assert.equal(fix.isPreferred, true);
      expectEdit(fix.edit, { type: "insert", textIncludes: "()" });
      const insertion = fix.edit.edits[0];
      assert.ok(insertion);
      assert.equal(insertion.position.character, 39);
      const source = doc.getText();
      const fixedSource = `${source.slice(0, insertion.position.character)}()${source.slice(insertion.position.character)}`;
      assert.equal(fixedSource, "Dim file As StringList = New StringList()\n");
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

    test("adds MyBase.Free() after existing cleanup statements and accepts structured codes", async () => {
      const source = [
        "Class Foo",
        "   Sub Free()",
        "      me._connection.Free()",
        "      me._cache.Free()",
        "   End Sub",
        "End Class",
        "",
      ].join("\n");
      const doc = mockDoc(source);
      const range = new vscode.Range(1, 3, 1, 13);
      const diagnostic = diagWith(DiagnosticCodes.MissingMyBaseFree, undefined, range);
      diagnostic.code = { value: DiagnosticCodes.MissingMyBaseFree } as any;

      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(doc, range, { diagnostics: [diagnostic] } as any, noopToken),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) => action.title.includes("MyBase.Free"));
      assert.ok(fix, "The local MyBase.Free() quick fix should be offered");

      const insertEdit = expectEdit(fix.edit, {
        type: "insert",
        line: 4,
        textIncludes: "MyBase.Free()",
      });
      const insertPosition = insertEdit.position as { line: number; character: number };
      assert.equal(insertPosition.character, 0);
      const applied = applyInsertEdit(source, insertEdit as any);
      assert.match(applied, /me\._cache\.Free\(\)\n\s+MyBase\.Free\(\)\n\s+End Sub/);
    });

    test("bulk fix inserts MyBase.Free() before each matching End Sub", async () => {
      const source = [
        "Class Foo",
        "   Sub Free()",
        "      me._resource.Free()",
        "   End Sub",
        "End Class",
        "Class Bar",
        "   Sub Free()",
        "      me._anotherResource.Free()",
        "   End Sub",
        "End Class",
        "",
      ].join("\n");
      const doc = mockDoc(source);
      const first = diagWith(
        DiagnosticCodes.MissingMyBaseFree,
        undefined,
        new vscode.Range(1, 3, 1, 13),
      );
      const second = diagWith(
        DiagnosticCodes.MissingMyBaseFree,
        undefined,
        new vscode.Range(6, 3, 6, 13),
      );
      const originalGetDiagnostics = vscode.languages.getDiagnostics;
      (vscode.languages as any).getDiagnostics = () => [first, second];

      try {
        const provider = new D7BasicCodeActionProvider();
        const all = (await Promise.resolve(
          provider.provideCodeActions(doc, first.range, { diagnostics: [first] } as any, noopToken),
        )) as any[];
        const bulk = onlyQuickFixes(all).find((action) =>
          action.title.includes("todas as classes"),
        );
        assert.ok(bulk);
        assert.equal(bulk.edit.edits.length, 2);
        assert.deepEqual(
          bulk.edit.edits.map((edit: { position: { line: number } }) => edit.position.line).sort(),
          [3, 8],
        );
      } finally {
        (vscode.languages as any).getDiagnostics = originalGetDiagnostics;
      }
    });

    test("source fix-all applies structured missing-mybase-free diagnostics", () => {
      const doc = mockDoc(
        "Class Foo\n   Sub Free()\n      me._resource.Free()\n   End Sub\nEnd Class\n",
      );
      const diagnostic = diagWith(
        DiagnosticCodes.MissingMyBaseFree,
        undefined,
        new vscode.Range(1, 3, 1, 13),
      );
      diagnostic.code = { value: DiagnosticCodes.MissingMyBaseFree } as any;

      const provider = new D7BasicCodeActionProvider();
      const result = provider.buildFixAllWorkspaceEdit(doc, [diagnostic]);
      assert.ok(result);
      expectEdit(result.edit as any, { type: "insert", line: 3, textIncludes: "MyBase.Free()" });
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

  describe("syntax-style quickfixes", () => {
    test("elseif-whitespace replaces 'Else If' with 'ElseIf'", async () => {
      const doc = mockDoc("Else If ready Then\n");
      const payload: ElseIfWhitespacePayload = {
        code: DiagnosticCodes.ElseIfWhitespace,
        line: 0,
        column: 0,
      };
      const range = new vscode.Range(0, 0, 0, 7);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          { diagnostics: [diagWith(DiagnosticCodes.ElseIfWhitespace, payload, range)] } as any,
          noopToken,
        ),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) => action.title.includes("ElseIf"));
      assert.ok(fix);
      expectEdit(fix.edit, { type: "replace", textIncludes: "ElseIf" });
    });

    test("missing-then inserts Then before trailing comments", async () => {
      const doc = mockDoc("If ready ' comment\n");
      const payload: MissingThenPayload = {
        code: DiagnosticCodes.MissingThen,
        line: 0,
        insertColumn: 8,
      };
      const range = new vscode.Range(0, 0, 0, 18);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          { diagnostics: [diagWith(DiagnosticCodes.MissingThen, payload, range)] } as any,
          noopToken,
        ),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) => action.title.includes("Then"));
      assert.ok(fix);
      expectEdit(fix.edit, { type: "insert", textIncludes: " Then" });
      assert.equal(fix.edit.edits[0]?.position.character, 8);
    });

    test("missing-then preserves alignment before a trailing comment", async () => {
      const source = "If ready    ' Edit\n";
      const doc = mockDoc(source);
      const payload: MissingThenPayload = {
        code: DiagnosticCodes.MissingThen,
        line: 0,
        insertColumn: 8,
      };
      const range = new vscode.Range(0, 0, 0, source.length - 1);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          { diagnostics: [diagWith(DiagnosticCodes.MissingThen, payload, range)] } as any,
          noopToken,
        ),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) => action.title === "Adicionar 'Then'");
      assert.ok(fix);
      const applied = applyInsertEdit(source, fix.edit.edits[0]);
      assert.equal(applied, "If ready Then    ' Edit\n");
    });

    test("return-unrecommended rewrites Return to assignment plus Exit inside conditionals", async () => {
      const doc = mockDoc("         Return a + 1\n");
      const payload: ReturnUnrecommendedPayload = {
        code: DiagnosticCodes.ReturnUnrecommended,
        line: 0,
        startChar: 9,
        endChar: 21,
        expressionText: "a + 1",
        exitType: "Function",
        targetName: "Calc",
        isConditional: true,
      };
      const range = new vscode.Range(0, 9, 0, 21);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          { diagnostics: [diagWith(DiagnosticCodes.ReturnUnrecommended, payload, range)] } as any,
          noopToken,
        ),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) => action.title.includes("Calc"));
      assert.ok(fix);
      expectEdit(fix.edit, { type: "replace", textIncludes: "Calc = a + 1" });
      expectEdit(fix.edit, { type: "replace", textIncludes: "Exit Function" });
    });

    test("return-assignment-in-catch rewrites assignment to Return", async () => {
      const doc = mockDoc("            Calc = fallback ' keep\n");
      const payload: ReturnAssignmentInCatchPayload = {
        code: DiagnosticCodes.ReturnAssignmentInCatch,
        line: 0,
        startChar: 12,
        endChar: 34,
        expressionText: "fallback",
      };
      const range = new vscode.Range(0, 12, 0, 16);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          {
            diagnostics: [diagWith(DiagnosticCodes.ReturnAssignmentInCatch, payload, range)],
          } as any,
          noopToken,
        ),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) =>
        action.edit?.edits?.some((edit: { text?: string }) =>
          edit.text?.includes("Return fallback"),
        ),
      );
      assert.ok(fix);
      expectEdit(fix.edit, { type: "replace", textIncludes: "Return fallback ' keep" });
    });

    test("return-assignment-in-catch offers a bulk fix for every occurrence in the file", async () => {
      const source = [
        "      Function Calc() As Integer",
        "         Try",
        "            Calc = 1",
        "         Catch ex As Exception",
        "            Calc = fallback",
        "         End Try",
        "      End Function",
        "      Function Total() As Integer",
        "         Try",
        "            Total = 1",
        "         Catch ex As Exception",
        "            Total = current ' keep",
        "         End Try",
        "      End Function",
        "",
      ].join("\n");
      const doc = mockDoc(source);
      const firstPayload: ReturnAssignmentInCatchPayload = {
        code: DiagnosticCodes.ReturnAssignmentInCatch,
        line: 4,
        startChar: 12,
        endChar: 27,
        expressionText: "fallback",
      };
      const secondPayload: ReturnAssignmentInCatchPayload = {
        code: DiagnosticCodes.ReturnAssignmentInCatch,
        line: 11,
        startChar: 12,
        endChar: 35,
        expressionText: "current",
      };
      const first = diagWith(
        DiagnosticCodes.ReturnAssignmentInCatch,
        firstPayload,
        new vscode.Range(4, 12, 4, 16),
      );
      const second = diagWith(
        DiagnosticCodes.ReturnAssignmentInCatch,
        secondPayload,
        new vscode.Range(11, 12, 11, 17),
      );
      const originalGetDiagnostics = vscode.languages.getDiagnostics;
      (vscode.languages as any).getDiagnostics = () => [first, second];

      try {
        const provider = new D7BasicCodeActionProvider();
        const all = (await Promise.resolve(
          provider.provideCodeActions(doc, first.range, { diagnostics: [first] } as any, noopToken),
        )) as any[];
        const bulk = onlyQuickFixes(all).find((action) =>
          action.title.includes("todas as atribuicoes"),
        );
        assert.ok(bulk);
        assert.equal(bulk.edit.edits.length, 2);
        assert.deepEqual(
          bulk.edit.edits.map((edit: { text: string }) => edit.text).sort(),
          ["Return current ' keep", "Return fallback"].sort(),
        );
      } finally {
        (vscode.languages as any).getDiagnostics = originalGetDiagnostics;
      }
    });

    test("return-assignment-in-catch recovers full call expressions when payload is truncated", async () => {
      const doc = mockDoc('            stringToDate = StrToDateTime("01/01/1900 00:00:00")\n');
      const payload: ReturnAssignmentInCatchPayload = {
        code: DiagnosticCodes.ReturnAssignmentInCatch,
        line: 0,
        startChar: 12,
        endChar: 66,
        expressionText: "StrToDateTime",
      };
      const range = new vscode.Range(0, 12, 0, 24);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          {
            diagnostics: [diagWith(DiagnosticCodes.ReturnAssignmentInCatch, payload, range)],
          } as any,
          noopToken,
        ),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) =>
        action.edit?.edits?.some((edit: { text?: string }) =>
          edit.text?.includes('StrToDateTime("01/01/1900 00:00:00")'),
        ),
      );
      assert.ok(fix);
      expectEdit(fix.edit, {
        type: "replace",
        textIncludes: 'Return StrToDateTime("01/01/1900 00:00:00")',
      });
    });

    test("return-unrecommended outside conditional block rewrites to direct assignment only", async () => {
      const source = [
        "      Property Path As String",
        "         Get",
        "            Return me._path_qrcode",
        "         End Get",
        "      End Property",
        "",
      ].join("\n");
      const doc = mockDoc(source);
      const payload: ReturnUnrecommendedPayload = {
        code: DiagnosticCodes.ReturnUnrecommended,
        line: 2,
        startChar: 12,
        endChar: 12,
        expressionText: undefined,
        exitType: "Property",
        targetName: "Path",
        isConditional: false,
      };
      const range = new vscode.Range(2, 12, 2, 12);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          { diagnostics: [diagWith(DiagnosticCodes.ReturnUnrecommended, payload, range)] } as any,
          noopToken,
        ),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) => action.title.includes("Path"));
      assert.ok(fix);
      const replaceEdit = expectEdit(fix.edit, {
        type: "replace",
        line: 2,
        textIncludes: "Path = me._path_qrcode",
      });
      assert.ok(!replaceEdit.text?.includes("Exit Property"));
      const applied = applyReplaceEdit(source, replaceEdit as any);
      assert.match(applied, /^\s+Path = me\._path_qrcode$/m);
      assert.ok(!applied.includes("Exit SubReturn"));
    });

    test("return-unrecommended remains available when VS Code omits Diagnostic.data", async () => {
      const source = [
        "Function Calculate As Integer",
        "   If ready Then",
        "      Return total",
        "   End If",
        "End Function",
        "",
      ].join("\n");
      const doc = mockDoc(source);
      const range = new vscode.Range(2, 6, 2, 18);
      const diagnostic = diagWith(DiagnosticCodes.ReturnUnrecommended, undefined, range);
      diagnostic.code = { value: DiagnosticCodes.ReturnUnrecommended } as any;

      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(doc, range, { diagnostics: [diagnostic] } as any, noopToken),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) => action.title.includes("Calculate"));
      assert.ok(fix, "The Return quick fix should not depend on Diagnostic.data");
      expectEdit(fix.edit, { type: "replace", line: 2, textIncludes: "Calculate = total" });
      expectEdit(fix.edit, { type: "replace", textIncludes: "Exit Function" });
    });

    test("return-unrecommended inside Property Get remains available when VS Code omits Diagnostic.data", async () => {
      // Reproduces the exact scenario from PixQrCode.bas where a Return inside a
      // Property…Get block didn't surface a quick-fix because the fallback path
      // (resolveReturnPayloadFromDocument) was untested for the Property context.
      const source = [
        "Class C",
        "      Property Path As String",
        "         Get",
        "            Return me._path_qrcode",
        "         End Get",
        "      End Property",
        "End Class",
        "",
      ].join("\n");
      const doc = mockDoc(source);
      // Zero-width range at col 12 — exactly as VS Code reports it.
      const range = new vscode.Range(3, 12, 3, 12);
      const diagnostic = diagWith(DiagnosticCodes.ReturnUnrecommended, undefined, range);
      // Simulate VS Code recreating the diagnostic without the data field.
      diagnostic.code = { value: DiagnosticCodes.ReturnUnrecommended } as any;

      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(doc, range, { diagnostics: [diagnostic] } as any, noopToken),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) => action.title.includes("Path"));
      assert.ok(fix, "The Property quick fix should not depend on Diagnostic.data");
      const replaceEdit = expectEdit(fix.edit, {
        type: "replace",
        line: 3,
        textIncludes: "Path = me._path_qrcode",
      });
      assert.ok(
        !replaceEdit.text?.includes("Exit Property"),
        "Non-conditional path must not add Exit Property",
      );
    });

    test("return-unrecommended with empty Return replaces with Exit Property / Exit Function", async () => {
      const source = [
        "Class C",
        "      Property Path As String",
        "         Get",
        "            Path = me._path_qrcode",
        "            Return",
        "         End Get",
        "      End Property",
        "End Class",
        "",
      ].join("\n");
      const doc = mockDoc(source);
      const range = new vscode.Range(4, 12, 4, 18);
      const diagnostic = diagWith(DiagnosticCodes.ReturnUnrecommended, undefined, range);
      diagnostic.code = { value: DiagnosticCodes.ReturnUnrecommended } as any;

      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(doc, range, { diagnostics: [diagnostic] } as any, noopToken),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) => action.title.includes("Exit Property"));
      assert.ok(fix, "Should offer a quick fix to replace with Exit Property");
      const replaceEdit = expectEdit(fix.edit, {
        type: "replace",
        line: 4,
        textIncludes: "Exit Property",
      });
      assert.ok(
        !replaceEdit.text?.includes("="),
        "Must not include assignment when Return has no expression",
      );
    });

    test("return-unrecommended fallback with complex modifiers (Friend Override Function)", async () => {
      const source = [
        "   Friend Override Function Calc() As Integer",
        "      If cond Then",
        "         Return 100",
        "      End If",
        "   End Function",
        "",
      ].join("\n");
      const doc = mockDoc(source);
      const range = new vscode.Range(2, 9, 2, 19);
      const diagnostic = diagWith(DiagnosticCodes.ReturnUnrecommended, undefined, range);
      diagnostic.code = { value: DiagnosticCodes.ReturnUnrecommended } as any;

      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(doc, range, { diagnostics: [diagnostic] } as any, noopToken),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) => action.title.includes("Calc"));
      assert.ok(fix, "Should resolve routine name with complex modifiers via AST");
      expectEdit(fix.edit, {
        type: "replace",
        line: 2,
        textIncludes: "Calc = 100",
      });
    });

    test("return-unrecommended inside inline If converts entire If statement to block If", async () => {
      const source = "      If Not _initialized Then Return False\n";
      const doc = mockDoc(source);
      const payload: ReturnUnrecommendedPayload = {
        code: DiagnosticCodes.ReturnUnrecommended,
        line: 0,
        startChar: 31,
        endChar: 43,
        expressionText: "False",
        exitType: "Function",
        targetName: "_IsCached",
        isConditional: true,
        isSingleLineIf: true,
      };
      const range = new vscode.Range(0, 31, 0, 43);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          { diagnostics: [diagWith(DiagnosticCodes.ReturnUnrecommended, payload, range)] } as any,
          noopToken,
        ),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) => action.title.includes("_IsCached"));
      assert.ok(fix);
      const replaceEdit = expectEdit(fix.edit, { type: "replace", line: 0 });
      assert.match(replaceEdit.text ?? "", /If Not _initialized Then/);
      assert.match(replaceEdit.text ?? "", /_IsCached = False/);
      assert.match(replaceEdit.text ?? "", /Exit Function/);
      assert.match(replaceEdit.text ?? "", /End If/);
    });
  });

  describe("inline-if-then quick-fix", () => {
    test("converts single-line If Then into block If Then End If", async () => {
      const source = "      If a > 10 Then a = 10\n";
      const doc = mockDoc(source);
      const payload: InlineIfThenPayload = {
        code: DiagnosticCodes.InlineIfThen,
        line: 0,
      };
      const range = new vscode.Range(0, 6, 0, 27);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          { diagnostics: [diagWith(DiagnosticCodes.InlineIfThen, payload, range)] } as any,
          noopToken,
        ),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) =>
        action.title.includes("Converter 'If' inline"),
      );
      assert.ok(fix);
      const replaceEdit = expectEdit(fix.edit, { type: "replace", line: 0 });
      assert.match(replaceEdit.text ?? "", /If a > 10 Then/);
      assert.match(replaceEdit.text ?? "", /a = 10/);
      assert.match(replaceEdit.text ?? "", /End If/);
    });
  });

  describe("line-continuation-without-break quick-fix", () => {
    test("removes only the inline line-continuation marker", async () => {
      const source = 'If g.Cells[1, (g.Row + 1_)] <> "" Then\n';
      const doc = mockDoc(source);
      const column = source.indexOf("_");
      const payload: LineContinuationWithoutBreakPayload = {
        code: DiagnosticCodes.LineContinuationWithoutBreak,
        line: 0,
        column,
      };
      const range = new vscode.Range(0, column, 0, column + 1);
      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          range,
          {
            diagnostics: [
              diagWith(DiagnosticCodes.LineContinuationWithoutBreak, payload, range),
            ],
          } as any,
          noopToken,
        ),
      )) as any[];
      const fix = onlyQuickFixes(all).find((action) =>
        action.title.includes("continuacao de linha"),
      );

      assert.ok(fix);
      const deleteEdit = expectEdit(fix.edit, { type: "delete", line: 0 });
      assert.equal(applyDeleteEdit(source, deleteEdit), 'If g.Cells[1, (g.Row + 1)] <> "" Then\n');
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
        code: LegacyDiagnosticCodes.FinallyBlockUnsupported,
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
          {
            diagnostics: [diagWith(LegacyDiagnosticCodes.FinallyBlockUnsupported, payload)],
          } as any,
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
        code: LegacyDiagnosticCodes.FinallyBlockUnsupported,
        catchLine: 4,
        catchBodyStartLine: 5,
        catchBodyEndLine: 5,
      };

      const provider = new D7BasicCodeActionProvider();
      const all = (await Promise.resolve(
        provider.provideCodeActions(
          doc,
          new vscode.Range(2, 4, 8, 11),
          {
            diagnostics: [diagWith(LegacyDiagnosticCodes.FinallyBlockUnsupported, payload)],
          } as any,
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
        code: LegacyDiagnosticCodes.FinallyBlockUnsupported,
        catchLine: 4,
        catchBodyStartLine: 5,
        catchBodyEndLine: 5,
        catchVarName: "ex",
      };
      const secondPayload: FinallyBlockUnsupportedPayload = {
        code: LegacyDiagnosticCodes.FinallyBlockUnsupported,
        catchLine: 12,
        catchBodyStartLine: 13,
        catchBodyEndLine: 13,
      };

      const originalGetDiagnostics = vscode.languages.getDiagnostics;
      const diag1 = diagWith(
        LegacyDiagnosticCodes.FinallyBlockUnsupported,
        firstPayload,
        new vscode.Range(2, 4, 8, 11),
      );
      const diag2 = diagWith(
        LegacyDiagnosticCodes.FinallyBlockUnsupported,
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

  describe("buildFixAllWorkspaceEdit (dynamic bulk correction)", () => {
    test("picks the first available quick-fix edit and excludes suppression fixes", () => {
      const doc = mockDoc("If x <> 1\n");
      const range = new vscode.Range(0, 9, 0, 10);
      const diag = new vscode.Diagnostic(
        range,
        "Expected 'then', got '\\n'.",
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = "expected-token";

      const provider = new D7BasicCodeActionProvider();
      const result = provider.buildFixAllWorkspaceEdit(doc, [diag]);
      assert.ok(result);
      expectEdit(result.edit as any, { type: "insert", line: 0, textIncludes: "Then" });

      const editsStr = JSON.stringify(result.edit);
      assert.ok(!editsStr.includes("disable-line"));
    });

    test("deduplicates overlapping fixes on the same line, prioritizing return-unrecommended", () => {
      const doc = mockDoc("         If Not _enum_cache_initialized Then Return False\n");
      const range1 = new vscode.Range(0, 9, 0, 56);
      const diag1 = new vscode.Diagnostic(
        range1,
        "A sintaxe 'If ... Then' inline não é recomendada.",
        vscode.DiagnosticSeverity.Warning,
      );
      diag1.code = DiagnosticCodes.InlineIfThen;
      (diag1 as any).data = {
        code: DiagnosticCodes.InlineIfThen,
        line: 0,
      };

      const range2 = new vscode.Range(0, 45, 0, 56);
      const diag2 = new vscode.Diagnostic(
        range2,
        "O uso de 'Return' não é recomendado.",
        vscode.DiagnosticSeverity.Warning,
      );
      diag2.code = DiagnosticCodes.ReturnUnrecommended;
      (diag2 as any).data = {
        code: DiagnosticCodes.ReturnUnrecommended,
        line: 0,
        startChar: 45,
        endChar: 56,
        exitType: "Function",
        targetName: "_IsCached",
        isConditional: true,
        isSingleLineIf: true,
      };

      const provider = new D7BasicCodeActionProvider();
      const result = provider.buildFixAllWorkspaceEdit(doc, [diag1, diag2]);
      assert.ok(result);
      const mockEdits = (result.edit as any).edits;
      assert.equal(mockEdits.length, 1);
      const edit = mockEdits[0];
      assert.ok(edit.text.includes("Exit Function"));
      assert.ok(edit.text.includes("_IsCached = False"));
    });

    test("deduplicates parser and linter missing-then fixes at the same position", () => {
      const source = "If ready    ' Edit\n";
      const doc = mockDoc(source);
      const range = new vscode.Range(0, 0, 0, source.length - 1);
      const parserDiagnostic = new vscode.Diagnostic(
        range,
        "Expected 'then', got '' Edit'.",
        vscode.DiagnosticSeverity.Warning,
      );
      parserDiagnostic.code = "expected-token";
      const linterDiagnostic = diagWith(
        DiagnosticCodes.MissingThen,
        {
          code: DiagnosticCodes.MissingThen,
          line: 0,
          insertColumn: 8,
        } satisfies MissingThenPayload,
        range,
      );

      const provider = new D7BasicCodeActionProvider();
      const result = provider.buildFixAllWorkspaceEdit(doc, [parserDiagnostic, linterDiagnostic]);
      assert.ok(result);
      assert.equal(result.count, 1);
      const edit = (result.edit as any).edits[0];
      assert.equal(applyInsertEdit(source, edit), "If ready Then    ' Edit\n");
    });
  });
});
