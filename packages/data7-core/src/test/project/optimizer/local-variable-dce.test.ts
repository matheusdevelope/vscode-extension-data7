import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  DEFAULT_PRUNE_REMOVE_OPTIONS,
  pruneBuildModules,
  type PruneOptimizationOptions,
} from "../../../project/optimizer";
import { pruneLocalVariablesInUnit } from "../../../project/optimizer/prune/local-variable-dce";
import type { CompilationUnit } from "../../../project/ast/ast";

const PRUNE_OPTIONS: PruneOptimizationOptions = {
  enabled: true,
  report: true,
  strategy: "principal-closure",
  alwaysInclude: [],
  remove: { ...DEFAULT_PRUNE_REMOVE_OPTIONS },
};

describe("prune.remove.localVariables", () => {
  test("drops unused Dim/Const locals with side-effect-free initializers", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Class TApp
    Public Sub Main()
      Dim dead As Integer = 1
      Const deadConst = 2
      Dim live As Integer = 3
      System.Console.WriteLine(live)
    End Sub
  End Class
End Namespace

Sub Main()
  Dim app As New App.TApp()
  app.Main()
End Sub
`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\bDim dead\b/i);
    assert.doesNotMatch(principal, /\bConst deadConst\b/i);
    assert.match(principal, /\bDim live\b/i);
    assert.ok(
      (result.report?.excludedDeclarations ?? []).some((item) => item === "local:dead"),
      "report should list dropped local:dead",
    );
  });

  test("keeps locals whose initializer may have side effects", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Class TApp
    Public Shared Function SideEffect() As Integer
      Return 1
    End Function

    Public Sub Main()
      Dim maybe As Integer = SideEffect()
      Dim unusedLiteral As Integer = 0
    End Sub
  End Class
End Namespace

Sub Main()
  Dim app As New App.TApp()
  app.Main()
End Sub
`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.match(principal, /\bDim maybe\b/i);
    assert.doesNotMatch(principal, /\bDim unusedLiteral\b/i);
  });

  test("keeps locals that are only assigned later", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Class TApp
    Public Sub Main()
      Dim x As Integer
      x = 10
    End Sub
  End Class
End Namespace

Sub Main()
  Dim app As New App.TApp()
  app.Main()
End Sub
`,
        },
      ],
      PRUNE_OPTIONS,
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.match(principal, /\bDim x\b/i);
  });

  test("skips method bodies that contain OpaqueStatement", () => {
    const unit: CompilationUnit = {
      kind: "CompilationUnit",
      members: [
        {
          kind: "MethodDeclaration",
          name: "Main",
          parameters: [],
          typeParameters: [],
          body: [
            {
              kind: "VariableDeclaration",
              name: "dead",
              isConst: false,
              initializer: { kind: "Literal", value: 1 },
            },
            { kind: "OpaqueStatement", text: "SomethingOpaque" },
          ],
        },
      ],
    };
    const result = pruneLocalVariablesInUnit(unit);
    assert.equal(result.removed.length, 0);
    const method = result.unit.members[0];
    assert.ok(method && method.kind === "MethodDeclaration");
    assert.equal(method.body.length, 2);
  });

  test("respects localVariables: false", () => {
    const result = pruneBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Class TApp
    Public Sub Main()
      Dim dead As Integer = 1
      System.Console.WriteLine(2)
    End Sub
  End Class
End Namespace

Sub Main()
  Dim app As New App.TApp()
  app.Main()
End Sub
`,
        },
      ],
      {
        ...PRUNE_OPTIONS,
        remove: { ...DEFAULT_PRUNE_REMOVE_OPTIONS, localVariables: false },
      },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.match(principal, /\bDim dead\b/i);
  });
});
