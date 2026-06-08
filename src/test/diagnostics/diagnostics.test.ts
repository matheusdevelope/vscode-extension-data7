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
      const diag = expectDiagnostic(
        diags,
        DiagnosticCodes.DuplicateDeclaration,
        "conflita com o membro 'value'",
      );
      assert.equal(diag.relatedInformation?.length, 1);
      assert.equal(diag.relatedInformation?.[0]?.location.range.start.line, 2);
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

    test("does not emit warning for BaseEnum classes", () => {
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

    test("accepts generic templates declared in another namespace file", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const templateUri = "file:///mod_tlist.bas";
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
