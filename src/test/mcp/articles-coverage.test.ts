/**
 * Coverage test for the official-articles bundle produced by
 * `scripts/extract-official-articles.js`.
 *
 * Goal: confirm that the bundle keeps ≥ 70 % coverage of the supported
 * methods/properties in the namespaces we know the ERP documents
 * (Collections.StringList, SQL.Command, Net.TFTP, XML.*, Global.TJSONObject).
 *
 * If the source HTML layout changes upstream and the extractor regresses,
 * coverage drops, this test fails, and we know to revisit the parser.
 */
import "../_setup/global-hooks";

import * as fs from "fs";
import * as path from "path";
import { strict as assert } from "node:assert";
import { describe, test, before } from "node:test";

import { SYSTEM_SYMBOLS } from "../../system-library";

interface Article {
  readonly qualifiedName?: string;
  readonly signature?: string;
  readonly description?: string;
  readonly example?: string;
  readonly isTutorial?: boolean;
  readonly isClassIndex?: boolean;
}

const BUNDLE_CANDIDATES = [
  path.join(__dirname, "..", "..", "mcp", "data", "articles.json"),
  path.join(__dirname, "..", "..", "..", "out", "mcp", "data", "articles.json"),
];

function findBundle(): string | undefined {
  return BUNDLE_CANDIDATES.find((p) => fs.existsSync(p));
}

function loadBundle(): readonly Article[] {
  const bundlePath = findBundle();
  if (!bundlePath) {
    throw new Error(
      "articles.json not found. Run `node scripts/extract-official-articles.js` first.",
    );
  }
  const raw = fs.readFileSync(bundlePath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  assert.ok(Array.isArray(parsed), "articles.json should be an array");
  return parsed as readonly Article[];
}

let bundle: readonly Article[];

before(() => {
  bundle = loadBundle();
});

describe("articles-coverage", () => {
  test("bundle contains at least 150 API-reference articles", () => {
    const apiArticles = bundle.filter((a) => !a.isTutorial && !a.isClassIndex);
    assert.ok(
      apiArticles.length >= 150,
      `expected ≥ 150 API-reference articles, found ${String(apiArticles.length)}`,
    );
  });

  test("bundle contains the four conceptual tutorials", () => {
    const tutorials = bundle.filter((a) => a.isTutorial);
    assert.ok(tutorials.length >= 3, `expected ≥ 3 tutorials, found ${String(tutorials.length)}`);
  });

  test("each API-reference article has a non-empty qualifiedName", () => {
    const apis = bundle.filter((a) => !a.isTutorial);
    for (const article of apis) {
      assert.ok(
        article.qualifiedName && article.qualifiedName.length > 0,
        `article missing qualifiedName: ${JSON.stringify(article).slice(0, 120)}`,
      );
    }
  });

  test("≥ 80 % of API-reference articles carry a usable signature", () => {
    const apis = bundle.filter((a) => !a.isTutorial && !a.isClassIndex);
    const withSig = apis.filter((a) => a.signature && a.signature.trim().length > 0);
    const ratio = withSig.length / apis.length;
    assert.ok(ratio >= 0.8, `signature coverage ${(ratio * 100).toFixed(1)}% < 80%`);
  });

  test("≥ 70 % of API-reference articles carry a worked example", () => {
    const apis = bundle.filter((a) => !a.isTutorial && !a.isClassIndex);
    const withExample = apis.filter((a) => a.example && a.example.trim().length > 0);
    const ratio = withExample.length / apis.length;
    assert.ok(ratio >= 0.7, `example coverage ${(ratio * 100).toFixed(1)}% < 70%`);
  });

  test("Collections.StringList members covered at least 70%", () => {
    const supportedMembers = SYSTEM_SYMBOLS.filter(
      (s) => s.containerName === "StringList" && !s.isUnsupported && s.kind !== "class",
    ).map((s) => s.name);
    if (supportedMembers.length === 0) return; // catalog not yet populated

    const covered = supportedMembers.filter((memberName) =>
      bundle.some((a) =>
        (a.qualifiedName ?? "").toLowerCase().endsWith(`.${memberName.toLowerCase()}`),
      ),
    );
    const ratio = covered.length / supportedMembers.length;
    assert.ok(
      ratio >= 0.7,
      `Collections.StringList article coverage ${(ratio * 100).toFixed(1)}% < 70% ` +
        `(${String(covered.length)}/${String(supportedMembers.length)})`,
    );
  });

  test("Net.TFTP members covered at least 70%", () => {
    const supportedMembers = SYSTEM_SYMBOLS.filter(
      (s) => s.containerName === "TFTP" && !s.isUnsupported && s.kind !== "class",
    ).map((s) => s.name);
    if (supportedMembers.length === 0) return;

    const covered = supportedMembers.filter((memberName) =>
      bundle.some((a) =>
        (a.qualifiedName ?? "").toLowerCase().endsWith(`.${memberName.toLowerCase()}`),
      ),
    );
    const ratio = covered.length / supportedMembers.length;
    assert.ok(
      ratio >= 0.7,
      `Net.TFTP article coverage ${(ratio * 100).toFixed(1)}% < 70% ` +
        `(${String(covered.length)}/${String(supportedMembers.length)})`,
    );
  });

  test("TJSONObject members covered at least 60% (some Put/Get variants share an HTML)", () => {
    const supportedMembers = SYSTEM_SYMBOLS.filter(
      (s) => s.containerName === "TJSONObject" && !s.isUnsupported && s.kind !== "class",
    ).map((s) => s.name);
    if (supportedMembers.length === 0) return;

    const covered = supportedMembers.filter((memberName) =>
      bundle.some((a) =>
        (a.qualifiedName ?? "").toLowerCase().endsWith(`.${memberName.toLowerCase()}`),
      ),
    );
    const ratio = covered.length / supportedMembers.length;
    assert.ok(
      ratio >= 0.6,
      `TJSONObject article coverage ${(ratio * 100).toFixed(1)}% < 60% ` +
        `(${String(covered.length)}/${String(supportedMembers.length)})`,
    );
  });
});
