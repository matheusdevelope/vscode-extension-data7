import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { DocsGenerator } from "../../system-library/docs-generator";

describe("DocsGenerator", () => {
  describe("getNamespaceNames", () => {
    test("returns the core System Library namespaces alphabetically sorted", () => {
      const names = DocsGenerator.getNamespaceNames();
      assert.ok(names.length > 0);
      for (const required of ["Forms", "IO", "SQL", "Collections", "Drawing"]) {
        assert.ok(names.includes(required), `missing namespace "${required}"`);
      }
      const sorted = [...names].sort();
      assert.deepEqual(names, sorted, "output must be alphabetically sorted");
    });
  });

  describe("getNamespacesWithContent", () => {
    test("is a subset of getNamespaceNames and always contains Forms + SQL", () => {
      const withContent = DocsGenerator.getNamespacesWithContent();
      const all = DocsGenerator.getNamespaceNames();
      assert.ok(withContent.length <= all.length);
      assert.ok(withContent.includes("Forms"));
      assert.ok(withContent.includes("SQL"));
    });
  });

  describe("generateNamespaceMarkdown", () => {
    test("emits every expected section for Forms", () => {
      const md = DocsGenerator.generateNamespaceMarkdown("Forms");
      assert.ok(md.length > 1000, "Forms markdown must be substantial");
      assert.ok(md.startsWith("# Namespace `Forms`"));
      assert.ok(md.includes("## 1. Visão geral"));
      assert.ok(md.includes("## 2. Árvore de herança das classes"));
      assert.ok(md.includes("## 3. Classes (com membros próprios)"));
      assert.ok(md.includes("```basic\nImports Forms\n```"));
    });

    test("returns an empty string for an unknown namespace", () => {
      assert.equal(DocsGenerator.generateNamespaceMarkdown("NotARealNamespace"), "");
    });

    test("separates Events from Properties in class sections", () => {
      const md = DocsGenerator.generateNamespaceMarkdown("Forms");
      const tControlIdx = md.indexOf("### `TControl`");
      assert.ok(tControlIdx >= 0);
      const tControlSection = md.slice(tControlIdx, tControlIdx + 8000);
      assert.ok(tControlSection.includes("**Propriedades:**"));
      assert.ok(tControlSection.includes("**Eventos:**"));
      assert.ok(tControlSection.includes("| Nome | Delegate | Assinatura | Descrição |"));
    });

    test("renders cross-links for types declared in the same namespace", () => {
      const md = DocsGenerator.generateNamespaceMarkdown("Forms");
      assert.ok(md.includes("[`TWinControl`](#twincontrol)"));
    });

    test("omits orphan enum-classes from the inheritance tree", () => {
      const md = DocsGenerator.generateNamespaceMarkdown("Forms");
      const treeStart = md.indexOf("## 2. Árvore de herança");
      const treeEnd = md.indexOf("## 3.", treeStart);
      const tree = md.slice(treeStart, treeEnd);
      assert.ok(/TPersistent\s*\(externo\)/.test(tree) || /TPersistent\s*\(Globals\)/.test(tree));
      assert.ok(!tree.includes("└─ TAlign"));
      assert.ok(!tree.includes("TAlign\n"));
    });

    test("produces table rows that never contain embedded newlines", () => {
      const md = DocsGenerator.generateNamespaceMarkdown("Forms");
      const tableRows = md.split("\n").filter((line) => line.startsWith("| `"));
      for (const row of tableRows) {
        assert.equal(row.includes("\n"), false, `raw newline inside table row: ${row}`);
      }
    });
  });

  describe("computeSnapshotHash", () => {
    test("returns a 12-char lowercase hex string", () => {
      const hash = DocsGenerator.computeSnapshotHash();
      assert.match(hash, /^[a-f0-9]{12}$/);
    });

    test("is deterministic across calls (same SYSTEM_SYMBOLS → same hash)", () => {
      const md1 = DocsGenerator.generateNamespaceMarkdown("Forms");
      const md2 = DocsGenerator.generateNamespaceMarkdown("Forms");
      const re = /Snapshot `([a-f0-9]{12})`/;
      assert.equal(re.exec(md1)?.[1], re.exec(md2)?.[1]);
    });
  });

  describe("generateIndexMarkdown", () => {
    test("lists each requested namespace as a clickable link with a snapshot footer", () => {
      const idx = DocsGenerator.generateIndexMarkdown(["Forms", "IO"]);
      assert.ok(idx.includes("# System Library do Data7 — Documentação"));
      assert.ok(idx.includes("[`Forms`](./Forms.md)"));
      assert.ok(idx.includes("[`IO`](./IO.md)"));
      assert.ok(idx.includes("Snapshot `"));
    });
  });
});
