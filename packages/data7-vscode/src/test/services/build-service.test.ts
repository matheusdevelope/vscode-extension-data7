import "../_setup/global-hooks";
import { strict as assert } from "node:assert";
import type * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, test } from "node:test";
import * as vscode from "vscode";
import type { EnsureProjectBuiltResult } from "@data7/core";

import { BuildService } from "../../services/build-service";
import { DependencyService } from "../../services/dependency-service";
import { DiagnosticService } from "../../services/diagnostic-service";
import { ProjectService } from "../../services/project-service";

import { WorkspaceFixService } from "../../services/workspace-fix-service";
import { WorkspaceTrustService } from "../../services/workspace-trust-service";
import { withTempDir } from "../_helpers/temp-dir";

describe("BuildService.runProjectFileDirectly", () => {
  const originalSpawn = BuildService._spawn;
  const originalEnsureExecutorPath = ProjectService.ensureExecutorPath;
  const originalGetConfiguration = vscode.workspace.getConfiguration;
  const originalCreateOutputChannel = vscode.window.createOutputChannel;

  afterEach(() => {
    BuildService._resetExecutorLogState();
    BuildService._spawn = originalSpawn;
    ProjectService.ensureExecutorPath = originalEnsureExecutorPath;
    vscode.workspace.getConfiguration = originalGetConfiguration;
    vscode.window.createOutputChannel = originalCreateOutputChannel;
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

  test("writes executor output to the dedicated Data7 Logs channel", async () => {
    await withTempDir(async (tmp) => {
      const executorPath = path.join(tmp, "Executor.exe");
      const projectFilePath = path.join(tmp, "Project.7Proj");
      fs.writeFileSync(executorPath, "");
      fs.writeFileSync(projectFilePath, "");

      const createdChannels: string[] = [];
      const appended: string[] = [];
      const appendedLines: string[] = [];
      let clearCalls = 0;
      let disposeCalls = 0;
      vscode.window.createOutputChannel = ((name: string) => {
        createdChannels.push(name);
        return {
          append: (value: string): void => {
            appended.push(value);
          },
          appendLine: (value: string): void => {
            appendedLines.push(value);
          },
          clear: (): void => {
            clearCalls++;
          },
          show: (): void => undefined,
          dispose: (): void => {
            disposeCalls++;
          },
        };
      }) as unknown as typeof vscode.window.createOutputChannel;

      let stdoutData: ((chunk: Buffer) => void) | undefined;
      let stderrData: ((chunk: Buffer) => void) | undefined;
      BuildService._spawn = (() => {
        return {
          stdout: {
            on: (_event: string, listener: (chunk: Buffer) => void): void => {
              stdoutData = listener;
            },
          },
          stderr: {
            on: (_event: string, listener: (chunk: Buffer) => void): void => {
              stderrData = listener;
            },
          },
          once: (): void => undefined,
        };
      }) as unknown as typeof childProcess.spawn;
      ProjectService.ensureExecutorPath = async () => executorPath;
      vscode.workspace.getConfiguration = (() => ({
        get: (key: string): unknown => {
          if (key === "databaseConnectionId") return "project-db";
          if (key === "companyCode" || key === "branchCode") return 1;
          if (key === "userName") return "Administrador";
          return undefined;
        },
        update: async (): Promise<void> => undefined,
      })) as unknown as typeof vscode.workspace.getConfiguration;

      await BuildService.runProjectFileDirectly(projectFilePath);
      stdoutData?.(Buffer.from("linha stdout\n"));
      stderrData?.(Buffer.from("linha stderr\n"));

      assert.deepEqual(createdChannels, ["Data7 Logs"]);
      assert.equal(clearCalls, 0);
      assert.equal(disposeCalls, 0);
      assert.ok(appendedLines.some((line) => line.includes("Executor iniciado")));
      assert.deepEqual(appended, ["linha stdout\n", "linha stderr\n"]);
    });
  });

  test("uses explicit project execution options before extension settings", async () => {
    await withTempDir(async (tmp) => {
      const executorPath = path.join(tmp, "Executor.exe");
      const projectFilePath = path.join(tmp, "Project.7Proj");
      fs.writeFileSync(executorPath, "");
      fs.writeFileSync(projectFilePath, "");

      let receivedArgs: readonly string[] | undefined;
      BuildService._spawn = ((_executable: string, args: readonly string[]) => {
        receivedArgs = args;
        const stream = { on: (): void => undefined };
        return { stdout: stream, stderr: stream, once: (): void => undefined };
      }) as unknown as typeof childProcess.spawn;
      ProjectService.ensureExecutorPath = async () => executorPath;
      vscode.workspace.getConfiguration = (() => ({
        get: (key: string): unknown => {
          if (key === "databaseConnectionId") return "settings-db";
          if (key === "companyCode" || key === "branchCode") return 1;
          if (key === "userName") return "Administrador";
          return undefined;
        },
        update: async (): Promise<void> => undefined,
      })) as unknown as typeof vscode.workspace.getConfiguration;

      await BuildService.runProjectFileDirectly(projectFilePath, {
        connectionId: "project-db",
        companyCode: 7,
        branchCode: 3,
        userName: "Projeto",
      });

      assert.deepEqual(receivedArgs, [
        "-c",
        "project-db",
        "-e",
        "7",
        "-f",
        "3",
        "-u",
        "Projeto",
        "-p",
        projectFilePath,
      ]);
    });
  });
});

describe("BuildService pre-build auto-fix", () => {
  const workspaceDir = "C:\\workspace";
  const projectFilePath = "C:\\workspace\\project.7Proj";
  const originalGetActiveProject = ProjectService.getActiveProject;
  const originalEnsureTrusted = WorkspaceTrustService.ensureTrusted;
  const originalSyncDependencies = DependencyService.syncProjectData7Modules;
  const originalEnsureProjectBuilt = BuildService._ensureProjectBuilt;
  const originalFixWorkspaceForBuild = WorkspaceFixService.fixWorkspaceForBuild;
  const originalGetConfiguration = vscode.workspace.getConfiguration;

  afterEach(() => {
    ProjectService.getActiveProject = originalGetActiveProject;
    WorkspaceTrustService.ensureTrusted = originalEnsureTrusted;
    DependencyService.syncProjectData7Modules = originalSyncDependencies;
    BuildService._ensureProjectBuilt = originalEnsureProjectBuilt;
    WorkspaceFixService.fixWorkspaceForBuild = originalFixWorkspaceForBuild;
    vscode.workspace.getConfiguration = originalGetConfiguration;
  });

  function stubBuildDependencies(): void {
    ProjectService.getActiveProject = () => ({ workspaceDir, projectFilePath });
    WorkspaceTrustService.ensureTrusted = () => true;
    DependencyService.syncProjectData7Modules = () => [];
    BuildService._ensureProjectBuilt = (): EnsureProjectBuiltResult => ({
      outputFilePath: projectFilePath,
      skipped: false,
      snapshotHash: "test",
    });
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

describe("BuildService.run build output", () => {
  const originalGetActiveProject = ProjectService.getActiveProject;
  const originalEnsureExecutorPath = ProjectService.ensureExecutorPath;
  const originalEnsureTrusted = WorkspaceTrustService.ensureTrusted;
  const originalSyncDependencies = DependencyService.syncProjectData7Modules;
  const originalEnsureProjectBuilt = BuildService._ensureProjectBuilt;
  const originalRunProjectFileDirectly = BuildService.runProjectFileDirectly;
  const originalLintWorkspaceForRun = DiagnosticService.lintWorkspaceForRun;
  const originalGetConfiguration = vscode.workspace.getConfiguration;
  const originalCreateOutputChannel = vscode.window.createOutputChannel;
  const originalShowErrorMessage = vscode.window.showErrorMessage;

  afterEach(() => {
    BuildService._resetExecutorLogState();
    ProjectService.getActiveProject = originalGetActiveProject;
    ProjectService.ensureExecutorPath = originalEnsureExecutorPath;
    WorkspaceTrustService.ensureTrusted = originalEnsureTrusted;
    DependencyService.syncProjectData7Modules = originalSyncDependencies;
    BuildService._ensureProjectBuilt = originalEnsureProjectBuilt;
    BuildService.runProjectFileDirectly = originalRunProjectFileDirectly;
    DiagnosticService.lintWorkspaceForRun = originalLintWorkspaceForRun;
    vscode.workspace.getConfiguration = originalGetConfiguration;
    vscode.window.createOutputChannel = originalCreateOutputChannel;
    vscode.window.showErrorMessage = originalShowErrorMessage;
  });

  test("builds and executes a dedicated run .7Proj without replacing the standard project", async () => {
    await withTempDir(async (tmp) => {
      const projectFilePath = path.join(tmp, "Project.7Proj");
      fs.writeFileSync(
        path.join(tmp, "data7.json"),
        JSON.stringify({
          opcoes: {
            identificacaoBancoDados: "project-db",
            codEmpresa: 7,
            codFilial: 3,
            nomeUsuario: "Projeto",
          },
          dependencies: {},
        }),
        "utf-8",
      );
      ProjectService.getActiveProject = () => ({ workspaceDir: tmp, projectFilePath });
      ProjectService.ensureExecutorPath = async () => path.join(tmp, "Executor.exe");
      WorkspaceTrustService.ensureTrusted = () => true;
      DependencyService.syncProjectData7Modules = () => [];
      vscode.workspace.getConfiguration = (() => ({
        get: (key: string): unknown => {
          if (key === "databaseConnectionId") return "config-db";
          if (key === "companyCode" || key === "branchCode") return 1;
          if (key === "userName") return "Administrador";
          return undefined;
        },
        update: async (): Promise<void> => undefined,
      })) as unknown as typeof vscode.workspace.getConfiguration;

      let builtOutput = "";
      let executedOutput = "";
      BuildService._ensureProjectBuilt = (
        _workspaceDir,
        output,
        options,
      ): EnsureProjectBuiltResult => {
        builtOutput = output;
        assert.ok(options?.vscodeLoggerFilePath);
        return { outputFilePath: output, skipped: false, snapshotHash: "run" };
      };
      BuildService.runProjectFileDirectly = async (output, options) => {
        executedOutput = output;
        assert.deepEqual(options, {
          connectionId: "project-db",
          companyCode: 7,
          branchCode: 3,
          userName: "Projeto",
        });
      };

      await BuildService.run();
      fs.unwatchFile(path.join(tmp, ".data7", "logs", "vscode-executor.log"));

      const expected = path.join(tmp, ".data7", "run", "Project.run.7Proj");
      assert.equal(builtOutput, expected);
      assert.equal(executedOutput, expected);
      assert.notEqual(builtOutput, projectFilePath);
    });
  });

  test("keeps the Data7 Logs channel between runs without clearing it", async () => {
    await withTempDir(async (tmp) => {
      const projectFilePath = path.join(tmp, "Project.7Proj");
      fs.writeFileSync(
        path.join(tmp, "data7.json"),
        JSON.stringify({
          opcoes: {
            identificacaoBancoDados: "project-db",
            codEmpresa: 1,
            codFilial: 1,
            nomeUsuario: "Administrador",
          },
          dependencies: {},
        }),
        "utf-8",
      );

      ProjectService.getActiveProject = () => ({ workspaceDir: tmp, projectFilePath });
      ProjectService.ensureExecutorPath = async () => path.join(tmp, "Executor.exe");
      WorkspaceTrustService.ensureTrusted = () => true;
      DependencyService.syncProjectData7Modules = () => [];
      BuildService._ensureProjectBuilt = (_workspaceDir, output): EnsureProjectBuiltResult => ({
        outputFilePath: output,
        skipped: false,
        snapshotHash: "run",
      });
      BuildService.runProjectFileDirectly = async () => undefined;
      vscode.workspace.getConfiguration = (() => ({
        get: (key: string): unknown => {
          if (key === "databaseConnectionId") return "";
          if (key === "companyCode" || key === "branchCode") return 1;
          if (key === "userName") return "Administrador";
          return undefined;
        },
        update: async (): Promise<void> => undefined,
      })) as unknown as typeof vscode.workspace.getConfiguration;

      const createdChannels: string[] = [];
      let clearCalls = 0;
      let disposeCalls = 0;
      vscode.window.createOutputChannel = ((name: string) => {
        createdChannels.push(name);
        return {
          append: (): void => undefined,
          appendLine: (): void => undefined,
          clear: (): void => {
            clearCalls++;
          },
          show: (): void => undefined,
          dispose: (): void => {
            disposeCalls++;
          },
        };
      }) as unknown as typeof vscode.window.createOutputChannel;

      await BuildService.run();
      await BuildService.run();
      fs.unwatchFile(path.join(tmp, ".data7", "logs", "vscode-executor.log"));

      assert.deepEqual(createdChannels, ["Data7 Logs"]);
      assert.equal(clearCalls, 0);
      assert.equal(disposeCalls, 0);
    });
  });

  test("does not execute the project when the linter reports errors", async () => {
    await withTempDir(async (tmp) => {
      const projectFilePath = path.join(tmp, "Project.7Proj");
      fs.writeFileSync(
        path.join(tmp, "data7.json"),
        JSON.stringify({
          opcoes: {
            identificacaoBancoDados: "project-db",
            codEmpresa: 1,
            codFilial: 1,
            nomeUsuario: "Administrador",
          },
          dependencies: {},
        }),
        "utf-8",
      );

      ProjectService.getActiveProject = () => ({ workspaceDir: tmp, projectFilePath });
      ProjectService.ensureExecutorPath = async () => path.join(tmp, "Executor.exe");
      WorkspaceTrustService.ensureTrusted = () => true;
      DependencyService.syncProjectData7Modules = () => [];
      DiagnosticService.lintWorkspaceForRun = async () => ({
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
        fileCount: 1,
      });
      vscode.workspace.getConfiguration = (() => ({
        get: (key: string): unknown => {
          if (key === "databaseConnectionId") return "";
          if (key === "companyCode" || key === "branchCode") return 1;
          if (key === "userName") return "Administrador";
          return undefined;
        },
        update: async (): Promise<void> => undefined,
      })) as unknown as typeof vscode.workspace.getConfiguration;

      let built = false;
      let executed = false;
      let errorMessage = "";
      BuildService._ensureProjectBuilt = (): EnsureProjectBuiltResult => {
        built = true;
        return { outputFilePath: projectFilePath, skipped: false, snapshotHash: "run" };
      };
      BuildService.runProjectFileDirectly = async () => {
        executed = true;
      };
      vscode.window.showErrorMessage = (async (message: string) => {
        errorMessage = message;
        return undefined;
      }) as unknown as typeof vscode.window.showErrorMessage;

      await BuildService.run();

      assert.equal(built, false);
      assert.equal(executed, false);
      assert.match(errorMessage, /Execução cancelada.*1 erro/);
    });
  });
});
