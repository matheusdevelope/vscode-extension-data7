import type * as vscode from "vscode";
import type { SymbolInfo, WorkspaceSymbolIndexer } from "./symbol-indexer";
import {
  SYSTEM_SYMBOLS,
  lookupSystemByContainer,
  lookupSystemClassByName,
} from "../system-library";

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
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const varLower = varName.toLowerCase();

    // Walk upward from the cursor to find a `Dim name As Type` declaration in scope.
    const regex = new RegExp(
      `\\b(?:Dim|Private|Public|Protected|Shared)?\\s+${varName}\\b(?:\\s+As\\s+(?:New\\s+)?([a-zA-Z0-9_.]+))?`,
      "i",
    );
    for (let i = position.line; i >= 0; i--) {
      const lineText = lines[i].trim();
      if (lineText.startsWith("'") || lineText.toLowerCase().startsWith("rem ")) continue;
      const match = lineText.match(regex);
      if (match) {
        return match[1] || "Variant";
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
    if (qualifiedOrSimpleName.includes(".")) {
      const lastDot = qualifiedOrSimpleName.lastIndexOf(".");
      const namePart = qualifiedOrSimpleName.substring(lastDot + 1);
      const nsPart = qualifiedOrSimpleName.substring(0, lastDot);

      const exact = lookupSystemClassByName(namePart).find(
        (s) => s.containerName?.toLowerCase() === nsPart.toLowerCase(),
      );
      if (exact) return exact;

      // Array index access can be undefined at runtime (we don't enable
      // `noUncheckedIndexedAccess`); cast to make that explicit.
      const byName = lookupSystemClassByName(namePart)[0] as SymbolInfo | undefined;
      if (byName) return byName;

      return indexer.findSymbolByName(namePart);
    }

    const sys = lookupSystemClassByName(qualifiedOrSimpleName)[0] as SymbolInfo | undefined;
    if (sys) return sys;

    return indexer.findSymbolByName(qualifiedOrSimpleName);
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

      if (classSymbol.inheritsFrom) {
        collect(classSymbol.inheritsFrom);
      }
    };

    const startClass = TypeResolver.findClassSymbol(className, indexer);
    if (startClass?.inheritsFrom) {
      collect(startClass.inheritsFrom);
    }
    return members;
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

      // Stop walking when we reach the implicit TObject root, otherwise we'd
      // recurse forever on classes that inherit from themselves transitively
      // through a stub declaration.
      if (
        (classSymbol.inheritsFrom ?? "").toLowerCase() === "tobject" &&
        classSymbol.name.toLowerCase() === "tobject"
      ) {
        return undefined;
      }

      if (classSymbol.inheritsFrom) return search(classSymbol.inheritsFrom);
      return undefined;
    };

    return search(typeName);
  }

  /**
   * Returns all members (own + inherited) for a given type name. Mirrors the
   * shape used by completion and hover providers.
   */
  public static getAllMembersForType(
    typeName: string,
    indexer: WorkspaceSymbolIndexer,
  ): SymbolInfo[] {
    const members: SymbolInfo[] = [];
    const visited = new Set<string>();

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

      members.push(...SYSTEM_SYMBOLS.filter((s) => containerMatch(s.containerName)));
      members.push(...indexer.getAllSymbols().filter((s) => containerMatch(s.containerName)));

      if (classSymbol.inheritsFrom) {
        collect(classSymbol.inheritsFrom);
      }
    };

    collect(typeName);
    return members;
  }
}
