import * as vscode from "vscode";
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
import { detectEnumerable } from "../analysis/enumerable-detector";
import { analyzeGenericsPass } from "../analysis/generics-analyzer";
import { collectGenericDiagnostics, collectWorkspaceGenericTemplates } from "./generic-diagnostics";
import type {
  InvalidInterpolationPayload,
  MissingImportPayload,
  NotEnumerablePayload,
  TernaryContextUnsupportedPayload,
  UnknownSuppressionCodePayload,
  UnsupportedMemberPayload,
  FinallyBlockUnsupportedPayload,
  MissingThenPayload,
  ElseIfWhitespacePayload,
  LineContinuationWithoutBreakPayload,
  ReturnUnrecommendedPayload,
  ReturnAssignmentInCatchPayload,
  InlineIfThenPayload,
  CallParenthesesMismatchPayload,
  ChainedGlobalFunctionAssignmentPayload,
  SharedReturnGlobalFunctionPayload,
} from "./diagnostic-codes";
import { DiagnosticCodes, LegacyDiagnosticCodes, setDiagnosticPayload } from "./diagnostic-codes";
import { PRIMITIVE_TYPES } from "../utils/primitive-types";
import { readConfiguration, resolveDiagnosticSeverity } from "../infra/configuration";
import {
  extractSuppressedCodes,
  listSuppressionDirectives,
  getCommentStartIndex,
} from "../utils/suppression-comments";
import { parseInterpolation } from "../utils/interpolation";
import { LanguageProcessor } from "../analysis/language-processor";
import { ASTFlowAnalyzer } from "./ast-flow-analyzer";
import { ASTWordCollector } from "./ast-collectors";
import { collectTransitivelyRequiredImports } from "./import-usage";
import {
  validateDuplicateDeclarations,
  validateMyBaseFreeCalls,
  validateMyBaseNewCalls,
  validateNamespaceNameConflicts,
} from "./structural-diagnostics";
import {
  areResolvedTypeNamesEquivalent,
  areSameGenericTemplateCompatible,
  attachUnknownMemberSuggestions,
  exprToString,
  findClosest,
  inheritsFromClass,
  isLikelyGenericTypeParameter,
  isQualifiedTypeInvocation,
  typeRefToString,
} from "./diagnostic-helpers";
import {
  ASTWalker,
  type CompilationUnit,
  type ClassDeclaration,
  type MethodDeclaration,
  type DelegateDeclaration,
  type PropertyDeclaration,
  type VariableDeclaration,
  type Node,
  type MemberAccess,
  type ArrayAccessExpression,
  type MethodInvocation,
  type ObjectCreationExpression,
  type TypeReference,
  type ForEachStatement,
  type TaggedTemplateExpression,
  type TernaryExpression,
  type Assignment,
  type Expression,
  type ExpressionStatement,
  type SourceLocation,
  type TryCatchStatement,
  type IfStatement,
  type ReturnStatement,
} from "../project/ast/ast";
import { tokenizeLine, type LineToken } from "../project/parser/lexer";

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

    let nameToCheck = className;
    let containerToCheck: string | undefined;
    const lastDotIdx = className.lastIndexOf(".");
    if (lastDotIdx !== -1) {
      nameToCheck = className.substring(lastDotIdx + 1);
      containerToCheck = className.substring(0, lastDotIdx);
    }

    const inSystem = lookupSystemByName(nameToCheck).some((s) => {
      if (s.kind !== "class" && s.kind !== "structure") return false;
      if (containerToCheck) {
        return s.containerName?.toLowerCase() === containerToCheck.toLowerCase();
      }
      return true;
    });
    if (inSystem) return true;

    const symbol = indexer.findSymbolByName(nameToCheck);
    if (symbol && (symbol.kind === "class" || symbol.kind === "structure")) {
      if (containerToCheck) {
        if (symbol.containerName?.toLowerCase() === containerToCheck.toLowerCase()) {
          return true;
        }
      } else {
        return true;
      }
    }

    const symbolDirect = indexer.findSymbolByName(className);
    if (symbolDirect && (symbolDirect.kind === "class" || symbolDirect.kind === "structure")) {
      return true;
    }

    return false;
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
    const activeNamespace = fileSyms?.symbols.find((s) => s.kind === "namespace")?.name;

    const workspaceMatches = indexer
      .getSymbolsByName(name)
      .filter(
        (s) =>
          (s.kind === "class" ||
            s.kind === "structure" ||
            s.kind === "delegate" ||
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
      for (const s of indexer.getAllSymbols()) {
        if (s.kind === "class" || s.kind === "structure" || s.kind === "delegate") {
          allTypes.add(s.name);
        }
      }
      for (const s of SYSTEM_SYMBOLS) {
        if (s.kind === "class" || s.kind === "structure" || s.kind === "delegate") {
          allTypes.add(s.name);
        }
      }
      const suggestions = findClosest(typeName, Array.from(allTypes));
      if (suggestions.length > 0) {
        setDiagnosticPayload(diag, {
          code: DiagnosticCodes.UnknownType,
          typeName,
          suggestions,
        });
      }

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
        const nsLower = ns.toLowerCase();

        if (activeNamespace?.toLowerCase() === nsLower) {
          isValid = true;
          break;
        }
        if (fileSyms?.imports.some((imp) => imp.toLowerCase() === nsLower)) {
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
    if (isLikelyGenericTypeParameter(lhsType) || isLikelyGenericTypeParameter(rhsType)) return true;
    if (areSameGenericTemplateCompatible(rhsType, lhsType, indexer)) return true;

    if (isNumeric(lhsLower) && isNumeric(rhsLower)) return true;
    if (lhsLower === "variant" || rhsLower === "variant") return true;

    if (DiagnosticsLinter.isWideningNumericConversion(rhsLower, lhsLower)) return true;

    const lhsIsPrimitive = PRIMITIVE_TYPES.has(lhsLower);
    const rhsIsPrimitive = PRIMITIVE_TYPES.has(rhsLower);

    if (rhsLower === "null") return !lhsIsPrimitive || lhsIsTObjectRoot;
    if (rhsLower === "unassigned") return lhsIsPrimitive && !lhsIsTObjectRoot;

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
    [DiagnosticCodes.UnknownMember]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.PrivateMemberAccess]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.EventSignatureMismatch]: vscode.DiagnosticSeverity.Error,
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
    [DiagnosticCodes.MissingMyBaseNew]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.InstanceMemberAccessOnType]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.SubUsedAsFunction]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.UnknownSymbol]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.LooseTypeStatement]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.CallParenthesesMismatch]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.ChainedGlobalFunctionAssignment]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.SharedReturnGlobalFunction]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.ObjectCreationParenthesesMissing]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.DeclarationParenthesesMismatch]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.FunctionReadSelf]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.InvalidAssignmentTarget]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.MissingReturnValue]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.RedundantTerminalExit]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.DeadCode]: vscode.DiagnosticSeverity.Warning,
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
  ): vscode.Diagnostic[] {
    return new DiagnosticsLinter().runDiagnostics(document, indexer);
  }

  public runDiagnostics(
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
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

      // Run the AST-based linter walker
      const tWalker = new TimeTracker(" -> Walker do Linter");
      const walker = new DiagnosticsASTWalker(document, indexer, text, lines, diagnostics);
      walker.run(unit);
      tWalker.stopAndLog();

      // Validate duplicate declarations using AST structure
      const tDup = new TimeTracker(" -> Declaracoes Duplicadas");
      validateDuplicateDeclarations(unit, document, indexer, diagnostics);
      tDup.stopAndLog();

      // Validate that no type declaration shares its name with the enclosing namespace
      const tNs = new TimeTracker(" -> Conflitos de Namespace");
      validateNamespaceNameConflicts(document, indexer, diagnostics);
      tNs.stopAndLog();

      // Validate constructor calls (Sub New calls MyBase.New) using AST structure
      const tCtor = new TimeTracker(" -> Validar Construtores");
      validateMyBaseNewCalls(unit, diagnostics);
      tCtor.stopAndLog();

      // Validate destructor resource cleanup (Sub Free calls MyBase.Free) using AST structure
      const tDtor = new TimeTracker(" -> Validar Destrutores");
      validateMyBaseFreeCalls(unit, indexer.getFileSymbols(document.uri.toString()), diagnostics);
      tDtor.stopAndLog();

      if (readConfiguration().features.language.generics) {
        // The generic pre-pass is an optional language extension. Keeping this
        // gate here also prevents generic-only diagnostics in native projects.
        const tGen = new TimeTracker(" -> Analise Generics");
        const genericWarnings = analyzeGenericsPass(text, {
          externalTemplates: collectWorkspaceGenericTemplates(indexer, document.uri.toString()),
        });
        diagnostics.push(...collectGenericDiagnostics(genericWarnings, lines));
        tGen.stopAndLog();
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

function isIdentifierChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char);
}

const SYSTEM_SYMBOL_NAMES = new Set(SYSTEM_SYMBOLS.map((s) => s.name.toLowerCase()));

export class DiagnosticsASTWalker extends ASTWalker {
  // Developer Studio accepts Finally blocks; retain the legacy diagnostic implementation only
  // for backwards-compatible code-action payload handling from older extension versions.
  private static readonly LEGACY_FINALLY_WARNING_ENABLED: boolean = true;
  private activeClass: ClassDeclaration | undefined;
  private activeClassInheritedNames: Set<string> | undefined;
  private activeMethod: MethodDeclaration | undefined;
  private activeProperty: PropertyDeclaration | undefined;
  private conditionalBlockDepth = 0;

  private timeIdentifier = 0;
  private timeMethodInvocation = 0;
  private timeMemberAccess = 0;
  private timeOtherChecks = 0;
  private timeAstTraversal = 0;
  private timeFlowAnalyzer = 0;
  private timeCheckSelfRead = 0;

  private readonly parentStack: Node[] = [];
  private readonly scopes: Set<string>[] = [new Set()];
  private readonly allowedTernaries = new Set<TernaryExpression>();
  private readonly imports: { name: string; loc: SourceLocation }[] = [];
  private readonly typeParamStack: Set<string>[] = [];
  private readonly nativeArrayDeclarations: {
    readonly name: string;
    readonly rank: number;
    readonly line: number;
    readonly isField: boolean;
  }[] = [];

  private isGenericTypeParameter(name: string): boolean {
    const nameLower = name.toLowerCase();
    for (const set of this.typeParamStack) {
      if (set.has(nameLower)) return true;
    }
    return false;
  }

  constructor(
    private readonly document: vscode.TextDocument,
    private readonly indexer: WorkspaceSymbolIndexer,
    private readonly text: string,
    private readonly lines: readonly string[],
    private readonly diagnostics: vscode.Diagnostic[],
  ) {
    super();
  }

