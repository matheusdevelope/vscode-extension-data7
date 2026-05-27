import * as vscode from "vscode";
import type { WorkspaceSymbolIndexer, SymbolInfo } from "../analysis/symbol-indexer";
import {
  lookupSystemByContainer,
  lookupSystemClassByName,
  lookupSystemByName,
} from "../system-library";
import { TypeResolver } from "../analysis/type-resolver";
import { DependencyScanner, IMPORTS_REGEX_ANCHORED } from "../analysis/dependency-scanner";
import type {
  MissingImportPayload,
  UnknownMemberPayload,
  UnsupportedMemberPayload,
  UnusedImportPayload,
} from "./diagnostic-codes";
import { DiagnosticCodes, setDiagnosticPayload } from "./diagnostic-codes";
import { PRIMITIVE_TYPES } from "../utils/primitive-types";
import { readConfiguration, resolveDiagnosticSeverity } from "../infra/configuration";
import { extractSuppressedCodes } from "../utils/suppression-comments";

export class DiagnosticsLinter {
  private static resolveClassName(className: string): string {
    const lastDotIdx = className.lastIndexOf(".");
    return lastDotIdx !== -1 ? className.substring(lastDotIdx + 1) : className;
  }

  /**
   * Collects up to `limit` member names defined anywhere in the inheritance
   * chain of `className`. Used to power "did you mean…?" suggestions.
   */
  private static collectMemberNames(
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

    // `lookupSystemClassByName(...)[0]` is typed as SymbolInfo because we
    // don't enable `noUncheckedIndexedAccess`, but at runtime it can be
    // undefined. The helper below preserves that nullability.
    const firstClass = (name: string): SymbolInfo | undefined =>
      indexer.findSymbolByName(name) ?? lookupSystemClassByName(name)[0];
    let cur = firstClass(shortClassName);
    const visited = new Set<string>();
    while (cur && !visited.has(cur.name.toLowerCase()) && names.size < limit) {
      visited.add(cur.name.toLowerCase());
      const parentName = cur.inheritsFrom ?? "TObject";
      if (parentName.toLowerCase() === "tobject" && cur.name.toLowerCase() === "tobject") break;
      pushMembers(this.resolveClassName(parentName));
      cur = firstClass(this.resolveClassName(parentName));
    }
    return Array.from(names);
  }

