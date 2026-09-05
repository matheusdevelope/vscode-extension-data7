import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { logger } from "../infra/logger";

/**
 * Legacy clone folder used by earlier publisher versions (`~/.data7/temp_clone`).
 * Windows often keeps Git packfiles / Defender handles open after `execSync`
 * returns, so `fs.rmSync` on that reused path throws `EPERM` on the next publish.
 */
export const TEMP_CLONE_DIR_NAME = "temp_clone";

const MAX_REMOVE_ATTEMPTS = 5;
const REMOVE_RETRY_DELAY_MS = 50;

export type RmSyncFn = (target: fs.PathLike, options?: fs.RmOptions) => void;

export function getData7HomeDir(): string {
  return path.join(os.homedir(), ".data7");
}

export function getLegacyTempCloneDir(): string {
  return path.join(getData7HomeDir(), TEMP_CLONE_DIR_NAME);
}

export function createTempCloneDir(): string {
  const parent = path.join(os.tmpdir(), "data7-temp-clone");
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, "clone-"));
}

/**
 * Best-effort removal that never throws. A locked leftover must not fail the
 * publish/unpublish that already finished its Git work.
 */
export async function cleanupTempCloneDir(
  dirPath: string,
  rmSyncFn: RmSyncFn = fs.rmSync,
): Promise<void> {
  try {
    await removeDirectoryRobust(dirPath, rmSyncFn);
  } catch (error) {
    logger.warn(
      `Não foi possível remover o clone temporário em ${dirPath}: ${formatUnknownError(error)}. A próxima publicação usará outra pasta.`,
    );
  }
}

/**
 * Removes the legacy `~/.data7/temp_clone` folder. Failures are logged and
 * ignored so a locked Windows leftover cannot block a new unique clone.
 */
export async function sweepStaleTempCloneDirs(rmSyncFn: RmSyncFn = fs.rmSync): Promise<void> {
  await cleanupTempCloneDir(getLegacyTempCloneDir(), rmSyncFn);
}

export async function removeDirectoryRobust(
  dirPath: string,
  rmSyncFn: RmSyncFn = fs.rmSync,
): Promise<void> {
  if (!fs.existsSync(dirPath)) return;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_REMOVE_ATTEMPTS; attempt++) {
    makeTreeWritable(dirPath);
    try {
      rmSyncFn(dirPath, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: REMOVE_RETRY_DELAY_MS,
      });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableFsError(error) || attempt === MAX_REMOVE_ATTEMPTS) {
        throw error;
      }
      await sleep(REMOVE_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

function makeTreeWritable(target: string): void {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      fs.chmodSync(target, 0o777);
      for (const entry of fs.readdirSync(target)) {
        makeTreeWritable(path.join(target, entry));
      }
      return;
    }
    fs.chmodSync(target, 0o666);
  } catch {
    // Best-effort: a single locked file must not abort chmod of the rest.
  }
}

function isRetryableFsError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: string }).code;
  return code === "EPERM" || code === "EACCES" || code === "EBUSY" || code === "ENOTEMPTY";
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
