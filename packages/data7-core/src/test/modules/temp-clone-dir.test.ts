import "../_setup/global-hooks";
import { describe, test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  cleanupTempCloneDir,
  createTempCloneDir,
  getLegacyTempCloneDir,
  removeDirectoryRobust,
  sweepStaleTempCloneDirs,
} from "../../modules/temp-clone-dir";

function throwingEpermRmSync(target: fs.PathLike): never {
  const error = new Error(`EPERM, Permission denied: ${String(target)}`) as NodeJS.ErrnoException;
  error.code = "EPERM";
  throw error;
}

describe("temp-clone-dir", () => {
  const created: string[] = [];

  beforeEach(() => {
    created.length = 0;
  });

  afterEach(async () => {
    for (const dir of created) {
      await cleanupTempCloneDir(dir);
    }
  });

  test("createTempCloneDir returns a unique directory under the OS temp folder", () => {
    const first = createTempCloneDir();
    const second = createTempCloneDir();
    created.push(first, second);

    assert.notEqual(first, second);
    assert.equal(path.dirname(first), path.join(os.tmpdir(), "data7-temp-clone"));
    assert.ok(path.basename(first).startsWith("clone-"));
    assert.ok(path.basename(second).startsWith("clone-"));
    assert.ok(fs.statSync(first).isDirectory());
    assert.ok(fs.statSync(second).isDirectory());
  });

  test("removeDirectoryRobust deletes a tree that contains a read-only file", async () => {
    const dir = createTempCloneDir();
    created.push(dir);
    const nested = path.join(dir, ".git", "objects");
    fs.mkdirSync(nested, { recursive: true });
    const packed = path.join(nested, "pack.idx");
    fs.writeFileSync(packed, "locked");
    fs.chmodSync(packed, 0o444);

    await removeDirectoryRobust(dir);
    assert.equal(fs.existsSync(dir), false);
  });

  test("cleanupTempCloneDir does not throw when rmSync keeps returning EPERM", async () => {
    const dir = createTempCloneDir();
    created.push(dir);
    fs.writeFileSync(path.join(dir, "keep.txt"), "x");

    await cleanupTempCloneDir(dir, throwingEpermRmSync);
    assert.ok(fs.existsSync(dir), "leftover directory may remain when Windows locks it");
  });

  test("sweepStaleTempCloneDirs ignores EPERM on the legacy temp_clone folder", async () => {
    const leftover = getLegacyTempCloneDir();
    fs.mkdirSync(leftover, { recursive: true });
    fs.writeFileSync(path.join(leftover, "stale.txt"), "stale");
    created.push(leftover);

    await sweepStaleTempCloneDirs(throwingEpermRmSync);
    assert.ok(fs.existsSync(leftover));
  });
});
