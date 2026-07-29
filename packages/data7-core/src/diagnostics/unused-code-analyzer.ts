import * as vscode from "../platform/vscode-api";
import {
  analyzeDeclarationReachability,
  isClassLifecycleMethod,
  shouldRemoveKind,
  type DeclarationKind,
  type DeclarationRecord,
  type ReachabilityModuleInput,
  type ReachabilityOptions,
  DEFAULT_REACHABILITY_REMOVE_OPTIONS,
} from "../analysis/declaration-reachability";
import { DiagnosticCodes, setDiagnosticPayload } from "./diagnostic-codes";
import type { UnusedCodePayload } from "./diagnostic-codes";

export interface UnusedCodeHit {
  readonly fileUri: string;
  readonly moduleName: string;
  readonly diagnostic: vscode.Diagnostic;
}

function declarationRange(record: DeclarationRecord): vscode.Range {
  const loc = record.node.loc;
  if (!loc) {
    return new vscode.Range(0, 0, 0, record.name.length);
  }
  const startLine = Math.max(0, loc.startLine - 1);
  const endLine = Math.max(startLine, loc.endLine - 1);
  const startChar = Math.max(0, loc.startChar);

  // Ensure the fade covers the full closing line ("End Sub" / "End Class" / …),
  // not just up to the start of the closing keyword token.
  const lines = record.module.input.code.split(/\r?\n/);
  const endLineText = lines[endLine] ?? "";
  const endChar = Math.max(loc.endChar, endLineText.length);

  return new vscode.Range(startLine, startChar, endLine, endChar);
}

function kindLabel(kind: DeclarationKind): string {
  switch (kind) {
    case "declareMethod":
      return "Declare";
    case "const":
      return "Const";
    case "variable":
      return "Dim";
    default:
      return kind;
  }
}

/**
 * Emits project-wide unused-code diagnostics using the same reachability
 * engine that build prune consumes (declarations never referenced from
 * Principal / Main / keep seeds).
 *
 * Styled like TypeScript unused code: Hint + DiagnosticTag.Unnecessary so the
 * editor fades the block instead of underlining it; Quick Fixes still apply.
 */
export function collectUnusedCodeDiagnostics(
  modules: readonly ReachabilityModuleInput[],
  options?: Partial<ReachabilityOptions>,
): UnusedCodeHit[] {
  const resolved: ReachabilityOptions = {
    alwaysInclude: options?.alwaysInclude ?? [],
    remove: options?.remove ?? DEFAULT_REACHABILITY_REMOVE_OPTIONS,
  };

  const analysis = analyzeDeclarationReachability(modules, resolved);
  if (analysis.skippedDueToParseErrors) {
    return [];
  }

  const hits: UnusedCodeHit[] = [];
  for (const decl of analysis.index.declarations) {
    if (decl.kind === "namespace") {
      // Namespace drop is implied by its members / module exclusion; skip shell.
      continue;
    }
    if (decl.kind === "method" && isClassLifecycleMethod(decl.name)) {
      // Sub New / Sub Free ride with the owning class; never report alone.
      continue;
    }
    if (analysis.live.declarations.has(decl.key)) continue;
    if (!shouldRemoveKind(decl.kind, resolved.remove)) continue;

    const range = declarationRange(decl);
    const owner = decl.ownerClass ? `${decl.ownerClass}.` : "";
    const ns = decl.namespace ? `${decl.namespace}.` : "";
    const diag = new vscode.Diagnostic(
      range,
      `${kindLabel(decl.kind)} "${ns}${owner}${decl.name}" não é usado a partir de Principal (será removido no prune).`,
      vscode.DiagnosticSeverity.Hint,
    );
    diag.code = DiagnosticCodes.UnusedCode;
    diag.source = "data7";
    diag.tags = [vscode.DiagnosticTag.Unnecessary];
    const payload: UnusedCodePayload = {
      code: DiagnosticCodes.UnusedCode,
      kind: decl.kind,
      name: decl.name,
      namespace: decl.namespace,
      ownerClass: decl.ownerClass,
      line: range.start.line,
      startChar: range.start.character,
      endChar: range.end.character,
      endLine: range.end.line,
    };
    setDiagnosticPayload(diag, payload);
    hits.push({
      fileUri: decl.module.input.fileUri,
      moduleName: decl.module.input.moduleName,
      diagnostic: diag,
    });
  }

  return hits;
}
