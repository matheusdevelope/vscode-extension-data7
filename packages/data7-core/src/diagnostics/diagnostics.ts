import * as vscode from "../platform/vscode-api";
import type { WorkspaceSymbolIndexer, SymbolInfo } from "../analysis/symbol-indexer";
import {
  lookupSystemByContainer,
  lookupSystemClassByName,
  lookupSystemByName,
  SYSTEM_SYMBOLS,
} from "../system-library";
import { TypeResolver } from "../analysis/type-resolver";
import { TimeTracker } from "../utils/performance";
import { parseBasic } from "../project/parser";
import { collectGenericsContextFromUnit } from "../analysis/generics-analyzer";
import { collectGenericDiagnostics, collectWorkspaceGenericTemplates } from "./generic-diagnostics";
import type {
  MissingImportPayload,
  UnknownSuppressionCodePayload,
  UnsupportedMemberPayload,
  LineContinuationWithoutBreakPayload,
} from "./diagnostic-codes";
import { DiagnosticCodes, LegacyDiagnosticCodes, setDiagnosticPayload } from "./diagnostic-codes";
import { PRIMITIVE_TYPES } from "../utils/primitive-types";
import { readConfiguration, resolveDiagnosticSeverity } from "../infra/configuration";
import { extractSuppressedCodes, listSuppressionDirectives } from "../utils/suppression-comments";
import {
  extractExternalTypeDirectives,
  isExternalTypeAllowedByDirectives,
  type ExternalTypeActiveScope,
  type ExternalTypeDirective,
} from "../utils/external-type-comments";
import { LanguageProcessor } from "../analysis/language-processor";
import { warmLintTypeResolutionIndexes } from "../analysis/type-resolver";
import { SemanticLintCache } from "../analysis/semantic-lint-cache";
import {
  DeclarationLintCache,
  hashDeclarationBody,
  type DeclarationLintTarget,
} from "../analysis/declaration-lint-cache";
import { LintPipelineProfiler } from "../analysis/lint-pipeline-profiler";
import {
  validateDuplicateDeclarations,
  validateNamespaceNameConflicts,
} from "./structural-diagnostics";
import { LintUnitIndex } from "./lint-unit-index";
import {
  areResolvedTypeNamesEquivalent,
  areSameGenericTemplateCompatible,
  findClosest,
  isLikelyGenericTypeParameter,
  isSymbolContainerAccessible,
} from "./diagnostic-helpers";
import {
  ASTWalker,
  type CompilationUnit,
  type ClassDeclaration,
  type MethodDeclaration,
  type PropertyDeclaration,
  type Node,
} from "../project/ast/ast";
import { tokenizeLine, type LineToken } from "../project/parser/lexer";
import type { Rule, RuleContext } from "./rules/base-rule";
import { ArraysRule } from "./rules/arrays-rule";
import { ControlFlowRule } from "./rules/control-flow-rule";
import { DeclarationsRule } from "./rules/declarations-rule";
import { ImportsRule } from "./rules/imports-rule";
import { LifecycleRule } from "./rules/lifecycle-rule";
import { MembersRule } from "./rules/members-rule";
import { TypesRule } from "./rules/types-rule";

export class DiagnosticsLinter {
  private static resolveClassName(className: string): string {
    const lastDotIdx = className.lastIndexOf(".");
    return lastDotIdx !== -1 ? className.substring(lastDotIdx + 1) : className;
  }

  public static collectMemberNames(
    className: string,
    indexer: WorkspaceSymbolIndexer,
    limit = 500,
  ): string[] {
    const shortClassName = this.resolveClassName(className);
    const names = new Set<string>();
    const pushMembers = (containerName: string): void => {
      for (const s of lookupSystemByContainer(containerName)) names.add(s.name);
      for (const s of indexer.getSymbolsByContainer(containerName)) {
        names.add(s.name);
      }
    };
    pushMembers(shortClassName);

    const firstClass = (name: string): SymbolInfo | undefined =>
      indexer.findSymbolByName(name) ?? lookupSystemClassByName(name)[0];
    let cur = firstClass(shortClassName);
    const visited = new Set<string>();
    while (cur && !visited.has(cur.name.toLowerCase()) && names.size < limit) {
      visited.add(cur.name.toLowerCase());
      const parentName = TypeResolver.resolveParent(cur);
      if (!parentName) break;
      pushMembers(this.resolveClassName(parentName));
      cur = firstClass(this.resolveClassName(parentName));
    }
    return Array.from(names);
  }

