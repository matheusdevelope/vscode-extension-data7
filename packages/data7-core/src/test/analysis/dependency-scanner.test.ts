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
    test("ignores Delphi/VCL/Collections platform namespaces", () => {
      assert.equal(DependencyScanner.isIgnoredNamespace("system.xml"), true);
      assert.equal(DependencyScanner.isIgnoredNamespace("vcl.forms"), true);
      assert.equal(DependencyScanner.isIgnoredNamespace("collections"), true);
    });

    test("ignores Net as a native System Library namespace", () => {
      assert.equal(DependencyScanner.isIgnoredNamespace("net"), true);
    });

    test("does NOT ignore arbitrary user namespaces", () => {
      assert.equal(DependencyScanner.isIgnoredNamespace("my_own_ns"), false);
    });
  });
});
