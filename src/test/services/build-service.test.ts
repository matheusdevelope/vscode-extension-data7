import "../_setup/global-hooks";
import { strict as assert } from "node:assert";
import type * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, test } from "node:test";
import * as vscode from "vscode";
import { BuildService } from "../../services/build-service";
import { DependencyService } from "../../services/dependency-service";
import { ProjectService } from "../../services/project-service";
import { Builder } from "../../project/builder";
import { WorkspaceFixService } from "../../services/workspace-fix-service";
import { WorkspaceTrustService } from "../../services/workspace-trust-service";
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

describe("BuildService pre-build auto-fix", () => {
  const workspaceDir = "C:\\workspace";
  const projectFilePath = "C:\\workspace\\project.7Proj";
  const originalGetActiveProject = ProjectService.getActiveProject;
  const originalEnsureTrusted = WorkspaceTrustService.ensureTrusted;
  const originalSyncDependencies = DependencyService.syncProjectData7Modules;
  const originalBuildProject = Builder.buildProject;
  const originalFixWorkspaceForBuild = WorkspaceFixService.fixWorkspaceForBuild;
  const originalGetConfiguration = vscode.workspace.getConfiguration;

  afterEach(() => {
    ProjectService.getActiveProject = originalGetActiveProject;
    WorkspaceTrustService.ensureTrusted = originalEnsureTrusted;
    DependencyService.syncProjectData7Modules = originalSyncDependencies;
    Builder.buildProject = originalBuildProject;
    WorkspaceFixService.fixWorkspaceForBuild = originalFixWorkspaceForBuild;
    vscode.workspace.getConfiguration = originalGetConfiguration;
  });

  function stubBuildDependencies(): void {
    ProjectService.getActiveProject = () => ({ workspaceDir, projectFilePath });
    WorkspaceTrustService.ensureTrusted = () => true;
    DependencyService.syncProjectData7Modules = () => [];
    Builder.buildProject = () => projectFilePath;
  }

  test("skips workspace auto-fix before build by default", async () => {
    stubBuildDependencies();
    let autoFixCalls = 0;
    WorkspaceFixService.fixWorkspaceForBuild = async () => {
      autoFixCalls++;
      return { filesScanned: 0, filesFixed: 0, totalEdits: 0 };
    };

    await BuildService.build();

    assert.equal(autoFixCalls, 0);
  });

  test("uses incremental auto-fix when explicitly enabled", async () => {
    stubBuildDependencies();
    let receivedOptions: { readonly mode?: "all" | "changed" } | undefined;
    WorkspaceFixService.fixWorkspaceForBuild = async (_workspaceDir, options) => {
      receivedOptions = options;
      return { filesScanned: 0, filesFixed: 0, totalEdits: 0 };
    };
    vscode.workspace.getConfiguration = (() => ({
      get: (key: string): unknown =>
        key === "features" ? { build: { autoFixBeforeBuild: true } } : undefined,
    })) as unknown as typeof vscode.workspace.getConfiguration;

    await BuildService.build();

    assert.deepEqual(receivedOptions, { mode: "changed" });
  });
});
