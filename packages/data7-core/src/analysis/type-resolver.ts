import type * as vscode from "vscode";
import type { SymbolInfo, WorkspaceSymbolIndexer } from "./symbol-indexer";
import {
  SYSTEM_SYMBOLS,
  lookupSystemByContainer,
  lookupSystemClassByName,
  lookupSystemByName,
} from "../system-library";
import { inferLiteralType } from "../utils/literal-type-infer";
import { getNonNullVariablesAt } from "./flow-analyzer";
import { findInnerMostGenericUsage, flatNameOf } from "./generics-analyzer";
import { LanguageProcessor } from "./language-processor";
import type {
  Expression,
  TypeReference,
  Node,
  BinaryExpression,
  UnaryExpression,
} from "../project/ast/ast";

/**
 * Shared scope and type resolution helpers used by every provider and by the
 * linter. Lives in its own module so providers do not import each other
 * (see governance.mdc).
 */
const fileLocalsCache = new WeakMap<object, Map<number, Map<string, string>>>();
const expressionTypeCache = new WeakMap<object, string | undefined>();
const rawExpressionTypeCache = new WeakMap<object, string | undefined>();
const genericParamsCache = new WeakMap<object, Map<string, Map<string, string>>>();

export class TypeResolver {
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
    let fileCache = fileLocalsCache.get(unit);
    if (!fileCache) {
      fileCache = new Map();
      fileLocalsCache.set(unit, fileCache);
    }
    let locals = fileCache.get(lineIdx);
    if (!locals) {
      locals = new Map<string, string>();
      const position = { line: lineIdx, character: 0 } as vscode.Position;
      collectLocalDeclarations(unit, position, locals, indexer, document, lineIdx);
      fileCache.set(lineIdx, locals);
    }
    if (locals.has(nameLower)) return true;
    // Also check method parameters (they don't appear in the Dim-locals map).
    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    const currentMethod = fileSyms?.symbols.find(
      (s) => s.kind === "method" && lineIdx >= s.range.startLine && lineIdx <= s.range.endLine,
    );
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
      const importedSymbol = allSymbols.find(
        (s) =>
          isMatchingVariable(s) && importedNamespaces.has(s.containerName?.toLowerCase() ?? ""),
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

    let fileCache = fileLocalsCache.get(unit);
    if (!fileCache) {
      fileCache = new Map();
      fileLocalsCache.set(unit, fileCache);
    }

    let locals = fileCache.get(position.line);
    if (!locals) {
      locals = new Map<string, string>();
      collectLocalDeclarations(unit, position, locals, indexer, document, position.line);
      fileCache.set(position.line, locals);
    }

    const localType = locals.get(varLower);
    if (localType) return localType;

    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    if (!fileSyms) return undefined;

    const currentMethod = fileSyms.symbols.find(
      (s) =>
        s.kind === "method" &&
        position.line >= s.range.startLine &&
        position.line <= s.range.endLine,
    );
    if (currentMethod?.parameters) {
      const param = currentMethod.parameters.find((p) => p.name.toLowerCase() === varLower);
      if (param) return param.type;
    }
    if (currentMethod?.name.toLowerCase() === varLower) {
      return currentMethod.type;
    }

    const currentProperty = fileSyms.symbols.find(
      (s) =>
        (s.kind === "property" || s.kind === "indexed-property") &&
        position.line >= s.range.startLine &&
        position.line <= s.range.endLine,
    );
    if (currentProperty?.parameters) {
      const param = currentProperty.parameters.find((p) => p.name.toLowerCase() === varLower);
      if (param) return param.type;
    }
    if (currentProperty?.name.toLowerCase() === varLower) {
      return currentProperty.type;
    }

    const currentClass = fileSyms.symbols.find(
      (s) =>
        s.kind === "class" &&
        position.line >= s.range.startLine &&
        position.line <= s.range.endLine,
    );
    if (currentClass) {
      const allWorkspaceSymbols = indexer.getSymbolsByName(varName);
      const visited = new Set<string>();
      let cls: SymbolInfo | undefined = currentClass;

      while (cls && !visited.has(cls.name.toLowerCase())) {
        visited.add(cls.name.toLowerCase());
        const classLower = cls.name.toLowerCase();
        const isMember = (s: SymbolInfo): boolean =>
          s.containerName?.toLowerCase() === classLower &&
          s.name.toLowerCase() === varLower &&
          (s.kind === "variable" ||
            s.kind === "property" ||
            s.kind === "indexed-property" ||
            s.kind === "method");

        const wsMember = allWorkspaceSymbols.find(isMember);
        if (wsMember) return wsMember.type;

        const sysMember = lookupSystemByContainer(cls.name).find(
          (s) =>
            s.name.toLowerCase() === varLower &&
            (s.kind === "variable" ||
              s.kind === "property" ||
              s.kind === "indexed-property" ||
              s.kind === "method"),
        );
        if (sysMember) return sysMember.type;

        cls = cls.inheritsFrom
          ? TypeResolver.findClassSymbol(cls.inheritsFrom, indexer)
          : undefined;
      }
    }

    const globalVar = TypeResolver.findVariableSymbol(varName, document, position, indexer);
    if (globalVar) return globalVar.type;

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
            (s.kind === "class" || s.kind === "structure" || s.kind === "delegate") &&
            (s.containerName?.toLowerCase() === nsPart.toLowerCase() ||
              nsPart.toLowerCase().endsWith("." + s.containerName?.toLowerCase())),
        );
      if (wsMatches.length > 0) {
        return wsMatches[0];
      }
      return isGenericReference ? undefined : findGenericBaseSymbol(genericBaseName, indexer);
    }

    const sys = lookupSystemClassByName(qualifiedOrSimpleName)[0];
    if (sys) return sys;

    const wsSym = indexer.findSymbolByName(qualifiedOrSimpleName);
    if (
      wsSym &&
      (wsSym.kind === "class" || wsSym.kind === "structure" || wsSym.kind === "delegate")
    ) {
      return wsSym;
    }
    return isGenericReference ? undefined : findGenericBaseSymbol(genericBaseName, indexer);
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
  ): string | undefined {
    const cached = expressionTypeCache.get(expr);
    if (cached !== undefined) return cached;

    const rawType = TypeResolver.resolveExpressionTypeRaw(expr, document, lineIdx, indexer);
    if (!rawType) {
      expressionTypeCache.set(expr, undefined);
      return undefined;
    }
    const position = { line: lineIdx, character: 0 } as vscode.Position;
    const genericParams = TypeResolver.getGenericParametersInScope(document, position, indexer);
    const resolved = TypeResolver.resolveGenericParametersInType(rawType, genericParams);
    expressionTypeCache.set(expr, resolved);
    return resolved;
  }

  public static findUnqualifiedCallable(
    methodName: string,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
    argumentTypes?: readonly (string | undefined)[],
  ): SymbolInfo | undefined {
    const nameLower = methodName.toLowerCase();
    const arity = argumentTypes?.length;
    const isCallable = (symbol: SymbolInfo): boolean =>
      symbol.name.toLowerCase() === nameLower &&
      (symbol.kind === "method" ||
        symbol.kind === "declare_sub" ||
        symbol.kind === "declare_function") &&
      (arity === undefined || isArityMatch(symbol.parameters, arity));
    const select = (symbols: readonly SymbolInfo[]): SymbolInfo | undefined =>
      argumentTypes
        ? (symbols.find((symbol) =>
            parametersAcceptArguments(symbol.parameters ?? [], argumentTypes, indexer),
          ) ?? symbols[0])
        : symbols[0];

    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    const fileCandidates = fileSyms?.symbols.filter(isCallable) ?? [];
    const activeClass = fileSyms?.symbols.find(
      (s) => s.kind === "class" && lineIdx >= s.range.startLine && lineIdx <= s.range.endLine,
    );
    if (activeClass) {
      const classHit = select(
        fileCandidates.filter(
          (symbol) => symbol.containerName?.toLowerCase() === activeClass.name.toLowerCase(),
        ),
      );
      if (classHit) return classHit;
    }

    const localHit = select(fileCandidates);
    if (localHit) return localHit;

    const allSymbols = indexer.getSymbolsByName(methodName).filter(isCallable);
    const imported = new Set((fileSyms?.imports ?? []).map((imp) => imp.toLowerCase()));
    const importedHit = select(
      allSymbols.filter(
        (symbol) => symbol.containerName && imported.has(symbol.containerName.toLowerCase()),
      ),
    );
    if (importedHit) return importedHit;

    const systemHit = select(
      SYSTEM_SYMBOLS.filter((symbol) => !symbol.containerName && isCallable(symbol)),
    );
    if (systemHit) return systemHit;

    return select(allSymbols);
  }

  private static resolveExpressionTypeRaw(
    expr: Expression,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const cached = rawExpressionTypeCache.get(expr);
    if (cached !== undefined) return cached;
    const result = TypeResolver.resolveExpressionTypeRawInternal(expr, document, lineIdx, indexer);
    rawExpressionTypeCache.set(expr, result);
    return result;
  }

  private static resolveExpressionTypeRawInternal(
    expr: Expression,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
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
        const targetType = TypeResolver.resolveExpressionType(
          expr.target,
          document,
          lineIdx,
          indexer,
        );
        if (!targetType) return undefined;
        return TypeResolver.findMember(targetType, expr.member, indexer, 0)?.type;
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
        if (expr.callee) {
          const qualifiedType = qualifiedTypeNameFromInvocation(expr, indexer);
          if (qualifiedType) return qualifiedType;

          const targetType = TypeResolver.resolveExpressionType(
            expr.callee,
            document,
            lineIdx,
            indexer,
          );
          if (!targetType) return undefined;
          const argumentTypes = expr.arguments.map((arg) =>
            TypeResolver.resolveExpressionType(arg, document, lineIdx, indexer),
          );
          const member =
            TypeResolver.findMemberWithArgumentTypes(
              targetType,
              expr.methodName,
              indexer,
              argumentTypes,
            ) ??
            TypeResolver.findMember(targetType, expr.methodName, indexer, expr.arguments.length);
          if (!member) return undefined;
          if (member.kind === "variable" || member.kind === "property") {
            const delegateSym =
              indexer.findSymbolByName(member.type, document.uri.toString()) ??
              lookupSystemByName(member.type).find((s) => s.kind === "delegate");
            if (delegateSym?.kind === "delegate") {
              return delegateSym.type;
            }
          }
          return member.type;
        }
        const fileSyms = indexer.getFileSymbols(document.uri.toString());
        const activeClass = fileSyms?.symbols.find(
          (s) => s.kind === "class" && lineIdx >= s.range.startLine && lineIdx <= s.range.endLine,
        );

        // A local variable named the same as the invocation takes priority over global callables.
        // e.g. `Dim retorno As Foo` followed by `retorno()` — the parens are a no-op property-default
        // call on the variable, not an invocation of an unrelated global method called "retorno".
        if (expr.arguments.length === 0) {
          const position = { line: lineIdx, character: 0 } as vscode.Position;
          const localVarType = TypeResolver.getVariableType(
            expr.methodName,
            document,
            position,
            indexer,
          );
          if (localVarType) return localVarType;
        }

        let member: SymbolInfo | undefined;
        if (activeClass) {
          member = TypeResolver.findMember(
            activeClass.name,
            expr.methodName,
            indexer,
            expr.arguments.length,
          );
        }
        const argumentTypes = expr.arguments.map((arg) =>
          TypeResolver.resolveExpressionType(arg, document, lineIdx, indexer),
        );
        member ??= TypeResolver.findUnqualifiedCallable(
          expr.methodName,
          document,
          lineIdx,
          indexer,
          argumentTypes,
        );
        if (!member) {
          const castType =
            TypeResolver.findClassSymbol(expr.methodName, indexer) ??
            lookupSystemClassByName(expr.methodName)[0];
          if (castType) return castType.name;
        }
        if (member) {
          if (member.kind === "variable" || member.kind === "property") {
            const delegateSym =
              indexer.findSymbolByName(member.type, document.uri.toString()) ??
              lookupSystemByName(member.type).find((s) => s.kind === "delegate");
            if (delegateSym?.kind === "delegate") {
              return delegateSym.type;
            }
          }
          return member.type;
        }
        return undefined;
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
        return TypeResolver.resolveArrayLiteralType(expr.elements, document, lineIdx, indexer);
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
      return undefined;
    }

    const targetType = TypeResolver.resolveExpressionType(expr.target, document, lineIdx, indexer);
    if (!targetType) return undefined;
    const lowerTargetType = targetType.toLowerCase();
    if (lowerTargetType === "variant") return "Variant";
    if (lowerTargetType === "string") return "String";
    const item = TypeResolver.findMember(targetType, "Item", indexer, arity);
    if (item?.kind === "indexed-property") return item.type;
    const take = TypeResolver.findMember(targetType, "Take", indexer, arity);
    if (take?.kind === "indexed-property") return take.type;
    return parseGenericTypeReference(targetType)?.args[0];
  }

  private static resolveArrayLiteralType(
    elements: readonly Expression[],
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string {
    let elementType: string | undefined;
    for (const element of elements) {
      const current =
        element.kind === "SpreadExpression"
          ? TypeResolver.resolveSpreadElementType(element.expression, document, lineIdx, indexer)
          : TypeResolver.resolveExpressionType(element, document, lineIdx, indexer);
      if (!current) continue;
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

  private static resolveIdentifierType(
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
      const fileSyms = indexer.getFileSymbols(document.uri.toString());
      const activeClass = fileSyms?.symbols.find(
        (s) => s.kind === "class" && lineIdx >= s.range.startLine && lineIdx <= s.range.endLine,
      );
      if (lower === "me") {
        return activeClass?.name;
      } else {
        return activeClass?.inheritsFrom ?? "TObject";
      }
    }

    const local = TypeResolver.getVariableType(name, document, position, indexer);
    if (local) return local;

    const symbol =
      indexer.findSymbolByName(name, document.uri.toString()) ?? lookupSystemClassByName(name)[0];
    if (
      symbol &&
      (symbol.kind === "class" || symbol.kind === "structure" || symbol.kind === "namespace")
    ) {
      return symbol.name;
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
    const membersMap = new Map<string, SymbolInfo>();
    const visited = new Set<string>();

    const collect = (currentClassName: string): void => {
      const key = currentClassName.toLowerCase();
      if (visited.has(key)) return;
      visited.add(key);

      const classSymbol = TypeResolver.findClassSymbol(currentClassName, indexer);
      if (!classSymbol) return;

      const shortName = currentClassName.includes(".")
        ? (currentClassName.split(".").pop() ?? currentClassName).toLowerCase()
        : currentClassName.toLowerCase();

      const containerMatch = (containerName: string | undefined): boolean =>
        containerName !== undefined &&
        (containerName.toLowerCase() === key || containerName.toLowerCase() === shortName);

      const addSymbol = (s: SymbolInfo): void => {
        const namePart = s.name.toLowerCase();
        let paramsPart = "";
        if (s.parameters && s.parameters.length > 0) {
          paramsPart = s.parameters.map((p) => p.type.toLowerCase()).join(",");
        }
        const signatureKey = `${namePart}#${paramsPart}`;
        if (!membersMap.has(signatureKey)) {
          membersMap.set(signatureKey, s);
        }
      };

      SYSTEM_SYMBOLS.filter((s) => containerMatch(s.containerName)).forEach(addSymbol);
      // Coletamos candidatos apenas dos containers indexados
      const candidates = [
        ...indexer.getSymbolsByContainer(key),
        ...(key !== shortName ? indexer.getSymbolsByContainer(shortName) : []),
      ];
      candidates.filter((s) => containerMatch(s.containerName)).forEach(addSymbol);

      const parent = TypeResolver.resolveParent(classSymbol);
      if (parent) collect(parent);
    };

    const startClass = TypeResolver.findClassSymbol(className, indexer);
    if (!startClass) return [];
    const parent = TypeResolver.resolveParent(startClass);
    if (parent) collect(parent);
    return Array.from(membersMap.values());
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
  public static findMember(
    typeName: string,
    memberName: string,
    indexer: WorkspaceSymbolIndexer,
    arity?: number,
  ): SymbolInfo | undefined {
    const cacheKey = `${typeName.toLowerCase()}#${memberName.toLowerCase()}#${arity ?? "any"}`;
    if (indexer.findMemberCache.has(cacheKey)) {
      return indexer.findMemberCache.get(cacheKey);
    }

    const resolved = TypeResolver.findMemberInternal(typeName, memberName, indexer, arity);
    indexer.findMemberCache.set(cacheKey, resolved);
    return resolved;
  }

  private static findMemberInternal(
    typeName: string,
    memberName: string,
    indexer: WorkspaceSymbolIndexer,
    arity?: number,
  ): SymbolInfo | undefined {
    const memberLower = memberName.toLowerCase();
    const visited = new Set<string>();

    const search = (currentTypeName: string): SymbolInfo | undefined => {
      const lookupTypeName = normalizeGenericTypeName(currentTypeName);
      const key = lookupTypeName.toLowerCase();
      if (visited.has(key)) return undefined;
      visited.add(key);

      const shortName = lookupTypeName.includes(".")
        ? (lookupTypeName.split(".").pop() ?? lookupTypeName).toLowerCase()
        : key;

      // A container matches when its (lower-cased) form is either the
      // simple type name, the fully-qualified type name, OR ends with
      // `.<shortName>` so a member declared inside `Forms.Grid` is also
      // visible when the user references `Grid` directly.
      const containerMatch = (containerName: string | undefined): boolean => {
        if (containerName === undefined) return false;
        const c = containerName.toLowerCase();
        return c === key || c === shortName || c.endsWith("." + shortName);
      };

      // Workspace takes precedence over the System Library when both declare the same member.
      const allWsHits = indexer
        .getSymbolsByName(memberName)
        .filter((s) => containerMatch(s.containerName));

      if (arity !== undefined) {
        const arityHit = allWsHits.find((s) => isArityMatch(s.parameters, arity));
        if (arityHit) return arityHit;
      }

      const allSysHits = SYSTEM_SYMBOLS.filter(
        (s) => s.name.toLowerCase() === memberLower && containerMatch(s.containerName),
      );

      if (arity !== undefined) {
        const arityHit = allSysHits.find((s) => isArityMatch(s.parameters, arity));
        if (arityHit) return arityHit;
      }

      if (allWsHits.length > 0) return allWsHits[0];
      if (allSysHits.length > 0) return allSysHits[0];

      const genericHits = getGenericTemplateMembersForType(currentTypeName, indexer).filter(
        (s) => s.name.toLowerCase() === memberLower,
      );
      if (arity !== undefined) {
        const arityHit = genericHits.find(
          (s) => (s.parameters ? s.parameters.length : 0) === arity,
        );
        if (arityHit) return arityHit;
      }
      if (genericHits.length > 0) return genericHits[0];

      const classSymbol = TypeResolver.findClassSymbol(lookupTypeName, indexer);
      const parent = classSymbol
        ? TypeResolver.resolveParent(classSymbol)
        : getGenericTemplateParentForType(currentTypeName, indexer);

      if (parent) return search(parent);
      return undefined;
    };

    return search(typeName);
  }

  public static findMemberWithArgumentTypes(
    typeName: string,
    memberName: string,
    indexer: WorkspaceSymbolIndexer,
    argumentTypes: readonly (string | undefined)[],
  ): SymbolInfo | undefined {
    const memberLower = memberName.toLowerCase();
    const arity = argumentTypes.length;
    const candidates = TypeResolver.getAllMembersForType(typeName, indexer).filter(
      (s) => s.name.toLowerCase() === memberLower && isArityMatch(s.parameters, arity),
    );

    return (
      candidates.find((candidate) =>
        parametersAcceptArguments(candidate.parameters ?? [], argumentTypes, indexer),
      ) ?? candidates[0]
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

      SYSTEM_SYMBOLS.filter((s) => containerMatch(s.containerName)).forEach(addSymbol);
      // Coletamos candidatos apenas dos containers indexados
      const candidates = [
        ...indexer.getSymbolsByContainer(key),
        ...(key !== shortName ? indexer.getSymbolsByContainer(shortName) : []),
      ];
      candidates.filter((s) => containerMatch(s.containerName)).forEach(addSymbol);

      getGenericTemplateMembersForType(currentTypeName, indexer).forEach(addSymbol);

      const classSymbol = TypeResolver.findClassSymbol(lookupTypeName, indexer);
      const parent = classSymbol
        ? TypeResolver.resolveParent(classSymbol)
        : getGenericTemplateParentForType(currentTypeName, indexer);
      if (parent) collect(parent);
    };

    collect(typeName);
    const resolved = Array.from(membersMap.values());
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

    let fileCache = genericParamsCache.get(unit);
    if (!fileCache) {
      fileCache = new Map();
      genericParamsCache.set(unit, fileCache);
    }

    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    if (!fileSyms) return new Map();

    const currentMethod = fileSyms.symbols.find(
      (s) =>
        s.kind === "method" &&
        position.line >= s.range.startLine &&
        position.line <= s.range.endLine,
    );
    const currentClass = fileSyms.symbols.find(
      (s) =>
        s.kind === "class" &&
        position.line >= s.range.startLine &&
        position.line <= s.range.endLine,
    );

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
      current = parent ? normalizeGenericTypeName(parent) : "";
    }
    return false;
  }
}

function classSymbolKey(symbol: SymbolInfo): string {
  const name = symbol.name.toLowerCase();
  const container = symbol.containerName?.toLowerCase();
  return container ? `${container}.${name}` : name;
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
  const parsed = parseGenericTypeReference(typeName);
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
    (symbol.kind === "class" || symbol.kind === "structure" || symbol.kind === "delegate")
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
    if (
      argClass.name.toLowerCase() === paramClass.name.toLowerCase() &&
      (argClass.containerName ?? "").toLowerCase() ===
        (paramClass.containerName ?? "").toLowerCase()
    ) {
      return true;
    }
  }

  return TypeResolver.isSubclassOf(argumentType, parameterType, indexer);
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
        locals.set(node.name.toLowerCase(), explicitType);
      } else {
        const inferredType = node.initializer
          ? TypeResolver.resolveExpressionType(node.initializer, document, nodeLine, indexer)
          : undefined;
        locals.set(node.name.toLowerCase(), inferredType ?? "Variant");
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

    case "WhileStatement":
    case "UsingStatement":
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
  }
}
