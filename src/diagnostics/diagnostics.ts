import * as vscode from "vscode";
import type { WorkspaceSymbolIndexer, SymbolInfo, ParameterInfo } from "../analysis/symbol-indexer";
import {
  lookupSystemByContainer,
  lookupSystemClassByName,
  lookupSystemByName,
  SYSTEM_SYMBOLS,
} from "../system-library";
import { TypeResolver } from "../analysis/type-resolver";
import { parseBasic } from "../project/parser";
import { detectEnumerable } from "../analysis/enumerable-detector";
import {
  analyzeGenericsPass,
  type GenericsPassWarning,
  type GenericTemplateInfo,
} from "../analysis/generics-analyzer";
import type {
  ClassGenericMethodUnsupportedPayload,
  DuplicateTemplatePayload,
  FlatNameCollisionPayload,
  GenericArityMismatchPayload,
  InstantiationLimitExceededPayload,
  InvalidInterpolationPayload,
  MissingImportPayload,
  NotEnumerablePayload,
  TernaryContextUnsupportedPayload,
  UnknownMemberPayload,
  UnknownSuppressionCodePayload,
  UnknownTemplatePayload,
  UnsupportedMemberPayload,
  DuplicateDeclarationPayload,
} from "./diagnostic-codes";
import { DiagnosticCodes, setDiagnosticPayload } from "./diagnostic-codes";
import { PRIMITIVE_TYPES } from "../utils/primitive-types";
import { readConfiguration, resolveDiagnosticSeverity } from "../infra/configuration";
import { extractSuppressedCodes, listSuppressionDirectives } from "../utils/suppression-comments";
import { parseInterpolation } from "../utils/interpolation";
import { LanguageProcessor } from "../analysis/language-processor";
import {
  ASTWalker,
  type CompilationUnit,
  type ClassDeclaration,
  type MethodDeclaration,
  type DelegateDeclaration,
  type PropertyDeclaration,
  type VariableDeclaration,
  type Expression,
  type Statement,
  type Node,
  type MemberAccess,
  type MethodInvocation,
  type TypeReference,
  type ForEachStatement,
  type TaggedTemplateExpression,
  type TernaryExpression,
  type Assignment,
  type ExpressionStatement,
  type OpaqueStatement,
  type SourceLocation,
} from "../project/ast/ast";

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
      for (const s of indexer.getAllSymbols()) {
        if (s.containerName?.toLowerCase() === containerName.toLowerCase()) names.add(s.name);
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

    const nameLower = name.toLowerCase();
    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    const activeNamespace = fileSyms?.symbols.find((s) => s.kind === "namespace")?.name;

    const workspaceMatches = indexer
      .getAllSymbols()
      .filter(
        (s) =>
          s.name.toLowerCase() === nameLower &&
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
    if (isLikelyGenericTypeParameter(lhsType) || isLikelyGenericTypeParameter(rhsType)) return true;
    if (areSameGenericTemplateCompatible(rhsType, lhsType, indexer)) return true;

    const lhsIsPrimitive = PRIMITIVE_TYPES.has(lhsLower);
    const rhsIsPrimitive = PRIMITIVE_TYPES.has(rhsLower);

    if (rhsLower === "null") return !lhsIsPrimitive || lhsIsTObjectRoot;
    if (rhsLower === "unassigned") return lhsIsPrimitive && !lhsIsTObjectRoot;

    if (lhsLower === "variant") return rhsIsPrimitive;
    if (rhsLower === "variant") return lhsIsPrimitive;

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
    [DiagnosticCodes.DeclarationParenthesesMismatch]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.FunctionReadSelf]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.InvalidAssignmentTarget]: vscode.DiagnosticSeverity.Error,
    [DiagnosticCodes.MissingReturnValue]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.DeadCode]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.MissingMyBaseFree]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticCodes.TypeMismatch]: vscode.DiagnosticSeverity.Error,
  };

  private static readonly VALID_DIAGNOSTIC_CODES: ReadonlySet<string> = new Set(
    Object.values(DiagnosticCodes),
  );

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
    const cached = LanguageProcessor.getInstance().getOrParse(document.uri.toString(), text);
    const unit = cached.unit;

    // Run the AST-based linter walker
    const walker = new DiagnosticsASTWalker(document, indexer, text, lines, diagnostics);
    walker.run(unit);

    // Validate duplicate declarations using AST structure
    this.validateDuplicateDeclarations(unit, document, indexer, diagnostics);

    // Validate constructor calls (Sub New calls MyBase.New) using AST structure
    this.validateMyBaseNewCalls(unit, diagnostics);

    // Validate destructor resource cleanup (Sub Free calls MyBase.Free) using AST structure
    this.validateMyBaseFreeCalls(
      unit,
      indexer.getFileSymbols(document.uri.toString()),
      diagnostics,
    );

    // Textual generic pre-pass remains backward-compatible via AST analyzer warnings
    const genericWarnings = analyzeGenericsPass(text, {
      externalTemplates: collectWorkspaceGenericTemplates(indexer, document.uri.toString()),
    });
    for (const warning of genericWarnings) {
      const range = computeGenericWarningRange(warning, lines);
      const diag = new vscode.Diagnostic(
        range,
        formatGenericWarningMessage(warning),
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = mapGenericWarningToDiagnosticCode(warning.code);
      attachGenericWarningPayload(diag, warning);
      diagnostics.push(diag);
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
  }

  private validateDuplicateDeclarations(
    unit: CompilationUnit,
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
    diagnostics: vscode.Diagnostic[],
  ): void {
    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    if (!fileSyms) return;

    const activeNamespace = fileSyms.symbols.find((s) => s.kind === "namespace")?.name;
    const activeNsLower = activeNamespace?.toLowerCase();

    const imports = fileSyms.imports;
    const importedNs = new Set(imports.map((imp) => imp.toLowerCase()));

    const outerSymbols = new Map<string, { kind: string; container?: string }>();
    const primitives = ["string", "integer", "boolean", "double", "variant", "tobject", "void"];
    primitives.forEach((p) => outerSymbols.set(p, { kind: "tipo primitivo" }));

    SYSTEM_SYMBOLS.forEach((s) => {
      if (
        !s.containerName ||
        s.containerName.toLowerCase() === "system" ||
        s.containerName.toLowerCase() === "globals"
      ) {
        outerSymbols.set(s.name.toLowerCase(), {
          kind: "símbolo global do sistema",
          container: s.containerName,
        });
      }
    });

    indexer.getAllSymbols().forEach((s) => {
      if (s.fileUri && s.fileUri === document.uri.toString()) return;
      if (s.fileUri && /principal\.bas$/i.test(s.fileUri)) {
        outerSymbols.set(s.name.toLowerCase(), {
          kind: "símbolo global (Principal.bas)",
          container: s.containerName,
        });
      }
    });

    const checkTopLevel = (s: SymbolInfo): void => {
      if (s.kind === "namespace") return;
      if (s.isSyntheticGenericInstantiation) return;
      if (!s.containerName) return;
      if (s.fileUri && s.fileUri === document.uri.toString()) return;

      const containerLower = s.containerName.toLowerCase();
      if (importedNs.has(containerLower)) {
        outerSymbols.set(s.name.toLowerCase(), {
          kind: `tipo importado de ${s.containerName}`,
          container: s.containerName,
        });
      }
      if (activeNsLower && containerLower === activeNsLower) {
        outerSymbols.set(s.name.toLowerCase(), {
          kind: `tipo no namespace ${s.containerName}`,
          container: s.containerName,
        });
      }
    };
    SYSTEM_SYMBOLS.forEach((s) => {
      checkTopLevel(s);
    });
    indexer.getAllSymbols().forEach((s) => {
      checkTopLevel(s);
    });

    const createConflictDiag = (
      range: vscode.Range,
      message: string,
      payload: DuplicateDeclarationPayload,
      related?: { uri?: string; range: vscode.Range; message: string },
    ): void => {
      const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
      diag.code = DiagnosticCodes.DuplicateDeclaration;
      if (related) {
        diag.relatedInformation = [
          {
            location: new vscode.Location(
              related.uri ? vscode.Uri.parse(related.uri) : document.uri,
              related.range,
            ),
            message: related.message,
          },
        ];
      }
      setDiagnosticPayload(diag, payload);
      diagnostics.push(diag);
    };

    const symbolRange = (s: SymbolInfo): vscode.Range =>
      new vscode.Range(s.range.startLine, s.range.startChar, s.range.startLine, s.range.endChar);
    const locRange = (loc: SourceLocation): vscode.Range =>
      new vscode.Range(loc.startLine - 1, loc.startChar, loc.endLine - 1, loc.endChar);

    const fileTopLevel = new Map<string, SymbolInfo>();

    // Namespace level checks
    fileSyms.symbols.forEach((s) => {
      if (s.kind === "namespace") return;
      if (s.isSyntheticGenericInstantiation) return;
      const isTopLevel =
        !s.containerName || (activeNamespace && s.containerName === activeNamespace);
      if (!isTopLevel) return;

      const nameLower = s.name.toLowerCase();
      const existing = fileTopLevel.get(nameLower);
      if (existing) {
        const bothMethods = s.kind === "method" && existing.kind === "method";
        if (bothMethods && !DiagnosticsLinter.isSameSignature(s.parameters, existing.parameters)) {
          return;
        }
        createConflictDiag(
          new vscode.Range(
            s.range.startLine,
            s.range.startChar,
            s.range.startLine,
            s.range.endChar,
          ),
          `Declaração duplicada: o tipo/símbolo '${s.name}' já foi declarado neste arquivo.`,
          {
            code: DiagnosticCodes.DuplicateDeclaration,
            name: s.name,
            scope: "namespace",
            conflictingWithName: existing.name,
          },
          {
            uri: existing.fileUri,
            range: symbolRange(existing),
            message: `Declaração anterior de '${existing.name}'.`,
          },
        );
        return;
      }
      fileTopLevel.set(nameLower, s);

      const otherFileSymbol = indexer
        .getAllSymbols()
        .find(
          (other) =>
            other.name.toLowerCase() === nameLower &&
            other.kind === s.kind &&
            !other.isSyntheticGenericInstantiation &&
            other.containerName?.toLowerCase() === s.containerName?.toLowerCase() &&
            other.fileUri !== s.fileUri,
        );
      if (otherFileSymbol) {
        createConflictDiag(
          new vscode.Range(
            s.range.startLine,
            s.range.startChar,
            s.range.startLine,
            s.range.endChar,
          ),
          `Declaração duplicada: o tipo/símbolo '${s.name}' já foi declarado no namespace '${s.containerName}' no arquivo '${otherFileSymbol.fileUri}'.`,
          {
            code: DiagnosticCodes.DuplicateDeclaration,
            name: s.name,
            scope: "namespace",
            conflictingWithName: otherFileSymbol.name,
          },
          {
            uri: otherFileSymbol.fileUri,
            range: symbolRange(otherFileSymbol),
            message: `Declaração anterior de '${otherFileSymbol.name}'.`,
          },
        );
        return;
      }

      const outerSym = outerSymbols.get(nameLower);
      if (outerSym) {
        createConflictDiag(
          new vscode.Range(
            s.range.startLine,
            s.range.startChar,
            s.range.startLine,
            s.range.endChar,
          ),
          `O tipo/símbolo '${s.name}' conflita com o ${outerSym.kind} '${s.name}'.`,
          {
            code: DiagnosticCodes.DuplicateDeclaration,
            name: s.name,
            scope: "imported",
            conflictingWithName: s.name,
          },
        );
      }
    });

    // Class members checks
    const classes = fileSyms.symbols.filter((s) => s.kind === "class" || s.kind === "structure");
    classes.forEach((C) => {
      const members = fileSyms.symbols.filter(
        (s) => s.containerName?.toLowerCase() === C.name.toLowerCase(),
      );

      const sharedMembers = members.filter((m) => m.isShared);
      const instanceMembers = members.filter((m) => !m.isShared);

      const validateMemberGroup = (group: SymbolInfo[]): void => {
        const declaredInGroup = new Map<string, SymbolInfo[]>();

        group.forEach((m) => {
          const nameLower = m.name.toLowerCase();

          if (nameLower === C.name.toLowerCase() && nameLower !== "new") {
            createConflictDiag(
              new vscode.Range(
                m.range.startLine,
                m.range.startChar,
                m.range.startLine,
                m.range.endChar,
              ),
              `O membro '${m.name}' conflita com o nome da classe/estrutura '${C.name}'.`,
              {
                code: DiagnosticCodes.DuplicateDeclaration,
                name: m.name,
                scope: "class",
                conflictingWithName: C.name,
              },
            );
            return;
          }

          const existingList = declaredInGroup.get(nameLower);
          if (existingList) {
            for (const existing of existingList) {
              const bothMethods = m.kind === "method" && existing.kind === "method";
              if (bothMethods) {
                if (DiagnosticsLinter.isSameSignature(m.parameters, existing.parameters)) {
                  createConflictDiag(
                    new vscode.Range(
                      m.range.startLine,
                      m.range.startChar,
                      m.range.startLine,
                      m.range.endChar,
                    ),
                    `Membro duplicado: a classe '${C.name}' já declara um método '${m.name}' com a mesma assinatura (tipo e ordem de parâmetros).`,
                    {
                      code: DiagnosticCodes.DuplicateDeclaration,
                      name: m.name,
                      scope: "class",
                      conflictingWithName: existing.name,
                    },
                    {
                      uri: existing.fileUri,
                      range: symbolRange(existing),
                      message: `Membro anterior '${existing.name}'.`,
                    },
                  );
                  return;
                }
              } else {
                createConflictDiag(
                  new vscode.Range(
                    m.range.startLine,
                    m.range.startChar,
                    m.range.startLine,
                    m.range.endChar,
                  ),
                  `Membro duplicado: o nome '${m.name}' já é utilizado por outro membro na classe '${C.name}'.`,
                  {
                    code: DiagnosticCodes.DuplicateDeclaration,
                    name: m.name,
                    scope: "class",
                    conflictingWithName: existing.name,
                  },
                  {
                    uri: existing.fileUri,
                    range: symbolRange(existing),
                    message: `Membro anterior '${existing.name}'.`,
                  },
                );
                return;
              }
            }
            existingList.push(m);
          } else {
            declaredInGroup.set(nameLower, [m]);
          }
        });
      };

      validateMemberGroup(sharedMembers);
      validateMemberGroup(instanceMembers);
    });

    // Local / Method level variable checks using AST collector
    const walker = new (class extends ASTWalker {
      public override walk(node: Node): void {
        if (node.kind === "MethodDeclaration") {
          const C = classes.find(
            (c) =>
              c.name.toLowerCase() === node.modifiers?.[0]?.toLowerCase() ||
              c.name.toLowerCase() ===
                fileSyms.symbols
                  .find((s) => s.name === node.name && s.kind === "method")
                  ?.containerName?.toLowerCase(),
          );
          const collector = new LocalDeclarationCollector(node);
          collector.collect();

          const declaredInMethod = new Map<string, SourceLocation>();
          collector.declarations.forEach((v) => {
            const nameLower = v.name.toLowerCase();
            const range = new vscode.Range(
              v.loc.startLine - 1,
              v.loc.startChar,
              v.loc.endLine - 1,
              v.loc.endChar,
            );

            const existingRange = declaredInMethod.get(nameLower);
            if (existingRange) {
              createConflictDiag(
                range,
                `Declaração duplicada: o identificador '${v.name}' já foi declarado neste método.`,
                {
                  code: DiagnosticCodes.DuplicateDeclaration,
                  name: v.name,
                  scope: "method",
                  conflictingWithName: v.name,
                },
                {
                  range: locRange(existingRange),
                  message: `Declaração anterior de '${v.name}'.`,
                },
              );
              return;
            }
            declaredInMethod.set(nameLower, v.loc);

            if (C) {
              const members = fileSyms.symbols.filter(
                (s) => s.containerName?.toLowerCase() === C.name.toLowerCase(),
              );
              const isShared = node.modifiers?.includes("shared") ?? false;
              const visibleMembers = isShared ? members.filter((m) => m.isShared) : members;

              const conflictingMember = visibleMembers.find(
                (m) => m.name.toLowerCase() === nameLower,
              );
              if (conflictingMember) {
                createConflictDiag(
                  range,
                  `O identificador '${v.name}' conflita com o membro '${conflictingMember.name}' da classe '${C.name}'.`,
                  {
                    code: DiagnosticCodes.DuplicateDeclaration,
                    name: v.name,
                    scope: "class",
                    conflictingWithName: conflictingMember.name,
                  },
                  {
                    uri: conflictingMember.fileUri,
                    range: symbolRange(conflictingMember),
                    message: `Membro declarado aqui: '${conflictingMember.name}'.`,
                  },
                );
                return;
              }

              if (nameLower === C.name.toLowerCase()) {
                createConflictDiag(
                  range,
                  `O identificador '${v.name}' conflita com o nome da classe envolvente '${C.name}'.`,
                  {
                    code: DiagnosticCodes.DuplicateDeclaration,
                    name: v.name,
                    scope: "class",
                    conflictingWithName: C.name,
                  },
                  {
                    uri: C.fileUri,
                    range: symbolRange(C),
                    message: `Classe declarada aqui: '${C.name}'.`,
                  },
                );
                return;
              }
            }
          });
        }
        super.walk(node);
      }
    })();
    walker.walk(unit);
  }

  private static isSameSignature(
    params1: ParameterInfo[] | undefined,
    params2: ParameterInfo[] | undefined,
  ): boolean {
    const p1 = params1 ?? [];
    const p2 = params2 ?? [];
    if (p1.length !== p2.length) return false;
    for (let i = 0; i < p1.length; i++) {
      const type1 = p1[i]?.type.toLowerCase() ?? "variant";
      const type2 = p2[i]?.type.toLowerCase() ?? "variant";
      if (type1 !== type2) return false;
    }
    return true;
  }

  private validateMyBaseNewCalls(unit: CompilationUnit, diagnostics: vscode.Diagnostic[]): void {
    const walker = new (class extends ASTWalker {
      private currentClassName = "";

      public override walk(node: Node): void {
        if (node.kind === "ClassDeclaration") {
          const prev = this.currentClassName;
          this.currentClassName = node.name;
          super.walk(node);
          this.currentClassName = prev;
          return;
        }

        if (node.kind === "MethodDeclaration") {
          if (node.isConstructor) {
            let hasMyBaseNew = false;
            const checkCalls = new (class extends ASTWalker {
              protected override visitMethodInvocation(call: MethodInvocation): void {
                if (
                  call.methodName.toLowerCase() === "new" &&
                  call.callee?.kind === "Identifier" &&
                  call.callee.name.toLowerCase() === "mybase"
                ) {
                  hasMyBaseNew = true;
                }
              }
            })();
            for (const s of node.body) {
              checkCalls.walk(s);
            }

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!hasMyBaseNew && node.loc) {
              const range = new vscode.Range(
                node.loc.startLine - 1,
                node.loc.startChar,
                node.loc.startLine - 1,
                node.loc.endChar,
              );
              const msg =
                `Construtor 'Sub New' da classe '${this.currentClassName || "desconhecida"}' não chama ` +
                `'MyBase.New()'. Toda classe Data7 deve inicializar o objeto base no construtor. ` +
                `Se a classe herda de outra, passe os argumentos necessários: 'MyBase.New(pParam As String)'.`;
              const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning);
              diag.code = DiagnosticCodes.MissingMyBaseNew;
              setDiagnosticPayload(diag, {
                code: DiagnosticCodes.MissingMyBaseNew,
                className: this.currentClassName || "",
              });
              diagnostics.push(diag);
            }
          }
        }
        super.walk(node);
      }
    })();
    walker.walk(unit);
  }

  private validateMyBaseFreeCalls(
    unit: CompilationUnit,
    fileSyms: ReturnType<WorkspaceSymbolIndexer["getFileSymbols"]>,
    diagnostics: vscode.Diagnostic[],
  ): void {
    if (!fileSyms) return;

    const walker = new (class extends ASTWalker {
      public override walk(node: Node): void {
        if (node.kind === "ClassDeclaration") {
          const baseNameLower = node.baseType?.name.toLowerCase();
          if (baseNameLower === "baseenum" || baseNameLower === "coresugarbaseenum") {
            return;
          }

          const freeMethod = node.members.find(
            (m): m is MethodDeclaration =>
              m.kind === "MethodDeclaration" && m.name.toLowerCase() === "free",
          );

          if (!freeMethod && node.loc) {
            const range = new vscode.Range(
              node.loc.startLine - 1,
              node.loc.startChar,
              node.loc.startLine - 1,
              node.loc.endChar,
            );
            const msg = `Classe '${node.name}' não possui o método 'Sub Free()'. Toda classe deve ter 'Sub Free()' para liberação de recursos.`;
            const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning);
            diag.code = DiagnosticCodes.MissingMyBaseFree;
            setDiagnosticPayload(diag, {
              code: DiagnosticCodes.MissingMyBaseFree,
              className: node.name,
            });
            diagnostics.push(diag);
          } else if (freeMethod?.loc) {
            let hasMyBaseFree = false;
            const checkCalls = new (class extends ASTWalker {
              protected override visitMethodInvocation(call: MethodInvocation): void {
                if (
                  call.methodName.toLowerCase() === "free" &&
                  call.callee?.kind === "Identifier" &&
                  call.callee.name.toLowerCase() === "mybase"
                ) {
                  hasMyBaseFree = true;
                }
              }
            })();
            for (const s of freeMethod.body) {
              checkCalls.walk(s);
            }

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!hasMyBaseFree) {
              const range = new vscode.Range(
                freeMethod.loc.startLine - 1,
                freeMethod.loc.startChar,
                freeMethod.loc.startLine - 1,
                freeMethod.loc.endChar,
              );
              const msg = `O método 'Sub Free()' da classe '${node.name}' não chama 'MyBase.Free()'.`;
              const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning);
              diag.code = DiagnosticCodes.MissingMyBaseFree;
              setDiagnosticPayload(diag, {
                code: DiagnosticCodes.MissingMyBaseFree,
                className: node.name,
              });
              diagnostics.push(diag);
            }
          }
        }
        super.walk(node);
      }
    })();
    walker.walk(unit);
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

      const defaultSeverity = this.DEFAULT_SEVERITY[codeStr] ?? diag.severity;
      const resolved = resolveDiagnosticSeverity(codeStr, defaultSeverity, overrides);
      if (resolved === undefined) continue;
      diag.severity = resolved;
      output.push(diag);
    }

    return output;
  }
}

