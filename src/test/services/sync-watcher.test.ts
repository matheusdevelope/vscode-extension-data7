import "../_setup/global-hooks";
import { describe, test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SyncWatcher } from "../../services/sync-watcher";
import { Decompiler } from "../../project/decompiler";
import { Builder } from "../../project/builder";
import { DependencyService } from "../../services/dependency-service";
import { RepositoryService } from "../../services/repository-service";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { ProjectService } from "../../services/project-service";
import { withTempDir } from "../_helpers/temp-dir";

describe("SyncWatcher", () => {
  let originalDecompile: any;
  let originalBuild: any;
  let originalDetect: any;
  let originalIndex: any;
  let originalFindPaths: any;
  let originalGetConfiguration: any;

  let decompileCalls: any[] = [];
  let buildCalls: any[] = [];
  let detectCalls: any[] = [];
  let indexCalls: any[] = [];
  let mockSyncModeSetting = "estrutura <> projeto.7proj";

  beforeEach(() => {
    // Reset private fields
    SyncWatcher.isAutoSyncEnabled = true;
    (SyncWatcher as any)._isBuilding = false;
    (SyncWatcher as any)._selfBuiltProjMtimes.clear();
    (SyncWatcher as any)._ignoreBasChangesUntil = 0;
    (SyncWatcher as any)._ignoreProjChangesUntil = 0;

    // Spy / mock setup
    originalDecompile = Decompiler.decompileProject;
    originalBuild = Builder.buildProject;
    originalDetect = DependencyService.detectAndSyncProjectDependencies;
    originalIndex = WorkspaceSymbolIndexer.getInstance().indexWorkspace;
    originalFindPaths = ProjectService.findProjectPaths;
    originalGetConfiguration = vscode.workspace.getConfiguration;

    decompileCalls = [];
    buildCalls = [];
    detectCalls = [];
    indexCalls = [];
    mockSyncModeSetting = "estrutura <> projeto.7proj";

    Decompiler.decompileProject = (...args: any[]) => {
      decompileCalls.push(args);
      return {} as any;
    };

    Builder.buildProject = (...args: any[]) => {
      buildCalls.push(args);
      // Simulate writing a project file so it exists
      const projPath = args[1];
      fs.writeFileSync(projPath, "<xml></xml>", "utf-8");
      return projPath;
    };

    DependencyService.detectAndSyncProjectDependencies = async (...args: any[]): Promise<any> => {
      detectCalls.push(args);
      return { synced: [], missing: [] };
    };

    WorkspaceSymbolIndexer.getInstance().indexWorkspace = async (...args: any[]) => {
      indexCalls.push(args);
    };

    vscode.workspace.getConfiguration = ((section?: string) => {
      if (section === "data7") {
        return {
          get: (key: string) => {
            if (key === "sincronizacao") return { modo: mockSyncModeSetting };
            if (key === "enableAutoSync") return true;
            return undefined;
          },
        };
      }
      return originalGetConfiguration(section);
    }) as any;
  });

  afterEach(() => {
    SyncWatcher.isAutoSyncEnabled = false;
    Decompiler.decompileProject = originalDecompile;
    Builder.buildProject = originalBuild;
    DependencyService.detectAndSyncProjectDependencies = originalDetect;
    WorkspaceSymbolIndexer.getInstance().indexWorkspace = originalIndex;
    ProjectService.findProjectPaths = originalFindPaths;
    vscode.workspace.getConfiguration = originalGetConfiguration;
  });

  test("ignores file watcher trigger when project file matches our own build timestamp", async () => {
    await withTempDir(async (tmp) => {
      const projPath = path.join(tmp, "Test.7Proj");
      fs.writeFileSync(projPath, "<xml></xml>", "utf-8");
      const mtime = fs.statSync(projPath).mtimeMs;

      // Register the mtime in the self-built map
      (SyncWatcher as any)._selfBuiltProjMtimes.set(projPath.toLowerCase(), mtime);

      // Extract the watcher function by stubbing createFileSystemWatcher
      let registeredHandler: any;
      const originalCreateWatcher = vscode.workspace.createFileSystemWatcher;
      vscode.workspace.createFileSystemWatcher = (() => {
        return {
          onDidChange: (cb: any) => {
            registeredHandler = cb;
            return { dispose: () => {} };
          },
          onDidCreate: (_cb: any) => {
            return { dispose: () => {} };
          },
          onDidDelete: () => {
            return { dispose: () => {} };
          },
          dispose: () => {},
        };
      }) as any;

      try {
        SyncWatcher.watchExternalProjectFile(projPath, tmp);

        assert.ok(registeredHandler, "Expected a change handler to be registered");

        registeredHandler();

        // Wait a brief moment to allow the debounced async call to finish
        await new Promise((resolve) => setTimeout(resolve, 500));

        assert.equal(decompileCalls.length, 0, "Should NOT run decompile if timestamp matches");
        // The key is kept so subsequent OS events also match
        assert.equal((SyncWatcher as any)._selfBuiltProjMtimes.get(projPath.toLowerCase()), mtime);
      } finally {
        vscode.workspace.createFileSystemWatcher = originalCreateWatcher;
      }
    });
  });

  test("triggers decompile when project file has a different timestamp", async () => {
    await withTempDir(async (tmp) => {
      const projPath = path.join(tmp, "Test.7Proj");
      fs.writeFileSync(projPath, "<xml></xml>", "utf-8");
      const mtime = fs.statSync(projPath).mtimeMs;

      // Register a different mtime
      (SyncWatcher as any)._selfBuiltProjMtimes.set(projPath.toLowerCase(), mtime - 5000);

      let registeredHandler: any;
      const originalCreateWatcher = vscode.workspace.createFileSystemWatcher;
      vscode.workspace.createFileSystemWatcher = (() => {
        return {
          onDidChange: (cb: any) => {
            registeredHandler = cb;
            return { dispose: () => {} };
          },
          onDidCreate: (_cb: any) => {
            return { dispose: () => {} };
          },
          onDidDelete: () => {
            return { dispose: () => {} };
          },
          dispose: () => {},
        };
      }) as any;

      try {
        SyncWatcher.watchExternalProjectFile(projPath, tmp);
        registeredHandler();

        await new Promise((resolve) => setTimeout(resolve, 500));

        assert.equal(decompileCalls.length, 1, "Should run decompile since timestamp is different");
        assert.ok(
          (SyncWatcher as any)._ignoreBasChangesUntil > Date.now(),
          "Should ignore .bas changes",
        );
      } finally {
        vscode.workspace.createFileSystemWatcher = originalCreateWatcher;
      }
    });
  });

  test("ignores .bas changes while _ignoreBasChangesUntil is active", async () => {
    await withTempDir(async (tmp) => {
      const basPath = path.join(tmp, "src", "module.bas");
      ProjectService.findProjectPaths = () => ({
        workspaceDir: tmp,
        projectFilePath: path.join(tmp, "Test.7Proj"),
      });

      // Set ignore timestamp to the future
      (SyncWatcher as any)._ignoreBasChangesUntil = Date.now() + 5000;

      let registeredHandler: any;
      const originalCreateWatcher = vscode.workspace.createFileSystemWatcher;
      vscode.workspace.createFileSystemWatcher = ((glob: string) => {
        return {
          onDidChange: (cb: any) => {
            if (glob.includes(".bas")) {
              registeredHandler = cb;
            }
            return { dispose: () => {} };
          },
          onDidCreate: () => {
            return { dispose: () => {} };
          },
          onDidDelete: () => {
            return { dispose: () => {} };
          },
          dispose: () => {},
        };
      }) as any;

      try {
        const dummyContext = { subscriptions: [] } as any;
        SyncWatcher.startAutoSync(dummyContext);

        assert.ok(registeredHandler, "Expected a change handler for .bas files");
        registeredHandler(vscode.Uri.file(basPath));

        await new Promise((resolve) => setTimeout(resolve, 500));

        assert.equal(
          buildCalls.length,
          0,
          "Should ignore .bas change because ignore window is active",
        );
      } finally {
        vscode.workspace.createFileSystemWatcher = originalCreateWatcher;
      }
    });
  });

  test("runs build and updates _selfBuiltProjMtimes on .bas change when not ignoring", async () => {
    await withTempDir(async (tmp) => {
      const basPath = path.join(tmp, "src", "module.bas");
      const projPath = path.join(tmp, "Test.7Proj");
      ProjectService.findProjectPaths = () => ({
        workspaceDir: tmp,
        projectFilePath: projPath,
      });

      const originalRepoGet = RepositoryService.getRepoBasPath;
      (RepositoryService as any).getRepoBasPath = () => tmp;

      let registeredHandler: any;
      const originalCreateWatcher = vscode.workspace.createFileSystemWatcher;
      vscode.workspace.createFileSystemWatcher = ((glob: string) => {
        return {
          onDidChange: (cb: any) => {
            if (glob.includes(".bas")) {
              registeredHandler = cb;
            }
            return { dispose: () => {} };
          },
          onDidCreate: () => {
            return { dispose: () => {} };
          },
          onDidDelete: () => {
            return { dispose: () => {} };
          },
          dispose: () => {},
        };
      }) as any;

      try {
        const dummyContext = { subscriptions: [] } as any;
        SyncWatcher.startAutoSync(dummyContext);

        registeredHandler(vscode.Uri.file(basPath));

        await new Promise((resolve) => setTimeout(resolve, 500));

        assert.equal(buildCalls.length, 1, "Should compile .bas change");
        const lastSelfMtime = (SyncWatcher as any)._selfBuiltProjMtimes.get(projPath.toLowerCase());
        assert.ok(lastSelfMtime !== undefined, "Should record the compiled project timestamp");
      } finally {
        vscode.workspace.createFileSystemWatcher = originalCreateWatcher;
        RepositoryService.getRepoBasPath = originalRepoGet;
      }
    });
  });

  test("respects 'disabled' sync mode by running neither compilation nor decompilation", async () => {
    await withTempDir(async (tmp) => {
      const basPath = path.join(tmp, "src", "module.bas");
      const projPath = path.join(tmp, "Test.7Proj");
      fs.writeFileSync(projPath, "<xml></xml>", "utf-8");

      ProjectService.findProjectPaths = () => ({
        workspaceDir: tmp,
        projectFilePath: projPath,
      });

      const originalRepoGet = RepositoryService.getRepoBasPath;
      (RepositoryService as any).getRepoBasPath = () => tmp;

      mockSyncModeSetting = "disabled";

      let basHandler: any;
      let projHandler: any;
      const originalCreateWatcher = vscode.workspace.createFileSystemWatcher;
      vscode.workspace.createFileSystemWatcher = ((glob: string) => {
        return {
          onDidChange: (cb: any) => {
            if (glob.includes(".bas")) basHandler = cb;
            else projHandler = cb;
            return { dispose: () => {} };
          },
          onDidCreate: () => {
            return { dispose: () => {} };
          },
          onDidDelete: () => {
            return { dispose: () => {} };
          },
          dispose: () => {},
        };
      }) as any;

      try {
        const dummyContext = { subscriptions: [] } as any;
        SyncWatcher.startAutoSync(dummyContext);
        SyncWatcher.watchExternalProjectFile(projPath, tmp);

        assert.ok(basHandler);
        assert.ok(projHandler);

        basHandler(vscode.Uri.file(basPath));
        projHandler();

        await new Promise((resolve) => setTimeout(resolve, 500));

        assert.equal(buildCalls.length, 0, "Should NOT run build in disabled mode");
        assert.equal(decompileCalls.length, 0, "Should NOT run decompile in disabled mode");
      } finally {
        vscode.workspace.createFileSystemWatcher = originalCreateWatcher;
        RepositoryService.getRepoBasPath = originalRepoGet;
      }
    });
  });

  test("respects 'estrutura > projeto.7proj' sync mode by running compile but not decompile", async () => {
    await withTempDir(async (tmp) => {
      const basPath = path.join(tmp, "src", "module.bas");
      const projPath = path.join(tmp, "Test.7Proj");
      fs.writeFileSync(projPath, "<xml></xml>", "utf-8");

      ProjectService.findProjectPaths = () => ({
        workspaceDir: tmp,
        projectFilePath: projPath,
      });

      const originalRepoGet = RepositoryService.getRepoBasPath;
      (RepositoryService as any).getRepoBasPath = () => tmp;

      mockSyncModeSetting = "estrutura > projeto.7proj";

      let basHandler: any;
      let projHandler: any;
      const originalCreateWatcher = vscode.workspace.createFileSystemWatcher;
      vscode.workspace.createFileSystemWatcher = ((glob: string) => {
        return {
          onDidChange: (cb: any) => {
            if (glob.includes(".bas")) basHandler = cb;
            else projHandler = cb;
            return { dispose: () => {} };
          },
          onDidCreate: () => {
            return { dispose: () => {} };
          },
          onDidDelete: () => {
            return { dispose: () => {} };
          },
          dispose: () => {},
        };
      }) as any;

      try {
        const dummyContext = { subscriptions: [] } as any;
        SyncWatcher.startAutoSync(dummyContext);
        SyncWatcher.watchExternalProjectFile(projPath, tmp);

        basHandler(vscode.Uri.file(basPath));
        projHandler();

        await new Promise((resolve) => setTimeout(resolve, 500));

        assert.equal(buildCalls.length, 1, "Should run build in compile-only mode");
        assert.equal(decompileCalls.length, 0, "Should NOT run decompile in compile-only mode");
      } finally {
        vscode.workspace.createFileSystemWatcher = originalCreateWatcher;
        RepositoryService.getRepoBasPath = originalRepoGet;
      }
    });
  });

  test("reads sync mode dynamically from data7.json", async () => {
    await withTempDir(async (tmp) => {
      const basPath = path.join(tmp, "src", "module.bas");
      const projPath = path.join(tmp, "Test.7Proj");
      fs.writeFileSync(projPath, "<xml></xml>", "utf-8");

      // Write data7.json with "disabled" sync mode
      fs.writeFileSync(
        path.join(tmp, "data7.json"),
        JSON.stringify({
          nome: "Test",
          sincronizacao: {
            modo: "disabled",
          },
        }),
        "utf-8",
      );

      ProjectService.findProjectPaths = () => ({
        workspaceDir: tmp,
        projectFilePath: projPath,
      });

      const originalRepoGet = RepositoryService.getRepoBasPath;
      (RepositoryService as any).getRepoBasPath = () => tmp;

      mockSyncModeSetting = "estrutura <> projeto.7proj"; // Extension config says enabled, but data7.json should win!

      let basHandler: any;
      const originalCreateWatcher = vscode.workspace.createFileSystemWatcher;
      vscode.workspace.createFileSystemWatcher = ((glob: string) => {
        return {
          onDidChange: (cb: any) => {
            if (glob.includes(".bas")) basHandler = cb;
            return { dispose: () => {} };
          },
          onDidCreate: () => {
            return { dispose: () => {} };
          },
          onDidDelete: () => {
            return { dispose: () => {} };
          },
          dispose: () => {},
        };
      }) as any;

      try {
        const dummyContext = { subscriptions: [] } as any;
        SyncWatcher.startAutoSync(dummyContext);

        basHandler(vscode.Uri.file(basPath));

        await new Promise((resolve) => setTimeout(resolve, 500));

        assert.equal(
          buildCalls.length,
          0,
          "Should respect disabled mode from data7.json over extension setting",
        );
      } finally {
        vscode.workspace.createFileSystemWatcher = originalCreateWatcher;
        RepositoryService.getRepoBasPath = originalRepoGet;
      }
    });
  });
});
