import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { DiagnosticsLinter } from "../../diagnostics/diagnostics";
import { DiagnosticCodes } from "../../diagnostics/diagnostic-codes";
import { createMockDoc, registerOpenDocument } from "../_helpers/mock-doc";
import { expectNoDiagnostic } from "../_helpers/assertions";
import { parseBasic } from "../../project/parser";
import { strict as assert } from "node:assert";

/**
 * Regressions for false positives seen while linting a real Data7 project
 * (Conciliacao de Cartoes). Fixes must be root-cause resolver/catalog/parser
 * changes — not one-off suppressions.
 */
describe("real-project linter false positives", () => {
  test("field named grid is instance access, not Forms.Grid static access", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///grid_field.bas";
    const code = `Imports Forms
Namespace mod_adapter
   Class Adaptador
      Dim grid As Grid
      Public Sub Load()
         grid.LoadFromXLS("a.xls")
         Dim rows As Integer = grid.RowCount
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.InstanceMemberAccessOnType);
  });

  test("namespace migracoes.migrar is not shadowed by private field migracoes", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const migracoesUri = "file:///migracoes.bas";
    const migracoesCode = `Namespace migracoes
   Class Migrar
      Public Shared Function getCodigoTabela(pTabela As String) As Integer
         getCodigoTabela = 1
      End Function
      Public Shared Sub executar()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(migracoesUri, migracoesCode);
    registerOpenDocument(migracoesUri, "migracoes.bas");

    const fieldUri = "file:///servicos.bas";
    const fieldCode = `Namespace ServicosCampos
   Class ServicosCampos
      Private migracoes As MigracoesCampos
   End Class
   Class MigracoesCampos
   End Class
End Namespace`;
    indexer.updateFileContent(fieldUri, fieldCode);
    registerOpenDocument(fieldUri, "servicos.bas");

    const uri = "file:///controle.bas";
    const code = `Imports ServicosCampos
Namespace controleMigracoes
   Public Sub Run()
      Dim id As Integer = migracoes.migrar.getCodigoTabela("T")
   End Sub
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
    expectNoDiagnostic(diags, DiagnosticCodes.MissingImport);
  });

  test("qualified migracoes.migrar.executar needs no Imports of ServicosCampos", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const migracoesUri = "file:///migracoes.bas";
    const migracoesCode = `Namespace migracoes
   Class Migrar
      Public Shared Sub executar()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(migracoesUri, migracoesCode);
    registerOpenDocument(migracoesUri, "migracoes.bas");

    const fieldUri = "file:///servicos_campos.bas";
    const fieldCode = `Namespace servicos_campos
   Class ServicosCampos
      Private migracoes As MigracoesCampos
   End Class
   Class MigracoesCampos
      Public Sub run()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(fieldUri, fieldCode);
    registerOpenDocument(fieldUri, "servicos_campos.bas");

    const uri = "file:///Principal.bas";
    const code = `migracoes.migrar.executar()
`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    const migracoesImport = diags.filter(
      (d) =>
        d.code === DiagnosticCodes.MissingImport &&
        /migracoes|ServicosCampos|servicos_campos/i.test(d.message),
    );
    assert.equal(migracoesImport.length, 0, migracoesImport.map((d) => d.message).join("; "));
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
  });

  test("qualified pesquisaPadrao.Pesquisa keeps container for Shared members", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const padraoUri = "file:///pesquisaPadrao.bas";
    const padraoCode = `Namespace pesquisaPadrao
   Class Pesquisa
      Public Shared Function Natureza() As Integer
         Natureza = 1
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(padraoUri, padraoCode);
    registerOpenDocument(padraoUri, "pesquisaPadrao.bas");

    const modeloUri = "file:///modeloPesquisa.bas";
    const modeloCode = `Namespace modeloPesquisa
   Class Pesquisa
      Public CodPesquisa As Integer
   End Class
End Namespace`;
    indexer.updateFileContent(modeloUri, modeloCode);
    registerOpenDocument(modeloUri, "modeloPesquisa.bas");

    const uri = "file:///uso.bas";
    const code = `Imports modeloPesquisa
Namespace controle
   Public Sub Run()
      Dim cod As Integer = pesquisaPadrao.Pesquisa.Natureza
   End Sub
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownMember);
  });

  test("TypeName(expr) cast does not emit unknown-symbol for known classes", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const clienteUri = "file:///Modelo_Cliente.bas";
    const clienteCode = `Namespace Modelo_Cliente
   Class Cliente
      Public CodCliente As Integer
      Public Sub toString()
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(clienteUri, clienteCode);
    registerOpenDocument(clienteUri, "Modelo_Cliente.bas");

    const uri = "file:///Modelo_Clientes.bas";
    const code = `Imports Modelo_Cliente
Namespace Modelo_Clientes
   Class Clientes
      Dim _list As TObjectList = New TObjectList()
      Function pegar(index As Integer) As Cliente
         pegar = Cliente(_list[index])
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
  });

  test("parentheses default indexer on TStringList local is not unknown-symbol", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///arquivos_indexer.bas";
    const code = `Imports Collections
Namespace frmMenuEventos
   Class TEventos
      Public Sub Run()
         Dim i As Integer
         Dim _arquivos As New TStringList()
         Dim s As String = _arquivos(i)
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.UnknownSymbol);
  });

  test("Property Global parses as an allowed name keyword", () => {
    const result = parseBasic(`Namespace mod_regex
   Class Regex
      Private _global As Boolean
      Property global() As Boolean
         Get
            Return Me._global
         End Get
         Set(ByVal pValor As Boolean)
            Me._global = pValor
         End Set
      End Property
   End Class
End Namespace`);
    assert.equal(result.errors.length, 0, result.errors.map((e) => e.message).join("; "));
  });

  test("primitive ToString accepts optional format mask", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///tostring_format.bas";
    const code = `Namespace mod_fmt
   Class C
      Public Sub Run()
         Dim v As Currency = 1.5
         Dim s As String = v.toString(",0.00")
         Dim d As Double = 2.5
         Dim t As String = d.toString(",0.00")
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch);
  });

  test("Net.TFTP Get/Put/List accept documented optional arity", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///ftp_arity.bas";
    const code = `Imports Net
Imports Collections
Namespace helpers_ftp
   Class Ftp
      Dim _ftp As TFTP
      Public Sub Run()
         Dim arquivos As StringList = New StringList()
         _ftp.get("remote", "local", True, False)
         _ftp.put("local", "remote", False)
         _ftp.list(arquivos, "", False)
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.CallParenthesesMismatch);
  });

  test("IO.File.GetFiles accepts TStringList as well as StringList", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const uri = "file:///getfiles.bas";
    const code = `Imports IO
Imports Collections
Namespace helpers
   Class FileHelper
      Public Sub Run()
         Dim list As TStringList = New TStringList()
         File.GetFiles(list, "C:\\tmp", "*.*")
      End Sub
   End Class
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
  });

  test("unqualified Campos matches imported modeloCampos.Campos return type", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const camposUri = "file:///modeloCampos.bas";
    const camposCode = `Namespace modeloCampos
   Class Campos
      Public Function Count() As Integer
         Count = 0
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(camposUri, camposCode);
    registerOpenDocument(camposUri, "modeloCampos.bas");

    const otherUri = "file:///modelo_campos.bas";
    const otherCode = `Namespace modelo_campos
   Class Campos
      Public Function Count() As Integer
         Count = 0
      End Function
   End Class
End Namespace`;
    indexer.updateFileContent(otherUri, otherCode);
    registerOpenDocument(otherUri, "modelo_campos.bas");

    const uri = "file:///controle.bas";
    const code = `Imports modeloCampos
Namespace controle
   Function ConfigurarCampos() As modeloCampos.Campos
      Dim _campos As Campos = New Campos()
      ConfigurarCampos = _campos
   End Function
End Namespace`;
    indexer.updateFileContent(uri, code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(createMockDoc(uri, code), indexer);
    expectNoDiagnostic(diags, DiagnosticCodes.TypeMismatch);
  });
});