class LocalDeclarationCollector extends ASTWalker {
  public readonly declarations: { name: string; loc: SourceLocation; isParameter: boolean }[] = [];

  constructor(private readonly methodNode: MethodDeclaration) {
    super();
  }

  public collect(): void {
    for (const p of this.methodNode.parameters) {
      const loc = p.loc ?? p.type.loc;
      if (loc) {
        this.declarations.push({ name: p.name, loc: loc, isParameter: true });
      }
    }
    for (const s of this.methodNode.body) {
      this.walk(s);
    }
  }

  public override walk(node: Node): void {
    if (node.kind === "VariableDeclaration") {
      if (node.loc) {
        this.declarations.push({ name: node.name, loc: node.loc, isParameter: false });
      }
    } else if (node.kind === "DestructuredVariableDeclaration") {
      for (const binding of node.bindings) {
        if (node.loc) {
          this.declarations.push({ name: binding.name, loc: node.loc, isParameter: false });
        }
      }
    } else if (node.kind === "ForEachStatement") {
      if (node.elementVar.loc) {
        this.declarations.push({
          name: node.elementVar.name,
          loc: node.elementVar.loc,
          isParameter: false,
        });
      }
    } else if (node.kind === "UsingStatement") {
      if (node.resourceVar.loc) {
        this.declarations.push({
          name: node.resourceVar.name,
          loc: node.resourceVar.loc,
          isParameter: false,
        });
      }
    } else if (node.kind === "TryCatchStatement" && node.catchVar) {
      if (node.catchVar.loc) {
        this.declarations.push({
          name: node.catchVar.name,
          loc: node.catchVar.loc,
          isParameter: false,
        });
      }
    }
    super.walk(node);
  }
}

