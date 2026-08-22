import type * as vscode from "../platform/vscode-api";
import type { SymbolInfo, WorkspaceSymbolIndexer } from "./symbol-indexer";
import {
  SYSTEM_SYMBOLS,
  lookupSystemByContainer,
  lookupSystemClassByName,
  lookupSystemNamespaceOrClassByName,
  lookupSystemByName,
} from "../system-library";
import { inferLiteralType } from "../utils/literal-type-infer";
import { recordPerf } from "../utils/performance";
import { performance } from "perf_hooks";
import { LintPipelineProfiler } from "./lint-pipeline-profiler";
import { getOrBuildWithScopeIndex } from "./with-scope-index";
import { getNonNullVariablesAt } from "./flow-analyzer";
import { findInnerMostGenericUsage, flatNameOf } from "./generics-analyzer";
import { LanguageProcessor } from "./language-processor";
import {
  clearLintTypeResolutionCachesForUnit,
  getExpressionTypeCache,
  getFileLineContextCacheHolder,
  getFileLocalsCache,
  getGenericParamsCache,
  getIdentifierTypeByLineCacheHolder,
  getLocalScopeIndexCacheHolder,
  getMemberAccessType,
  getMethodInvocationReturnType,
  getRawExpressionTypeCache,
  getUnqualifiedCallable,
  memberAccessCacheKey,
  methodInvocationReturnCacheKey,
  setMemberAccessType,
  setMethodInvocationReturnType,
  setUnqualifiedCallable,
  unqualifiedCallableCacheKey,
} from "./lint-type-resolution-cache";

export { clearLocalScopeIndexCache } from "./lint-type-resolution-cache";
import {
  extractExternalTypeDirectives,
  isExternalTypeAllowedByDirectives,
  type ExternalTypeActiveScope,
} from "../utils/external-type-comments";
import type {
  Expression,
  TypeReference,
  Node,
  BinaryExpression,
  MethodInvocation,
  UnaryExpression,
  CompilationUnit,
  MethodDeclaration,
  PropertyDeclaration,
  Statement,
} from "../project/ast/ast";

/**
 * Shared scope and type resolution helpers used by every provider and by the
 * linter. Lives in its own module so providers do not import each other
 * (see governance.mdc).
 */
/** Pre-builds per-file scope indexes used heavily during lint type resolution. */
export function warmLintTypeResolutionIndexes(
  unit: CompilationUnit,
  document: vscode.TextDocument,
  indexer: WorkspaceSymbolIndexer,
  isCancelled?: () => boolean,
): void {
  const fileSyms = indexer.getFileSymbols(document.uri.toString());
  if (!fileSyms) {
    return;
  }
  // Yield points between index builds: each one walks the whole unit, so a
  // cancelled run used to pay for all three before anyone noticed.
  if (isCancelled?.()) return;
  getOrBuildLocalScopeIndex(unit, document, indexer);
  if (isCancelled?.()) return;
  getOrBuildFileLineContext(unit, fileSyms.symbols);
  if (isCancelled?.()) return;
  getOrBuildWithScopeIndex(unit);
}

export interface ClassResolutionContext {
  readonly fileUri: string;
  readonly namespace?: string;
  readonly imports: readonly string[];
}

const classResolutionContextHolder: { context?: ClassResolutionContext } = {};

export function withClassResolutionContext<T>(context: ClassResolutionContext, fn: () => T): T {
  const previous = classResolutionContextHolder.context;
  classResolutionContextHolder.context = context;
  try {
    return fn();
  } finally {
    classResolutionContextHolder.context = previous;
  }
}

export class TypeResolver {
  public static buildClassResolutionContext(
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): ClassResolutionContext {
    const fileUri = document.uri.toString();
    const fileSyms = indexer.getFileSymbols(fileUri);
    const cached = LanguageProcessor.getInstance().getOrParse(fileUri, document.getText());
    const namespace = fileSyms ? findActiveNamespaceName(fileSyms.symbols, lineIdx) : undefined;
    return {
      fileUri,
      namespace,
      imports: fileSyms?.imports ?? [],
    };
  }

  public static runWithClassResolutionContext<T>(
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
    fn: () => T,
  ): T {
    return withClassResolutionContext(
      TypeResolver.buildClassResolutionContext(document, lineIdx, indexer),
      fn,
    );
  }

  public static findInnermostClassSymbol(
    symbols: readonly SymbolInfo[] | undefined,
    lineIdx: number,
  ): SymbolInfo | undefined {
    return (symbols ?? [])
      .filter(
        (s) =>
          s.kind === "class" &&
          !s.isSyntheticGenericInstantiation &&
          lineIdx >= s.range.startLine &&
          lineIdx <= s.range.endLine,
      )
      .sort((left, right) => {
        const leftSpan = left.range.endLine - left.range.startLine;
        const rightSpan = right.range.endLine - right.range.startLine;
        if (leftSpan !== rightSpan) return leftSpan - rightSpan;
        return right.range.startLine - left.range.startLine;
      })[0];
  }

  /**
   * Resolves the static type of a local variable, parameter, field or
   * namespace-level variable by walking the AST of the active document.
   *
   * Falls back to `undefined` when the type cannot be determined.
   */
  public static getVariableType(
    varName: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const rawType = TypeResolver.getRawVariableType(varName, document, position, indexer);
    if (!rawType) return undefined;
    const genericParams = TypeResolver.getGenericParametersInScope(document, position, indexer);
    return TypeResolver.resolveGenericParametersInType(rawType, genericParams);
  }

  /**
   * Returns `true` when `varName` is declared as a `Dim` local variable or method parameter
   * **within** the enclosing method body at `lineIdx`. Unlike `getVariableType`, this does NOT
   * fall back to class members, inherited members, or global symbols.
   *
   * Use this to distinguish `Dim retorno As T` (local variable) from a class method that happens
   * to share the same name — the latter is a valid target for the call-parentheses-mismatch warning.
   */
  public static hasLocalDimDeclaration(
    varName: string,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): boolean {
    const nameLower = varName.toLowerCase();
    const cached = LanguageProcessor.getInstance().getOrParse(
      document.uri.toString(),
      document.getText(),
    );
    const unit = cached.unit;
    const scopeIndex = getOrBuildLocalScopeIndex(unit, document, indexer);
    if (scopeIndex.getLocalType(lineIdx, varName)) {
      return true;
    }
    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    if (!fileSyms) {
      return false;
    }
    const lineContext = getOrBuildFileLineContext(unit, fileSyms.symbols);
    const currentMethod = lineContext.getMethod(lineIdx);
    return currentMethod?.parameters?.some((p) => p.name.toLowerCase() === nameLower) ?? false;
  }