  public static isKnownType(className: string, indexer: WorkspaceSymbolIndexer): boolean {
    if (!className) {
      return false;
    }
    const lowerName = className.toLowerCase();
    if (lowerName === "variant" || lowerName === "tobject" || lowerName === "void") {
      return true;
    }

    // Prefer class/structure/enum lookup — findSymbolByName alone can return a
    // method/field that shares the type name and falsely report the type as unknown
    // (breaking TypeName(expr) casts such as Cliente(list[i])).
    if (TypeResolver.findClassSymbol(className, indexer)) {
      return true;
    }

    let nameToCheck = className;
    let containerToCheck: string | undefined;
    const lastDotIdx = className.lastIndexOf(".");
    if (lastDotIdx !== -1) {
      nameToCheck = className.substring(lastDotIdx + 1);
      containerToCheck = className.substring(0, lastDotIdx);
    }

    const inSystem = lookupSystemByName(nameToCheck).some((s) => {
      if (s.kind !== "class" && s.kind !== "structure" && s.kind !== "enum") return false;
      if (containerToCheck) {
        return s.containerName?.toLowerCase() === containerToCheck.toLowerCase();
      }
      return true;
    });
    if (inSystem) return true;

    const typeMatches = indexer
      .getSymbolsByName(nameToCheck)
      .filter(
        (symbol) =>
          symbol.kind === "class" || symbol.kind === "structure" || symbol.kind === "enum",
      );
    if (containerToCheck) {
      return typeMatches.some(
        (symbol) => symbol.containerName?.toLowerCase() === containerToCheck.toLowerCase(),
      );
    }
    return typeMatches.length > 0;
  }

  public static isKnownMemberContainer(
    containerName: string,
    indexer: WorkspaceSymbolIndexer,
  ): boolean {
    if (DiagnosticsLinter.isKnownType(containerName, indexer)) return true;

    const systemSymbol = lookupSystemByName(containerName).find((s) => s.kind === "namespace");
    if (systemSymbol) return true;

    const workspaceSymbol = indexer.findSymbolByName(containerName);
    return workspaceSymbol?.kind === "namespace";
  }

  public static validateTypeReference(
    typeName: string,
    lineIdx: number,
    startChar: number,
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
    diagnostics: vscode.Diagnostic[],
    options?: {
      readonly activeNamespace?: string;
      readonly activeClassNesting?: readonly string[];
    },
  ): void {
    const typeLower = typeName.toLowerCase();
    if (PRIMITIVE_TYPES.has(typeLower)) return;

    const lastDotIdx = typeName.lastIndexOf(".");
    let name: string;
    let container: string | undefined;
    const isQualified = lastDotIdx !== -1;
    if (isQualified) {
      name = typeName.substring(lastDotIdx + 1);
      container = typeName.substring(0, lastDotIdx);
    } else {
      name = typeName;
    }

    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    const activeNamespace =
      options?.activeNamespace ?? fileSyms?.symbols.find((s) => s.kind === "namespace")?.name;
    const imports = new Set((fileSyms?.imports ?? []).map((imp) => imp.toLowerCase()));
    const activeClassNesting = options?.activeClassNesting ?? [];

    const workspaceMatches = indexer
      .getSymbolsByName(name)
      .filter(
        (s) =>
          (s.kind === "class" ||
            s.kind === "structure" ||
            s.kind === "delegate" ||
            s.kind === "enum" ||
            s.kind === "namespace") &&
          (!container || s.containerName?.toLowerCase() === container.toLowerCase()),
      );

    const systemMatches = lookupSystemByName(name).filter(
      (s) =>
        (s.kind === "class" ||
          s.kind === "structure" ||
          s.kind === "delegate" ||
          s.kind === "namespace") &&
        (!container || s.containerName?.toLowerCase() === container.toLowerCase()),
    );

    const allMatches = [...workspaceMatches, ...systemMatches];

    if (allMatches.length === 0) {
      const range = new vscode.Range(lineIdx, startChar, lineIdx, startChar + typeName.length);
      const diag = new vscode.Diagnostic(
        range,
        `O tipo "${typeName}" não foi encontrado no workspace ou na biblioteca do sistema.`,
        vscode.DiagnosticSeverity.Error,
      );
      diag.code = DiagnosticCodes.UnknownType;

      const allTypes = new Set<string>();
      let typeBudget = 0;
      const TYPE_SUGGESTION_BUDGET = 400;
      for (const s of indexer.getAllSymbols()) {
        if (
          s.kind === "class" ||
          s.kind === "structure" ||
          s.kind === "delegate" ||
          s.kind === "enum"
        ) {
          allTypes.add(s.name);
          typeBudget++;
          if (typeBudget >= TYPE_SUGGESTION_BUDGET) break;
        }
      }
      for (const s of SYSTEM_SYMBOLS) {
        if (s.kind === "class" || s.kind === "structure" || s.kind === "delegate") {
          allTypes.add(s.name);
        }
      }
      const suggestions = findClosest(typeName, Array.from(allTypes), { maxCandidates: 250 });
      setDiagnosticPayload(diag, {
        code: DiagnosticCodes.UnknownType,
        typeName,
        suggestions,
      });

      diagnostics.push(diag);
      return;
    }

    let isValid = false;
    let matchingNamespace: string | undefined;

    if (isQualified) {
      isValid = true;
    } else {
      for (const sym of allMatches) {
        const ns = sym.containerName;
        if (!ns) {
          isValid = true;
          break;
        }

        if (
          isSymbolContainerAccessible(ns, {
            activeNamespace,
            activeClassNesting,
            imports,
          })
        ) {
          isValid = true;
          break;
        }
        if (sym.fileUri && /principal\.bas$/i.test(sym.fileUri)) {
          isValid = true;
          break;
        }
        matchingNamespace = ns;
      }
    }

    if (!isValid && matchingNamespace) {
      const range = new vscode.Range(lineIdx, startChar, lineIdx, startChar + typeName.length);
      const diag = new vscode.Diagnostic(
        range,
        `O tipo "${typeName}" pertence ao módulo "${matchingNamespace}", que não foi importado neste arquivo.`,
        vscode.DiagnosticSeverity.Error,
      );
      diag.code = DiagnosticCodes.MissingImport;
      const payload: MissingImportPayload = {
        code: DiagnosticCodes.MissingImport,
        namespace: matchingNamespace,
        typeName,
      };
      setDiagnosticPayload(diag, payload);
      diagnostics.push(diag);
    }
  }