class ASTWordCollector extends ASTWalker {
  public readonly usedWords = new Set<string>();
  public readonly qualifiedTypes = new Set<string>();

  protected override visitTypeReference(node: TypeReference): void {
    if (node.name) {
      this.qualifiedTypes.add(node.name.toLowerCase());
      const parts = node.name.toLowerCase().split(".");
      for (const p of parts) this.usedWords.add(p);
    }
  }

  protected override visitMethodInvocation(node: MethodInvocation): void {
    if (node.methodName) {
      this.usedWords.add(node.methodName.toLowerCase());
    }
  }

  protected override visitOpaqueStatement(node: OpaqueStatement): void {
    const wordRegex = /[A-Za-z_]\w*/g;
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(node.text)) !== null) {
      this.usedWords.add(match[0].toLowerCase());
    }
  }

  walk(node: Node): void {
    if (node.kind === "Identifier" && node.name) {
      this.usedWords.add(node.name.toLowerCase());
    }
    if (node.kind === "MemberAccess" && node.member) {
      this.usedWords.add(node.member.toLowerCase());
    }
    if (node.kind === "MethodInvocation" && node.methodName) {
      this.usedWords.add(node.methodName.toLowerCase());
    }
    super.walk(node);
  }
}

class DiagnosticsASTWalker extends ASTWalker {
  private activeClass: ClassDeclaration | undefined;
  private activeMethod: MethodDeclaration | undefined;
  private activeProperty: PropertyDeclaration | undefined;

