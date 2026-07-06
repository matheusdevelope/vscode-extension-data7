import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import type { ProjectMetadata } from "../../../project/project-metadata";
import { resolveBuildOptimizationOptions } from "../../../project/optimizer";

function metadata(partial: Partial<ProjectMetadata> = {}): ProjectMetadata {
  return {
    nome: "Test",
    language: "d7basic",
    version: "1.0.0",
    targetPlatform: "Win32",
    opcoes: {
      autor: "",
      versao: "1.0.0.0",
      informacoes: "",
      codEmpresa: 1,
      codFilial: 1,
      nomeUsuario: "Administrador",
      preScript: "",
      identificacaoBancoDados: "",
      ...partial.opcoes,
    },
    virtualFolders: [],
    modulesMetadata: {},
    dependencies: {},
    build: partial.build,
  };
}

describe("resolveBuildOptimizationOptions", () => {
  test("defaults to debug-safe build with prune disabled", () => {
    const options = resolveBuildOptimizationOptions(metadata());

    assert.equal(options.sourceMap, true);
    assert.equal(options.minify.enabled, false);
    assert.equal(options.minify.stripComments, true);
    assert.equal(options.prune.enabled, false);
    assert.equal(options.prune.strategy, "principal-closure");
    assert.equal(options.uglify.enabled, false);
  });

  test("maps legacy opcoes minify and stripComments without enabling prune", () => {
    const options = resolveBuildOptimizationOptions(
      metadata({
        opcoes: {
          minify: true,
          stripComments: false,
        } as ProjectMetadata["opcoes"],
      }),
    );

    assert.equal(options.minify.enabled, true);
    assert.equal(options.minify.stripComments, false);
    assert.equal(options.prune.enabled, false);
    assert.equal(options.uglify.enabled, false);
  });

  test("reads build optimization prune block", () => {
    const options = resolveBuildOptimizationOptions(
      metadata({
        build: {
          optimization: {
            sourceMap: false,
            minify: {
              enabled: true,
              stripComments: true,
            },
            prune: {
              enabled: true,
              report: true,
              strategy: "principal-closure",
              alwaysInclude: ["mod_required"],
            },
            uglify: {
              enabled: true,
            },
          },
        },
      }),
    );

    assert.equal(options.sourceMap, false);
    assert.equal(options.minify.enabled, true);
    assert.equal(options.minify.stripComments, true);
    assert.equal(options.prune.enabled, true);
    assert.equal(options.prune.report, true);
    assert.deepEqual(options.prune.alwaysInclude, ["mod_required"]);
    assert.equal(options.uglify.enabled, true);
  });

  test("applies command overrides after project configuration", () => {
    const options = resolveBuildOptimizationOptions(
      metadata({
        build: {
          optimization: {
            prune: {
              enabled: false,
            },
          },
        },
      }),
      {
        prune: {
          enabled: true,
          report: true,
          alwaysInclude: ["mod_override"],
        },
      },
    );

    assert.equal(options.prune.enabled, true);
    assert.equal(options.prune.report, true);
    assert.deepEqual(options.prune.alwaysInclude, ["mod_override"]);
  });
});
