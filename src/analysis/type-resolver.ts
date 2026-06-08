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
  TopLevelMember,
  ClassMember,
  NamespaceDeclaration,
  ClassDeclaration,
  MethodDeclaration,
  PropertyDeclaration,
  TypeReference,
  VariableDeclaration,
  Node,
  BinaryExpression,
  UnaryExpression,
} from "../project/ast/ast";

/**
 * Shared scope and type resolution helpers used by every provider and by the
 * linter. Lives in its own module so providers do not import each other
 * (see governance.mdc).
 */
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

  private static getRawVariableType(
    varName: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const varLower = varName.toLowerCase();

    // Walk the AST from the beginning of the file up to the cursor position
    const cached = LanguageProcessor.getInstance().getOrParse(document.uri.toString(), document.getText());
    const unit = cached.unit;
    const locals = new Map<string, string>();
    collectLocalDeclarations(unit, position, locals, indexer, document, position.line);

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
    if (currentMethod && currentMethod.name.toLowerCase() === varLower) {
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
    if (currentProperty && currentProperty.name.toLowerCase() === varLower) {
      return currentProperty.type;
    }

    const currentClass = fileSyms.symbols.find(
      (s) =>
        s.kind === "class" &&
        position.line >= s.range.startLine &&
        position.line <= s.range.endLine,
    );
    if (currentClass) {
      const allWorkspaceSymbols = indexer.getAllSymbols();
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

    const globalVar = fileSyms.symbols.find(
      (s) =>
        s.name.toLowerCase() === varLower &&
        (s.kind === "variable" || s.kind === "property" || s.kind === "indexed-property") &&
        !s.containerName,
    );
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

      return (
        indexer.findSymbolByName(namePart) ??
        (isGenericReference ? undefined : findGenericBaseSymbol(genericBaseName, indexer))
      );
    }

    const sys = lookupSystemClassByName(qualifiedOrSimpleName)[0];
    if (sys) return sys;

    return (
      indexer.findSymbolByName(qualifiedOrSimpleName) ??
      (isGenericReference ? undefined : findGenericBaseSymbol(genericBaseName, indexer))
    );
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
    const rawType = TypeResolver.resolveExpressionTypeRaw(expr, document, lineIdx, indexer);
    if (!rawType) return undefined;
    const position = { line: lineIdx, character: 0 } as vscode.Position;
    const genericParams = TypeResolver.getGenericParametersInScope(document, position, indexer);
    return TypeResolver.resolveGenericParametersInType(rawType, genericParams);
  }

  private static resolveExpressionTypeRaw(
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
        const targetType = TypeResolver.resolveExpressionType(expr.target, document, lineIdx, indexer);
        if (!targetType) return undefined;
        return TypeResolver.findMember(targetType, expr.member, indexer, 0)?.type;
      }
      case "ArrayAccessExpression":
        return undefined;
      case "MethodInvocation": {
        if (expr.methodName.toLowerCase() === "typeof" && !expr.callee) {
          return "Boolean";
        }
        if (expr.methodName.toLowerCase() === "ctype" && expr.arguments.length === 2 && !expr.callee) {
          const targetArg = expr.arguments[1];
          if (targetArg) {
            return expressionToTypeString(targetArg);
          }
        }
        if (expr.callee) {
          const targetType = TypeResolver.resolveExpressionType(expr.callee, document, lineIdx, indexer);
          if (!targetType) return undefined;
          return TypeResolver.findMember(targetType, expr.methodName, indexer, expr.arguments.length)?.type;
        }
        const fileSyms = indexer.getFileSymbols(document.uri.toString());
        const activeClass = fileSyms?.symbols.find(
          (s) => s.kind === "class" && lineIdx >= s.range.startLine && lineIdx <= s.range.endLine
        );
        if (activeClass) {
          const member = TypeResolver.findMember(activeClass.name, expr.methodName, indexer, expr.arguments.length);
          if (member?.type) return member.type;
        }
        return (
          indexer.findSymbolByName(expr.methodName, document.uri.toString()) ??
          lookupSystemByName(expr.methodName).find((s) => !s.containerName)
        )?.type;
      }
      case "OptionalChainingExpression":
        return TypeResolver.resolveExpressionType(expr.member, document, lineIdx, indexer);
      case "TernaryExpression": {
        const trueType = TypeResolver.resolveExpressionType(expr.trueExpr, document, lineIdx, indexer);
        const falseType = TypeResolver.resolveExpressionType(expr.falseExpr, document, lineIdx, indexer);
        if (trueType && falseType) {
          return trueType.toLowerCase() === falseType.toLowerCase() ? trueType : "Variant";
        }
        return trueType ?? falseType;
      }
      case "NullCoalescingExpression":
        return TypeResolver.resolveExpressionType(expr.left, document, lineIdx, indexer) ?? 
               TypeResolver.resolveExpressionType(expr.right, document, lineIdx, indexer);
      case "PipeExpression":
        return TypeResolver.resolveExpressionType(expr.right, document, lineIdx, indexer);
      case "BinaryExpression":
        return TypeResolver.resolveBinaryType(expr, document, lineIdx, indexer);
      case "UnaryExpression":
        return TypeResolver.resolveUnaryType(expr, document, lineIdx, indexer);
      default:
        return undefined;
    }
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
        (s) => s.kind === "class" && lineIdx >= s.range.startLine && lineIdx <= s.range.endLine
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
      indexer.findSymbolByName(name, document.uri.toString()) ??
      lookupSystemClassByName(name)[0];
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
    if (
      [
        "=",
        "<>",
        "<",
        ">",
        "<=",
        ">=",
        "is",
        "isnot",
        "like",
        "and",
        "or",
        "xor",
        "andalso",
        "orelse",
      ].includes(op)
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
    if (expr.operator.toLowerCase() === "not") return "Boolean";
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
      indexer.getAllSymbols().filter((s) => containerMatch(s.containerName)).forEach(addSymbol);

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
    const memberLower = memberName.toLowerCase();
    const visited = new Set<string>();
    const rawTypeName = typeName;
    typeName = normalizeGenericTypeName(typeName);

    const search = (currentTypeName: string): SymbolInfo | undefined => {
      const key = currentTypeName.toLowerCase();
      if (visited.has(key)) return undefined;
      visited.add(key);

      const shortName = currentTypeName.includes(".")
        ? (currentTypeName.split(".").pop() ?? currentTypeName).toLowerCase()
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
        .getAllSymbols()
        .filter((s) => s.name.toLowerCase() === memberLower && containerMatch(s.containerName));

      if (arity !== undefined) {
        const arityHit = allWsHits.find((s) => (s.parameters ? s.parameters.length : 0) === arity);
        if (arityHit) return arityHit;
      }

      const allSysHits = SYSTEM_SYMBOLS.filter(
        (s) => s.name.toLowerCase() === memberLower && containerMatch(s.containerName),
      );

      if (arity !== undefined) {
        const arityHit = allSysHits.find((s) => (s.parameters ? s.parameters.length : 0) === arity);
        if (arityHit) return arityHit;
      }

      if (allWsHits.length > 0) return allWsHits[0];
      if (allSysHits.length > 0) return allSysHits[0];

      const genericHits = getGenericTemplateMembersForType(rawTypeName, indexer).filter(
        (s) => s.name.toLowerCase() === memberLower,
      );
      if (arity !== undefined) {
        const arityHit = genericHits.find((s) => (s.parameters ? s.parameters.length : 0) === arity);
        if (arityHit) return arityHit;
      }
      if (genericHits.length > 0) return genericHits[0];

      const classSymbol = TypeResolver.findClassSymbol(currentTypeName, indexer);
      if (!classSymbol) return undefined;

      const parent = TypeResolver.resolveParent(classSymbol);
      if (parent) return search(parent);
      return undefined;
    };

    return search(typeName);
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
    // Usamos um Map para evitar a duplicação na cadeia de herança.
    const membersMap = new Map<string, SymbolInfo>();
    const visited = new Set<string>();
    const rawTypeName = typeName;
    typeName = normalizeGenericTypeName(typeName);

    const collect = (currentTypeName: string): void => {
      const key = currentTypeName.toLowerCase();
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

      const classSymbol = TypeResolver.findClassSymbol(currentTypeName, indexer);
      if (!classSymbol) {
        getGenericTemplateMembersForType(rawTypeName, indexer).forEach(addSymbol);
        return;
      }

      const shortName = currentTypeName.includes(".")
        ? (currentTypeName.split(".").pop() ?? currentTypeName).toLowerCase()
        : currentTypeName.toLowerCase();

      const containerMatch = (containerName: string | undefined): boolean => {
        if (containerName === undefined) return false;
        const c = containerName.toLowerCase();
        return c === key || c === shortName || c.endsWith("." + shortName);
      };

      SYSTEM_SYMBOLS.filter((s) => containerMatch(s.containerName)).forEach(addSymbol);
      indexer
        .getAllSymbols()
        .filter((s) => containerMatch(s.containerName))
        .forEach(addSymbol);

      getGenericTemplateMembersForType(rawTypeName, indexer).forEach(addSymbol);

      const parent = TypeResolver.resolveParent(classSymbol);
      if (parent) collect(parent);
    };

    collect(typeName);
    return Array.from(membersMap.values());
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
        const constraint = parts[1]?.trim() || name;
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
    const params = new Map<string, string>();
    const fileSyms = indexer.getFileSymbols(document.uri.toString());
    if (!fileSyms) return params;

    const lines = document.getText().split(/\r?\n/);

    const currentMethod = fileSyms.symbols.find(
      (s) =>
        s.kind === "method" &&
        position.line >= s.range.startLine &&
        position.line <= s.range.endLine,
    );
    if (currentMethod) {
      const methodLine = lines[currentMethod.range.startLine];
      if (methodLine) {
        const parsed = TypeResolver.parseGenericDeclaration(methodLine);
        for (const p of parsed) {
          params.set(p.name.toLowerCase(), p.constraint);
        }
      }
    }

    const currentClass = fileSyms.symbols.find(
      (s) =>
        s.kind === "class" &&
        position.line >= s.range.startLine &&
        position.line <= s.range.endLine,
    );
    if (currentClass) {
      const classLine = lines[currentClass.range.startLine];
      if (classLine) {
        const parsed = TypeResolver.parseGenericDeclaration(classLine);
        for (const p of parsed) {
          if (!params.has(p.name.toLowerCase())) {
            params.set(p.name.toLowerCase(), p.constraint);
          }
        }
      }
    }

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
    let current = subClassName.toLowerCase();
    const target = baseClassName.toLowerCase();
    if (current === target) return true;
    const visited = new Set<string>();
    while (current && current !== target && !visited.has(current)) {
      visited.add(current);
      const cls =
        TypeResolver.findClassSymbol(current, indexer) ??
        findGenericBaseSymbol(genericBaseNameOf(current), indexer);
      if (!cls) break;
      const parent = TypeResolver.resolveParent(cls);
      current = parent ? parent.toLowerCase() : "";
    }
    return current === target;
  }
}

