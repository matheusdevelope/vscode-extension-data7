import "../_setup/global-hooks";
import * as vscode from "vscode";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { DiagnosticsLinter } from "../../diagnostics/diagnostics";
import { DiagnosticCodes, LegacyDiagnosticCodes } from "../../diagnostics/diagnostic-codes";
import { createMockDoc, registerOpenDocument } from "../_helpers/mock-doc";
import { expectDiagnostic, expectNoDiagnostic } from "../_helpers/assertions";
import { loadExample, parseExampleHeader } from "../_helpers/fixtures";

/**
 * `DiagnosticsLinter.runAdvancedDiagnostics` — full coverage of every canonical
 * diagnostic code emitted by the linter. Grouped by code so a new code only
 * adds a new `describe` block.
 */
describe("DiagnosticsLinter", () => {
  // -------------------------------------------------------------------------
  // missing-import / Principal.bas / qualified types / Inherits
  // -------------------------------------------------------------------------
  describe("missing-import", () => {
    const setupResources = (): WorkspaceSymbolIndexer => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const resourcesUri = "file:///dummy/mod_resources.bas";
      const resourcesCode = `Namespace mod_resources
   Class TResourceLoader
      Public Shared Function Load() As TObject
      End Function
   End Class
End Namespace`;
      indexer.updateFileContent(resourcesUri, resourcesCode);
      registerOpenDocument(resourcesUri, "dummy/mod_resources.bas");

      const principalUri = "file:///dummy/Principal.bas";
      const principalCode = `Namespace mod_principal
   Class TPrincipalClass
   End Class
End Namespace`;
      indexer.updateFileContent(principalUri, principalCode);
      registerOpenDocument(principalUri, "dummy/Principal.bas");

      registerOpenDocument("file:///dummy/test_file.bas", "dummy/test_file.bas");
      return indexer;
    };

    const runLinter = (code: string) => {
      const indexer = setupResources();
      const uri = "file:///dummy/test_file.bas";
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code, { register: false });
      return DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    };

    test("emits no diagnostic when only primitives and global classes are used", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Public Sub Run()
         Dim s As String
         Dim client As THTTP
         Dim json As TJSONObject
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      assert.equal(diags.length, 0);
    });

    test("emits missing-import for a workspace type whose namespace was not imported", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Public Sub Run()
         Dim loader As TResourceLoader
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      const diag = expectDiagnostic(diags, DiagnosticCodes.MissingImport, "não foi importado");
      assert.ok(diag);
    });

    test("emits no diagnostic when the type is referenced via a fully-qualified name", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Public Sub Run()
         Dim loader As mod_resources.TResourceLoader
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.MissingImport);
    });

    test("emits no diagnostic when the namespace was imported explicitly", () => {
      const diags = runLinter(`Imports mod_resources

Namespace my_app
   Class TTest
      Public Sub Run()
         Dim loader As TResourceLoader
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.MissingImport);
    });

    test("emits no diagnostic when inheriting a global Principal.bas class", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Inherits TPrincipalClass
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.MissingImport);
    });

    test("emits missing-import when inheriting Forms.Form without an Imports Forms", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Inherits Form
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectDiagnostic(diags, DiagnosticCodes.MissingImport);
    });
  });

  // -------------------------------------------------------------------------
  // duplicate-import
  // -------------------------------------------------------------------------
  describe("duplicate-import", () => {
    test("emits one duplicate-import when the same Imports appears twice", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const uri = "file:///dup.bas";
      const code = `Imports Forms
Imports Forms
Namespace mod_test
   Class C
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      const dup = expectDiagnostic(diags, DiagnosticCodes.DuplicateImport, "linha 1");
      assert.equal((dup as { data?: { code?: string } }).data?.code, DiagnosticCodes.UnusedImport);
    });
  });

  // -------------------------------------------------------------------------
  // private-member-access
  // -------------------------------------------------------------------------
  describe("private-member-access", () => {
    test("emits when a Private member is accessed from a different class", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const vault = `Namespace mod_vault
   Class Vault
      Private secret As String
      Public Sub Init()
         secret = "x"
      End Sub
   End Class
End Namespace`;
      const user = `Imports mod_vault
Namespace mod_user
   Class User
      Public Sub Leak()
         Dim v As Vault
         v.secret = "y"
      End Sub
   End Class
End Namespace`;
      createMockDoc("file:///vault.bas", vault);
      indexer.updateFileContent("file:///vault.bas", vault);
      indexer.updateFileContent("file:///user.bas", user);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///user.bas", user),
        indexer,
      );
      expectDiagnostic(diags, DiagnosticCodes.PrivateMemberAccess);
    });

    test("highlights the exact private member token in chained access", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///private_member_range.bas";
      const code = `Namespace helpers_csv
   Class HelpersCellsCSV
      Public count As Integer
   End Class

   Class HelpersRowCSV
      Private cells As HelpersCellsCSV
   End Class

   Class HelpersRowsCSV
      Public Function gett(pIndex As Integer) As HelpersRowCSV
         gett = NULL
      End Function
   End Class

   Class Adapter
      Private _rowsCSV As HelpersRowsCSV

      Public Sub Run(i As Integer)
         Dim total As Integer = me._rowsCSV.gett(i).cells.count
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      const diag = expectDiagnostic(diags, DiagnosticCodes.PrivateMemberAccess, "cells");
      const targetLine = "         Dim total As Integer = me._rowsCSV.gett(i).cells.count";
      const expectedStart = targetLine.indexOf("cells");

      assert.equal(diag.range.start.line, 19);
      assert.equal(diag.range.start.character, expectedStart);
      assert.equal(diag.range.end.character, expectedStart + "cells".length);
    });

    test("does NOT emit when a member without modifier (public by default) is accessed from outside", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const vault = `Namespace mod_vault
   Class Vault
      secret As String
      PublicSub As String
      PrivateSecretField As String
      Public Sub Init()
         secret = "x"
         PublicSub = "y"
         PrivateSecretField = "z"
      End Sub
   End Class
End Namespace`;
      const user = `Imports mod_vault
Namespace mod_user
   Class User
      Public Sub Access()
         Dim v As Vault
         v.secret = "a"
         v.PublicSub = "b"
         v.PrivateSecretField = "c"
      End Sub
   End Class
End Namespace`;
      createMockDoc("file:///vault.bas", vault);
      indexer.updateFileContent("file:///vault.bas", vault);
      indexer.updateFileContent("file:///user.bas", user);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///user.bas", user),
        indexer,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.PrivateMemberAccess);
    });
  });

  // -------------------------------------------------------------------------
  // event-signature-mismatch
  // -------------------------------------------------------------------------
  describe("event-signature-mismatch", () => {
    test("emits when handler arity differs from delegate arity", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Imports Forms
Namespace mod_ev
   Class C
      Public f As Form
      Public Sub Setup()
         Me.f.OnClick = AddressOf NoArgsHandler
      End Sub
      Public Sub NoArgsHandler()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///ev.bas", code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///ev.bas", code),
        indexer,
      );
      const diag = expectDiagnostic(diags, DiagnosticCodes.EventSignatureMismatch);
      assert.match(diag.message, /assinatura incompat/i);
    });

    test("emits no diagnostic when handler signature matches the delegate", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Imports Forms
Namespace mod_ev2
   Class C
      Public f As Form
      Public Sub Setup()
         Me.f.OnClick = AddressOf GoodHandler
      End Sub
      Public Sub GoodHandler(Sender As TObject)
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///ev2.bas", code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///ev2.bas", code),
        indexer,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.EventSignatureMismatch);
    });
  });

  // -------------------------------------------------------------------------
  // unsupported-member — System Library marks a symbol with isUnsupported=true
  // -------------------------------------------------------------------------
  describe("unsupported-member", () => {
    // Loaded from `docs/example/diagnostics/unsupported-member/trigger.bas`.
    // The example header also asserts the diagnostic line — drift between the
    // example and the linter behaviour shows up as a failure here.
    test("emits when a property flagged as unsupported is accessed", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = loadExample("diagnostics/unsupported-member/trigger.bas");
      const header = parseExampleHeader(code);
      assert.equal(header.diagnostics.length, 1);
      const declared = header.diagnostics[0]!;
      assert.equal(declared.code, DiagnosticCodes.UnsupportedMember);

      indexer.updateFileContent("file:///unsup.bas", code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///unsup.bas", code),
        indexer,
      );
      const diag = expectDiagnostic(diags, DiagnosticCodes.UnsupportedMember, "PopupMenu");
      const payload = (diag as { data?: { member?: string; typeName?: string } }).data;
      assert.equal(payload?.member, "PopupMenu");
      assert.match(diag.message, /n[aã]o é suportado/i);
      // The header reports a 1-based line; convert to the 0-based range start.
      assert.equal(diag.range.start.line, declared.line - 1);
    });

    test("does NOT emit when a supported property is accessed", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Imports Forms
Namespace mod_unsup_ok
   Class C
      Public Sub Run()
         Dim g As Grid
         Dim n As Integer
         n = g.ColCount
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///unsup_ok.bas", code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///unsup_ok.bas", code),
        indexer,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.UnsupportedMember);
    });

    test("respects an inline data7:disable-line suppression directive", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Imports Forms
Namespace mod_supp
   Class C
      Public Sub Run()
         Dim g As Grid
         g.PopupMenu = Nothing ' data7:disable-line unsupported-member
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///supp.bas", code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///supp.bas", code),
        indexer,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.UnsupportedMember);
    });

    test("disable-next-line suppresses the following line", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Imports Forms
Namespace mod_supp2
   Class C
      Public Sub Run()
         Dim g As Grid
         ' data7:disable-next-line unsupported-member
         g.PopupMenu = Nothing
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///supp2.bas", code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///supp2.bas", code),
        indexer,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.UnsupportedMember);
    });
  });

  // -------------------------------------------------------------------------
  // not-enumerable — `For Each` over a type without Count+indexer
  // -------------------------------------------------------------------------
  describe("not-enumerable", () => {
    // Loaded from `docs/example/` to keep the canonical example and the
    // regression test in lockstep (see testing.mdc § Coverage expectations).
    test("does NOT emit when iterating a Collections.StringList (has Count + Strings)", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = loadExample("sugar/for-each/01-stringlist-explicit-type.bas");
      const header = parseExampleHeader(code);
      assert.equal(header.diagnostics.length, 0, "example header must declare @diagnostics: none");

      indexer.updateFileContent("file:///iter_ok.bas", code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///iter_ok.bas", code),
        indexer,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.NotEnumerable);
    });

    test("emits when iterating a type that has no Count property", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_iter_bad
   Class TNotIterable
      Public foo As String
   End Class
   Class C
      Public Sub Run()
         Dim x As TNotIterable
         For Each item In x
            ' iterate
         Next
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///iter_bad.bas", code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///iter_bad.bas", code),
        indexer,
      );
      const diag = expectDiagnostic(diags, DiagnosticCodes.NotEnumerable, "TNotIterable");
      const payload = (diag as { data?: { code?: string; typeName?: string } }).data;
      assert.equal(payload?.code, DiagnosticCodes.NotEnumerable);
      assert.equal(payload?.typeName, "TNotIterable");
    });

    test("emits a Variant-typed warning when the operand type cannot be resolved", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_iter_unknown
   Class C
      Public Sub Run()
         For Each item In unknownVar
            ' iterate
         Next
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///iter_unknown.bas", code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///iter_unknown.bas", code),
        indexer,
      );
      const diag = expectDiagnostic(diags, DiagnosticCodes.NotEnumerable);
      const payload = (diag as { data?: { typeName?: string } }).data;
      assert.equal(payload?.typeName, "Variant");
    });
  });

  // -------------------------------------------------------------------------
  // implicit TObject inheritance
  //
  // Every workspace class without an explicit `Inherits` clause inherits
  // from TObject by default (mirrors Delphi semantics). The linter must NOT
  // emit `unknown-member` for inherited members like Free/Create/Destroy.
  // -------------------------------------------------------------------------
  describe("implicit TObject inheritance", () => {
    test("does NOT emit unknown-member for .Free() on a class without Inherits", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_card
   Class TCardController
      Public Sub Run()
      End Sub
   End Class
   Class TCardForm
      Public Sub Open()
         Dim ctrl As TCardController
         ctrl.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///implicit_tobject.bas", code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///implicit_tobject.bas", code),
        indexer,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
    });

    test("still emits unknown-member for a member that is NOT on TObject", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_card2
   Class TCardController
      Public Sub Run()
      End Sub
   End Class
   Class TCardForm
      Public Sub Open()
         Dim ctrl As TCardController
         ctrl.DoesNotExist()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///implicit_tobject_neg.bas", code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///implicit_tobject_neg.bas", code),
        indexer,
      );
      expectDiagnostic(diags, DiagnosticCodes.UnknownMember, "DoesNotExist");
    });
  });

  // -------------------------------------------------------------------------
  // unknown-member with did-you-mean suggestions
  // -------------------------------------------------------------------------
  describe("unknown-member", () => {
    test("attaches up to 3 Levenshtein suggestions to the payload", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Imports Forms
Namespace mod_typo
   Class C
      Public Sub Run()
         Dim f As Form
         f.Aling = 1
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///typo.bas", code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///typo.bas", code),
        indexer,
      );
      const diag = expectDiagnostic(diags, DiagnosticCodes.UnknownMember);
      const payload = (diag as { data?: { code?: string; suggestions?: string[] } }).data;
      assert.equal(payload?.code, DiagnosticCodes.UnknownMember);
      assert.ok(Array.isArray(payload?.suggestions));
      // Form inherits Align through its TControl ancestor — should suggest it.
      assert.ok(
        payload.suggestions.length === 0 ||
          payload.suggestions.some((s) => s.toLowerCase() === "align"),
        `expected Align in suggestions, got ${JSON.stringify(payload?.suggestions)}`,
      );
    });

    test("accepts indexed properties accessed with bracket arguments", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///grid_cells_brackets.bas";
      const code = `Imports Forms
Namespace mod_grid_cells
   Class C
      Public Sub Run()
         Dim g As Grid
         Dim value As String
         value = g.Cells[0, 1]
         g.Cells[0, 1] = "ok"
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

      assert.ok(!diags.some((d) => d.code === "expected-token"), JSON.stringify(diags));
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("accepts parenthesized expressions as indexed property bracket arguments", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///indexed_property_expression_arg.bas";
      const code = `Namespace mod_indexed_property_expression
   Class GridLike
      Property Row As Integer
      Property RowCount As Integer
      Property Cells(pCol As Integer, pRow As Integer) As String
   End Class

   Class C
      Public Sub Run()
         Dim gdrRetornos As GridLike
         If gdrRetornos.Row < gdrRetornos.RowCount And gdrRetornos.Cells[1, (gdrRetornos.Row + 1_)] <> "" Then
         End If
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

      assert.ok(!diags.some((d) => d.code === "expected-token"), JSON.stringify(diags));
      expectDiagnostic(diags, DiagnosticCodes.LineContinuationWithoutBreak);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("does not flag numeric separators as line continuations", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///numeric_separator_not_continuation.bas";
      const code = `Namespace mod_numeric_separator
   Class C
      Public Sub Run()
         Dim value As Integer
         value = 1_000
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

      expectNoDiagnostic(diags, DiagnosticCodes.LineContinuationWithoutBreak);
    });

    test("rejects bracket arguments on methods and validates indexed property argument types", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///method_bracket_calls.bas";
      const code = `Namespace mod_method_brackets
   Class Teste
      Property MinhaProp(p1 As Integer, p2 As Integer) As Integer
         Get
            MinhaProp = p1 + p2
         End Get
      End Property

      Function Teste3(p1 As String, p2 As Integer) As String
         Teste3 = p1 + "-" + p2.ToString()
      End Function
   End Class

   Class Parser
      Public Shared Function stringToDouble(pValue As String) As Double
         stringToDouble = 0.56
      End Function
   End Class

   Class C
      Public Sub Run()
         Dim _class As Teste = New Teste()
         Dim ok As Integer
         Dim badText As String
         Dim parsed As Double
         ok = _class.MinhaProp[1, 3]
         ok = _class.MinhaProp["Teste", 3]
         badText = _class.Teste3["23", 34]
         parsed = Parser.stringToDouble["0,56"]
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

      expectDiagnostic(diags, DiagnosticCodes.TypeMismatch, "String");
      const bracketCallDiags = diags.filter(
        (d) => d.code === DiagnosticCodes.CallParenthesesMismatch,
      );
      assert.equal(bracketCallDiags.length, 2, JSON.stringify(diags));
    });

    test("accepts bracket access for native arrays and matrices", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///native_arrays_brackets.bas";
      const code = `Namespace mod_native_arrays
   Class C
      Public Sub Run()
         Dim values(10) As Integer
         Dim matrix(10, 5) As Integer
         Dim value As Integer
         value = values[0]
         value = matrix[0, 1]
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

      expectNoDiagnostic(diags, DiagnosticCodes.DefaultIndexerMissing);
      expectNoDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("recognizes Data7 form members and TDateTime DaySpan from the system library", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///formbuttons_members.bas";
      const code = `Imports Forms
Namespace mod_formbuttons
   Class C
      Public Sub Run()
         Dim conciliacao As FormButtons = New FormButtons()
         Dim handler As Variant
         conciliacao.btnOK.OnClick = handler

         Dim group As ControlGroup = New ControlGroup()
         group.Text = ""

         Dim button As CommandButton = New CommandButton()
         button.Text = "&Anterior"

         Dim startDate As TDateTime
         Dim endDate As TDateTime
         If startDate.DaySpan(endDate) > 3 Then
         End If
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });
  });

  // -------------------------------------------------------------------------
  // duplicate-declaration
  // -------------------------------------------------------------------------
  describe("duplicate-declaration", () => {
    test("emits error for duplicate local variable inside the same method", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_dup
   Class C
      Public Sub Run()
         Dim x As Integer
         Dim x As String
      End Sub
   End Class
End Namespace`;
      const uri = "file:///dup_local.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      const diag = expectDiagnostic(
        diags,
        DiagnosticCodes.DuplicateDeclaration,
        "Declaração duplicada: o identificador 'x'",
      );
      assert.equal(diag.relatedInformation?.length, 1);
      assert.equal(diag.relatedInformation?.[0]?.location.range.start.line, 3);
    });

    test("emits error for local variable with same name as parameter inside the same method", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_dup
   Class C
      Public Sub Run(x As Integer)
         Dim x As String
      End Sub
   End Class
End Namespace`;
      const uri = "file:///dup_param.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(
        diags,
        DiagnosticCodes.DuplicateDeclaration,
        "Declaração duplicada: o identificador 'x'",
      );
    });

    test("does NOT emit error for local variable with same name as class member in the same context (shadowing is allowed)", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_dup
   Class C
      Private value As Integer
      Public Sub Run()
         Dim value As String
      End Sub
   End Class
End Namespace`;
      const uri = "file:///dup_member.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.DuplicateDeclaration);
    });

    test("does NOT emit error for local variable matching class member of different context (Shared vs Instance)", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_dup
   Class C
      Private value As Integer
      Public Shared Sub Run()
         Dim value As String
      End Sub
   End Class
End Namespace`;
      const uri = "file:///dup_member_shared.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.DuplicateDeclaration);
    });

    test("does NOT emit error for a member with the same name as its class", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace Coluna
   Class Coluna
      Public Coluna As String
   End Class
End Namespace`;
      const uri = "file:///dup_class_member_name.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.DuplicateDeclaration);
    });

    test("emits error for duplicate class fields", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_dup
   Class C
      Private field As Integer
      Private field As String
   End Class
End Namespace`;
      const uri = "file:///dup_fields.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(
        diags,
        DiagnosticCodes.DuplicateDeclaration,
        "Membro duplicado: o nome 'field'",
      );
    });

    test("allows duplicate class methods with the same signature but emits a warning", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_dup
   Class C
      Public Function Normalize(pValue As String) As String
         Normalize = pValue
      End Function
      Public Function Normalize(pValue As String) As String
         Normalize = pValue
      End Function
   End Class
End Namespace`;
      const uri = "file:///dup_method_signature.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      const diag = expectDiagnostic(
        diags,
        DiagnosticCodes.DuplicateDeclaration,
        "Membro duplicado: a classe 'C' já declara um método 'Normalize' com a mesma assinatura",
      );
      assert.equal(diag.severity, vscode.DiagnosticSeverity.Warning);
    });

    test("allows a class whose name equals its namespace ignoring case", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace regex
   Class Regex
      Public Function Match() As Boolean
         Match = True
      End Function
   End Class
End Namespace`;
      const uri = "file:///namespace_class_name.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.DuplicateDeclaration);
    });

    test("namespace and class share name and namespace contains top level members", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace regex
   Public Function TopLevelFunc() As String
      TopLevelFunc = "ok"
   End Function
   Class Regex
      Public Sub Run()
      End Sub
   End Class
End Namespace`;
      const uri = "file:///namespace_class_name_top.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.DuplicateDeclaration);
    });

    test("does NOT emit error for method overloads (same name but different parameter count/types)", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_dup
   Class C
      Public Sub Process(x As Integer)
      End Sub
      Public Sub Process(x As String)
      End Sub
   End Class
End Namespace`;
      const uri = "file:///dup_overload.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.DuplicateDeclaration);
    });

    test("does NOT emit error for namespace-level method overloads", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace console
   Sub log(pMessage As Variant)
   End Sub
   Sub log(pMessage1 As Variant, pMessage2 As Variant)
   End Sub
   Sub time(pMessage As Variant)
   End Sub
   Sub time(pTime As TDateTime, pMessage As Variant)
   End Sub
End Namespace`;
      const uri = "file:///dup_namespace_overload.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.DuplicateDeclaration);
    });

    test("does NOT emit error for method with same name/params but different isShared state", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_dup
   Class C
      Public Sub Process(x As Integer)
      End Sub
      Public Shared Sub Process(x As Integer)
      End Sub
   End Class
End Namespace`;
      const uri = "file:///dup_shared_method.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.DuplicateDeclaration);
    });

    test("emits error for duplicate class name in same namespace", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_dup
   Class MyClass
   End Class
   Class MyClass
   End Class
End Namespace`;
      const uri = "file:///dup_class.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(
        diags,
        DiagnosticCodes.DuplicateDeclaration,
        "Declaração duplicada: o tipo/símbolo 'MyClass'",
      );
    });

    test("emits error for class name conflicting with imported symbol or global", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Imports Forms
Namespace mod_dup
   Class Grid
   End Class
End Namespace`;
      const uri = "file:///dup_imported.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(
        diags,
        DiagnosticCodes.DuplicateDeclaration,
        "conflita com o tipo importado",
      );
    });

    test("does NOT emit error when a local namespace method shadows an imported method", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const menuUri = "file:///frmMenu.bas";
      const menuCode = `Namespace frmMenu
   Sub Dispose()
   End Sub
End Namespace`;
      indexer.updateFileContent(menuUri, menuCode);

      const uri = "file:///frmConciliacaoManual.bas";
      const code = `Imports frmMenu
Namespace frmConciliacaoManual
   Sub Dispose()
   End Sub
End Namespace`;
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

      expectNoDiagnostic(diags, DiagnosticCodes.DuplicateDeclaration);
    });
  });

  // -------------------------------------------------------------------------
  // unknown-type
  // -------------------------------------------------------------------------
  describe("unknown-type", () => {
    const setupResources = (): WorkspaceSymbolIndexer => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const resourcesUri = "file:///dummy/mod_resources_unknown.bas";
      const resourcesCode = `Namespace mod_resources_unknown
   Class TResourceLoader
   End Class
End Namespace`;
      indexer.updateFileContent(resourcesUri, resourcesCode);
      registerOpenDocument(resourcesUri, "dummy/mod_resources_unknown.bas");

      registerOpenDocument("file:///dummy/test_file_unknown.bas", "dummy/test_file_unknown.bas");
      return indexer;
    };

    const runLinter = (code: string) => {
      const indexer = setupResources();
      const uri = "file:///dummy/test_file_unknown.bas";
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code, { register: false });
      return DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    };

    test("emits unknown-type diagnostic for completely unknown types", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Public Codigo As StringTipoNaoExiste
      Public Nome As Stringjdk
      Public Function GetVal() As DoublesssTipoNaoExiste
      End Function
   End Class
End Namespace`);
      expectDiagnostic(diags, DiagnosticCodes.UnknownType, "StringTipoNaoExiste");
      expectDiagnostic(diags, DiagnosticCodes.UnknownType, "Stringjdk");
      expectDiagnostic(diags, DiagnosticCodes.UnknownType, "DoublesssTipoNaoExiste");
    });

    test("emits unknown-type diagnostic for qualified unknown types", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Private _form As Forms.Form.naoexiste
   End Class
End Namespace`);
      expectDiagnostic(diags, DiagnosticCodes.UnknownType, "Forms.Form.naoexiste");
    });

    test("does NOT emit unknown-type diagnostic for valid qualified types", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Private _form As Forms.Form
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownType);
    });
  });

  // -------------------------------------------------------------------------
  // missing-mybase-new
  // -------------------------------------------------------------------------
  describe("missing-mybase-new", () => {
    const runLinter = (code: string) => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const uri = "file:///mybase_new_test.bas";
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code, { register: false });
      return DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    };

    test("emits warning when Sub New does not call MyBase.New()", () => {
      const diags = runLinter(`Namespace mod_ctor
   Class TProduto
      Public Codigo As String

      Sub New(pCodigo As String)
         me.Codigo = pCodigo
      End Sub
   End Class
End Namespace`);
      const diag = expectDiagnostic(diags, DiagnosticCodes.MissingMyBaseNew);
      assert.match(diag.message, /MyBase\.New/i);
      assert.match(diag.message, /TProduto/);
      const payload = (diag as { data?: { className?: string } }).data;
      assert.equal(payload?.className, "TProduto");
    });

    test("does NOT emit when Sub New calls MyBase.New()", () => {
      const diags = runLinter(`Namespace mod_ctor_ok
   Class TProduto
      Public Codigo As String

      Sub New(pCodigo As String)
         MyBase.New()
         me.Codigo = pCodigo
      End Sub
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.MissingMyBaseNew);
    });

    test("does NOT emit for regular Subs without 'New' name", () => {
      const diags = runLinter(`Namespace mod_ctor_sub
   Class THelper
      Sub Initialize()
         me.Ready = True
      End Sub
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.MissingMyBaseNew);
    });

    test("emits for inheriting class Sub New without MyBase.New(args)", () => {
      const diags = runLinter(`Namespace mod_ctor_inherit
   Class TAnimal
      Public Nome As String

      Sub New(pNome As String)
         me.Nome = pNome
      End Sub
   End Class
End Namespace`);
      const diag = expectDiagnostic(diags, DiagnosticCodes.MissingMyBaseNew);
      // Message should mention how to pass args to MyBase.New for inherited classes
      assert.match(diag.message, /MyBase\.New/i);
    });

    test("does NOT emit when MyBase.New() is called inside an If block within Sub New", () => {
      const diags = runLinter(`Namespace mod_ctor_if
   Class TConditional
      Sub New(pFlag As Boolean)
         If pFlag Then
            MyBase.New()
         Else
            MyBase.New()
         End If
         me.Flag = pFlag
      End Sub
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.MissingMyBaseNew);
    });
  });

  // -------------------------------------------------------------------------
  // missing-mybase-free
  // -------------------------------------------------------------------------
  describe("missing-mybase-free", () => {
    const runLinter = (code: string) => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const uri = "file:///dummy/test_free.bas";
      // Register class in mock document indexer
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code, { register: true });
      return DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    };

    test("emits warning when class has no Sub Free", () => {
      const diags = runLinter(`Namespace mod_free
   Class C
   End Class
End Namespace`);
      expectDiagnostic(
        diags,
        DiagnosticCodes.MissingMyBaseFree,
        "não possui o método 'Sub Free()'",
      );
    });

    test("emits warning when Sub Free has no MyBase.Free()", () => {
      const diags = runLinter(`Namespace mod_free
   Class C
      Public Sub Free()
         ' no call
      End Sub
   End Class
End Namespace`);
      expectDiagnostic(diags, DiagnosticCodes.MissingMyBaseFree, "não chama 'MyBase.Free()'");
    });

    test("emits no warning when Sub Free has MyBase.Free()", () => {
      const diags = runLinter(`Namespace mod_free
   Class C
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.MissingMyBaseFree);
    });

    test("does not emit warning for TEnum classes", () => {
      const diags = runLinter(`Namespace mod_free
   Enum MyEnum
      Value1
      Value2
   End Enum
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.MissingMyBaseFree);
    });
  });

  // -------------------------------------------------------------------------
  // declaration-parentheses-mismatch & function-read-self declaration line
  // -------------------------------------------------------------------------
  describe("declaration-parentheses-mismatch", () => {
    const runLinter = (code: string) => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const uri = "file:///decl_parens_test.bas";
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);
      return DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    };

    test("emits warning when function is declared without parameters and without parentheses", () => {
      const diags = runLinter(`Namespace mod_test
   Class C
      Shared Function BandeiraProduto As TObject
         BandeiraProduto = Nothing
      End Function
   End Class
End Namespace`);
      expectDiagnostic(diags, DiagnosticCodes.DeclarationParenthesesMismatch, "BandeiraProduto");
      expectNoDiagnostic(diags, DiagnosticCodes.FunctionReadSelf);
    });

    test("does NOT emit warning when function is declared with parentheses", () => {
      const diags = runLinter(`Namespace mod_test
   Class C
      Shared Function BandeiraProduto() As TObject
         BandeiraProduto = Nothing
      End Function
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.DeclarationParenthesesMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.FunctionReadSelf);
    });

    test("does NOT emit warning when function is declared with parameters", () => {
      const diags = runLinter(`Namespace mod_test
   Class C
      Shared Function Load(pValue As String) As TObject
         Load = Nothing
      End Function
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.DeclarationParenthesesMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.FunctionReadSelf);
    });

    test("does NOT emit function-read-self when function name is dot-preceded", () => {
      const diags = runLinter(`Namespace mod_test
   Class C
      Function First() As TObject
         First = CType(MyBase.First(), TObject)
      End Function
      Function Last() As TObject
         Last = CType(MyBase.Last, TObject)
      End Function
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.FunctionReadSelf);
    });

    test("does NOT emit unknown-symbol for parameters inside Delegate declarations", () => {
      const diags = runLinter(`Namespace mod_test
   Delegate Function CardRecordFindDelegate(pValue As C, i As Integer, extra As Variant) As Boolean
   Class C
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
    });

    test("does NOT emit parentheses warning for MyBase.First() or MyBase.Last parameterless calls when overloads exist on base class", () => {
      const diags = runLinter(`Namespace mod_test
   Class BaseClass
      Function First() As TObject
         First = Nothing
      End Function
      Function First(pLimit As Integer) As BaseClass
         First = Nothing
      End Function
      Function Last() As TObject
         Last = Nothing
      End Function
      Function Last(pLimit As Integer) As BaseClass
         Last = Nothing
      End Function
   End Class

   Class SubClass
      Inherits BaseClass
      Function First() As TObject
         First = CType(MyBase.First(), TObject)
      End Function
      Function Last() As TObject
         Last = CType(MyBase.Last, TObject)
      End Function
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
    });

    test("emits warning instead of parser error when object creation omits empty parentheses", () => {
      const diags = runLinter(`Namespace mod_test
   Class C
      Public Sub Build()
         Dim cmd As PowerCommand = New PowerCommand
      End Sub
   End Class

   Class PowerCommand
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      const diag = expectDiagnostic(
        diags,
        DiagnosticCodes.ObjectCreationParenthesesMissing,
        "PowerCommand",
      );
      assert.equal(diag.severity, 1);
      assert.ok(!diags.some((d) => d.code === "expected-token"), JSON.stringify(diags));
    });
  });

  describe("scope and type compatibility regressions", () => {
    const runLinter = (uri: string, code: string) => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);
      return DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    };

    test("keeps every variable from a multi-variable Dim declaration in the current scope", () => {
      const diags = runLinter(
        "file:///multi_dim_scope.bas",
        `Imports Collections
Namespace mod_scope
   Class C
      Public Sub Run()
         Dim listTemp As New StringList, i As Integer
         listTemp.Add("x")
         Dim j As Integer, _count As Integer = 10
         i = _count
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
    });

    test("resolves private module constants declared before class code", () => {
      const diags = runLinter(
        "file:///winapi_constants.bas",
        `Private Const GWL_STYLE = -16
Private Const WS_BORDER = 8388608
Private Const SWP_NOMOVE = 2
Private Const SWP_NOSIZE = 1
Private Const SWP_NOZORDER = 4
Private Const SWP_FRAMECHANGED = 32

Class C
   Public Sub Run()
      Dim style As Integer = GWL_STYLE
      style = style And Not WS_BORDER
      style = style Or SWP_NOMOVE Or SWP_NOSIZE Or SWP_NOZORDER Or SWP_FRAMECHANGED
   End Sub
End Class`,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
    });

    test("resolves imported workspace classes and marks the import as used", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const serviceUri = "file:///servicos_usuarios.bas";
      const serviceCode = `Namespace servicos_usuarios
   Class ServicosUsuarios
      Public Shared Function logado() As String
         logado = ""
      End Function
   End Class
End Namespace`;
      indexer.updateFileContent(serviceUri, serviceCode);
      createMockDoc(serviceUri, serviceCode);

      const consumerUri = "file:///consumer_imports.bas";
      const consumerCode = `Imports servicos_usuarios
Namespace mod_consumer
   Class C
      Public Sub Build()
         Dim usuario As String
         usuario = ServicosUsuarios.logado()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(consumerUri, consumerCode);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc(consumerUri, consumerCode),
        indexer,
      );

      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
      expectNoDiagnostic(diags, DiagnosticCodes.UnusedImport);
    });

    test("resolves imported namespace symbols used as factories and static helpers", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();

      const helpersUri = "file:///stringHelpers.bas";
      const helpersCode = `Namespace stringHelpers
   Class StringHelper
      Public Shared Function integerToStringMasc(row As Integer, mask As String, size As Integer) As String
         integerToStringMasc = ""
      End Function
   End Class
End Namespace`;
      indexer.updateFileContent(helpersUri, helpersCode);
      createMockDoc(helpersUri, helpersCode);

      const configUri = "file:///PixConfig.bas";
      const configCode = `Namespace mod_pix
   Class PixConfig
      Public Shared Function FromContaFinanceira(conta As Integer) As PixConfig
         FromContaFinanceira = New PixConfig()
      End Function
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(configUri, configCode);
      createMockDoc(configUri, configCode);

      const serviceUri = "file:///PixService.bas";
      const serviceCode = `Namespace mod_pix
   Class PixService
      Public Shared Function Load(cfg As PixConfig) As PixService
         Load = New PixService()
      End Function
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(serviceUri, serviceCode);
      createMockDoc(serviceUri, serviceCode);

      const consumerUri = "file:///consumer_helpers.bas";
      const consumerCode = `Imports stringHelpers
Imports mod_pix
Namespace mod_consumer
   Class C
      Public Sub Build()
         Dim texto As String
         texto = stringHelper.integerToStringMasc(1, "0", 5)
         Dim cfg As PixConfig = PixConfig.FromContaFinanceira(1)
         Dim svc As PixService = PixService.Load(cfg)
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(consumerUri, consumerCode);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc(consumerUri, consumerCode),
        indexer,
      );

      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
      expectNoDiagnostic(diags, DiagnosticCodes.UnusedImport);
    });

    test("keeps imports required by a directly used module dependency graph", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(
        "file:///helpers.bas",
        `Namespace helpers
   Class Helper
   End Class
End Namespace`,
      );
      indexer.updateFileContent(
        "file:///rules.bas",
        `Imports Forms
Imports mod_whatsapp
Imports helpers
Namespace mod_rules
   Class Rules
   End Class
End Namespace`,
      );
      indexer.updateFileContent(
        "file:///screen.bas",
        `Imports mod_rules
Namespace mod_screen
   Class Screen
   End Class
End Namespace`,
      );

      const consumerUri = "file:///consumer_transitive_imports.bas";
      const consumerCode = `Imports mod_screen
Imports Forms
Imports mod_whatsapp
Imports helpers
Namespace mod_consumer
   Class C
      Public Sub Build()
         Dim screen As Screen
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(consumerUri, consumerCode);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc(consumerUri, consumerCode),
        indexer,
      );

      expectNoDiagnostic(diags, DiagnosticCodes.UnusedImport);
    });

    test("allows widening numeric assignments from Integer to Double", () => {
      const diags = runLinter(
        "file:///numeric_widening.bas",
        `Namespace mod_numeric
   Class C
      Public Sub Build()
         Dim amount As Double = 0.00
         amount = 1
      End Sub
   End Class
End Namespace`,
      );

      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("recognizes the global dateUtils formatter", () => {
      const diags = runLinter(
        "file:///date_utils.bas",
        `Namespace mod_dates
   Class C
      Public Sub Build()
         Dim formatted As String = dateUtils.toStringFormat("yyyymmdd", DateTime().Now())
      End Sub
   End Class
End Namespace`,
      );

      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
    });

    test("allows assigning a workspace class to TObject through implicit inheritance", () => {
      const diags = runLinter(
        "file:///implicit_tobject_assignment.bas",
        `Namespace mod_assign
   Class TTObject
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class C
      Function Take() As TTObject
         Take = New TTObject()
      End Function

      Public Sub Run()
         Dim value As TObject = me.Take()
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("accepts assignment from a qualified workspace type to its imported simple name", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const productUri = "file:///mod_product.bas";
      const productCode = `Namespace mod_product
   Class Product
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(productUri, productCode);
      registerOpenDocument(productUri, "mod_product.bas");

      const usageUri = "file:///qualified_product_assignment.bas";
      const usageCode = `Imports mod_product

Function Fetch() As mod_product.Product
End Function

Dim value As Product = Fetch()`;
      indexer.updateFileContent(usageUri, usageCode);
      const doc = createMockDoc(usageUri, usageCode);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);

      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("resolves project globals declared at the top level of Principal.bas", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      indexer.updateFileContent(
        "file:///modelo_usuario.bas",
        `Namespace modelo_usuario
   Class Usuario
      Public CodEmpresa As Integer
      Public CodFilial As Integer
   End Class
End Namespace`,
      );
      indexer.updateFileContent(
        "file:///modeloConciliacaoCartoes.bas",
        `Namespace modeloConciliacaoCartoes
   Class ConciliacaoCartoes
      Public CodCadastroOperadora As Integer
   End Class
End Namespace`,
      );
      indexer.updateFileContent(
        "file:///Principal.bas",
        `Imports modelo_usuario
Imports modeloConciliacaoCartoes
Dim _usuario As Usuario
Dim _modeloOperacaoConciliacao As ConciliacaoCartoes`,
      );

      const uri = "file:///frmConciliacaoManualEventos.bas";
      const code = `Namespace frmConciliacaoManualEventos
   Class Eventos
      Public Sub Run()
         Dim empresa As Integer = _usuario.CodEmpresa
         Dim filial As Integer = _usuario.CodFilial
         Dim cliente As Integer = _modeloOperacaoConciliacao.CodCadastroOperadora
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);

      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("selects the overload whose parameter types match the call arguments", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      indexer.updateFileContent(
        "file:///ModeloTitulo.bas",
        `Namespace ModeloTitulo
   Class Titulo
   End Class
End Namespace`,
      );
      indexer.updateFileContent(
        "file:///ModeloTitulos.bas",
        `Namespace ModeloTitulos
   Class Titulos
   End Class
End Namespace`,
      );
      indexer.updateFileContent(
        "file:///ControleTitulos.bas",
        `Namespace ControleTitulos
   Class ControleTitulos
      Function buscar(pCodEmpresa As Integer, pParametros As String) As Titulos
      End Function
      Function buscar(pCodEmpresa As Integer, pCodContaReceber As Integer) As Titulo
      End Function
   End Class
End Namespace`,
      );

      const uri = "file:///frmConciliacaoManualRegras.bas";
      const code = `Imports ModeloTitulo
Imports ModeloTitulos
Imports ControleTitulos
Namespace frmConciliacaoManualRegras
   Class C
      Public Sub Run()
         Dim _titulo As Titulo = New Titulo()
         Dim _controleTitulos As ControleTitulos = New ControleTitulos()
         _titulo = _controleTitulos.buscar(1, CInt("23"))
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("treats NULL as object-null, not Variant", () => {
      const diags = runLinter(
        "file:///null_object_assignment.bas",
        `Namespace mod_null
   Class TTObject
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class C
      Function First() As TTObject
         First = NULL
      End Function

      Public Sub Run()
         Dim value As TTObject = NULL
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("allows Unassigned for primitive and Variant values", () => {
      const diags = runLinter(
        "file:///unassigned_primitives.bas",
        `Namespace mod_unassigned
   Class C
      Public Sub Run()
         Dim i As Integer = Unassigned
         Dim s As String = Unassigned
         Dim v As Variant = Unassigned
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
    });

    test("does not mark an Else branch dead when an object/null comparison is unknown", () => {
      const diags = runLinter(
        "file:///unknown_null_condition.bas",
        `Namespace mod_dead_unknown
   Class C
      Public Sub Run(pHandler As Variant)
         If pHandler <> NULL Then
            pHandler = pHandler
         Else
            Throw New Exception("missing")
         End If
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.DeadCode);
    });

    test("does not mark inline comments after Return as dead code", () => {
      const diags = runLinter(
        "file:///return_inline_comment_dead_code.bas",
        `Namespace mod_return_comment
   Class TStringList
      Public Sub Add(pValue As String)
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class C
      Shared Function split(pString As String) As TStringList
         Dim _list As TStringList = New TStringList()
         Try
            _list.Add(pString)
         Catch ex As Exception
            Return _list ' data7:disable-line return-unrecommended
         End Try
         Return _list ' data7:disable-line return-unrecommended
      End Function

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.DeadCode);
    });

    test("marks a branch dead when a variable is known to be NULL", () => {
      const diags = runLinter(
        "file:///known_null_condition.bas",
        `Namespace mod_dead_known
   Class TTObject
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class C
      Public Sub Run()
         Dim obj As TTObject = New TTObject()
         obj = NULL
         If obj <> NULL Then
            obj.Free()
         End If
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`,
      );
      expectDiagnostic(diags, DiagnosticCodes.DeadCode);
    });

    test("accepts TypeOf ... Is checks against generic type references", () => {
      const diags = runLinter(
        "file:///generic_typeof.bas",
        `Namespace mod_generic_typeof
   Class TTObject
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTItem<T>
      Inherits TTObject
      Value As T
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTList<T>
      Function Unwrap(pObj As TTObject) As T
         If TypeOf pObj Is TTItem<T> Then
            Unwrap = TTItem<T>(pObj).Value
         Else
            Unwrap = CType(pObj, T)
         End If
      End Function

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("does not flag template-local generic assignments as concrete TObject mismatches", () => {
      const diags = runLinter(
        "file:///generic_template_assignments.bas",
        `Namespace mod_generic_assign
   Class TTObject
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTItem<T>
      Inherits TTObject
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTList<T>
      Private Function Wrap(pValue As T) As TTObject
         Wrap = New TTItem<T>()
      End Function

      Function Take() As T
         Take = CType(NULL, T)
      End Function

      Function Clone() As TTList<T>
         Dim _new As New TTList<T>()
         Clone = _new
      End Function

      Function Filter() As TTList<T>
         Dim _new As New TTList<T>()
         Dim _value As T = me.Take()
         Filter = _new
      End Function

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("does not treat unconstrained generic T as TObject for assignment checks", () => {
      const diags = runLinter(
        "file:///generic_unconstrained_assignment.bas",
        `Namespace mod_generic_open
   Class TTObject
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTItem<T>
      Inherits TTObject
      Value As T

      Sub Dispose()
         me.Value = Unassigned
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTList<T>
      Private Function Wrap(pValue As T) As TTObject
         Wrap = pValue
      End Function

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("rejects flat generic instantiations with different concrete type arguments", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generic_flat_covariant.bas";
      const code = `Namespace mod_generic_covariant
   Class TTObject
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class Product
      Inherits TTObject
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTList<T>
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTList_Product
      Function Clone() As TTList_Product
      End Function
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTList_TObject
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TUseCase
      Public Sub Run()
         Dim _list As TTList_Product
         Dim _list1 As TTList_TObject
         _list1 = _list.Clone()
         Dim _list2 As TTList_TObject = _list.Clone()
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);

      expectDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("accepts generic templates declared in another namespace file", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const templateUri = "file:///mod_tlist.bas";
      registerOpenDocument(templateUri, "mod_tlist.bas");
      const templateCode = `Namespace mod_tlist
   Class TTList<T>
      Sub Add(pValue As T)
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(templateUri, templateCode);

      const usageUri = "file:///teste.bas";
      const usageCode = `Imports mod_tlist

Dim _list As TTList<Integer> = New TTList<Integer>()`;
      indexer.updateFileContent(usageUri, usageCode);
      const doc = createMockDoc(usageUri, usageCode);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);

      expectNoDiagnostic(diags, DiagnosticCodes.UnknownTemplate);
      expectNoDiagnostic(diags, DiagnosticCodes.GenericArityMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.DuplicateDeclaration);
    });

    test("accepts members inherited by flat generic instantiations", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();

      const templateUri = "file:///mod_tlist.bas";
      registerOpenDocument(templateUri, "mod_tlist.bas");
      const templateCode = `Namespace mod_tlist
   Class TTComposerList
      Function ToString() As String
      End Function
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTList<T>
      Inherits TTComposerList
      Sub Push(pValue As T)
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(templateUri, templateCode);

      const productUri = "file:///mod_product.bas";
      registerOpenDocument(productUri, "mod_product.bas");
      const productCode = `Namespace mod_product
   Class Product
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(productUri, productCode);

      const usageUri = "file:///Principal.bas";
      registerOpenDocument(usageUri, "Principal.bas");
      const usageCode = `Imports mod_tlist
Imports mod_product

Dim _list As TTList<Product> = New TTList<Product>()

Print _list.ToString()`;
      indexer.updateFileContent(usageUri, usageCode);
      const flatList = indexer.findSymbolByName("TTList_Product");
      assert.equal(flatList?.inheritsFrom, "TTComposerList");

      const doc = createMockDoc(usageUri, usageCode);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);

      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
    });

    test("accepts inherited members on array-sugar generic lists without a precomputed flat class", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();

      const usageUri = "file:///Principal_array_sugar_lint.bas";
      registerOpenDocument(usageUri, "Principal.bas");
      const usageCode = `Imports mod_tlist
Imports mod_product

Dim _products[] As Product = [
   New Product()
]

Print _products.ToString()
Dim _last As Product = _products.Pop()`;
      indexer.updateFileContent(usageUri, usageCode);

      const templateUri = "file:///mod_tlist_array_sugar_lint.bas";
      registerOpenDocument(templateUri, "mod_tlist.bas");
      const templateCode = `Namespace mod_tlist
   Class TTComposerList
      Function ToString() As String
      End Function
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTList<T>
      Inherits TTComposerList
      Function Pop() As T
      End Function
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(templateUri, templateCode);

      const productUri = "file:///mod_product_array_sugar_lint.bas";
      registerOpenDocument(productUri, "mod_product.bas");
      const productCode = `Namespace mod_product
   Class Product
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(productUri, productCode);

      assert.equal(
        indexer.findSymbolByName("TTList_Product"),
        undefined,
        "test setup must not rely on the synthetic flat class cache",
      );

      const doc = createMockDoc(usageUri, usageCode);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);

      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("validates arity for generic templates declared in another namespace file", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const templateUri = "file:///mod_pair.bas";
      const templateCode = `Namespace mod_pair
   Class TPair<T, K>
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(templateUri, templateCode);

      const usageUri = "file:///pair_user.bas";
      const usageCode = `Imports mod_pair

Dim _pair As TPair<Integer>`;
      indexer.updateFileContent(usageUri, usageCode);
      const doc = createMockDoc(usageUri, usageCode);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);

      expectDiagnostic(diags, DiagnosticCodes.GenericArityMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownTemplate);
    });
  });

  test("groups statically unreachable branches into one dead-code diagnostic", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///dead_code_block.bas";
    const code = `Namespace mod_dead
   Class C
      Public Sub Run()
         If False Then
            Sql.Connection.StartTransaction()
            Sql.Connection.Commit()
            Dim queryValorPadroa As SQL.Command = New SQL.Command()
         End If
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const doc = createMockDoc(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    const deadCode = diags.filter((diag: any) => diag.code === DiagnosticCodes.DeadCode);

    assert.equal(deadCode.length, 1);
    assert.equal(deadCode[0]?.range.start.line, 4);
    assert.equal(deadCode[0]?.range.end.line, 6);
  });

  test("warns on Finally blocks due to compiler catch/finally bug", () => {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const uri = "file:///try_catch_finally_payload.bas";
    const code = `Namespace mod_try
   Class C
      Public Sub Run()
         Try
            Print("Try")
         Catch ex As Exception
            Print(ex.Message)
         Finally
            Print("Finally")
         End Try
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const doc = createMockDoc(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);

    const diag = expectDiagnostic(diags, LegacyDiagnosticCodes.FinallyBlockUnsupported);
    const payload = (diag as { data?: { isEmptyCatch?: boolean } }).data;
    assert.equal(payload?.isEmptyCatch, false);
  });

  test("marks empty Finally blocks in the finally-block-unsupported payload", () => {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const uri = "file:///try_catch_empty_finally_payload.bas";
    const code = `Namespace mod_try
   Class C
      Public Sub Run()
         Try
            Print("Try")
         Catch ex As Exception
            Print(ex.Message)
         Finally
         End Try
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const doc = createMockDoc(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);

    const diag = expectDiagnostic(diags, LegacyDiagnosticCodes.FinallyBlockUnsupported);
    const payload = (
      diag as {
        data?: { isEmptyFinally?: boolean; finallyLine?: number; finallyEndLine?: number };
      }
    ).data;
    assert.equal(payload?.isEmptyFinally, true);
    assert.equal(payload?.finallyLine, 7);
    assert.equal(payload?.finallyEndLine, 7);
  });

  test("accepts Finally blocks with an Assigned guard in Catch", () => {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const uri = "file:///try_catch_finally_wrapped.bas";
    const code = `Namespace mod_try
   Class C
      Public Sub Run()
         Try
            Print("Try")
         Catch ex As Exception
            If Assigned(ex) Then
               Print(ex.Message)
            End If
         Finally
            Print("Finally")
         End Try
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const doc = createMockDoc(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);

    const diag = diags.find((d: any) => d.code === LegacyDiagnosticCodes.FinallyBlockUnsupported);
    assert.ok(
      !diag,
      "Should NOT emit FinallyBlockUnsupported warning when catch body is wrapped with If Assigned",
    );
  });

  test("returns empty diagnostics array for data7-preview documents", () => {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const code = `Namespace mod_preview
   Class TTest
      Public Sub Run()
         Dim loader As TNonexistentLoader
      End Sub
   End Class
End Namespace`;
    const uri = "data7-preview:///dummy/preview_file.bas";
    const doc = createMockDoc(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    assert.equal(diags.length, 0);
  });

  test("accepts forms assignments with Font.Color, CharCase, line continuation and block If without Then", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///forms_compat.bas";
    const code = `Imports Forms
Namespace mod_forms
   Class C
      Public Sub Build()
         Dim txt As Forms.TextBox
         txt = New Forms.TextBox
         txt.CharCase = ccUpper
         txt.Color = 0
         txt.Font.Color = 0

         Dim lbl As Forms.StaticText
         lbl = New Forms.StaticText(txt)
         lbl.Text = ""
         lbl.Font.Color = 0

         If lbl.Text <> ""
            txt.Text = "" +_
               "A"
         End If
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
    assert.ok(!diags.some((d) => d.code === "expected-token"), JSON.stringify(diags));
  });

  test("accepts TDateTime MilliSecondOf invoked with parentheses", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///datetime_compat.bas";
    const code = `Namespace mod_time
   Class C
      Public Function Stamp() As String
         Return DateTime().MilliSecondOf().ToString()
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
    assert.ok(!diags.some((d) => d.code === "expected-token"), JSON.stringify(diags));
  });

  test("accepts comments after Then keyword in If statements (multi-line)", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///if_comment.bas";
    const code = `Namespace mod_if
   Class C
      Public Sub Run()
         If True Then ' comment
            Dim x As Integer = 1
         End If
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    assert.ok(!diags.some((d) => d.code === "expected-token"), JSON.stringify(diags));
  });

  test("accepts TColor numeric assignments and compatibility", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///color_compat.bas";
    const code = `Namespace mod_color
   Class C
      Public Sub Run()
         Dim c As TColor
         c = 0
         Dim i As Integer = 0
         c = i
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
  });

  test("resolves delegate function return types on invocations", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///delegate_call.bas";
    const code = `Namespace mod_del
   Delegate Function Pred() As String
   Class C
      Public myDel As Pred = NULL
      Public Sub Run()
         Dim s As String
         s = me.myDel()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
  });

  test("allows return assignment to method/function name without emitting diagnostics", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///return_assignment.bas";
    const code = `Namespace mod_ret
   Class C
      Shared Function FromJson(pJson As TJSONObject) As C
         Dim _value As New C()
         FromJson = _value
      End Function
   End Class
   Class CList
      Shared Function FromJson(pJson As TJSONArray) As CList
         Dim _value As New CList()
         FromJson = _value
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.InvalidAssignmentTarget);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
  });

  test("accepts function return assignment despite a same-named system member", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///delete_return.bas";
    const code = `Namespace mod_http
   Class Client
      Public Function Delete() As String
         Delete = "ok"
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.InvalidAssignmentTarget);
  });

  test("prefers a local variable over a same-named system member", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///local_count.bas";
    const code = `Namespace mod_local
   Class C
      Public Sub Run()
         Dim count As Integer = 0
         count = count + 1
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.InvalidAssignmentTarget);
  });

  test("prefers class field or property over same-named global method", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const mockUri = "file:///mock_global.bas";
    indexer.updateFileContent(
      mockUri,
      `Namespace ns
   Class GlobalMethods
      Public Sub Delete()
      End Sub
   End Class
End Namespace`,
    );
    const uri = "file:///class_member_override.bas";
    const code = `Namespace mod_local
   Class Client
      Public Delete As String
      Public Sub Run()
         Delete = "yes"
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.InvalidAssignmentTarget);
  });

  test("recognizes Developer Studio compatibility members and native Continue", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///compat_members.bas";
    const code = `Imports Collections
Namespace mod_compat
   Class C
      Public Function Run(pValue As String) As Double
         Dim objects As TObjectList = New TObjectList()
         Continue
         Run = CDbl(pValue.Left(2)).RoundTo(-4)
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownType);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
  });

  test("supports Whatsapp types, currency, TDateTime, TField members and bitwise/implicit type conversions", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///whatsapp_conversions.bas";
    const code = `Namespace mod_whatsapp_test
   Class Test
      Public CreatedAt As TDateTime
      Public ExpiresAt As TDateTime
      
      Public Sub Run(pPath As String, pQuery As SQL.Command)
         ' Implicit conversion of numeric to TDateTime
         CreatedAt = 0
         ExpiresAt = 0

         ' ToInt32 on TDateTime
         If CreatedAt.ToInt32() <> 18991230 Then
            ' SaveToFile on TField
            pQuery.Field("ArquivoFisico").SaveToFile(pPath)
         End If

         ' Whatsapp Send & Message
         Dim _send As WhatsappSend = New WhatsappSend()
         Dim _message As WhatsappMessage = New WhatsappMessage()
         _message.Recipient = "5511999999999"
         _message.Subject = "Subject"
         _message.Content = "Content"
         _message.Signature = "Signature"
         _message.Attachments.Add(pPath)
         
         Dim success As Boolean = _send.SendMessage(_message)

         ' Currency type usage
         Dim price As Currency = 10.5

         ' Boolean to Long conversion + bitwise operators
         Dim style As Long = 100
         Dim showBorder As Boolean = True
         Dim WS_BORDER As Long = 2048
         If showBorder Then
            style = style Or WS_BORDER
         Else
            style = style And Not WS_BORDER
         End If
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    assert.deepEqual(diags, []);
  });

  test("supports Clipboard, Math, String.Insert, Variant arrays, scoping and hex parsing", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///clipboard_math_test.bas";
    const code = `Namespace mod_test_clipboard
   Function FormatValueToDouble(pValor As String) As Double
      FormatValueToDouble = CDbl(pValor.Replace(".", ","))
   End Function

   Function ValidateValue(pValor As Double) As String
      Dim s As String = Math.Truncate(pValor, 2).toString()
      ValidateValue = s
   End Function

   Class Test
      Public Sub Run(pPath As String)
         ' Clipboard
         Dim _clip As New Clipboard()
         _clip.SetText("Test Text")
         Dim val As String = _clip.GetText()
         _clip.Free()

         ' String.Insert
         Dim text As String = "Hello"
         text = text.Insert(" World", 5).LastChar()

         ' Imagem LoadFromFile
         Dim img As New Forms.Imagem(NULL)
         img.LoadFromFile(pPath)
         img.Free()

         ' Variant array assignment
         Dim pesos1 As Variant
         pesos1 = [5, 4, 3, 2]

         ' Narrowing conversion
         Dim myLong As Long = 1000
         Dim myInt As Integer = myLong

         ' &H hex literal
         Dim mask As Long = &HFFFF
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    assert.deepEqual(diags, []);
  });

  test("allows indexing Variant and String expressions", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///variant_string_indexer.bas";
    const code = `Namespace mod_variant_indexer
   Class C
      Public Sub Run()
         Dim cellValue As Variant
         Dim first As String = cellValue.Split(" ")[0]
         Dim text As String = "abc"
         Dim c As String = text[1]
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.DefaultIndexerMissing);
  });

  test("resolves unqualified imported functions before same-named subs in other modules", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    indexer.updateFileContent(
      "file:///frmMenuRegras.bas",
      `Namespace frmMenuRegras
   Function gravar(pModeloRecebimento As String) As Boolean
      gravar = True
   End Function
End Namespace`,
    );
    indexer.updateFileContent(
      "file:///controleGravacao.bas",
      `Namespace controleGravacao
   Class ControleGravacao
      Sub gravar(pRecebimento As TObject)
      End Sub
   End Class
End Namespace`,
    );
    const uri = "file:///frmMenuEventos.bas";
    const code = `Imports frmMenuRegras
Namespace frmMenuEventos
   Class TEventos
      Sub buttonOkOnClick(Sender As TObject)
         Dim output As Boolean = gravar("DETALHADO")
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.SubUsedAsFunction);
    expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
  });

  test("accepts class-name casts used as conversion calls", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///class_name_cast.bas";
    const code = `Namespace modelo
   Class ContaReceber
      Public Codigo As Integer
   End Class
   Class C
      Public Sub Run(pValue As TObject)
         Dim conta As ContaReceber
         conta = ContaReceber(pValue)
         conta.Codigo = 1
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
    expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
  });

  test("allows event handler member references assigned to OnClick delegates", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    indexer.updateFileContent(
      "file:///frmMenuEventos.bas",
      `Namespace frmMenuEventos
   Dim eventos As TEventos
   Class TEventos
   End Class
End Namespace`,
    );
    const uri = "file:///frmMenu.bas";
    const code = `Imports Forms
Imports frmMenuEventos
Namespace frmMenu
   Class Menu
      Public Sub Build()
         Dim buttonHP12C As Forms.FlatButton
         buttonHP12C.OnClick = frmMenuEventos.eventos.buttonHP12COnClick
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
  });

  test("recognizes Net FTP constants from the System Library", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///ftp_constants.bas";
    const code = `Imports Net
Namespace helpers_ftp
   Class HelpersFTP
      Private _ftp As TFTP
      Public Sub New()
         _ftp = New TFTP(NULL)
         _ftp.TransferType = ftBinary
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
  });

  test("recognizes GridConfigs visual option flags from the System Library", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///grid_configs_flags.bas";
    const code = `Imports Forms
Namespace mod_grid_configs
   Class C
      Public Sub Run()
         Dim config As GridConfigs
         config.FixedVerLine = True
         config.FixedHorzLine = True
         config.VerLine = True
         config.HorzLine = True
         config.RowSizing = True
         config.ColSizing = True
         config.RowMoving = True
         config.ColMoving = True
         config.RowSelect = True
         config.FixedColClick = True
         config.FixedRowClick = True
         config.FixedHotTrack = True
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
  });

  test("allows direct bracket indexing on TStringList through default Item property", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///tstringlist_default_indexer.bas";
    const code = `Imports Collections
Namespace mod_tstringlist_indexer
   Class C
      Public Sub Run()
         Dim lines As TStringList
         Dim first As String = lines[0]
         lines[1] = "updated"
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.DefaultIndexerMissing);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
  });

  test("warns on empty catch blocks in Try/Catch with Finally", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///empty_catch_finally_test.bas";
    const code = `Namespace mod_test_finally
   Class Test
      Public Sub Run()
         Try
            Dim a As Integer = 1
         Catch ex As Exception
            
         Finally
            Dim b As Integer = 2
         End Try
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    const diag = diags.find((d: any) => d.code === LegacyDiagnosticCodes.FinallyBlockUnsupported);
    assert.ok(diag, "Should emit finally-block-unsupported warning");
    const payload = (diag as any).data;
    assert.equal(payload.isEmptyCatch, true);
  });

  test("supports line continuation followed by comment", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///line_continuation_comment_test.bas";
    const code = `Namespace mod_test_continuation
   Class Test
      Public Sub Run()
         Dim x As Integer = 10 _ ' Some comment here
         + 20
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    assert.ok(!diags.some((d) => d.code === "expected-token"), JSON.stringify(diags));
  });

  test("warns on Else If with space and missing Then in If/ElseIf", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///if_elseif_test.bas";
    const code = `Namespace mod_test_if
   Class Test
      Public Sub Run(a As Integer)
         If a > 10
            a = a + 1
         Else If a > 5
            a = a + 2
         End If
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    const missingThenDiags = diags.filter((d: any) => d.code === DiagnosticCodes.MissingThen);
    assert.equal(
      missingThenDiags.length,
      2,
      "Should emit two missing-then warnings (one for If, one for ElseIf)",
    );

    const elseIfSpaceDiag = diags.find((d: any) => d.code === DiagnosticCodes.ElseIfWhitespace);
    assert.ok(elseIfSpaceDiag, "Should emit elseif-whitespace error");
    assert.equal(elseIfSpaceDiag.severity, vscode.DiagnosticSeverity.Error);
  });

  test("warns on Return and distinguishes conditional vs non-conditional blocks", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///return_test.bas";
    const code = `Namespace mod_test_return
   Class Test
      Public Function Calc(a As Integer) As Integer
         If a > 10 Then
            Return a * 2
         End If
         Return a + 5
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    const returnDiags = diags.filter((d: any) => d.code === DiagnosticCodes.ReturnUnrecommended);
    assert.equal(returnDiags.length, 2, "Should emit return-unrecommended warning twice");

    // First Return (inside If - conditional)
    const firstReturn = returnDiags[0]!;
    assert.equal((firstReturn as any).data.isConditional, true);
    assert.equal((firstReturn as any).data.targetName, "Calc");
    assert.equal((firstReturn as any).data.exitType, "Function");

    // Second Return (at root - non-conditional)
    const secondReturn = returnDiags[1]!;
    assert.equal((secondReturn as any).data.isConditional, false);
    assert.equal((secondReturn as any).data.targetName, "Calc");
    assert.equal((secondReturn as any).data.exitType, "Function");
  });

  test("warns on function return assignment inside Catch and allows Return there", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///return_assignment_in_catch.bas";
    const code = `Namespace mod_return_catch
   Class C
      Function Calc() As Integer
         Try
            Calc = 1
         Catch ex As Exception
            Calc = 2
         End Try
         Return 3
      End Function

      Property Total As Integer
         Get
            Try
               Total = 1
            Catch ex As Exception
               Total = 2
            End Try
         End Get
      End Property

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    const catchAssignmentDiags = diags.filter(
      (d: any) => d.code === DiagnosticCodes.ReturnAssignmentInCatch,
    );
    assert.equal(catchAssignmentDiags.length, 2);
    assert.equal((catchAssignmentDiags[0] as any).data.expressionText, "2");
    assert.equal((catchAssignmentDiags[1] as any).data.expressionText, "2");

    const returnDiags = diags.filter((d: any) => d.code === DiagnosticCodes.ReturnUnrecommended);
    assert.equal(returnDiags.length, 1, "Return outside Catch should keep the existing warning");
  });

  test("return-assignment-in-catch preserves method invocation arguments in payload", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///return_assignment_in_catch_call.bas";
    const code = `Namespace mod_return_catch_call
   Class C
      Shared Function StringToDate(pValue As String) As TDateTime
         Try
            StringToDate = StrToDateTime(pValue)
         Catch ex As Exception
            StringToDate = StrToDateTime("01/01/1900 00:00:00")
         End Try
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    const catchAssignmentDiag = diags.find(
      (d: any) => d.code === DiagnosticCodes.ReturnAssignmentInCatch,
    );
    assert.ok(catchAssignmentDiag);
    assert.equal(
      (catchAssignmentDiag as any).data.expressionText,
      'StrToDateTime("01/01/1900 00:00:00")',
    );
  });

  test("warns on inline If statements and sets isSingleLineIf on Return payload", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///inline_if_test.bas";
    const code = `Namespace mod_test_inline_if
   Class Test
      Public Function Calc(a As Integer) As Integer
         If a > 10 Then Return a * 2
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    // Warns on inline If
    const inlineIfDiags = diags.filter((d: any) => d.code === DiagnosticCodes.InlineIfThen);
    assert.equal(inlineIfDiags.length, 1, "Should emit inline-if-then warning once");
    assert.equal(inlineIfDiags[0]!.severity, vscode.DiagnosticSeverity.Warning);

    // Also warns on return inside it and sets isSingleLineIf
    const returnDiags = diags.filter((d: any) => d.code === DiagnosticCodes.ReturnUnrecommended);
    assert.equal(
      returnDiags.length,
      1,
      "Should emit return-unrecommended warning inside inline If",
    );
    assert.equal((returnDiags[0] as any).data.isSingleLineIf, true);
  });

  test("warns on missing-then and computes insertColumn correctly when single quotes are inside string literals", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///missing_then_string_test.bas";
    const code = `Namespace mod_test_missing_then
   Class Test
      Public Sub Run(pValue As String)
         If pValue = "''"
            Dim x As Integer = 1
         End If
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    const missingThenDiags = diags.filter((d: any) => d.code === DiagnosticCodes.MissingThen);
    assert.equal(missingThenDiags.length, 1);
    const payload = (missingThenDiags[0] as any).data;
    assert.equal(payload.insertColumn, 25);
  });

  test("positions missing-then before aligned trailing comments", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///missing_then_comment_test.bas";
    const code = `Namespace mod_test_missing_then
   Class Test
      Public Sub Run()
         If me.pixRegistered <> NULL    ' Edit
            Run()
         End If
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    const missingThen = diags.filter((d: any) => d.code === DiagnosticCodes.MissingThen);
    assert.equal(missingThen.length, 1);
    const payload = (missingThen[0] as any).data;
    assert.equal(payload.insertColumn, "         If me.pixRegistered <> NULL".length);
    assert.ok(!diags.some((d: any) => d.code === "expected-token"));
  });

  test("accepts Match function assignment and does not trigger missing-return-value warning", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///regex_test_match.bas";
    const code = `Namespace ns
   Class Regex
      Public Function Match(pValue As String) As Boolean
         Dim matches As Variant = me._regExp.Execute(pValue)
         If matches.count > 0 Then
            Match = True
            Exit Function
         End If

         Match = False
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    const missingReturnDiags = diags.filter(
      (d: any) => d.code === DiagnosticCodes.MissingReturnValue,
    );
    assert.deepEqual(missingReturnDiags, []);
  });

  test("flags terminal Exit Sub as redundant", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///redundant_exit_sub.bas";
    const code = `Namespace ns
   Class C
      Public Sub Run()
         Work()
         Exit Sub
      End Sub

      Private Sub Work()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    expectDiagnostic(diags, DiagnosticCodes.RedundantTerminalExit, "terminal redundante");
  });

  test("does not report missing-return-value for terminal Exit Function inside final Catch", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///terminal_exit_function_catch.bas";
    const code = `Namespace ns
   Class C
      Public Function ReadValue() As Integer
         Try
            ReadValue = 1
         Catch ex As Exception
            Exit Function
         End Try
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    expectDiagnostic(diags, DiagnosticCodes.RedundantTerminalExit, "terminal redundante");
    expectNoDiagnostic(diags, DiagnosticCodes.MissingReturnValue);
  });

  test("resolves IO.File.ZipFile and Delphi System.IOUtils helper classes", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///io_helpers_test.bas";
    const code = `Imports IO
Imports System.IOUtils
Namespace mod_io_helpers
   Class C
      Public Sub Run(pPath As String)
         Dim zipper As IO.File.ZipFile
         Dim exists As Boolean = TFile.Exists(pPath)
         Dim temp As String = TPath.GetTempPath()
         Dim fileName As String = File.ExtractName(pPath)
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    expectNoDiagnostic(diags, DiagnosticCodes.UnknownType);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
  });

  // ---------------------------------------------------------------------------
  // namespace-name-conflict
  // ---------------------------------------------------------------------------
  describe("namespace-name-conflict", () => {
    const run = (code: string) => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///ns_conflict.bas";
      indexer.updateFileContent(uri, code);
      return DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    };

    test("emits error when Class shares name with enclosing Namespace", () => {
      const diags = run(`Namespace ControleTitulos
   Class ControleTitulos
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectDiagnostic(diags, DiagnosticCodes.NamespaceNameConflict, "ControleTitulos");
    });

    test("emits error when Structure shares name with enclosing Namespace", () => {
      const diags = run(`Namespace ModeloPonto
   Structure ModeloPonto
      Dim X As Integer
      Dim Y As Integer
   End Structure
End Namespace`);
      expectDiagnostic(diags, DiagnosticCodes.NamespaceNameConflict, "ModeloPonto");
    });

    test("emits error when Delegate shares name with enclosing Namespace", () => {
      const diags = run(`Namespace CallbackNs
   Delegate Sub CallbackNs(sender As TObject)
End Namespace`);
      expectDiagnostic(diags, DiagnosticCodes.NamespaceNameConflict, "CallbackNs");
    });

    test("does not emit error when Class name differs from Namespace (case-insensitive)", () => {
      const diags = run(`Namespace ControleTitulos
   Class TControleTitulos
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.NamespaceNameConflict);
    });

    test("does not emit error for a sibling Class that does not conflict", () => {
      const diags = run(`Namespace AdaptadorBrasilCard
   Class BrasilCard
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.NamespaceNameConflict);
    });

    test("conflict check is case-insensitive (lowercase class, mixed namespace)", () => {
      const diags = run(`Namespace ControleGravacao
   Class controleGravacao
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectDiagnostic(diags, DiagnosticCodes.NamespaceNameConflict, "controleGravacao");
    });

    test("diagnostic payload carries correct name and memberKind for a Class", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///payload_check.bas";
      const code = `Namespace FooNs
   Class FooNs
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

      const conflict = diags.find((d) => d.code === DiagnosticCodes.NamespaceNameConflict);
      assert.ok(conflict, "Expected namespace-name-conflict diagnostic");
      const payload = (conflict as vscode.Diagnostic & { data?: unknown }).data as {
        name?: string;
        memberKind?: string;
      };
      assert.equal(payload?.name?.toLowerCase(), "foons");
      assert.equal(payload?.memberKind, "class");
    });
  });
});