  private static isKnownType(className: string, indexer: WorkspaceSymbolIndexer): boolean {
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

  private static validateTypeReference(
    typeName: string,
    lineIdx: number,
    startChar: number,
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
    diagnostics: vscode.Diagnostic[],
  ): void {
    const typeLower = typeName.toLowerCase();
    if (PRIMITIVE_TYPES.has(typeLower)) return;

    // Qualified types (Forms.TWinControl) resolve directly; no Imports needed.
    if (typeName.includes(".")) return;

    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    const activeNamespace = fileSyms?.symbols.find((s) => s.kind === "namespace")?.name;

    const workspaceMatches = indexer
      .getAllSymbols()
      .filter(
        (s) =>
          s.name.toLowerCase() === typeLower &&
          (s.kind === "class" ||
            s.kind === "structure" ||
            s.kind === "delegate" ||
            s.kind === "namespace"),
      );

    const systemMatches = lookupSystemByName(typeName).filter(
      (s) =>
        s.kind === "class" ||
        s.kind === "structure" ||
        s.kind === "delegate" ||
        s.kind === "namespace",
    );

    const allMatches = [...workspaceMatches, ...systemMatches];

    // Unknown types fall through silently to avoid false positives on Delphi/VCL externals.
    if (allMatches.length === 0) return;

    let isValid = false;
    let matchingNamespace: string | undefined;

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
      // Declarations in Principal.bas live in the implicit global scope.
      if (sym.fileUri && /principal\.bas$/i.test(sym.fileUri)) {
        isValid = true;
        break;
      }
      matchingNamespace = ns;
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

  /**
   * Emits the `unsupported-member` diagnostic in a single, consistent shape.
   * Used both from `Me.X` resolution and from `obj.X` resolution so the
   * payload, severity and message stay identical across the two paths.
   */
  private static pushUnsupportedMemberDiagnostic(
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

  /**
   * Default severity assumed by each emit site before user overrides via
   * `data7.diagnosticSeverity` are applied. Centralised so the post-processing
   * step has a single table to consult.
   */
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
  };

  public static runAdvancedDiagnostics(
    document: vscode.TextDocument,
    indexer: WorkspaceSymbolIndexer,
  ): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    // 1. Gather imports and check for unused imports.
    const imports: { name: string; line: number; range: vscode.Range; referenced: boolean }[] = [];
    const importsRegex = IMPORTS_REGEX_ANCHORED;

    lines.forEach((lineText, lineIdx) => {
      const cleanLine = DependencyScanner.stripComments(lineText);
      const match = cleanLine.match(importsRegex);
      if (match) {
        const name = match[1];
        const start = lineText.indexOf(name);
        imports.push({
          name,
          line: lineIdx,
          range: new vscode.Range(lineIdx, start, lineIdx, start + name.length),
          referenced: false,
        });
      }
    });

    const allSymbols = indexer.getAllSymbols();

    // Local memoised regex compiler — every linter call re-uses the same Map.
    const regexCache = new Map<string, RegExp>();
    const wordRegex = (word: string): RegExp => {
      const key = "\\b" + word + "\\b";
      let r = regexCache.get(key);
      if (!r) {
        r = new RegExp(key, "i");
        regexCache.set(key, r);
      }
      r.lastIndex = 0;
      return r;
    };
    const memberAccessRegexFor = (word: string): RegExp => {
      const key = "\\b" + word + "\\b\\.";
      let r = regexCache.get(key);
      if (!r) {
        r = new RegExp(key, "i");
        regexCache.set(key, r);
      }
      r.lastIndex = 0;
      return r;
    };

    imports.forEach((imp) => {
      const nameLower = imp.name.toLowerCase();
      if (memberAccessRegexFor(imp.name).test(text)) {
        imp.referenced = true;
        return;
      }
      // Detect any symbol from the namespace referenced bare in the document.
      const symbolsInNamespace = [
        ...allSymbols.filter((s) => s.containerName?.toLowerCase() === nameLower),
        ...lookupSystemByContainer(imp.name),
      ];

      for (const s of symbolsInNamespace) {
        if (wordRegex(s.name).test(text)) {
          imp.referenced = true;
          break;
        }
      }
    });

    imports.forEach((imp) => {
      if (!imp.referenced) {
        const diag = new vscode.Diagnostic(
          imp.range,
          `Importação desnecessária ou não utilizada: "${imp.name}".`,
          vscode.DiagnosticSeverity.Warning,
        );
        diag.code = DiagnosticCodes.UnusedImport;
        const payload: UnusedImportPayload = {
          code: DiagnosticCodes.UnusedImport,
          namespace: imp.name,
        };
        setDiagnosticPayload(diag, payload);
        diagnostics.push(diag);
      }
    });

    // 1b. Duplicate imports (same namespace declared more than once).
    const seenImports = new Map<string, number>();
    imports.forEach((imp) => {
      const key = imp.name.toLowerCase();
      const firstLine = seenImports.get(key);
      if (firstLine === undefined) {
        seenImports.set(key, imp.line);
        return;
      }
      const diag = new vscode.Diagnostic(
        imp.range,
        `Imports duplicado: "${imp.name}" já foi declarado na linha ${firstLine + 1}.`,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = DiagnosticCodes.DuplicateImport;
      const payload: UnusedImportPayload = {
        code: DiagnosticCodes.UnusedImport,
        namespace: imp.name,
      };
      setDiagnosticPayload(diag, payload);
      diagnostics.push(diag);
    });

    // 2. Member accesses (obj.Member, me.Member).
    const memberAccessRegex = /\b([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\b/gi;
    lines.forEach((lineText, lineIdx) => {
      const cleanLine = DependencyScanner.stripComments(lineText);
      if (!cleanLine.trim() || cleanLine.toLowerCase().startsWith("imports ")) return;

      let match;
      while ((match = memberAccessRegex.exec(cleanLine)) !== null) {
        const objectName = match[1];
        const memberName = match[2];
        const objectLower = objectName.toLowerCase();

        memberAccessRegex.lastIndex = match.index + objectName.length + 1;

        if (objectLower === "me" || objectLower === "mybase") {
          const fileSyms = indexer.getFileSymbols(document.uri.toString());
          const currentClass = fileSyms?.symbols.find(
            (s) => s.kind === "class" && lineIdx >= s.range.startLine && lineIdx <= s.range.endLine,
          );
          if (currentClass) {
            const resolved = TypeResolver.findMember(currentClass.name, memberName, indexer);
            if (!resolved) {
              const start = match.index + objectName.length + 1;
              const range = new vscode.Range(lineIdx, start, lineIdx, start + memberName.length);
              const diag = new vscode.Diagnostic(
                range,
                `Membro "${memberName}" não encontrado na classe "${currentClass.name}".`,
                vscode.DiagnosticSeverity.Error,
              );
              diag.code = DiagnosticCodes.UnknownMember;
              attachUnknownMemberSuggestions(
                diag,
                memberName,
                this.collectMemberNames(currentClass.name, indexer),
              );
              diagnostics.push(diag);
            } else if (resolved.isUnsupported) {
              this.pushUnsupportedMemberDiagnostic(
                diagnostics,
                lineIdx,
                match.index + objectName.length + 1,
                memberName,
                currentClass.name,
              );
            }
            // me.X always sees Private members; no `private-member-access` check.
          }
          continue;
        }

        // Skip VCL and System low-level prefixes to avoid false positives on Delphi internals.
        if (objectLower.startsWith("vcl") || objectLower.startsWith("system")) {
          continue;
        }

        let typeName = TypeResolver.getVariableType(
          objectName,
          document,
          new vscode.Position(lineIdx, match.index),
          indexer,
        );
        if (!typeName) {
          const staticSymbol = indexer.findSymbolByName(objectName, document.uri.toString());
          if (
            staticSymbol &&
            (staticSymbol.kind === "class" ||
              staticSymbol.kind === "structure" ||
              staticSymbol.kind === "namespace")
          ) {
            typeName = staticSymbol.name;
          } else {
            const sysStaticSymbol = lookupSystemByName(objectName).find(
              (s) => s.kind === "namespace" || s.kind === "class" || s.kind === "structure",
            );
            if (sysStaticSymbol) {
              typeName = sysStaticSymbol.name;
            }
          }
        }

        if (typeName && this.isKnownType(typeName, indexer)) {
          const resolved = TypeResolver.findMember(typeName, memberName, indexer);
          if (
            !resolved &&
            typeName.toLowerCase() !== "variant" &&
            typeName.toLowerCase() !== "tobject" &&
            typeName.toLowerCase() !== "void"
          ) {
            const start = match.index + objectName.length + 1;
            const range = new vscode.Range(lineIdx, start, lineIdx, start + memberName.length);
            const diag = new vscode.Diagnostic(
              range,
              `Membro "${memberName}" não encontrado na classe/tipo "${typeName}".`,
              vscode.DiagnosticSeverity.Error,
            );
            diag.code = DiagnosticCodes.UnknownMember;
            attachUnknownMemberSuggestions(
              diag,
              memberName,
              this.collectMemberNames(typeName, indexer),
            );
            diagnostics.push(diag);
          } else if (resolved?.isUnsupported) {
            this.pushUnsupportedMemberDiagnostic(
              diagnostics,
              lineIdx,
              match.index + objectName.length + 1,
              memberName,
              typeName,
            );
          } else if (resolved?.isPrivate) {
            // Member exists but is Private — accessing from outside its declaring scope.
            const fileSyms = indexer.getFileSymbols(document.uri.toString());
            const enclosingClass = fileSyms?.symbols.find(
              (s) =>
                s.kind === "class" && lineIdx >= s.range.startLine && lineIdx <= s.range.endLine,
            );
            const isInsideOwner =
              !!enclosingClass &&
              !!resolved.containerName &&
              enclosingClass.name.toLowerCase() === resolved.containerName.toLowerCase();
            if (!isInsideOwner) {
              const start = match.index + objectName.length + 1;
              const range = new vscode.Range(lineIdx, start, lineIdx, start + memberName.length);
              const diag = new vscode.Diagnostic(
                range,
                `O membro "${memberName}" de "${typeName}" é Private e não pode ser acessado fora da classe.`,
                vscode.DiagnosticSeverity.Error,
              );
              diag.code = DiagnosticCodes.PrivateMemberAccess;
              diagnostics.push(diag);
            }
          }
        }
      }
    });

    // 3. Type references: As [New] Type, New Type, Inherits Type, Implements Type.
    const typeRefRegex = /\bAs\s+(?:New\s+)?([a-zA-Z0-9_.]+)/gi;
    const newInstRegex = /\bNew\s+([a-zA-Z0-9_.]+)/gi;
    const inheritsRegex = /\bInherits\s+([a-zA-Z0-9_.]+)/gi;
    const implementsRegex = /\bImplements\s+([a-zA-Z0-9_.]+)/gi;

    lines.forEach((lineText, lineIdx) => {
      const cleanLine = DependencyScanner.stripComments(lineText);
      if (!cleanLine.trim() || cleanLine.toLowerCase().startsWith("imports ")) return;

      let match;
      typeRefRegex.lastIndex = 0;
      while ((match = typeRefRegex.exec(cleanLine)) !== null) {
        const typeName = match[1];
        const start = match.index + match[0].indexOf(typeName);
        this.validateTypeReference(typeName, lineIdx, start, document, indexer, diagnostics);
      }

      newInstRegex.lastIndex = 0;
      while ((match = newInstRegex.exec(cleanLine)) !== null) {
        const precedingText = cleanLine.substring(0, match.index).trim();
        if (precedingText.toLowerCase().endsWith("as")) continue;
        const typeName = match[1];
        const start = match.index + match[0].indexOf(typeName);
        this.validateTypeReference(typeName, lineIdx, start, document, indexer, diagnostics);
      }

      inheritsRegex.lastIndex = 0;
      while ((match = inheritsRegex.exec(cleanLine)) !== null) {
        const typeName = match[1];
        const start = match.index + match[0].indexOf(typeName);
        this.validateTypeReference(typeName, lineIdx, start, document, indexer, diagnostics);
      }

      implementsRegex.lastIndex = 0;
      while ((match = implementsRegex.exec(cleanLine)) !== null) {
        const typeName = match[1];
        const start = match.index + match[0].indexOf(typeName);
        this.validateTypeReference(typeName, lineIdx, start, document, indexer, diagnostics);
      }
    });

    // 4. Event signature mismatch.
    //
    // Detects assignments like:
    //   me.btnOk.OnClick = AddressOf btnOk_Click
    //   self.OnClose    = MyClose
    //
    // When the LHS resolves to a property whose `type` is a delegate, and the
    // handler resolves to a workspace Sub/Function, the parameter counts must
    // match. Type-by-type comparison is intentionally lenient (we only check
    // arity) to avoid false positives on `Variant`-typed parameters.
    const eventAssignRegex =
      /\b([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.(\w+)\s*=\s*(?:AddressOf\s+)?([A-Za-z_]\w*)\b/g;
    lines.forEach((lineText, lineIdx) => {
      const cleanLine = DependencyScanner.stripComments(lineText);
      if (!cleanLine.trim()) return;
      eventAssignRegex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = eventAssignRegex.exec(cleanLine)) !== null) {
        const lhsExpr = m[1];
        const eventName = m[2];
        const handlerName = m[3];
        if (!/^On[A-Z]/.test(eventName)) continue;

        // Resolve LHS type.
        const lhsParts = lhsExpr.split(".");
        const rootName = lhsParts[lhsParts.length - 1];
        const rootLower = rootName.toLowerCase();

        let lhsType: string | undefined;
        if (rootLower === "me" || rootLower === "mybase") {
          const fileSyms = indexer.getFileSymbols(document.uri.toString());
          lhsType = fileSyms?.symbols.find(
            (s) => s.kind === "class" && lineIdx >= s.range.startLine && lineIdx <= s.range.endLine,
          )?.name;
        } else {
          lhsType = TypeResolver.getVariableType(
            rootName,
            document,
            new vscode.Position(lineIdx, m.index),
            indexer,
          );
        }
        if (!lhsType) continue;

        const eventMember = TypeResolver.findMember(lhsType, eventName, indexer);
        if (eventMember?.kind !== "property") continue;

        const delegateName = eventMember.type;
        const delegate =
          lookupSystemByName(delegateName).find((s) => s.kind === "delegate") ??
          indexer.findSymbolByName(delegateName);
        if (delegate?.kind !== "delegate" || !delegate.parameters) continue;

        const handler = indexer.findSymbolByName(handlerName);
        if (
          !handler ||
          (handler.kind !== "method" &&
            handler.kind !== "declare_sub" &&
            handler.kind !== "declare_function")
        ) {
          continue;
        }

        const handlerParams = handler.parameters ?? [];
        if (handlerParams.length !== delegate.parameters.length) {
          const handlerStart = m.index + m[0].lastIndexOf(handlerName);
          const range = new vscode.Range(
            lineIdx,
            handlerStart,
            lineIdx,
            handlerStart + handlerName.length,
          );
          const diag = new vscode.Diagnostic(
            range,
            `Assinatura incompatível: o evento "${eventName}" espera ${delegate.parameters.length} parâmetro(s) (delegate "${delegateName}"), mas o handler "${handlerName}" tem ${handlerParams.length}.`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = DiagnosticCodes.EventSignatureMismatch;
          diagnostics.push(diag);
        }
      }
    });

    return this.postProcessDiagnostics(diagnostics, text);
  }

  /**
   * Applies cross-cutting concerns to every diagnostic emitted by the linter:
   *
   *   1. Drops diagnostics whose line carries a `' data7:disable-line` directive
   *      (or `' data7:disable-next-line` on the previous line) for the same
   *      `code`.
   *   2. Replaces the original severity with the user-configured override from
   *      `data7.diagnosticSeverity`, when one is set. An `"off"` override drops
   *      the diagnostic entirely.
   *
   * Keeping this as a single post-processing pass avoids sprinkling configuration
   * lookups across every emit site and keeps the linter's hot loops cheap.
   */
  private static postProcessDiagnostics(
    diagnostics: readonly vscode.Diagnostic[],
    text: string,
  ): vscode.Diagnostic[] {
    const suppressions = extractSuppressedCodes(text);
    const overrides = readConfiguration().diagnosticSeverity;
    const output: vscode.Diagnostic[] = [];

    for (const diag of diagnostics) {
      // `diag.code` may be string | number | { value, target } per the VS Code
      // API. We only care about its string form for suppression matching.
      const rawCode: string | number | { value: string | number } | undefined = diag.code;
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

      // 1. Skip diagnostics suppressed by an inline directive.
      const target = suppressions.get(lineIdx);
      if (target === "*" || (target && codeStr && target.has(codeStr))) continue;

      // 2. Apply severity overrides.
      const defaultSeverity = this.DEFAULT_SEVERITY[codeStr] ?? diag.severity;
      const resolved = resolveDiagnosticSeverity(codeStr, defaultSeverity, overrides);
      if (resolved === undefined) continue; // user disabled this code
      diag.severity = resolved;
      output.push(diag);
    }

    return output;
  }
}

/** Compute up to 3 candidate names within edit distance ≤ 2 of `query`. */
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
      const next = Math.min(curr + 1, prev[j] + 1, prev[j - 1] + cost);
      prev[j - 1] = curr;
      curr = next;
    }
    prev[b.length] = curr;
  }
  return prev[b.length];
}
