import "../_setup/global-hooks";
import { afterEach, describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { DiagnosticCodes, WorkspaceSymbolIndexer } from "@data7/core";

import { DiagnosticService } from "../../services/diagnostic-service";

import { createMockDoc, mockTextDocuments, resetMockWorkspace } from "../_helpers/mock-doc";

describe("DiagnosticService live lifecycle", () => {
  const originalCreateDiagnosticCollection = vscode.languages.createDiagnosticCollection;

  afterEach(() => {
    (vscode.languages as any).createDiagnosticCollection = originalCreateDiagnosticCollection;
    DiagnosticService.__resetForTests();
    resetMockWorkspace();
  });

  test("prunes diagnostics for physical .bas files that are no longer open", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );
    const basPath = path.join(srcDir, "mod_test.bas");
    fs.writeFileSync(basPath, "Namespace mod_test\nEnd Namespace\n", "utf8");

    const entries = new Map<string, vscode.Diagnostic[]>();
    const deleted: string[] = [];
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(uri.toString().toLowerCase(), diags);
      },
      get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
      delete: (uri: vscode.Uri) => {
        deleted.push(uri.toString().toLowerCase());
        entries.delete(uri.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });

    DiagnosticService.initialize({ subscriptions: [] } as any);
    const doc = createMockDoc(
      vscode.Uri.file(basPath).toString(),
      fs.readFileSync(basPath, "utf8"),
    );

    DiagnosticService.refreshDiagnostics(doc);
    assert.ok(entries.has(doc.uri.toString().toLowerCase()));

    mockTextDocuments.length = 0;
    DiagnosticService.pruneClosedDiagnostics();

    assert.equal(entries.has(doc.uri.toString().toLowerCase()), false);
    assert.deepEqual(deleted, [doc.uri.toString().toLowerCase()]);
  });

  test("keeps workspace lint diagnostics for closed files after pruning live diagnostics", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );
    const basPath = path.join(srcDir, "mod_bad.bas");
    const code = [
      "Namespace mod_bad",
      "Class C",
      "  Public Sub Run()",
      "    Dim value As MissingType",
      "  End Sub",
      "End Class",
      "End Namespace",
      "",
    ].join("\n");
    fs.writeFileSync(basPath, code, "utf8");
    const uri = vscode.Uri.file(basPath);

    const entries = new Map<string, vscode.Diagnostic[]>();
    const deleted: string[] = [];
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (target: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(target.toString().toLowerCase(), diags);
      },
      get: (target: vscode.Uri) => entries.get(target.toString().toLowerCase()),
      delete: (target: vscode.Uri) => {
        deleted.push(target.toString().toLowerCase());
        entries.delete(target.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });
    DiagnosticService.initialize({ subscriptions: [] } as any);

    DiagnosticService.lintFile(uri);

    const key = uri.toString().toLowerCase();
    assert.ok(entries.get(key)?.some((diag) => diag.code === DiagnosticCodes.UnknownType));

    mockTextDocuments.length = 0;
    DiagnosticService.pruneClosedDiagnostics();

    assert.ok(entries.has(key), "workspace lint diagnostics must remain visible in Problems");
    assert.equal(deleted.includes(key), false);
  });

  test("does not emit module-not-found for imported local classes used statically", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );

    const principalPath = path.join(srcDir, "Principal.bas");
    const principal = [
      "Imports helpers",
      "Imports stringHelpers",
      "Namespace app",
      "Public Sub Run()",
      "  Helper.timeUid()",
      '  stringHelper.split("-", "1-2")',
      "End Sub",
      "End Namespace",
      "",
    ].join("\n");
    fs.writeFileSync(principalPath, principal, "utf8");
    fs.writeFileSync(
      path.join(srcDir, "helpers.bas"),
      "Namespace helpers\nClass Helper\nEnd Class\nEnd Namespace\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(srcDir, "stringHelpers.bas"),
      "Namespace stringHelpers\nClass StringHelper\nEnd Class\nEnd Namespace\n",
      "utf8",
    );

    const entries = new Map<string, vscode.Diagnostic[]>();
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(uri.toString().toLowerCase(), diags);
      },
      get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
      delete: (uri: vscode.Uri) => {
        entries.delete(uri.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });

    DiagnosticService.initialize({ subscriptions: [] } as any);
    const doc = createMockDoc(vscode.Uri.file(principalPath).toString(), principal);

    DiagnosticService.refreshDiagnostics(doc);

    const diags = entries.get(doc.uri.toString().toLowerCase()) ?? [];
    assert.equal(
      diags.some((diag) => diag.code === DiagnosticCodes.ModuleNotFound),
      false,
    );
  });

  test("does not emit module-not-found for project globals declared in Principal.bas", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );

    const principalPath = path.join(srcDir, "Principal.bas");
    const principal = [
      "Namespace modelo_usuario",
      "Class Usuario",
      "  Public CodEmpresa As Integer",
      "End Class",
      "End Namespace",
      "",
      "Dim _usuario As Usuario",
      "",
    ].join("\n");
    fs.writeFileSync(principalPath, principal, "utf8");

    const formPath = path.join(srcDir, "frmEventos.bas");
    const formCode = [
      "Namespace frmEventos",
      "Class Eventos",
      "  Public Sub Run()",
      "    Dim empresa As Integer = _usuario.CodEmpresa",
      "  End Sub",
      "End Class",
      "End Namespace",
      "",
    ].join("\n");
    fs.writeFileSync(formPath, formCode, "utf8");

    const entries = new Map<string, vscode.Diagnostic[]>();
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(uri.toString().toLowerCase(), diags);
      },
      get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
      delete: (uri: vscode.Uri) => {
        entries.delete(uri.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });

    const indexer = WorkspaceSymbolIndexer.getInstance();
    indexer.updateFileContent(vscode.Uri.file(principalPath).toString(), principal);
    indexer.updateFileContent(vscode.Uri.file(formPath).toString(), formCode);

    DiagnosticService.initialize({ subscriptions: [] } as any);
    const doc = createMockDoc(vscode.Uri.file(formPath).toString(), formCode);

    DiagnosticService.refreshDiagnostics(doc);

    const diags = entries.get(doc.uri.toString().toLowerCase()) ?? [];
    assert.equal(
      diags.some((diag) => diag.code === DiagnosticCodes.ModuleNotFound),
      false,
    );
  });

  test("does not emit module-not-found for With shorthand member access", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );

    const principalPath = path.join(srcDir, "Principal.bas");
    const principal = [
      "Namespace app",
      "Class Screen",
      "  Public Sub Run()",
      "    With Me",
      '      .Title = "Link de Cobranca"',
      "      .Refresh()",
      "    End With",
      "  End Sub",
      "End Class",
      "End Namespace",
      "",
    ].join("\n");
    fs.writeFileSync(principalPath, principal, "utf8");

    const entries = new Map<string, vscode.Diagnostic[]>();
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(uri.toString().toLowerCase(), diags);
      },
      get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
      delete: (uri: vscode.Uri) => {
        entries.delete(uri.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });

    DiagnosticService.initialize({ subscriptions: [] } as any);
    const doc = createMockDoc(vscode.Uri.file(principalPath).toString(), principal);

    DiagnosticService.refreshDiagnostics(doc);

    const diags = entries.get(doc.uri.toString().toLowerCase()) ?? [];
    assert.equal(
      diags.some((diag) => diag.code === DiagnosticCodes.ModuleNotFound),
      false,
    );
  });

  test("does not emit module-not-found for imported system classes used statically", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );

    const principalPath = path.join(srcDir, "Principal.bas");
    const principal = [
      "Imports IO",
      "Imports System.IOUtils",
      "Namespace app",
      "Class Screen",
      "  Public Sub Run(pPath As String)",
      "    TFile.Exists(pPath)",
      "    File.ExtractName(pPath)",
      "  End Sub",
      "End Class",
      "End Namespace",
      "",
    ].join("\n");
    fs.writeFileSync(principalPath, principal, "utf8");

    const entries = new Map<string, vscode.Diagnostic[]>();
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(uri.toString().toLowerCase(), diags);
      },
      get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
      delete: (uri: vscode.Uri) => {
        entries.delete(uri.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });

    DiagnosticService.initialize({ subscriptions: [] } as any);
    const doc = createMockDoc(vscode.Uri.file(principalPath).toString(), principal);

    DiagnosticService.refreshDiagnostics(doc);

    const diags = entries.get(doc.uri.toString().toLowerCase()) ?? [];
    assert.equal(
      diags.some((diag) => diag.code === DiagnosticCodes.ModuleNotFound),
      false,
    );
  });

  test("does not clear workspace file diagnostics when closed", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );
    const basPath = path.join(srcDir, "mod_workspace.bas");
    fs.writeFileSync(basPath, "Namespace mod_workspace\nEnd Namespace\n", "utf8");

    const entries = new Map<string, vscode.Diagnostic[]>();
    const deleted: string[] = [];
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(uri.toString().toLowerCase(), diags);
      },
      get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
      delete: (uri: vscode.Uri) => {
        deleted.push(uri.toString().toLowerCase());
        entries.delete(uri.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });

    const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder;
    (vscode.workspace as any).getWorkspaceFolder = (uri: vscode.Uri) => {
      if (uri.fsPath.toLowerCase().startsWith(tmpDir.toLowerCase())) {
        return { uri: vscode.Uri.file(tmpDir), name: "TmpWorkspace", index: 0 };
      }
      return undefined;
    };

    try {
      DiagnosticService.initialize({ subscriptions: [] } as any);
      const uri = vscode.Uri.file(basPath);
      const doc = createMockDoc(uri.toString(), fs.readFileSync(basPath, "utf8"));

      DiagnosticService.refreshDiagnostics(doc);
      assert.ok(entries.has(uri.toString().toLowerCase()));

      // Simulate closing the text document. Since it is inside the workspace,
      // it should NOT clear or prune its diagnostics.
      // Trigger pruneClosedDiagnostics while the document is no longer "open" (mockTextDocuments empty)
      mockTextDocuments.length = 0;
      DiagnosticService.pruneClosedDiagnostics();

      assert.ok(
        entries.has(uri.toString().toLowerCase()),
        "workspace diagnostics should persist after pruning closed files",
      );
      assert.equal(
        deleted.includes(uri.toString().toLowerCase()),
        false,
        "should not delete from diagnostic collection",
      );
    } finally {
      (vscode.workspace as any).getWorkspaceFolder = originalGetWorkspaceFolder;
    }
  });

  test("automatically reevaluates dependent files when a dependency is updated", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );

    // X depends on Y: imports Y's namespace (ControleTitulos)
    const fileX = path.join(srcDir, "frmConciliacao.bas");
    const codeX = [
      "Imports ControleTitulos",
      "Namespace frmConciliacao",
      "  Class Form",
      "    Public Sub Free()",
      "      MyBase.Free()",
      "    End Sub",
      "    Dim _controle As ControleTitulos",
      "  End Class",
      "End Namespace",
    ].join("\n");

    // Y defines ControleTitulos
    const fileY = path.join(srcDir, "ControleTitulos.bas");
    const codeY = [
      "Namespace ControleTitulos",
      "  Class ControleTitulos",
      "    Public Sub Free()",
      "      MyBase.Free()",
      "    End Sub",
      "  End Class",
      "End Namespace",
    ].join("\n");

    fs.writeFileSync(fileX, codeX, "utf8");
    fs.writeFileSync(fileY, codeY, "utf8");

    const entries = new Map<string, vscode.Diagnostic[]>();
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(uri.toString().toLowerCase(), diags);
      },
      get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
      delete: (uri: vscode.Uri) => {
        entries.delete(uri.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });

    const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder;
    (vscode.workspace as any).getWorkspaceFolder = (uri: vscode.Uri) => {
      if (uri.fsPath.toLowerCase().startsWith(tmpDir.toLowerCase())) {
        return { uri: vscode.Uri.file(tmpDir), name: "TmpWorkspace", index: 0 };
      }
      return undefined;
    };

    try {
      // Index both files
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(vscode.Uri.file(fileX).toString(), codeX);
      indexer.updateFileContent(vscode.Uri.file(fileY).toString(), codeY);

      DiagnosticService.initialize({ subscriptions: [] } as any);

      // Initially run diagnostics on X. It imports ControleTitulos, which is present, so there should be no errors.
      const docX = createMockDoc(vscode.Uri.file(fileX).toString(), codeX);
      DiagnosticService.refreshDiagnostics(docX);
      const initialDiagsX = entries.get(docX.uri.toString().toLowerCase()) ?? [];
      assert.equal(initialDiagsX.length, 0, "Initially X should be error-free");

      // Now, simulate a change in Y: we rename the namespace of Y to "OutroNome", so X's import becomes unresolved
      const codeYChanged = [
        "Namespace OutroNome",
        "  Class OutroNome",
        "    Public Sub Free()",
        "      MyBase.Free()",
        "    End Sub",
        "  End Class",
        "End Namespace",
      ].join("\n");
      fs.writeFileSync(fileY, codeYChanged, "utf8");
      indexer.updateFileContent(vscode.Uri.file(fileY).toString(), codeYChanged);

      // Trigger diagnostics on Y. It should trigger the asynchronous re-evaluation of its dependent X!
      const docY = createMockDoc(vscode.Uri.file(fileY).toString(), codeYChanged);
      DiagnosticService.refreshDiagnostics(docY);

      // Wait for the reevaluation (which is set to 50ms asynchronously)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Now check if X has been updated and now has a diagnostic (e.g. missing-import or similar)
      const finalDiagsX = entries.get(docX.uri.toString().toLowerCase()) ?? [];
      assert.ok(
        finalDiagsX.some(
          (diag) =>
            diag.code === DiagnosticCodes.MissingImport ||
            diag.code === DiagnosticCodes.UnknownType,
        ),
        "X should automatically receive diagnostics because Y was changed and no longer declares ControleTitulos",
      );
    } finally {
      (vscode.workspace as any).getWorkspaceFolder = originalGetWorkspaceFolder;
    }
  });

  test("automatically resolves and clears diagnostics in dependent closed files when a missing dependency is added", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );

    // X depends on Y: imports Y's namespace (ControleTitulos) and instantiates ControleTitulos.Titulo class
    const fileX = path.join(srcDir, "frmConciliacao.bas");
    const codeX = [
      "Imports ControleTitulos",
      "Namespace frmConciliacao",
      "  Class Form",
      "    Public Sub Free()",
      "      MyBase.Free()",
      "    End Sub",
      "    Dim _controle As ControleTitulos.Titulo",
      "  End Class",
      "End Namespace",
    ].join("\n");

    // Y initially does NOT define ControleTitulos.Titulo class (empty namespace)
    const fileY = path.join(srcDir, "ControleTitulos.bas");
    const codeYEmpty = ["Namespace ControleTitulos", "End Namespace"].join("\n");

    fs.writeFileSync(fileX, codeX, "utf8");
    fs.writeFileSync(fileY, codeYEmpty, "utf8");

    const entries = new Map<string, vscode.Diagnostic[]>();
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(uri.toString().toLowerCase(), diags);
      },
      get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
      delete: (uri: vscode.Uri) => {
        entries.delete(uri.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });

    const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder;
    (vscode.workspace as any).getWorkspaceFolder = (uri: vscode.Uri) => {
      if (uri.fsPath.toLowerCase().startsWith(tmpDir.toLowerCase())) {
        return { uri: vscode.Uri.file(tmpDir), name: "TmpWorkspace", index: 0 };
      }
      return undefined;
    };

    try {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(vscode.Uri.file(fileX).toString(), codeX);
      indexer.updateFileContent(vscode.Uri.file(fileY).toString(), codeYEmpty);

      DiagnosticService.initialize({ subscriptions: [] } as any);

      // Run diagnostics on X. Since Titulo class is missing in Y, X must have an UnknownType error.
      const docX = createMockDoc(vscode.Uri.file(fileX).toString(), codeX);
      DiagnosticService.refreshDiagnostics(docX);
      const initialDiagsX = entries.get(docX.uri.toString().toLowerCase()) ?? [];
      assert.ok(
        initialDiagsX.some(
          (diag) =>
            diag.code === DiagnosticCodes.MissingImport ||
            diag.code === DiagnosticCodes.UnknownType,
        ),
        "Initially X should have type resolution errors",
      );

      // Now, simulate adding the missing ControleTitulos.Titulo class to Y
      const codeYFixed = [
        "Namespace ControleTitulos",
        "  Class Titulo",
        "    Public Sub Free()",
        "      MyBase.Free()",
        "    End Sub",
        "  End Class",
        "End Namespace",
      ].join("\n");
      fs.writeFileSync(fileY, codeYFixed, "utf8");
      indexer.updateFileContent(vscode.Uri.file(fileY).toString(), codeYFixed);

      // Run diagnostics on Y. It should trigger the asynchronous re-evaluation of its dependent X.
      const docY = createMockDoc(vscode.Uri.file(fileY).toString(), codeYFixed);
      DiagnosticService.refreshDiagnostics(docY);

      // Wait for the reevaluation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Now check if X has been updated and its type resolution error has been cleared!
      const finalDiagsX = entries.get(docX.uri.toString().toLowerCase()) ?? [];
      const hasErrors = finalDiagsX.some(
        (diag) =>
          diag.code === DiagnosticCodes.MissingImport || diag.code === DiagnosticCodes.UnknownType,
      );
      assert.equal(
        hasErrors,
        false,
        "Errors in X should be resolved and cleared after Y was fixed",
      );
    } finally {
      (vscode.workspace as any).getWorkspaceFolder = originalGetWorkspaceFolder;
    }
  });
});
