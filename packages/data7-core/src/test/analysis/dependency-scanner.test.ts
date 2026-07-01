import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { DependencyScanner } from "../../analysis/dependency-scanner";
import { withTempDir } from "../_helpers/temp-dir";

describe("DependencyScanner", () => {
  describe("stripComments", () => {
    test("removes a trailing inline comment but keeps preceding code", () => {
      assert.equal(
        DependencyScanner.stripComments("Dim a As String ' this is a comment"),
        "Dim a As String ",
      );
    });

    test("returns an empty string for a whole-line comment", () => {
      assert.equal(DependencyScanner.stripComments("' whole line comment"), "");
    });

    test('returns an empty string for "Rem" comments', () => {
      assert.equal(DependencyScanner.stripComments("Rem whole line rem comment"), "");
    });

    test("passes plain code through unchanged", () => {
      assert.equal(DependencyScanner.stripComments("a = b"), "a = b");
    });

    test("keeps apostrophes inside string literals", () => {
      const line = `query.CommandText = "SELECT * FROM T WHERE Name = '' AND Kind = 'A'" ' comment`;
      assert.equal(
        DependencyScanner.stripComments(line),
        `query.CommandText = "SELECT * FROM T WHERE Name = '' AND Kind = 'A'" `,
      );
    });

    test("keeps escaped double quotes inside string literals", () => {
      const line = `Dim command As String = "$l.Prefixes.Add(""http://+:8080/"")" ' comment`;
      assert.equal(
        DependencyScanner.stripComments(line),
        `Dim command As String = "$l.Prefixes.Add(""http://+:8080/"")" `,
      );
    });
  });

  describe("isIgnoredNamespace", () => {
    test("does not ignore qualified platform namespaces by prefix alone", () => {
      assert.equal(DependencyScanner.isIgnoredNamespace("system.xml"), false);
      assert.equal(DependencyScanner.isIgnoredNamespace("vcl.dialogs"), false);
    });

    test("ignores known native roots handled outside dependency validation", () => {
      assert.equal(DependencyScanner.isIgnoredNamespace("system"), true);
      assert.equal(DependencyScanner.isIgnoredNamespace("vcl"), true);
      assert.equal(DependencyScanner.isIgnoredNamespace("collections"), true);
    });

    test("ignores Net as a native System Library namespace", () => {
      assert.equal(DependencyScanner.isIgnoredNamespace("net"), true);
    });

    test("does NOT ignore arbitrary user namespaces", () => {
      assert.equal(DependencyScanner.isIgnoredNamespace("my_own_ns"), false);
    });
  });

  describe("collectModuleReferences", () => {
    test("collects Imports declarations with source location", () => {
      const references = DependencyScanner.collectModuleReferences(
        ["Imports Vcl.Dialogs", "Imports mod_pipeline", "", "Namespace app", "End Namespace"].join(
          "\n",
        ),
      );

      assert.deepEqual(
        references.map((reference) => ({
          name: reference.name,
          isExplicit: reference.isExplicit,
          line: reference.loc?.line,
          character: reference.loc?.character,
        })),
        [
          { name: "Vcl.Dialogs", isExplicit: false, line: 0, character: 8 },
          { name: "mod_pipeline", isExplicit: false, line: 1, character: 8 },
        ],
      );
    });
  });
});