  public run(unit: CompilationUnit): void {
    this.collectNativeArrayDeclarations(unit);

    // Phase 1: Collect used words to identify unused imports
    const wordCollector = new ASTWordCollector();
    wordCollector.walk(unit);

    // Phase 2: Walk AST for structure diagnostics and import declarations.
    this.walk(unit);

    const directlyReferencedImports = new Set<string>();
    for (const imp of this.imports) {
      if (this.isImportDirectlyReferenced(imp.name, wordCollector)) {
        directlyReferencedImports.add(imp.name.toLowerCase());
      }
    }
    const transitivelyRequiredImports = collectTransitivelyRequiredImports(
      this.indexer,
      directlyReferencedImports,
    );

    // Phase 3: Unused and duplicate imports check
    const seenImports = new Map<string, SourceLocation>();
    this.imports.forEach((imp) => {
      const key = imp.name.toLowerCase();
      const firstLoc = seenImports.get(key);
      const range = new vscode.Range(
        imp.loc.startLine - 1,
        imp.loc.startChar,
        imp.loc.endLine - 1,
        imp.loc.endChar,
      );

      if (firstLoc !== undefined) {
        const diag = new vscode.Diagnostic(
          range,
          `Imports duplicado: "${imp.name}" já foi declarado na linha ${firstLoc.startLine}.`,
          vscode.DiagnosticSeverity.Warning,
        );
        diag.code = DiagnosticCodes.DuplicateImport;
        setDiagnosticPayload(diag, {
          code: DiagnosticCodes.UnusedImport,
          namespace: imp.name,
        });
        this.diagnostics.push(diag);
        return;
      }
      seenImports.set(key, imp.loc);

      const isReferenced =
        directlyReferencedImports.has(key) || transitivelyRequiredImports.has(key);

      if (!isReferenced) {
        const diag = new vscode.Diagnostic(
          range,
          `Importação desnecessária ou não utilizada: "${imp.name}".`,
          vscode.DiagnosticSeverity.Warning,
        );
        diag.code = DiagnosticCodes.UnusedImport;
        setDiagnosticPayload(diag, {
          code: DiagnosticCodes.UnusedImport,
          namespace: imp.name,
        });
        this.diagnostics.push(diag);
      }
    });

    // console.log(`[PERF ACCUM] ${vscode.workspace.asRelativePath(this.document.uri)} -> Identifier: ${this.timeIdentifier.toFixed(2)} ms`);
    // console.log(`[PERF ACCUM] ${vscode.workspace.asRelativePath(this.document.uri)} -> MethodInvocation: ${this.timeMethodInvocation.toFixed(2)} ms`);
    // console.log(`[PERF ACCUM] ${vscode.workspace.asRelativePath(this.document.uri)} -> MemberAccess: ${this.timeMemberAccess.toFixed(2)} ms`);
    // console.log(`[PERF ACCUM] ${vscode.workspace.asRelativePath(this.document.uri)} -> OtherChecks: ${this.timeOtherChecks.toFixed(2)} ms`);
    // console.log(`[PERF ACCUM] ${vscode.workspace.asRelativePath(this.document.uri)} -> AstTraversal: ${this.timeAstTraversal.toFixed(2)} ms`);
    // console.log(`[PERF ACCUM] ${vscode.workspace.asRelativePath(this.document.uri)} -> FlowAnalyzer: ${this.timeFlowAnalyzer.toFixed(2)} ms`);
    // console.log(`[PERF ACCUM] ${vscode.workspace.asRelativePath(this.document.uri)} -> CheckSelfRead: ${this.timeCheckSelfRead.toFixed(2)} ms`);
  }

