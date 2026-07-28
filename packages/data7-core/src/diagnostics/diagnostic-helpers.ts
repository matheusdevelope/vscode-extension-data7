import type * as vscode from "../platform/vscode-api";
import type { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { TypeResolver } from "../analysis/type-resolver";
import { lookupSystemByName } from "../system-library";
import { DiagnosticCodes, setDiagnosticPayload } from "./diagnostic-codes";
import type { UnknownMemberPayload } from "./diagnostic-codes";
import type { Expression, MethodInvocation, TypeReference } from "../project/ast/ast";

/**
 * Whether a symbol's `containerName` is visible at the current walker position.
 * Covers: same namespace, explicit Imports, and enclosing/nested class stacks
 * (e.g. `Mouse` nested in `Class WinAPI` referenced as `Mouse.SetPos` inside
 * `WinAPI` / sibling nested classes — container is the outer class, not the namespace).
 */
export function isSymbolContainerAccessible(
  containerName: string | undefined,
  options: {
    readonly activeNamespace?: string;
    readonly activeClassNesting?: readonly string[];
    readonly imports?: ReadonlySet<string>;
  },
): boolean {
  if (!containerName) return true;
  const containerLower = containerName.toLowerCase();
  if (options.activeNamespace?.toLowerCase() === containerLower) return true;
  if (options.imports?.has(containerLower)) return true;
  if (options.activeClassNesting?.some((name) => name.toLowerCase() === containerLower)) {
    return true;
  }
  return false;
}

export function findClosest(
  query: string,
  candidates: readonly string[],
  options?: { readonly maxCandidates?: number },
): string[] {
  const q = query.toLowerCase();
  const maxCandidates = options?.maxCandidates ?? 250;

  // Prefer cheap prefix / substring filters before Levenshtein.
  const prefixHits: string[] = [];
  const containsHits: string[] = [];
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (lower.startsWith(q) && lower !== q) {
      prefixHits.push(candidate);
      if (prefixHits.length >= 3) {
        return prefixHits.slice(0, 3);
      }
    } else if (q.length >= 2 && lower.includes(q) && lower !== q) {
      containsHits.push(candidate);
    }
  }
  if (prefixHits.length > 0) {
    return prefixHits.slice(0, 3);
  }
  if (containsHits.length > 0 && containsHits.length <= 3) {
    return containsHits.slice(0, 3);
  }

  const pool =
    candidates.length <= maxCandidates
      ? candidates
      : (() => {
          const sampled: string[] = containsHits.slice(0, Math.min(containsHits.length, 64));
          const remaining = maxCandidates - sampled.length;
          if (remaining <= 0) return sampled;
          const step = Math.max(1, Math.floor(candidates.length / remaining));
          for (let i = 0; i < candidates.length && sampled.length < maxCandidates; i += step) {
            const candidate = candidates[i];
            if (candidate) sampled.push(candidate);
          }
          return sampled;
        })();

  const ranked: { name: string; dist: number }[] = [];
  for (const candidate of pool) {
    const dist = levenshtein(q, candidate.toLowerCase());
    if (dist <= 2 && dist > 0) ranked.push({ name: candidate, dist });
  }
  ranked.sort((a, b) => a.dist - b.dist || a.name.localeCompare(b.name));
  return ranked.slice(0, 3).map((result) => result.name);
}

export function attachUnknownMemberSuggestions(
  diag: vscode.Diagnostic,
  memberName: string,
  candidates: readonly string[],
): void {
  const suggestions = findClosest(memberName, candidates);
  if (suggestions.length === 0) return;
  const payload: UnknownMemberPayload = {
    code: DiagnosticCodes.UnknownMember,
    member: memberName,
    suggestions,
  };
  setDiagnosticPayload(diag, payload);
}

export function inheritsFromClass(
  subClassName: string,
  baseClassName: string,
  indexer: WorkspaceSymbolIndexer,
): boolean {
  let current = subClassName.toLowerCase();
  const target = baseClassName.toLowerCase();
  const visited = new Set<string>();
  while (current && current !== target && !visited.has(current)) {
    visited.add(current);
    const cls = TypeResolver.findClassSymbol(current, indexer);
    if (!cls) break;
    const parent = TypeResolver.resolveParent(cls);
    current = parent ? parent.toLowerCase() : "";
  }
  return current === target;
}

export function areResolvedTypeNamesEquivalent(
  rhsType: string,
  lhsType: string,
  indexer: WorkspaceSymbolIndexer,
): boolean {
  if (rhsType.toLowerCase() === lhsType.toLowerCase()) return true;
  if (
    flattenGenericTypeName(rhsType).toLowerCase() === flattenGenericTypeName(lhsType).toLowerCase()
  ) {
    return true;
  }
  if (simpleTypeName(rhsType).toLowerCase() !== simpleTypeName(lhsType).toLowerCase()) return false;
  const rhsClass = TypeResolver.findClassSymbol(rhsType, indexer);
  const lhsClass = TypeResolver.findClassSymbol(lhsType, indexer);
  return (
    !!rhsClass &&
    !!lhsClass &&
    rhsClass.name.toLowerCase() === lhsClass.name.toLowerCase() &&
    (rhsClass.containerName ?? "").toLowerCase() === (lhsClass.containerName ?? "").toLowerCase()
  );
}

