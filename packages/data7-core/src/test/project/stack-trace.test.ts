import "../_setup/global-hooks";
import { afterEach, describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { SugarTranspiler, type TranspileContext } from "../../project/transpiler";
import { SugarRegistry } from "../../project/sugars";
import { Builder } from "../../project/builder";
import { createDefaultProjectMetadata } from "../../project/default-project-metadata";
import { getCoreModulesPath } from "../../infra/extension-paths";
import { withTempDir } from "../_helpers/temp-dir";
import { loadExample } from "../_helpers/fixtures";

function makeContext(overrides: Partial<TranspileContext> = {}): TranspileContext {
  return {
    detectEnumerable() {
      return undefined;
    },
    ...overrides,
  };
}

function enableStackTrace(overrides: Partial<TranspileContext> = {}): TranspileContext {
  const { stackTrace, ...rest } = overrides;
  return makeContext({
    sugarOptions: { enabled: true, enabledSugarIds: ["stack-trace"] },
    stackTrace: {
      locationMode: "source",
      sourceFilePath: "C:\\project\\src\\Principal.bas",
      moduleName: "Principal",
      wrapPrincipal: false,
      ...stackTrace,
    },
    ...rest,
  });
}

function assertPrincipalCatchRethrows(code: string): void {
  assert.match(
    code,
    /Catch ex As Exception\s*\r?\n\s*mod_logger\.Printe\(StackTrace\.Report\(ex\)\)\s*\r?\n\s*StackTrace\.Clean\(\)\s*\r?\n\s*Throw\s*\r?\nFinally\s*\r?\n\s*StackTrace\.Clean\(\)/,
  );
  assert.doesNotMatch(code, /\bThrow\(\)/);
}

function stripExampleHeader(source: string): string {
  const lines = source.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";
    if (line === "" || line.startsWith("' @") || line === "'") {
      index++;
      continue;
    }
    break;
  }
  return lines.slice(index).join("\n");
}

