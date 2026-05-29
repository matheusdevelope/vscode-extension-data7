import type * as vscode from "vscode";
import type { SymbolInfo, WorkspaceSymbolIndexer } from "./symbol-indexer";
import {
  SYSTEM_SYMBOLS,
  lookupSystemByContainer,
  lookupSystemClassByName,
} from "../system-library";
import { inferLiteralType } from "../utils/literal-type-infer";
import { parseChain } from "../utils/chain-parser";
import { findTopLevelTernary } from "../utils/ternary";
import { getNonNullVariablesAt } from "./flow-analyzer";
import { findInnerMostGenericUsage, flatNameOf } from "./generics-analyzer";

/**
 * Shared scope and type resolution helpers used by every provider and by the
 * linter. Lives in its own module so providers do not import each other
 * (see governance.mdc).
 */
export class TypeResolver {
  /**
   * Resolves the static type of a local variable, parameter, field or
   * namespace-level variable by walking the current method/class/namespace
   * context in the active document.
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
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const varLower = varName.toLowerCase();

    // Walk upward from the cursor to find a `Dim name As Type` declaration in scope.
    // The `<...>` suffix lets the regex pick up generic types
    // (`TList<Product>`); `findMember` later normalises them to their
    // flat form (`TList_Product`).
    const regex = new RegExp(
      `\\b(?:Dim|Private|Public|Protected|Shared)?\\s+${varName}\\b(?:\\s+As\\s+(?:New\\s+)?([a-zA-Z0-9_.]+(?:\\s*<[^<>]*?(?:<[^<>]*?>[^<>]*?)*?>)?))?`,
      "i",
    );
    // `For Each <name> As <Type> In ...` introduces `<name>` into the enclosing
    // scope. The sugar transpiler later expands it into a synthetic `Dim`, but
    // hover/completion/signature must already see the variable while the file
    // is still authored in sugared form.
    const forEachRegex = new RegExp(
      `\\bFor\\s+Each\\s+${varName}\\b(?:\\s+As\\s+([a-zA-Z0-9_.]+(?:\\s*<[^<>]*?(?:<[^<>]*?>[^<>]*?)*?>)?))?\\s+In\\b`,
      "i",
    );
    // `Dim name = <expr>` (no As clause) — infer from the right-hand side
    // when the RHS is a method call (`me.X()` / `obj.X()` / `New Type()`) or
    // a `Cls.SharedX()` static call.
    const assignmentRegex = new RegExp(
      `\\b(?:Dim|Private|Public|Protected|Shared)?\\s+${varName}\\s*=\\s*(.+?)\\s*(?:'.*)?$`,
      "i",
    );
    for (let i = position.line; i >= 0; i--) {
      const lineRaw = lines[i];
      if (lineRaw === undefined) continue;
      const lineText = lineRaw.trim();
      if (lineText.startsWith("'") || lineText.toLowerCase().startsWith("rem ")) continue;

      const forEachMatch = lineText.match(forEachRegex);
      if (forEachMatch) {
        return forEachMatch[1] ?? "Variant";
      }

      const match = lineText.match(regex);
      if (match) {
        if (match[1]) return match[1];
        // No `As Type` — try inferring from `= <expr>` on the same line.
        const assignMatch = lineText.match(assignmentRegex);
        const rhs = assignMatch?.[1];
        if (rhs) {
          const inferred = TypeResolver.inferExpressionType(rhs, document, i, indexer);
          if (inferred) return inferred;
        }
        return "Variant";
      }
    }

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

    const currentClass = fileSyms.symbols.find(
      (s) =>
        s.kind === "class" &&
        position.line >= s.range.startLine &&
        position.line <= s.range.endLine,
    );
    if (currentClass) {
      // Walk current class + ancestors (workspace + system library) looking for a
      // variable OR property OR method matching the name. Returns the declared type.
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
    qualifiedOrSimpleName = normalizeGenericTypeName(qualifiedOrSimpleName);
    if (qualifiedOrSimpleName.includes(".")) {
      const lastDot = qualifiedOrSimpleName.lastIndexOf(".");
      const namePart = qualifiedOrSimpleName.substring(lastDot + 1);
      const nsPart = qualifiedOrSimpleName.substring(0, lastDot);

      const exact = lookupSystemClassByName(namePart).find(
        (s) => s.containerName?.toLowerCase() === nsPart.toLowerCase(),
      );
      if (exact) return exact;

      // `noUncheckedIndexedAccess` now widens `[0]` to `T | undefined`
      // automatically, so the explicit cast above is no longer needed.
      const byName = lookupSystemClassByName(namePart)[0];
      if (byName) return byName;

      return indexer.findSymbolByName(namePart);
    }

    const sys = lookupSystemClassByName(qualifiedOrSimpleName)[0];
    if (sys) return sys;

    return indexer.findSymbolByName(qualifiedOrSimpleName);
  }

  /**
   * Best-effort type inference for `Dim x = <expr>` when the user omits the
   * `As <Type>` clause. Handles the cases that pay off the most in real
   * Data7 code:
   *
   *  - `New <Type>(...)` → `<Type>`
   *  - `Me.Method(...)` or `MyBase.Method(...)` → return type of `Method` on
   *    the enclosing class
   *  - `<ident>.Method(...)` → resolves `<ident>` to a type and looks up
   *    `Method` on that type chain
   *  - `<Class>.SharedMethod(...)` → return type of the shared/static method
   *  - `<ident>` (bare identifier) → recurses into {@link getVariableType}
   *
   * Returns `undefined` when the expression's shape is unsupported (literals,
   * string concatenation, arithmetic) — the caller should fall back to
   * `"Variant"` in that case.
   *
   * `lineIdx` is the 0-based line where the declaration sits; recursive
   * lookups walk backwards from that line so we never "see" the variable
   * we are currently resolving.
   */
  public static inferExpressionType(
    expr: string,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const rawType = TypeResolver.inferRawExpressionType(expr, document, lineIdx, indexer);
    if (!rawType) return undefined;
    const position = { line: lineIdx, character: 0 } as vscode.Position;
    const genericParams = TypeResolver.getGenericParametersInScope(document, position, indexer);
    return TypeResolver.resolveGenericParametersInType(rawType, genericParams);
  }