  private readonly parentStack: Node[] = [];
  private readonly scopes: Set<string>[] = [new Set()];
  private readonly allowedTernaries = new Set<TernaryExpression>();
  private readonly imports: { name: string; loc: SourceLocation }[] = [];
  private readonly typeParamStack: Set<string>[] = [];

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
    // Phase 1: Collect used words to identify unused imports
    const wordCollector = new ASTWordCollector();
    wordCollector.walk(unit);

    // Phase 2: Walk AST for structure diagnostics
    this.walk(unit);

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

      // Check if reference exists
      let isReferenced = false;
      if (wordCollector.qualifiedTypes.has(key)) {
        isReferenced = true;
      } else {
        const parts = key.split(".");
        const lastPart = parts[parts.length - 1];
        if (lastPart && wordCollector.usedWords.has(lastPart)) {
          isReferenced = true;
        }
      }

      if (!isReferenced) {
        const symbolsInNamespace = [
          ...this.indexer.getAllSymbols().filter((s) => s.containerName?.toLowerCase() === key),
          ...lookupSystemByContainer(imp.name),
        ];
        isReferenced = symbolsInNamespace.some((s) =>
          wordCollector.usedWords.has(s.name.toLowerCase()),
        );
      }

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

    if (node.kind === "VariableDeclaration" && node.initializer?.kind === "TernaryExpression") {
      this.allowedTernaries.add(node.initializer);
    }
    if (node.kind === "Assignment" && node.value.kind === "TernaryExpression") {
      this.allowedTernaries.add(node.value);
    }

