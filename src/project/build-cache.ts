import { Builder, type BuildProjectOptions } from "./builder";
import { computeBuildSnapshot, isBuildSnapshotFresh, recordBuildSnapshot } from "./build-snapshot";

export interface EnsureProjectBuiltResult {
  readonly outputFilePath: string;
  readonly skipped: boolean;
  readonly snapshotHash: string;
}

export class BuildCache {
  public static getFreshProjectBuild(
    workspaceDir: string,
    outputFilePath: string,
    options: BuildProjectOptions = {},
  ): EnsureProjectBuiltResult | undefined {
    const snapshot = computeBuildSnapshot(workspaceDir, outputFilePath, {
      vscodeLoggerFilePath: options.vscodeLoggerFilePath,
      sugarOptions: options.sugarOptions,
      genericsEnabled: options.genericsEnabled,
      optimizationOptions: options.optimizationOptions,
      optimizationOverride: options.optimizationOverride,
      validateTranspiled: typeof options.validateTranspiled === "function",
    });

    if (!isBuildSnapshotFresh(snapshot)) return undefined;
    return {
      outputFilePath,
      skipped: true,
      snapshotHash: snapshot.hash,
    };
  }

  public static ensureProjectBuilt(
    workspaceDir: string,
    outputFilePath: string,
    options: BuildProjectOptions = {},
  ): EnsureProjectBuiltResult {
    const fresh = this.getFreshProjectBuild(workspaceDir, outputFilePath, options);
    if (fresh) return fresh;

    Builder.buildProject(workspaceDir, outputFilePath, undefined, options);

    // Builder.buildProject updates data7.json metadata. Store the post-build
    // snapshot so the next command can skip immediately when user inputs did
    // not change.
    const rebuiltSnapshot = computeBuildSnapshot(workspaceDir, outputFilePath, {
      vscodeLoggerFilePath: options.vscodeLoggerFilePath,
      sugarOptions: options.sugarOptions,
      genericsEnabled: options.genericsEnabled,
      optimizationOptions: options.optimizationOptions,
      optimizationOverride: options.optimizationOverride,
      validateTranspiled: typeof options.validateTranspiled === "function",
    });
    recordBuildSnapshot(rebuiltSnapshot);

    return {
      outputFilePath,
      skipped: false,
      snapshotHash: rebuiltSnapshot.hash,
    };
  }
}