function getGenericTemplateMembersForType(
  typeName: string,
  indexer: WorkspaceSymbolIndexer,
): SymbolInfo[] {
  const parsed = parseGenericTypeReference(typeName);
  if (!parsed) return [];

  const template = indexer
    .getAllSymbols()
    .find(
      (s) =>
        (s.kind === "class" || s.kind === "delegate" || s.kind === "method") &&
        s.name.toLowerCase() === parsed.base.toLowerCase() &&
        s.genericTypeParameters !== undefined &&
        s.genericTypeParameters.length === parsed.args.length,
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
  return indexer
    .getAllSymbols()
    .filter((s) => s.containerName?.toLowerCase() === templateContainer)
    .map((s) => {
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

function parseGenericTypeReference(
  typeName: string,
): { base: string; args: string[] } | undefined {
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
  if (genericBaseName.includes(".")) {
    const lastDot = genericBaseName.lastIndexOf(".");
    const namePart = genericBaseName.substring(lastDot + 1);
    const nsPart = genericBaseName.substring(0, lastDot);
    return (
      lookupSystemClassByName(namePart).find(
        (s) => s.containerName?.toLowerCase() === nsPart.toLowerCase(),
      ) ?? indexer.findSymbolByName(namePart)
    );
  }
  return lookupSystemClassByName(genericBaseName)[0] ?? indexer.findSymbolByName(genericBaseName);
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
      if (node.members) {
        for (const m of node.members) {
          if (m.kind === "NamespaceDeclaration") {
            const mLine = Math.max(0, (m.loc?.startLine ?? 1) - 1);
            const mEndLine = Math.max(0, (m.loc?.endLine ?? 1) - 1);
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
      if (node.members) {
        for (const m of node.members) {
          if (m.loc) {
            const mLine = Math.max(0, m.loc.startLine - 1);
            const mEndLine = Math.max(0, m.loc.endLine - 1);
            if (position.line >= mLine && position.line <= mEndLine) {
              collectLocalDeclarations(m, position, locals, indexer, document, lineIdx);
            }
          }
        }
      }
      break;

    case "MethodDeclaration":
      if (node.parameters) {
        for (const p of node.parameters) {
          locals.set(p.name.toLowerCase(), typeRefToString(p.type) ?? "Variant");
        }
      }
      if (node.body) {
        for (const s of node.body) {
          collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
        }
      }
      break;

    case "PropertyDeclaration":
      if (node.getter && node.getter.loc) {
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
      if (node.setter && node.setter.loc) {
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
      if (node.bindings) {
        for (const b of node.bindings) {
          locals.set(b.name.toLowerCase(), "Variant");
        }
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
          if (node.body) {
            for (const s of node.body) {
              collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
            }
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
          if (node.body) {
            for (const s of node.body) {
              collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
            }
          }
        }
      }
      break;

    case "IfStatement":
      if (node.thenBranch) {
        for (const s of node.thenBranch) {
          collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
        }
      }
      if (node.elseIfBranches) {
        for (const b of node.elseIfBranches) {
          if (b.body) {
            for (const s of b.body) {
              collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
            }
          }
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
      if (node.body) {
        for (const s of node.body) {
          collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
        }
      }
      break;

    case "TryCatchStatement":
      if (node.tryBody) {
        for (const s of node.tryBody) {
          collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
        }
      }
      if (node.catchBody) {
        let inCatch = false;
        const lastTry = node.tryBody && node.tryBody.length > 0 ? node.tryBody[node.tryBody.length - 1] : undefined;
        const nodeStart = node.loc ? node.loc.startLine : 0;
        const nodeEnd = node.loc ? node.loc.endLine : 0;
        const tryEnd = lastTry && lastTry.loc
          ? Math.max(0, lastTry.loc.endLine - 1)
          : Math.max(0, nodeStart - 1);

        const firstFinally = node.finallyBody && node.finallyBody.length > 0 ? node.finallyBody[0] : undefined;
        const finallyStart = firstFinally && firstFinally.loc
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

    case "MatchStatement":
      if (node.cases) {
        for (const c of node.cases) {
          if (c.body) {
            for (const s of c.body) {
              collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
            }
          }
        }
      }
      break;

    case "Block":
      if (node.statements) {
        for (const s of node.statements) {
          collectLocalDeclarations(s, position, locals, indexer, document, lineIdx);
        }
      }
      break;
  }
}
