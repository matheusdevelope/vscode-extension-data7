import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  DEFAULT_PRUNE_REMOVE_OPTIONS,
  pruneBuildModules,
  type PruneOptimizationOptions,
} from "../../../project/optimizer";

const PRUNE_OPTIONS: PruneOptimizationOptions = {
  enabled: true,
  report: true,
  strategy: "principal-closure",
  alwaysInclude: [],
  remove: { ...DEFAULT_PRUNE_REMOVE_OPTIONS },
};

describe("pruneBuildModules", () => {
  test("keeps only namespaces reachable from Principal.Main across modules", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_helper
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim helper As THelper = New THelper()
         helper.Touch()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "shared_module",
          fileUri: "file:///workspace/src/shared_module.bas",
          code: `Namespace mod_helper
   Class THelper
      Public Sub New()
      End Sub

      Public Sub Touch()
      End Sub
   End Class
End Namespace

Namespace mod_unused
   Class DeadClass
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const principal = result.modules.get("Principal") ?? "";
    const shared = result.modules.get("shared_module") ?? "";

    assert.match(principal, /Namespace mod_principal/);
    assert.match(principal, /Sub Main/);
    assert.match(shared, /Namespace mod_helper/);
    assert.match(shared, /Class THelper/);
    assert.doesNotMatch(shared, /Namespace mod_unused/);
    assert.doesNotMatch(shared, /DeadClass/);
    assert.ok(result.report);
    assert.ok(result.report.liveNamespaces.some((item) => item.toLowerCase() === "mod_helper"));
    assert.ok(result.report.excludedNamespaces.some((item) => item.toLowerCase() === "mod_unused"));
  });

  test("drops modules that only declare unreachable namespaces", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Namespace mod_principal
   Class Program
      Public Sub Main()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "dead_module",
          fileUri: "file:///workspace/data7_modules/dead_module.bas",
          code: `Namespace mod_dead_only
   Class Dead
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    assert.ok(result.excludedModuleNames.has("dead_module"));
    assert.equal(result.modules.has("dead_module"), false);
  });

  test("excludes entire module files with no live declared namespaces", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_helper
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim helper As THelper = New THelper()
         helper.Touch()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "helper_module",
          fileUri: "file:///workspace/src/helper_module.bas",
          code: `Namespace mod_helper
   Class THelper
      Public Sub New()
      End Sub
      Public Sub Touch()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "imports_only_shell",
          fileUri: "file:///workspace/src/imports_only_shell.bas",
          code: `Imports mod_helper
Imports Collections
Namespace mod_shell_only
   Class Shell
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    assert.equal(result.modules.has("imports_only_shell"), false);
    assert.ok(result.excludedModuleNames.has("imports_only_shell"));
    for (const code of result.modules.values()) {
      const namespaceCount = [...code.matchAll(/^\s*Namespace\s+/gim)].length;
      const importOnly = /^\s*(Imports\b|'.*)+$/gim.test(code.trim()) && namespaceCount === 0;
      assert.equal(importOnly, false);
    }
  });

  test("preserves namespaces marked with data7 keep directives", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Namespace mod_principal
   Class Program
      Public Sub Main()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "external_api",
          fileUri: "file:///workspace/src/external_api.bas",
          code: `'@data7:keep
Namespace mod_external
   Class ExternalEntry
      Public Sub CalledByNativeIde()
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const external = result.modules.get("external_api") ?? "";
    assert.match(external, /Namespace mod_external/);
    assert.match(external, /CalledByNativeIde/);
  });

  test("keeps namespaces referenced inside any live namespace body (post-sugar qualified calls)", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_form
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim form As TFormButtons = New TFormButtons()
         form.Show()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_form",
          fileUri: "file:///workspace/src/mod_form.bas",
          code: `Imports mod_console
Namespace mod_form
   Class TFormButtons
      Public Sub New()
      End Sub

      Public Sub Show()
         mod_console.Printe("hello")
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_console",
          fileUri: "file:///workspace/src/mod_console.bas",
          code: `Namespace mod_console
   Class Console
      Public Shared Sub Printe(pMessage As String)
         mod_logger.Printe(pMessage)
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_logger",
          fileUri: "file:///workspace/data7_modules/mod_logger.bas",
          code: `Namespace mod_logger
   Class Logger
      Public Shared Sub Printe(pMessage As String)
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_unused",
          fileUri: "file:///workspace/src/mod_unused.bas",
          code: `Namespace mod_unused
   Class Dead
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    assert.ok(result.modules.has("mod_console"));
    assert.ok(result.modules.has("mod_logger"));
    assert.equal(result.modules.has("mod_unused"), false);
    assert.ok(result.excludedModuleNames.has("mod_unused"));
    assert.ok(result.report);
    assert.ok(result.report.liveNamespaces.some((item) => item.toLowerCase() === "mod_logger"));
    assert.ok(result.report.liveNamespaces.some((item) => item.toLowerCase() === "mod_console"));
  });

  test("keeps namespaces referenced by qualified New expressions in factory methods", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_pipeline_datasource
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim source As IGridDataSource = mod_pipeline_datasource.Load("grid", True)
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_pipeline_datasource",
          fileUri: "file:///workspace/src/mod_pipeline_datasource.bas",
          code: `Namespace mod_pipeline_datasource
   Class Factory
      Public Shared Function Load(pKind As String, pWritable As Boolean) As IGridDataSource
         Select pKind
            Case "grid"
               Load = New mod_pipeline_datasource_grid.GridDataSource("", pWritable)
            Case "excel"
               Load = New mod_pipeline_datasource_excel.ExcelGridDataSource("", pWritable)
         End Select
      End Function
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_pipeline_datasource_grid",
          fileUri: "file:///workspace/data7_modules/mod_pipeline_datasource_grid.bas",
          code: `Namespace mod_pipeline_datasource_grid
   Class GridDataSource
      Public Sub New(pName As String, pWritable As Boolean)
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_pipeline_datasource_excel",
          fileUri: "file:///workspace/data7_modules/mod_pipeline_datasource_excel.bas",
          code: `Namespace mod_pipeline_datasource_excel
   Class ExcelGridDataSource
      Public Sub New(pPath As String, pWritable As Boolean)
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_pipeline_datasource_unused",
          fileUri: "file:///workspace/data7_modules/mod_pipeline_datasource_unused.bas",
          code: `Namespace mod_pipeline_datasource_unused
   Class DeadSource
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    assert.ok(result.modules.has("mod_pipeline_datasource"));
    assert.ok(result.modules.has("mod_pipeline_datasource_grid"));
    assert.ok(result.modules.has("mod_pipeline_datasource_excel"));
    assert.equal(result.modules.has("mod_pipeline_datasource_unused"), false);
    assert.ok(
      result.report?.liveNamespaces.some(
        (item) => item.toLowerCase() === "mod_pipeline_datasource_grid",
      ),
    );
    assert.ok(
      result.report?.liveNamespaces.some(
        (item) => item.toLowerCase() === "mod_pipeline_datasource_excel",
      ),
    );
  });

  test("falls back to original modules when any input cannot be parsed", () => {
    const broken = `Namespace app
   Class Broken
`;
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: broken,
        },
      ],
      PRUNE_OPTIONS,
    );

    assert.equal(result.modules.get("Principal"), broken);
    assert.ok(result.report?.warnings.some((warning) => warning.includes("failed to parse")));
  });

  test("removes dead methods inside a live class", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim x As TWidget = New TWidget()
         x.Used()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "widgets",
          fileUri: "file:///workspace/src/widgets.bas",
          code: `Namespace mod_principal
   Class TWidget
      Public Sub New()
      End Sub

      Public Sub Used()
      End Sub

      Public Sub Dead()
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const widgets = result.modules.get("widgets") ?? "";
    assert.match(widgets, /Sub Used/);
    assert.doesNotMatch(widgets, /Sub Dead/);
  });

  test("keeps Sub New and Sub Free on a live class even when never called", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim x As TWidget = New TWidget()
         x.Used()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "widgets",
          fileUri: "file:///workspace/src/widgets.bas",
          code: `Namespace mod_principal
   Class TWidget
      Public Sub New()
         Me._token = "ok"
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

      Public Sub Used()
      End Sub

      Public Sub Dead()
      End Sub

      Private _token As String
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const widgets = result.modules.get("widgets") ?? "";
    assert.match(widgets, /Sub New/);
    assert.match(widgets, /Sub Free/);
    assert.match(widgets, /Sub Used/);
    assert.doesNotMatch(widgets, /Sub Dead/);
  });

  test("keeps event handler assigned via Me.Method without direct call", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim form As TForm = New TForm()
         form.Wire()
      End Sub
   End Class

   Class TForm
      Public Sub New()
      End Sub

      Public Sub Wire()
         Me.OnClick = Me.Handler
      End Sub

      Public Sub Handler()
      End Sub

      Public Sub Unused()
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.match(principal, /Sub Handler/);
    assert.doesNotMatch(principal, /Sub Unused/);
  });

  test("remove.methods false keeps dead methods", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim x As TWidget = New TWidget()
         x.Used()
      End Sub
   End Class

   Class TWidget
      Public Sub New()
      End Sub
      Public Sub Used()
      End Sub
      Public Sub Dead()
      End Sub
   End Class
End Namespace`,
        },
      ],
      {
        ...PRUNE_OPTIONS,
        remove: { ...DEFAULT_PRUNE_REMOVE_OPTIONS, methods: false },
      },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.match(principal, /Sub Dead/);
  });

  test("removes dead enum and keeps live enum", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Namespace mod_principal
   Enum LiveEnum
      A = 1
   End Enum

   Enum DeadEnum
      B = 2
   End Enum

   Class Program
      Public Sub Main()
         Dim v As LiveEnum = LiveEnum.A
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.match(principal, /Enum LiveEnum/);
    assert.doesNotMatch(principal, /Enum DeadEnum/);
  });

  test("respects declareMethods flag for Declare Sub", () => {
    const code = `Namespace mod_principal
   Class Program
      Public Sub Main()
      End Sub
   End Class

   Private Declare Sub Sleep Lib "kernel32" (dwMilliseconds As Long)
End Namespace`;

    const removed = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code,
        },
      ],
      PRUNE_OPTIONS,
    );
    assert.doesNotMatch(removed.modules.get("Principal") ?? "", /Declare Sub Sleep/);

    const kept = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code,
        },
      ],
      {
        ...PRUNE_OPTIONS,
        remove: { ...DEFAULT_PRUNE_REMOVE_OPTIONS, declareMethods: false },
      },
    );
    assert.match(kept.modules.get("Principal") ?? "", /Declare Sub Sleep/);
  });

  test("namespace-only prune follows refs from retained dead members", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_entry
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim e As TEntry = New TEntry()
         e.Run()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_entry",
          fileUri: "file:///workspace/src/mod_entry.bas",
          code: `Imports mod_helper
Namespace mod_entry
   Class TEntry
      Public Sub New()
      End Sub

      Public Sub Run()
      End Sub

      Public Sub DeadPath()
         mod_helper.Touch()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_helper",
          fileUri: "file:///workspace/src/mod_helper.bas",
          code: `Namespace mod_helper
   Class Util
      Public Shared Sub Touch()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_orphan",
          fileUri: "file:///workspace/src/mod_orphan.bas",
          code: `Namespace mod_orphan
   Class Dead
   End Class
End Namespace`,
        },
      ],
      {
        ...PRUNE_OPTIONS,
        remove: {
          ...DEFAULT_PRUNE_REMOVE_OPTIONS,
          namespaces: true,
          classes: false,
          structures: false,
          enums: false,
          delegates: false,
          methods: false,
          declareMethods: false,
          fields: false,
          properties: false,
          consts: false,
          variables: false,
          unusedImports: false,
        },
      },
    );

    assert.ok(result.modules.has("mod_helper"), "helper kept via retained DeadPath body");
    assert.equal(result.modules.has("mod_orphan"), false);
    assert.match(result.modules.get("mod_entry") ?? "", /Sub DeadPath/);
  });

  test("keeps Principal top-level Dim declarations used as seeds", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_entry
Dim app As New TApp()
app.Run()
`,
        },
        {
          moduleName: "mod_entry",
          fileUri: "file:///workspace/src/mod_entry.bas",
          code: `Namespace mod_entry
   Class TApp
      Public Sub New()
      End Sub
      Public Sub Run()
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.match(principal, /Dim app As/);
    assert.match(principal, /app\.Run/);
  });
});