  private static inferRawExpressionType(
    expr: string,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const trimmed = expr.trim();
    if (!trimmed) return undefined;

    // Strip trailing inline comment so `Dim x = 42  ' explanation` infers
    // `Integer` rather than failing on the comment text.
    const noComment = stripTrailingComment(trimmed).trim();
    if (!noComment) return undefined;

    // Step 1 — Pure literal / `New T(...)` / `CType(_, T)` / `$"..."`.
    // The shared helper handles these without consulting the indexer; we keep
    // them first because they are the fastest path and the most common RHS
    // shapes in real code.
    const literal = inferLiteralType(noComment);
    if (literal) return literal;

    // Step 2 — Top-level ternary `cond ? a : b`. Infer the common type of
    // both branches; fall back to `Variant` if they disagree.
    const ternary = findTopLevelTernary(noComment);
    if (ternary) {
      const thenBranch = noComment.slice(ternary.questionAt + 1, ternary.colonAt).trim();
      const elseBranch = noComment.slice(ternary.colonAt + 1).trim();
      const tType = TypeResolver.inferExpressionType(thenBranch, document, lineIdx, indexer);
      const eType = TypeResolver.inferExpressionType(elseBranch, document, lineIdx, indexer);
      if (tType && eType) {
        return tType.toLowerCase() === eType.toLowerCase() ? tType : "Variant";
      }
      return tType ?? eType ?? "Variant";
    }

    // Step 3 — Member access chain (`a.b().c().d`). The parser walks the
    // chain segment by segment; we resolve the type at each link via
    // `findMember`. Chain of length 1 (just the root identifier) falls
    // through to Step 4 because `parseChain` records zero segments then.
    const chain = parseChain(noComment);
    if (chain && chain.segments.length > 0) {
      let currentType = TypeResolver.resolveRootType(chain.root, document, lineIdx, indexer);
      if (!currentType) return undefined;
      for (const seg of chain.segments) {
        const member = TypeResolver.findMember(currentType, seg.name, indexer);
        if (!member?.type || member.type === "Void") return undefined;
        currentType = member.type;
      }
      return currentType;
    }

    // Step 4 — Bare identifier: recurse via getVariableType (one hop earlier
    // so we do not match the current declaration line again).
    if (/^[A-Za-z_]\w*$/.test(noComment)) {
      // Construct a position type-erased — we only need `.line` inside the
      // recursive call, and we know the prior declaration sits BEFORE lineIdx.
      const position = { line: lineIdx, character: 0 } as vscode.Position;
      return TypeResolver.getVariableType(noComment, document, position, indexer);
    }

    return undefined;
  }