  public static findVariableSymbol(
    varName: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo | undefined {
    const varLower = varName.toLowerCase();
    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    const activeNamespace = fileSyms
      ? findActiveNamespaceName(fileSyms.symbols, position.line)
      : undefined;
    const isMatchingVariable = (s: SymbolInfo): boolean =>
      s.name.toLowerCase() === varLower && isVariableLikeSymbol(s);

    const currentFileSymbol = fileSyms?.symbols.find((s) => {
      if (!isMatchingVariable(s)) return false;
      if (!s.containerName) return true;
      return activeNamespace !== undefined && s.containerName.toLowerCase() === activeNamespace;
    });
    if (currentFileSymbol) return currentFileSymbol;

    const allSymbols = indexer.getSymbolsByName(varName);

    if (activeNamespace) {
      const namespaceSymbol = allSymbols.find(
        (s) => isMatchingVariable(s) && s.containerName?.toLowerCase() === activeNamespace,
      );
      if (namespaceSymbol) return namespaceSymbol;
    }

    const importedNamespaces = new Set(fileSyms?.imports.map((imp) => imp.toLowerCase()) ?? []);
    if (importedNamespaces.size > 0) {
      // Only namespace-scoped variables are visible via Imports.
      // Class fields use the owning class as containerName; matching that against an
      // imported namespace (or a homonymous class/namespace like ServicosCampos) would
      // incorrectly expose private instance fields such as `migracoes As MigracoesCampos`
      // as free identifiers in unrelated files.
      // Namespace Dim/Const are indexed with isShared: true; class fields only when Shared.
      const importedSymbol = allSymbols.find(
        (s) =>
          isMatchingVariable(s) &&
          !s.isPrivate &&
          s.isShared &&
          !!s.containerName &&
          importedNamespaces.has(s.containerName.toLowerCase()) &&
          isNamespaceContainer(s.containerName, indexer),
      );
      if (importedSymbol) return importedSymbol;
    }

    const projectGlobals = allSymbols.filter(
      (s) => isMatchingVariable(s) && !s.containerName && !s.fileUri.startsWith("system://"),
    );
    return (
      projectGlobals.find((s) => isPrincipalFileUri(s.fileUri)) ??
      projectGlobals.find((s) => s.fileUri === document.uri.toString()) ??
      projectGlobals[0]
    );
  }

  /**
   * Returns whether `varName` resolves to a variable-like symbol at `position`
   * without applying generic-parameter substitution on the returned type.
   */
  public static hasVariableInScope(
    varName: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    indexer: WorkspaceSymbolIndexer,
  ): boolean {
    return TypeResolver.getRawVariableType(varName, document, position, indexer) !== undefined;
  }

  private static getRawVariableType(
    varName: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const varLower = varName.toLowerCase();

    // Walk the AST from the beginning of the file up to the cursor position
    const cached = LanguageProcessor.getInstance().getOrParse(
      document.uri.toString(),
      document.getText(),
    );
    const unit = cached.unit;

    const scopeIndex = getOrBuildLocalScopeIndex(unit, document, indexer);
    const indexedLocal = scopeIndex.getLocalType(position.line, varName);

    const needsLegacyInference = indexedLocal === undefined || indexedLocal === "Variant";

    if (needsLegacyInference) {
      let fileCache = getFileLocalsCache().get(unit);
      if (!fileCache) {
        fileCache = new Map();
        getFileLocalsCache().set(unit, fileCache);
      }

      let locals = fileCache.get(position.line);
      if (!locals) {
        locals = new Map<string, string>();
        collectLocalDeclarations(unit, position, locals, indexer, document, position.line);
        fileCache.set(position.line, locals);
      }

      const legacyLocal = locals.get(varLower);
      if (legacyLocal) {
        return legacyLocal;
      }
    }

    if (indexedLocal) {
      return indexedLocal;
    }

    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    if (fileSyms) {
      const lineContext = getOrBuildFileLineContext(unit, fileSyms.symbols);
      const currentMethod = lineContext.getMethod(position.line);
      if (currentMethod?.parameters) {
        const param = currentMethod.parameters.find((p) => p.name.toLowerCase() === varLower);
        if (param) {
          return isExternalTypeAcceptedByDeclaration(
            document,
            param.type,
            currentMethod.range.startLine,
            position.line,
          )
            ? "Variant"
            : param.type;
        }
      }
      if (currentMethod?.name.toLowerCase() === varLower) {
        return currentMethod.type;
      }

      const currentProperty = lineContext.getProperty(position.line);
      if (currentProperty?.parameters) {
        const param = currentProperty.parameters.find((p) => p.name.toLowerCase() === varLower);
        if (param) {
          return isExternalTypeAcceptedByDeclaration(
            document,
            param.type,
            currentProperty.range.startLine,
            position.line,
          )
            ? "Variant"
            : param.type;
        }
      }
      if (currentProperty?.name.toLowerCase() === varLower) {
        return currentProperty.type;
      }

      const currentClass = lineContext.getClass(position.line);
      if (currentClass) {
        const member = TypeResolver.findMemberOnClassSymbol(currentClass, varName, indexer);
        if (member) {
          return isExternalTypeAcceptedByDeclaration(
            document,
            member.type,
            member.range.startLine,
            position.line,
          )
            ? "Variant"
            : member.type;
        }
      }
    }

    const globalVar = TypeResolver.findVariableSymbol(varName, document, position, indexer);
    if (globalVar) {
      return isExternalTypeAcceptedByDeclaration(
        document,
        globalVar.type,
        globalVar.range.startLine,
        position.line,
      )
        ? "Variant"
        : globalVar.type;
    }

    return undefined;
  }

  /**
   * Resolves a class symbol by either simple (`TStrings`) or qualified
   * (`Collections.TStrings`) name. System library is searched first using a
   * pre-built lookup index, then the workspace.
   */
  public static findClassSymbol(
    qualifiedOrSimpleName: string,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo | undefined {
    const genericBaseName = genericBaseNameOf(qualifiedOrSimpleName);
    const isGenericReference = genericBaseName !== undefined;
    qualifiedOrSimpleName = normalizeGenericTypeName(qualifiedOrSimpleName);
    const flatGenericBaseName = parseFlatGenericTypeReference(qualifiedOrSimpleName, indexer)?.base;
    if (qualifiedOrSimpleName.includes(".")) {
      const lastDot = qualifiedOrSimpleName.lastIndexOf(".");
      const namePart = qualifiedOrSimpleName.substring(lastDot + 1);
      const nsPart = qualifiedOrSimpleName.substring(0, lastDot);

      const exact = lookupSystemClassByName(namePart).find(
        (s) => s.containerName?.toLowerCase() === nsPart.toLowerCase(),
      );
      if (exact) return exact;

      const byName = lookupSystemClassByName(namePart)[0];
      if (byName) return byName;

      const wsMatches = indexer
        .getSymbolsByName(namePart)
        .filter(
          (s) =>
            (s.kind === "class" ||
              s.kind === "structure" ||
              s.kind === "delegate" ||
              s.kind === "enum") &&
            (s.containerName?.toLowerCase() === nsPart.toLowerCase() ||
              nsPart.toLowerCase().endsWith("." + s.containerName?.toLowerCase())),
        );
      if (wsMatches.length > 0) {
        return wsMatches[0];
      }
      return isGenericReference || flatGenericBaseName
        ? findGenericBaseSymbol(genericBaseName ?? flatGenericBaseName, indexer)
        : undefined;
    }

    const wsClasses = indexer
      .getSymbolsByName(qualifiedOrSimpleName)
      .filter(
        (symbol) =>
          symbol.kind === "class" ||
          symbol.kind === "structure" ||
          symbol.kind === "delegate" ||
          symbol.kind === "enum",
      );
    const validWsClasses = wsClasses.filter((symbol) => indexer.isFileValid(symbol.fileUri));
    if (validWsClasses.length > 0) {
      const preferred = pickWorkspaceClassByContext(
        validWsClasses,
        classResolutionContextHolder.context,
      );
      if (preferred) return preferred;
      const sys = lookupSystemClassByName(qualifiedOrSimpleName)[0];
      if (sys) return sys;
      if (validWsClasses.length === 1) return validWsClasses[0];
      return validWsClasses[0];
    }

    const sys = lookupSystemClassByName(qualifiedOrSimpleName)[0];
    if (sys) return sys;

    const wsSym =
      indexer.findSymbolByName(qualifiedOrSimpleName) ??
      wsClasses.find(
        (symbol) =>
          symbol.kind === "class" ||
          symbol.kind === "structure" ||
          symbol.kind === "delegate" ||
          symbol.kind === "enum",
      );
    if (
      wsSym &&
      (wsSym.kind === "class" ||
        wsSym.kind === "structure" ||
        wsSym.kind === "delegate" ||
        wsSym.kind === "enum")
    ) {
      return wsSym;
    }
    return isGenericReference || flatGenericBaseName
      ? findGenericBaseSymbol(genericBaseName ?? flatGenericBaseName, indexer)
      : undefined;
  }

  /**
   * Resolves the parent class declared in `Inherits` for a workspace class,
   * honouring same-namespace and `Imports` context before falling back to the
   * global system-library lookup used by {@link findClassSymbol}.
   */
  public static findParentClassSymbol(
    childClass: SymbolInfo,
    parentName: string,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo | undefined {
    if (!childClass.fileUri.startsWith("system://")) {
      const inContext = TypeResolver.resolveWorkspaceClassInContext(
        parentName,
        indexer,
        childClass,
      );
      if (inContext) return inContext;
    }
    return TypeResolver.findClassSymbol(parentName, indexer);
  }

  private static resolveWorkspaceClassInContext(
    name: string,
    indexer: WorkspaceSymbolIndexer,
    childClass: SymbolInfo,
  ): SymbolInfo | undefined {
    const isClassLike = (symbol: SymbolInfo): boolean =>
      symbol.kind === "class" ||
      symbol.kind === "structure" ||
      symbol.kind === "delegate" ||
      symbol.kind === "enum";

    const genericBase = genericBaseNameOf(name);
    const flatName = name.includes("<") ? normalizeGenericTypeName(name) : name;
    // Prefer the open generic template over a synthetic flat monomorph when
    // walking `Inherits Foo<T>` — template members carry Overridable flags.
    const lookupNames = [...new Set([name, genericBase, flatName].filter((n): n is string => !!n))];

    if (name.includes(".") || flatName.includes(".")) {
      for (const lookup of lookupNames) {
        if (!lookup.includes(".")) continue;
        const lastDot = lookup.lastIndexOf(".");
        const namePart = lookup.substring(lastDot + 1);
        const nsPart = lookup.substring(0, lastDot).toLowerCase();
        const hit = indexer
          .getSymbolsByName(namePart)
          .find(
            (symbol) =>
              isClassLike(symbol) &&
              (symbol.containerName?.toLowerCase() === nsPart ||
                nsPart.endsWith("." + (symbol.containerName?.toLowerCase() ?? ""))),
          );
        if (hit) return hit;
      }
    }

    for (const lookup of lookupNames) {
      const simpleName = lookup.includes(".") ? (lookup.split(".").pop() ?? lookup) : lookup;
      const allClasses = indexer.getSymbolsByName(simpleName).filter(isClassLike);
      const declaringNs = childClass.containerName?.toLowerCase();
      if (declaringNs) {
        const sameNs = allClasses.find(
          (symbol) =>
            symbol.containerName?.toLowerCase() === declaringNs &&
            !symbol.isSyntheticGenericInstantiation,
        );
        if (sameNs) return sameNs;
      }

      const fileSym = indexer.getFileSymbols(childClass.fileUri);
      if (fileSym) {
        for (const imp of fileSym.imports) {
          const impLower = imp.toLowerCase();
          const imported = allClasses.find(
            (symbol) =>
              symbol.containerName?.toLowerCase() === impLower &&
              !symbol.isSyntheticGenericInstantiation,
          );
          if (imported) return imported;
        }
      }

      const template = allClasses.find(
        (symbol) =>
          (symbol.genericTypeParameters?.length ?? 0) > 0 &&
          !symbol.isSyntheticGenericInstantiation,
      );
      if (template) return template;

      const nonSynthetics = allClasses.filter((symbol) => !symbol.isSyntheticGenericInstantiation);
      if (nonSynthetics.length === 1) {
        return nonSynthetics[0];
      }
      if (nonSynthetics.length > 1) {
        // Ambiguous simple name (classic: mod_enum.TEnum vs mod_tenum.TEnum).
        // Prefer the canonical core-module base before an arbitrary first hit.
        const preferred = preferCanonicalHomonymClass(nonSynthetics, simpleName);
        if (preferred) return preferred;
      }

      // Keep scanning lookupNames before accepting a synthetic-only hit so the
      // open template (genericBase) can win over TTList_Foo / Foo_String flats.
      if (allClasses.length > 0 && lookup === lookupNames[lookupNames.length - 1]) {
        return preferCanonicalHomonymClass(allClasses, simpleName) ?? allClasses[0];
      }
    }

    return undefined;
  }

  /**
   * Best-effort type inference for `Dim x = <expr>` when the user omits the
   * `As <Type>` clause. Handles expressions via unified parser AST.
   */
  public static inferExpressionType(
    expr: string,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const trimmed = expr.trim();
    if (!trimmed) return undefined;
    const noComment = stripTrailingComment(trimmed).trim();
    if (!noComment) return undefined;

    try {
      const parsedExpr = LanguageProcessor.getInstance().parseExpression(noComment);
      const rawType = TypeResolver.resolveExpressionType(parsedExpr, document, lineIdx, indexer);
      if (!rawType) return undefined;
      const position = { line: lineIdx, character: 0 } as vscode.Position;
      const genericParams = TypeResolver.getGenericParametersInScope(document, position, indexer);
      return TypeResolver.resolveGenericParametersInType(rawType, genericParams);
    } catch {
      const literal = inferLiteralType(noComment);
      if (literal) return literal;
      return undefined;
    }
  }

  public static resolveExpressionType(
    expr: Expression,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
    expectedType?: string,
  ): string | undefined {
    // Contextual typing (e.g. array literals against a declared TTList<T>) must
    // not read/write the uncontexted expression cache — the same AST node can
    // be resolved both with and without an expected type in one lint pass.
    if (!expectedType) {
      const cached = getExpressionTypeCache().get(expr);
      if (cached !== undefined) return cached;
    }

    const rawType = TypeResolver.resolveExpressionTypeRaw(
      expr,
      document,
      lineIdx,
      indexer,
      expectedType,
    );
    if (!rawType) {
      if (!expectedType) {
        getExpressionTypeCache().set(expr, undefined);
      }
      return undefined;
    }
    if (!rawType.includes("<")) {
      if (!expectedType) {
        getExpressionTypeCache().set(expr, rawType);
      }
      return rawType;
    }
    const position = { line: lineIdx, character: 0 } as vscode.Position;
    const genericParams = TypeResolver.getGenericParametersInScope(document, position, indexer);
    const resolved = TypeResolver.resolveGenericParametersInType(rawType, genericParams);
    if (!expectedType) {
      getExpressionTypeCache().set(expr, resolved);
    }
    return resolved;
  }

  public static findUnqualifiedCallable(
    methodName: string,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
    argumentTypes?: readonly (string | undefined)[],
    lazyArgs?: {
      readonly arity: number;
      readonly resolve: () => readonly (string | undefined)[];
    },
    callSiteChar?: number,
  ): SymbolInfo | undefined {
    const nameLower = methodName.toLowerCase();
    const arity = argumentTypes?.length ?? lazyArgs?.arity;
    const cachedDoc = LanguageProcessor.getInstance().getOrParse(
      document.uri.toString(),
      document.getText(),
    );
    const callableCacheKey = unqualifiedCallableCacheKey(
      lineIdx,
      methodName,
      arity,
      argumentTypes,
      callSiteChar,
    );
    const cachedCallable = getUnqualifiedCallable(cachedDoc.unit, callableCacheKey);
    if (cachedCallable !== null) {
      return cachedCallable;
    }
    const finishCallable = (symbol: SymbolInfo | undefined): SymbolInfo | undefined => {
      setUnqualifiedCallable(cachedDoc.unit, callableCacheKey, symbol);
      return symbol;
    };

    const isCallable = (symbol: SymbolInfo): boolean =>
      symbol.name.toLowerCase() === nameLower &&
      (symbol.kind === "method" ||
        symbol.kind === "declare_sub" ||
        symbol.kind === "declare_function") &&
      (arity === undefined ||
        isArityMatch(symbol.parameters, arity, symbol.variadicParameters ?? false));
    const select = (symbols: readonly SymbolInfo[]): SymbolInfo | undefined =>
      TypeResolver.pickCallableMember(symbols, arity, indexer, argumentTypes, lazyArgs?.resolve);

    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    const fileCandidates = fileSyms?.symbols.filter(isCallable) ?? [];
    const activeClass = fileSyms
      ? getOrBuildFileLineContext(cachedDoc.unit, fileSyms.symbols).getClass(lineIdx)
      : undefined;
    const activeNamespace = fileSyms
      ? findActiveNamespaceName(fileSyms.symbols, lineIdx)
      : undefined;
    if (activeClass) {
      const classHit = select(
        fileCandidates.filter(
          (symbol) => symbol.containerName?.toLowerCase() === activeClass.name.toLowerCase(),
        ),
      );
      if (classHit) return finishCallable(classHit);
    }

    const localHit = select(
      fileCandidates.filter((symbol) => {
        if (!symbol.containerName) return true;
        return (
          activeNamespace !== undefined && symbol.containerName.toLowerCase() === activeNamespace
        );
      }),
    );
    if (localHit) return finishCallable(localHit);

    const allSymbols = indexer.getSymbolsByName(methodName).filter(isCallable);

    // Partial namespaces: peers in other files that declare the same Namespace are
    // visible without Imports (mirrors findVariableSymbol / the Data7 compiler).
    if (activeNamespace) {
      const sameNamespaceHit = select(
        allSymbols.filter((symbol) => symbol.containerName?.toLowerCase() === activeNamespace),
      );
      if (sameNamespaceHit) return finishCallable(sameNamespaceHit);
    }

    const imported = new Set((fileSyms?.imports ?? []).map((imp) => imp.toLowerCase()));
    const importedHit = select(
      allSymbols.filter(
        (symbol) => symbol.containerName && imported.has(symbol.containerName.toLowerCase()),
      ),
    );
    if (importedHit) return finishCallable(importedHit);

    const systemHit = select(
      SYSTEM_SYMBOLS.filter((symbol) => !symbol.containerName && isCallable(symbol)),
    );
    if (systemHit) return finishCallable(systemHit);

    return finishCallable(select(allSymbols.filter((symbol) => !symbol.containerName)));
  }

  private static resolveExpressionTypeRaw(
    expr: Expression,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
    expectedType?: string,
  ): string | undefined {
    if (!expectedType) {
      const cached = getRawExpressionTypeCache().get(expr);
      if (cached !== undefined) return cached;
    }
    const result = TypeResolver.resolveExpressionTypeRawInternal(
      expr,
      document,
      lineIdx,
      indexer,
      expectedType,
    );
    if (!expectedType) {
      getRawExpressionTypeCache().set(expr, result);
    }
    return result;
  }

  private static resolveExpressionTypeRawInternal(
    expr: Expression,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
    expectedType?: string,
  ): string | undefined {
    return TypeResolver.runWithClassResolutionContext(document, lineIdx, indexer, () =>
      TypeResolver.resolveExpressionTypeRawInternalScoped(
        expr,
        document,
        lineIdx,
        indexer,
        expectedType,
      ),
    );
  }

  private static resolveExpressionTypeRawInternalScoped(
    expr: Expression,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
    expectedType?: string,
  ): string | undefined {
    switch (expr.kind) {
      case "TypeReferenceExpression":
        return typeRefToString(expr.type);
      case "Literal":
        if (expr.value === null) return "Null";
        return inferLiteralType(String(expr.value)) ?? typeofLiteral(expr.value);
      case "TaggedTemplateExpression":
        return "String";
      case "ObjectCreationExpression":
        return typeRefToString(expr.type);
      case "Identifier":
        return TypeResolver.resolveIdentifierType(expr.name, document, lineIdx, indexer);
      case "MemberAccess": {
        const cachedUnit = LanguageProcessor.getInstance().getOrParse(
          document.uri.toString(),
          document.getText(),
        ).unit;
        const contextualMember = TypeResolver.findMemberForReceiverExpression(
          expr.target,
          expr.member,
          document,
          lineIdx,
          indexer,
          0,
        );
        if (contextualMember) {
          const contextualKey = memberAccessCacheKey(lineIdx, undefined, expr.member);
          setMemberAccessType(cachedUnit, contextualKey, contextualMember.type);
          return contextualMember.type;
        }

        const targetType = TypeResolver.resolveMemberAccessTargetType(
          expr.target,
          document,
          lineIdx,
          indexer,
          cachedUnit,
        );
        const cacheKey = memberAccessCacheKey(lineIdx, targetType, expr.member);
        const cachedType = getMemberAccessType(cachedUnit, cacheKey);
        if (cachedType !== null) {
          return cachedType;
        }
        if (!targetType) {
          setMemberAccessType(cachedUnit, cacheKey, undefined);
          return undefined;
        }
        const nativeArrayLengthType = TypeResolver.tryResolveNativeArrayLengthMemberAccess(
          expr,
          document,
          lineIdx,
          indexer,
        );
        if (nativeArrayLengthType) {
          setMemberAccessType(cachedUnit, cacheKey, nativeArrayLengthType);
          return nativeArrayLengthType;
        }
        const memberType = TypeResolver.findMember(targetType, expr.member, indexer, 0);
        if (memberType) {
          // Nested type accessed as Namespace.Type must keep the qualifying container,
          // otherwise homonymous classes (pesquisaPadrao.Pesquisa vs modeloPesquisa.Pesquisa)
          // collapse to the short name and Shared members resolve against the wrong type.
          const resolvedType =
            memberType.kind === "class" ||
            memberType.kind === "structure" ||
            memberType.kind === "enum" ||
            memberType.kind === "delegate"
              ? memberType.containerName
                ? `${memberType.containerName}.${memberType.name}`
                : memberType.name
              : memberType.type;
          setMemberAccessType(cachedUnit, cacheKey, resolvedType);
          return resolvedType;
        }
        setMemberAccessType(cachedUnit, cacheKey, undefined);
        return undefined;
      }
      case "ArrayAccessExpression":
        return TypeResolver.resolveIndexedElementType(expr, document, lineIdx, indexer);
      case "MethodInvocation": {
        if (expr.methodName.toLowerCase() === "typeof" && !expr.callee) {
          return "Boolean";
        }
        if (
          expr.methodName.toLowerCase() === "ctype" &&
          expr.arguments.length === 2 &&
          !expr.callee
        ) {
          const targetArg = expr.arguments[1];
          if (targetArg) {
            return expressionToTypeString(targetArg);
          }
        }
        const lintUnit = LanguageProcessor.getInstance().getOrParse(
          document.uri.toString(),
          document.getText(),
        ).unit;
        const invocationArity = expr.arguments.length;
        if (expr.callee) {
          const qualifiedType = qualifiedTypeNameFromInvocation(expr, indexer);
          if (qualifiedType) return qualifiedType;

          const targetType = TypeResolver.resolveExpressionType(
            expr.callee,
            document,
            lineIdx,
            indexer,
          );
          const calleeCacheKey = methodInvocationReturnCacheKey(
            lineIdx,
            targetType,
            expr.methodName,
            invocationArity,
            expr.loc?.startChar,
          );
          const cachedCalleeReturn = getMethodInvocationReturnType(lintUnit, calleeCacheKey);
          if (cachedCalleeReturn !== null) {
            return cachedCalleeReturn;
          }
          const finishCalleeReturn = (returnType: string | undefined): string | undefined => {
            setMethodInvocationReturnType(lintUnit, calleeCacheKey, returnType);
            return returnType;
          };
          if (!targetType) return finishCalleeReturn(undefined);
          if (expr.methodName.length === 0) {
            const delegateReturnType = resolveDelegateReturnType(targetType, indexer);
            if (delegateReturnType) {
              return finishCalleeReturn(delegateReturnType);
            }
          }
          const member = TypeResolver.resolveInvocationMemberOnType(
            targetType,
            expr.methodName,
            expr,
            document,
            lineIdx,
            indexer,
          );
          if (!member) return finishCalleeReturn(undefined);
          if (
            member.kind === "variable" &&
            member.nativeArrayRank !== undefined &&
            member.nativeArrayRank === invocationArity
          ) {
            return finishCalleeReturn(member.type);
          }
          if (member.kind === "variable" || member.kind === "property") {
            const delegateSym =
              indexer.findSymbolByName(member.type, document.uri.toString()) ??
              lookupSystemByName(member.type).find((s) => s.kind === "delegate");
            if (delegateSym?.kind === "delegate") {
              return finishCalleeReturn(delegateSym.type);
            }
            const indexedElement = TypeResolver.resolveDefaultIndexerElementType(
              member.type,
              invocationArity,
              indexer,
            );
            if (indexedElement) {
              return finishCalleeReturn(indexedElement);
            }
          }
          return finishCalleeReturn(
            refineFunctionalListReturnType(
              targetType,
              expr,
              applyMethodGenericSubstitutions(
                member.type,
                member,
                expr,
                document,
                lineIdx,
                indexer,
              ),
              indexer,
            ),
          );
        }
        const fileSyms = indexer.getFileSymbols(document.uri.toString());
        const activeClass = fileSyms
          ? getOrBuildFileLineContext(lintUnit, fileSyms.symbols).getClass(lineIdx)
          : undefined;
        const unqualifiedCacheKey = methodInvocationReturnCacheKey(
          lineIdx,
          activeClass?.name,
          expr.methodName,
          invocationArity,
          expr.loc?.startChar,
        );
        const cachedUnqualifiedReturn = getMethodInvocationReturnType(
          lintUnit,
          unqualifiedCacheKey,
        );
        if (cachedUnqualifiedReturn !== null) {
          return cachedUnqualifiedReturn;
        }
        const finishUnqualifiedReturn = (returnType: string | undefined): string | undefined => {
          setMethodInvocationReturnType(lintUnit, unqualifiedCacheKey, returnType);
          return returnType;
        };

        // A local variable named the same as the invocation takes priority over global callables.
        // e.g. `Dim retorno As Foo` followed by `retorno()` — the parens are a no-op property-default
        // call on the variable, not an invocation of an unrelated global method called "retorno".
        // With arguments, `list(i)` is the default indexer / TTList GetItem form.
        {
          const position = { line: lineIdx, character: 0 } as vscode.Position;
          const localVarType = TypeResolver.getRawVariableType(
            expr.methodName,
            document,
            position,
            indexer,
          );
          if (localVarType) {
            if (expr.arguments.length === 0) {
              return finishUnqualifiedReturn(localVarType);
            }
            const indexedElement = TypeResolver.resolveDefaultIndexerElementType(
              localVarType,
              invocationArity,
              indexer,
            );
            if (indexedElement) {
              return finishUnqualifiedReturn(indexedElement);
            }
          }
        }

        const position = { line: lineIdx, character: 0 } as vscode.Position;
        const delegateVariableType = TypeResolver.getRawVariableType(
          expr.methodName,
          document,
          position,
          indexer,
        );
        const delegateReturnType = delegateVariableType
          ? resolveDelegateReturnType(delegateVariableType, indexer)
          : undefined;
        if (delegateReturnType) return finishUnqualifiedReturn(delegateReturnType);

        let member: SymbolInfo | undefined;
        if (activeClass) {
          member = TypeResolver.resolveInvocationMemberOnType(
            activeClass.name,
            expr.methodName,
            expr,
            document,
            lineIdx,
            indexer,
          );
        }
        member ??= TypeResolver.findUnqualifiedCallable(
          expr.methodName,
          document,
          lineIdx,
          indexer,
          undefined,
          {
            arity: expr.arguments.length,
            resolve: () =>
              expr.arguments.map((arg) =>
                TypeResolver.resolveExpressionType(arg, document, lineIdx, indexer),
              ),
          },
          expr.loc?.startChar,
        );
        if (!member) {
          const castType =
            TypeResolver.findClassSymbol(expr.methodName, indexer) ??
            lookupSystemClassByName(expr.methodName)[0];
          if (castType) return finishUnqualifiedReturn(castType.name);
        }
        if (member) {
          if (member.kind === "variable" || member.kind === "property") {
            const delegateSym =
              indexer.findSymbolByName(member.type, document.uri.toString()) ??
              lookupSystemByName(member.type).find((s) => s.kind === "delegate");
            if (delegateSym?.kind === "delegate") {
              return finishUnqualifiedReturn(delegateSym.type);
            }
            if (
              member.kind === "variable" &&
              member.nativeArrayRank !== undefined &&
              member.nativeArrayRank === invocationArity
            ) {
              return finishUnqualifiedReturn(member.type);
            }
            const indexedElement = TypeResolver.resolveDefaultIndexerElementType(
              member.type,
              invocationArity,
              indexer,
            );
            if (indexedElement) {
              return finishUnqualifiedReturn(indexedElement);
            }
          }
          return finishUnqualifiedReturn(
            applyMethodGenericSubstitutions(member.type, member, expr, document, lineIdx, indexer),
          );
        }
        return finishUnqualifiedReturn(undefined);
      }
      case "OptionalChainingExpression":
        return TypeResolver.resolveExpressionType(expr.member, document, lineIdx, indexer);
      case "TernaryExpression": {
        const trueType = TypeResolver.resolveExpressionType(
          expr.trueExpr,
          document,
          lineIdx,
          indexer,
        );
        const falseType = TypeResolver.resolveExpressionType(
          expr.falseExpr,
          document,
          lineIdx,
          indexer,
        );
        if (trueType && falseType) {
          return trueType.toLowerCase() === falseType.toLowerCase() ? trueType : "Variant";
        }
        return trueType ?? falseType;
      }
      case "NullCoalescingExpression":
        return (
          TypeResolver.resolveExpressionType(expr.left, document, lineIdx, indexer) ??
          TypeResolver.resolveExpressionType(expr.right, document, lineIdx, indexer)
        );
      case "PipeExpression":
        return TypeResolver.resolveExpressionType(expr.right, document, lineIdx, indexer);
      case "ArrayLiteralExpression":
        return TypeResolver.resolveArrayLiteralType(
          expr.elements,
          document,
          lineIdx,
          indexer,
          expectedType,
        );
      case "SpreadExpression":
        return TypeResolver.resolveSpreadElementType(expr.expression, document, lineIdx, indexer);
      case "ArrowFunctionExpression":
        return typeRefToString(expr.returnType);
      case "BinaryExpression":
        return TypeResolver.resolveBinaryType(expr, document, lineIdx, indexer);
      case "UnaryExpression":
        return TypeResolver.resolveUnaryType(expr, document, lineIdx, indexer);
      default:
        return undefined;
    }
  }

  private static resolveIndexedElementType(
    expr: Extract<Expression, { kind: "ArrayAccessExpression" }>,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const arity = (expr.indices ?? [expr.index]).length;
    if (expr.target.kind === "MemberAccess") {
      const receiverType = TypeResolver.resolveExpressionType(
        expr.target.target,
        document,
        lineIdx,
        indexer,
      );
      if (!receiverType) return undefined;
      const member = TypeResolver.findMember(receiverType, expr.target.member, indexer, arity);
      if (member?.kind === "indexed-property") return member.type;
      if (member?.kind === "variable" && member.nativeArrayRank === arity) return member.type;
      if (member && (member.kind === "variable" || member.kind === "property")) {
        return TypeResolver.resolveDefaultIndexerElementType(member.type, arity, indexer);
      }
      return undefined;
    }

    const targetType = TypeResolver.resolveExpressionType(expr.target, document, lineIdx, indexer);
    if (!targetType) return undefined;
    return TypeResolver.resolveDefaultIndexerElementType(targetType, arity, indexer);
  }

  /**
   * Element type of a default parentheses/bracket indexer on `targetType`
   * (`list(i)` / `list[i]`): TTList/array-sugar element type first, then
   * `Item`/`Take` indexed properties (e.g. StringList).
   *
   * Preferring `resolveListElementType` matters because `TTList<T>` inherits
   * `TTComposerList.Item As TTObject` — that wrapper indexer must not win over `T`.
   */
  public static resolveDefaultIndexerElementType(
    targetType: string,
    arity: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const lowerTargetType = targetType.toLowerCase();
    if (lowerTargetType === "variant") return "Variant";
    if (lowerTargetType === "string" && arity === 1) return "String";

    if (arity === 1) {
      const listElement = TypeResolver.resolveListElementType(targetType, indexer);
      if (listElement) return listElement;
    }

    const item = TypeResolver.findMember(targetType, "Item", indexer, arity);
    if (item?.kind === "indexed-property") return item.type;
    const take = TypeResolver.findMember(targetType, "Take", indexer, arity);
    if (take?.kind === "indexed-property") return take.type;

    const genericElementType = parseGenericTypeReference(targetType)?.args[0];
    if (genericElementType && isListLikeType(targetType) && arity === 1) {
      return genericElementType;
    }
    return undefined;
  }

  private static resolveArrayLiteralType(
    elements: readonly Expression[],
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
    expectedType?: string,
  ): string {
    const expectedElementType = expectedType
      ? TypeResolver.resolveListElementType(expectedType, indexer)
      : undefined;

    if (elements.length === 0) {
      // `Dim items As TTList<T> = []` / `Dim items[] As T = []` — empty literals
      // inherit the declared list type instead of collapsing to TTList<Variant>.
      return expectedElementType !== undefined && expectedType ? expectedType : "TTList<Variant>";
    }

    const elementTypes: string[] = [];
    for (const element of elements) {
      const current =
        element.kind === "SpreadExpression"
          ? TypeResolver.resolveSpreadElementType(element.expression, document, lineIdx, indexer)
          : TypeResolver.resolveExpressionType(element, document, lineIdx, indexer);
      if (!current) continue;
      elementTypes.push(current);
    }

    if (
      expectedType &&
      expectedElementType &&
      elementTypes.length > 0 &&
      elementTypes.every((elementType) =>
        isArgumentAssignableToParameter(elementType, expectedElementType, indexer),
      )
    ) {
      return expectedType;
    }

    let elementType: string | undefined;
    for (const current of elementTypes) {
      if (!elementType) {
        elementType = current;
        continue;
      }
      if (elementType.toLowerCase() !== current.toLowerCase()) {
        elementType = "Variant";
        break;
      }
    }
    return `TTList<${elementType ?? "Variant"}>`;
  }

  private static resolveSpreadElementType(
    expression: Expression,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const spreadType = TypeResolver.resolveExpressionType(expression, document, lineIdx, indexer);
    if (!spreadType) return undefined;
    return (
      parseGenericTypeReference(spreadType)?.args[0] ??
      TypeResolver.findMember(spreadType, "Item", indexer, 1)?.type ??
      TypeResolver.findMember(spreadType, "Take", indexer, 1)?.type
    );
  }

  public static resolveMemberAccessTargetType(
    target: Expression,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
    unit: CompilationUnit,
  ): string | undefined {
    let targetType = TypeResolver.resolveExpressionType(target, document, lineIdx, indexer);
    if (!targetType && target.kind === "Identifier" && target.name === "") {
      const withTarget = getOrBuildWithScopeIndex(unit).getInnermostTarget(lineIdx + 1);
      if (withTarget) {
        targetType = TypeResolver.resolveExpressionType(withTarget, document, lineIdx, indexer);
      }
    }
    return targetType;
  }

  private static resolveIdentifierType(
    name: string,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const cachedDoc = LanguageProcessor.getInstance().getOrParse(
      document.uri.toString(),
      document.getText(),
    );
    let lineCache = getIdentifierTypeByLineCacheHolder().map.get(cachedDoc.unit);
    if (!lineCache) {
      lineCache = new Map();
      getIdentifierTypeByLineCacheHolder().map.set(cachedDoc.unit, lineCache);
    }
    const cacheKey = `${lineIdx}\0${name.toLowerCase()}`;
    if (lineCache.has(cacheKey)) {
      return lineCache.get(cacheKey);
    }
    const resolved = TypeResolver.resolveIdentifierTypeInternal(name, document, lineIdx, indexer);
    lineCache.set(cacheKey, resolved);
    return resolved;
  }

  private static resolveIdentifierTypeInternal(
    name: string,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const lower = name.toLowerCase();
    const position = { line: lineIdx, character: 0 } as vscode.Position;
    const genericParams = TypeResolver.getGenericParametersInScope(document, position, indexer);
    const genericConstraint = genericParams.get(lower);
    if (genericConstraint) return genericConstraint;

    if (lower === "unassigned") return "Unassigned";

    if (lower === "me" || lower === "mybase") {
      const cached = LanguageProcessor.getInstance().getOrParse(
        document.uri.toString(),
        document.getText(),
      );
      const fileSyms = indexer.getFileSymbols(document.uri.toString());
      const activeClass = fileSyms
        ? getOrBuildFileLineContext(cached.unit, fileSyms.symbols).getClass(lineIdx)
        : undefined;
      if (lower === "me") {
        return activeClass?.name;
      }
      return activeClass?.inheritsFrom ?? "TObject";
    }

    const rawLocal = TypeResolver.getRawVariableType(name, document, position, indexer);
    if (rawLocal) {
      return TypeResolver.resolveGenericParametersInType(rawLocal, genericParams);
    }

    // Prefer namespace/class/enum over unrelated variables that share the same name
    // (e.g. namespace `migracoes` vs private field `migracoes As MigracoesCampos` elsewhere).
    const named = indexer.getSymbolsByName(name);
    const typeLike =
      named.find((symbol) => symbol.kind === "namespace") ??
      named.find(
        (symbol) =>
          symbol.kind === "class" || symbol.kind === "structure" || symbol.kind === "enum",
      ) ??
      lookupSystemNamespaceOrClassByName(name)[0];
    if (typeLike) {
      return typeLike.name;
    }

    return undefined;
  }

  private static resolveBinaryType(
    expr: BinaryExpression,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const op = expr.operator.toLowerCase();
    if (["and", "or", "xor"].includes(op)) {
      const left = TypeResolver.resolveExpressionType(expr.left, document, lineIdx, indexer);
      const right = TypeResolver.resolveExpressionType(expr.right, document, lineIdx, indexer);
      const leftLower = left?.toLowerCase();
      const rightLower = right?.toLowerCase();

      const isNumericType = (t: string | undefined): boolean => {
        if (!t) return false;
        return [
          "integer",
          "byte",
          "long",
          "short",
          "single",
          "double",
          "decimal",
          "extended",
          "longint",
          "word",
          "currency",
        ].includes(t);
      };

      if (isNumericType(leftLower) || isNumericType(rightLower)) {
        if (leftLower && isNumericType(leftLower)) return left;
        if (rightLower && isNumericType(rightLower)) return right;
        return "Integer";
      }
      return "Boolean";
    }

    if (
      ["=", "<>", "<", ">", "<=", ">=", "is", "isnot", "like", "andalso", "orelse"].includes(op)
    ) {
      return "Boolean";
    }
    if (op === "&") return "String";
    const left = TypeResolver.resolveExpressionType(expr.left, document, lineIdx, indexer);
    const right = TypeResolver.resolveExpressionType(expr.right, document, lineIdx, indexer);
    if (left && left.toLowerCase() === right?.toLowerCase()) return left;
    return left ?? right;
  }

  private static resolveUnaryType(
    expr: UnaryExpression,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    if (expr.operator.toLowerCase() === "not") {
      const argType = TypeResolver.resolveExpressionType(expr.argument, document, lineIdx, indexer);
      const argLower = argType?.toLowerCase();
      const isNumericType = (t: string | undefined): boolean => {
        if (!t) return false;
        return [
          "integer",
          "byte",
          "long",
          "short",
          "single",
          "double",
          "decimal",
          "extended",
          "longint",
          "word",
          "currency",
        ].includes(t);
      };
      if (isNumericType(argLower)) {
        return argType;
      }
      return "Boolean";
    }
    return TypeResolver.resolveExpressionType(expr.argument, document, lineIdx, indexer);
  }

  /**
   * Returns inherited members for a class, walking the inheritance chain
   * via `inheritsFrom` and de-duplicating cycles.
   */
  public static getInheritedMembers(
    className: string,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo[] {
    const startClass = TypeResolver.findClassSymbol(className, indexer);
    if (!startClass) return [];
    return TypeResolver.getInheritedMembersForClassSymbol(startClass, indexer);
  }

  public static getInheritedMembersForClassSymbol(
    classSymbol: SymbolInfo,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo[] {
    const cacheKey = `inherited:${classIdentityKey(classSymbol)}`;
    if (indexer.inheritedMembersForClassCache.has(cacheKey)) {
      return indexer.inheritedMembersForClassCache.get(cacheKey)!;
    }

    const membersMap = new Map<string, SymbolInfo>();
    const visited = new Set<string>();

    const collect = (currentClass: SymbolInfo): void => {
      const key = classIdentityKey(currentClass);
      if (visited.has(key)) return;
      visited.add(key);

      for (const s of TypeResolver.getOwnMembersForClassSymbol(currentClass, indexer)) {
        const signatureKey = memberSignatureKey(s);
        if (!membersMap.has(signatureKey)) {
          membersMap.set(signatureKey, s);
        }
      }

      const parent = TypeResolver.resolveParent(currentClass);
      const parentClass = parent
        ? TypeResolver.findParentClassSymbol(currentClass, parent, indexer)
        : undefined;
      if (parentClass) collect(parentClass);
    };

    const parent = TypeResolver.resolveParent(classSymbol);
    const parentClass = parent
      ? TypeResolver.findParentClassSymbol(classSymbol, parent, indexer)
      : undefined;
    if (parentClass) collect(parentClass);
    const resolved = Array.from(membersMap.values());
    indexer.inheritedMembersForClassCache.set(cacheKey, resolved, classSymbol.fileUri);
    return resolved;
  }

  /**
   * Resolves the effective parent class name for the given symbol, applying
   * the Data7 implicit "every workspace class inherits from TObject" rule.
   *
   * Returns `undefined` for `TObject` itself (root of the hierarchy) and for
   * non-class symbols, so callers can stop walking the chain.
   *
   * System Library symbols are NOT auto-rooted at TObject: their own
   * `inheritsFrom` is authoritative because primitives (`String`, `Integer`),
   * enums (`TAlign`, `TBorderIcon`) and interfaces declared in
   * `src/system-library/` deliberately omit `Inherits` and must NOT expose
   * `TObject` members.
   *
   * **Public so every other inheritance walker in the codebase reuses the
   * exact same rule** — keeping the implicit-TObject policy in a single
   * place (diagnostics, code-actions, symbol-indexer all delegate here).
   */
  public static resolveParent(symbol: SymbolInfo): string | undefined {
    if (symbol.kind !== "class") return symbol.inheritsFrom;
    if (symbol.inheritsFrom) return symbol.inheritsFrom;
    if (symbol.name.toLowerCase() === "tobject") return undefined;
    if (symbol.fileUri.startsWith("system://")) return undefined;
    return "TObject";
  }

  /**
   * Resolves a single member (property/method/variable/event) on a type, walking
   * the full inheritance chain across both the workspace and the System Library.
   *
   * This is the canonical lookup used by Hover, Definition, SignatureHelp and the
   * Diagnostics linter — previously each had their own slightly-different copy.
   *
   *  - `typeName` accepts simple (`TForm`) and qualified (`Forms.TForm`) names.
   *  - Cycles in `inheritsFrom` are guarded by a `visited` set.
   *  - When the same member exists in both workspace and system library, the
   *    workspace declaration wins (matches existing precedence in providers).
   *
   * Returns `undefined` when the member does not exist anywhere in the chain.
   */
  public static areEnumTypesStrictlyCompatible(
    rhsType: string,
    lhsType: string,
    indexer: WorkspaceSymbolIndexer,
  ): boolean {
    const rhsClass = TypeResolver.findClassSymbol(rhsType, indexer);
    const lhsClass = TypeResolver.findClassSymbol(lhsType, indexer);
    if (!rhsClass || !lhsClass || !isEnumClassSymbol(rhsClass) || !isEnumClassSymbol(lhsClass)) {
      return false;
    }
    return areSameNamedTypeSymbols(rhsClass, lhsClass);
  }

  public static isMethodReferenceDelegateCompatible(
    argument: Expression,
    expectedDelegateType: string,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
    activeClassName?: string,
  ): boolean {
    return TypeResolver.runWithClassResolutionContext(document, lineIdx, indexer, () => {
      const handler = resolveMethodReferenceHandler(
        argument,
        document,
        lineIdx,
        indexer,
        activeClassName,
      );
      if (!handler?.parameters) return false;
      const delegateSig = resolveDelegateCompatibilitySignature(expectedDelegateType, indexer);
      if (!delegateSig) return false;
      if (handler.parameters.length !== delegateSig.parameters.length) return false;
      for (let i = 0; i < delegateSig.parameters.length; i++) {
        const expected = delegateSig.parameters[i];
        const actual = handler.parameters[i];
        if (!expected || !actual) return false;
        if (!isArgumentAssignableToParameter(actual.type, expected.type, indexer)) {
          return false;
        }
      }
      const expectedReturn = delegateSig.returnType;
      if (expectedReturn.toLowerCase() === "void") {
        return handler.type.toLowerCase() === "void";
      }
      return isArgumentAssignableToParameter(handler.type, expectedReturn, indexer);
    });
  }

  public static findDelegateSymbol(
    delegateName: string,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo | undefined {
    return findDelegateSymbolInContext(delegateName, indexer);
  }

  public static findMember(
    typeName: string,
    memberName: string,
    indexer: WorkspaceSymbolIndexer,
    arity?: number,
  ): SymbolInfo | undefined {
    const t0 = LintPipelineProfiler.isEnabled() ? performance.now() : 0;
    // Member lookup is cached per resolved class identity in findMemberOnClassSymbol.
    // Do not cache by bare type name here — homonymous workspace classes (e.g. mod_enum.TEnum
    // vs core_modules/mod_tenum.TEnum) resolve differently depending on ClassResolutionContext.
    const resolved = TypeResolver.findMemberInternal(typeName, memberName, indexer, arity);
    if (resolved) {
      if (LintPipelineProfiler.isEnabled()) {
        recordPerf("TypeResolver.findMember", performance.now() - t0);
      }
      return resolved;
    }

    // Delphi-style `Count` is the conventional name; `TTList<T>` exposes `Length`.
    // Treat Count as an alias so member access and For Each stay consistent.
    if (memberName.toLowerCase() === "count") {
      const length = TypeResolver.findMemberInternal(typeName, "Length", indexer, arity);
      if (length && length.type.toLowerCase() === "integer") {
        const alias: SymbolInfo = { ...length, name: "Count" };
        if (LintPipelineProfiler.isEnabled()) {
          recordPerf("TypeResolver.findMember", performance.now() - t0);
        }
        return alias;
      }
    }

    if (LintPipelineProfiler.isEnabled()) {
      recordPerf("TypeResolver.findMember", performance.now() - t0);
    }
    return undefined;
  }

  public static findMemberOnClassSymbol(
    classSymbol: SymbolInfo,
    memberName: string,
    indexer: WorkspaceSymbolIndexer,
    arity?: number,
  ): SymbolInfo | undefined {
    const cacheKey = `class:${classIdentityKey(classSymbol)}#${memberName.toLowerCase()}#${
      arity ?? "any"
    }`;
    if (indexer.findMemberCache.has(cacheKey)) {
      return indexer.findMemberCache.get(cacheKey);
    }

    const memberLower = memberName.toLowerCase();
    const hits = TypeResolver.getAllMembersForClassSymbol(classSymbol, indexer).filter(
      (symbol) => symbol.name.toLowerCase() === memberLower,
    );
    const nativeArrayHit =
      arity !== undefined
        ? hits.find(
            (symbol) =>
              symbol.kind === "variable" &&
              symbol.nativeArrayRank !== undefined &&
              symbol.nativeArrayRank === arity,
          )
        : undefined;
    const arityHit =
      arity !== undefined
        ? hits.find((symbol) =>
            isArityMatch(symbol.parameters, arity, symbol.variadicParameters ?? false),
          )
        : undefined;
    const hit = nativeArrayHit ?? arityHit ?? hits[0];

    indexer.findMemberCache.set(cacheKey, hit, classSymbol.fileUri);
    return hit;
  }

  public static getAllMembersForClassSymbol(
    classSymbol: SymbolInfo,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo[] {
    const t0 = LintPipelineProfiler.isEnabled() ? performance.now() : 0;
    const cacheKey = `class:${classIdentityKey(classSymbol)}`;
    if (indexer.allMembersForTypeCache.has(cacheKey)) {
      return indexer.allMembersForTypeCache.get(cacheKey)!;
    }

    const membersMap = new Map<string, SymbolInfo>();
    const visited = new Set<string>();

    let current: SymbolInfo | undefined = classSymbol;
    while (current && !visited.has(classIdentityKey(current))) {
      visited.add(classIdentityKey(current));

      for (const s of TypeResolver.getOwnMembersForClassSymbol(current, indexer)) {
        const signatureKey = memberSignatureKey(s);
        if (!membersMap.has(signatureKey)) {
          membersMap.set(signatureKey, s);
        }
      }

      const parent = TypeResolver.resolveParent(current);
      current = parent ? TypeResolver.findParentClassSymbol(current, parent, indexer) : undefined;
    }

    const resolved = Array.from(membersMap.values());
    indexer.allMembersForTypeCache.set(cacheKey, resolved, classSymbol.fileUri);
    if (LintPipelineProfiler.isEnabled()) {
      recordPerf("TypeResolver.getAllMembersForClassSymbol", performance.now() - t0);
    }
    return resolved;
  }

  private static findMemberInternal(
    typeName: string,
    memberName: string,
    indexer: WorkspaceSymbolIndexer,
    arity?: number,
  ): SymbolInfo | undefined {
    const memberLower = memberName.toLowerCase();
    const classSymbol = TypeResolver.findClassSymbol(normalizeGenericTypeName(typeName), indexer);
    if (classSymbol) {
      return TypeResolver.findMemberOnClassSymbol(classSymbol, memberName, indexer, arity);
    }

    const hits = TypeResolver.getAllMembersForType(typeName, indexer).filter(
      (symbol) => symbol.name.toLowerCase() === memberLower,
    );
    if (hits.length === 0) {
      return undefined;
    }
    if (arity !== undefined) {
      const nativeArrayHit = hits.find(
        (symbol) =>
          symbol.kind === "variable" &&
          symbol.nativeArrayRank !== undefined &&
          symbol.nativeArrayRank === arity,
      );
      if (nativeArrayHit) {
        return nativeArrayHit;
      }
      const arityHit = hits.find((symbol) => isArityMatch(symbol.parameters, arity));
      if (arityHit) {
        return arityHit;
      }
    }
    return hits[0];
  }

  public static findMemberForReceiverExpression(
    receiver: Expression,
    memberName: string,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
    arity?: number,
  ): SymbolInfo | undefined {
    if (receiver.kind !== "Identifier") return undefined;
    const lower = receiver.name.toLowerCase();
    if (lower !== "me" && lower !== "mybase") return undefined;

    const cachedDoc = LanguageProcessor.getInstance().getOrParse(
      document.uri.toString(),
      document.getText(),
    );
    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    const activeClass = fileSyms
      ? getOrBuildFileLineContext(cachedDoc.unit, fileSyms.symbols).getClass(lineIdx)
      : undefined;
    if (!activeClass) return undefined;

    if (lower === "me") {
      return TypeResolver.findMemberOnClassSymbol(activeClass, memberName, indexer, arity);
    }

    const parent = TypeResolver.resolveParent(activeClass);
    const parentClass = parent
      ? TypeResolver.findParentClassSymbol(activeClass, parent, indexer)
      : undefined;
    return parentClass
      ? TypeResolver.findMemberOnClassSymbol(parentClass, memberName, indexer, arity)
      : undefined;
  }

  public static tryResolveNativeArrayLengthMemberAccess(
    expr: Extract<Expression, { kind: "MemberAccess" }>,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    if (expr.member.toLowerCase() !== "length") return undefined;
    if (expr.target.kind !== "MemberAccess") return undefined;
    const receiverType = TypeResolver.resolveExpressionType(
      expr.target.target,
      document,
      lineIdx,
      indexer,
    );
    if (!receiverType) return undefined;
    const arrayMember = TypeResolver.findMember(receiverType, expr.target.member, indexer, 0);
    if (arrayMember?.nativeArrayRank !== undefined && arrayMember.nativeArrayRank > 0) {
      return "Integer";
    }
    return undefined;
  }

  public static areDelegateSignaturesCompatible(
    actualType: string,
    expectedType: string,
    indexer: WorkspaceSymbolIndexer,
  ): boolean {
    const actualSig = resolveDelegateCompatibilitySignature(actualType, indexer);
    const expectedSig = resolveDelegateCompatibilitySignature(expectedType, indexer);
    if (!actualSig || !expectedSig) return false;
    if (actualSig.parameters.length !== expectedSig.parameters.length) return false;

    for (let i = 0; i < expectedSig.parameters.length; i++) {
      const actualParam = actualSig.parameters[i];
      const expectedParam = expectedSig.parameters[i];
      if (!actualParam || !expectedParam) return false;
      if (
        !areDelegateParameterTypesCompatible(actualParam.type, expectedParam.type, indexer) &&
        !areDelegateParameterTypesCompatible(expectedParam.type, actualParam.type, indexer)
      ) {
        return false;
      }
    }

    return true;
  }

  private static getOwnMembersForClassSymbol(
    classSymbol: SymbolInfo,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo[] {
    const cacheKey = `own:${classIdentityKey(classSymbol)}`;
    if (indexer.ownMembersForClassCache.has(cacheKey)) {
      return indexer.ownMembersForClassCache.get(cacheKey)!;
    }

    const typeName = classSymbol.name;
    const lookupTypeName = normalizeGenericTypeName(typeName);
    const key = lookupTypeName.toLowerCase();
    const shortName = lookupTypeName.includes(".")
      ? (lookupTypeName.split(".").pop() ?? lookupTypeName).toLowerCase()
      : lookupTypeName.toLowerCase();

    const containerMatch = (containerName: string | undefined): boolean => {
      if (containerName === undefined) return false;
      const c = containerName.toLowerCase();
      return c === key || c === shortName || c.endsWith("." + shortName);
    };

    if (classSymbol.fileUri.startsWith("system://")) {
      const resolved = SYSTEM_SYMBOLS.filter((s) => containerMatch(s.containerName));
      indexer.ownMembersForClassCache.set(cacheKey, resolved, classSymbol.fileUri);
      return resolved;
    }

    const candidates = [
      ...indexer.getSymbolsByContainer(key),
      ...(key !== shortName ? indexer.getSymbolsByContainer(shortName) : []),
    ].filter((s) => containerMatch(s.containerName));

    const sameFileCandidates = candidates.filter((s) =>
      sameFileUri(s.fileUri, classSymbol.fileUri),
    );
    const resolved = sameFileCandidates.length > 0 ? sameFileCandidates : candidates;
    indexer.ownMembersForClassCache.set(cacheKey, resolved, classSymbol.fileUri);
    return resolved;
  }

  public static findMemberWithArgumentTypes(
    typeName: string,
    memberName: string,
    indexer: WorkspaceSymbolIndexer,
    argumentTypes: readonly (string | undefined)[],
  ): SymbolInfo | undefined {
    const memberLower = memberName.toLowerCase();
    const candidates = TypeResolver.getAllMembersForType(typeName, indexer).filter(
      (symbol) =>
        symbol.name.toLowerCase() === memberLower &&
        isArityMatch(symbol.parameters, argumentTypes.length),
    );
    return TypeResolver.pickCallableMember(
      candidates,
      argumentTypes.length,
      indexer,
      argumentTypes,
    );
  }

  private static resolveInvocationMemberOnType(
    typeName: string,
    methodName: string,
    expr: Extract<Expression, { kind: "MethodInvocation" }>,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo | undefined {
    const memberLower = methodName.toLowerCase();
    const candidates = TypeResolver.getAllMembersForType(typeName, indexer).filter(
      (symbol) => symbol.name.toLowerCase() === memberLower,
    );
    return (
      TypeResolver.pickCallableMember(candidates, expr.arguments.length, indexer, undefined, () =>
        expr.arguments.map((arg) =>
          TypeResolver.resolveExpressionType(arg, document, lineIdx, indexer),
        ),
      ) ?? TypeResolver.findMember(typeName, methodName, indexer, expr.arguments.length)
    );
  }

  private static pickCallableMember(
    symbols: readonly SymbolInfo[],
    arity: number | undefined,
    indexer: WorkspaceSymbolIndexer,
    argumentTypes?: readonly (string | undefined)[],
    resolveArgumentTypes?: () => readonly (string | undefined)[],
  ): SymbolInfo | undefined {
    if (symbols.length === 0) {
      return undefined;
    }
    const filtered =
      arity === undefined
        ? symbols
        : symbols.filter((symbol) =>
            isArityMatch(symbol.parameters, arity, symbol.variadicParameters ?? false),
          );
    if (filtered.length === 0) {
      return undefined;
    }
    if (filtered.length === 1) {
      return filtered[0];
    }
    const resolvedTypes = argumentTypes ?? resolveArgumentTypes?.();
    if (!resolvedTypes) {
      return filtered[0];
    }
    return (
      filtered.find((candidate) =>
        parametersAcceptArguments(candidate.parameters ?? [], resolvedTypes, indexer),
      ) ?? filtered[0]
    );
  }

  /**
   * Returns all members (own + inherited) for a given type name. Mirrors the
   * shape used by completion and hover providers.
   */
  // public static getAllMembersForType(
  //   typeName: string,
  //   indexer: WorkspaceSymbolIndexer,
  // ): SymbolInfo[] {
  //   const members: SymbolInfo[] = [];
  //   const visited = new Set<string>();
  //   typeName = normalizeGenericTypeName(typeName);

  //   const collect = (currentTypeName: string): void => {
  //     const key = currentTypeName.toLowerCase();
  //     if (visited.has(key)) return;
  //     visited.add(key);

  //     const classSymbol = TypeResolver.findClassSymbol(currentTypeName, indexer);
  //     if (!classSymbol) return;

  //     const shortName = currentTypeName.includes(".")
  //       ? (currentTypeName.split(".").pop() ?? currentTypeName).toLowerCase()
  //       : currentTypeName.toLowerCase();

  //     const containerMatch = (containerName: string | undefined): boolean => {
  //       if (containerName === undefined) return false;
  //       const c = containerName.toLowerCase();
  //       return c === key || c === shortName || c.endsWith("." + shortName);
  //     };

  //     members.push(...SYSTEM_SYMBOLS.filter((s) => containerMatch(s.containerName)));
  //     members.push(...indexer.getAllSymbols().filter((s) => containerMatch(s.containerName)));

  //     const parent = TypeResolver.resolveParent(classSymbol);
  //     if (parent) collect(parent);
  //   };

  //   collect(typeName);
  //   return members;
  // }

  public static getAllMembersForType(
    typeName: string,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo[] {
    const cacheKey = typeName.toLowerCase();
    if (indexer.allMembersForTypeCache.has(cacheKey)) {
      return indexer.allMembersForTypeCache.get(cacheKey)!;
    }

    // Usamos um Map para evitar a duplicação na cadeia de herança.
    const membersMap = new Map<string, SymbolInfo>();
    const visited = new Set<string>();

    const collect = (currentTypeName: string): void => {
      const lookupTypeName = normalizeGenericTypeName(currentTypeName);
      const key = lookupTypeName.toLowerCase();
      if (visited.has(key)) return;
      visited.add(key);

      const addSymbol = (s: SymbolInfo): void => {
        const namePart = s.name.toLowerCase();

        // Extrai a impressão digital da sobrecarga usando os tipos dos parâmetros.
        // Ex: para Take(pIndex As Integer), paramsPart será "integer".
        // Ex: para Take(), paramsPart será "".
        let paramsPart = "";
        if (s.parameters && s.parameters.length > 0) {
          paramsPart = s.parameters.map((p) => p.type.toLowerCase()).join(",");
        }

        // A chave gerada será algo como "take#" ou "take#integer".
        const signatureKey = `${namePart}#${paramsPart}`;

        // Se a assinatura (nome + tipos) ainda não existir, adicionamos.
        // Como o fluxo vai da classe atual (filho) para a classe base (pai),
        // a implementação do filho sempre ganha se houver override.
        if (!membersMap.has(signatureKey)) {
          membersMap.set(signatureKey, s);
        }
      };

      const shortName = lookupTypeName.includes(".")
        ? (lookupTypeName.split(".").pop() ?? lookupTypeName).toLowerCase()
        : lookupTypeName.toLowerCase();

      const containerMatch = (containerName: string | undefined): boolean => {
        if (containerName === undefined) return false;
        const c = containerName.toLowerCase();
        return c === key || c === shortName || c.endsWith("." + shortName);
      };

      const candidates = [
        ...indexer.getSymbolsByContainer(key),
        ...(key !== shortName ? indexer.getSymbolsByContainer(shortName) : []),
      ];
      candidates.filter((s) => containerMatch(s.containerName)).forEach(addSymbol);

      SYSTEM_SYMBOLS.filter((s) => containerMatch(s.containerName)).forEach(addSymbol);

      getGenericTemplateMembersForType(currentTypeName, indexer).forEach(addSymbol);

      const classSymbol = TypeResolver.findClassSymbol(lookupTypeName, indexer);
      const parent = classSymbol
        ? TypeResolver.resolveParent(classSymbol)
        : getGenericTemplateParentForType(currentTypeName, indexer);
      if (parent) {
        const parentClass = classSymbol
          ? TypeResolver.findParentClassSymbol(classSymbol, parent, indexer)
          : undefined;
        collect(
          parentClass
            ? parentClass.containerName
              ? `${parentClass.containerName}.${parentClass.name}`
              : parentClass.name
            : parent,
        );
      }
    };

    collect(typeName);
    const resolved = Array.from(membersMap.values());
    // Resolved by walking a whole inheritance chain, so no single file owns it.
    indexer.allMembersForTypeCache.set(cacheKey, resolved);
    return resolved;
  }

  /**
   * Convenience wrapper over {@link getNonNullVariablesAt} so consumers
   * (Code Actions, future `?.` / `??` linter rules, null-deref diagnostic)
   * can ask "is `varName` definitely non-NULL at this position?" without
   * touching `flow-analyzer` directly.
   *
   * Returns `true` only when the flow analyser has propagated a `NotNull`
   * fact reaching `position.line` for `varName` (case-insensitive). When
   * the analyser is silent, the function returns `false` — callers must
   * treat that as "unknown / cannot prove non-null" and act conservatively.
   */
  public static isDefinitelyNotNull(
    varName: string,
    document: vscode.TextDocument,
    position: vscode.Position,
  ): boolean {
    const facts = getNonNullVariablesAt(document.getText(), position.line);
    return facts.has(varName.toLowerCase());
  }

  /**
   * Parses a `<T As Constraint, U>` declaration into an array of parameter names and constraints.
   * Generic parameters without an explicit `As` constraint remain open (`T -> T`).
   */
  public static parseGenericDeclaration(lineText: string): { name: string; constraint: string }[] {
    const openBracket = lineText.indexOf("<");
    const closeBracket = lineText.lastIndexOf(">");
    if (openBracket === -1 || closeBracket === -1 || closeBracket <= openBracket) {
      return [];
    }
    const raw = lineText.substring(openBracket + 1, closeBracket);
    return raw
      .split(",")
      .map((p) => {
        const parts = p.trim().split(/\s+As\s+/i);
        const name = parts[0]?.trim() ?? "";
        const constraint = parts[1]?.trim() ?? name;
        return { name, constraint };
      })
      .filter((item) => item.name.length > 0);
  }

  /**
   * Identifies all generic parameters currently in scope at the given position,
   * resolving them to their constraints.
   */
  public static getGenericParametersInScope(
    document: vscode.TextDocument,
    position: vscode.Position,
    indexer: WorkspaceSymbolIndexer,
  ): Map<string, string> {
    const cached = LanguageProcessor.getInstance().getOrParse(
      document.uri.toString(),
      document.getText(),
    );
    const unit = cached.unit;

    let fileCache = getGenericParamsCache().get(unit);
    if (!fileCache) {
      fileCache = new Map();
      getGenericParamsCache().set(unit, fileCache);
    }

    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    if (!fileSyms) return new Map();

    const lineContext = getOrBuildFileLineContext(unit, fileSyms.symbols);
    const currentMethod = lineContext.getMethod(position.line);
    const currentClass = lineContext.getClass(position.line);

    const scopeKey = `${currentClass?.name ?? ""}-${currentMethod?.name ?? ""}`;
    const cachedParams = fileCache.get(scopeKey);
    if (cachedParams) {
      return cachedParams;
    }

    const params = new Map<string, string>();
    if (currentMethod) {
      try {
        const methodLine = document.lineAt(currentMethod.range.startLine).text;
        const parsed = TypeResolver.parseGenericDeclaration(methodLine);
        for (const p of parsed) {
          params.set(p.name.toLowerCase(), p.constraint);
        }
      } catch {
        /* ignore line-range or empty text errors */
      }
    }

    if (currentClass) {
      try {
        const classLine = document.lineAt(currentClass.range.startLine).text;
        const parsed = TypeResolver.parseGenericDeclaration(classLine);
        for (const p of parsed) {
          if (!params.has(p.name.toLowerCase())) {
            params.set(p.name.toLowerCase(), p.constraint);
          }
        }
      } catch {
        /* ignore line-range or empty text errors */
      }
    }

    fileCache.set(scopeKey, params);
    return params;
  }

  /**
   * Resolves references to generic parameter names within a type string to their constraints.
   * E.g. "T" -> "BaseItem", "TList<T>" -> "TList<BaseItem>".
   */
  public static resolveGenericParametersInType(
    typeName: string,
    genericParams: Map<string, string>,
  ): string {
    if (!typeName || genericParams.size === 0) return typeName;

    let current = typeName;
    for (const [paramName, constraint] of genericParams.entries()) {
      const escaped = paramName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "gi");
      current = current.replace(regex, constraint);
    }
    return current;
  }

  public static isSubclassOf(
    subClassName: string,
    baseClassName: string,
    indexer: WorkspaceSymbolIndexer,
  ): boolean {
    let current = normalizeGenericTypeName(subClassName);
    const targetSymbol =
      TypeResolver.findClassSymbol(baseClassName, indexer) ??
      findGenericBaseSymbol(genericBaseNameOf(baseClassName), indexer);
    const targetKeys = buildClassComparisonKeys(baseClassName, targetSymbol);

    const visited = new Set<string>();
    while (current) {
      const cls =
        TypeResolver.findClassSymbol(current, indexer) ??
        findGenericBaseSymbol(genericBaseNameOf(current), indexer);
      if (!cls) break;

      const visitKey = classSymbolKey(cls);
      if (visited.has(visitKey)) break;
      visited.add(visitKey);

      if (setsIntersect(buildClassComparisonKeys(current, cls), targetKeys)) return true;
      const parent = TypeResolver.resolveParent(cls);
      if (!parent) {
        current = "";
        continue;
      }
      const parentClass = TypeResolver.findParentClassSymbol(cls, parent, indexer);
      current = parentClass
        ? normalizeGenericTypeName(
            parentClass.containerName
              ? `${parentClass.containerName}.${parentClass.name}`
              : parentClass.name,
          )
        : normalizeGenericTypeName(parent);
    }
    return false;
  }

  public static resolveListElementType(
    typeName: string,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const parsed = parseGenericTypeReference(typeName);
    if (parsed?.base.toLowerCase() === "ttlist" && parsed.args.length > 0) {
      return parsed.args[0];
    }
    const lower = typeName.toLowerCase();
    if (lower.startsWith("ttlist_")) {
      return typeName.slice("TTList_".length);
    }
    const classSymbol = TypeResolver.findClassSymbol(typeName, indexer);
    const parent = classSymbol ? TypeResolver.resolveParent(classSymbol) : undefined;
    return parent ? TypeResolver.resolveListElementType(parent, indexer) : undefined;
  }
}

function isExternalTypeAcceptedByDeclaration(
  document: vscode.TextDocument,
  typeName: string,
  declarationLine: number,
  usageLine: number,
): boolean {
  const text = document.getText();
  const directives = extractExternalTypeDirectives(text);
  if (isExternalTypeAllowedByDirectives(directives, typeName, declarationLine)) return true;

  const blockDirectives = directives.filter((directive) => directive.scope === "block");
  if (blockDirectives.length === 0) return false;

  const cached = LanguageProcessor.getInstance().getOrParse(document.uri.toString(), text);
  const scopes = collectExternalTypeScopes(cached.unit);
  return scopes.some(
    (scope) =>
      isExternalTypeAllowedByDirectives(blockDirectives, typeName, usageLine, scope) &&
      declarationLine >= scope.startLine &&
      declarationLine <= scope.endLine,
  );
}

function collectExternalTypeScopes(node: Node): ExternalTypeActiveScope[] {
  const scopes: ExternalTypeActiveScope[] = [];

  const visit = (current: Node): void => {
    const scope = externalTypeScopeFromNode(current);
    if (scope) scopes.push(scope);

    for (const child of getNodeChildren(current)) {
      visit(child);
    }
  };

  visit(node);
  return scopes;
}

function externalTypeScopeFromNode(node: Node): ExternalTypeActiveScope | undefined {
  if (
    node.kind !== "ClassDeclaration" &&
    node.kind !== "MethodDeclaration" &&
    node.kind !== "PropertyDeclaration"
  ) {
    return undefined;
  }
  if (!node.loc) return undefined;
  return {
    startLine: Math.max(0, node.loc.startLine - 1),
    endLine: Math.max(0, node.loc.endLine - 1),
  };
}

function getNodeChildren(node: Node): readonly Node[] {
  switch (node.kind) {
    case "CompilationUnit":
      return node.members;
    case "NamespaceDeclaration":
      return node.members;
    case "ClassDeclaration":
      return node.members;
    case "MethodDeclaration":
      return node.body;
    case "PropertyDeclaration":
      return [node.getter, node.setter].filter(
        (child): child is NonNullable<typeof child> => child !== undefined,
      );
    default:
      return [];
  }
}

function classSymbolKey(symbol: SymbolInfo): string {
  const name = symbol.name.toLowerCase();
  const container = symbol.containerName?.toLowerCase();
  return container ? `${container}.${name}` : name;
}

function classIdentityKey(symbol: SymbolInfo): string {
  return `${normalizeFileUriForComparison(symbol.fileUri)}#${classSymbolKey(symbol)}#${
    symbol.range.startLine
  }`;
}

function memberSignatureKey(symbol: SymbolInfo): string {
  const namePart = symbol.name.toLowerCase();
  const paramsPart =
    symbol.parameters && symbol.parameters.length > 0
      ? symbol.parameters.map((p) => p.type.toLowerCase()).join(",")
      : "";
  return `${namePart}#${paramsPart}`;
}

function sameFileUri(left: string, right: string): boolean {
  return normalizeFileUriForComparison(left) === normalizeFileUriForComparison(right);
}

function isExtensionCoreModuleUri(fileUri: string): boolean {
  const normalized = normalizeFileUriForComparison(fileUri);
  return (
    normalized.includes("/data7_modules/core_modules/") || normalized.includes("/core_modules/mod_")
  );
}

function isSymbolReachableFromContext(
  symbol: SymbolInfo,
  context: ClassResolutionContext,
): boolean {
  if (sameFileUri(symbol.fileUri, context.fileUri)) return true;
  if (
    context.namespace &&
    symbol.containerName?.toLowerCase() === context.namespace.toLowerCase()
  ) {
    return true;
  }
  return context.imports.some(
    (imported) => symbol.containerName?.toLowerCase() === imported.toLowerCase(),
  );
}

function pickWorkspaceClassByContext(
  candidates: readonly SymbolInfo[],
  context: ClassResolutionContext | undefined,
): SymbolInfo | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) {
    if (!context || isSymbolReachableFromContext(candidates[0]!, context)) {
      return candidates[0];
    }
    return undefined;
  }
  if (!context) {
    return preferCanonicalHomonymClass(candidates, candidates[0]?.name ?? "") ?? candidates[0];
  }

  const reachable = candidates.filter((symbol) => isSymbolReachableFromContext(symbol, context));
  const pool = reachable.length > 0 ? reachable : candidates;

  const sameFile = pool.filter((symbol) => sameFileUri(symbol.fileUri, context.fileUri));
  if (sameFile.length === 1) return sameFile[0];
  if (sameFile.length > 1 && context.namespace) {
    const sameFileAndNamespace = sameFile.find(
      (symbol) => symbol.containerName?.toLowerCase() === context.namespace?.toLowerCase(),
    );
    if (sameFileAndNamespace) return sameFileAndNamespace;
    return sameFile[0];
  }

  if (context.namespace) {
    const sameNamespace = pool.find(
      (symbol) => symbol.containerName?.toLowerCase() === context.namespace?.toLowerCase(),
    );
    if (sameNamespace) return sameNamespace;
  }

  for (const imported of context.imports) {
    const importedLower = imported.toLowerCase();
    const match = pool.find((symbol) => symbol.containerName?.toLowerCase() === importedLower);
    if (match) return match;
  }

  if (reachable.length === 0) return undefined;

  const preferredHomonym = preferCanonicalHomonymClass(pool, pool[0]?.name ?? "");
  if (preferredHomonym) return preferredHomonym;

  const workspaceCandidates = pool.filter((symbol) => !isExtensionCoreModuleUri(symbol.fileUri));
  if (workspaceCandidates.length > 0) return workspaceCandidates[0];

  return pool[0];
}

/**
 * When several workspace classes share a simple name, pick the canonical one
 * for known core bases. `TEnum` must resolve to `mod_tenum.TEnum` (not the
 * legacy `mod_enum.TEnum`) so Enun / hand-written rich enums see AsString/IsValue.
 */
function preferCanonicalHomonymClass(
  candidates: readonly SymbolInfo[],
  simpleName: string,
): SymbolInfo | undefined {
  if (candidates.length < 2) return undefined;
  const nameLower = simpleName.toLowerCase();
  if (nameLower === "tenum") {
    const modTenum = candidates.find(
      (symbol) => symbol.containerName?.toLowerCase() === "mod_tenum",
    );
    if (modTenum) return modTenum;
  }
  const core = candidates.find((symbol) => isExtensionCoreModuleUri(symbol.fileUri));
  return core;
}

function isCallableMethodSymbol(symbol: SymbolInfo | undefined): symbol is SymbolInfo {
  return (
    symbol?.kind === "method" ||
    symbol?.kind === "declare_sub" ||
    symbol?.kind === "declare_function"
  );
}

function resolveMethodReferenceHandler(
  argument: Expression,
  document: vscode.TextDocument,
  lineIdx: number,
  indexer: WorkspaceSymbolIndexer,
  activeClassName?: string,
): SymbolInfo | undefined {
  if (argument.kind === "Identifier") {
    if (activeClassName) {
      const classHit = TypeResolver.findMember(activeClassName, argument.name, indexer);
      if (isCallableMethodSymbol(classHit)) return classHit;
    }
    const unqualified = TypeResolver.findUnqualifiedCallable(
      argument.name,
      document,
      lineIdx,
      indexer,
    );
    return isCallableMethodSymbol(unqualified) ? unqualified : undefined;
  }
  if (argument.kind !== "MemberAccess") return undefined;

  let receiverType = TypeResolver.resolveExpressionType(
    argument.target,
    document,
    lineIdx,
    indexer,
  );
  if (
    !receiverType &&
    argument.target.kind === "Identifier" &&
    argument.target.name.toLowerCase() === "me" &&
    activeClassName
  ) {
    receiverType = activeClassName;
  }
  if (!receiverType) return undefined;
  const hit = TypeResolver.findMember(receiverType, argument.member, indexer);
  return isCallableMethodSymbol(hit) ? hit : undefined;
}

function findDelegateSymbolInContext(
  delegateName: string,
  indexer: WorkspaceSymbolIndexer,
): SymbolInfo | undefined {
  const parsed = parseGenericTypeReference(delegateName);
  const simpleName = parsed?.base ?? delegateName;
  const wsDelegates = indexer
    .getSymbolsByName(simpleName)
    .filter((symbol) => symbol.kind === "delegate" && indexer.isFileValid(symbol.fileUri));
  if (wsDelegates.length > 0) {
    const preferred = pickWorkspaceClassByContext(
      wsDelegates,
      classResolutionContextHolder.context,
    );
    if (preferred) return preferred;
    if (wsDelegates.length === 1) return wsDelegates[0];
  }
  return (
    lookupSystemByName(simpleName).find((symbol) => symbol.kind === "delegate") ??
    indexer.getSymbolsByName(simpleName).find((symbol) => symbol.kind === "delegate")
  );
}

function normalizeFileUriForComparison(fileUri: string): string {
  try {
    return decodeURIComponent(fileUri).replace(/\\/g, "/").toLowerCase();
  } catch {
    return fileUri.replace(/\\/g, "/").toLowerCase();
  }
}

function buildClassComparisonKeys(
  requestedTypeName: string,
  resolvedSymbol: SymbolInfo | undefined,
): Set<string> {
  const keys = new Set<string>();
  const normalized = normalizeGenericTypeName(requestedTypeName).toLowerCase();
  if (normalized.length > 0) keys.add(normalized);
  if (resolvedSymbol) keys.add(classSymbolKey(resolvedSymbol));
  return keys;
}

function setsIntersect(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function getGenericTemplateMembersForType(
  typeName: string,
  indexer: WorkspaceSymbolIndexer,
): SymbolInfo[] {
  const parsed =
    parseGenericTypeReference(typeName) ?? parseFlatGenericTypeReference(typeName, indexer);
  if (!parsed) return [];

  const template = indexer
    .getSymbolsByName(parsed.base)
    .find(
      (s) =>
        (s.kind === "class" || s.kind === "delegate" || s.kind === "method") &&
        s.genericTypeParameters?.length === parsed.args.length,
    );
  if (!template?.genericTypeParameters) return [];

  const substitutions = new Map<string, string>();
  for (let i = 0; i < template.genericTypeParameters.length; i++) {
    const param = template.genericTypeParameters[i];
    const arg = parsed.args[i];
    if (!param || !arg) return [];
    substitutions.set(param.toLowerCase(), normalizeGenericTypeName(arg));
  }

  const templateContainer = template.name.toLowerCase();
  const concreteContainer = normalizeGenericTypeName(typeName);
  return indexer.getSymbolsByContainer(templateContainer).map((s) => {
    const clone: SymbolInfo = {
      ...s,
      type: substituteGenericParametersInType(s.type, substitutions),
      containerName: concreteContainer,
    };
    if (s.parameters !== undefined) {
      clone.parameters = s.parameters.map((p) => ({
        ...p,
        type: substituteGenericParametersInType(p.type, substitutions),
      }));
    }
    if (s.overloads !== undefined) {
      clone.overloads = s.overloads.map((overload) =>
        overload.map((p) => ({
          ...p,
          type: substituteGenericParametersInType(p.type, substitutions),
        })),
      );
    }
    return clone;
  });
}

function parseFlatGenericTypeReference(
  typeName: string,
  indexer: WorkspaceSymbolIndexer,
): { base: string; args: string[] } | undefined {
  const trimmed = typeName.trim();
  const underscore = trimmed.indexOf("_");
  if (underscore <= 0) return undefined;

  const lower = trimmed.toLowerCase();
  const candidates = indexer
    .getAllSymbols()
    .filter(
      (s) =>
        (s.kind === "class" || s.kind === "delegate" || s.kind === "method") &&
        (s.genericTypeParameters?.length ?? 0) > 0 &&
        lower.startsWith(`${s.name.toLowerCase()}_`),
    )
    .sort((left, right) => right.name.length - left.name.length);

  for (const candidate of candidates) {
    const paramCount = candidate.genericTypeParameters?.length ?? 0;
    const rest = trimmed.slice(candidate.name.length + 1);
    if (!rest) continue;
    if (paramCount === 1) {
      return { base: candidate.name, args: [rest] };
    }
    const parts = rest.split("_").filter(Boolean);
    if (parts.length === paramCount) {
      return { base: candidate.name, args: parts };
    }
  }

  return undefined;
}

function getGenericTemplateParentForType(
  typeName: string,
  indexer: WorkspaceSymbolIndexer,
): string | undefined {
  const parsed = parseGenericTypeReference(typeName);
  if (!parsed) return undefined;

  const template = indexer
    .getSymbolsByName(parsed.base)
    .find((s) => s.kind === "class" && s.genericTypeParameters?.length === parsed.args.length);
  if (!template?.genericTypeParameters) return undefined;

  const parent = TypeResolver.resolveParent(template);
  if (!parent) return undefined;

  const substitutions = new Map<string, string>();
  for (let i = 0; i < template.genericTypeParameters.length; i++) {
    const param = template.genericTypeParameters[i];
    const arg = parsed.args[i];
    if (!param || !arg) return parent;
    substitutions.set(param.toLowerCase(), arg);
  }

  return substituteGenericParametersPreservingSyntax(parent, substitutions);
}

function substituteGenericParametersInType(
  typeName: string,
  substitutions: ReadonlyMap<string, string>,
): string {
  let current = typeName;
  for (const [param, concrete] of substitutions.entries()) {
    const escaped = param.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    current = current.replace(new RegExp(`\\b${escaped}\\b`, "gi"), concrete);
  }
  return normalizeGenericTypeName(current);
}

function substituteGenericParametersPreservingSyntax(
  typeName: string,
  substitutions: ReadonlyMap<string, string>,
): string {
  let current = typeName;
  for (const [param, concrete] of substitutions.entries()) {
    const escaped = param.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    current = current.replace(new RegExp(`\\b${escaped}\\b`, "gi"), concrete);
  }
  return current;
}

function parseGenericTypeReference(typeName: string): { base: string; args: string[] } | undefined {
  const trimmed = typeName.trim();
  const lt = trimmed.indexOf("<");
  if (lt <= 0 || !trimmed.endsWith(">")) return undefined;
  const base = trimmed.slice(0, lt).trim();
  const inner = trimmed.slice(lt + 1, -1);
  if (!base || !inner.trim()) return undefined;

  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "<") {
      depth++;
    } else if (ch === ">") {
      depth--;
    } else if (ch === "," && depth === 0) {
      args.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(inner.slice(start).trim());
  if (args.some((arg) => arg.length === 0)) return undefined;
  return { base, args };
}

function isListLikeType(typeName: string): boolean {
  const parsed = parseGenericTypeReference(typeName);
  if (!parsed) return false;
  const base = parsed.base.includes(".")
    ? (parsed.base.split(".").pop() ?? parsed.base)
    : parsed.base;
  return base.toLowerCase() === "ttlist" || base.toLowerCase() === "ttobjectlist";
}

/**
 * Strips a trailing `' ...` line comment from `expr`, respecting `"..."` and
 * `$"..."` string literals (so a literal `'` inside a string is not treated
 * as a comment start). Returns the trimmed left side.
 */
function stripTrailingComment(expr: string): string {
  let inString = false;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '"') {
      if (inString && expr[i + 1] === '"') {
        i++;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (!inString && c === "'") {
      return expr.slice(0, i);
    }
  }
  return expr;
}

/**
 * Translates a generic type reference (`TList<Product>`,
 * `Collections.TPair<Integer, String>`, `TList<TList<Integer>>`) into
 * the monomorphic flat name the symbol indexer registers
 * (`TList_Product`, `Collections.TPair_Integer_String`,
 * `TList_TList_Integer`).
 *
 * Nested usages are flattened iteratively from the inside out — same
 * algorithm `analyzeGenericsPass` uses — so the resulting name matches
 * what {@link import("./symbol-indexer").WorkspaceSymbolIndexer} stores
 * for the synthetic flat class.
 *
 * Inputs without a `<…>` suffix (or already-flat names like
 * `TList_Product`) are returned unchanged.
 */
function normalizeGenericTypeName(typeName: string): string {
  if (typeName.length === 0 || !typeName.includes("<")) return typeName;
  // `findInnerMostGenericUsage` only inspects identifiers when their
  // base name appears in the provided template-name set. To stay
  // resolver-context-free, we pass an `acceptAll` predicate by treating
  // every PascalCase identifier as a potential template — same heuristic
  // the indexer uses to surface flat symbols.
  let current = typeName.trim();
  for (let iter = 0; iter < 50; iter++) {
    const hit = findInnerMostGenericUsage(current, ACCEPT_ALL_PASCAL_NAMES);
    if (hit === null) break;
    const flat = flatNameOf(hit.base, hit.typeArgs);
    current = current.slice(0, hit.start) + flat + current.slice(hit.end);
  }
  return current;
}

/**
 * Sentinel set whose `has()` always returns `true`. We pass it to
 * {@link findInnerMostGenericUsage} when normalising a type reference
 * because the resolver does not know the workspace's registered
 * template names at the call site — any PascalCase identifier followed
 * by `<…>` is treated as a candidate.
 *
 * Implemented as a subclass of `Set` so it satisfies the `Set<string>`
 * shape that {@link findInnerMostGenericUsage} expects; only `has()` is
 * overridden, which is the single method the analyzer calls.
 */
class AcceptAllSet extends Set<string> {
  public override has(_value: string): boolean {
    return true;
  }
}
const ACCEPT_ALL_PASCAL_NAMES: ReadonlySet<string> = new AcceptAllSet();

function genericBaseNameOf(typeName: string): string | undefined {
  const lt = typeName.indexOf("<");
  if (lt === -1) return undefined;
  return typeName.slice(0, lt).trim();
}

function findGenericBaseSymbol(
  genericBaseName: string | undefined,
  indexer: WorkspaceSymbolIndexer,
): SymbolInfo | undefined {
  if (!genericBaseName) return undefined;
  let symbol: SymbolInfo | undefined;
  if (genericBaseName.includes(".")) {
    const lastDot = genericBaseName.lastIndexOf(".");
    const namePart = genericBaseName.substring(lastDot + 1);
    const nsPart = genericBaseName.substring(0, lastDot);
    symbol =
      lookupSystemClassByName(namePart).find(
        (s) => s.containerName?.toLowerCase() === nsPart.toLowerCase(),
      ) ?? indexer.findSymbolByName(namePart);
  } else {
    symbol =
      lookupSystemClassByName(genericBaseName)[0] ?? indexer.findSymbolByName(genericBaseName);
  }
  if (
    symbol &&
    (symbol.kind === "class" ||
      symbol.kind === "structure" ||
      symbol.kind === "delegate" ||
      symbol.kind === "enum")
  ) {
    return symbol;
  }
  return undefined;
}

function isVariableLikeSymbol(symbol: SymbolInfo): boolean {
  return (
    symbol.kind === "variable" || symbol.kind === "property" || symbol.kind === "indexed-property"
  );
}

/** True when `containerName` names a namespace (not a class/structure that happens to share the name). */
function isNamespaceContainer(containerName: string, indexer: WorkspaceSymbolIndexer): boolean {
  const lower = containerName.toLowerCase();
  if (indexer.getSymbolsByName(containerName).some((symbol) => symbol.kind === "namespace")) {
    return true;
  }
  return lookupSystemByName(containerName).some(
    (symbol) => symbol.kind === "namespace" && symbol.name.toLowerCase() === lower,
  );
}

function findActiveNamespaceName(
  symbols: readonly SymbolInfo[],
  lineIdx: number,
): string | undefined {
  const namespace = symbols.find(
    (s) => s.kind === "namespace" && lineIdx >= s.range.startLine && lineIdx <= s.range.endLine,
  );
  return namespace?.name.toLowerCase();
}

function isPrincipalFileUri(fileUri: string): boolean {
  return /(?:^|[/\\])principal\.bas$/i.test(fileUri);
}

function isArityMatch(
  parameters:
    | readonly { readonly isOptional?: boolean; readonly defaultValue?: string }[]
    | undefined,
  arity: number,
  variadicParameters = false,
): boolean {
  if (!parameters || parameters.length === 0) {
    return arity === 0;
  }
  let minParams = 0;
  for (const p of parameters) {
    if (!p.isOptional && p.defaultValue === undefined) {
      minParams++;
    }
  }
  if (variadicParameters) {
    return arity >= minParams;
  }
  const maxParams = parameters.length;
  return arity >= minParams && arity <= maxParams;
}

function parametersAcceptArguments(
  parameters: readonly {
    readonly type: string;
    readonly isOptional?: boolean;
    readonly defaultValue?: string;
  }[],
  argumentTypes: readonly (string | undefined)[],
  indexer: WorkspaceSymbolIndexer,
): boolean {
  if (argumentTypes.length > parameters.length) return false;
  for (let i = 0; i < argumentTypes.length; i++) {
    const argumentType = argumentTypes[i];
    if (!argumentType) continue;
    const parameter = parameters[i];
    if (!parameter) return false;
    if (!isArgumentAssignableToParameter(argumentType, parameter.type, indexer)) {
      return false;
    }
  }
  for (let i = argumentTypes.length; i < parameters.length; i++) {
    const parameter = parameters[i];
    if (parameter && !parameter.isOptional && parameter.defaultValue === undefined) {
      return false;
    }
  }
  return true;
}

function isArgumentAssignableToParameter(
  argumentType: string,
  parameterType: string,
  indexer: WorkspaceSymbolIndexer,
): boolean {
  const argLower = argumentType.toLowerCase();
  const paramLower = parameterType.toLowerCase();
  if (argLower === paramLower) return true;
  if (paramLower === "variant" || argLower === "variant") return true;
  if (isNumericType(argLower) && isNumericType(paramLower)) return true;

  const argClass = TypeResolver.findClassSymbol(argumentType, indexer);
  const paramClass = TypeResolver.findClassSymbol(parameterType, indexer);
  if (argClass && paramClass) {
    if (isEnumClassSymbol(argClass) && isEnumClassSymbol(paramClass)) {
      return areSameNamedTypeSymbols(argClass, paramClass);
    }
    if (areSameNamedTypeSymbols(argClass, paramClass)) {
      return true;
    }
  }

  if (TypeResolver.areDelegateSignaturesCompatible(argumentType, parameterType, indexer)) {
    return true;
  }

  return TypeResolver.isSubclassOf(argumentType, parameterType, indexer);
}

function isEnumClassSymbol(symbol: SymbolInfo): boolean {
  if (symbol.kind === "enum") return true;
  return isTEnumBaseName(symbol.inheritsFrom);
}

function isTEnumBaseName(inheritsFrom: string | undefined): boolean {
  if (!inheritsFrom) return false;
  const lower = inheritsFrom.toLowerCase();
  return lower === "tenum" || lower.endsWith(".tenum");
}

function areSameNamedTypeSymbols(left: SymbolInfo, right: SymbolInfo): boolean {
  return (
    left.name.toLowerCase() === right.name.toLowerCase() &&
    (left.containerName ?? "").toLowerCase() === (right.containerName ?? "").toLowerCase()
  );
}

function isNumericType(typeName: string): boolean {
  return [
    "integer",
    "byte",
    "long",
    "short",
    "single",
    "double",
    "decimal",
    "extended",
    "longint",
    "word",
    "currency",
  ].includes(typeName);
}

function typeofLiteral(value: string | number | boolean): string {
  if (typeof value === "boolean") return "Boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "Integer" : "Double";
  return "String";
}

function typeRefToString(typeRef: TypeReference | undefined): string | undefined {
  if (!typeRef?.name) return undefined;
  if (typeRef.typeArguments.length === 0) return typeRef.name;
  return `${typeRef.name}<${typeRef.typeArguments
    .map((arg) => typeRefToString(arg) ?? "")
    .join(", ")}>`;
}

function expressionToTypeString(expr: Expression): string | undefined {
  if (expr.kind === "TypeReferenceExpression") {
    return typeRefToString(expr.type);
  }
  if (expr.kind === "Identifier") {
    return expr.name;
  }
  if (expr.kind === "MemberAccess") {
    const targetStr = expressionToTypeString(expr.target);
    if (targetStr) {
      return `${targetStr}.${expr.member}`;
    }
  }
  return undefined;
}

function flatMethodGenericArgs(methodName: string): string[] {
  const underscore = methodName.indexOf("_");
  if (underscore < 0) return [];
  const suffix = methodName.slice(underscore + 1);
  return suffix ? suffix.split("_").filter(Boolean) : [];
}

/**
 * TTList functional methods (filter/map/…) are declared to return `TTList<T>`,
 * but when invoked on a concrete subclass (e.g. `Pessoas` extends
 * `TTList<Pessoa>`) the effective return type is the receiver type — matching
 * {@link import("../project/sugars/plugins/ast/transformer").ASTSugarTransformer}
 * `inferFunctionalListType`.
 */
function refineFunctionalListReturnType(
  receiverType: string | undefined,
  invocation: MethodInvocation,
  declaredReturnType: string | undefined,
  indexer: WorkspaceSymbolIndexer,
): string | undefined {
  if (!receiverType || !declaredReturnType) return declaredReturnType;
  const itemType = TypeResolver.resolveListElementType(receiverType, indexer);
  if (!itemType) return declaredReturnType;

  const method = invocation.methodName.toLowerCase().split("_")[0] ?? "";
  const flatGenericArg = flatMethodGenericArgs(invocation.methodName)[0];
  const explicitGenericArg = invocation.typeArguments[0]
    ? typeRefToString(invocation.typeArguments[0])
    : undefined;
  const genericArg = flatGenericArg ?? explicitGenericArg;

  if (method === "filter") return receiverType;
  if (method === "map") {
    if (genericArg) return `TTList<${genericArg}>`;
    const parsedMapReturn = parseGenericTypeReference(declaredReturnType ?? "");
    const mappedElement = parsedMapReturn?.args[0];
    if (
      parsedMapReturn?.base === "TTList" &&
      mappedElement &&
      mappedElement !== itemType &&
      !isOpenGenericTypeParameter(mappedElement)
    ) {
      return declaredReturnType;
    }
    return receiverType;
  }
  if (method === "reduce") return genericArg ?? declaredReturnType;
  if (method === "find") return itemType;
  if (method === "findindex" || method === "indexof") return "Integer";
  if (method === "some" || method === "every") return "Boolean";
  if (method === "first" || method === "last") {
    return invocation.arguments.length === 0 ? itemType : receiverType;
  }

  const listPreservingMethods = new Set(["clone", "slice", "splice", "reverse"]);
  if (listPreservingMethods.has(method)) return receiverType;

  return declaredReturnType;
}

function isOpenGenericTypeParameter(typeName: string): boolean {
  return typeName === "T" || /^T[A-Z][a-zA-Z0-9]*$/.test(typeName);
}

function applyMethodGenericSubstitutions(
  typeName: string,
  method: SymbolInfo,
  invocation: MethodInvocation,
  document: vscode.TextDocument,
  lineIdx: number,
  indexer: WorkspaceSymbolIndexer,
): string {
  const substitutions = inferMethodGenericSubstitutions(
    method,
    invocation,
    document,
    lineIdx,
    indexer,
  );
  if (substitutions.size === 0) return typeName;
  return substituteGenericParametersInFlatType(typeName, substitutions);
}

function inferMethodGenericSubstitutions(
  method: SymbolInfo,
  invocation: MethodInvocation,
  document: vscode.TextDocument,
  lineIdx: number,
  indexer: WorkspaceSymbolIndexer,
): Map<string, string> {
  const substitutions = new Map<string, string>();
  const genericParams = method.genericTypeParameters ?? [];
  if (genericParams.length === 0) return substitutions;

  genericParams.forEach((param, index) => {
    const explicit = invocation.typeArguments[index];
    const explicitType = typeRefToString(explicit);
    if (param && explicitType) substitutions.set(param.toLowerCase(), explicitType);
  });

  for (let i = 0; i < invocation.arguments.length; i++) {
    const arg = invocation.arguments[i];
    const parameter = method.parameters?.[i];
    if (!arg || !parameter) continue;

    if (arg.kind === "ArrowFunctionExpression") {
      const lambdaReturn =
        typeRefToString(arg.returnType) ??
        (Array.isArray(arg.body)
          ? undefined
          : TypeResolver.resolveExpressionType(arg.body, document, lineIdx, indexer));
      if (lambdaReturn) {
        const delegateReturn = resolveDelegateReturnType(parameter.type, indexer);
        if (delegateReturn) {
          inferGenericTypePattern(delegateReturn, lambdaReturn, genericParams, substitutions);
        }
        inferGenericSegmentsFromFlatType(
          parameter.type,
          lambdaReturn,
          genericParams,
          substitutions,
        );
      }
      continue;
    }

    const argType = TypeResolver.resolveExpressionType(arg, document, lineIdx, indexer);
    if (argType) {
      inferGenericSegmentsFromFlatType(parameter.type, argType, genericParams, substitutions);
    }
  }

  return substitutions;
}

function resolveDelegateReturnType(
  delegateType: string,
  indexer: WorkspaceSymbolIndexer,
): string | undefined {
  return resolveDelegateCompatibilitySignature(delegateType, indexer)?.returnType;
}

type DelegateCompatibilitySignature = {
  readonly returnType: string;
  readonly parameters: readonly { readonly type: string }[];
};

function resolveDelegateCompatibilitySignature(
  delegateType: string,
  indexer: WorkspaceSymbolIndexer,
): DelegateCompatibilitySignature | undefined {
  const parsed = parseGenericTypeReference(delegateType);
  const delegateName = parsed?.base ?? delegateType;
  let delegate = findDelegateSymbolInContext(delegateName, indexer);
  let typeArguments: string[] = [...(parsed?.args ?? [])];
  if (delegate?.kind !== "delegate") {
    const flatDelegate = resolveFlatGenericDelegateSignature(delegateName, indexer);
    delegate = flatDelegate?.delegate;
    typeArguments = [...(flatDelegate?.typeArguments ?? [])];
  }
  if (delegate?.kind !== "delegate") return undefined;

  const substitutions = new Map<string, string>();
  delegate.genericTypeParameters?.forEach((param, index) => {
    const arg = typeArguments[index];
    if (arg) substitutions.set(param.toLowerCase(), arg);
  });
  return {
    returnType: substituteGenericParametersPreservingSyntax(delegate.type, substitutions),
    parameters: (delegate.parameters ?? []).map((param) => ({
      type: substituteGenericParametersPreservingSyntax(param.type, substitutions),
    })),
  };
}

function resolveFlatGenericDelegateSignature(
  delegateType: string,
  indexer: WorkspaceSymbolIndexer,
):
  | {
      readonly delegate: SymbolInfo;
      readonly typeArguments: readonly string[];
    }
  | undefined {
  const lower = delegateType.toLowerCase();
  const candidates = [
    ...indexer.getAllSymbols(),
    ...SYSTEM_SYMBOLS.filter((symbol) => symbol.kind === "delegate"),
  ];
  for (const symbol of candidates) {
    if (symbol.kind !== "delegate" || !symbol.genericTypeParameters?.length) continue;
    const prefix = `${symbol.name.toLowerCase()}_`;
    if (!lower.startsWith(prefix)) continue;
    const rawArgs = delegateType.slice(symbol.name.length + 1);
    const parsedArgs = rawArgs.split("_").filter((arg) => arg.length > 0);
    if (parsedArgs.length === 0) continue;
    return { delegate: symbol, typeArguments: parsedArgs };
  }
  return undefined;
}

function areDelegateParameterTypesCompatible(
  actualType: string,
  expectedType: string,
  indexer: WorkspaceSymbolIndexer,
): boolean {
  if (isArgumentAssignableToParameter(actualType, expectedType, indexer)) return true;
  return TypeResolver.isSubclassOf(actualType, expectedType, indexer);
}

function inferGenericTypePattern(
  expectedType: string,
  actualType: string,
  genericParams: readonly string[],
  substitutions: Map<string, string>,
): void {
  const generic = genericParams.find((param) => param.toLowerCase() === expectedType.toLowerCase());
  if (generic) {
    substitutions.set(generic.toLowerCase(), actualType);
    return;
  }

  const expected = parseGenericTypeReference(expectedType);
  const actual = parseGenericTypeReference(actualType);
  if (!expected || !actual || expected.base.toLowerCase() !== actual.base.toLowerCase()) return;
  for (let i = 0; i < expected.args.length; i++) {
    const expectedArg = expected.args[i];
    const actualArg = actual.args[i];
    if (expectedArg && actualArg) {
      inferGenericTypePattern(expectedArg, actualArg, genericParams, substitutions);
    }
  }
}

function inferGenericSegmentsFromFlatType(
  expectedType: string,
  actualType: string,
  genericParams: readonly string[],
  substitutions: Map<string, string>,
): void {
  const expectedSegments = expectedType.split("_");
  const actualSegments = actualType.split("_");
  for (let i = 0; i < expectedSegments.length; i++) {
    const segment = expectedSegments[i];
    if (!segment) continue;
    const generic = genericParams.find((param) => param.toLowerCase() === segment.toLowerCase());
    if (!generic) continue;
    const actual = actualSegments[i] ?? actualType;
    if (actual) substitutions.set(generic.toLowerCase(), actual);
  }
}

function substituteGenericParametersInFlatType(
  typeName: string,
  substitutions: ReadonlyMap<string, string>,
): string {
  let current = substituteGenericParametersPreservingSyntax(typeName, substitutions);
  for (const [param, concrete] of substitutions.entries()) {
    const escaped = param.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    current = current.replace(new RegExp(`(^|_)${escaped}(?=_|$)`, "gi"), `$1${concrete}`);
  }
  return current;
}

function qualifiedTypeNameFromInvocation(
  expr: Expression,
  indexer: WorkspaceSymbolIndexer,
): string | undefined {
  if (expr.kind !== "MethodInvocation" || !expr.callee) return undefined;
  const calleeName = expressionToTypeString(expr.callee);
  if (!calleeName) return undefined;
  const qualifiedName = `${calleeName}.${expr.methodName}`;
  const containerLower = calleeName.toLowerCase();
  const systemMatch = lookupSystemClassByName(expr.methodName).some(
    (sym) => sym.containerName?.toLowerCase() === containerLower,
  );
  const workspaceMatch = indexer
    .getSymbolsByName(expr.methodName)
    .some(
      (sym) =>
        (sym.kind === "class" || sym.kind === "structure") &&
        sym.containerName?.toLowerCase() === containerLower,
    );
  return systemMatch || workspaceMatch ? qualifiedName : undefined;
}

function collectLocalDeclarations(
  node: Node | undefined,
  position: vscode.Position,
  locals: Map<string, string>,
  indexer: WorkspaceSymbolIndexer,
  document: vscode.TextDocument,
  lineIdx: number,
): void {
  if (!node) return;

  const nodeLine = Math.max(0, (node.loc?.startLine ?? 1) - 1);

  const isClassOrMethod =
    node.kind === "NamespaceDeclaration" ||
    node.kind === "ClassDeclaration" ||
    node.kind === "MethodDeclaration" ||
    node.kind === "PropertyDeclaration";

  if (!isClassOrMethod && node.loc) {
    if (
      nodeLine > position.line ||
      (nodeLine === position.line && node.loc.startChar > position.character)
    ) {
      return;
    }
  }

  switch (node.kind) {
    case "CompilationUnit":
    case "NamespaceDeclaration":
      for (const m of node.members) {
        if (m.kind === "NamespaceDeclaration") {
          const mLine = Math.max(0, (m.loc?.startLine ?? 1) - 1);
          const mEndLine = Math.max(0, (m.loc?.endLine ?? 1) - 1);
          if (position.line >= mLine && position.line <= mEndLine) {
            collectLocalDeclarations(m, position, locals, indexer, document, lineIdx);
          }
        } else {
          if (m.kind === "MethodDeclaration" && m.loc) {
            const mLine = Math.max(0, m.loc.startLine - 1);
            const mEndLine = Math.max(0, m.loc.endLine - 1);
            if (position.line >= mLine && position.line <= mEndLine) {
              collectLocalDeclarations(m, position, locals, indexer, document, lineIdx);
            }
          } else {
            collectLocalDeclarations(m, position, locals, indexer, document, lineIdx);
          }
        }
      }
      break;

    case "ClassDeclaration":
      for (const m of node.members) {
        if (m.loc) {
          const mLine = Math.max(0, m.loc.startLine - 1);
          const mEndLine = Math.max(0, m.loc.endLine - 1);
          if (position.line >= mLine && position.line <= mEndLine) {
            collectLocalDeclarations(m, position, locals, indexer, document, lineIdx);
          }
        }
      }
      break;

    case "MethodDeclaration":
      for (const p of node.parameters) {
        locals.set(p.name.toLowerCase(), typeRefToString(p.type) ?? "Variant");
      }
      for (const s of node.body) {
        collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
      }
      break;

    case "PropertyDeclaration":
      if (node.getter?.loc) {
        const gLine = Math.max(0, node.getter.loc.startLine - 1);
        const gEndLine = Math.max(0, node.getter.loc.endLine - 1);
        if (position.line >= gLine && position.line <= gEndLine) {
          if (node.parameters) {
            for (const p of node.parameters) {
              locals.set(p.name.toLowerCase(), typeRefToString(p.type) ?? "Variant");
            }
          }
          collectLocalDeclarations(node.getter, position, locals, indexer, document, lineIdx);
        }
      }
      if (node.setter?.loc) {
        const sLine = Math.max(0, node.setter.loc.startLine - 1);
        const sEndLine = Math.max(0, node.setter.loc.endLine - 1);
        if (position.line >= sLine && position.line <= sEndLine) {
          if (node.parameters) {
            for (const p of node.parameters) {
              locals.set(p.name.toLowerCase(), typeRefToString(p.type) ?? "Variant");
            }
          }
          collectLocalDeclarations(node.setter, position, locals, indexer, document, lineIdx);
        }
      }
      break;

    case "VariableDeclaration": {
      const explicitType = typeRefToString(node.type);
      if (explicitType) {
        locals.set(
          node.name.toLowerCase(),
          isExternalTypeAcceptedByDeclaration(document, explicitType, nodeLine, lineIdx)
            ? "Variant"
            : explicitType,
        );
      } else {
        const inferredType = node.initializer
          ? TypeResolver.resolveExpressionType(node.initializer, document, nodeLine, indexer)
          : undefined;
        locals.set(node.name.toLowerCase(), inferredType ?? "Variant");
      }
      if (node.initializer) {
        collectExpressionLocalDeclarations(
          node.initializer,
          position,
          locals,
          indexer,
          document,
          lineIdx,
        );
      }
      break;
    }

    case "DestructuredVariableDeclaration":
      for (const b of node.bindings) {
        locals.set(b.name.toLowerCase(), "Variant");
      }
      break;

    case "ForEachStatement":
      if (node.loc) {
        const start = Math.max(0, node.loc.startLine - 1);
        const end = Math.max(0, node.loc.endLine - 1);
        if (position.line >= start && position.line <= end) {
          locals.set(
            node.elementVar.name.toLowerCase(),
            typeRefToString(node.elementType) ?? "Variant",
          );
          for (const s of node.body) {
            collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
          }
        }
      }
      break;

    case "ForStatement":
      if (node.loc) {
        const start = Math.max(0, node.loc.startLine - 1);
        const end = Math.max(0, node.loc.endLine - 1);
        if (position.line >= start && position.line <= end) {
          locals.set(node.counter.name.toLowerCase(), "Integer");
          for (const s of node.body) {
            collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
          }
        }
      }
      break;

    case "IfStatement":
      for (const s of node.thenBranch) {
        collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
      }
      for (const b of node.elseIfBranches) {
        for (const s of b.body) {
          collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
        }
      }
      if (node.elseBranch) {
        for (const s of node.elseBranch) {
          collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
        }
      }
      break;

    case "UsingStatement":
      if (node.loc) {
        const start = Math.max(0, node.loc.startLine - 1);
        const end = Math.max(0, node.loc.endLine - 1);
        if (position.line >= start && position.line <= end) {
          locals.set(
            node.resourceVar.name.toLowerCase(),
            typeRefToString(node.resourceType) ?? "Variant",
          );
          for (const s of node.body) {
            collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
          }
        }
      }
      break;

    case "WhileStatement":
    case "WithStatement":
      for (const s of node.body) {
        collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
      }
      break;

    case "TryCatchStatement":
      for (const s of node.tryBody) {
        collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
      }
      {
        let inCatch = false;
        const lastTry = node.tryBody.length > 0 ? node.tryBody[node.tryBody.length - 1] : undefined;
        const nodeStart = node.loc ? node.loc.startLine : 0;
        const nodeEnd = node.loc ? node.loc.endLine : 0;
        const tryEnd = lastTry?.loc
          ? Math.max(0, lastTry.loc.endLine - 1)
          : Math.max(0, nodeStart - 1);

        const firstFinally =
          node.finallyBody && node.finallyBody.length > 0 ? node.finallyBody[0] : undefined;
        const finallyStart = firstFinally?.loc
          ? Math.max(0, firstFinally.loc.startLine - 1)
          : Math.max(0, nodeEnd - 1);

        if (position.line > tryEnd && position.line < finallyStart) {
          inCatch = true;
        }
        if (inCatch && node.catchVar) {
          locals.set(
            node.catchVar.name.toLowerCase(),
            typeRefToString(node.catchType) ?? "Exception",
          );
        }
        for (const s of node.catchBody) {
          collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
        }
      }
      if (node.finallyBody) {
        for (const s of node.finallyBody) {
          collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
        }
      }
      break;

    case "Block":
      for (const s of node.statements) {
        collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
      }
      break;

    case "ExpressionStatement":
      collectExpressionLocalDeclarations(
        node.expression,
        position,
        locals,
        indexer,
        document,
        lineIdx,
      );
      break;

    case "Assignment":
      collectExpressionLocalDeclarations(node.target, position, locals, indexer, document, lineIdx);
      collectExpressionLocalDeclarations(node.value, position, locals, indexer, document, lineIdx);
      break;

    case "ReturnStatement":
      if (node.expression) {
        collectExpressionLocalDeclarations(
          node.expression,
          position,
          locals,
          indexer,
          document,
          lineIdx,
        );
      }
      break;
  }
}

function collectExpressionLocalDeclarations(
  expression: Expression | undefined,
  position: vscode.Position,
  locals: Map<string, string>,
  indexer: WorkspaceSymbolIndexer,
  document: vscode.TextDocument,
  lineIdx: number,
): void {
  if (!expression) return;

  if (expression.kind === "ArrowFunctionExpression") {
    if (expression.loc && !positionWithinLoc(position, expression.loc)) return;
    for (const parameter of expression.parameters) {
      locals.set(parameter.name.toLowerCase(), typeRefToString(parameter.type) ?? "Variant");
    }
    if (Array.isArray(expression.body)) {
      for (const statement of expression.body) {
        collectLocalDeclarations(statement, position, locals, indexer, document, lineIdx);
      }
    } else {
      collectExpressionLocalDeclarations(
        expression.body,
        position,
        locals,
        indexer,
        document,
        lineIdx,
      );
    }
    return;
  }

  for (const child of expressionChildren(expression)) {
    collectExpressionLocalDeclarations(child, position, locals, indexer, document, lineIdx);
  }
}

function expressionChildren(expression: Expression): readonly Expression[] {
  switch (expression.kind) {
    case "ObjectCreationExpression":
      return expression.arguments;
    case "MethodInvocation":
      return [expression.callee, ...expression.arguments].filter(
        (child): child is Expression => child !== undefined,
      );
    case "MemberAccess":
      return [expression.target];
    case "ArrayAccessExpression":
      return [expression.target, ...(expression.indices ?? [expression.index])];
    case "BinaryExpression":
      return [expression.left, expression.right];
    case "UnaryExpression":
      return [expression.argument];
    case "TernaryExpression":
      return [expression.condition, expression.trueExpr, expression.falseExpr];
    case "NullCoalescingExpression":
    case "PipeExpression":
      return [expression.left, expression.right];
    case "OptionalChainingExpression":
      return [expression.target, expression.member];
    case "ObjectInitializerExpression":
      return [
        ...expression.arguments,
        ...expression.assignments.map((assignment) => assignment.value),
      ];
    case "ArrayLiteralExpression":
      return expression.elements;
    case "SpreadExpression":
      return [expression.expression];
    default:
      return [];
  }
}

function positionWithinLoc(
  position: vscode.Position,
  loc: { readonly startLine: number; readonly endLine: number },
): boolean {
  const start = Math.max(0, loc.startLine - 1);
  const end = Math.max(0, loc.endLine - 1);
  return position.line >= start && position.line <= end;
}

type LocalsMap = Map<string, string>;
type LineLocalsMap = Map<number, LocalsMap>;

class FileLineContextIndex {
  private readonly methodAtLine = new Map<number, SymbolInfo>();
  private readonly propertyAtLine = new Map<number, SymbolInfo>();
  private readonly classAtLine = new Map<number, SymbolInfo>();

  public static build(symbols: readonly SymbolInfo[]): FileLineContextIndex {
    const index = new FileLineContextIndex();
    const classes: SymbolInfo[] = [];
    for (const symbol of symbols) {
      if (symbol.isSyntheticGenericInstantiation) {
        continue;
      }
      if (symbol.kind === "method") {
        index.fillRange(symbol.range.startLine, symbol.range.endLine, symbol, index.methodAtLine);
        continue;
      }
      if (symbol.kind === "property" || symbol.kind === "indexed-property") {
        index.fillRange(symbol.range.startLine, symbol.range.endLine, symbol, index.propertyAtLine);
        continue;
      }
      if (symbol.kind === "class") {
        classes.push(symbol);
      }
    }
    for (const cls of classes) {
      const span = cls.range.endLine - cls.range.startLine;
      for (let line = cls.range.startLine; line <= cls.range.endLine; line++) {
        const existing = index.classAtLine.get(line);
        if (!existing) {
          index.classAtLine.set(line, cls);
          continue;
        }
        const existingSpan = existing.range.endLine - existing.range.startLine;
        if (span < existingSpan) {
          index.classAtLine.set(line, cls);
        } else if (span === existingSpan && cls.range.startLine > existing.range.startLine) {
          index.classAtLine.set(line, cls);
        }
      }
    }
    return index;
  }

  public getMethod(line: number): SymbolInfo | undefined {
    return this.methodAtLine.get(line);
  }

  public getProperty(line: number): SymbolInfo | undefined {
    return this.propertyAtLine.get(line);
  }

  public getClass(line: number): SymbolInfo | undefined {
    return this.classAtLine.get(line);
  }

  private fillRange(
    startLine: number,
    endLine: number,
    symbol: SymbolInfo,
    target: Map<number, SymbolInfo>,
  ): void {
    for (let line = startLine; line <= endLine; line++) {
      target.set(line, symbol);
    }
  }
}

function getOrBuildFileLineContext(
  unit: CompilationUnit,
  symbols: readonly SymbolInfo[],
): FileLineContextIndex {
  const fileLineContextCacheHolder = getFileLineContextCacheHolder() as {
    map: WeakMap<object, FileLineContextIndex>;
  };
  let index = fileLineContextCacheHolder.map.get(unit);
  if (!index) {
    index = FileLineContextIndex.build(symbols);
    fileLineContextCacheHolder.map.set(unit, index);
  }
  return index;
}

class LocalScopeIndex {
  private readonly lineToMethod = new Map<number, MethodDeclaration>();
  private readonly methodScopes = new Map<MethodDeclaration, LineLocalsMap>();

  public static build(
    unit: CompilationUnit,
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
  ): LocalScopeIndex {
    const index = new LocalScopeIndex();
    index.indexCompilationUnit(unit, document, indexer);
    return index;
  }

  public getMethodAtLine(line: number): MethodDeclaration | undefined {
    return this.lineToMethod.get(line);
  }

  public getLocalType(line: number, varName: string): string | undefined {
    const method = this.lineToMethod.get(line);
    if (!method) {
      return undefined;
    }
    const lineLocals = this.methodScopes.get(method);
    if (!lineLocals) {
      return undefined;
    }
    return lookupLocalsAtLine(lineLocals, line).get(varName.toLowerCase());
  }

  private indexCompilationUnit(
    unit: CompilationUnit,
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
  ): void {
    const visitMembers = (members: readonly Node[]): void => {
      for (const member of members) {
        if (member.kind === "NamespaceDeclaration") {
          visitMembers(member.members);
          continue;
        }
        if (member.kind === "ClassDeclaration") {
          for (const classMember of member.members) {
            if (classMember.kind === "MethodDeclaration") {
              this.indexMethod(classMember, document, indexer);
            } else if (classMember.kind === "PropertyDeclaration") {
              this.indexProperty(classMember, document, indexer);
            }
          }
          continue;
        }
        if (member.kind === "MethodDeclaration") {
          this.indexMethod(member, document, indexer);
        }
      }
    };
    visitMembers(unit.members);
  }

  private indexMethod(
    method: MethodDeclaration,
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
  ): void {
    if (!method.loc) {
      return;
    }
    const lineLocals: LineLocalsMap = new Map();
    const locals: LocalsMap = new Map();
    for (const parameter of method.parameters) {
      locals.set(parameter.name.toLowerCase(), typeRefToString(parameter.type) ?? "Variant");
    }
    this.registerMethodLines(method, lineLocals);
    this.walkStatements(method.body, locals, lineLocals, document, indexer);
    this.methodScopes.set(method, lineLocals);
  }

  private indexProperty(
    property: PropertyDeclaration,
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
  ): void {
    if (property.getter) {
      this.indexMethod(property.getter, document, indexer);
    }
    if (property.setter) {
      this.indexMethod(property.setter, document, indexer);
    }
  }

  private registerMethodLines(method: MethodDeclaration, lineLocals: LineLocalsMap): void {
    if (!method.loc) {
      return;
    }
    const start = Math.max(0, method.loc.startLine - 1);
    const end = Math.max(start, method.loc.endLine - 1);
    for (let line = start; line <= end; line++) {
      this.lineToMethod.set(line, method);
      if (!lineLocals.has(line)) {
        lineLocals.set(line, new Map());
      }
    }
  }

  private snapshotLocals(lineLocals: LineLocalsMap, line: number, locals: LocalsMap): void {
    lineLocals.set(line, new Map(locals));
  }

  private walkStatements(
    statements: readonly Statement[],
    locals: LocalsMap,
    lineLocals: LineLocalsMap,
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
  ): void {
    for (const statement of statements) {
      if (statement.loc) {
        this.snapshotLocals(lineLocals, statement.loc.startLine - 1, locals);
      }
      this.applyStatement(statement, locals, lineLocals, document, indexer);
    }
  }

  private applyStatement(
    statement: Statement,
    locals: LocalsMap,
    lineLocals: LineLocalsMap,
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
  ): void {
    switch (statement.kind) {
      case "VariableDeclaration": {
        const nodeLine = Math.max(0, (statement.loc?.startLine ?? 1) - 1);
        const explicitType = typeRefToString(statement.type);
        if (explicitType) {
          locals.set(
            statement.name.toLowerCase(),
            isExternalTypeAcceptedByDeclaration(document, explicitType, nodeLine, nodeLine)
              ? "Variant"
              : explicitType,
          );
        } else {
          locals.set(statement.name.toLowerCase(), "Variant");
        }
        break;
      }
      case "DestructuredVariableDeclaration":
        for (const binding of statement.bindings) {
          locals.set(binding.name.toLowerCase(), "Variant");
        }
        break;
      case "ForEachStatement":
        locals.set(
          statement.elementVar.name.toLowerCase(),
          typeRefToString(statement.elementType) ?? "Variant",
        );
        this.walkStatements(statement.body, locals, lineLocals, document, indexer);
        break;
      case "ForStatement":
        locals.set(statement.counter.name.toLowerCase(), "Integer");
        this.walkStatements(statement.body, locals, lineLocals, document, indexer);
        break;
      case "UsingStatement":
        locals.set(
          statement.resourceVar.name.toLowerCase(),
          typeRefToString(statement.resourceType) ?? "Variant",
        );
        this.walkStatements(statement.body, locals, lineLocals, document, indexer);
        break;
      case "WhileStatement":
      case "WithStatement":
        this.walkStatements(statement.body, locals, lineLocals, document, indexer);
        break;
      case "IfStatement":
        this.walkStatements(statement.thenBranch, locals, lineLocals, document, indexer);
        for (const branch of statement.elseIfBranches) {
          this.walkStatements(branch.body, locals, lineLocals, document, indexer);
        }
        if (statement.elseBranch) {
          this.walkStatements(statement.elseBranch, locals, lineLocals, document, indexer);
        }
        break;
      case "TryCatchStatement":
        this.walkStatements(statement.tryBody, locals, lineLocals, document, indexer);
        if (statement.catchVar) {
          locals.set(
            statement.catchVar.name.toLowerCase(),
            typeRefToString(statement.catchType) ?? "Exception",
          );
        }
        this.walkStatements(statement.catchBody, locals, lineLocals, document, indexer);
        if (statement.finallyBody) {
          this.walkStatements(statement.finallyBody, locals, lineLocals, document, indexer);
        }
        break;
      case "Block":
        this.walkStatements(statement.statements, locals, lineLocals, document, indexer);
        break;
      case "SelectCaseStatement":
        for (const caseClause of statement.cases) {
          this.walkStatements(caseClause.body, locals, lineLocals, document, indexer);
        }
        break;
      default:
        break;
    }
  }
}

function getOrBuildLocalScopeIndex(
  unit: CompilationUnit,
  document: vscode.TextDocument,
  _indexer: WorkspaceSymbolIndexer,
): LocalScopeIndex {
  const localScopeIndexCacheHolder = getLocalScopeIndexCacheHolder() as {
    map: WeakMap<object, LocalScopeIndex>;
  };
  let index = localScopeIndexCacheHolder.map.get(unit);
  if (!index) {
    index = LocalScopeIndex.build(unit, document, _indexer);
    localScopeIndexCacheHolder.map.set(unit, index);
  }
  return index;
}

function lookupLocalsAtLine(lineLocals: LineLocalsMap, line: number): LocalsMap {
  if (lineLocals.has(line)) {
    return lineLocals.get(line)!;
  }
  let bestLine = -1;
  let best: LocalsMap | undefined;
  for (const [recordedLine, locals] of lineLocals) {
    if (recordedLine <= line && recordedLine > bestLine) {
      bestLine = recordedLine;
      best = locals;
    }
  }
  return best ?? new Map();
}