  public static pushUnsupportedMemberDiagnostic(
    diagnostics: vscode.Diagnostic[],
    lineIdx: number,
    startChar: number,
    memberName: string,
    typeName: string,
  ): void {
    const range = new vscode.Range(lineIdx, startChar, lineIdx, startChar + memberName.length);
    const diag = new vscode.Diagnostic(
      range,
      `O membro "${memberName}" de "${typeName}" não é suportado pelo compilador Data7 e não deve ser usado.`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.UnsupportedMember;
    const payload: UnsupportedMemberPayload = {
      code: DiagnosticCodes.UnsupportedMember,
      member: memberName,
      typeName,
    };
    setDiagnosticPayload(diag, payload);
    diagnostics.push(diag);
  }

  public static isTypeCompatible(
    rhsType: string,
    lhsType: string,
    indexer: WorkspaceSymbolIndexer,
  ): boolean {
    const lhsLower = lhsType.toLowerCase();
    const rhsLower = rhsType.toLowerCase();
    const lhsIsTObjectRoot = lhsLower === "tobject" || lhsLower.endsWith(".tobject");

    if (lhsLower === rhsLower) return true;

    const isTextual = (type: string): boolean =>
      type === "string" || type === "char" || type === "widechar" || type === "shortstring";
    if (isTextual(lhsLower) && isTextual(rhsLower)) return true;

    const isNumeric = (type: string): boolean =>
      [
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
      ].includes(type);

    if (lhsLower === "boolean" && isNumeric(rhsLower)) return true;
    if (rhsLower === "boolean" && isNumeric(lhsLower)) return true;
    if ((lhsLower === "tdatetime" || lhsLower === "date") && isNumeric(rhsLower)) return true;
    if ((rhsLower === "tdatetime" || rhsLower === "date") && isNumeric(lhsLower)) return true;

    if (lhsLower === "tcolor" && (rhsLower === "tcolor" || isNumeric(rhsLower))) return true;
    if (rhsLower === "tcolor" && (lhsLower === "tcolor" || isNumeric(lhsLower))) return true;

    if (areResolvedTypeNamesEquivalent(rhsType, lhsType, indexer)) return true;
    if (TypeResolver.areDelegateSignaturesCompatible(rhsType, lhsType, indexer)) return true;
    if (isLikelyGenericTypeParameter(lhsType) || isLikelyGenericTypeParameter(rhsType)) return true;
    if (areSameGenericTemplateCompatible(rhsType, lhsType, indexer)) return true;

    // Data7 treats StringList / TStringList as interchangeable list-of-string types
    // (StringList inherits TStringList in the catalog, but APIs accept either freely).
    if (isStringListFamily(lhsLower) && isStringListFamily(rhsLower)) return true;

    if (isNumeric(lhsLower) && isNumeric(rhsLower)) return true;
    if (lhsLower === "variant" || rhsLower === "variant") return true;

    if (DiagnosticsLinter.isWideningNumericConversion(rhsLower, lhsLower)) return true;

    const lhsIsPrimitive = PRIMITIVE_TYPES.has(lhsLower);
    const rhsIsPrimitive = PRIMITIVE_TYPES.has(rhsLower);

    if (rhsLower === "null") return !lhsIsPrimitive || lhsIsTObjectRoot;
    if (rhsLower === "unassigned") {
      if (lhsLower === "variant") return true;
      if (!lhsIsPrimitive && !TypeResolver.findClassSymbol(lhsType, indexer)) return true;
      return lhsIsPrimitive && !lhsIsTObjectRoot;
    }

    // Every Data7 workspace class implicitly descends from TObject. TObject is
    // listed in PRIMITIVE_TYPES because it is globally available, but assignment
    // compatibility must treat it as the root object type before the generic
    // primitive-vs-object rejection below.
    if (lhsIsTObjectRoot) return !rhsIsPrimitive;

    if (
      lhsLower === "tprimitive" &&
      (rhsIsPrimitive ||
        rhsLower === "tprimitive" ||
        TypeResolver.isSubclassOf(rhsType, lhsType, indexer))
    ) {
      return true;
    }

    if (lhsIsPrimitive || rhsIsPrimitive) return false;

    const rhsClass = TypeResolver.findClassSymbol(rhsType, indexer);
    const lhsClass = TypeResolver.findClassSymbol(lhsType, indexer);
    if (
      rhsClass &&
      lhsClass &&
      TypeResolver.areEnumTypesStrictlyCompatible(rhsType, lhsType, indexer) === false &&
      inheritsFromTEnum(rhsClass.inheritsFrom) &&
      inheritsFromTEnum(lhsClass.inheritsFrom)
    ) {
      return false;
    }

    return TypeResolver.isSubclassOf(rhsType, lhsType, indexer);
  }

  private static isWideningNumericConversion(rhsType: string, lhsType: string): boolean {
    const numericRanks: Readonly<Record<string, number>> = {
      byte: 0,
      short: 1,
      integer: 2,
      long: 3,
      longint: 3,
      single: 4,
      double: 5,
      extended: 6,
      currency: 7,
      decimal: 8,
    };
    const rhsRank = numericRanks[rhsType];
    const lhsRank = numericRanks[lhsType];
    return rhsRank !== undefined && lhsRank !== undefined && rhsRank <= lhsRank;
  }

  private static readonly DEFAULT_SEVERITY: Readonly<Record<string, vscode.DiagnosticSeverity>> = {
    [DiagnosticCodes.MissingImport]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.UnusedImport]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.DuplicateImport]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.CircularImport]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.UnknownMember]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.PrivateMemberAccess]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.EventSignatureMismatch]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.LambdaSignatureMismatch]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.UnsupportedMember]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.ModuleNotFound]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.ModuleNotDeclared]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.NotEnumerable]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.UnknownSuppressionCode]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.InvalidInterpolation]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.TernaryContextUnsupported]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.UnknownTemplate]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.GenericArityMismatch]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.DuplicateTemplate]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.ClassGenericMethodUnsupported]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.FlatNameCollision]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.InstantiationLimitExceeded]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.DuplicateDeclaration]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.UnknownType]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.IncompleteMemberAccess]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.UnterminatedBlock]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.TypedConstUnsupported]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.InvalidSharedMember]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.RedundantPublicModifier]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.UnusedCode]: vscode.DiagnosticSeverity.Hint,
    [DiagnosticCodes.LooseValueStatement]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.AbstractInstantiation]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.AutoNewNonDefaultCtor]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.SealedInheritance]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.MustOverrideNotImplemented]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.InvalidClassModifierCombination]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.MissingMyBaseNew]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.MissingReturnType]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.IncompletePropertyBody]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.InstanceMemberAccessOnType]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.ChainedInstantiationAccess]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.SubUsedAsFunction]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.UnknownSymbol]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.LooseTypeStatement]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.CallParenthesesMismatch]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.ChainedGlobalFunctionAssignment]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.SharedReturnGlobalFunction]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.ObjectCreationParenthesesMissing]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.DeclarationParenthesesMismatch]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.DeclareNameParentheses]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.FunctionReadSelf]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.InvalidAssignmentTarget]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.MissingReturnValue]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.RedundantTerminalExit]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.UnreachableDeclaration]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.MissingMyBaseFree]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.TypeMismatch]: vscode.DiagnosticSeverity.Error,
    [LegacyDiagnosticCodes.FinallyBlockUnsupported]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.ElseIfWhitespace]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.LineContinuationWithoutBreak]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.MissingThen]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.ReturnUnrecommended]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.ReturnAssignmentInCatch]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.InlineIfThen]: vscode.DiagnosticSeverity.Warning,
  };

  private static readonly VALID_DIAGNOSTIC_CODES: ReadonlySet<string> = new Set([
    ...Object.values(DiagnosticCodes),
    ...Object.values(LegacyDiagnosticCodes),
  ]);

  private readonly isStrict: boolean;

  constructor(options?: { strict?: boolean }) {
    this.isStrict = options?.strict ?? false;
  }

  public static runAdvancedDiagnostics(
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
    options?: { readonly isCancelled?: () => boolean },
  ): vscode.Diagnostic[] {
    const uriStr = document.uri.toString();
    const fingerprint = indexer.buildLintContextFingerprint(uriStr, document.getText());
    const cached = SemanticLintCache.getInstance().get(indexer.lintCacheScope, uriStr, fingerprint);
    if (cached) {
      LintPipelineProfiler.recordSemanticCacheHit(uriStr);
      return [...cached];
    }

    LintPipelineProfiler.recordSemanticCacheMiss(uriStr);
    const result = new DiagnosticsLinter().runDiagnostics(document, indexer, options);
    if (options?.isCancelled?.()) {
      return result;
    }
    SemanticLintCache.getInstance().set(indexer.lintCacheScope, uriStr, fingerprint, result);
    return result;
  }

  public runDiagnostics(
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
    options?: { readonly isCancelled?: () => boolean },
  ): vscode.Diagnostic[] {
    if (document.uri.scheme === "data7-preview") {
      return [];
    }
    const tracker = new TimeTracker(
      `Análise do Linter no arquivo ${vscode.workspace.asRelativePath(document.uri)}`,
    );
    try {
      const diagnostics: vscode.Diagnostic[] = [];
      const text = document.getText();
      const isCancelled = options?.isCancelled;

      if (this.isStrict) {
        const { errors } = parseBasic(text, { plugins: [] });
        errors.forEach((err) => {
          const line = Math.max(0, err.loc.line - 1);
          const col = Math.max(0, err.loc.column);
          const range = new vscode.Range(line, col, line, col + 1);
          const diag = new vscode.Diagnostic(
            range,
            `[Strict Native] ${err.message}`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = err.code;
          diag.source = "data7-strict";
          diagnostics.push(diag);
        });
      }

      const lines = text.split(/\r?\n/);
      DiagnosticsLinter.collectLineContinuationWithoutBreakDiagnostics(lines, diagnostics);

      const cached = LanguageProcessor.getInstance().getOrParse(document.uri.toString(), text);
      const unit = cached.unit;
      warmLintTypeResolutionIndexes(unit, document, indexer, isCancelled);
      cached.errors.forEach((err) => {
        const line = Math.max(0, err.loc.line - 1);
        const col = Math.max(0, err.loc.column);
        const range = new vscode.Range(line, col, line, col + 1);
        const diag = new vscode.Diagnostic(range, err.message, vscode.DiagnosticSeverity.Error);
        diag.code =
          err.code === "incomplete-member-access"
            ? DiagnosticCodes.IncompleteMemberAccess
            : err.code === "unterminated-block"
              ? DiagnosticCodes.UnterminatedBlock
              : err.code;
        diag.source = "data7";
        diagnostics.push(diag);
      });

      // Run the AST-based linter walker
      if (isCancelled?.()) {
        return DiagnosticsLinter.postProcessDiagnostics(diagnostics, text);
      }
      const tWalker = new TimeTracker(" -> Walker do Linter");
      const unitIndex = LintUnitIndex.build(unit);
      const walker = new DiagnosticsASTWalker(
        document,
        indexer,
        text,
        lines,
        diagnostics,
        unitIndex,
        isCancelled,
      );
      walker.run(unit);
      tWalker.stopAndLog();

      if (isCancelled?.()) {
        return DiagnosticsLinter.postProcessDiagnostics(diagnostics, text);
      }

      // Validate duplicate declarations using AST structure
      const tDup = new TimeTracker(" -> Declaracoes Duplicadas");
      validateDuplicateDeclarations(unit, document, indexer, diagnostics);
      tDup.stopAndLog();

      if (isCancelled?.()) {
        return DiagnosticsLinter.postProcessDiagnostics(diagnostics, text);
      }

      // Validate that no type declaration shares its name with the enclosing namespace
      const tNs = new TimeTracker(" -> Conflitos de Namespace");
      validateNamespaceNameConflicts(document, indexer, diagnostics);
      tNs.stopAndLog();

      // Yield point before the generics pre-pass: it walks the already-parsed
      // unit plus every external template, and is the costliest rule after the walker.
      if (isCancelled?.()) {
        return DiagnosticsLinter.postProcessDiagnostics(diagnostics, text);
      }

      if (readConfiguration().features.language.generics) {
        // The generic pre-pass is an optional language extension. Keeping this
        // gate here also prevents generic-only diagnostics in native projects.
        const tGen = new TimeTracker(" -> Analise Generics");
        const genericWarnings = collectGenericsContextFromUnit(unit, lines, {
          externalTemplates: collectWorkspaceGenericTemplates(indexer, document.uri.toString()),
        }).warnings;
        diagnostics.push(...collectGenericDiagnostics(genericWarnings, lines));
        tGen.stopAndLog();
      }

      if (isCancelled?.()) {
        return DiagnosticsLinter.postProcessDiagnostics(diagnostics, text);
      }

      // Directives list is comments-based so it must remain textual scan
      const directives = listSuppressionDirectives(text);
      for (const directive of directives) {
        if (!directive.codes) continue;
        for (const rawCode of directive.codes) {
          const codeLower = rawCode.toLowerCase();
          if (DiagnosticsLinter.VALID_DIAGNOSTIC_CODES.has(codeLower)) continue;
          const lineText = lines[directive.line] ?? "";
          const codeStart = lineText.indexOf(rawCode, directive.codesColumn);
          const start = codeStart >= 0 ? codeStart : directive.codesColumn;
          const range = new vscode.Range(
            directive.line,
            start,
            directive.line,
            start + rawCode.length,
          );
          const diag = new vscode.Diagnostic(
            range,
            `Código "${rawCode}" inexistente em DiagnosticCodes. Diretiva de supressão ineficaz.`,
            vscode.DiagnosticSeverity.Warning,
          );
          diag.code = DiagnosticCodes.UnknownSuppressionCode;
          const payload: UnknownSuppressionCodePayload = {
            code: DiagnosticCodes.UnknownSuppressionCode,
            suppressedCode: rawCode,
          };
          setDiagnosticPayload(diag, payload);
          diagnostics.push(diag);
        }
      }

      return DiagnosticsLinter.postProcessDiagnostics(diagnostics, text);
    } finally {
      tracker.stopAndLog();
    }
  }

  private static collectLineContinuationWithoutBreakDiagnostics(
    lines: readonly string[],
    diagnostics: vscode.Diagnostic[],
  ): void {
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx] ?? "";
      const tokens = tokenizeLine(line, { includeWhitespace: false }).filter(
        (token) => token.kind !== "comment",
      );
      if (tokens.length === 0) continue;

      for (let tokenIdx = 0; tokenIdx < tokens.length; tokenIdx++) {
        const token = tokens[tokenIdx];
        if (!token) continue;
        const nextToken = tokens[tokenIdx + 1];
        if (!nextToken) continue;

        if (token.kind === "number" && token.value.endsWith("_")) {
          this.pushLineContinuationWithoutBreakDiagnostic(
            diagnostics,
            lineIdx,
            token.col + token.value.length - 1,
          );
          continue;
        }

        if (
          token.kind === "identifier" &&
          token.value === "_" &&
          this.looksLikeInlineLineContinuation(tokens, tokenIdx)
        ) {
          this.pushLineContinuationWithoutBreakDiagnostic(diagnostics, lineIdx, token.col);
        }
      }
    }
  }

  private static looksLikeInlineLineContinuation(
    tokens: readonly Exclude<LineToken, { kind: "comment" }>[],
    tokenIdx: number,
  ): boolean {
    const previous = tokens[tokenIdx - 1];
    const next = tokens[tokenIdx + 1];
    if (!previous || !next) return false;
    if (
      previous.kind === "keyword" &&
      ["dim", "const", "as"].includes(previous.value.toLowerCase())
    ) {
      return false;
    }
    if (next.kind === "keyword" && next.value.toLowerCase() === "as") return false;
    return true;
  }

  private static pushLineContinuationWithoutBreakDiagnostic(
    diagnostics: vscode.Diagnostic[],
    lineIdx: number,
    column: number,
  ): void {
    const range = new vscode.Range(lineIdx, column, lineIdx, column + 1);
    const diag = new vscode.Diagnostic(
      range,
      "O marcador '_' de continuacao de linha esta na mesma linha do codigo seguinte. Remova o marcador ou quebre a linha nesse ponto.",
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.LineContinuationWithoutBreak;
    const payload: LineContinuationWithoutBreakPayload = {
      code: DiagnosticCodes.LineContinuationWithoutBreak,
      line: lineIdx,
      column,
    };
    setDiagnosticPayload(diag, payload);
    diagnostics.push(diag);
  }

  private static postProcessDiagnostics(
    diagnostics: readonly vscode.Diagnostic[],
    text: string,
  ): vscode.Diagnostic[] {
    const suppressions = extractSuppressedCodes(text);
    const overrides = readConfiguration().diagnosticSeverity;
    const output: vscode.Diagnostic[] = [];

    for (const diag of diagnostics) {
      const rawCode = diag.code;
      let codeStr: string;
      if (typeof rawCode === "string") {
        codeStr = rawCode;
      } else if (typeof rawCode === "number") {
        codeStr = String(rawCode);
      } else if (rawCode && typeof rawCode === "object" && "value" in rawCode) {
        codeStr = String(rawCode.value);
      } else {
        codeStr = "";
      }
      const lineIdx = diag.range.start.line;

      const target = suppressions.get(lineIdx);
      if (target === "*" || (target && codeStr && target.has(codeStr))) continue;

      const defaultSeverity =
        diag.severity !== vscode.DiagnosticSeverity.Error
          ? diag.severity
          : (this.DEFAULT_SEVERITY[codeStr] ?? diag.severity);
      const resolved = resolveDiagnosticSeverity(codeStr, defaultSeverity, overrides);
      if (resolved === undefined) continue;
      diag.severity = resolved;
      output.push(diag);
    }

    return output;
  }
}

