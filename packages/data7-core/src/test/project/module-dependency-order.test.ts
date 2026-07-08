import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  collectModuleNamespaceDependencies,
  topologicalSortModulesByNamespaceDependency,
} from "../../project/module-dependency-order";

describe("module-dependency-order", () => {
  describe("collectModuleNamespaceDependencies", () => {
    test("collects explicit Imports", () => {
      const deps = collectModuleNamespaceDependencies(
        ["Imports mod_tobject", "Namespace mod_tlist", "End Namespace"].join("\n"),
      );
      assert.ok(deps.some((dep) => dep.toLowerCase() === "mod_tobject"));
    });

    test("collects qualified type references without Imports", () => {
      const deps = collectModuleNamespaceDependencies(
        [
          "Namespace mod_tlist",
          "Delegate Function TFindDel_LogTransport(pValue As mod_logger.LogTransport) As Boolean",
          "End Namespace",
        ].join("\n"),
      );
      assert.ok(deps.some((dep) => dep.toLowerCase() === "mod_logger"));
    });

    test("collects qualified member access calls", () => {
      const deps = collectModuleNamespaceDependencies(
        [
          "Namespace mod_console",
          "Sub Main()",
          'mod_logger.Printe("x")',
          "End Sub",
          "End Namespace",
        ].join("\n"),
      );
      assert.ok(deps.some((dep) => dep.toLowerCase() === "mod_logger"));
    });
  });

  describe("topologicalSortModulesByNamespaceDependency", () => {
    test("orders dependencies before consumers using imports and qualified references", () => {
      const modules = [
        {
          name: "mod_modulo_a",
          code: [
            "Imports mod_modulo_c",
            "Namespace mod_modulo_a",
            "Class TA",
            "End Class",
            "End Namespace",
          ].join("\n"),
        },
        {
          name: "mod_modulo_b",
          code: [
            "Imports mod_modulo_c",
            "Imports mod_logger",
            "Namespace mod_modulo_b",
            "Class TB",
            "End Class",
            "End Namespace",
          ].join("\n"),
        },
        {
          name: "mod_modulo_c",
          code: [
            "Imports mod_x",
            "Imports mod_modulo_b",
            "Namespace mod_modulo_c",
            "Class TC",
            "End Class",
            "End Namespace",
          ].join("\n"),
        },
        {
          name: "mod_x",
          code: ["Namespace mod_x", "Class TX", "End Class", "End Namespace"].join("\n"),
        },
        {
          name: "mod_logger",
          code: [
            "Imports mod_tlist",
            "Namespace mod_logger",
            "Class LogTransport",
            "End Class",
            "End Namespace",
          ].join("\n"),
        },
        {
          name: "mod_tlist",
          code: [
            "Imports mod_tobject",
            "Namespace mod_tlist",
            "Delegate Function TFindDel_LogTransport(pValue As mod_logger.LogTransport) As Boolean",
            "End Namespace",
          ].join("\n"),
        },
        {
          name: "mod_tobject",
          code: ["Namespace mod_tobject", "Class TTObject", "End Class", "End Namespace"].join(
            "\n",
          ),
        },
      ];

      const sorted = topologicalSortModulesByNamespaceDependency(modules, () => undefined);
      const names = sorted.map((module) => module.name);

      assert.ok(names.indexOf("mod_tobject") < names.indexOf("mod_tlist"));
      assert.ok(names.indexOf("mod_logger") < names.indexOf("mod_tlist"));
      assert.ok(names.indexOf("mod_logger") < names.indexOf("mod_modulo_b"));
      assert.ok(names.indexOf("mod_x") < names.indexOf("mod_modulo_c"));
      assert.ok(names.indexOf("mod_modulo_b") < names.indexOf("mod_modulo_a"));
      assert.ok(names.indexOf("mod_modulo_c") < names.indexOf("mod_modulo_a"));
    });

    test("keeps unrelated modules in a stable relative order", () => {
      const modules = [
        {
          name: "mod_alpha",
          code: ["Namespace mod_alpha", "Class A", "End Class", "End Namespace"].join("\n"),
        },
        {
          name: "mod_beta",
          code: ["Namespace mod_beta", "Class B", "End Class", "End Namespace"].join("\n"),
        },
      ];

      const sorted = topologicalSortModulesByNamespaceDependency(modules, () => undefined);
      assert.deepEqual(
        sorted.map((module) => module.name),
        ["mod_alpha", "mod_beta"],
      );
    });
  });
});
