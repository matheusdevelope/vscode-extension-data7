import assert from "node:assert/strict";
import { describe, test, beforeEach } from "node:test";
import { ReachabilityParseCache } from "../../analysis/declaration-reachability/parse-cache";
import { analyzeDeclarationReachability } from "../../analysis/declaration-reachability";
import { DEFAULT_REACHABILITY_REMOVE_OPTIONS } from "../../analysis/declaration-reachability/types";
import type { ReachabilityModuleInput } from "../../analysis/declaration-reachability/types";

/**
 * `unused-code` is a whole-project analysis that runs on a typing debounce.
 * Re-parsing every module on every pass was the dominant CPU cost in the
 * extension host, so parses must be memoized per file content.
 */
describe("ReachabilityParseCache", () => {
  beforeEach(() => {
    ReachabilityParseCache.resetForTests();
  });

  const source = (body: string): string =>
    [
      "Namespace mod_cache",
      "   Class TThing",
      `      ${body}`,
      "   End Class",
      "End Namespace",
    ].join("\n");

  test("returns the same parse object for unchanged content", () => {
    const cache = ReachabilityParseCache.getInstance();
    const code = source("Public Sub Run()\n      End Sub");

    const first = cache.getOrParse("file:///proj/a.bas", code);
    const second = cache.getOrParse("file:///proj/a.bas", code);

    assert.equal(second, first, "unchanged content must not be re-parsed");
  });

  test("re-parses when the content changes", () => {
    const cache = ReachabilityParseCache.getInstance();
    const first = cache.getOrParse("file:///proj/a.bas", source("Public Sub Run()\n      End Sub"));
    const second = cache.getOrParse(
      "file:///proj/a.bas",
      source("Public Sub Walk()\n      End Sub"),
    );

    assert.notEqual(second, first);
  });

  test("keys entries per file", () => {
    const cache = ReachabilityParseCache.getInstance();
    const code = source("Public Sub Run()\n      End Sub");

    cache.getOrParse("file:///proj/a.bas", code);
    cache.getOrParse("file:///proj/b.bas", code);

    assert.equal(cache.size, 2);
  });

  test("retainOnly drops files no longer in the project", () => {
    const cache = ReachabilityParseCache.getInstance();
    const code = source("Public Sub Run()\n      End Sub");
    cache.getOrParse("file:///proj/a.bas", code);
    cache.getOrParse("file:///proj/b.bas", code);

    cache.retainOnly(["file:///proj/a.bas"]);

    assert.equal(cache.size, 1);
  });

  test("a second reachability pass over unchanged modules reuses every parse", () => {
    const modules: ReachabilityModuleInput[] = [
      {
        moduleName: "Principal",
        fileUri: "file:///proj/Principal.bas",
        code: ["Namespace mod_main", "   Sub Main()", "   End Sub", "End Namespace"].join("\n"),
      },
      {
        moduleName: "helper",
        fileUri: "file:///proj/helper.bas",
        code: source("Public Sub Run()\n      End Sub"),
      },
    ];
    const options = {
      alwaysInclude: [] as readonly string[],
      remove: DEFAULT_REACHABILITY_REMOVE_OPTIONS,
    };

    const first = analyzeDeclarationReachability(modules, options);
    const second = analyzeDeclarationReachability(modules, options);

    assert.equal(first.parsed.length, second.parsed.length);
    for (let i = 0; i < first.parsed.length; i++) {
      assert.equal(
        second.parsed[i]?.parse,
        first.parsed[i]?.parse,
        "the second pass must reuse the memoized parse",
      );
    }
  });
});