function nodeScopeFromLoc(
  node: { readonly loc?: Node["loc"] } | undefined,
): ExternalTypeActiveScope | undefined {
  if (!node?.loc) return undefined;
  return {
    startLine: Math.max(0, node.loc.startLine - 1),
    endLine: Math.max(0, node.loc.endLine - 1),
  };
}

export class DiagnosticsASTWalker extends ASTWalker implements RuleContext {
  public activeNamespace: string | undefined;
  public activeClass: ClassDeclaration | undefined;
  public activeClassInheritedNames: Set<string> | undefined;
  public activeMethod: MethodDeclaration | undefined;
  public activeProperty: PropertyDeclaration | undefined;
  public conditionalBlockDepth = 0;

  private readonly parentStackInternal: Node[] = [];
  private readonly activeClassNestingInternal: string[] = [];
  private readonly scopes: Set<string>[] = [new Set()];
  private readonly allowedTernariesInternal = new Set<Node>();
  private readonly typeParamStack: Set<string>[] = [];
  private readonly externalTypeDirectives: readonly ExternalTypeDirective[];
  private readonly rules: readonly Rule[];
  private readonly declarationLintCache = DeclarationLintCache.getInstance();
  private readonly lintDependencyFingerprint: string;
  private readonly isCancelled?: () => boolean;
  private nodesVisited = 0;
  private cancelled = false;
  public readonly unitIndex: LintUnitIndex;