export function isLikelyGenericTypeParameter(typeName: string): boolean {
  return /^[A-Z]$/.test(typeName.trim());
}

export function areSameGenericTemplateCompatible(
  rhsType: string,
  lhsType: string,
  indexer: WorkspaceSymbolIndexer,
): boolean {
  const rhs = parseGenericTypeName(rhsType);
  const lhs = parseGenericTypeName(lhsType);
  if (
    !rhs ||
    rhs.base.toLowerCase() !== lhs?.base.toLowerCase() ||
    rhs.args.length !== lhs.args.length
  ) {
    return false;
  }
  return rhs.args.every((rhsArg, index) => {
    const lhsArg = lhs.args[index];
    return (
      !!lhsArg &&
      (areResolvedTypeNamesEquivalent(rhsArg, lhsArg, indexer) ||
        isLikelyGenericTypeParameter(rhsArg) ||
        isLikelyGenericTypeParameter(lhsArg))
    );
  });
}

export function typeRefToString(typeRef: TypeReference | undefined): string | undefined {
  if (!typeRef?.name) return undefined;
  if (typeRef.typeArguments.length === 0) return typeRef.name;
  return `${typeRef.name}<${typeRef.typeArguments.map((argument) => typeRefToString(argument) ?? "").join(", ")}>`;
}

export function exprToString(expr: Expression | undefined): string | undefined {
  if (!expr) return undefined;
  if (expr.kind === "Identifier") return expr.name;
  if (expr.kind === "Literal") {
    // String literals already include surrounding quotes in the AST value (lexer slice).
    if (typeof expr.value === "string") return expr.value;
    if (expr.value === null) return "Nothing";
    if (typeof expr.value === "boolean") return expr.value ? "True" : "False";
    return String(expr.value);
  }
  if (expr.kind === "MemberAccess") {
    const target = exprToString(expr.target);
    return target ? `${target}.${expr.member}` : expr.member;
  }
  if (expr.kind === "MethodInvocation") {
    const callee = exprToString(expr.callee);
    return callee ? `${callee}.${expr.methodName}` : expr.methodName;
  }
  if (expr.kind === "BinaryExpression") {
    const left = exprToString(expr.left);
    const right = exprToString(expr.right);
    if (!left || !right) return undefined;
    return `${left} ${expr.operator} ${right}`;
  }
  if (expr.kind === "UnaryExpression") {
    const argument = exprToString(expr.argument);
    if (!argument) return undefined;
    const op = expr.operator.toLowerCase() === "not" ? "Not " : expr.operator;
    return `${op}${argument}`;
  }
  return undefined;
}

export function isQualifiedTypeInvocation(
  expr: MethodInvocation,
  indexer: WorkspaceSymbolIndexer,
): boolean {
  if (!expr.callee) return false;
  const calleeName = exprToString(expr.callee);
  if (!calleeName) return false;
  const containerLower = calleeName.toLowerCase();
  return (
    lookupSystemByName(expr.methodName).some(
      (symbol) =>
        (symbol.kind === "class" || symbol.kind === "structure") &&
        symbol.containerName?.toLowerCase() === containerLower,
    ) ||
    indexer
      .getSymbolsByName(expr.methodName)
      .some(
        (symbol) =>
          (symbol.kind === "class" || symbol.kind === "structure") &&
          symbol.containerName?.toLowerCase() === containerLower,
      )
  );
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let current = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(
        current + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous[j - 1] = current;
      current = next;
    }
    previous[b.length] = current;
  }
  return previous[b.length] ?? 0;
}

function simpleTypeName(typeName: string): string {
  const trimmed = typeName.trim();
  const lastDot = trimmed.lastIndexOf(".");
  return lastDot === -1 ? trimmed : trimmed.substring(lastDot + 1);
}

function parseGenericTypeName(typeName: string): { base: string; args: string[] } | undefined {
  const trimmed = typeName.trim();
  const lt = trimmed.indexOf("<");
  if (lt === -1 || !trimmed.endsWith(">")) return undefined;
  const base = trimmed.slice(0, lt).trim();
  const inner = trimmed.slice(lt + 1, -1);
  if (!base || !inner.trim()) return undefined;
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === "<") depth++;
    else if (char === ">") depth--;
    else if (char === "," && depth === 0) {
      args.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(inner.slice(start).trim());
  return { base, args: args.filter((argument) => argument.length > 0) };
}

function flattenGenericTypeName(typeName: string): string {
  const parsed = parseGenericTypeName(typeName);
  if (!parsed) return typeName.trim();
  return `${parsed.base}_${parsed.args.map(flattenGenericTypeName).join("_")}`;
}
