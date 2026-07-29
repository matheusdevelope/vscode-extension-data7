import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  createDefaultProjectMetadata,
  createDefaultProjectBuildOptimization,
} from "../../project/default-project-metadata";
import { DEFAULT_BUILD_OPTIMIZATION_OPTIONS } from "../../project/optimizer/optimization-options";

describe("default-project-metadata", () => {
  test("createDefaultProjectBuildOptimization mirrors optimizer defaults", () => {
    const optimization = createDefaultProjectBuildOptimization();
    assert.deepEqual(optimization.minify, {
      enabled: DEFAULT_BUILD_OPTIMIZATION_OPTIONS.minify.enabled,
      stripComments: DEFAULT_BUILD_OPTIMIZATION_OPTIONS.minify.stripComments,
      collapseWhitespace: DEFAULT_BUILD_OPTIMIZATION_OPTIONS.minify.collapseWhitespace,
    });
    assert.equal(optimization.prune?.strategy, "principal-closure");
    assert.deepEqual(optimization.prune?.alwaysInclude, []);
    assert.deepEqual(optimization.prune?.remove, {
      ...DEFAULT_BUILD_OPTIMIZATION_OPTIONS.prune.remove,
    });
  });

  test("createDefaultProjectMetadata includes full build.optimization block", () => {
    const metadata = createDefaultProjectMetadata({
      nome: "mod_test",
      version: "1.0.0.0",
      opcoes: {
        autor: "Author",
        versao: "1.0.0.0",
        informacoes: "Test",
        codEmpresa: 1,
        codFilial: 1,
        nomeUsuario: "Author",
        preScript: "",
        identificacaoBancoDados: "",
      },
    });

    assert.equal(metadata.nome, "mod_test");
    assert.ok(metadata.build?.optimization);
    assert.equal(metadata.build.optimization.sourceMap, true);
    assert.equal(metadata.build.optimization.minify?.enabled, false);
    assert.equal(metadata.build.optimization.prune?.enabled, false);
    assert.equal(metadata.build.optimization.uglify?.enabled, false);
    assert.equal(metadata.virtualFolders.length, 1);
    assert.match(metadata.virtualFolders[0]?.nome ?? "", /^Unidades \(/);
  });
});