    if (node.kind === "VariableDeclaration" && node.name) {
      this.addLocal(node.name);
    }

    const prevClass = this.activeClass;
    const prevMethod = this.activeMethod;
    const prevProp = this.activeProperty;

    let pushedScope = false;
    let pushedTypeParams = false;

    if (node.kind === "ClassDeclaration") {
      this.activeClass = node;
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
    }

    // AST custom checks dispatcher
    switch (node.kind) {
      case "MemberAccess":
        this.checkMemberAccess(node);
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
    }

    // Bare Identifier Unknown Symbol check
    if (node.kind === "Identifier" && node.name && node.loc) {
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
          ((this.isLocalDeclared(name) ||
            this.isGenericTypeParameter(name) ||
            (this.activeClass &&
              (TypeResolver.findMember(this.activeClass.name, name, this.indexer) !== undefined ||
                TypeResolver.getInheritedMembers(this.activeClass.name, this.indexer).some(
                  (m) => m.name.toLowerCase() === nameLower,
                )))) ??
            this.indexer.getAllSymbols().some((s) => s.name.toLowerCase() === nameLower)) ||
          SYSTEM_SYMBOLS.some((s) => s.name.toLowerCase() === nameLower);

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
    }

    this.parentStack.push(node);
    super.walk(node);
    this.parentStack.pop();

    if (pushedScope) {
      this.popScope();
    }

    if (pushedTypeParams) {
      this.typeParamStack.pop();
    }

    this.activeClass = prevClass;
    this.activeMethod = prevMethod;
    this.activeProperty = prevProp;
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

  protected override visitMethodInvocation(node: MethodInvocation): void {
    if (!node.loc) return;
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
      }