  constructor(
    public readonly document: vscode.TextDocument,
    public readonly indexer: WorkspaceSymbolIndexer,
    public readonly text: string,
    public readonly lines: readonly string[],
    public readonly diagnostics: vscode.Diagnostic[],
    unitIndex: LintUnitIndex,
    isCancelled?: () => boolean,
  ) {
    super();
    this.unitIndex = unitIndex;
    this.externalTypeDirectives = extractExternalTypeDirectives(text);
    this.lintDependencyFingerprint = indexer.buildLintDependencyFingerprint(
      document.uri.toString(),
    );
    this.isCancelled = isCancelled;
    this.rules = [
      new DeclarationsRule(),
      new ImportsRule(),
      new MembersRule(),
      new TypesRule(),
      new ControlFlowRule(),
      new ArraysRule(),
      new LifecycleRule(),
    ];
  }

  public get parentStack(): readonly Node[] {
    return this.parentStackInternal;
  }

  public get activeClassNesting(): readonly string[] {
    return this.activeClassNestingInternal;
  }

  public get allowedTernaries(): ReadonlySet<Node> {
    return this.allowedTernariesInternal;
  }

  public run(unit: CompilationUnit): void {
    for (const rule of this.rules) {
      rule.onStart?.(unit, this);
    }

    this.walk(unit);

    if (!this.cancelled) {
      for (const rule of this.rules) {
        rule.onEnd?.(unit, this);
      }
    }
  }

