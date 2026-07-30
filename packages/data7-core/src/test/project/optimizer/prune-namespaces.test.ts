import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  DEFAULT_PRUNE_REMOVE_OPTIONS,
  pruneBuildModules,
  type PruneOptimizationOptions,
} from "../../../project/optimizer";
import { collectUnusedCodeDiagnostics } from "../../../diagnostics/unused-code-analyzer";

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

  test("falls back to original modules when Principal cannot be parsed", () => {
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
    assert.ok(
      result.report?.warnings.some((warning) => /Principal failed to parse/i.test(warning)),
    );
  });

  test("keeps unparsed non-Principal modules and still prunes the rest", () => {
    const brokenHelper = `Namespace mod_broken
   Class Broken
`;
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
          moduleName: "broken_module",
          fileUri: "file:///workspace/src/broken_module.bas",
          code: brokenHelper,
        },
        {
          moduleName: "dead_module",
          fileUri: "file:///workspace/src/dead_module.bas",
          code: `Namespace mod_dead_only
   Class Dead
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    assert.equal(result.modules.get("broken_module"), brokenHelper);
    assert.equal(result.modules.has("dead_module"), false);
    assert.ok(
      result.report?.warnings.some((warning) =>
        warning.includes('unparsed module "broken_module"'),
      ),
    );
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

  test("drops unused Principal globals (dead class, Dim, Const) while keeping used ones", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_entry
Class GlobalShared
   Shared Sub UsedGlobal()
   End Sub
   Shared Sub DeadGlobal()
   End Sub
End Class

Class GlobalDeadClass
   Sub New()
      MyBase.New()
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
End Class

Class GlobalLiveClass
   Sub New()
      MyBase.New()
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
   Sub Touch()
   End Sub
End Class

GlobalShared.UsedGlobal()
Dim g As New GlobalLiveClass()
g.Touch()
Dim app As New TApp()
app.Run()
Dim deadApp As New TApp()
Const deadConst = 12356
`,
        },
        {
          moduleName: "mod_entry",
          fileUri: "file:///workspace/src/mod_entry.bas",
          code: `Namespace mod_entry
   Class TApp
      Public Sub New()
      End Sub
      Public Sub Free()
         MyBase.Free()
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
    assert.match(principal, /Class GlobalShared/);
    assert.match(principal, /UsedGlobal/);
    assert.doesNotMatch(principal, /DeadGlobal/);
    assert.doesNotMatch(principal, /Class GlobalDeadClass/);
    assert.match(principal, /Class GlobalLiveClass/);
    assert.match(principal, /Dim g As/);
    assert.match(principal, /Dim app As/);
    assert.doesNotMatch(principal, /deadApp/);
    assert.doesNotMatch(principal, /deadConst/);
  });

  test("unused-code hits are a subset of prune exclusions for the same modules", () => {
    const modules = [
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

      Public Sub Free()
         MyBase.Free()
      End Sub

      Public Sub Used()
      End Sub

      Public Sub Dead()
      End Sub

      Public DeadField As Integer
   End Class

   Class DeadClass
   End Class
End Namespace`,
      },
    ];

    const pruned = pruneBuildModules(modules, PRUNE_OPTIONS);
    const hits = collectUnusedCodeDiagnostics(modules, {
      alwaysInclude: PRUNE_OPTIONS.alwaysInclude,
      remove: PRUNE_OPTIONS.remove,
    });

    const prunedText = [...pruned.modules.values()].join("\n");
    for (const hit of hits) {
      const name = hit.diagnostic.message.match(/"([^"]+)"/)?.[1];
      assert.ok(name, `expected quoted name in: ${hit.diagnostic.message}`);
      const shortName = name.split(".").pop() ?? name;
      assert.doesNotMatch(
        prunedText,
        new RegExp(`\\b${escapeRegExp(shortName)}\\b`),
        `unused-code hit "${name}" should be removed by prune`,
      );
    }
  });

  test("keeps system Imports (Collections) when live members still need them", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_list
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim bag As TBag = New TBag()
         bag.Touch()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_list",
          fileUri: "file:///workspace/src/mod_list.bas",
          code: `Imports Collections
Namespace mod_list
   Class TBag
      Private _lines As StringList

      Public Sub New()
         me._lines = New StringList()
      End Sub

      Public Sub Touch()
      End Sub

      Public Sub Dead()
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const list = result.modules.get("mod_list") ?? "";
    assert.match(list, /Imports Collections/);
    assert.match(list, /Private _lines As StringList/);
    assert.doesNotMatch(list, /Sub Dead/);
  });

  test("keeps delegate types and helpers referenced only by sibling overloads", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_core
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim list As TList = New TList()
         Dim idx As Integer = list.IndexOf("x")
         Dim log As Logger = New Logger()
         log.Printe("hi")
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_core",
          fileUri: "file:///workspace/src/mod_core.bas",
          code: `Namespace mod_core
   Delegate FindDel(pItem As Variant) As Boolean

   Class TList
      Public Sub New()
      End Sub

      Public Function IndexOf(pID As String) As Integer
         IndexOf = 0
      End Function

      Public Function IndexOf(pHandler As FindDel) As Integer
         IndexOf = -1
      End Function
   End Class

   Private Function ObjectAsString(pObject As Variant) As String
      ObjectAsString = CStr(pObject)
   End Function

   Private Function LoggerLevelFromString(pLevel As String) As Integer
      LoggerLevelFromString = 0
   End Function

   Class Logger
      Public Sub New()
      End Sub

      Public Sub Log(pLevel As Integer, pMessage As Variant)
      End Sub

      Public Sub Log(pLevel As Integer, pObject As Variant)
         Dim text As String = ObjectAsString(pObject)
      End Sub

      Public Sub Log(pLevel As String, pMessage As Variant)
         me.Log(LoggerLevelFromString(pLevel), pMessage)
      End Sub

      Public Sub Info(pMessage As Variant)
         me.Log(2, pMessage)
      End Sub

      Public Sub Printe(pMessage As Variant)
         me.Info(pMessage)
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const core = result.modules.get("mod_core") ?? "";
    assert.match(core, /Delegate FindDel/);
    assert.match(core, /Function IndexOf\(pHandler As FindDel\)/);
    assert.match(core, /Function ObjectAsString/);
    assert.match(core, /Function LoggerLevelFromString/);
    assert.match(core, /Sub Log\(pLevel As Integer, pObject As Variant\)/);
  });

  test("keeps protected base-class helpers reached via Me from a subclass", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_logger
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim log As Logger = New Logger()
         Dim text As String = log.Describe()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_tobject",
          fileUri: "file:///workspace/src/mod_tobject.bas",
          code: `Namespace mod_tobject
   Class TTObjectPrinter
      Public Sub New(pTitle As String)
      End Sub
      Public Function Text() As String
         Text = "ok"
      End Function
   End Class

   Class TTObject
      Public Sub New()
      End Sub

      Protected Function BuildLogger(pTitle As String) As TTObjectPrinter
         BuildLogger = New TTObjectPrinter(pTitle)
      End Function

      Public Sub DeadBase()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_logger",
          fileUri: "file:///workspace/src/mod_logger.bas",
          code: `Imports mod_tobject
Namespace mod_logger
   Class Logger
      Inherits TTObject

      Public Sub New()
         MyBase.New()
      End Sub

      Public Function Describe() As String
         With me.BuildLogger(me.ClassName)
            Describe = .Text()
         End With
      End Function

      Public Sub Dead()
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const tobject = result.modules.get("mod_tobject") ?? "";
    const logger = result.modules.get("mod_logger") ?? "";
    assert.match(tobject, /Function BuildLogger/);
    assert.match(tobject, /Class TTObjectPrinter/);
    assert.match(logger, /me\.BuildLogger/);
    assert.doesNotMatch(tobject, /Sub DeadBase/);
    assert.doesNotMatch(logger, /Sub Dead\b/);
  });

  test("keeps Overrides on a live subclass when the base virtual member is live", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_log
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim logger As Logger = New Logger()
         logger.Write("hi")
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_log",
          fileUri: "file:///workspace/src/mod_log.bas",
          code: `Namespace mod_log
   Class LogTransport
      Public Sub New()
      End Sub

      Public Sub Write(pMessage As String)
         me.Log(pMessage)
      End Sub

      Public Overridable Sub Log(pMessage As String)
         Throw New Exception("LogTransport.Log must be implemented.")
      End Sub
   End Class

   Class TransportConsole
      Inherits LogTransport

      Public Sub New()
         MyBase.New()
      End Sub

      Public Overrides Sub Log(pMessage As String)
         Print(pMessage)
      End Sub

      Public Sub Dead()
      End Sub
   End Class

   Class Logger
      Public Sub New()
      End Sub

      Public Sub Write(pMessage As String)
         Dim transport As LogTransport = New TransportConsole()
         transport.Write(pMessage)
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const mod = result.modules.get("mod_log") ?? "";
    assert.match(mod, /Overrides Sub Log/);
    assert.match(mod, /Print\(pMessage\)/);
    assert.doesNotMatch(mod, /Sub Dead/);
  });

  test("keeps Shared members on Namespace.Type.Member across modules", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_core
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim text As String = Facade.Options()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_core",
          fileUri: "file:///workspace/src/mod_core.bas",
          code: `Namespace mod_core
   Class Facade
      Public Sub New()
      End Sub

      Public Shared Function Options() As String
         Options = mod_stone.StoneEnum.GetOptions()
      End Function

      Public Shared Function LoadIt(pName As String) As String
         LoadIt = mod_stone.StoneEnum.LoadGrouper(pName)
      End Function
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_stone",
          fileUri: "file:///workspace/src/mod_stone.bas",
          code: `Namespace mod_stone
   Class StoneEnum
      Public Sub New()
      End Sub

      Public Shared Function GetOptions() As String
         GetOptions = "a"
      End Function

      Public Shared Function LoadGrouper(pName As String) As String
         LoadGrouper = pName
      End Function

      Public Shared Function DeadShared() As String
         DeadShared = ""
      End Function
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const stone = result.modules.get("mod_stone") ?? "";
    assert.match(stone, /Function GetOptions/);
    assert.doesNotMatch(stone, /Function DeadShared/);
    // LoadGrouper only referenced from Facade.LoadIt which is dead — may drop.
    // Keep assertion focused on the live GetOptions path.
  });

  test("keeps chained members on types from non-imported namespaces (.Value.AsString)", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_group
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim def As TGroup = New TGroup()
         Dim text As String = def.BuildKey()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_group",
          fileUri: "file:///workspace/src/mod_group.bas",
          code: `Imports mod_record
Namespace mod_group
   Class TGroup
      Public Sub New()
      End Sub

      Public Function BuildKey() As String
         Dim rec As TRecord = New TRecord()
         BuildKey = rec.Cells.Take("x").Value.AsString
      End Function
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_record",
          fileUri: "file:///workspace/src/mod_record.bas",
          code: `Imports mod_cell
Namespace mod_record
   Class TRecord
      Cells As TCellList

      Public Sub New()
         me.Cells = New TCellList()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_cell",
          fileUri: "file:///workspace/src/mod_cell.bas",
          code: `Imports mod_value
Namespace mod_cell
   Class TCellList
      Public Sub New()
      End Sub

      Public Function Take(pName As String) As TCell
         Take = New TCell()
      End Function
   End Class

   Class TCell
      Property Value As TTValue
         Get
            Value = New TTValue()
         End Get
      End Property

      Public Sub New()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_value",
          fileUri: "file:///workspace/src/mod_value.bas",
          code: `Namespace mod_value
   Class TTValue
      Property AsString As String
         Get
            AsString = "x"
         End Get
      End Property

      Property AsCurrency As Currency
         Get
            AsCurrency = 0
         End Get
      End Property

      Public Sub New()
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const value = result.modules.get("mod_value") ?? "";
    assert.match(value, /Property AsString/);
    assert.doesNotMatch(value, /Property AsCurrency/);
  });

  test("does not keep dead Take() return types from BaseList.Copy chains", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_list
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim list As LiveList = New LiveList()
         Dim copy As LiveList = list.Copy()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_list",
          fileUri: "file:///workspace/src/mod_list.bas",
          code: `Namespace mod_list
   Class BaseItem
      Public Sub New()
      End Sub

      Public Overridable Function Copy() As BaseItem
         Copy = New BaseItem()
      End Function
   End Class

   Class BaseList
      Public Sub New()
      End Sub

      Public Function Take(pIndex As Integer) As BaseItem
         Take = New BaseItem()
      End Function

      Public Function Copy() As BaseList
         Dim _copy As New BaseList(), i As Integer
         For i = 0 To 0
            _copy.Add(me.Take(i).Copy())
         Next
         Copy = _copy
      End Function

      Public Sub Add(pItem As BaseItem)
      End Sub
   End Class

   Class LiveItem
      Inherits BaseItem

      Public Sub New()
         MyBase.New()
      End Sub

      Public Overrides Function Copy() As BaseItem
         Copy = New LiveItem()
      End Function
   End Class

   Class LiveList
      Inherits BaseList

      Public Sub New()
         MyBase.New()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_printer",
          fileUri: "file:///workspace/src/mod_printer.bas",
          code: `Imports mod_list
Namespace mod_printer
   Class Printer
      Inherits BaseItem

      Public Sub New()
         MyBase.New()
      End Sub

      Public Overrides Function Copy() As BaseItem
         Copy = New Printer()
      End Function
   End Class

   Class PrinterList
      Inherits BaseList

      Public Sub New()
         MyBase.New()
      End Sub

      Public Function Take(pIndex As Integer) As Printer
         Take = New Printer()
      End Function
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_ambient",
          fileUri: "file:///workspace/src/mod_ambient.bas",
          code: `Imports mod_list
Namespace Ambient
   Class TCampo
      Inherits BaseItem

      Public Sub New()
         MyBase.New()
      End Sub

      Public Overrides Function Copy() As BaseItem
         Copy = New TCampo()
      End Function
   End Class

   Class TCampoList
      Inherits BaseList

      Public Sub New()
         MyBase.New()
      End Sub

      Public Function Take(pIndex As Integer) As TCampo
         Take = New TCampo()
      End Function

      Public Sub Initialize()
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    assert.equal(result.modules.has("mod_printer"), false);
    assert.equal(result.modules.has("mod_ambient"), false);
    const list = result.modules.get("mod_list") ?? "";
    assert.match(list, /Class LiveList/);
    assert.match(list, /Function Copy\(\) As BaseList/);
  });

  test("does not keep HttpResponseData from unrelated Data.Open chains", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_nav
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim nav As TNavigator = New TNavigator()
         nav.Export()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_nav",
          fileUri: "file:///workspace/src/mod_nav.bas",
          code: `Imports mod_ds
Namespace mod_nav
   Class TNavigator
      Property Data As TDataSource
         Get
            Data = New TDataSource()
         End Get
      End Property

      Public Sub New()
      End Sub

      Public Sub Export()
         me.Data.Open()
         me.Data.Close()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_ds",
          fileUri: "file:///workspace/src/mod_ds.bas",
          code: `Namespace mod_ds
   Class TDataSource
      Public Sub New()
      End Sub

      Public Sub Open()
      End Sub

      Public Sub Close()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_http",
          fileUri: "file:///workspace/src/mod_http.bas",
          code: `Namespace mod_http
   Class HttpResponseData
      Public Sub New()
      End Sub

      Public Sub Open()
      End Sub

      Public Function ToString() As String
         ToString = ""
      End Function
   End Class

   Class HttpResponse
      Property Data As HttpResponseData
         Get
            Data = New HttpResponseData()
         End Get
      End Property

      Public Sub New()
      End Sub
   End Class

   Class HttpRequest
      Public Sub New()
      End Sub

      Public Function Run() As HttpResponse
         Run = New HttpResponse()
      End Function
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    assert.equal(result.modules.has("mod_http"), false);
    const ds = result.modules.get("mod_ds") ?? "";
    assert.match(ds, /Sub Open/);
    assert.match(ds, /Sub Close/);
  });

  test("does not keep ImageFormat from unrelated Format.Free chains", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_log
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim opts As LogOptions = New LogOptions()
         opts.Dispose()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_log",
          fileUri: "file:///workspace/src/mod_log.bas",
          code: `Namespace mod_log
   Class LogFormat
      Public Sub New()
      End Sub

      Public Sub Free()
      End Sub
   End Class

   Class LogOptions
      Format As LogFormat

      Public Sub New()
         me.Format = New LogFormat()
      End Sub

      Public Sub Dispose()
         me.Format.Free()
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_image",
          fileUri: "file:///workspace/src/mod_image.bas",
          code: `Namespace mod_image
   Class ImageFormat
      Public Sub New()
      End Sub

      Public Sub Free()
      End Sub
   End Class

   Class Image
      Property Format As ImageFormat
         Get
            Format = New ImageFormat()
         End Get
      End Property

      Public Sub New()
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    assert.equal(result.modules.has("mod_image"), false);
    const log = result.modules.get("mod_log") ?? "";
    assert.match(log, /Class LogFormat/);
    assert.match(log, /Sub Dispose/);
  });

  test("keeps inherited members on Using/Dim receivers across namespaces (_form.Show)", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Imports mod_card_form
Using _form As New TFormCard("title")
   _form.Show()
End Using`,
        },
        {
          moduleName: "mod_card_form",
          fileUri: "file:///workspace/src/mod_card_form.bas",
          code: `Imports mod_pipeline_form
Namespace mod_card_form
   Class TFormCard
      Inherits TPipelineForm

      Public Sub New(pTitle As String)
         MyBase.New(pTitle)
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_pipeline_form",
          fileUri: "file:///workspace/src/mod_pipeline_form.bas",
          code: `Imports mod_form
Namespace mod_pipeline_form
   Class TPipelineForm
      Inherits TFormBase

      Public Sub New(pTitle As String)
         MyBase.New(pTitle)
      End Sub
   End Class
End Namespace`,
        },
        {
          moduleName: "mod_form",
          fileUri: "file:///workspace/src/mod_form.bas",
          code: `Namespace mod_form
   Class TFormBase
      Public Sub New(pTitle As String)
      End Sub

      Public Function Show() As Boolean
         Show = True
      End Function

      Public Sub DeadHelper()
      End Sub
   End Class
End Namespace`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const form = result.modules.get("mod_form") ?? "";
    assert.match(form, /Function Show/);
    assert.doesNotMatch(form, /Sub DeadHelper/);
    assert.ok(result.modules.has("mod_card_form"));
    assert.ok(result.modules.has("mod_pipeline_form"));
  });
});
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