      if (typeName) {
        resolvedMethod = TypeResolver.findMember(typeName, node.methodName, this.indexer, arity);

        // Check UnknownMember for method call
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (node.callee && DiagnosticsLinter.isKnownType(typeName, this.indexer)) {
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
          }
        }
      }
    } else {
      const nameLower = node.methodName.toLowerCase();
      const fileSyms = this.indexer.getFileSymbols(this.document.uri.toString());
      const localSym = fileSyms?.symbols.find(
        (s) =>
          s.name.toLowerCase() === nameLower &&
          (s.kind === "method" || s.kind === "declare_sub" || s.kind === "declare_function"),
      );
      resolvedMethod =
        localSym ??
        SYSTEM_SYMBOLS.find(
          (s) =>
            s.name.toLowerCase() === nameLower &&
            (s.kind === "method" || s.kind === "declare_sub" || s.kind === "declare_function"),
        ) ??
        this.indexer
          .getAllSymbols()
          .find(
            (s) =>
              s.name.toLowerCase() === nameLower &&
              (s.kind === "method" || s.kind === "declare_sub" || s.kind === "declare_function"),
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

      if (isSub && parent && parent.kind !== "ExpressionStatement") {
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
    }
  }

  private checkMemberAccess(node: MemberAccess): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;
    const lineText = this.lines[lineIdx] ?? "";
    const dotIndex = lineText.indexOf(".", node.loc.startChar);
    const startChar = dotIndex !== -1 ? dotIndex + 1 : node.loc.startChar;

    const prefixLower = exprToString(node.target)?.toLowerCase() ?? "";

    if (prefixLower === "me" || prefixLower === "mybase") {
      if (this.activeClass) {
        const typeName =
          prefixLower === "me"
            ? this.activeClass.name
            : (this.activeClass.baseType?.name ?? "TObject");
        const resolved = TypeResolver.findMember(typeName, node.member, this.indexer);

        if (!resolved && !(node.member.toLowerCase() === "new" && prefixLower === "mybase")) {
          const range = new vscode.Range(
            lineIdx,
            startChar,
            lineIdx,
            startChar + node.member.length,
          );
          const diag = new vscode.Diagnostic(
            range,
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
            lineIdx,
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

    if (!typeName && node.target.kind === "Identifier") {
      const staticSymbol = this.indexer.findSymbolByName(
        node.target.name,
        this.document.uri.toString(),
      );
      if (
        staticSymbol &&
        (staticSymbol.kind === "class" ||
          staticSymbol.kind === "structure" ||
          staticSymbol.kind === "namespace")
      ) {
        typeName = staticSymbol.name;
        isStaticAccess = staticSymbol.kind === "class" || staticSymbol.kind === "structure";
      } else {
        const sysStaticSymbol = lookupSystemByName(node.target.name).find(
          (s) => s.kind === "namespace" || s.kind === "class" || s.kind === "structure",
        );
        if (sysStaticSymbol) {
          typeName = sysStaticSymbol.name;
          isStaticAccess = sysStaticSymbol.kind === "class" || sysStaticSymbol.kind === "structure";
        }
      }
    }

    if (typeName && DiagnosticsLinter.isKnownType(typeName, this.indexer)) {
      const resolved = TypeResolver.findMember(typeName, node.member, this.indexer);
      if (
        !resolved &&
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

    let resolvedLhs: SymbolInfo | undefined;
    if (node.target.kind === "Identifier") {
      resolvedLhs = this.indexer.findSymbolByName(node.target.name, this.document.uri.toString());
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
        const isCurrentFunction =
          resolvedLhs.name.toLowerCase() === this.activeMethod?.name.toLowerCase() ||
          resolvedLhs.name.toLowerCase() === this.activeProperty?.name.toLowerCase();
        const isSub = resolvedLhs.type.toLowerCase() === "void";

        if (!isCurrentFunction || isSub) {
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
  }

  private checkVariableDeclaration(node: VariableDeclaration): void {
    if (!node.loc || !node.type || !node.initializer) return;
    const lineIdx = node.loc.startLine - 1;

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
      checkSelfRead.walk(node);
    }

    // Run the AST-based Flow Analysis on method bodies
    if (node.body.length > 0) {
      const flowAnalyzer = new ASTFlowAnalyzer(node, this.lines, this.diagnostics);
      flowAnalyzer.run();
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

  private checkExpressionStatement(node: ExpressionStatement): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;

    // Loose Type Statement
    const expr = node.expression;
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
}

interface FlowState {
  reachable: boolean;
  retValSet: boolean;
  nullFacts: Map<string, "null" | "non-null">;
}

const STATIC_NON_NULL = Symbol("static-non-null");
type StaticValue = string | number | boolean | null | typeof STATIC_NON_NULL;

class ASTFlowAnalyzer {
  private readonly isFunction: boolean;
  private readonly reachableNodes = new Set<Node>();
  private hasMissingReturnPath = false;

  constructor(
    private readonly methodNode: MethodDeclaration,
    private readonly lines: readonly string[],
    private readonly diagnostics: vscode.Diagnostic[],
  ) {
    this.isFunction =
      methodNode.returnType !== undefined &&
      typeRefToString(methodNode.returnType)?.toLowerCase() !== "void";
  }

  public run(): void {
    const initialState: FlowState = { reachable: true, retValSet: false, nullFacts: new Map() };
    this.checkStatements(this.methodNode.body, initialState);

    // After analysis, check for unreachable statements and missing return paths
    const checkUnreachable = new (class extends ASTWalker {
      constructor(private readonly analyzer: ASTFlowAnalyzer) {
        super();
      }

      public override walk(node: Node): void {
        const isStatement =
          node.kind === "ExpressionStatement" ||
          node.kind === "Assignment" ||
          node.kind === "VariableDeclaration" ||
          node.kind === "OpaqueStatement" ||
          node.kind === "IfStatement" ||
          node.kind === "ForStatement" ||
          node.kind === "ForEachStatement" ||
          node.kind === "WhileStatement" ||
          node.kind === "TryCatchStatement" ||
          node.kind === "UsingStatement" ||
          node.kind === "MatchStatement" ||
          node.kind === "ReturnStatement" ||
          node.kind === "ExitStatement" ||
          node.kind === "ThrowStatement" ||
          node.kind === "Block" ||
          node.kind === "WithStatement" ||
          node.kind === "SelectCaseStatement";

        if (isStatement && !this.analyzer.reachableNodes.has(node) && node.loc) {
          const lineIdx = node.loc.startLine - 1;
          const rawLine = this.analyzer.lines[lineIdx] ?? "";
          const start = rawLine.length - rawLine.trimStart().length;
          const end = rawLine.trimEnd().length;
          const range = new vscode.Range(lineIdx, start, lineIdx, end);

          const diag = new vscode.Diagnostic(
            range,
            `Código inalcançável detectado (dead-code).`,
            vscode.DiagnosticSeverity.Warning,
          );
          diag.code = DiagnosticCodes.DeadCode;
          diag.tags = [vscode.DiagnosticTag.Unnecessary];
          this.analyzer.diagnostics.push(diag);
          // Stop walking children since the parent is already marked dead code
          return;
        }

        super.walk(node);
      }
    })(this);

    for (const stmt of this.methodNode.body) {
      checkUnreachable.walk(stmt);
    }

    if (this.isFunction && this.hasMissingReturnPath && this.methodNode.loc) {
      const startLine = this.methodNode.loc.startLine - 1;
      const rawLine = this.lines[startLine] ?? "";
      const funcIdx = rawLine.search(/\bFunction\b/i);
      const start = funcIdx >= 0 ? funcIdx : 0;
      const end = rawLine.trimEnd().length;
      const range = new vscode.Range(startLine, start, startLine, end);

      const diag = new vscode.Diagnostic(
        range,
        `O método Function "${this.methodNode.name}" pode retornar sem definir um valor de retorno explícito em todas as ramificações de fluxo de controle.`,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = DiagnosticCodes.MissingReturnValue;
      this.diagnostics.push(diag);
    }
  }

  private checkStatements(stmts: Statement[], state: FlowState): FlowState {
    let currState = this.cloneState(state);
    for (const stmt of stmts) {
      if (!currState.reachable) {
        continue;
      }
      this.reachableNodes.add(stmt);
      currState = this.checkStatement(stmt, currState);
    }
    return currState;
  }

  private checkStatement(stmt: Statement, state: FlowState): FlowState {
    switch (stmt.kind) {
      case "ReturnStatement": {
        return { ...state, reachable: false, retValSet: true };
      }
      case "ThrowStatement": {
        return { ...state, reachable: false, retValSet: true };
      }
      case "ExitStatement": {
        if (stmt.target === "Sub" || stmt.target === "Function" || stmt.target === "Property") {
          if (this.isFunction && !state.retValSet) {
            this.hasMissingReturnPath = true;
          }
          return { ...state, reachable: false, retValSet: state.retValSet };
        }
        return state;
      }
      case "Assignment": {
        const isRetAssign = this.isAssignmentToReturnValue(stmt);
        this.updateNullFactFromAssignment(stmt.target, stmt.value, state);
        return { ...state, reachable: true, retValSet: state.retValSet || isRetAssign };
      }
      case "VariableDeclaration": {
        if (stmt.initializer) {
          this.updateNullFactForName(stmt.name, stmt.initializer, state);
        } else {
          state.nullFacts.delete(stmt.name.toLowerCase());
        }
        return state;
      }
      case "Block": {
        return this.checkStatements(stmt.statements, state);
      }
      case "WithStatement":
      case "UsingStatement": {
        return this.checkStatements(stmt.body, state);
      }
      case "IfStatement": {
        interface BranchInfo {
          condition?: Expression;
          body: Statement[];
        }

        const branches: BranchInfo[] = [{ condition: stmt.condition, body: stmt.thenBranch }];
        stmt.elseIfBranches.forEach((b) => branches.push({ condition: b.condition, body: b.body }));
        if (stmt.elseBranch) {
          branches.push({ body: stmt.elseBranch });
        }

        let hasStaticallyTrueBranch = false;

        const branchStates: FlowState[] = [];
        let hasElseCovered = false;

        for (const branch of branches) {
          let isBranchReachable = false;

          if (hasStaticallyTrueBranch) {
            isBranchReachable = false;
          } else if (branch.condition) {
            const condVal = this.evaluateStaticCondition(branch.condition, state);
            if (condVal === true) {
              isBranchReachable = true;
              hasStaticallyTrueBranch = true;
              hasElseCovered = true; // The current branch covers every remaining path.
            } else if (condVal === false) {
              isBranchReachable = false;
            } else {
              isBranchReachable = true;
            }
          } else {
            // Unconditional Else branch
            isBranchReachable = true;
            hasElseCovered = true;
            hasStaticallyTrueBranch = true;
          }

          if (isBranchReachable) {
            const bState = this.checkStatements(branch.body, this.cloneState(state));
            branchStates.push(bState);
          } else {
            // Collect dead code in unreachable branch
            const checkUnreachableInBranch = new (class extends ASTWalker {
              constructor(private readonly analyzer: ASTFlowAnalyzer) {
                super();
              }
              public override walk(node: Node): void {
                if (node.loc) {
                  const lineIdx = node.loc.startLine - 1;
                  const rawLine = this.analyzer.lines[lineIdx] ?? "";
                  const start = rawLine.length - rawLine.trimStart().length;
                  const end = rawLine.trimEnd().length;
                  const range = new vscode.Range(lineIdx, start, lineIdx, end);

                  const diag = new vscode.Diagnostic(
                    range,
                    `Código inalcançável detectado (dead-code).`,
                    vscode.DiagnosticSeverity.Warning,
                  );
                  diag.code = DiagnosticCodes.DeadCode;
                  diag.tags = [vscode.DiagnosticTag.Unnecessary];
                  this.analyzer.diagnostics.push(diag);
                  return;
                }
                super.walk(node);
              }
            })(this);
            branch.body.forEach((s) => {
              checkUnreachableInBranch.walk(s);
            });
          }
        }

        if (branchStates.length === 0) {
          return state;
        }

        const reachableAfter = branchStates.some((s) => s.reachable) || !hasElseCovered;
        const retValSetAfter = hasElseCovered
          ? branchStates.every((s) => s.retValSet)
          : state.retValSet && branchStates.every((s) => s.retValSet);

        // If paths run out and we return to outer scope with missing return, notify
        if (!reachableAfter && this.isFunction) {
          const terminatesWithMissing = branchStates.some((s) => !s.retValSet && !s.reachable);
          if (terminatesWithMissing) {
            this.hasMissingReturnPath = true;
          }
        }

        return { ...state, reachable: reachableAfter, retValSet: retValSetAfter };
      }
      case "SelectCaseStatement": {
        const caseStates: FlowState[] = [];
        let hasCaseElse = false;

        stmt.cases.forEach((c) => {
          if (c.isElse) hasCaseElse = true;
          const cState = this.checkStatements(c.body, state);
          caseStates.push(cState);
        });

        if (caseStates.length === 0) {
          return state;
        }

        const reachableAfter = caseStates.some((s) => s.reachable) || !hasCaseElse;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const retValSetAfter = hasCaseElse
          ? caseStates.every((s) => s.retValSet)
          : state.retValSet && caseStates.every((s) => s.retValSet);

        return { ...state, reachable: reachableAfter, retValSet: retValSetAfter };
      }
      case "ForStatement":
      case "ForEachStatement":
      case "WhileStatement": {
        // Body executes 0 or more times, analyze it conservatively
        this.checkStatements(stmt.body, state);
        return state;
      }
      case "TryCatchStatement": {
        const tryState = this.checkStatements(stmt.tryBody, state);
        const catchState = this.checkStatements(stmt.catchBody, state);

        if (stmt.finallyBody) {
          const incomingFinallyState = {
            reachable: tryState.reachable || catchState.reachable,
            retValSet: tryState.retValSet && catchState.retValSet,
            nullFacts: new Map(state.nullFacts),
          };
          return this.checkStatements(stmt.finallyBody, incomingFinallyState);
        }

        return {
          reachable: tryState.reachable || catchState.reachable,
          retValSet: tryState.retValSet && catchState.retValSet,
          nullFacts: new Map(state.nullFacts),
        };
      }
      default: {
        return state;
      }
    }
  }

  private isAssignmentToReturnValue(node: Assignment): boolean {
    const target = node.target;
    if (target.kind === "Identifier") {
      return target.name.toLowerCase() === this.methodNode.name.toLowerCase();
    }
    if (target.kind === "MemberAccess") {
      if (
        target.member.toLowerCase() === this.methodNode.name.toLowerCase() &&
        target.target.kind === "Identifier" &&
        target.target.name.toLowerCase() === "me"
      ) {
        return true;
      }
    }
    return false;
  }

  private cloneState(state: FlowState): FlowState {
    return {
      reachable: state.reachable,
      retValSet: state.retValSet,
      nullFacts: new Map(state.nullFacts),
    };
  }

  private updateNullFactFromAssignment(
    target: Expression,
    value: Expression,
    state: FlowState,
  ): void {
    if (target.kind !== "Identifier") return;
    this.updateNullFactForName(target.name, value, state);
  }

  private updateNullFactForName(name: string, value: Expression, state: FlowState): void {
    const key = name.toLowerCase();
    if (value.kind === "Literal" && value.value === null) {
      state.nullFacts.set(key, "null");
      return;
    }
    if (value.kind === "ObjectCreationExpression") {
      state.nullFacts.set(key, "non-null");
      return;
    }
    state.nullFacts.delete(key);
  }

  private evaluateStaticCondition(expr: Expression, state: FlowState): boolean | undefined {
    if (expr.kind === "Literal") {
      if (expr.value === true) return true;
      if (expr.value === false) return false;
      const strVal = String(expr.value).toLowerCase();
      if (strVal === "true") return true;
      if (strVal === "false") return false;
    }
    if (expr.kind === "BinaryExpression") {
      const op = expr.operator.toLowerCase();
      if (op === "and" || op === "andalso") {
        const left = this.evaluateStaticCondition(expr.left, state);
        const right = this.evaluateStaticCondition(expr.right, state);
        if (left === false || right === false) return false;
        if (left === true && right === true) return true;
        return undefined;
      }
      if (op === "or" || op === "orelse") {
        const left = this.evaluateStaticCondition(expr.left, state);
        const right = this.evaluateStaticCondition(expr.right, state);
        if (left === true || right === true) return true;
        if (left === false && right === false) return false;
        return undefined;
      }

      const left = this.evaluateStaticValue(expr.left, state);
      const right = this.evaluateStaticValue(expr.right, state);
      if (left !== undefined && right !== undefined) {
        if (op === "=") return left === right;
        if (op === "<>") return left !== right;
        if (typeof left === "number" && typeof right === "number") {
          if (op === "<") return left < right;
          if (op === "<=") return left <= right;
          if (op === ">") return left > right;
          if (op === ">=") return left >= right;
        }
      }
    }
    return undefined;
  }

  private evaluateStaticValue(expr: Expression, state: FlowState): StaticValue | undefined {
    if (expr.kind === "Literal") return expr.value;
    if (expr.kind === "Identifier") {
      const fact = state.nullFacts.get(expr.name.toLowerCase());
      if (fact === "null") return null;
      if (fact === "non-null") return STATIC_NON_NULL;
      return undefined;
    }
    if (expr.kind === "ObjectCreationExpression") return STATIC_NON_NULL;
    if (expr.kind === "UnaryExpression" && expr.operator === "-") {
      const value = this.evaluateStaticValue(expr.argument, state);
      return typeof value === "number" ? -value : undefined;
    }
    if (expr.kind === "BinaryExpression") {
      const left = this.evaluateStaticValue(expr.left, state);
      const right = this.evaluateStaticValue(expr.right, state);
      if (typeof left !== "number" || typeof right !== "number") return undefined;
      const op = expr.operator.toLowerCase();
      if (op === "+") return left + right;
      if (op === "-") return left - right;
      if (op === "*") return left * right;
      if (op === "/" && right !== 0) return left / right;
    }
    return undefined;
  }
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(curr + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      prev[j - 1] = curr;
      curr = next;
    }
    prev[b.length] = curr;
  }
  return prev[b.length] ?? 0;
}

function findClosest(query: string, candidates: readonly string[]): string[] {
  const q = query.toLowerCase();
  const ranked: { name: string; dist: number }[] = [];
  for (const c of candidates) {
    const d = levenshtein(q, c.toLowerCase());
    if (d <= 2 && d > 0) ranked.push({ name: c, dist: d });
  }
  ranked.sort((a, b) => a.dist - b.dist || a.name.localeCompare(b.name));
  return ranked.slice(0, 3).map((r) => r.name);
}

function attachUnknownMemberSuggestions(
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

function inheritsFromClass(
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

function isLikelyGenericTypeParameter(typeName: string): boolean {
  return /^[A-Z]$/.test(typeName.trim());
}

function areSameGenericTemplateCompatible(
  rhsType: string,
  lhsType: string,
  indexer: WorkspaceSymbolIndexer,
): boolean {
  const rhs = parseGenericTypeName(rhsType);
  const lhs = parseGenericTypeName(lhsType);
  if (!rhs || !lhs) return false;
  if (rhs.base.toLowerCase() !== lhs.base.toLowerCase()) return false;
  if (rhs.args.length !== lhs.args.length) return false;

  return rhs.args.every((rhsArg, idx) => {
    const lhsArg = lhs.args[idx];
    if (!lhsArg) return false;
    if (rhsArg.toLowerCase() === lhsArg.toLowerCase()) return true;
    if (isLikelyGenericTypeParameter(rhsArg) || isLikelyGenericTypeParameter(lhsArg)) return true;
    return DiagnosticsLinter.isTypeCompatible(rhsArg, lhsArg, indexer);
  });
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
  return { base, args: args.filter((arg) => arg.length > 0) };
}

function mapGenericWarningToDiagnosticCode(code: GenericsPassWarning["code"]): string {
  switch (code) {
    case "unknown-template":
      return DiagnosticCodes.UnknownTemplate;
    case "generic-arity-mismatch":
      return DiagnosticCodes.GenericArityMismatch;
    case "duplicate-template":
      return DiagnosticCodes.DuplicateTemplate;
    case "class-generic-method-unsupported":
      return DiagnosticCodes.ClassGenericMethodUnsupported;
    case "flat-name-collision":
      return DiagnosticCodes.FlatNameCollision;
    case "instantiation-limit-exceeded":
      return DiagnosticCodes.InstantiationLimitExceeded;
  }
}

function collectWorkspaceGenericTemplates(
  indexer: WorkspaceSymbolIndexer,
  currentFileUri: string,
): GenericTemplateInfo[] {
  const templates: GenericTemplateInfo[] = [];
  const seen = new Set<string>();
  for (const sym of indexer.getAllSymbols()) {
    if (sym.fileUri === currentFileUri) continue;
    if (sym.kind !== "class" && sym.kind !== "delegate" && sym.kind !== "method") {
      continue;
    }
    if (!sym.genericTypeParameters || sym.genericTypeParameters.length === 0) continue;
    const key = sym.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    templates.push({
      kind: sym.kind,
      name: sym.name,
      typeParams: sym.genericTypeParameters,
      line: sym.range.startLine,
    });
  }
  return templates;
}

function computeGenericWarningRange(
  warning: GenericsPassWarning,
  lines: readonly string[],
): vscode.Range {
  const line = warning.line ?? 0;
  const col = warning.column ?? 0;
  const lineText = lines[line] ?? "";
  const lt = lineText.indexOf("<", col);
  const gt = lt >= 0 ? lineText.indexOf(">", lt) : -1;
  const endCol = gt >= 0 ? gt + 1 : Math.max(col + 1, lineText.length);
  return new vscode.Range(line, col, line, endCol);
}

function formatGenericWarningMessage(warning: GenericsPassWarning): string {
  switch (warning.code) {
    case "unknown-template":
      return `Generics: template '${warning.templateName ?? ""}' não foi encontrado no contexto de generics. O Builder deixará a referência inalterada e o compilador surfará erro.`;
    case "generic-arity-mismatch":
      return `Generics: '${warning.templateName ?? ""}' espera ${String(warning.expected ?? 0)} argumento(s) de tipo, mas recebeu ${String(warning.actual ?? 0)}.`;
    case "duplicate-template":
      return `Generics: template '${warning.templateName ?? ""}' declarado mais de uma vez; a última declaração prevalece.`;
    case "class-generic-method-unsupported":
      return `Generics: método genérico '${warning.templateName ?? ""}' dentro de classe não é suportado pelo monomorphizer; a declaração será removida do output do Builder.`;
    case "flat-name-collision":
      return `Generics: duas instanciações distintas colapsam ao mesmo nome '${warning.flatName ?? ""}'. Renomeie um dos tipos para desambiguar.`;
    case "instantiation-limit-exceeded":
      return `Generics: limite de instanciações excedido; o Builder abortou a expansão. Verifique se há recursão infinita em um template.`;
  }
}

function attachGenericWarningPayload(diag: vscode.Diagnostic, warning: GenericsPassWarning): void {
  switch (warning.code) {
    case "unknown-template": {
      const payload: UnknownTemplatePayload = {
        code: DiagnosticCodes.UnknownTemplate,
        templateName: warning.templateName ?? "",
      };
      setDiagnosticPayload(diag, payload);
      return;
    }
    case "generic-arity-mismatch": {
      const payload: GenericArityMismatchPayload = {
        code: DiagnosticCodes.GenericArityMismatch,
        templateName: warning.templateName ?? "",
        expected: warning.expected ?? 0,
        actual: warning.actual ?? 0,
      };
      setDiagnosticPayload(diag, payload);
      return;
    }
    case "duplicate-template": {
      const payload: DuplicateTemplatePayload = {
        code: DiagnosticCodes.DuplicateTemplate,
        templateName: warning.templateName ?? "",
      };
      setDiagnosticPayload(diag, payload);
      return;
    }
    case "class-generic-method-unsupported": {
      const payload: ClassGenericMethodUnsupportedPayload = {
        code: DiagnosticCodes.ClassGenericMethodUnsupported,
        qualifiedName: warning.templateName ?? "",
      };
      setDiagnosticPayload(diag, payload);
      return;
    }
    case "flat-name-collision": {
      const payload: FlatNameCollisionPayload = {
        code: DiagnosticCodes.FlatNameCollision,
        flatName: warning.flatName ?? "",
      };
      setDiagnosticPayload(diag, payload);
      return;
    }
    case "instantiation-limit-exceeded": {
      const payload: InstantiationLimitExceededPayload = {
        code: DiagnosticCodes.InstantiationLimitExceeded,
        limit: 10_000,
      };
      setDiagnosticPayload(diag, payload);
      return;
    }
  }
}

function typeRefToString(typeRef: TypeReference | undefined): string | undefined {
  if (!typeRef?.name) return undefined;
  if (typeRef.typeArguments.length === 0) return typeRef.name;
  return `${typeRef.name}<${typeRef.typeArguments
    .map((arg) => typeRefToString(arg) ?? "")
    .join(", ")}>`;
}

function exprToString(expr: Expression | undefined): string | undefined {
  if (!expr) return undefined;
  if (expr.kind === "Identifier") return expr.name;
  if (expr.kind === "MemberAccess") {
    const targetStr = exprToString(expr.target);
    return targetStr ? `${targetStr}.${expr.member}` : expr.member;
  }
  if (expr.kind === "MethodInvocation") {
    const calleeStr = exprToString(expr.callee);
    return calleeStr ? `${calleeStr}.${expr.methodName}` : expr.methodName;
  }
  return undefined;
}
