import "../_setup/global-hooks";
import { strict as assert } from "node:assert";
import type * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, test } from "node:test";
import * as vscode from "vscode";
import { BuildService } from "../../services/build-service";
import { ProjectService } from "../../services/project-service";
import { withTempDir } from "../_helpers/temp-dir";

describe("BuildService.runProjectFileDirectly", () => {
  const originalSpawn = BuildService._spawn;
  const originalEnsureExecutorPath = ProjectService.ensureExecutorPath;
  const originalGetConfiguration = vscode.workspace.getConfiguration;

  afterEach(() => {
    BuildService._spawn = originalSpawn;
    ProjectService.ensureExecutorPath = originalEnsureExecutorPath;
    vscode.workspace.getConfiguration = originalGetConfiguration;
  });

  test("starts the Executor with raw argument values and shell disabled", async () => {
    await withTempDir(async (tmp) => {
      const executorPath = path.join(tmp, "Executor.exe");
      const projectFilePath = path.join(tmp, "project;unsafe.7Proj");
      fs.writeFileSync(executorPath, "");
      fs.writeFileSync(projectFilePath, "");

      let received:
        | {
            executable: string;
            args: readonly string[];
            options: { shell?: boolean };
          }
        | undefined;
      BuildService._spawn = ((
        executable: string,
        args: readonly string[],
        options: { shell?: boolean },
      ) => {
        received = { executable, args, options };
        const stream = { on: (): void => undefined };
        return { stdout: stream, stderr: stream, once: (): void => undefined };
      }) as unknown as typeof childProcess.spawn;
      ProjectService.ensureExecutorPath = async () => executorPath;
      vscode.workspace.getConfiguration = (() => ({
        get: (key: string): unknown => {
          if (key === "databaseConnectionId") return "connection;unsafe";
          if (key === "companyCode" || key === "branchCode") return 1;
          if (key === "userName") return "Administrador";
          return undefined;
        },
        update: async (): Promise<void> => undefined,
      })) as unknown as typeof vscode.workspace.getConfiguration;

      await BuildService.runProjectFileDirectly(projectFilePath);

      assert.ok(received);
      assert.equal(received.executable, executorPath);
      assert.deepEqual(received.args, [
        "-c",
        "connection;unsafe",
        "-e",
        "1",
        "-f",
        "1",
        "-u",
        "Administrador",
        "-p",
        projectFilePath,
      ]);
      assert.equal(received.options.shell, false);
    });
  });
});