  /**
   * Resolves the type of the `<root>` token in expressions like `<root>.X`:
   *
   *  - `me` / `mybase` → the enclosing class declared in the file.
   *  - `<ClassName>` (bare class identifier) → the class itself, so callers
   *    can look up Shared members on it.
   *  - Anything else → fall back to {@link getVariableType}.
   */
  private static resolveRootType(
    root: string,
    document: vscode.TextDocument,
    lineIdx: number,
    indexer: WorkspaceSymbolIndexer,
  ): string | undefined {
    const lower = root.toLowerCase();
    const position = { line: lineIdx, character: 0 } as vscode.Position;
    const genericParams = TypeResolver.getGenericParametersInScope(document, position, indexer);
    if (genericParams.has(lower)) {
      return genericParams.get(lower);
    }

    if (lower === "me" || lower === "mybase") {
      const fileSyms = indexer.getFileSymbols(document.uri.toString());
      const currentClass = fileSyms?.symbols.find(
        (s) => s.kind === "class" && lineIdx >= s.range.startLine && lineIdx <= s.range.endLine,
      );
      return currentClass?.name;
    }

    // Bare class/namespace name (static access).
    const classSymbol = TypeResolver.findClassSymbol(root, indexer);
    if (
      classSymbol &&
      (classSymbol.kind === "class" ||
        classSymbol.kind === "structure" ||
        classSymbol.kind === "namespace")
    ) {
      return classSymbol.name;
    }

    // Fallback: resolve as a variable.
    return TypeResolver.getVariableType(root, document, position, indexer);
  }

  /**
   * Returns inherited members for a class, walking the inheritance chain
   * via `inheritsFrom` and de-duplicating cycles.
   */
  public static getInheritedMembers(
    className: string,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo[] {
    const members: SymbolInfo[] = [];
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

      members.push(...SYSTEM_SYMBOLS.filter((s) => containerMatch(s.containerName)));
      members.push(...indexer.getAllSymbols().filter((s) => containerMatch(s.containerName)));

      const parent = TypeResolver.resolveParent(classSymbol);
      if (parent) collect(parent);
    };

    const startClass = TypeResolver.findClassSymbol(className, indexer);
    if (!startClass) return members;
    const parent = TypeResolver.resolveParent(startClass);
    if (parent) collect(parent);
    return members;
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
  ): SymbolInfo | undefined {
    const memberLower = memberName.toLowerCase();
    const visited = new Set<string>();
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
      const wsHit = indexer
        .getAllSymbols()
        .find((s) => s.name.toLowerCase() === memberLower && containerMatch(s.containerName));
      if (wsHit) return wsHit;

      const sysHit = SYSTEM_SYMBOLS.find(
        (s) => s.name.toLowerCase() === memberLower && containerMatch(s.containerName),
      );
      if (sysHit) return sysHit;

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
    typeName = normalizeGenericTypeName(typeName);

    const collect = (currentTypeName: string): void => {
      const key = currentTypeName.toLowerCase();
      if (visited.has(key)) return;
      visited.add(key);

      const classSymbol = TypeResolver.findClassSymbol(currentTypeName, indexer);
      if (!classSymbol) return;

      const shortName = currentTypeName.includes(".")
        ? (currentTypeName.split(".").pop() ?? currentTypeName).toLowerCase()
        : currentTypeName.toLowerCase();

      const containerMatch = (containerName: string | undefined): boolean => {
        if (containerName === undefined) return false;
        const c = containerName.toLowerCase();
        return c === key || c === shortName || c.endsWith("." + shortName);
      };

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

      SYSTEM_SYMBOLS.filter((s) => containerMatch(s.containerName)).forEach(addSymbol);
      indexer
        .getAllSymbols()
        .filter((s) => containerMatch(s.containerName))
        .forEach(addSymbol);

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
   * Defaults constraint to `TObject` if omitted.
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
        const constraint = parts[1]?.trim() ?? "TObject";
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