  public report(diagnostic: vscode.Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  public isGenericTypeParameter(name: string): boolean {
    const nameLower = name.toLowerCase();
    for (const set of this.typeParamStack) {
      if (set.has(nameLower)) return true;
    }
    return false;
  }

  public isLocalDeclared(name: string): boolean {
    return this.scopes.some((scope) => scope.has(name.toLowerCase()));
  }

  public isExternalTypeAllowed(typeName: string, lineIdx: number): boolean {
    return isExternalTypeAllowedByDirectives(
      this.externalTypeDirectives,
      typeName,
      lineIdx,
      this.getExternalTypeActiveScope(),
    );
  }

  private getExternalTypeActiveScope(): ExternalTypeActiveScope | undefined {
    const methodScope = nodeScopeFromLoc(this.activeMethod);
    if (methodScope) return methodScope;

    const propertyScope = nodeScopeFromLoc(this.activeProperty);
    if (propertyScope) return propertyScope;

    return nodeScopeFromLoc(this.activeClass);
  }

  public override walk(node: Node): void {
    if (this.cancelled) return;
    this.nodesVisited++;
    if (this.nodesVisited % 64 === 0 && this.isCancelled?.()) {
      this.cancelled = true;
      return;
    }

    const parent = this.parentStackInternal[this.parentStackInternal.length - 1];
    const isConditional = node.kind === "IfStatement" || node.kind === "SelectCaseStatement";

    if (isConditional) {
      this.conditionalBlockDepth++;
    }

    if (node.kind === "VariableDeclaration" && node.initializer?.kind === "TernaryExpression") {
      this.allowedTernariesInternal.add(node.initializer);
    }
    if (node.kind === "Assignment" && node.value.kind === "TernaryExpression") {
      this.allowedTernariesInternal.add(node.value);
    }
    if (node.kind === "VariableDeclaration" && node.name) {
      this.addLocal(node.name);
    }

    const prevNamespace = this.activeNamespace;
    const prevClass = this.activeClass;
    const prevClassInheritedNames = this.activeClassInheritedNames;
    const prevMethod = this.activeMethod;
    const prevProp = this.activeProperty;

    let pushedScope = false;
    let pushedTypeParams = false;

    if (node.kind === "NamespaceDeclaration") {
      this.activeNamespace = node.name;
    } else if (node.kind === "ClassDeclaration") {
      this.activeClassNestingInternal.push(node.name);
      this.activeClass = node;
      const classSymbol = TypeResolver.findClassSymbol(node.name, this.indexer);
      this.activeClassInheritedNames = classSymbol
        ? new Set(
            TypeResolver.getInheritedMembersForClassSymbol(classSymbol, this.indexer).map(
              (member) => member.name.toLowerCase(),
            ),
          )
        : new Set();
      pushedTypeParams = this.pushTypeParameters(node.typeParameters);
    } else if (node.kind === "MethodDeclaration") {
      this.activeMethod = node;
      this.pushScope();
      pushedScope = true;
      node.parameters.forEach((parameter) => this.addLocal(parameter.name));
      pushedTypeParams = this.pushTypeParameters(node.typeParameters);
    } else if (node.kind === "DelegateDeclaration") {
      pushedTypeParams = this.pushTypeParameters(node.typeParameters);
    } else if (node.kind === "PropertyDeclaration") {
      this.activeProperty = node;
      this.pushScope();
      pushedScope = true;
      node.parameters?.forEach((parameter) => this.addLocal(parameter.name));
    } else if (node.kind === "ForStatement") {
      this.pushScope();
      pushedScope = true;
      if (node.counter.name) this.addLocal(node.counter.name);
    } else if (node.kind === "ForEachStatement") {
      this.pushScope();
      pushedScope = true;
      if (node.elementVar.name) this.addLocal(node.elementVar.name);
    } else if (node.kind === "UsingStatement") {
      this.pushScope();
      pushedScope = true;
      if (node.resourceVar.name) this.addLocal(node.resourceVar.name);
    } else if (node.kind === "TryCatchStatement") {
      if (node.catchVar) {
        this.pushScope();
        pushedScope = true;
        if (node.catchVar.name) this.addLocal(node.catchVar.name);
      }
    } else if (node.kind === "Block") {
      const isSyntheticMultiDeclaration = node.statements.every(
        (statement) => statement.kind === "VariableDeclaration",
      );
      if (!isSyntheticMultiDeclaration) {
        this.pushScope();
        pushedScope = true;
      }
    } else if (node.kind === "ArrowFunctionExpression") {
      this.pushScope();
      pushedScope = true;
      node.parameters.forEach((parameter) => {
        if (parameter.name) this.addLocal(parameter.name);
      });
    }

    let cachedBodyDiagnostics: readonly vscode.Diagnostic[] | undefined;
    let declarationCacheKey: string | undefined;
    let skipChildWalk = false;

    if (node.kind === "MethodDeclaration" || node.kind === "PropertyDeclaration") {
      const target: DeclarationLintTarget =
        node.kind === "MethodDeclaration"
          ? { kind: "MethodDeclaration", node }
          : { kind: "PropertyDeclaration", node };
      const bodyHash = hashDeclarationBody(target, this.lines);
      declarationCacheKey = this.declarationLintCache.buildCacheKey(
        this.indexer.lintCacheScope,
        this.document.uri.toString(),
        this.activeClass?.name,
        target,
      );
      cachedBodyDiagnostics = this.declarationLintCache.get(
        declarationCacheKey,
        this.lintDependencyFingerprint,
        bodyHash,
      );
      if (cachedBodyDiagnostics) {
        skipChildWalk = true;
      }
    }

    if (!cachedBodyDiagnostics) {
      for (const rule of this.rules) {
        const kinds = rule.supportedNodeKinds;
        if (kinds && !kinds.has(node.kind)) continue;
        rule.checkNode?.(node, this, parent);
      }
    }

    if (cachedBodyDiagnostics) {
      for (const diagnostic of cachedBodyDiagnostics) {
        this.diagnostics.push(diagnostic);
      }
    }

    if (!skipChildWalk) {
      const bodyDiagStart = declarationCacheKey !== undefined ? this.diagnostics.length : undefined;

      this.parentStackInternal.push(node);
      super.walk(node);
      this.parentStackInternal.pop();

      if (declarationCacheKey !== undefined && bodyDiagStart !== undefined) {
        if (node.kind === "MethodDeclaration") {
          const bodyHash = hashDeclarationBody({ kind: "MethodDeclaration", node }, this.lines);
          const bodyDiagnostics = this.diagnostics.slice(bodyDiagStart);
          this.declarationLintCache.set(
            declarationCacheKey,
            this.lintDependencyFingerprint,
            bodyHash,
            bodyDiagnostics,
          );
          this.declarationLintCache.trackFileKey(
            this.indexer.lintCacheScope,
            this.document.uri.toString(),
            declarationCacheKey,
          );
        } else if (node.kind === "PropertyDeclaration") {
          const bodyHash = hashDeclarationBody({ kind: "PropertyDeclaration", node }, this.lines);
          const bodyDiagnostics = this.diagnostics.slice(bodyDiagStart);
          this.declarationLintCache.set(
            declarationCacheKey,
            this.lintDependencyFingerprint,
            bodyHash,
            bodyDiagnostics,
          );
          this.declarationLintCache.trackFileKey(
            this.indexer.lintCacheScope,
            this.document.uri.toString(),
            declarationCacheKey,
          );
        }
      }
    }

    if (isConditional) {
      this.conditionalBlockDepth--;
    }

    if (pushedScope) {
      this.popScope();
    }

    if (pushedTypeParams) {
      this.typeParamStack.pop();
    }

    this.activeNamespace = prevNamespace;
    if (node.kind === "ClassDeclaration") {
      this.activeClassNestingInternal.pop();
    }
    this.activeClass = prevClass;
    this.activeClassInheritedNames = prevClassInheritedNames;
    this.activeMethod = prevMethod;
    this.activeProperty = prevProp;
  }

  private pushScope(): void {
    this.scopes.push(new Set());
  }

  private popScope(): void {
    this.scopes.pop();
  }

  private addLocal(name: string): void {
    this.scopes[this.scopes.length - 1]?.add(name.toLowerCase());
  }

  private pushTypeParameters(
    typeParameters: readonly { readonly name: string }[] | undefined,
  ): boolean {
    if (!typeParameters || typeParameters.length === 0) return false;

    const set = new Set<string>();
    typeParameters.forEach((typeParameter) => set.add(typeParameter.name.toLowerCase()));
    this.typeParamStack.push(set);
    return true;
  }
}

/** True when inheritsFrom is TEnum or a qualified alias (mod_tenum.TEnum). */
function inheritsFromTEnum(inheritsFrom: string | undefined): boolean {
  if (!inheritsFrom) return false;
  const lower = inheritsFrom.toLowerCase();
  return lower === "tenum" || lower.endsWith(".tenum");
}

/** StringList / TStringList / TStrings are interchangeable list-of-string APIs in Data7. */
function isStringListFamily(typeLower: string): boolean {
  const simple = typeLower.includes(".")
    ? typeLower.slice(typeLower.lastIndexOf(".") + 1)
    : typeLower;
  return simple === "stringlist" || simple === "tstringlist" || simple === "tstrings";
}
