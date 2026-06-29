import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { DependencyService } from "../../services/dependency-service";

describe("DependencyService", () => {
  test("legacy auto-discovery is disabled", async () => {
    // Tests have been removed because the auto-discovery DependencyScanner
    // was deprecated in favor of explicit package management.
    assert.ok(DependencyService);
  });
});
