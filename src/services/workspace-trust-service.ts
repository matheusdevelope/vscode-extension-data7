import * as vscode from "vscode";

/**
 * Centralizes the Workspace Trust gate for every operation that can write files
 * or execute a local binary.
 */
export class WorkspaceTrustService {
  public static ensureTrusted(reason: string): boolean {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showErrorMessage(reason);
      return false;
    }
    return true;
  }
}