  private isImportDirectlyReferenced(name: string, wordCollector: ASTWordCollector): boolean {
    const key = name.toLowerCase();
    if (wordCollector.qualifiedTypes.has(key)) return true;

    const parts = key.split(".");
    const lastPart = parts[parts.length - 1];
    if (lastPart && wordCollector.usedWords.has(lastPart)) return true;

    const symbolsInNamespace = [
      ...this.indexer.getSymbolsByContainer(key),
      ...lookupSystemByContainer(name),
    ];
    return symbolsInNamespace.some((symbol) =>
      wordCollector.usedWords.has(symbol.name.toLowerCase()),
    );
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

  private isLocalDeclared(name: string): boolean {
    return this.scopes.some((s) => s.has(name.toLowerCase()));
  }

  public override walk(node: Node): void {
    const parent = this.parentStack[this.parentStack.length - 1];

    const isConditional = node.kind === "IfStatement" || node.kind === "SelectCaseStatement";
    if (isConditional) {
      this.conditionalBlockDepth++;
    }

    if (node.kind === "VariableDeclaration" && node.initializer?.kind === "TernaryExpression") {
      this.allowedTernaries.add(node.initializer);
    }
    if (node.kind === "Assignment" && node.value.kind === "TernaryExpression") {
      this.allowedTernaries.add(node.value);
    }

    if (node.kind === "VariableDeclaration" && node.name) {
      this.addLocal(node.name);
    }
    if (node.kind === "ObjectCreationExpression") {
      this.checkObjectCreationExpression(node);
    }

    const prevClass = this.activeClass;
    const prevClassInheritedNames = this.activeClassInheritedNames;
    const prevMethod = this.activeMethod;
    const prevProp = this.activeProperty;

    let pushedScope = false;
    let pushedTypeParams = false;

    if (node.kind === "ClassDeclaration") {
      this.activeClass = node;
      this.activeClassInheritedNames = new Set(
        TypeResolver.getInheritedMembers(node.name, this.indexer).map((m) => m.name.toLowerCase()),
      );
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (node.typeParameters && node.typeParameters.length > 0) {
        const set = new Set<string>();
        node.typeParameters.forEach((tp) => set.add(tp.name.toLowerCase()));
        this.typeParamStack.push(set);
        pushedTypeParams = true;
      }
    } else if (node.kind === "MethodDeclaration") {
      this.activeMethod = node;
      this.pushScope();
      pushedScope = true;
      node.parameters.forEach((p) => {
        this.addLocal(p.name);
      });
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (node.typeParameters && node.typeParameters.length > 0) {
        const set = new Set<string>();
        node.typeParameters.forEach((tp) => set.add(tp.name.toLowerCase()));
        this.typeParamStack.push(set);
        pushedTypeParams = true;
      }
    } else if (node.kind === "DelegateDeclaration") {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (node.typeParameters && node.typeParameters.length > 0) {
        const set = new Set<string>();
        node.typeParameters.forEach((tp) => set.add(tp.name.toLowerCase()));
        this.typeParamStack.push(set);
        pushedTypeParams = true;
      }
    } else if (node.kind === "PropertyDeclaration") {
      this.activeProperty = node;
      this.pushScope();
      pushedScope = true;
      node.parameters?.forEach((p) => {
        this.addLocal(p.name);
      });
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
        (stmt) => stmt.kind === "VariableDeclaration",
      );
      if (!isSyntheticMultiDeclaration) {
        this.pushScope();
        pushedScope = true;
      }
    } else if (node.kind === "ArrowFunctionExpression") {
      // Cria o escopo para os parâmetros da Arrow Function
      this.pushScope();
      pushedScope = true;
      const arrowNode = node; // Cast de segurança caso a tipagem strict do AST falhe
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (arrowNode.parameters) {
        arrowNode.parameters.forEach((p) => {
          if (p.name) this.addLocal(p.name); // Registra 'pIndex', 'pName', etc.
        });
      }
    }
    // } else if (node.kind === "Block") {
    //   const isSyntheticMultiDeclaration = node.statements.every(
    //     (stmt) => stmt.kind === "VariableDeclaration",
    //   );
    //   if (!isSyntheticMultiDeclaration) {
    //     this.pushScope();
    //     pushedScope = true;
    //   }
    // }

    // AST custom checks dispatcher
    const t0Dispatch = performance.now();
    switch (node.kind) {
      case "MemberAccess": {
        const t0 = performance.now();
        this.checkMemberAccess(node);
        this.timeMemberAccess += performance.now() - t0;
        break;
      }
      case "ArrayAccessExpression":
        this.checkArrayAccess(node);
        break;
      case "ForEachStatement":
        this.checkForEachStatement(node);
        break;
      case "TaggedTemplateExpression":
        this.checkTaggedTemplateExpression(node);
        break;
      case "TernaryExpression":
        this.checkTernaryExpression(node);
        break;
      case "Assignment":
        this.checkAssignment(node);
        break;
      case "VariableDeclaration":
        this.checkVariableDeclaration(node);
        break;
      case "MethodDeclaration":
        this.checkMethodDeclaration(node);
        break;
      case "DelegateDeclaration":
        this.checkDelegateDeclaration(node);
        break;
      case "ExpressionStatement":
        this.checkExpressionStatement(node);
        break;
      case "TryCatchStatement":
        this.checkTryCatchStatement(node);
        break;
      case "IfStatement":
        this.checkIfStatement(node);
        break;
      case "ReturnStatement":
        this.checkReturnStatement(node);
        break;
    }
    const t1Dispatch = performance.now();
    if (node.kind !== "MemberAccess") {
      this.timeOtherChecks += t1Dispatch - t0Dispatch;
    }

    // Bare Identifier Unknown Symbol check
    if (node.kind === "Identifier" && node.name && node.loc) {
      const t0Id = performance.now();
      const name = node.name;
      const nameLower = name.toLowerCase();

      let shouldSkip = false;

      // Skip keywords and constants
      if (
        PRIMITIVE_TYPES.has(nameLower) ||
        nameLower === "variant" ||
        nameLower === "tobject" ||
        nameLower === "void" ||
        nameLower === "true" ||
        nameLower === "false" ||
        nameLower === "null" ||
        nameLower === "nothing" ||
        nameLower === "me" ||
        nameLower === "mybase" ||
        nameLower === "value" ||
        nameLower === "addressof" ||
        nameLower === "unassigned"
      ) {
        shouldSkip = true;
      }

      if (parent) {
        // Skip MemberAccess member, MethodInvocation methodName (already verified, not bare identifier)
        if (parent.kind === "MemberAccess" && parent.member === name) {
          shouldSkip = true;
        }
        if (parent.kind === "MethodInvocation" && parent.methodName === name) {
          shouldSkip = true;
        }
        if (
          parent.kind === "MethodInvocation" &&
          parent.callee === node &&
          isQualifiedTypeInvocation(parent, this.indexer)
        ) {
          shouldSkip = true;
        }
        if (
          parent.kind === "MethodInvocation" &&
          parent.methodName.toLowerCase() === "ctype" &&
          parent.arguments[1] === node
        ) {
          shouldSkip = true;
        }
        // Skip declarations names themselves
        if (
          (parent.kind === "ClassDeclaration" && parent.name === name) ||
          (parent.kind === "MethodDeclaration" && parent.name === name) ||
          (parent.kind === "DelegateDeclaration" && parent.name === name) ||
          (parent.kind === "PropertyDeclaration" && parent.name === name) ||
          (parent.kind === "FieldDeclaration" && parent.name === name) ||
          (parent.kind === "VariableDeclaration" && parent.name === name) ||
          (parent.kind === "ParameterDeclaration" && parent.name === name)
        ) {
          shouldSkip = true;
        }
      }

      if (!shouldSkip) {
        const isDeclared =
          nameLower === this.activeMethod?.name.toLowerCase() ||
          nameLower === this.activeProperty?.name.toLowerCase() ||
          this.isLocalDeclared(name) ||
          this.isGenericTypeParameter(name) ||
          !!(
            this.activeClass &&
            (this.activeClassInheritedNames?.has(nameLower) ??
              TypeResolver.findMember(this.activeClass.name, name, this.indexer) !== undefined)
          ) ||
          this.indexer.getSymbolsByName(name).length > 0 ||
          SYSTEM_SYMBOL_NAMES.has(nameLower);

        if (!isDeclared) {
          const range = new vscode.Range(
            node.loc.startLine - 1,
            node.loc.startChar,
            node.loc.endLine - 1,
            node.loc.endChar,
          );
          const diag = new vscode.Diagnostic(
            range,
            `O símbolo "${name}" não foi encontrado no escopo atual.`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = DiagnosticCodes.UnknownSymbol;
          this.diagnostics.push(diag);
        }
      }
      this.timeIdentifier += performance.now() - t0Id;
    }

    this.parentStack.push(node);
    const t0Super = performance.now();
    super.walk(node);
    this.timeAstTraversal += performance.now() - t0Super;
    this.parentStack.pop();

    if (isConditional) {
      this.conditionalBlockDepth--;
    }

    if (pushedScope) {
      this.popScope();
    }

    if (pushedTypeParams) {
      this.typeParamStack.pop();
    }

    this.activeClass = prevClass;
    this.activeClassInheritedNames = prevClassInheritedNames;
    this.activeMethod = prevMethod;
    this.activeProperty = prevProp;
  }

  private collectNativeArrayDeclarations(unit: CompilationUnit): void {
    const declarations = this.nativeArrayDeclarations;
    new (class extends ASTWalker {
      public override walk(node: Node): void {
        if (
          (node.kind === "FieldDeclaration" || node.kind === "VariableDeclaration") &&
          node.nativeArrayDimensions !== undefined
        ) {
          declarations.push({
            name: node.name.toLowerCase(),
            rank: node.nativeArrayDimensions.length,
            line: Math.max(0, (node.loc?.startLine ?? 1) - 1),
            isField: node.kind === "FieldDeclaration",
          });
        }
        super.walk(node);
      }
    })().walk(unit);
  }

  protected override visitImportsDeclaration(node: Node): void {
    if (node.kind === "ImportsDeclaration" && node.loc) {
      this.imports.push({ name: node.target, loc: node.loc });
    }
  }

  protected override visitTypeReference(node: TypeReference): void {
    if (!node.loc) return;
    if (this.isGenericTypeParameter(node.name)) return;
    const lineIdx = node.loc.startLine - 1;
    const col = node.loc.startChar;

    // Direct validate type reference
    DiagnosticsLinter.validateTypeReference(
      node.name,
      lineIdx,
      col,
      this.document,
      this.indexer,
      this.diagnostics,
    );
  }

  private checkObjectCreationExpression(node: ObjectCreationExpression): void {
    if (!node.noParentheses || !node.type.loc) return;
    const range = new vscode.Range(
      node.type.loc.startLine - 1,
      node.type.loc.startChar,
      node.type.loc.endLine - 1,
      node.type.loc.endChar,
    );
    const diag = new vscode.Diagnostic(
      range,
      `A instanciação de "${node.type.name}" omitiu os parênteses do construtor. Recomenda-se usar "${node.type.name}()".`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.ObjectCreationParenthesesMissing;
    this.diagnostics.push(diag);
  }

  protected override visitMethodInvocation(node: MethodInvocation): void {
    if (!node.loc) return;
    const t0 = performance.now();
    const lineIdx = node.loc.startLine - 1;
    const lineText = this.lines[lineIdx] ?? "";
    const dotIndex = lineText.indexOf(".", node.loc.startChar);
    const startChar = dotIndex !== -1 ? dotIndex + 1 : node.loc.startChar;

    let parent = this.parentStack[this.parentStack.length - 1];
    if (parent === node) {
      parent = this.parentStack[this.parentStack.length - 2];
    }

    // Check CallParenthesesMismatch & SubUsedAsFunction
    const arity = node.arguments.length;
    let resolvedMethod: SymbolInfo | undefined;

    if (node.callee) {
      const prefixLower = exprToString(node.callee)?.toLowerCase() ?? "";
      let isStaticAccess = false;
      let typeName: string | undefined;
      if (prefixLower === "me") {
        typeName = this.activeClass?.name;
      } else if (prefixLower === "mybase") {
        typeName = this.activeClass?.baseType?.name ?? "TObject";
      } else {
        typeName = TypeResolver.resolveExpressionType(
          node.callee,
          this.document,
          lineIdx,
          this.indexer,
        );
        if (!typeName) {
          const staticAccess = this.resolveStaticReceiverAccess(node.callee);
          typeName = staticAccess.typeName;
          isStaticAccess = staticAccess.isStaticAccess;
        }
      }

      if (typeName) {
        const argumentTypes = node.arguments.map((arg) =>
          TypeResolver.resolveExpressionType(arg, this.document, lineIdx, this.indexer),
        );
        resolvedMethod =
          TypeResolver.findMemberWithArgumentTypes(
            typeName,
            node.methodName,
            this.indexer,
            argumentTypes,
          ) ?? TypeResolver.findMember(typeName, node.methodName, this.indexer, arity);

        // Check UnknownMember for method call
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (node.callee && DiagnosticsLinter.isKnownMemberContainer(typeName, this.indexer)) {
          const exists =
            resolvedMethod ?? TypeResolver.findMember(typeName, node.methodName, this.indexer);
          if (
            !exists &&
            typeName.toLowerCase() !== "variant" &&
            typeName.toLowerCase() !== "tobject" &&
            typeName.toLowerCase() !== "void"
          ) {
            const range = new vscode.Range(
              lineIdx,
              startChar,
              lineIdx,
              startChar + node.methodName.length,
            );
            const diag = new vscode.Diagnostic(
              range,
              `Membro "${node.methodName}" não encontrado na classe/tipo "${typeName}".`,
              vscode.DiagnosticSeverity.Error,
            );
            diag.code = DiagnosticCodes.UnknownMember;
            attachUnknownMemberSuggestions(
              diag,
              node.methodName,
              DiagnosticsLinter.collectMemberNames(typeName, this.indexer),
            );
            this.diagnostics.push(diag);
          } else if (
            exists &&
            isStaticAccess &&
            !exists.isShared &&
            exists.kind !== "class" &&
            exists.kind !== "structure" &&
            exists.kind !== "delegate"
          ) {
            const range = new vscode.Range(
              lineIdx,
              startChar,
              lineIdx,
              startChar + node.methodName.length,
            );
            const diag = new vscode.Diagnostic(
              range,
              `Acesso a membro de instância "${node.methodName}" diretamente no tipo "${typeName}".`,
              vscode.DiagnosticSeverity.Error,
            );
            diag.code = DiagnosticCodes.InstanceMemberAccessOnType;
            this.diagnostics.push(diag);
          }
        }
      }
    } else {
      const argumentTypes = node.arguments.map((arg) =>
        TypeResolver.resolveExpressionType(arg, this.document, lineIdx, this.indexer),
      );
      resolvedMethod = TypeResolver.findUnqualifiedCallable(
        node.methodName,
        this.document,
        lineIdx,
        this.indexer,
        argumentTypes,
      );
    }

    if (resolvedMethod) {
      const paramCount = resolvedMethod.parameters ? resolvedMethod.parameters.length : 0;
      const isSub = resolvedMethod.type.toLowerCase() === "void";

      if (node.noParentheses) {
        let hasMismatch = false;
        if (isSub) {
          if (paramCount > 1) hasMismatch = true;
        } else {
          if (paramCount >= 1) hasMismatch = true;
        }

        if (hasMismatch) {
          const range = new vscode.Range(
            lineIdx,
            startChar,
            lineIdx,
            startChar + node.methodName.length,
          );
          const diag = new vscode.Diagnostic(
            range,
            `Chamada do método "${node.methodName}" viola as regras de parênteses. Métodos ${isSub ? "Sub (Void) com mais de 1 parâmetro" : "Function (com retorno) com 1 ou mais parâmetros"} exigem o uso de parênteses.`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = DiagnosticCodes.CallParenthesesMismatch;
          this.diagnostics.push(diag);
        }
      }
      if (
        isSub &&
        parent &&
        parent.kind !== "ExpressionStatement" &&
        parent.kind !== "ArrowFunctionExpression"
      ) {
        const range = new vscode.Range(
          lineIdx,
          startChar,
          lineIdx,
          startChar + node.methodName.length,
        );
        const diag = new vscode.Diagnostic(
          range,
          `O método Sub "${node.methodName}" retorna Void e não pode ser usado em uma expressão ou atribuição.`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.SubUsedAsFunction;
        this.diagnostics.push(diag);
      }
      // if (isSub && parent && parent.kind !== "ExpressionStatement") {
      //   const range = new vscode.Range(
      //     lineIdx,
      //     startChar,
      //     lineIdx,
      //     startChar + node.methodName.length,
      //   );
      //   const diag = new vscode.Diagnostic(
      //     range,
      //     `O método Sub "${node.methodName}" retorna Void e não pode ser usado em uma expressão ou atribuição.`,
      //     vscode.DiagnosticSeverity.Error,
      //   );
      //   diag.code = DiagnosticCodes.SubUsedAsFunction;
      //   this.diagnostics.push(diag);
      // }
    }
    this.timeMethodInvocation += performance.now() - t0;
  }

  private resolveStaticReceiverAccess(receiver: Expression): {
    readonly typeName: string | undefined;
    readonly isStaticAccess: boolean;
  } {
    if (receiver.kind !== "Identifier") {
      return { typeName: undefined, isStaticAccess: false };
    }

    const workspaceSymbol = this.indexer.findSymbolByName(
      receiver.name,
      this.document.uri.toString(),
    );
    if (
      workspaceSymbol &&
      (workspaceSymbol.kind === "class" ||
        workspaceSymbol.kind === "structure" ||
        workspaceSymbol.kind === "namespace")
    ) {
      return {
        typeName: workspaceSymbol.name,
        isStaticAccess: workspaceSymbol.kind === "class" || workspaceSymbol.kind === "structure",
      };
    }

    const systemSymbol = lookupSystemByName(receiver.name).find(
      (s) => s.kind === "namespace" || s.kind === "class" || s.kind === "structure",
    );
    if (!systemSymbol) {
      return { typeName: undefined, isStaticAccess: false };
    }

    return {
      typeName: systemSymbol.name,
      isStaticAccess: systemSymbol.kind === "class" || systemSymbol.kind === "structure",
    };
  }

  private checkMemberAccess(node: MemberAccess): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;
    const lineText = this.lines[lineIdx] ?? "";
    const memberRange = this.getMemberAccessMemberRange(node, lineIdx, lineText);
    const startChar = memberRange.start.character;

    const prefixLower = exprToString(node.target)?.toLowerCase() ?? "";

    if (prefixLower === "me" || prefixLower === "mybase") {
      if (this.activeClass) {
        const typeName =
          prefixLower === "me"
            ? this.activeClass.name
            : (this.activeClass.baseType?.name ?? "TObject");
        const resolved = TypeResolver.findMember(typeName, node.member, this.indexer);

        if (!resolved && !(node.member.toLowerCase() === "new" && prefixLower === "mybase")) {
          const diag = new vscode.Diagnostic(
            memberRange,
            `Membro "${node.member}" não encontrado na classe "${this.activeClass.name}".`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = DiagnosticCodes.UnknownMember;
          attachUnknownMemberSuggestions(
            diag,
            node.member,
            DiagnosticsLinter.collectMemberNames(this.activeClass.name, this.indexer),
          );
          this.diagnostics.push(diag);
        } else if (resolved?.isUnsupported) {
          DiagnosticsLinter.pushUnsupportedMemberDiagnostic(
            this.diagnostics,
            memberRange.start.line,
            startChar,
            node.member,
            this.activeClass.name,
          );
        }
      }
      return;
    }

    if (prefixLower.startsWith("vcl") || prefixLower.startsWith("system")) {
      return;
    }

    let typeName = TypeResolver.resolveExpressionType(
      node.target,
      this.document,
      lineIdx,
      this.indexer,
    );
    let isStaticAccess = false;

    if (!typeName) {
      const staticAccess = this.resolveStaticReceiverAccess(node.target);
      typeName = staticAccess.typeName;
      isStaticAccess = staticAccess.isStaticAccess;
    }

    if (typeName && DiagnosticsLinter.isKnownMemberContainer(typeName, this.indexer)) {
      const resolved = TypeResolver.findMember(typeName, node.member, this.indexer);
      if (
        !resolved &&
        !this.isAssignedEventHandlerReference(node) &&
        typeName.toLowerCase() !== "variant" &&
        typeName.toLowerCase() !== "tobject" &&
        typeName.toLowerCase() !== "void"
      ) {
        const range = new vscode.Range(lineIdx, startChar, lineIdx, startChar + node.member.length);
        const diag = new vscode.Diagnostic(
          range,
          `Membro "${node.member}" não encontrado na classe/tipo "${typeName}".`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.UnknownMember;
        attachUnknownMemberSuggestions(
          diag,
          node.member,
          DiagnosticsLinter.collectMemberNames(typeName, this.indexer),
        );
        this.diagnostics.push(diag);
      } else if (resolved?.isUnsupported) {
        DiagnosticsLinter.pushUnsupportedMemberDiagnostic(
          this.diagnostics,
          lineIdx,
          startChar,
          node.member,
          typeName,
        );
      } else if (
        resolved &&
        isStaticAccess &&
        !resolved.isShared &&
        resolved.kind !== "class" &&
        resolved.kind !== "structure" &&
        resolved.kind !== "delegate"
      ) {
        const range = new vscode.Range(lineIdx, startChar, lineIdx, startChar + node.member.length);
        const diag = new vscode.Diagnostic(
          range,
          `Acesso a membro de instância "${node.member}" diretamente no tipo "${typeName}".`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.InstanceMemberAccessOnType;
        this.diagnostics.push(diag);
      } else if (resolved?.isPrivate || resolved?.isProtected) {
        let hasAccess = false;
        if (this.activeClass && resolved.containerName) {
          const ownerLower = resolved.containerName.toLowerCase();
          const enclosingLower = this.activeClass.name.toLowerCase();
          if (ownerLower === enclosingLower) {
            hasAccess = true;
          } else if (resolved.isProtected) {
            if (inheritsFromClass(this.activeClass.name, resolved.containerName, this.indexer)) {
              hasAccess = true;
            }
          }
        }
        if (!hasAccess) {
          const range = new vscode.Range(
            lineIdx,
            startChar,
            lineIdx,
            startChar + node.member.length,
          );
          const diag = new vscode.Diagnostic(
            range,
            resolved.isPrivate
              ? `O membro "${node.member}" de "${typeName}" é Private e não pode ser acessado fora da classe.`
              : `O membro "${node.member}" de "${typeName}" é Protected e só pode ser acessado na classe declarante ou suas subclasses.`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = DiagnosticCodes.PrivateMemberAccess;
          this.diagnostics.push(diag);
        }
      }
    }
    if (node.member.toLowerCase() === "dowork") {
      const parameterlessCallable = this.resolveParameterlessFinalCall(node, lineIdx);
      console.log("FROM MEMBER ACCESS: parameterlessCallable=", !!parameterlessCallable);
    }
    const parent = this.parentStack[this.parentStack.length - 1];
    const isAddressOf =
      parent && parent.kind === "UnaryExpression" && parent.operator.toLowerCase() === "addressof";
    const isAssignmentTarget = parent && parent.kind === "Assignment" && parent.target === node;

    if (
      parent &&
      !(parent.kind === "MethodInvocation" && parent.callee === node) &&
      !isAddressOf &&
      !isAssignmentTarget
    ) {
      const parameterlessCallable = this.resolveParameterlessFinalCall(node, lineIdx);
      if (parameterlessCallable) {
        this.pushFinalCallParenthesesDiagnostic(node, parameterlessCallable, lineIdx);
      }
    }
  }

  private getMemberAccessMemberRange(
    node: MemberAccess,
    fallbackLineIdx: number,
    fallbackLineText: string,
  ): vscode.Range {
    if (node.memberLoc) {
      const lineIdx = Math.max(0, node.memberLoc.startLine - 1);
      const endChar =
        node.memberLoc.endChar > node.memberLoc.startChar
          ? node.memberLoc.endChar
          : node.memberLoc.startChar + node.member.length;
      return new vscode.Range(lineIdx, node.memberLoc.startChar, lineIdx, endChar);
    }

    const startChar = this.findMemberTokenStart(fallbackLineText, node);
    return new vscode.Range(
      fallbackLineIdx,
      startChar,
      fallbackLineIdx,
      startChar + node.member.length,
    );
  }

  private findMemberTokenStart(lineText: string, node: MemberAccess): number {
    const member = node.member;
    if (member.length === 0) return node.loc?.startChar ?? 0;

    const lineLower = lineText.toLowerCase();
    const needle = `.${member.toLowerCase()}`;
    const startAt = Math.max(0, node.loc?.startChar ?? 0);
    let searchAt = startAt;
    let lastMatch = -1;

    while (searchAt < lineLower.length) {
      const match = lineLower.indexOf(needle, searchAt);
      if (match === -1) break;
      const afterMember = match + needle.length;
      if (!isIdentifierChar(lineText[afterMember])) {
        lastMatch = match + 1;
      }
      searchAt = match + 1;
    }

    if (lastMatch !== -1) return lastMatch;

    const dotIndex = lineText.indexOf(".", startAt);
    return dotIndex !== -1 ? dotIndex + 1 : startAt;
  }

  private checkArrayAccess(node: ArrayAccessExpression): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;
    const args = node.indices ?? [node.index];
    const arity = args.length;

    if (node.target.kind === "MemberAccess") {
      const receiverType = TypeResolver.resolveExpressionType(
        node.target.target,
        this.document,
        lineIdx,
        this.indexer,
      );
      if (!receiverType) return;

      const arityMatch = TypeResolver.findMember(
        receiverType,
        node.target.member,
        this.indexer,
        arity,
      );
      if (arityMatch?.kind === "indexed-property") {
        this.checkIndexedPropertyArgumentTypes(arityMatch, args, lineIdx);
        return;
      }
      if (arityMatch?.kind === "variable" && arityMatch.nativeArrayRank === arity) {
        this.checkNativeArrayIndexTypes(args, lineIdx);
        return;
      }

      const anyMember = TypeResolver.findMember(receiverType, node.target.member, this.indexer);
      if (
        anyMember?.kind === "method" ||
        anyMember?.kind === "declare_function" ||
        anyMember?.kind === "declare_sub"
      ) {
        this.pushBracketCallDiagnostic(node, anyMember.name, lineIdx);
        return;
      }
      if (anyMember?.kind === "indexed-property") {
        this.pushIndexedPropertyArityDiagnostic(node, anyMember, arity, lineIdx);
      }
      return;
    }

    if (
      node.target.kind === "Identifier" &&
      this.isNativeArrayIdentifier(node.target.name, arity, lineIdx)
    ) {
      this.checkNativeArrayIndexTypes(args, lineIdx);
      return;
    }

    const targetType = TypeResolver.resolveExpressionType(
      node.target,
      this.document,
      lineIdx,
      this.indexer,
    );
    if (!targetType) return;
    const lowerTargetType = targetType.toLowerCase();
    if (lowerTargetType === "variant" || lowerTargetType === "string") return;

    const defaultIndexer = TypeResolver.findMember(targetType, "Item", this.indexer, arity);
    if (defaultIndexer?.kind === "indexed-property") {
      this.checkIndexedPropertyArgumentTypes(defaultIndexer, args, lineIdx);
      return;
    }

    const range = new vscode.Range(
      lineIdx,
      node.target.loc?.startChar ?? node.loc.startChar,
      lineIdx,
      node.target.loc?.endChar ?? node.loc.endChar,
    );
    const diag = new vscode.Diagnostic(
      range,
      `O tipo "${targetType}" não expõe uma property indexada compatível com ${arity} argumento(s). Use colchetes apenas em arrays, matrizes ou properties indexadas.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.DefaultIndexerMissing;
    this.diagnostics.push(diag);
  }

  private isAssignedEventHandlerReference(node: MemberAccess): boolean {
    const parent = this.parentStack[this.parentStack.length - 1];
    if (parent?.kind !== "Assignment" || parent.value !== node) return false;
    const target = parent.target;
    if (target.kind !== "MemberAccess") return false;
    if (target.member.toLowerCase().startsWith("on")) return true;

    if (!target.loc) return false;
    const lineIdx = target.loc.startLine - 1;
    const targetType = TypeResolver.resolveExpressionType(
      target.target,
      this.document,
      lineIdx,
      this.indexer,
    );
    if (!targetType) return false;
    const eventMember = TypeResolver.findMember(targetType, target.member, this.indexer);
    if (!eventMember) return false;
    return (
      this.indexer.findSymbolByName(eventMember.type)?.kind === "delegate" ||
      lookupSystemByName(eventMember.type).some((symbol) => symbol.kind === "delegate")
    );
  }

  private isNativeArrayIdentifier(name: string, arity: number, lineIdx: number): boolean {
    const lower = name.toLowerCase();
    return this.nativeArrayDeclarations.some(
      (decl) =>
        decl.name === lower && decl.rank === arity && (decl.isField || decl.line <= lineIdx),
    );
  }

  private checkNativeArrayIndexTypes(
    args: readonly ArrayAccessExpression["index"][],
    lineIdx: number,
  ): void {
    for (const arg of args) {
      const argType = TypeResolver.resolveExpressionType(arg, this.document, lineIdx, this.indexer);
      if (argType && !DiagnosticsLinter.isTypeCompatible(argType, "Integer", this.indexer)) {
        this.pushTypeMismatchDiagnostic(arg, argType, "Integer", lineIdx);
      }
    }
  }

  private checkIndexedPropertyArgumentTypes(
    member: SymbolInfo,
    args: readonly ArrayAccessExpression["index"][],
    lineIdx: number,
  ): void {
    const params = member.parameters ?? [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const param = params[i];
      if (!arg || !param) continue;
      const argType = TypeResolver.resolveExpressionType(arg, this.document, lineIdx, this.indexer);
      if (argType && !DiagnosticsLinter.isTypeCompatible(argType, param.type, this.indexer)) {
        this.pushTypeMismatchDiagnostic(arg, argType, param.type, lineIdx);
      }
    }
  }

  private pushBracketCallDiagnostic(
    node: ArrayAccessExpression,
    memberName: string,
    lineIdx: number,
  ): void {
    const range = new vscode.Range(
      lineIdx,
      node.target.loc?.startChar ?? node.loc?.startChar ?? 0,
      lineIdx,
      node.target.loc?.endChar ?? node.loc?.endChar ?? 0,
    );
    const diag = new vscode.Diagnostic(
      range,
      `Chamada do mÃ©todo/Função "${memberName}" usou colchetes. MÃ©todos e funÃ§Ãµes aceitam apenas parÃªnteses.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.CallParenthesesMismatch;
    this.diagnostics.push(diag);
  }

  private pushIndexedPropertyArityDiagnostic(
    node: ArrayAccessExpression,
    member: SymbolInfo,
    arity: number,
    lineIdx: number,
  ): void {
    const expected = member.parameters?.length ?? 0;
    const range = new vscode.Range(
      lineIdx,
      node.target.loc?.startChar ?? node.loc?.startChar ?? 0,
      lineIdx,
      node.target.loc?.endChar ?? node.loc?.endChar ?? 0,
    );
    const diag = new vscode.Diagnostic(
      range,
      `Property indexada "${member.name}" espera ${expected} argumento(s), mas recebeu ${arity}.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.CallParenthesesMismatch;
    this.diagnostics.push(diag);
  }

  private pushTypeMismatchDiagnostic(
    expr: ArrayAccessExpression["index"],
    actualType: string,
    expectedType: string,
    lineIdx: number,
  ): void {
    const range = new vscode.Range(
      lineIdx,
      expr.loc?.startChar ?? 0,
      lineIdx,
      expr.loc?.endChar ?? 0,
    );
    const diag = new vscode.Diagnostic(
      range,
      `Incompatibilidade de tipos: não Ã© possÃ­vel usar "${actualType}" onde "${expectedType}" Ã© esperado.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.TypeMismatch;
    this.diagnostics.push(diag);
  }

  private checkForEachStatement(node: ForEachStatement): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;

    const enumerableType = TypeResolver.resolveExpressionType(
      node.enumerable,
      this.document,
      lineIdx,
      this.indexer,
    );
    const explicitType = node.elementType ? typeRefToString(node.elementType) : undefined;

    const enumerable = enumerableType
      ? detectEnumerable(
          enumerableType,
          (t) => TypeResolver.getAllMembersForType(t, this.indexer),
          explicitType,
        )
      : undefined;

    if (!enumerable) {
      const typeName = enumerableType ?? "Variant";
      const startChar = node.enumerable.loc ? node.enumerable.loc.startChar : 0;
      const endChar = node.enumerable.loc ? node.enumerable.loc.endChar : 0;
      const range = new vscode.Range(lineIdx, startChar, lineIdx, endChar);

      const diag = new vscode.Diagnostic(
        range,
        `O tipo "${typeName}" não expõe a propriedade "Count" e um indexador inteiro, ` +
          `requisitos do "For Each". O compilador não conseguirá transpilar esta linha.`,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = DiagnosticCodes.NotEnumerable;
      const payload: NotEnumerablePayload = {
        code: DiagnosticCodes.NotEnumerable,
        typeName,
      };
      setDiagnosticPayload(diag, payload);
      this.diagnostics.push(diag);
    }
  }

  private checkTaggedTemplateExpression(node: TaggedTemplateExpression): void {
    if (!node.loc || node.tag !== "") return;
    const lineIdx = node.loc.startLine - 1;

    const result = parseInterpolation(node.body);
    for (const d of result.diagnostics) {
      const absCol = node.loc.startChar + d.column;
      const range = new vscode.Range(lineIdx, absCol, lineIdx, node.loc.endChar);
      const diag = new vscode.Diagnostic(
        range,
        `String interpolada \`$"..."\` mal formada (${d.reason}). O Builder não conseguirá expandir esta linha.`,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = DiagnosticCodes.InvalidInterpolation;
      const payload: InvalidInterpolationPayload = {
        code: DiagnosticCodes.InvalidInterpolation,
        reason: d.reason,
      };
      setDiagnosticPayload(diag, payload);
      this.diagnostics.push(diag);
    }
  }

  private checkTernaryExpression(node: TernaryExpression): void {
    if (!node.loc) return;
    if (this.allowedTernaries.has(node)) return;

    const lineIdx = node.loc.startLine - 1;
    const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);

    const diag = new vscode.Diagnostic(
      range,
      `Ternário \`?:\` fora de contexto de assignment. O Builder só expande ternários em \`Dim x = c ? a : b\`, \`x = c ? a : b\` ou \`obj.prop = c ? a : b\` (forma nativa é \`If/Then/Else/End If\`).`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.TernaryContextUnsupported;
    const payload: TernaryContextUnsupportedPayload = {
      code: DiagnosticCodes.TernaryContextUnsupported,
      context: "non-assignment",
    };
    setDiagnosticPayload(diag, payload);
    this.diagnostics.push(diag);
  }

  private checkAssignment(node: Assignment): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;

    // Event signature mismatch
    if (node.target.kind === "MemberAccess" && node.target.member.toLowerCase().startsWith("on")) {
      const eventName = node.target.member;
      const targetType = TypeResolver.resolveExpressionType(
        node.target.target,
        this.document,
        lineIdx,
        this.indexer,
      );

      if (targetType) {
        const eventMember = TypeResolver.findMember(targetType, eventName, this.indexer);
        if (eventMember?.kind === "property") {
          const delegateName = eventMember.type;
          const delegate =
            lookupSystemByName(delegateName).find((s) => s.kind === "delegate") ??
            this.indexer.findSymbolByName(delegateName);

          if (delegate?.kind === "delegate" && delegate.parameters) {
            // Check if AddressOf handler is assigned
            if (
              node.value.kind === "MethodInvocation" &&
              node.value.methodName.toLowerCase() === "addressof" &&
              node.value.arguments.length === 1
            ) {
              const handlerArg = node.value.arguments[0];
              let handlerName = "";
              if (handlerArg?.kind === "Identifier") {
                handlerName = handlerArg.name;
              } else if (handlerArg?.kind === "MemberAccess") {
                handlerName = handlerArg.member;
              }

              if (handlerName) {
                const handler = this.indexer.findSymbolByName(handlerName);
                if (
                  handler &&
                  (handler.kind === "method" ||
                    handler.kind === "declare_sub" ||
                    handler.kind === "declare_function")
                ) {
                  const handlerParams = handler.parameters ?? [];
                  if (handlerParams.length !== delegate.parameters.length) {
                    const startChar = node.value.loc
                      ? node.value.loc.startChar
                      : node.loc.startChar;
                    const endChar = node.value.loc ? node.value.loc.endChar : node.loc.endChar;
                    const range = new vscode.Range(lineIdx, startChar, lineIdx, endChar);
                    const diag = new vscode.Diagnostic(
                      range,
                      `Assinatura incompatível: o evento "${eventName}" espera ${delegate.parameters.length} parâmetro(s) (delegate "${delegateName}"), mas o handler "${handlerName}" tem ${handlerParams.length}.`,
                      vscode.DiagnosticSeverity.Error,
                    );
                    diag.code = DiagnosticCodes.EventSignatureMismatch;
                    this.diagnostics.push(diag);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Type compatibility and ReadOnly assignment target checking
    const lhsType = TypeResolver.resolveExpressionType(
      node.target,
      this.document,
      lineIdx,
      this.indexer,
    );
    const rhsType = TypeResolver.resolveExpressionType(
      node.value,
      this.document,
      lineIdx,
      this.indexer,
    );

    const isLocalAssignmentTarget =
      node.target.kind === "Identifier" && this.isLocalDeclared(node.target.name);
    const isCurrentFunctionReturnTarget = this.isCurrentReturnAssignmentTarget(node);
    if (isCurrentFunctionReturnTarget && this.isInsideCatchBlock(node)) {
      this.pushReturnAssignmentInCatchDiagnostic(node);
    }
    const sharedReturnGlobal = this.resolveSharedReturnGlobalFunction(node.value, lineIdx);
    if (isCurrentFunctionReturnTarget && sharedReturnGlobal) {
      this.pushSharedReturnGlobalFunctionDiagnostic(
        node.value,
        sharedReturnGlobal,
        lineIdx,
        node.target,
      );
    } else if (this.findChainedGlobalFunctionRoot(node.value, lineIdx)) {
      const chainedGlobalRoot = this.findChainedGlobalFunctionRoot(node.value, lineIdx);
      if (!chainedGlobalRoot) return;
      this.pushChainedGlobalFunctionAssignmentDiagnostic(node.value, chainedGlobalRoot, lineIdx);
    }

    let resolvedLhs: SymbolInfo | undefined;
    if (node.target.kind === "Identifier" && !isLocalAssignmentTarget) {
      if (this.activeClass) {
        resolvedLhs = TypeResolver.findMember(
          this.activeClass.name,
          node.target.name,
          this.indexer,
        );
      }
      resolvedLhs ??= this.indexer.findSymbolByName(node.target.name, this.document.uri.toString());
    } else if (node.target.kind === "MemberAccess") {
      const type = TypeResolver.resolveExpressionType(
        node.target.target,
        this.document,
        lineIdx,
        this.indexer,
      );
      if (type) {
        resolvedLhs = TypeResolver.findMember(type, node.target.member, this.indexer);
      }
    }

    if (resolvedLhs) {
      if (resolvedLhs.isConst || resolvedLhs.isReadOnly) {
        let isAllowed = false;
        if (
          resolvedLhs.isReadOnly &&
          this.activeClass &&
          this.activeMethod?.name.toLowerCase() === "new"
        ) {
          const declaringClass = resolvedLhs.containerName?.toLowerCase();
          if (declaringClass === this.activeClass.name.toLowerCase()) {
            isAllowed = true;
          }
        }
        if (!isAllowed) {
          const range = new vscode.Range(
            lineIdx,
            node.target.loc?.startChar ?? 0,
            lineIdx,
            node.target.loc?.endChar ?? 0,
          );
          const diag = new vscode.Diagnostic(
            range,
            resolvedLhs.isConst
              ? `Tentativa de atribuir valor à constante "${resolvedLhs.name}".`
              : `Tentativa de atribuir valor ao campo ReadOnly "${resolvedLhs.name}" fora do construtor.`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = DiagnosticCodes.ReadOnlyAssignment;
          this.diagnostics.push(diag);
        }
      }

      // Check method/sub invalid assignment target
      const isMethod =
        resolvedLhs.kind === "method" ||
        resolvedLhs.kind === "declare_function" ||
        resolvedLhs.kind === "declare_sub";
      if (isMethod) {
        if (!isCurrentFunctionReturnTarget) {
          const range = new vscode.Range(
            lineIdx,
            node.target.loc?.startChar ?? 0,
            lineIdx,
            node.target.loc?.endChar ?? 0,
          );
          const diag = new vscode.Diagnostic(
            range,
            `Tentativa de atribuir valor a um símbolo inválido (nome de outro método/função "${resolvedLhs.name}").`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = DiagnosticCodes.InvalidAssignmentTarget;
          this.diagnostics.push(diag);
        }
      }
    }

    if (
      lhsType &&
      rhsType &&
      rhsType.toLowerCase() !== "void" &&
      lhsType.toLowerCase() !== "void"
    ) {
      if (!DiagnosticsLinter.isTypeCompatible(rhsType, lhsType, this.indexer)) {
        const range = new vscode.Range(
          lineIdx,
          node.value.loc?.startChar ?? 0,
          lineIdx,
          node.value.loc?.endChar ?? 0,
        );
        const diag = new vscode.Diagnostic(
          range,
          `Incompatibilidade de tipos: não é possível atribuir "${rhsType}" para "${lhsType}".`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.TypeMismatch;
        this.diagnostics.push(diag);
      }
    }

    // Warn when the RHS is a parameterless callable used without parentheses,
    // e.g. `x = obj.logado` should be `x = obj.logado()`.
    const parameterlessCallable = this.resolveParameterlessFinalCall(node.value, lineIdx);
    if (parameterlessCallable) {
      this.pushFinalCallParenthesesDiagnostic(node.value, parameterlessCallable, lineIdx);
    }
  }

  private checkVariableDeclaration(node: VariableDeclaration): void {
    if (!node.loc || !node.type || !node.initializer) return;
    const lineIdx = node.loc.startLine - 1;

    // Warn when the initializer is a parameterless callable used without parentheses,
    // e.g. `Dim x As T = obj.logado` should be `Dim x As T = obj.logado()`.
    const parameterlessCallable = this.resolveParameterlessFinalCall(node.initializer, lineIdx);
    if (parameterlessCallable) {
      this.pushFinalCallParenthesesDiagnostic(node.initializer, parameterlessCallable, lineIdx);
    }

    const lhsType = typeRefToString(node.type);
    const rhsType = TypeResolver.resolveExpressionType(
      node.initializer,
      this.document,
      lineIdx,
      this.indexer,
    );

    if (lhsType && rhsType && rhsType.toLowerCase() !== "void") {
      if (!DiagnosticsLinter.isTypeCompatible(rhsType, lhsType, this.indexer)) {
        const range = new vscode.Range(
          lineIdx,
          node.initializer.loc?.startChar ?? 0,
          lineIdx,
          node.initializer.loc?.endChar ?? 0,
        );
        const diag = new vscode.Diagnostic(
          range,
          `Incompatibilidade de tipos: não é possível atribuir "${rhsType}" para "${lhsType}".`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.TypeMismatch;
        this.diagnostics.push(diag);
      }
    }
  }

  private findChainedGlobalFunctionRoot(
    expr: Expression,
    lineIdx: number,
  ): MethodInvocation | undefined {
    switch (expr.kind) {
      case "MemberAccess":
        if (this.isGlobalFunctionInvocation(expr.target, lineIdx)) {
          return expr.target;
        }
        return this.findChainedGlobalFunctionRoot(expr.target, lineIdx);
      case "MethodInvocation":
        if (!expr.callee) return undefined;
        if (this.isGlobalFunctionInvocation(expr.callee, lineIdx)) {
          return expr.callee;
        }
        return this.findChainedGlobalFunctionRoot(expr.callee, lineIdx);
      case "ArrayAccessExpression":
        if (this.isGlobalFunctionInvocation(expr.target, lineIdx)) {
          return expr.target;
        }
        return this.findChainedGlobalFunctionRoot(expr.target, lineIdx);
      case "OptionalChainingExpression":
        return this.findChainedGlobalFunctionRoot(expr.target, lineIdx);
      default:
        return undefined;
    }
  }

  private resolveSharedReturnGlobalFunction(
    expr: Expression,
    lineIdx: number,
  ):
    | {
        readonly root: MethodInvocation;
        readonly rootSymbol: SymbolInfo;
        readonly startChar: number;
        readonly endChar: number;
        readonly rootText: string;
        readonly suffixText: string;
      }
    | undefined {
    if (!this.isActiveSharedFunction()) return undefined;

    const directSymbol =
      expr.kind === "MethodInvocation"
        ? this.resolveGlobalFunctionInvocation(expr, lineIdx)
        : undefined;
    const root = directSymbol ? expr : this.findChainedGlobalFunctionRoot(expr, lineIdx);
    if (!root) return undefined;
    const rootSymbol = directSymbol ?? this.resolveGlobalFunctionInvocation(root, lineIdx);
    if (!rootSymbol) return undefined;

    const lineText = this.lines[lineIdx] ?? "";
    const startChar = expr.loc?.startChar ?? root.loc?.startChar ?? 0;
    const endChar = this.findExpressionEndColumn(lineText, startChar);
    const rootStart = root.loc?.startChar ?? startChar;

    const rootEnd = this.findInvocationEndColumn(
      lineText,
      rootStart,
      (root as MethodInvocation).methodName,
    );
    if (rootEnd <= rootStart || rootEnd > endChar) return undefined;

    return {
      root: root as MethodInvocation,
      rootSymbol,
      startChar,
      endChar,
      rootText: lineText.slice(rootStart, rootEnd).trim(),
      suffixText: lineText.slice(rootEnd, endChar).trim(),
    };
  }

  private isActiveSharedFunction(): boolean {
    return (
      this.activeMethod?.returnType !== undefined &&
      (this.activeMethod.modifiers ?? []).some((modifier) => modifier.toLowerCase() === "shared")
    );
  }

  private isGlobalFunctionInvocation(expr: Expression, lineIdx: number): expr is MethodInvocation {
    return this.resolveGlobalFunctionInvocation(expr, lineIdx) !== undefined;
  }

  private resolveGlobalFunctionInvocation(
    expr: Expression,
    lineIdx: number,
  ): SymbolInfo | undefined {
    if (expr.kind !== "MethodInvocation" || expr.callee) return undefined;
    const resolved = TypeResolver.findUnqualifiedCallable(
      expr.methodName,
      this.document,
      lineIdx,
      this.indexer,
      expr.arguments.map((arg) =>
        TypeResolver.resolveExpressionType(arg, this.document, lineIdx, this.indexer),
      ),
    );
    if (!resolved) return undefined;
    if (resolved.kind !== "method" && resolved.kind !== "declare_function") return undefined;
    if (resolved.type.toLowerCase() === "void") return undefined;
    if (resolved.fileUri === "system://library") return undefined;
    const ownerLower = resolved.containerName?.toLowerCase();
    if (!ownerLower) return resolved;
    if (ownerLower === this.activeClass?.name.toLowerCase()) return undefined;
    if (this.activeClassInheritedNames?.has(ownerLower)) return undefined;
    return resolved;
  }

  private pushChainedGlobalFunctionAssignmentDiagnostic(
    expr: Expression,
    root: MethodInvocation,
    lineIdx: number,
  ): void {
    const lineText = this.lines[lineIdx] ?? "";
    const startChar = expr.loc?.startChar ?? 0;
    const endChar =
      expr.loc && expr.loc.endChar > expr.loc.startChar
        ? expr.loc.endChar
        : this.findExpressionEndColumn(lineText, startChar);
    const range = new vscode.Range(lineIdx, startChar, lineIdx, endChar);
    const diag = new vscode.Diagnostic(
      range,
      `AtribuiÃ§Ã£o direta a partir da cadeia iniciada pela Função global "${root.methodName}" pode falhar no compilador Data7. Armazene o retorno da Função em uma variÃ¡vel temporÃ¡ria antes de acessar membros.`,
      vscode.DiagnosticSeverity.Warning,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    diag.code = DiagnosticCodes.ChainedGlobalFunctionAssignment;
    const payload: ChainedGlobalFunctionAssignmentPayload = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      code: DiagnosticCodes.ChainedGlobalFunctionAssignment,
      line: lineIdx,
      startChar,
      endChar,
      functionName: root.methodName,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    setDiagnosticPayload(diag, payload);
    this.diagnostics.push(diag);
  }

  private pushSharedReturnGlobalFunctionDiagnostic(
    expr: Expression,
    resolved: {
      readonly root: MethodInvocation;
      readonly rootSymbol: SymbolInfo;
      readonly startChar: number;
      readonly endChar: number;
      readonly rootText: string;
      readonly suffixText: string;
    },
    lineIdx: number,
    _target: Expression | undefined,
  ): void {
    const targetName = this.activeMethod?.name;
    if (!targetName) return;

    const range = new vscode.Range(lineIdx, resolved.startChar, lineIdx, resolved.endChar);
    const diag = new vscode.Diagnostic(
      range,
      `Função Shared nÃ£o deve retornar diretamente a Função global "${resolved.root.methodName}". Armazene o resultado em uma variÃ¡vel temporÃ¡ria antes de atribuir o retorno.`,
      vscode.DiagnosticSeverity.Warning,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    diag.code = DiagnosticCodes.SharedReturnGlobalFunction;
    const payload: SharedReturnGlobalFunctionPayload = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      code: DiagnosticCodes.SharedReturnGlobalFunction,
      line: lineIdx,
      startChar: resolved.startChar,
      endChar: resolved.endChar,
      targetName,
      rootText: resolved.rootText,
      suffixText: resolved.suffixText,
      tempName: `__data7GlobalReturn${lineIdx + 1}`,
      tempType:
        (resolved.rootSymbol.type || typeRefToString(this.activeMethod?.returnType)) ?? "Variant",
      exitType: "Function",
      isInsideCatch: this.isInsideCatchBlock(expr),
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    setDiagnosticPayload(diag, payload);
    this.diagnostics.push(diag);
  }

  private findInvocationEndColumn(lineText: string, startChar: number, methodName: string): number {
    let cursor = this.findTokenEnd(lineText, startChar, methodName);
    while (lineText[cursor] === " " || lineText[cursor] === "\t") cursor++;
    if (lineText[cursor] !== "(") return cursor;

    let depth = 0;
    let inString = false;
    for (; cursor < lineText.length; cursor++) {
      const char = lineText[cursor];
      if (char === '"') {
        if (inString && lineText[cursor + 1] === '"') {
          cursor++;
          continue;
        }
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "(") {
        depth++;
      } else if (char === ")") {
        depth--;
        if (depth === 0) return cursor + 1;
      }
    }
    return cursor;
  }

  private findExpressionEndColumn(lineText: string, startChar: number): number {
    const commentStart = getCommentStartIndex(lineText);
    const limit = commentStart === -1 ? lineText.length : commentStart;
    return lineText.slice(0, limit).trimEnd().length || startChar + 1;
  }

  private checkMethodDeclaration(node: MethodDeclaration): void {
    // Check FunctionReadSelf in method bodies
    const isFunction =
      node.returnType && typeRefToString(node.returnType)?.toLowerCase() !== "void";
    if (isFunction) {
      const funcName = node.name.toLowerCase();
      const checkSelfRead = new (class extends ASTWalker {
        constructor(private readonly diags: vscode.Diagnostic[]) {
          super();
        }
        public override walk(idNode: Node): void {
          if (
            idNode.kind === "Identifier" &&
            idNode.name.toLowerCase() === funcName &&
            idNode.loc
          ) {
            // Check if this identifier is part of a Call/MethodInvocation or on the LHS of assignment
            const p = this.parentStack[this.parentStack.length - 1];
            let isPlainAssignment = false;
            if (p?.kind === "Assignment" && p.target === idNode) {
              isPlainAssignment = true;
            }
            let isCall = false;
            if (p?.kind === "MethodInvocation" && p.methodName.toLowerCase() === funcName) {
              isCall = true;
            }

            if (!isPlainAssignment && !isCall) {
              const lineIdx = idNode.loc.startLine - 1;
              const range = new vscode.Range(
                lineIdx,
                idNode.loc.startChar,
                lineIdx,
                idNode.loc.endChar,
              );
              const diag = new vscode.Diagnostic(
                range,
                `Leitura do nome da função "${idNode.name}" dentro de seu próprio corpo não é permitida. Para chamar recursivamente, use parênteses.`,
                vscode.DiagnosticSeverity.Error,
              );
              diag.code = DiagnosticCodes.FunctionReadSelf;
              this.diags.push(diag);
            }
          }
          this.parentStack.push(idNode);
          super.walk(idNode);
          this.parentStack.pop();
        }
        private parentStack: Node[] = [];
      })(this.diagnostics);
      const t0Self = performance.now();
      checkSelfRead.walk(node);
      this.timeCheckSelfRead += performance.now() - t0Self;
    }

    // Run the AST-based Flow Analysis on method bodies
    if (node.body.length > 0) {
      const t0Flow = performance.now();
      const flowAnalyzer = new ASTFlowAnalyzer(node, this.lines, this.diagnostics);
      flowAnalyzer.run();
      this.timeFlowAnalyzer += performance.now() - t0Flow;
    }

    // DeclarationParenthesesMismatch checking
    if (node.noParentheses && node.parameters.length === 0 && node.loc) {
      const nameLower = node.name.toLowerCase();
      if (nameLower !== "get" && nameLower !== "set") {
        const range = new vscode.Range(
          node.loc.startLine - 1,
          node.loc.startChar,
          node.loc.startLine - 1,
          node.loc.endChar,
        );
        const diag = new vscode.Diagnostic(
          range,
          `A declaração do método/função "${node.name}" não possui parênteses. Recomenda-se o uso de parênteses "()" para seguir o padrão da linguagem.`,
          vscode.DiagnosticSeverity.Warning,
        );
        diag.code = DiagnosticCodes.DeclarationParenthesesMismatch;
        this.diagnostics.push(diag);
      }
    }
  }

  private checkDelegateDeclaration(node: DelegateDeclaration): void {
    if (node.noParentheses && node.parameters.length === 0 && node.loc) {
      const range = new vscode.Range(
        node.loc.startLine - 1,
        node.loc.startChar,
        node.loc.startLine - 1,
        node.loc.endChar,
      );
      const diag = new vscode.Diagnostic(
        range,
        `A declaração do método/função "${node.name}" não possui parênteses. Recomenda-se o uso de parênteses "()" para seguir o padrão da linguagem.`,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = DiagnosticCodes.DeclarationParenthesesMismatch;
      this.diagnostics.push(diag);
    }
  }

  private resolveParameterlessFinalCall(expr: Expression, lineIdx: number): SymbolInfo | undefined {
    if (expr.kind === "Identifier") {
      if (
        PRIMITIVE_TYPES.has(expr.name.toLowerCase()) ||
        DiagnosticsLinter.isKnownType(expr.name, this.indexer)
      ) {
        return undefined;
      }
      // A local Dim variable with the same name takes priority over any unqualified callable.
      // Without this guard, `Dim retorno As T` followed by `returnRowGrid = retorno` would
      // incorrectly match an imported function `Retorno()` and emit a false-positive warning.
      // We use hasLocalDimDeclaration (not getVariableType) to avoid matching class members
      // that happen to share the name — those are valid targets for the parentheses warning.
      if (TypeResolver.hasLocalDimDeclaration(expr.name, this.document, lineIdx, this.indexer)) {
        return undefined;
      }
      const resolved = TypeResolver.findUnqualifiedCallable(
        expr.name,
        this.document,
        lineIdx,
        this.indexer,
        [],
      );
      return this.isParameterlessCallable(resolved) ? resolved : undefined;
    }

    if (expr.kind !== "MemberAccess") return undefined;
    const targetType = TypeResolver.resolveExpressionType(
      expr.target,
      this.document,
      lineIdx,
      this.indexer,
    );
    if (!targetType) return undefined;
    const resolved = TypeResolver.findMember(targetType, expr.member, this.indexer, 0);
    return this.isParameterlessCallable(resolved) ? resolved : undefined;
  }

  private isParameterlessCallable(symbol: SymbolInfo | undefined): symbol is SymbolInfo {
    if (!symbol) return false;
    if (
      symbol.kind !== "method" &&
      symbol.kind !== "declare_function" &&
      symbol.kind !== "declare_sub"
    ) {
      return false;
    }
    return (symbol.parameters?.length ?? 0) === 0 || symbol.parameters!.every((p) => p.isOptional);
  }

  private pushFinalCallParenthesesDiagnostic(
    expr: Expression,
    symbol: SymbolInfo,
    lineIdx: number,
  ): void {
    const tokenName = expr.kind === "MemberAccess" ? expr.member : symbol.name;
    const lineText = this.lines[lineIdx] ?? "";
    const startChar =
      expr.kind === "MemberAccess" && expr.memberLoc
        ? expr.memberLoc.startChar
        : (expr.loc?.startChar ?? 0);
    // TokenLocation only stores the start column; endChar from memberLoc equals startChar.
    // Use findTokenEnd uniformly so insertColumn always points past the last character of the name.
    const endChar = this.findTokenEnd(lineText, startChar, tokenName);
    const range = new vscode.Range(lineIdx, startChar, lineIdx, endChar);
    const diag = new vscode.Diagnostic(
      range,
      `Chamada final do método "${symbol.name}" sem argumentos deve usar parênteses "()".`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.CallParenthesesMismatch;
    const payload: CallParenthesesMismatchPayload = {
      code: DiagnosticCodes.CallParenthesesMismatch,
      line: lineIdx,
      insertColumn: endChar,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    setDiagnosticPayload(diag, payload);
    this.diagnostics.push(diag);
  }

  private findTokenEnd(lineText: string, startChar: number, tokenName: string): number {
    const start = Math.max(0, startChar);
    const expectedEnd = start + tokenName.length;
    if (lineText.slice(start, expectedEnd).toLowerCase() === tokenName.toLowerCase()) {
      return expectedEnd;
    }
    let cursor = start;
    while (isIdentifierChar(lineText[cursor])) cursor++;
    return cursor > start ? cursor : expectedEnd;
  }

  private checkExpressionStatement(node: ExpressionStatement): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;

    // Loose Type Statement
    const expr = node.expression;
    const parameterlessCallable = this.resolveParameterlessFinalCall(expr, lineIdx);
    if (expr.kind === "MemberAccess" && expr.member.toLowerCase() === "dowork") {
      console.log("FROM EXPRESSION STATEMENT! parameterlessCallable:", !!parameterlessCallable);
    }
    if (parameterlessCallable) {
      this.pushFinalCallParenthesesDiagnostic(expr, parameterlessCallable, lineIdx);
      return;
    }

    let isLooseType = false;
    let typeName = "";
    if (expr.kind === "Identifier") {
      if (
        PRIMITIVE_TYPES.has(expr.name.toLowerCase()) ||
        DiagnosticsLinter.isKnownType(expr.name, this.indexer)
      ) {
        isLooseType = true;
        typeName = expr.name;
      }
    } else if (expr.kind === "MemberAccess") {
      const fullPath = exprToString(expr);
      if (fullPath && DiagnosticsLinter.isKnownType(fullPath, this.indexer)) {
        isLooseType = true;
        typeName = fullPath;
      }
    }

    if (isLooseType) {
      const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
      const diag = new vscode.Diagnostic(
        range,
        `Nome de tipo avulso "${typeName}" não é permitido como instrução standalone.`,
        vscode.DiagnosticSeverity.Error,
      );
      diag.code = DiagnosticCodes.LooseTypeStatement;
      this.diagnostics.push(diag);
    } else if (node.expression.kind === "MemberAccess") {
      const target = node.expression.target;
      if (target.kind === "Identifier" && PRIMITIVE_TYPES.has(target.name.toLowerCase())) {
        const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
        const diag = new vscode.Diagnostic(
          range,
          `O tipo primitivo "${target.name}" não possui membros estáticos acessíveis. Acesso ".${node.expression.member}" é inválido.`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.LooseTypeStatement;
        this.diagnostics.push(diag);
      }
    } else if (
      node.expression.kind === "MethodInvocation" &&
      node.expression.callee?.kind === "Identifier"
    ) {
      const calleeName = node.expression.callee.name;
      if (PRIMITIVE_TYPES.has(calleeName.toLowerCase())) {
        const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
        const diag = new vscode.Diagnostic(
          range,
          `O tipo primitivo "${calleeName}" não possui membros estáticos acessíveis. Acesso ".${node.expression.methodName}" é inválido.`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.LooseTypeStatement;
        this.diagnostics.push(diag);
      }
    }
  }

  private isCatchBodyWrappedWithAssignedCheck(node: TryCatchStatement): boolean {
    if (!node.catchVar) {
      return false;
    }
    if (node.catchBody.length !== 1) {
      return false;
    }
    const stmt = node.catchBody[0];
    if (stmt?.kind !== "IfStatement") {
      return false;
    }
    if (stmt.elseIfBranches.length > 0 || stmt.elseBranch) {
      return false;
    }
    const cond = stmt.condition;
    if (
      cond.kind === "MethodInvocation" &&
      cond.methodName.toLowerCase() === "assigned" &&
      cond.arguments.length === 1
    ) {
      const arg = cond.arguments[0];
      if (
        arg?.kind === "Identifier" &&
        arg.name.toLowerCase() === node.catchVar.name.toLowerCase()
      ) {
        return true;
      }
    }
    return false;
  }

  private checkTryCatchStatement(node: TryCatchStatement): void {
    if (DiagnosticsASTWalker.LEGACY_FINALLY_WARNING_ENABLED && node.finallyBody && node.loc) {
      if (this.isCatchBodyWrappedWithAssignedCheck(node)) {
        return;
      }

      const lineIdx = node.loc.startLine - 1;
      const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
      const diag = new vscode.Diagnostic(
        range,
        `O uso de 'Finally' no bloco Try/Catch não é recomendado devido a um bug conhecido no compilador que sempre executa o bloco 'Catch'.`,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = LegacyDiagnosticCodes.FinallyBlockUnsupported;

      const tryBody = node.tryBody;
      const catchBody = node.catchBody;
      const nodeLoc = node.loc;

      let catchLine = -1;
      let startSearchLine = nodeLoc.startLine;
      if (tryBody.length > 0) {
        const lastTryStmt = tryBody[tryBody.length - 1];
        if (lastTryStmt?.loc) {
          startSearchLine = lastTryStmt.loc.endLine;
        }
      }

      const firstStmt = catchBody[0];
      const lastStmt = catchBody[catchBody.length - 1];
      const endSearchLine = firstStmt?.loc?.startLine ?? nodeLoc.endLine;

      for (let i = startSearchLine - 1; i < endSearchLine; i++) {
        const lineText = this.lines[i] ?? "";
        if (/^\s*Catch\b/i.test(lineText)) {
          catchLine = i;
          break;
        }
      }

      if (catchLine !== -1) {
        const finallyLine = this.findTryCatchKeywordLine("Finally", catchLine + 1, nodeLoc.endLine);
        const endTryLine = this.findTryCatchKeywordLine(
          "End\\s+Try",
          finallyLine !== -1 ? finallyLine + 1 : catchLine + 1,
          nodeLoc.endLine,
        );
        const payload: FinallyBlockUnsupportedPayload = {
          code: LegacyDiagnosticCodes.FinallyBlockUnsupported,
          catchLine,
          catchBodyStartLine: firstStmt?.loc ? firstStmt.loc.startLine - 1 : -1,
          catchBodyEndLine: lastStmt?.loc ? lastStmt.loc.endLine - 1 : -1,
          catchVarName: node.catchVar?.name,
          isEmptyCatch: catchBody.length === 0,
          isEmptyFinally: node.finallyBody.length === 0,
          finallyLine: finallyLine !== -1 ? finallyLine : undefined,
          finallyEndLine: endTryLine !== -1 ? endTryLine - 1 : undefined,
        };
        setDiagnosticPayload(diag, payload);
      }

      this.diagnostics.push(diag);
    }
  }

  private findTryCatchKeywordLine(
    keywordPattern: string,
    startLine: number,
    endLine: number,
  ): number {
    const regex = new RegExp(`^\\s*${keywordPattern}\\b`, "i");
    const last = Math.min(this.lines.length, endLine);
    for (let i = Math.max(0, startLine); i < last; i++) {
      if (regex.test(this.lines[i] ?? "")) return i;
    }
    return -1;
  }

  private checkIfStatement(node: IfStatement): void {
    if (node.singleLine && node.loc) {
      const lineIdx = node.loc.startLine - 1;
      const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
      const diag = new vscode.Diagnostic(
        range,
        "A sintaxe 'If ... Then' inline não é recomendada. Prefira usar bloco 'If ... Then ... End If'.",
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = DiagnosticCodes.InlineIfThen;
      const payload: InlineIfThenPayload = {
        code: DiagnosticCodes.InlineIfThen,
        line: lineIdx,
      };
      setDiagnosticPayload(diag, payload);
      this.diagnostics.push(diag);
    }

    if (node.hasThen === false && node.loc) {
      let insertLine = node.loc.startLine - 1;
      while (insertLine < this.lines.length) {
        const lineText = this.lines[insertLine] ?? "";
        if (!lineText.trim().endsWith("_")) {
          break;
        }
        insertLine++;
      }
      const targetLineText = this.lines[insertLine] ?? "";
      const commentIdx = getCommentStartIndex(targetLineText);
      const insertCol = targetLineText
        .substring(0, commentIdx === -1 ? targetLineText.length : commentIdx)
        .trimEnd().length;

      const range = new vscode.Range(insertLine, 0, insertLine, targetLineText.length);
      const diag = new vscode.Diagnostic(
        range,
        `Instrução 'If' sem a palavra-chave 'Then'.`,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = DiagnosticCodes.MissingThen;
      const payload: MissingThenPayload = {
        code: DiagnosticCodes.MissingThen,
        line: insertLine,
        insertColumn: insertCol,
      };
      setDiagnosticPayload(diag, payload);
      this.diagnostics.push(diag);
    }

    for (const branch of node.elseIfBranches) {
      if (branch.hasSpace && branch.loc) {
        const lineIdx = branch.loc.startLine - 1;
        const range = new vscode.Range(
          lineIdx,
          branch.loc.startChar,
          lineIdx,
          branch.loc.startChar + 7,
        );
        const diag = new vscode.Diagnostic(
          range,
          `A sintaxe 'Else If' com espaço não é aceita pelo compilador. Use 'ElseIf'.`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.ElseIfWhitespace;
        const payload: ElseIfWhitespacePayload = {
          code: DiagnosticCodes.ElseIfWhitespace,
          line: lineIdx,
          column: branch.loc.startChar,
        };
        setDiagnosticPayload(diag, payload);
        this.diagnostics.push(diag);
      }

      if (branch.hasThen === false && branch.loc) {
        let insertLine = branch.loc.startLine - 1;
        while (insertLine < this.lines.length) {
          const lineText = this.lines[insertLine] ?? "";
          if (!lineText.trim().endsWith("_")) {
            break;
          }
          insertLine++;
        }
        const targetLineText = this.lines[insertLine] ?? "";
        const commentIdx = getCommentStartIndex(targetLineText);
        const insertCol = targetLineText
          .substring(0, commentIdx === -1 ? targetLineText.length : commentIdx)
          .trimEnd().length;

        const range = new vscode.Range(insertLine, 0, insertLine, targetLineText.length);
        const diag = new vscode.Diagnostic(
          range,
          `Instrução 'ElseIf' sem a palavra-chave 'Then'.`,
          vscode.DiagnosticSeverity.Warning,
        );
        diag.code = DiagnosticCodes.MissingThen;
        const payload: MissingThenPayload = {
          code: DiagnosticCodes.MissingThen,
          line: insertLine,
          insertColumn: insertCol,
        };
        setDiagnosticPayload(diag, payload);
        this.diagnostics.push(diag);
      }
    }
  }

  private checkReturnStatement(node: ReturnStatement): void {
    if (!node.loc) return;

    if (this.activeProperty) return;
    const lineIdx = node.loc.startLine - 1;

    let isSingleLineIf = false;
    for (let i = this.parentStack.length - 1; i >= 0; i--) {
      const parentNode = this.parentStack[i];
      if (parentNode?.kind === "IfStatement") {
        if (parentNode.singleLine) {
          isSingleLineIf = true;
        }
        break;
      }
    }

    // const inProperty = !!this.activeProperty;
    const inSub = !!this.activeMethod && !this.activeMethod.returnType;
    const inFunction = !!this.activeMethod && !!this.activeMethod.returnType;

    const targetName =
      // inProperty
      //   ? this.activeProperty?.name
      //   :
      inFunction ? this.activeMethod?.name : undefined;
    const exitType =
      // inProperty ? "Property" :
      inFunction ? "Function" : "Sub";
    if (targetName && node.expression) {
      const sharedReturnGlobal = this.resolveSharedReturnGlobalFunction(node.expression, lineIdx);
      if (sharedReturnGlobal) {
        this.pushSharedReturnGlobalFunctionDiagnostic(
          node.expression,
          sharedReturnGlobal,
          lineIdx,
          undefined,
        );
      }
    }
    if (targetName && this.isInsideCatchBlock(node)) return;

    let msg = "O uso de 'Return' não é recomendado devido a lentidão gerada no compilador.";
    if (inSub) {
      msg = "O uso de 'Return' não é recomendado. Prefira usar 'Exit Sub'.";
    } else if (targetName) {
      msg = `O uso de 'Return' não é recomendado. Prefira atribuir o valor a "${targetName}" e usar 'Exit ${exitType}'.`;
    }

    const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
    const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning);
    diag.code = DiagnosticCodes.ReturnUnrecommended;

    let expressionText: string | undefined;
    if (node.expression?.loc) {
      const startL = node.expression.loc.startLine - 1;
      const startC = node.expression.loc.startChar;
      const endL = node.expression.loc.endLine - 1;
      const endC = node.expression.loc.endChar;
      if (startL === endL) {
        expressionText = (this.lines[startL] ?? "").substring(startC, endC);
      } else {
        expressionText = exprToString(node.expression);
      }
    }

    const payload: ReturnUnrecommendedPayload = {
      code: DiagnosticCodes.ReturnUnrecommended,
      line: lineIdx,
      startChar: node.loc.startChar,
      endChar: node.loc.endChar,
      expressionText,
      exitType,
      targetName,
      isConditional: this.conditionalBlockDepth > 0,
      isSingleLineIf,
    };
    setDiagnosticPayload(diag, payload);
    this.diagnostics.push(diag);
  }

  private pushReturnAssignmentInCatchDiagnostic(node: Assignment): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;
    const lineText = this.lines[lineIdx] ?? "";
    const range = new vscode.Range(
      lineIdx,
      node.target.loc?.startChar ?? node.loc.startChar,
      lineIdx,
      node.target.loc?.endChar ?? node.loc.endChar,
    );
    const diag = new vscode.Diagnostic(
      range,
      "Retorno por atribuição dentro de Catch não é aceito pelo compilador nativo. Use 'Return <valor>'.",
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.ReturnAssignmentInCatch;

    let expressionText: string | undefined = exprToString(node.value);
    if (node.value.loc) {
      const startLine = node.value.loc.startLine - 1;
      const endLine = node.value.loc.endLine - 1;
      if (startLine === endLine) {
        expressionText = (this.lines[startLine] ?? "").substring(
          node.value.loc.startChar,
          node.value.loc.endChar,
        );
        if (expressionText.trim().length === 0) {
          expressionText = exprToString(node.value);
        }
      } else {
        expressionText = exprToString(node.value);
      }
    }
    const expressionTextFromLine = this.expressionTextFromAssignmentLine(lineText, node);
    if (
      expressionTextFromLine &&
      (!expressionText || expressionTextFromLine.startsWith(expressionText))
    ) {
      expressionText = expressionTextFromLine;
    }

    const payload: ReturnAssignmentInCatchPayload = {
      code: DiagnosticCodes.ReturnAssignmentInCatch,
      line: lineIdx,
      startChar: node.loc.startChar,
      endChar: Math.max(node.loc.endChar, lineText.trimEnd().length),
      expressionText,
    };
    setDiagnosticPayload(diag, payload);
    this.diagnostics.push(diag);
  }

  private expressionTextFromAssignmentLine(lineText: string, node: Assignment): string | undefined {
    const startChar = node.target.loc?.endChar ?? node.loc?.startChar ?? 0;
    const equalsIndex = lineText.indexOf("=", startChar);
    if (equalsIndex === -1) return undefined;
    const commentIndex = this.findInlineCommentColumn(lineText, equalsIndex + 1);
    const endChar = commentIndex === -1 ? lineText.length : commentIndex;
    const expressionText = lineText.slice(equalsIndex + 1, endChar).trim();
    return expressionText.length > 0 ? expressionText : undefined;
  }

  private findInlineCommentColumn(lineText: string, startColumn: number): number {
    let inString = false;
    for (let index = startColumn; index < lineText.length; index++) {
      const char = lineText[index];
      if (char === '"') {
        if (inString && lineText[index + 1] === '"') {
          index++;
          continue;
        }
        inString = !inString;
        continue;
      }
      if (!inString && char === "'") return index;
    }
    return -1;
  }

  private isCurrentReturnAssignmentTarget(node: Assignment): boolean {
    if (node.target.kind !== "Identifier") return false;
    const targetName = node.target.name.toLowerCase();
    const activeMethodName =
      this.activeMethod?.returnType !== undefined ? this.activeMethod.name.toLowerCase() : "";
    const activePropertyName = this.activeProperty?.name.toLowerCase() ?? "";
    return targetName === activeMethodName || targetName === activePropertyName;
  }

  private isInsideCatchBlock(node: Node): boolean {
    if (!node.loc) return false;
    const line = node.loc.startLine;
    return this.parentStack.some((parent) => {
      if (parent.kind !== "TryCatchStatement" || parent.catchBody.length === 0) return false;
      const first = parent.catchBody[0]?.loc;
      const last = parent.catchBody[parent.catchBody.length - 1]?.loc;
      if (!first || !last) return false;
      return line >= first.startLine && line <= last.endLine;
    });
  }
}
