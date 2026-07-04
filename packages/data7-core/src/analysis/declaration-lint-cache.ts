import type * as vscode from "../platform/vscode-api";
import type { MethodDeclaration, PropertyDeclaration } from "../project/ast/ast";
import { hashContent } from "../utils/content-hash";

interface DeclarationLintEntry {
  readonly dependencyFingerprint: string;
  readonly bodyHash: string;
  readonly diagnostics: readonly vscode.Diagnostic[];
}

export type DeclarationLintTarget =
  | { readonly kind: "MethodDeclaration"; readonly node: MethodDeclaration }
  | { readonly kind: "PropertyDeclaration"; readonly node: PropertyDeclaration };

/**
 * Caches diagnostics produced by walking a single method/property body.
 * Survives edits elsewhere in the same file when dependency context is unchanged.
 */
export class DeclarationLintCache {
  private static instance: DeclarationLintCache | undefined;
  private readonly entries = new Map<string, DeclarationLintEntry>();
  private readonly keysByFile = new Map<string, Set<string>>();

  public static getInstance(): DeclarationLintCache {
    DeclarationLintCache.instance ??= new DeclarationLintCache();
    return DeclarationLintCache.instance;
  }

  public static resetForTests(): void {
    DeclarationLintCache.instance?.clear();
    DeclarationLintCache.instance = undefined;
  }

  public clear(): void {
    this.entries.clear();
    this.keysByFile.clear();
  }

  public buildCacheKey(
    cacheScope: string,
    fileUri: string,
    containerName: string | undefined,
    target: DeclarationLintTarget,
  ): string {
    const name = target.node.name.toLowerCase();
    const container = containerName?.toLowerCase() ?? "";
    return `${cacheScope}|${fileUri.toLowerCase()}|${target.kind}|${container}|${name}`;
  }

  public get(
    cacheKey: string,
    dependencyFingerprint: string,
    bodyHash: string,
  ): readonly vscode.Diagnostic[] | undefined {
    const entry = this.entries.get(cacheKey);
    if (
      !entry ||
      entry.dependencyFingerprint !== dependencyFingerprint ||
      entry.bodyHash !== bodyHash
    ) {
      return undefined;
    }
    return entry.diagnostics;
  }

  public set(
    cacheKey: string,
    dependencyFingerprint: string,
    bodyHash: string,
    diagnostics: readonly vscode.Diagnostic[],
  ): void {
    this.entries.set(cacheKey, { dependencyFingerprint, bodyHash, diagnostics });
  }

  public trackFileKey(cacheScope: string, fileUri: string, cacheKey: string): void {
    const fileKey = `${cacheScope}|${fileUri.toLowerCase()}`;
    let keys = this.keysByFile.get(fileKey);
    if (!keys) {
      keys = new Set<string>();
      this.keysByFile.set(fileKey, keys);
    }
    keys.add(cacheKey);
  }

  public invalidateFile(cacheScope: string, fileUri: string): void {
    const fileKey = `${cacheScope}|${fileUri.toLowerCase()}`;
    const keys = this.keysByFile.get(fileKey);
    if (!keys) return;
    for (const key of keys) {
      this.entries.delete(key);
    }
    this.keysByFile.delete(fileKey);
  }
}

export function hashDeclarationBody(
  target: DeclarationLintTarget,
  lines: readonly string[],
): string {
  if (target.kind === "MethodDeclaration") {
    return hashMethodBody(target.node, lines);
  }
  return hashPropertyBody(target.node, lines);
}

function hashMethodBody(method: MethodDeclaration, lines: readonly string[]): string {
  if (method.body.length === 0) {
    return "empty";
  }
  const first = method.body[0]?.loc;
  const last = method.body[method.body.length - 1]?.loc;
  if (!first || !last) {
    return hashContent(String(method.body.length));
  }
  return hashContent(sliceLines(lines, first.startLine, last.endLine));
}

function hashPropertyBody(property: PropertyDeclaration, lines: readonly string[]): string {
  const parts: string[] = [];
  if (property.getter) {
    parts.push(`g:${hashMethodBody(property.getter, lines)}`);
  }
  if (property.setter) {
    parts.push(`s:${hashMethodBody(property.setter, lines)}`);
  }
  if (property.parameters && property.parameters.length > 0) {
    parts.push(
      `p:${hashContent(
        property.parameters.map((parameter) => parameter.name.toLowerCase()).join(","),
      )}`,
    );
  }
  if (parts.length === 0 && property.loc) {
    parts.push(hashContent(sliceLines(lines, property.loc.startLine, property.loc.endLine)));
  }
  return parts.length > 0 ? hashContent(parts.join("|")) : "empty";
}

function sliceLines(lines: readonly string[], startLine: number, endLine: number): string {
  return lines.slice(Math.max(0, startLine - 1), endLine).join("\n");
}