describe("stack-trace sugar", () => {
  test("orders stack-trace after logger-print", () => {
    const ordered = SugarRegistry.orderByPrecedence(["array-list", "logger-print", "stack-trace"]);
    assert.deepEqual(ordered.slice(-1), ["stack-trace"]);
  });

  test("is opt-in and stays off by default", () => {
    const plugin = SugarRegistry.get("stack-trace");
    assert.ok(plugin);
    assert.equal(plugin.enabledByDefault, false);
    const ctx = makeContext({});
    const { code } = SugarTranspiler.transpile("Sub Run()\n   Print(1)\nEnd Sub", ctx);
    assert.doesNotMatch(code, /StackTrace\.Push/);
  });

  test("injects Push at method start and Pop before Return and at the end", () => {
    const ctx = enableStackTrace();
    const source = ["Sub Run()", "   Print(1)", "   Return", "   Print(2)", "End Sub"].join("\n");
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.match(
      code,
      /StackTrace\.Push\("Principal\.Run", "C:\\project\\src\\Principal\.bas", 1\)/,
    );
    assert.match(code, /StackTrace\.Pop\(\)\s*\r?\n\s*Return/);
    assert.match(code, /StackTrace\.Pop\(\)\s*\r?\nEnd Sub/);
  });

  test("does not insert Pop before Exit For", () => {
    const ctx = enableStackTrace();
    const source = ["Sub Run()", "   For i = 1 To 3", "      Exit For", "   Next", "End Sub"].join(
      "\n",
    );
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.doesNotMatch(code, /StackTrace\.Pop\(\)\s*\r?\n\s*Exit For/);
    assert.match(code, /Exit For/);
  });

  test("inserts Pop before Exit Function", () => {
    const ctx = enableStackTrace();
    const source = [
      "Function Value() As Integer",
      "   Value = 1",
      "   Exit Function",
      "End Function",
    ].join("\n");
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.match(code, /StackTrace\.Pop\(\)\s*\r?\n\s*Exit Function/);
  });

  test("instruments property getters and setters", () => {
    const ctx = enableStackTrace();
    const source = [
      "Class TFoo",
      "   Property Name As String",
      "      Get",
      '         Name = "x"',
      "      End Get",
      "      Set(pValue As String)",
      "         Print(pValue)",
      "      End Set",
      "   End Property",
      "End Class",
    ].join("\n");
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.match(code, /StackTrace\.Push\("Principal\.TFoo\.Name\.Get"/);
    assert.match(code, /StackTrace\.Push\("Principal\.TFoo\.Name\.Set"/);
  });

  test("does not instrument the StackTrace runtime namespace", () => {
    const ctx = enableStackTrace({
      stackTrace: {
        locationMode: "source",
        sourceFilePath: "C:\\ext\\core_modules\\mod_stacktrace.bas",
        moduleName: "mod_stacktrace",
        wrapPrincipal: false,
      },
    });
    const source = [
      "Namespace StackTrace",
      "   Sub Push(pName As String)",
      "      Print(pName)",
      "   End Sub",
      "   Sub Pop()",
      "   End Sub",
      "End Namespace",
    ].join("\n");
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.doesNotMatch(code, /StackTrace\.Push\("StackTrace/);
    assert.doesNotMatch(code, /StackTrace\.Pop\(\)/);
  });

  test("does not instrument the shipped core_modules StackTrace runtime", () => {
    const coreDir = getCoreModulesPath();
    const runtimePath = path.join(coreDir, "mod_stacktrace.bas");
    assert.ok(fs.existsSync(runtimePath), "mod_stacktrace.bas must ship in core_modules");
    const source = fs.readFileSync(runtimePath, "utf-8");
    const ctx = enableStackTrace({
      stackTrace: {
        locationMode: "source",
        sourceFilePath: runtimePath,
        moduleName: "mod_stacktrace",
        wrapPrincipal: false,
      },
    });
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.doesNotMatch(code, /StackTrace\.Push\("StackTrace/);
  });

  test("instruments other core modules", () => {
    const ctx = enableStackTrace({
      stackTrace: {
        locationMode: "source",
        sourceFilePath: "C:\\ext\\core_modules\\mod_logger.bas",
        moduleName: "mod_logger",
        wrapPrincipal: false,
      },
    });
    const source = [
      "Namespace mod_logger",
      "   Sub Printe(pMsg As String)",
      "      Print(pMsg)",
      "   End Sub",
      "End Namespace",
    ].join("\n");
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.match(
      code,
      /StackTrace\.Push\("mod_logger\.Printe", "C:\\ext\\core_modules\\mod_logger\.bas", 2\)/,
    );
  });

  test("does not inject Imports StackTrace because calls are qualified", () => {
    const ctx = enableStackTrace();
    const { code } = SugarTranspiler.transpile("Sub Run()\n   Print(1)\nEnd Sub", ctx);
    assert.match(code, /StackTrace\.Push\("Principal\.Run"/);
    assert.doesNotMatch(code, /Imports StackTrace/);
  });

  test("wraps Principal executable statements in Try/Catch/Finally", () => {
    const ctx = enableStackTrace({
      stackTrace: {
        locationMode: "source",
        sourceFilePath: "C:\\project\\src\\Principal.bas",
        moduleName: "Principal",
        wrapPrincipal: true,
      },
    });
    const source = [
      "Imports Collections",
      "",
      "Sub Run()",
      "   Print(1)",
      "End Sub",
      "",
      "Run()",
    ].join("\n");
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.match(code, /^Imports Collections$/m);
    assert.doesNotMatch(code, /Imports StackTrace/);
    assert.match(code, /Try\s*\r?\n\s*Run\(\)/);
    assertPrincipalCatchRethrows(code);
  });

  test("wraps script-style Principal Dim and calls after Imports", () => {
    const ctx = enableStackTrace({
      stackTrace: {
        locationMode: "source",
        sourceFilePath: "C:\\project\\src\\Principal.bas",
        moduleName: "Principal",
        wrapPrincipal: true,
      },
    });
    const source = [
      "Imports mod_form_cliente",
      "",
      'Dim _form As New TFormCliente("Cadastro")',
      "_form.Show()",
      "_form.Free()",
    ].join("\n");
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.match(code, /^Imports mod_form_cliente$/m);
    assert.doesNotMatch(code, /Imports StackTrace/);
    assert.doesNotMatch(code, /__syntheticMethod/i);
    assert.match(code, /Try\s*\r?\n\s*Dim _form As New TFormCliente\("Cadastro"\)/);
    assert.match(code, /_form\.Show\(\)/);
    assertPrincipalCatchRethrows(code);
  });

  test("wraps Principal even when the only executable body is already a Try", () => {
    const ctx = enableStackTrace({
      stackTrace: {
        locationMode: "source",
        sourceFilePath: "C:\\project\\src\\Principal.bas",
        moduleName: "Principal",
        wrapPrincipal: true,
      },
    });
    const source = [
      "Sub Run()",
      "   Print(1)",
      "End Sub",
      "Try",
      "   Run()",
      "Catch ex As Exception",
      "   Print(ex.Message)",
      "End Try",
    ].join("\n");
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.equal((code.match(/Catch ex As Exception/g) ?? []).length, 2);
    assertPrincipalCatchRethrows(code);
  });

  test("wraps Principal that only has methods", () => {
    const ctx = enableStackTrace({
      stackTrace: {
        locationMode: "source",
        sourceFilePath: "C:\\project\\src\\Principal.bas",
        moduleName: "Principal",
        wrapPrincipal: true,
      },
    });
    const { code } = SugarTranspiler.transpile("Sub Run()\n   Print(1)\nEnd Sub", ctx);
    assert.match(code, /End Sub\s*\r?\nTry/);
    assertPrincipalCatchRethrows(code);
  });

  test("uses packaged unit name in generated location mode", () => {
    const ctx = enableStackTrace({
      stackTrace: {
        locationMode: "generated",
        sourceFilePath: "C:\\project\\src\\mod_orders.bas",
        moduleName: "mod_orders",
        wrapPrincipal: false,
      },
    });
    const source = ["Sub Bill()", "   Print(1)", "End Sub"].join("\n");
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.match(code, /StackTrace\.Push\("mod_orders\.Bill", "mod_orders\.bas", 1\)/);
    assert.doesNotMatch(code, /C:\\project\\src\\mod_orders\.bas/);
  });

  test("respects disabledSugarIds", () => {
    const ctx = makeContext({
      sugarOptions: { enabled: true, disabledSugarIds: ["stack-trace"] },
      stackTrace: {
        locationMode: "source",
        sourceFilePath: "C:\\project\\src\\Principal.bas",
        moduleName: "Principal",
        wrapPrincipal: true,
      },
    });
    const { code } = SugarTranspiler.transpile("Sub Run()\n   Print(1)\nEnd Sub", ctx);
    assert.doesNotMatch(code, /StackTrace\.Push/);
  });

  test("canonical method example injects Push/Pop", () => {
    const ctx = enableStackTrace();
    const source = stripExampleHeader(loadExample("sugar/stack-trace/01-method-push-pop.bas"));
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.match(code, /StackTrace\.Push\("Principal\.Run"/);
    assert.match(code, /StackTrace\.Pop\(\)\s*\r?\n\s*Return/);
  });

  test("canonical Principal example wraps the entrypoint", () => {
    const ctx = enableStackTrace({
      stackTrace: {
        locationMode: "source",
        sourceFilePath: "C:\\project\\src\\Principal.bas",
        moduleName: "Principal",
        wrapPrincipal: true,
      },
    });
    const source = stripExampleHeader(loadExample("sugar/stack-trace/02-principal-try.bas"));
    const { code } = SugarTranspiler.transpile(source, ctx);
    assert.match(code, /^Imports Collections$/m);
    assert.doesNotMatch(code, /Imports StackTrace/);
    assert.match(code, /Try\s*\r?\n\s*Dim _form As String = "ok"/);
    assertPrincipalCatchRethrows(code);
  });
});

describe("stack-trace project defaults", () => {
  test("new projects leave stackTrace disabled", () => {
    const metadata = createDefaultProjectMetadata({
      nome: "TraceProj",
      opcoes: {
        autor: "Test",
        versao: "1.0.0",
        informacoes: "",
        codEmpresa: 1,
        codFilial: 1,
        nomeUsuario: "Test",
        preScript: "",
        identificacaoBancoDados: "",
      },
    });
    assert.equal(metadata.stackTrace?.enabled, false);
  });
});

describe("stack-trace builder integration", () => {
  afterEach(() => {
    Builder.__resetBuildCacheForTests();
  });

  test("F5 source mode embeds the real .bas path; generated mode uses the unit name", async () => {
    await withTempDir(async (tmp) => {
      const srcDir = path.join(tmp, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(tmp, "data7.json"),
        JSON.stringify({
          nome: "TraceProj",
          language: "Basic",
          version: "1.0.0",
          targetPlatform: "Default",
          opcoes: {
            autor: "Test",
            versao: "1.0.0",
            informacoes: "",
            codEmpresa: 1,
            codFilial: 1,
            nomeUsuario: "Test",
            preScript: "",
            identificacaoBancoDados: "",
          },
          virtualFolders: [],
          modulesMetadata: {},
          stackTrace: { enabled: true },
        }),
        "utf-8",
      );
      const principalPath = path.join(srcDir, "Principal.bas");
      fs.writeFileSync(
        principalPath,
        ["Sub Run()", "   Print(1)", "End Sub", "Run()"].join("\n"),
        "utf-8",
      );

      const sourceXml = path.join(tmp, "source.7Proj");
      Builder.buildProject(tmp, sourceXml, undefined, {
        stackTraceEnabled: true,
        stackTraceLocationMode: "source",
      });
      const sourceOut = fs.readFileSync(sourceXml, "utf-8");
      const xmlPath = principalPath.replace(/&/g, "&amp;");
      assert.ok(
        sourceOut.includes(xmlPath) || sourceOut.includes(principalPath),
        "F5 build must embed the real Principal.bas path",
      );

      Builder.__resetBuildCacheForTests();
      const generatedXml = path.join(tmp, "generated.7Proj");
      Builder.buildProject(tmp, generatedXml, undefined, {
        stackTraceEnabled: true,
        stackTraceLocationMode: "generated",
      });
      const generatedOut = fs.readFileSync(generatedXml, "utf-8");
      assert.match(
        generatedOut,
        /StackTrace\.Push\(&quot;Principal\.Run&quot;, &quot;Principal\.bas&quot;/,
      );
      assert.match(generatedOut, /Catch ex As Exception/);
      assert.match(generatedOut, /StackTrace\.Clean\(\)/);
      assert.match(generatedOut, /Throw/);
      assert.doesNotMatch(generatedOut, /\bThrow\(\)/);
      assert.doesNotMatch(generatedOut, /Imports StackTrace/);
      assert.doesNotMatch(generatedOut, /StackTrace\.Push\(&quot;Principal\.Run&quot;, &quot;C:/);
    });
  });

  test("instruments core_modules except the StackTrace runtime", async () => {
    await withTempDir(async (tmp) => {
      fs.mkdirSync(path.join(tmp, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, "data7.json"),
        JSON.stringify({
          nome: "TraceCore",
          language: "Basic",
          version: "1.0.0",
          targetPlatform: "Default",
          opcoes: {
            autor: "Test",
            versao: "1.0.0",
            informacoes: "",
            codEmpresa: 1,
            codFilial: 1,
            nomeUsuario: "Test",
            preScript: "",
            identificacaoBancoDados: "",
          },
          virtualFolders: [],
          modulesMetadata: {},
          stackTrace: { enabled: true },
        }),
        "utf-8",
      );
      fs.writeFileSync(
        path.join(tmp, "src", "Principal.bas"),
        ["Sub Run()", "   Print(1)", "End Sub", "Run()"].join("\n"),
        "utf-8",
      );

      const coreDir = path.join(tmp, "data7_modules", "core_modules");
      fs.mkdirSync(coreDir, { recursive: true });
      fs.writeFileSync(
        path.join(coreDir, "mod_logger.bas"),
        [
          "'@Module",
          "Namespace mod_logger",
          "   Sub Printe(pMsg As String)",
          "      Print(pMsg)",
          "   End Sub",
          "End Namespace",
        ].join("\n"),
        "utf-8",
      );
      fs.writeFileSync(
        path.join(coreDir, "mod_stacktrace.bas"),
        [
          "'@Module",
          "Namespace StackTrace",
          "   Sub Push(pName As String, pFile As String, pLine As Integer)",
          "      Print(pName)",
          "   End Sub",
          "   Sub Pop()",
          "   End Sub",
          "   Function Report(pEx As Exception) As String",
          '      Report = ""',
          "   End Function",
          "   Sub Clean()",
          "   End Sub",
          "End Namespace",
        ].join("\n"),
        "utf-8",
      );

      const destXml = path.join(tmp, "TraceCore.7Proj");
      Builder.buildProject(tmp, destXml, undefined, {
        stackTraceEnabled: true,
        stackTraceLocationMode: "generated",
      });
      const xml = fs.readFileSync(destXml, "utf-8");
      assert.match(xml, /StackTrace\.Push\(&quot;mod_logger\.Printe&quot;/);
      assert.match(xml, /Catch ex As Exception/);
      assert.match(xml, /Throw/);
      assert.doesNotMatch(xml, /\bThrow\(\)/);
      assert.doesNotMatch(xml, /Imports StackTrace/);
      assert.doesNotMatch(xml, /StackTrace\.Push\(&quot;StackTrace\.Push/);
      assert.doesNotMatch(xml, /StackTrace\.Push\(&quot;StackTrace\.Pop/);
      assert.doesNotMatch(xml, /StackTrace\.Push\(&quot;StackTrace\.Report/);
      assert.doesNotMatch(xml, /StackTrace\.Push\(&quot;StackTrace\.Clean/);
    });
  });
});
