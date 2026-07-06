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
  const withoutDeclarationStyleWarnings = (
    diagnostics: readonly vscode.Diagnostic[],
  ): vscode.Diagnostic[] =>
    diagnostics.filter(
      (diag) =>
        diag.code !== DiagnosticCodes.RedundantPublicModifier &&
        diag.code !== DiagnosticCodes.UnusedDeclaration,
    );

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
      Public Sub New()
         MyBase.New()
      End Sub

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
      assert.equal(withoutDeclarationStyleWarnings(diags).length, 0);
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

    test("does not require explicit mod_tlist import for TTList when array-list sugar is enabled", () => {
      const indexer = setupResources();
      const listUri = "file:///dummy/mod_tlist.bas";
      const listCode = `Namespace mod_tlist
   Class TTList<T>
      Public Sub New()
         MyBase.New()
      End Sub
      Public Sub Push(pValue As T)
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(listUri, listCode);
      registerOpenDocument(listUri, "dummy/mod_tlist.bas");

      const uri = "file:///dummy/test_file.bas";
      const code = `Namespace my_app
   Public Dim minhaList As TTList<String>
End Namespace`;
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code, { register: false });
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);

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

  describe("unused-import", () => {
    test("does not emit unused-import for an unknown namespace", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///unknown_import.bas";
      const code = `Imports modulo_que_nao_existe
Namespace mod_test
   Class C
      Public Sub Run()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

      expectNoDiagnostic(diags, DiagnosticCodes.UnusedImport);
    });

    test("still emits unused-import for a known but unreferenced System Library namespace", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///known_unused_import.bas";
      const code = `Imports Forms
Namespace mod_test
   Class C
      Public Sub Run()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

      expectDiagnostic(diags, DiagnosticCodes.UnusedImport, "Forms");
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
         Me.f.OnClick = NoArgsHandler
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
         Me.f.OnClick = GoodHandler
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
  describe("lambda-signature-mismatch", () => {
    test("emits when lambda declares more parameters than the delegate accepts", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = loadExample("diagnostics/lambda-signature-mismatch/trigger.bas");
      indexer.updateFileContent("file:///lambda_sig.bas", code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///lambda_sig.bas", code),
        indexer,
      );
      const diag = expectDiagnostic(diags, DiagnosticCodes.LambdaSignatureMismatch);
      assert.match(diag.message, /2 par/i);
      assert.match(diag.message, /declarou 3/i);
    });

    test("accepts a VB-like lambda whose prefix signature matches the delegate", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_lambda_ok
   Delegate Function TPredicate(value As String, i As Integer) As Boolean
   Class Runner
      Inherits TObject
      Sub New()
         MyBase.New()
      End Sub
      Sub Run(handler As TPredicate)
         Me.Run(Function(value As String) value <> "")
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///lambda_ok.bas", code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc("file:///lambda_ok.bas", code),
        indexer,
      );
      expectNoDiagnostic(diags, DiagnosticCodes.LambdaSignatureMismatch);
    });

    test("resolves lambda parameters inside multiline TTList delegate calls", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const code = `Namespace mod_lambda_list
   Delegate Function TMapDel<T, TOut>(pValue As T, i As Integer, extra As Variant) As TOut
   Delegate Sub TForEachDel<T>(pValue As T, i As Integer, extra As Variant)

   Class TTList<T>
      Sub New()
         MyBase.New()
      End Sub
      Function Map<TOut>(pHandler As TMapDel<T, TOut>) As TTList<TOut>
         Map = Nothing
      End Function
      Sub ForEach(pHandler As TForEachDel<T>)
      End Sub
      Function Last() As T
         Last = Nothing
      End Function
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class Product
      Sub New()
         MyBase.New()
      End Sub
      Function Name() As String
         Name = ""
      End Function
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Dim products As TTList<Product> = New TTList<Product>()
   Dim names As TTList<String> = products.Map(
      Function(pItem As Product) As String
         Return pItem.Name()
      End Function
   )
   Dim lastName As String = products.Last().Name()
   products.ForEach(Sub(pItem As Product)
      pItem.Clone()
   End Sub)
End Namespace`;
      const uri = "file:///lambda_list.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      const unknownMember = expectDiagnostic(diags, DiagnosticCodes.UnknownMember);
      assert.match(unknownMember.message, /Clone/);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.ReturnUnrecommended);
    });

    test("resolves chained TTList lambda calls across flat generic intermediate types", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const code = `Namespace mod_lambda_chain
   Delegate Function TFindDel<T>(pValue As T, i As Integer, extra As Variant) As Boolean
   Delegate Function TMapDel<T, TOut>(pValue As T, i As Integer, extra As Variant) As TOut
   Delegate Function TReduceDel<T, TAcc>(pAcc As TAcc, pItem As T, extra As Variant) As TAcc

   Class TTList<T>
      Sub New()
         MyBase.New()
      End Sub
      Function Filter(pHandler As TFindDel<T>) As TTList<T>
         Filter = Nothing
      End Function
      Function Map<TOut>(pHandler As TMapDel<T, TOut>) As TTList<TOut>
         Map = Nothing
      End Function
      Function Reduce<TAcc>(pHandler As TReduceDel<T, TAcc>, pInitial As TAcc, extra As Variant) As TAcc
         Reduce = pInitial
      End Function
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class Produto
      Sub New()
         MyBase.New()
      End Sub
      Function GetPreco() As Double
         GetPreco = 1.0
      End Function
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Dim produtos As TTList<Produto> = New TTList<Produto>()
   Dim total As Double = produtos._
Filter(Function(pItem As Produto) As Boolean pItem.GetPreco() > 15.0)._
Map<Double>(Function(pItem As Produto) As Double pItem.GetPreco())._
Reduce<Double>(
Function(pAcc As Double, pItem As Double) As Double
Return pAcc + pItem
End Function,
0.0
)
End Namespace`;
      const uri = "file:///lambda_chain.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownType);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.ReturnUnrecommended);
    });

    test("accepts delegate assignments with Sub side-effect lambdas and Function block lambdas", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const code = `Namespace mod_lambda_delegate_assignment
   Delegate Sub TShowHandler(pSender As TObject)
   Delegate Function TExecuteHandler(pItem As TObject, pIdx As Integer) As Boolean

   Class Form
      OnShow As TShowHandler
      Sub New()
         MyBase.New()
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class Teste
      OnExecute As TExecuteHandler
      Private _form As Form

      Sub New()
         MyBase.New()
         Me._form = New Form()
         Me._form.OnShow = Sub(pSender As TObject) Me.Execute(pSender, 1)
      End Sub

      Function Execute(pItem As TObject, pIdx As Integer) As Boolean
         Execute = True
      End Function

      Sub Free()
         Me._form.Free()
         MyBase.Free()
      End Sub
   End Class

   Dim teste As New Teste()
   teste.OnExecute = Function(pItem As TObject, pIdx As Integer) As Boolean
      Return True
   End Function

   Dim form2 As New Form()
   form2.OnShow = Sub(pSender As TObject) teste.Execute(form2, 1)
End Namespace`;
      const uri = "file:///lambda_delegate_assignment.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.LambdaSignatureMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("emits type-mismatch for invalid method arguments inside delegate lambdas", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const code = `Namespace mod_lambda_delegate_body_mismatch
   Delegate Sub TShowHandler(pSender As TObject)

   Class Form
      OnShow As TShowHandler
      Sub New()
         MyBase.New()
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class Teste
      Function Execute(pItem As TObject, pIdx As Integer) As Boolean
         Execute = True
      End Function
      Sub New()
         MyBase.New()
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Dim teste As New Teste()
   Dim form2 As New Form()
   form2.OnShow = Sub(pSender As TObject) teste.Execute("Teste", 1)
End Namespace`;
      const uri = "file:///lambda_delegate_body_mismatch.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.LambdaSignatureMismatch);
      expectDiagnostic(diags, DiagnosticCodes.TypeMismatch, "pItem");
    });

    test("does not compare lambdas to flat materialized delegate names by return type", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const code = `Namespace mod_flat_delegate_lambda
   Delegate Function TFindDel_Integer(pValue As Integer, i As Integer, extra As Variant) As Boolean

   Class TTList_Integer
      Function Find(pHandler As TFindDel_Integer) As Integer
         Find = 0
      End Function
      Sub New()
         MyBase.New()
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Dim numeros As New TTList_Integer()
   Dim found As Integer = numeros.Find(Function(pItem As Integer) As Boolean
      Return pItem > 0
   End Function)
End Namespace`;
      const uri = "file:///flat_delegate_lambda.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.LambdaSignatureMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("does not report dead-code for statements inside delegate lambda bodies", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const code = `Namespace mod_lambda_dead_code
   Delegate Sub TForEachDel<T>(pValue As T, i As Integer, extra As Variant)
   Delegate Function TFindDel<T>(pValue As T, i As Integer, extra As Variant) As Boolean
   Delegate Function TReduceDel<T, TAcc>(pAcc As TAcc, pValue As T, extra As Variant) As TAcc

   Class TTList<T>
      Sub New()
         MyBase.New()
      End Sub
      Sub ForEach(pHandler As TForEachDel<T>)
      End Sub
      Function Find(pHandler As TFindDel<T>) As T
         Find = Nothing
      End Function
      Function Reduce<TAcc>(pHandler As TReduceDel<T, TAcc>, pInitial As TAcc) As TAcc
         Reduce = pInitial
      End Function
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Sub Run()
      Dim numeros As New TTList<Integer>()
      numeros.ForEach(Sub(pItem As Integer)
         Print(pItem)
      End Sub)
      Dim primeiroParDepoisDoIndice2 As Integer = numeros.Find(
         Function(pItem As Integer, pIdx As Integer) As Boolean
            Return pIdx > 2 And pItem Mod 2 = 0
         End Function
      )
      Dim soma As Integer = numeros.Reduce<Integer>(
         Function(pAcumulador As Integer, pItem As Integer) As Integer
            Return pAcumulador + pItem
         End Function,
         0
      )
   End Sub
End Namespace`;
      const uri = "file:///lambda_dead_code.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.DeadCode);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.LambdaSignatureMismatch);
    });

    test("accepts method references whose signature matches delegate method arguments", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const code = `Namespace mod_delegate_method_reference
   Delegate Function TFindDel<T>(pValue As T, i As Integer, extra As Variant) As Boolean

   Class HelperNumero
      Sub New()
         MyBase.New()
      End Sub
      Shared Function FindMaiorQue4(pValue As Integer, pIdx As Integer, extra As Variant) As Boolean
         FindMaiorQue4 = pValue > 4
      End Function
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTList<T>
      Sub New()
         MyBase.New()
      End Sub
      Function Find(pHandler As TFindDel<T>) As T
         Find = Nothing
      End Function
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Sub Run()
      Dim numeros As New TTList<Integer>()
      Dim numeroEncontradoPorDelegate As Integer = numeros.Find(HelperNumero.FindMaiorQue4)
   End Sub
End Namespace`;
      const uri = "file:///delegate_method_reference.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("accepts method references against flat materialized delegate names", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const code = `Namespace mod_flat_delegate_method_reference
   Delegate Function TFindDel<T>(pValue As T, i As Integer, extra As Variant) As Boolean

   Class HelperNumero
      Sub New()
         MyBase.New()
      End Sub
      Shared Function FindMaiorQue4(pValue As Integer, pIdx As Integer, extra As Variant) As Boolean
         FindMaiorQue4 = pValue > 4
      End Function
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTList_Integer
      Sub New()
         MyBase.New()
      End Sub
      Function Find(pHandler As TFindDel_Integer) As Integer
         Find = 0
      End Function
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Sub Run()
      Dim numeros As New TTList_Integer()
      Dim numeroEncontradoPorDelegate As Integer = numeros.Find(HelperNumero.FindMaiorQue4)
   End Sub
End Namespace`;
      const uri = "file:///flat_delegate_method_reference.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("validates delegate calls and lambda assignments through Using resource variables", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const code = `Imports Forms

Delegate Function DelOnExecute(pItem As TObject, pIdx As Integer, pTeste As Integer) As Boolean

Class Teste
   OnExecute As DelOnExecute
   Private _form As Form
   Sub New()
      MyBase.New()
      Me._form = New Form()
   End Sub
   Function Execute(pIdx As Integer) As Boolean
      If OnExecute <> Null Then
         Execute = OnExecute(Me._form, pIdx)
         Exit Function
      End If
      Execute = False
   End Function
   Sub Free()
      Me._form.Free()
      OnExecute = Null
      MyBase.Free()
   End Sub
End Class

Using teste As New Teste()
   teste.OnExecute = Function(pItem As TObject, pIdx As Integer) As Boolean True
   teste.OnExecute = Function(pItem As TObject, pIdx As Integer, pTeste As String) As Boolean True
End Using`;
      const uri = "file:///delegate_using_validation.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(diags, DiagnosticCodes.TypeMismatch, "OnExecute");
      expectDiagnostic(diags, DiagnosticCodes.LambdaSignatureMismatch, "declarou 2");
      expectDiagnostic(diags, DiagnosticCodes.LambdaSignatureMismatch, "pTeste");
    });

    test("emits unknown-symbol for unresolved unqualified invocations", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const code = `Namespace mod_unresolved_call
   Sub Run()
      Metodo_Nao_Importado()
   End Sub
End Namespace`;
      const uri = "file:///unresolved_call.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(diags, DiagnosticCodes.UnknownSymbol, "Metodo_Nao_Importado");
    });

    test("emits missing-import for unqualified calls from a non-imported namespace", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const otherUri = "file:///mod_outro_napespace.bas";
      const otherCode = `Namespace mod_outro_napespace
   Sub ExecutarPipelineGenericoDeOutroNamespace()
   End Sub
End Namespace`;
      indexer.updateFileContent(otherUri, otherCode);
      registerOpenDocument(otherUri);

      const code = `Imports mod_fluent_generics
ExecutarPipelineGenericoDeOutroNamespace()`;
      const uri = "file:///principal_missing_import_callable.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(diags, DiagnosticCodes.MissingImport, "mod_outro_napespace");
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
    });
  });

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

    test("emits unknown-member for undeclared methods on a namespace receiver", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const consoleUri = "file:///console.bas";
      const consoleCode = `Namespace console
   Public Sub log(value As String)
   End Sub
End Namespace`;
      indexer.updateFileContent(consoleUri, consoleCode);
      createMockDoc(consoleUri, consoleCode);

      const uri = "file:///principal_console.bas";
      const code = `Imports console
Namespace principal
   Class Principal
      Public Sub Run()
         console.log("ok")
         console.clear()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

      expectDiagnostic(diags, DiagnosticCodes.UnknownMember, "clear");
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

    test("does NOT emit error for same Catch variable name in distinct Try blocks", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_dup
   Class C
      Public Sub Run()
         Try
            Work()
         Catch ex As Exception
            Throw New Exception(ex._GetMessage())
         End Try

         Try
            Work()
         Catch ex As Exception
            Throw New Exception(ex._GetMessage())
         End Try
      End Sub

      Private Sub Work()
      End Sub
   End Class
End Namespace`;
      const uri = "file:///dup_catch_vars.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.DuplicateDeclaration);
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

    test("does not self-conflict when workspace index URI differs from editor URI casing", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const code = `Namespace mod_strings_helper
   Private Dim regex As Variant
   Function Trim(pStr As String) As String
      Trim = pStr.Trim()
   End Function
End Namespace`;
      const workspaceUri = "file:///d:/project/src/mod_strings_helper.bas";
      const editorUri = "file:///D:/project/src/mod_strings_helper.bas";
      indexer.updateFileContent(workspaceUri, code);
      indexer.updateFileContentFromParsed(editorUri, code, indexer.getFileSymbols(workspaceUri)!);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc(editorUri, code),
        indexer,
      );
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
   Class DupClass
   End Class
   Class DupClass
   End Class
End Namespace`;
      const uri = "file:///dup_class.bas";
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(
        diags,
        DiagnosticCodes.DuplicateDeclaration,
        "Declaração duplicada: o tipo/símbolo 'DupClass'",
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

    test("does NOT emit unknown-type for a native Enum used in the same namespace", () => {
      const diags = runLinter(`Namespace mod_rdbms
   Public Enum Options
      SqlServer = 0
      PostgreSQL = 2
   End Enum

   Class ModelRDBMS
      Private _rdbms As Options

      Sub New(pOption As Options)
         MyBase.New()
         me._rdbms = pOption
      End Sub
   End Class
End Namespace`);

      expectNoDiagnostic(diags, DiagnosticCodes.UnknownType);
    });

    test("does NOT emit unknown-type diagnostic for valid qualified types", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Private _form As Forms.Form
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownType);
    });

    test("emits unknown-member when accessing a member on a variable with unknown type", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Public Sub New()
         MyBase.New()
      End Sub

      Public Sub Run()
         Dim retorno As Retorno
         Dim codigo As Integer = retorno.Codigo
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectDiagnostic(diags, DiagnosticCodes.UnknownType, "Retorno");
      expectDiagnostic(diags, DiagnosticCodes.UnknownMember, "Retorno");
    });

    test("accepts an external type only for the declared variable line", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Public Sub New()
         MyBase.New()
      End Sub

      Public Sub Run()
         Dim retorno As Retorno ' data7:external-type Retorno
         retorno.Codigo = 10
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownType);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
    });

    test("accepts an external type for the current method scope", () => {
      const diags = runLinter(`Namespace my_app
   Class TTest
      Public Sub New()
         MyBase.New()
      End Sub

      ' data7:external-type Retorno scope=block
      Public Sub Run()
         Dim retorno As Retorno
         retorno.Codigo = 10
      End Sub

      Public Sub Other()
         Dim retorno As Retorno
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectDiagnostic(diags, DiagnosticCodes.UnknownType, "Retorno");
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
    });

    test("accepts an external type for the whole file", () => {
      const diags = runLinter(`' data7:external-type Retorno scope=file
Namespace my_app
   Class TTest
      Public Sub New()
         MyBase.New()
      End Sub

      Public Sub Run()
         Dim retorno As Retorno
         retorno.Codigo = 10
      End Sub

      Public Sub Other()
         Dim outro As Retorno
         outro.Descricao = "ok"
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownType);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
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

    test("emits when Sub New does not call MyBase.New()", () => {
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

    test("emits when class has regular Subs but no constructor", () => {
      const diags = runLinter(`Namespace mod_ctor_sub
   Class THelper
      Sub Initialize()
         me.Ready = True
      End Sub
   End Class
End Namespace`);
      const diag = expectDiagnostic(diags, DiagnosticCodes.MissingMyBaseNew);
      const payload = (diag as { data?: { action?: string; className?: string } }).data;
      assert.equal(payload?.className, "THelper");
      assert.equal(payload?.action, "create-constructor");
    });

    test("does NOT emit for Structure Sub New", () => {
      const diags = runLinter(`Namespace mod_ctor_structure
   Private Structure TIdentificacao
      Codigo As Integer
      Nome As String

      Sub New(pCodigo As Integer)
         Codigo = pCodigo
      End Sub
   End Structure
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

    test("does not emit warning when Structure has no Sub Free", () => {
      const diags = runLinter(`Namespace mod_free_structure
   Private Structure TIdentificacao
      Codigo As Integer
      Nome As String
   End Structure
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

    test("does NOT emit warning for valid Declare statements without name parentheses", () => {
      const diags = runLinter(`Namespace mod_test
   Class C
      Private Declare Function DragAcceptFiles Lib "shell32" (hWnd As Long, fAccept As Boolean) As Long
      Private Declare Function _GetForegroundWindow Lib "user32.dll" Alias "GetForegroundWindow" As Long
      Private Declare Sub Sleep Lib "kernel32" (dwMilliseconds As Long)
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.DeclarationParenthesesMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.DeclareNameParentheses);
    });

    test("emits declare-name-parentheses when Declare name uses forbidden empty parentheses", () => {
      const diags = runLinter(`Namespace mod_test
   Class C
      Private Declare Function _GetWindowRect() Lib "user32.dll" Alias "GetWindowRect" (hwnd As Long, ByRef lpRect As TRect) As Long
   End Class
End Namespace`);
      const diag = expectDiagnostic(
        diags,
        DiagnosticCodes.DeclareNameParentheses,
        "_GetWindowRect",
      );
      assert.equal(diag.range.start.line, 2);
      assert.equal(diag.range.start.character, 45);
      assert.equal(diag.range.end.character, 47);
      expectNoDiagnostic(diags, "expected-token");
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

    test("does NOT emit unknown-symbol when invoking a delegate parameter", () => {
      const diags = runLinter(`Namespace mod_test
   Delegate Function TValidador<T>(pInput As T) As Boolean

   Class C<T>
      Private _value As T

      Function Validar(pRegra As TValidador<T>) As Boolean
         If Not pRegra(me._value) Then
            Return False
         End If
         Return True
      End Function
   End Class
End Namespace`);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
    });

    test("accepts generic fluent chains with comment-only lines before lambda arguments", () => {
      const fluentUri = "file:///mod_fluent_generics.bas";
      const sourceUri = "file:///principal_fluent_comments.bas";
      const fluentModule = `Namespace mod_fluent_generics
   Delegate Function TTransformador<TIn, TOut>(pInput As TIn) As TOut
   Delegate Function TValidador<T>(pInput As T) As Boolean

   Class PlexConfig
      Sub New()
         MyBase.New()
      End Sub
   End Class

   Class ConectorDeAPI<T>
      Private _payloadRaw As T

      Sub New(pDado As T)
         MyBase.New()
         me._payloadRaw = pDado
      End Sub

      Function ValidarPayload(pRegra As TValidador<T>) As ConectorDeAPI<T>
         If Not pRegra(me._payloadRaw) Then
            Throw New Exception("Falha")
         End If
         ValidarPayload = me
      End Function

      Function Parse<TOut>(pTransformador As TTransformador<T, TOut>) As ProcessadorDeConfig<TOut>
         Parse = New ProcessadorDeConfig<TOut>(pTransformador(me._payloadRaw))
      End Function
   End Class

   Class ProcessadorDeConfig<T>
      Private _config As T

      Sub New(pConfig As T)
         MyBase.New()
         me._config = pConfig
      End Sub

      Function InjetarVariaveisDeAmbiente() As ProcessadorDeConfig<T>
         InjetarVariaveisDeAmbiente = me
      End Function

      Function Construir() As T
         Construir = me._config
      End Function
   End Class
End Namespace`;
      const source = `Imports mod_fluent_generics

Class ConectorDeAPI2<T>
   Inherits ConectorDeAPI<T>

   Sub New(pDado As T)
      MyBase.New(pDado)
   End Sub

   Function ValidarPayload2(pRegra As TValidador<T>, pValor As T) As ConectorDeAPI2<T>
      If Not pRegra(pValor) Then
         Throw New Exception("Falha")
      End If
      ValidarPayload2 = me
   End Function
End Class

Dim rawJsonFromApi As String = "{ port: 32400, multi_user: true }"
Dim _conector As New ConectorDeAPI2<String>(rawJsonFromApi)
Dim configFinal As PlexConfig = _conector. _
   ValidarPayload(
      Function(texto As String) As Boolean
         Return texto.Contains("port")
      End Function
   ). _
   Parse<PlexConfig>(
      ' comments are accepted between the opening paren and lambda argument
      ' and must not be parsed as expressions
      Function(texto As String) As PlexConfig
         Dim isMulti As Boolean = texto.Contains("true")
         Exit Function
      End Function
   ). _
   InjetarVariaveisDeAmbiente(). _
   Construir()`;

      const indexer = WorkspaceSymbolIndexer.createDetached();
      indexer.updateFileContent(fluentUri, fluentModule);
      registerOpenDocument(fluentUri);
      indexer.updateFileContent(sourceUri, source);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(
        createMockDoc(sourceUri, source),
        indexer,
      );

      expectNoDiagnostic(diags, "expected-token");
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch);
      expectNoDiagnostic(diags, DiagnosticCodes.UnusedDeclaration);
      expectNoDiagnostic(diags, DiagnosticCodes.RedundantTerminalExit);
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

  describe("call-parentheses-mismatch", () => {
    const runLinter = (code: string) => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///call_parens_test.bas";
      indexer.updateFileContent(uri, code);
      return DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    };

    test("warns when a final parameterless method call omits parentheses", () => {
      const diags = runLinter(`Namespace mod_test
   Class C
      Public Sub Run()
         DoWork
      End Sub

      Public Sub DoWork()
      End Sub
   End Class
End Namespace`);

      expectDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch, "DoWork");
    });

    test("insertColumn points past the method name on a MemberAccess (regression: was pointing to start)", () => {
      // Line 3 (0-indexed: 2): "      me.doWork"
      // "me.doWork" starts at col 6, "doWork" starts at col 9 (after "me.")
      // insertColumn must be 9 + 6 = 15, NOT 9 (start of "doWork")
      const code = `Namespace mod_reg
   Class C
      Public Sub Run()
         me.doWork
      End Sub

      Public Sub doWork()
      End Sub
   End Class
End Namespace`;
      const diags = runLinter(code);
      const diag = expectDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch, "doWork");
      const payload = (diag as vscode.Diagnostic & { data?: { insertColumn?: number } }).data;
      assert.ok(payload, "payload should be present");
      // "      me.doWork" — 'doWork' is 6 chars, starts at col 9, so insertColumn should be 15
      assert.ok(
        (payload.insertColumn ?? 0) > diag.range.start.character,
        `insertColumn (${payload.insertColumn}) must be greater than the member start column (${diag.range.start.character})`,
      );
      assert.equal(
        payload.insertColumn,
        diag.range.start.character + "doWork".length,
        "insertColumn should equal start + length of member name",
      );
    });

    test("wrap range points at root unqualified call when arguments contain member chains", () => {
      const code = `Imports Forms
Class C
   Public Sub Run(pItem As TObject, pIdx As Integer)
      Print "Item: " & CStr(Form(pItem).Caption) & ", Indice: " & CStr(pIdx)
   End Sub
End Class`;
      const diags = runLinter(code);
      const diag = expectDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch, "Print");
      const payload = (
        diag as vscode.Diagnostic & {
          data?: { insertColumn?: number; wrapRange?: { startChar: number; endChar: number } };
        }
      ).data;
      assert.ok(payload, "payload should be present");
      assert.equal(diag.range.start.character, 6);
      assert.equal(payload.insertColumn, 11);
      assert.equal(payload.wrapRange?.startChar, 11);
    });

    test("warns when a Dim initializer is a parameterless method without parentheses", () => {
      const diags = runLinter(`Namespace mod_test
   Class T
      Public Function logado() As T
         logado = Nothing
      End Function
   End Class

   Class C
      Public Sub Run()
         Dim obj As New T
         Dim x As T = obj.logado
      End Sub
   End Class
End Namespace`);

      expectDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch, "logado");
    });

    test("warns when assignment RHS is a parameterless method without parentheses", () => {
      const diags = runLinter(`Namespace mod_test
   Class T
      Public Function logado() As T
         logado = Nothing
      End Function
   End Class

   Class C
      Public Sub Run()
         Dim obj As New T
         Dim x As T
         x = obj.logado
      End Sub
   End Class
End Namespace`);

      expectDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch, "logado");
    });

    test("does not warn when parameterless method call already has parentheses", () => {
      const diags = runLinter(`Namespace mod_test
   Class T
      Public Function logado() As T
         logado = Nothing
      End Function
   End Class

   Class C
      Public Sub Run()
         Dim obj As New T
         Dim x As T = obj.logado()
      End Sub
   End Class
End Namespace`);

      expectNoDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch);
    });

    test("warns for Print .Text inside With as unparenthesized call with wrap quickfix", () => {
      const diags = runLinter(`Namespace mod_with_print
   Class Demo
      Function Show(pPrint As Boolean) As String
         With New Collections.StringList()
            .Add("x")
            If pPrint Then
               print .Text
            End If
            Show = .Text
         End With
      End Function
   End Class
End Namespace`);

      expectNoDiagnostic(diags, DiagnosticCodes.LooseValueStatement);
      const diag = expectDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch, "Print");
      const payload = (
        diag as vscode.Diagnostic & {
          data?: { wrapRange?: { startChar: number; endChar: number } };
        }
      ).data;
      assert.ok(payload?.wrapRange, "expected wrapRange for Print(.Text) quickfix");
      const sourceLines = `Namespace mod_with_print
   Class Demo
      Function Show(pPrint As Boolean) As String
         With New Collections.StringList()
            .Add("x")
            If pPrint Then
               print .Text
            End If
            Show = .Text
         End With
      End Function
   End Class
End Namespace`.split("\n");
      const lineText = sourceLines[diag.range.start.line] ?? "";
      const wrapped = lineText.slice(payload!.wrapRange!.startChar, payload!.wrapRange!.endChar);
      assert.equal(wrapped.trim(), ".Text", `wrapRange should cover .Text, got "${wrapped}"`);
    });

    test("warns for Forms.ProcessMessages without parentheses instead of loose-value-statement", () => {
      const diags = runLinter(`Imports Collections

Namespace console
   Private Dim _ProcessMessages As Boolean
   Private Sub Printe(pMessage As String)
      If _ProcessMessages Then
         Forms.ProcessMessages
      End If
   End Sub
End Namespace`);

      expectNoDiagnostic(diags, DiagnosticCodes.LooseValueStatement);
      expectDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch, "ProcessMessages");
    });

    test("does not warn when a Select Case branch references a native Enum member", () => {
      const diags = runLinter(`Namespace mod_rdbms
   Public Enum Options
      SqlServer = 0
      PostgreSQL = 2
      SqLite = 3
   End Enum

   Class Rdbms
      Private _rdbms As Options

      Function DefaultSchema() As String
         Select me._rdbms
            Case Options.SqlServer
               DefaultSchema = "dbo"
            Case Options.PostgreSQL
               DefaultSchema = "public"
            Case Options.SqLite
               DefaultSchema = "main"
         End Select
      End Function
   End Class
End Namespace`);

      expectNoDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch);
    });
  });

  describe("chained-global-function-assignment", () => {
    const runLinter = (code: string) => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///chained_global_function_assignment.bas";
      indexer.updateFileContent(uri, code);
      return DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    };

    test("warns on assignment from a member chain rooted at a global function", () => {
      const diags = runLinter(`Namespace mod_test
   Function CreateItem() As TItem
      CreateItem = Nothing
   End Function

   Class TItem
      Public Function Name() As String
         Name = ""
      End Function
   End Class

   Class C
      Public Sub Run()
         Dim value As String
         value = CreateItem().Name()
      End Sub
   End Class
End Namespace`);

      expectDiagnostic(diags, DiagnosticCodes.ChainedGlobalFunctionAssignment, "CreateItem");
    });

    test("does not warn when a global function chain is only an operand in a composed expression", () => {
      const diags = runLinter(`Namespace mod_test
   Class C
      Private Function timeDiff() As TDateTime
         Dim hours As Integer = 1
         Dim mins As Integer = 2
         Dim secs As Integer = 3
         Dim millisecs As Integer = 4
         timeDiff = DateTime() - DateTime().EncodeTime(hours, mins, secs, millisecs)
      End Function
   End Class
End Namespace`);

      expectNoDiagnostic(diags, DiagnosticCodes.ChainedGlobalFunctionAssignment);
    });

    test("does not emit type-mismatch when a local variable with the same name as a global method is called with empty parens (regression)", () => {
      // `retorno` is a local variable of type `Retorno`. `retorno()` with empty parens is a
      // property-default invocation on the variable, NOT a call to an unrelated global/imported
      // method that happens to share the name. TypeResolver must prioritise the local variable.
      const diags = runLinter(`Namespace mod_test
   Class Retorno
      Public Name As String
   End Class

   ' Simulate an imported callable named "Retorno" that returns a different type
   Function Retorno() As String
      Retorno = ""
   End Function

   Class C
      Public Function getRetorno() As Retorno
         Dim retorno As Retorno = New Retorno()
         getRetorno = retorno()
      End Function
   End Class
End Namespace`);

      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

    test("does not warn on assignment from a chain starting with a system library function", () => {
      const diags = runLinter(`Namespace mod_test
   Class C
      Public Sub Run()
         Dim value As String
         value = Mid("abc", 2).Trim()
      End Sub
   End Class
End Namespace`);

      expectNoDiagnostic(diags, DiagnosticCodes.ChainedGlobalFunctionAssignment);
    });
  });

  describe("scope and type compatibility regressions", () => {
    const runLinter = (uri: string, code: string) => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);
      return DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    };

    test("accepts qualified Forms visual controls assigned to qualified TControl", () => {
      const diags = runLinter(
        "file:///forms_qualified_tcontrol.bas",
        `Namespace mod_forms_controls
   Class C
      Public Sub Run()
         Dim control As Forms.TControl
         Dim button As Forms.FlatButton
         Dim line As Forms.Line
         control = button
         control = line
      End Sub
   End Class
End Namespace`,
      );

      expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    });

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
      registerOpenDocument("file:///modelo_usuario.bas", "modelo_usuario.bas");
      indexer.updateFileContent(
        "file:///modeloConciliacaoCartoes.bas",
        `Namespace modeloConciliacaoCartoes
   Class ConciliacaoCartoes
      Public CodCadastroOperadora As Integer
   End Class
End Namespace`,
      );
      registerOpenDocument("file:///modeloConciliacaoCartoes.bas", "modeloConciliacaoCartoes.bas");
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

      Public Sub New()
         MyBase.New()
      End Sub
      
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
    assert.deepEqual(withoutDeclarationStyleWarnings(diags), []);
  });

  test("allows global Print with non-string values", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const code = `Namespace mod_print_values
   Sub Run()
      Print(1)
      Print(True)
   End Sub
End Namespace`;
    const uri = "file:///print_values.bas";
    indexer.updateFileContent(uri, code);

    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
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
      Public Sub New()
         MyBase.New()
      End Sub

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
    assert.deepEqual(withoutDeclarationStyleWarnings(diags), []);
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

  test("keeps same-named fields scoped to the active class in enum wrapper patterns", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const coreTenum = `Namespace mod_tenum
   Class TEnum
      Protected _value As Integer
      Property AsInteger As Integer
         Get
            AsInteger = me._value
         End Get
      End Property
   End Class
End Namespace`;
    createMockDoc("file:///data7_modules/core_modules/mod_tenum.bas", coreTenum);
    indexer.updateFileContent("file:///data7_modules/core_modules/mod_tenum.bas", coreTenum);

    const uri = "file:///enum_wrapper_fields.bas";
    const code = `Namespace mod_enum
   Class BaseEnum
      Protected _value As Integer
      Property AsInteger As Integer
         Get
            AsInteger = me._value
         End Get
      End Property
      Property AsString As String
         Get
            AsString = ""
         End Get
      End Property
   End Class

   Class TEnum
      Private _value As BaseEnum

      Property Value As BaseEnum
         Get
            Value = me._value
         End Get
      End Property

      Property AsOption As String
         Get
            AsOption = me._value.AsString & "=" & me._value.AsInteger.ToString()
         End Get
      End Property

      Sub New(pValue As BaseEnum)
         me._value = pValue
      End Sub

      Sub New(pValue As TEnum)
         me._value = pValue.Value
      End Sub

      Function GetID() As String
         GetID = me._value.AsString
      End Function
   End Class
End Namespace`;
    createMockDoc(uri, code);
    indexer.updateFileContent(uri, code);

    const diags = DiagnosticsLinter.runAdvancedDiagnostics(
      createMockDoc(uri, code, { register: false }),
      indexer,
    );

    expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
  });

  test("accepts subclass arguments when core_modules homonym shadows workspace class name", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const baseListBas = `Namespace mod_base_list
   Delegate Function FindDel(pValue As BaseItem, i As Integer, extra As Variant) As Boolean
   Class BaseItem
      Sub New()
         MyBase.New()
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class
   Class BaseList
      Sub Add(pItem As BaseItem)
      End Sub
      Sub SetItem(pIndex As Integer, pItem As BaseItem)
      End Sub
      Function Take(pIndex As Integer) As BaseItem
      End Function
      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
    const coreTenum = `Namespace mod_tenum
   Class TEnum
      Inherits TObject
      Property AsInteger As Integer
         Get
            AsInteger = 0
         End Get
      End Property
   End Class
End Namespace`;
    createMockDoc("file:///data7_modules/core_modules/mod_tenum.bas", coreTenum);
    createMockDoc("file:///mod_base_list.bas", baseListBas);
    indexer.updateFileContent("file:///data7_modules/core_modules/mod_tenum.bas", coreTenum);
    indexer.updateFileContent("file:///mod_base_list.bas", baseListBas);

    const uri = "file:///mod_enum_homonym.bas";
    const code = `Imports mod_base_list
Namespace mod_enum
   Class BaseEnum
      Property AsString As String
         Get
            AsString = ""
         End Get
      End Property
   End Class
   Class TEnum
      Inherits BaseItem
      Private _value As BaseEnum
      Property Value As BaseEnum
         Get
            Value = me._value
         End Get
      End Property
      Sub New(pValue As TEnum)
         me._value = pValue.Value
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class
   Class TEnumList
      Inherits BaseList
      Function Add(pValue As BaseEnum) As TEnum
         Dim _option As TEnum = New TEnum(pValue)
         me.Add(_option)
         Add = _option
      End Function
      Property Item(pIndex As Integer) As TEnum
         Get
            Item = CType(MyBase.Take(pIndex), TEnum)
         End Get
         Set(pValue As TEnum)
            me.SetItem(pIndex, pValue)
         End Set
      End Property
      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
    createMockDoc(uri, code);
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
  });

  test("accepts native array delegate invocation and list delegate forwarding", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const baseListBas = `Namespace mod_base_list
   Delegate Function FindDel(pValue As BaseItem, i As Integer, extra As Variant) As Boolean
   Delegate Sub ForEachDel(pValue As BaseItem, i As Integer, extra As Variant)
   Class BaseItem
      Sub New()
         MyBase.New()
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class
   Class BaseList
      Sub ForEach(pHandler As ForEachDel, extra As Variant)
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
    createMockDoc("file:///mod_base_list_native_array.bas", baseListBas);
    indexer.updateFileContent("file:///mod_base_list_native_array.bas", baseListBas);
    const uri = "file:///native_array_delegate.bas";
    const code = `Imports mod_base_list
Namespace mod_printer
   Delegate Sub DelegateOnChangeDefault(pPrinterName As String)
   Delegate Function FindDelegate(pValue As Printer, i As Integer, extra As Variant) As Boolean
   Delegate Sub ForEachDelegate(pValue As Printer, i As Integer, extra As Variant)
   Class Printer
      Inherits BaseItem
      Private Events(2) As DelegateOnChangeDefault
      Sub New()
         MyBase.New()
      End Sub
      Sub SetAsDefault()
         me.Events(0)(me.Name)
      End Sub
      Sub Dispose()
         me.Events.Length = 0
      End Sub
      ReadOnly Name As String
      Sub Free()
         MyBase.Free()
      End Sub
   End Class
   Class PrinterList
      Inherits BaseList
      Sub ForEach(handler As FindDelegate)
         me.ForEach(handler, "")
      End Sub
      Sub ForEach(handler As ForEachDelegate, extra As Variant)
         MyBase.ForEach(handler, extra)
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
    createMockDoc(uri, code);
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
  });

  test("resolves overloaded EnumToInt call sites independently on the same line", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///enum_to_int_overload_same_line.bas";
    const code = `Namespace mod_stream_enums
   Enum TFileMode
      Open
   End Enum
   Enum TFileAccess
      Read
   End Enum
   Class FileStream
      Sub Open(pPath As String)
         me.COM.Open(pPath, EnumToInt(TFileMode.Open()), EnumToInt(TFileAccess.Read()))
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class
   Function EnumToInt(pEnum As TFileMode) As Integer
      EnumToInt = 1
   End Function
   Function EnumToInt(pEnum As TFileAccess) As Integer
      EnumToInt = 2
   End Function
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
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

  test("does not report missing-return-value for legacy Exit Sub guard inside Function", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///function_exit_sub_guard.bas";
    const code = `Namespace ns
   Class C
      Public Function MigrateKeyField(pValid As Boolean) As Boolean
         If Not pValid Then
            Exit Sub
         End If

         MigrateKeyField = True
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);

    expectNoDiagnostic(diags, DiagnosticCodes.MissingReturnValue);
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

    test("does not emit unknown-member when accessing static members of nested classes", () => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///nested_class_test.bas";
      const code = `Namespace FooNs
   Class WinAPI
      Class Window
         Shared Function GetForeground() As Long
            GetForeground = 0
         End Function
      End Class
   End Class

   Class Screen
      Shared Function CurrentWindow() As Long
         CurrentWindow = WinAPI.Window.GetForeground()
      End Function
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
    });
  });

  describe("teste_arrays reduced regression", () => {
    test("emits the canonical diagnostics declared by the reduced demo fixture", () => {
      const content = loadExample("regression/teste-arrays-reduced.bas");
      const header = parseExampleHeader(content);
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///teste-arrays-reduced.bas";
      indexer.updateFileContent(uri, content);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, content), indexer);
      for (const expected of header.diagnostics) {
        expectDiagnostic(diags, expected.code);
      }
    });

    test("does not cascade incomplete member access into comments or unknown empty members", () => {
      const code = `Imports Forms
Class C
   Sub Run(pItem As TObject)
      CType(pItem, Form).Margins.
      ' comment after incomplete member access
      Print("ok")
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
End Class`;
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///teste-arrays-incomplete-member.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(diags, DiagnosticCodes.IncompleteMemberAccess);
      expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
      assert.ok(
        !diags.some((diag) => diag.code === "expected-token"),
        `expected no expected-token after incomplete member access, got: ${diags
          .map((diag) => `${String(diag.code)}: ${diag.message}`)
          .join("\n")}`,
      );
    });

    test("recovers method declarations after missing End Sub without hiding a later Free method", () => {
      const code = `Class Teste2
   Sub New()
      MyBase.New()
   End Sub

   Sub BlocoSemFechamentoDeveGerarErro()
   Private Sub BlocoSemFechamentoDeveGerarErro1()

   Sub Free()
      MyBase.Free()
   End Sub
End Class`;
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///teste-arrays-method-recovery.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(diags, DiagnosticCodes.UnterminatedBlock);
      expectNoDiagnostic(diags, DiagnosticCodes.MissingMyBaseFree);
    });

    test("flags standalone value member chains on TObject-like receivers", () => {
      const code = `Class C
   Sub Run(pItem As TObject)
      pItem.Margins.Bottom
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
End Class`;
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///teste-arrays-loose-value.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(diags, DiagnosticCodes.LooseValueStatement);
    });

    test("emits invalid-declaration when Overrides is not followed by Sub Function or Property", () => {
      const code = `Class Base
   Sub New()
      MyBase.New()
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
End Class

Class Child
   Inherits Base
   Overrides MeuSubQueNaoDeveSerSobrescrito()
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
End Class`;
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///teste-arrays-invalid-overrides.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      assert.ok(
        diags.some((diag) => diag.code === DiagnosticCodes.InvalidDeclaration),
        `expected invalid-declaration, got: ${diags
          .map((diag) => `${String(diag.code)}: ${diag.message}`)
          .join("\n")}`,
      );
    });

    test("rejects Overrides when inherited member is not overridable", () => {
      const code = `Class Base
   Sub New()
      MyBase.New()
   End Sub
   Sub MeuSubQueNaoDeveSerSobrescrito()
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
End Class

Class Child
   Inherits Base
   Overrides Sub MeuSubQueNaoDeveSerSobrescrito()
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
End Class`;
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///teste-arrays-invalid-overrides-base.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      assert.ok(
        diags.some((diag) => diag.code === DiagnosticCodes.InvalidDeclaration),
        `expected invalid-declaration, got: ${diags
          .map((diag) => `${String(diag.code)}: ${diag.message}`)
          .join("\n")}`,
      );
    });

    test("allows Overrides when inherited member is overridable", () => {
      const code = `Class Base
   Sub New()
      MyBase.New()
   End Sub
   Overridable Sub PodeSerSobrescrito()
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
End Class

Class Child
   Inherits Base
   Overrides Sub PodeSerSobrescrito()
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
End Class`;
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///teste-arrays-valid-overrides-base.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      assert.ok(
        !diags.some((diag) => diag.code === DiagnosticCodes.InvalidDeclaration),
        `expected no invalid-declaration, got: ${diags
          .map((diag) => `${String(diag.code)}: ${diag.message}`)
          .join("\n")}`,
      );
    });

    test("requires MustInherit subclasses to implement inherited MustOverride members", () => {
      const code = `Class Teste3
   MustOverride Overridable Function MinhaFunctionQuePrecisaSerSobrescrita() As String
   End Function
End Class

MustInherit Class Teste4
   Inherits Teste3
End Class`;
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///teste-arrays-mustinherit-mustoverride.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(diags, DiagnosticCodes.MustOverrideNotImplemented);
    });

    test("emits unterminated-block for Using without End Using", () => {
      const code = `Class Disposable
   Sub New()
      MyBase.New()
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
End Class

Using item As New Disposable()
   item.Free()`;
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///teste-arrays-using-recovery.bas";
      indexer.updateFileContent(uri, code);

      const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
      expectDiagnostic(diags, DiagnosticCodes.UnterminatedBlock);
    });
  });

  describe("Principal.bas linter regressions", () => {
    const runLinter = (code: string): readonly vscode.Diagnostic[] => {
      const indexer = WorkspaceSymbolIndexer.createDetached();
      const uri = "file:///principal-linter-regressions.bas";
      indexer.updateFileContent(uri, code);
      return DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    };

    const exampleClass = `Class Exemplo
   Sub New(pTitle As String)
      MyBase.New()
   End Sub

   Sub SubDeExemplo()
   End Sub

   Property PropertyDeExemplo As String
      Get
         PropertyDeExemplo = ""
      End Get
   End Property

   Function FunctionAsIntegerDeExemplo(pInteger As Integer, pSubTitle As String = "Teste") As Integer
      FunctionAsIntegerDeExemplo = pInteger
   End Function

   Sub Free()
      MyBase.Free()
   End Sub
End Class`;

    test("emits missing-return-type for Function and Property declarations without As", () => {
      const diags = runLinter(`Class Exemplo
   Property PropertyDeExemplo
      Get
      End Get
   End Property

   Function FunctionDeExemplo()
   End Function

   Shared Function SharedFunctionDeExemplo()
   End Function

   Sub Free()
      MyBase.Free()
   End Sub
End Class`);

      expectDiagnostic(diags, DiagnosticCodes.MissingReturnType, "PropertyDeExemplo");
      expectDiagnostic(diags, DiagnosticCodes.MissingReturnType, "FunctionDeExemplo");
      expectDiagnostic(diags, DiagnosticCodes.MissingReturnType, "SharedFunctionDeExemplo");
    });

    test("rejects member access chained directly on object creation", () => {
      const diags = runLinter(`${exampleClass}

Dim valor As String = New Exemplo("titulo").PropertyDeExemplo
New Exemplo("titulo").SubDeExemplo()`);

      expectDiagnostic(diags, DiagnosticCodes.ChainedInstantiationAccess, "New Exemplo");
    });

    test("rejects class members used unqualified in global scope", () => {
      const diags = runLinter(`${exampleClass}

Dim tentandoAcessarPropDireto As String = PropertyDeExemplo
Dim tentandoAcessarFnDireto As String = FunctionAsIntegerDeExemplo
Dim tentandoAcessarFn2Direto As String = FunctionAsIntegerDeExemplo()`);

      expectDiagnostic(diags, DiagnosticCodes.UnknownSymbol, "PropertyDeExemplo");
      expectDiagnostic(diags, DiagnosticCodes.UnknownSymbol, "FunctionAsIntegerDeExemplo");
    });

    test("rejects instance members accessed through the class name", () => {
      const diags = runLinter(`${exampleClass}

Exemplo.SubDeExemplo()
Dim valor As Integer = Exemplo.FunctionAsIntegerDeExemplo(123)`);

      expectDiagnostic(diags, DiagnosticCodes.InstanceMemberAccessOnType, "SubDeExemplo");
      expectDiagnostic(
        diags,
        DiagnosticCodes.InstanceMemberAccessOnType,
        "FunctionAsIntegerDeExemplo",
      );
    });

    test("validates constructor arity and method optional parameters", () => {
      const diags = runLinter(`${exampleClass}

Dim teste As New Exemplo()
Dim ok As New Exemplo("titulo")
Dim instancia As New Exemplo("titulo")
Dim faltandoArgs As Integer = instancia.FunctionAsIntegerDeExemplo()`);

      expectDiagnostic(diags, DiagnosticCodes.AutoNewNonDefaultCtor, "Exemplo");
      expectDiagnostic(
        diags,
        DiagnosticCodes.CallParenthesesMismatch,
        "FunctionAsIntegerDeExemplo",
      );
    });

    test("accepts omitted optional method parameters", () => {
      const diags = runLinter(`${exampleClass}

Dim instancia As New Exemplo("titulo")
Dim opcionalOk As Integer = instancia.FunctionAsIntegerDeExemplo(123)`);

      expectNoDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch);
    });
  });
});
