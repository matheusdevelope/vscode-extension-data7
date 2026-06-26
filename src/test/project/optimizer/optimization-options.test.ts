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
  test("defaults to debug-safe build with source maps available", () => {
    const options = resolveBuildOptimizationOptions(metadata());

    assert.equal(options.sourceMap, true);
    assert.equal(options.minify.enabled, false);
    assert.equal(options.minify.stripComments, true);
    assert.equal(options.minify.removeUnused, false);
    assert.equal(options.uglify.enabled, false);
  });

  test("maps legacy opcoes minify and stripComments without enabling removeUnused", () => {
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
    assert.equal(options.minify.removeUnused, false);
    assert.equal(options.uglify.enabled, false);
  });

  test("prefers build optimization block over legacy opcoes", () => {
    const options = resolveBuildOptimizationOptions(
      metadata({
        opcoes: {
          minify: false,
          stripComments: false,
        } as ProjectMetadata["opcoes"],
        build: {
          optimization: {
            sourceMap: false,
            minify: {
              enabled: true,
              stripComments: true,
              removeUnused: true,
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
    assert.equal(options.minify.removeUnused, true);
    assert.equal(options.uglify.enabled, true);
  });

  test("applies command overrides after project configuration", () => {
    const options = resolveBuildOptimizationOptions(
      metadata({
        build: {
          optimization: {
            minify: {
              enabled: false,
              stripComments: true,
              removeUnused: false,
            },
          },
        },
      }),
      {
        minify: {
          enabled: true,
          removeUnused: true,
        },
        uglify: {
          enabled: true,
        },
      },
    );

    assert.equal(options.minify.enabled, true);
    assert.equal(options.minify.stripComments, true);
    assert.equal(options.minify.removeUnused, true);
    assert.equal(options.uglify.enabled, true);
  });
});
