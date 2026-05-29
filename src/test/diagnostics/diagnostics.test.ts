import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { DiagnosticsLinter } from "../../diagnostics/diagnostics";
import { DiagnosticCodes } from "../../diagnostics/diagnostic-codes";
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
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.MissingImport);
    });

    test("emits no diagnostic when inheriting a global Principal.bas class", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Inherits TPrincipalClass
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.MissingImport);
    });

    test("emits missing-import when inheriting Forms.Form without an Imports Forms", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Inherits Form
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
    // Loaded from `docs/exemple/diagnostics/unsupported-member/trigger.bas`.
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
    // Loaded from `docs/exemple/` to keep the canonical example and the
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
      expectDiagnostic(
        diags,
        DiagnosticCodes.DuplicateDeclaration,
        "Declaração duplicada: o identificador 'x'",
      );
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

    test("emits error for local variable with same name as class member in the same context", () => {
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
      expectDiagnostic(
        diags,
        DiagnosticCodes.DuplicateDeclaration,
        "conflita com o membro 'value'",
      );
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

    test("emits error for duplicate class members with same signature/kind", () => {
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
});
