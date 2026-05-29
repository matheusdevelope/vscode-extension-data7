/**
 * Tests for the screen-building ("criar telas") support added on top of
 * the MCP base: the 7 canonical Forms examples must lint AND transpile
 * clean, the buildable mini-project must be clean when indexed together,
 * `data7_list_controls` must surface the control inventory, the
 * `describe_symbol` form-usage hint (incl. events) must appear for Forms
 * controls (and not for non-Forms symbols), and chapter 14 must exist.
 */
import "../_setup/global-hooks";

import * as fs from "fs";
import * as path from "path";
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { DiagnosticsLinter } from "../../diagnostics/diagnostics";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { createMockDoc } from "../_helpers/mock-doc";
import { loadExample } from "../_helpers/fixtures";
import { buildFormUsageHint } from "../../mcp/tools/describe-symbol";
import { collectControls } from "../../mcp/tools/list-controls";
import { lookupSystemByName } from "../../system-library";
import { SugarTranspiler } from "../../project/transpiler";
import type { SymbolInfo } from "../../analysis/symbol-indexer";

const FORMS_EXAMPLES = [
  "forms/01-formulario-minimo.bas",
  "forms/02-layout-header-content-footer.bas",
  "forms/03-form-com-eventos.bas",
  "forms/04-grid-basico.bas",
  "forms/05-grid-com-dados.bas",
  "forms/06-textbox-validacao.bas",
  "forms/07-abas-pagecontrol.bas",
];

describe("Forms canonical examples — lint clean", () => {
  for (const rel of FORMS_EXAMPLES) {
    test(`${rel} produces no diagnostics`, () => {
      const code = loadExample(rel);
      const uri = `file:///docs/exemple/${rel}`;
      const doc = createMockDoc(uri, code);
      const indexer = WorkspaceSymbolIndexer.createDetached();
      indexer.updateFileContent(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
      assert.deepEqual(
        diags.map((d) => `${String(d.code)}@${String(d.range.start.line + 1)}`),
        [],
        `expected clean lint; got: ${JSON.stringify(diags.map((d) => d.code))}`,
      );
    });
  }
});

describe("Forms canonical examples — transpile clean (C1)", () => {
  // The forms examples use no sugar; the transpiler should pass them
  // through without emitting any SugarDiagnostic.
  for (const rel of FORMS_EXAMPLES) {
    test(`${rel} transpiles without diagnostics`, () => {
      const code = loadExample(rel);
      const result = SugarTranspiler.transpile(code, { detectEnumerable: () => undefined });
      assert.deepEqual(
        result.diagnostics.map((d) => d.code),
        [],
        `expected clean transpile; got: ${JSON.stringify(result.diagnostics)}`,
      );
    });
  }
});

describe("tela-cadastro mini-project — project-level lint (B3)", () => {
  test("Principal + module are clean when indexed together", () => {
    const principalCode = loadExample("builder/tela-cadastro/src/Principal.bas");
    const modCode = loadExample("builder/tela-cadastro/src/mod_form_cliente.bas");

    const indexer = WorkspaceSymbolIndexer.createDetached();
    const modUri = "file:///proj/src/mod_form_cliente.bas";
    const prinUri = "file:///proj/src/Principal.bas";
    indexer.updateFileContent(modUri, modCode);
    indexer.updateFileContent(prinUri, principalCode);

    for (const [uri, code] of [
      [modUri, modCode],
      [prinUri, principalCode],
    ] as const) {
      const doc = createMockDoc(uri, code);
      const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
      assert.deepEqual(
        diags.map((d) => `${String(d.code)}@${String(d.range.start.line + 1)}`),
        [],
        `expected clean project lint for ${uri}; got: ${JSON.stringify(diags.map((d) => d.code))}`,
      );
    }
  });
});

describe("data7_list_controls — Forms control inventory (B1)", () => {
  const all = collectControls();
  const instantiable = all.filter((c) => !c.isBase).map((c) => c.name);

  test("instantiable inventory includes the common controls", () => {
    for (const expected of [
      "Form",
      "Panel",
      "Grid",
      "TextBox",
      "CommandButton",
      "PageControl",
      "TabSheet",
    ]) {
      assert.ok(instantiable.includes(expected), `expected control ${expected} in the inventory`);
    }
  });

  test("instantiable inventory excludes abstract VCL trunk classes", () => {
    for (const base of ["TControl", "TWinControl", "TComponent", "TGraphicControl"]) {
      assert.ok(
        !instantiable.includes(base),
        `${base} should be classified as a base, not a control`,
      );
    }
  });

  test("the trunk classes are still present but flagged isBase", () => {
    const tcontrol = all.find((c) => c.name === "TControl");
    assert.ok(tcontrol, "TControl should be in the full Forms class list");
    assert.equal(tcontrol.isBase, true);
  });
});

describe("describe_symbol — form usage hint", () => {
  function classSymbol(name: string): SymbolInfo {
    const sym = lookupSystemByName(name).find((s) => s.kind === "class");
    assert.ok(sym, `expected a class symbol for ${name}`);
    return sym;
  }

  test("a generic Forms control gets a parent + Align instantiation hint", () => {
    const hint = buildFormUsageHint(classSymbol("Panel"));
    assert.ok(hint, "Panel should carry a form usage hint");
    assert.match(hint, /New Forms\.Panel\(parent\)/);
    assert.match(hint, /Align = alClient/);
  });

  test("the root Form gets a Show/Free lifecycle hint (no parent)", () => {
    const hint = buildFormUsageHint(classSymbol("Form"));
    assert.ok(hint, "Form should carry a form usage hint");
    assert.match(hint, /New Forms\.Form\(\)/);
    assert.match(hint, /_form\.Show\(\)/);
    assert.match(hint, /_form\.Free\(\)/);
  });

  test("a control with events lists them in the hint (B2)", () => {
    // TextBox inherits OnChange (TcxCustomEdit) and OnClick (TControl).
    const hint = buildFormUsageHint(classSymbol("TextBox"));
    assert.ok(hint, "TextBox should carry a form usage hint");
    assert.match(hint, /eventos dispon[ií]veis/i);
    assert.match(hint, /On[A-Z]/);
  });

  test("a non-Forms class gets NO form usage hint", () => {
    const hint = buildFormUsageHint(classSymbol("StringList"));
    assert.equal(hint, undefined);
  });
});

describe("chapter 14 — construindo-telas is discoverable", () => {
  test("the markdown chapter exists with the expected slug", () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const chapter = path.join(repoRoot, "docs", "linguagem-basic", "14-construindo-telas.md");
    assert.ok(fs.existsSync(chapter), "14-construindo-telas.md should exist");
    const content = fs.readFileSync(chapter, "utf-8");
    assert.match(content, /Construindo telas/i);
    assert.match(content, /alClient/);
    assert.match(content, /TNotifyEvent/);
  });
});
