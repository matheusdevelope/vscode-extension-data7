import * as fs from "fs";
import * as path from "path";
import { logger } from "../infra/logger";
import { parseBasic, GenericsParserPlugin } from "../project/parser";
import { SugarEngine } from "../project/sugars";
import type { Node } from "../project/ast/ast";

// Module dependency analysis consumes parser AST nodes.
// Do not infer imports, namespaces, or member access from raw source text here.
export interface SharedModuleInfo {
  moduleName: string;
  sourceFilePath: string; // The .7Proj or .bas file containing the module
  isProj: boolean; // True if it is inside a .7Proj file
  code?: string; // Extracted code
  version?: string; // Version string (from XML or file)
}

export interface SyncDependenciesOptions {
  /**
   * Additional shared-module directories whose `.bas` files are always copied
   * into `data7_modules/`, independent of `data7.json#dependencies`.
   */
  alwaysSyncDirs?: string[];
}

export interface ModuleReference {
  readonly name: string;
  readonly isExplicit: boolean;
  readonly loc?: {
    readonly line: number;
    readonly character: number;
  };
}

export class DependencyScanner {
  // Find all files in a directory recursively
  public static getFilesRecursive(dir: string, extensions: string[]): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) {
      return results;
    }
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        results = results.concat(this.getFilesRecursive(filePath, extensions));
      } else {
        const ext = path.extname(filePath).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(filePath);
        }
      }
    });
    return results;
  }

  public static scanSharedModules(sharedDir: string): Map<string, SharedModuleInfo> {
    const map = new Map<string, SharedModuleInfo>();
    if (!sharedDir || !fs.existsSync(sharedDir)) {
      return map;
    }

    const files = this.getFilesRecursive(sharedDir, [".bas"]);

    files.forEach((filePath) => {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const moduleNames = this.getModuleMarkedNamespaces(content);

        for (const modName of moduleNames) {
          map.set(modName.toLowerCase(), {
            moduleName: modName,
            sourceFilePath: filePath,
            isProj: false,
            code: content,
            version: "1.0.0.0", // Default fallback for raw files
          });
        }
      } catch (err: unknown) {
        logger.error(`Erro ao ler arquivo .bas no repositório: ${filePath}`, err);
      }
    });

    return map;
  }

  public static isIgnoredNamespace(name: string): boolean {
    const lower = name.toLowerCase();
    if (lower.startsWith("system.") || lower.startsWith("vcl.")) {
      return true;
    }
    // These are native Data7 system namespaces that are always pre-declared in all projects.
    // They do NOT need to be resolved as user modules, but they DO require Imports in each file
    // (just like user modules). This list prevents the module resolver from flagging them as
    // "module not found", while diagnostics.ts still enforces the Imports rule separately.
    const ignoredNames = new Set([
      "system",
      "forms",
      "sql",
      "data7",
      "collections",
      "drawing",
      "xml",
      "excel",
      "io",
      "environment",
      "dateutils",
      "datetime",
      "math",
      "convert",
      "application",
      "me",
      "mybase",
      "vcl",
    ]);
    return ignoredNames.has(lower);
  }

  public static stripComments(line: string): string {
    const trimmed = line.trim().toLowerCase();
    if (
      trimmed.startsWith("'") ||
      trimmed.startsWith("rem ") ||
      trimmed === "rem" ||
      trimmed.startsWith("rem\t")
    ) {
      return "";
    }
    // `String.prototype.split` always returns at least one element, so the
    // `?? line` fallback is purely a `noUncheckedIndexedAccess` formality.
    const parts = line.split("'");
    return parts[0] ?? line;
  }

  // Helper to resolve module name by exact namespace match.
  public static resolveModuleName(
    name: string,
    localModules: Set<string>,
    availableSharedModules: Map<string, SharedModuleInfo>,
  ): string | null {
    const lowerName = name.toLowerCase();
    if (localModules.has(lowerName)) {
      return null; // Already defined locally in src/
    }
    if (availableSharedModules.has(lowerName)) {
      return lowerName;
    }
    return null;
  }

  public static getDeclaredNamespaces(content: string): string[] {
    const { unit } = parseBasic(content, {
      plugins: [...new SugarEngine().createParserPlugins(), new GenericsParserPlugin()],
    });
    return unit.members
      .filter((member) => member.kind === "NamespaceDeclaration")
      .map((member) => member.name);
  }

  public static getDeclaredTypeNames(content: string): string[] {
    const { unit } = parseBasic(content, {
      plugins: [...new SugarEngine().createParserPlugins(), new GenericsParserPlugin()],
    });
    const names: string[] = [];
    collectDeclaredTypeNames(unit, names);
    return names;
  }

  public static getModuleMarkedNamespaces(content: string): string[] {
    const { unit } = parseBasic(content, {
      plugins: [...new SugarEngine().createParserPlugins(), new GenericsParserPlugin()],
    });
    const markedNamespaces: string[] = [];
    let previousWasModuleMarker = false;

    for (const member of unit.members) {
      if (member.kind === "OpaqueStatement") {
        previousWasModuleMarker = isModuleMarker(member.text);
        continue;
      }
      if (member.kind === "NamespaceDeclaration") {
        if (previousWasModuleMarker) {
          markedNamespaces.push(member.name);
        }
        previousWasModuleMarker = false;
        continue;
      }
      if (member.kind !== "ImportsDeclaration") {
        previousWasModuleMarker = false;
      }
    }

    return markedNamespaces;
  }

  public static hasModuleImportedMarker(content: string): boolean {
    const { unit } = parseBasic(content, {
      plugins: [...new SugarEngine().createParserPlugins(), new GenericsParserPlugin()],
    });
    return unit.members.some(
      (member) => member.kind === "OpaqueStatement" && isModuleImportedMarker(member.text),
    );
  }

  public static collectModuleReferences(content: string): ModuleReference[] {
    const { unit } = parseBasic(content, {
      plugins: [...new SugarEngine().createParserPlugins(), new GenericsParserPlugin()],
    });
    const declaredNames = collectDeclaredNames(unit);
    const references: ModuleReference[] = [];

    for (const member of unit.members) {
      if (member.kind === "ImportsDeclaration") {
        references.push({ name: member.target, isExplicit: true, loc: sourceLoc(member) });
      }
    }

    collectModuleReferences(unit, (name, node) => {
      if (!declaredNames.has(name.toLowerCase())) {
        references.push({ name, isExplicit: false, loc: sourceLoc(node) });
      }
    });

    return references;
  }

  public static getLocalModuleNames(srcDir: string): Set<string> {
    const localModules = new Set<string>();
    if (!fs.existsSync(srcDir)) {
      return localModules;
    }

    const basFiles = this.getFilesRecursive(srcDir, [".bas"]);
    basFiles.forEach((file) => {
      try {
        const content = fs.readFileSync(file, "utf-8");
        for (const namespace of this.getDeclaredNamespaces(content)) {
          localModules.add(namespace.toLowerCase());
        }
      } catch {
        /* file unreadable or unparsable - keep scanning the rest */
      }
    });

    return localModules;
  }

  public static getLocalTypeNames(srcDir: string): Set<string> {
    const localTypes = new Set<string>();
    if (!fs.existsSync(srcDir)) {
      return localTypes;
    }

    const basFiles = this.getFilesRecursive(srcDir, [".bas"]);
    basFiles.forEach((file) => {
      try {
        const content = fs.readFileSync(file, "utf-8");
        for (const typeName of this.getDeclaredTypeNames(content)) {
          localTypes.add(typeName.toLowerCase());
        }
      } catch {
        /* file unreadable or unparsable - keep scanning the rest */
      }
    });

    return localTypes;
  }

  // Scan local src/ files for any references to modules
  public static detectReferencedModules(
    srcDir: string,
    availableSharedModules: Map<string, SharedModuleInfo>,
  ): Set<string> {
    const referenced = new Set<string>();
    if (!fs.existsSync(srcDir)) {
      return referenced;
    }

    const basFiles = this.getFilesRecursive(srcDir, [".bas"]);
    const localModules = this.getLocalModuleNames(srcDir);

    basFiles.forEach((file) => {
      try {
        const content = fs.readFileSync(file, "utf-8");
        for (const reference of this.collectModuleReferences(content)) {
          const namespace = reference.isExplicit
            ? (reference.name.split(".")[0] ?? reference.name)
            : reference.name;
          const resolved = this.resolveModuleName(namespace, localModules, availableSharedModules);
          if (resolved) referenced.add(resolved);
        }
      } catch (err: unknown) {
        logger.error(`Erro ao escanear arquivo local para dependências: ${file}`, err);
      }
    });

    return referenced;
  }
  // Extract dependencies and copy them to data7_modules/
  public static syncDependencies(
    srcDir: string,
    data7ModulesDir: string,
    sharedDir: string,
    dependencies?: Record<string, string>,
    options: SyncDependenciesOptions = {},
  ): string[] {
    const synced: string[] = [];

    // 1. Scan shared directory
    const sharedModules = this.scanSharedModules(sharedDir);

    // 2. Filter referenced modules based on explicit dependencies if provided
    const depsToSync = new Set<string>();
    if (dependencies) {
      Object.keys(dependencies).forEach((dep) => {
        depsToSync.add(dep.toLowerCase());
      });
    } else {
      // Fallback: auto-detect from src/ if no dependencies block exists in JSON
      const referenced = this.detectReferencedModules(srcDir, sharedModules);
      referenced.forEach((r) => depsToSync.add(r));
    }

    // 3. Resolve to unique source file paths to sync
    const sourceFilePaths = new Set<string>();
    depsToSync.forEach((dep) => {
      const info = sharedModules.get(dep);
      if (info) {
        sourceFilePaths.add(info.sourceFilePath);
      }
    });
    for (const alwaysSyncDir of options.alwaysSyncDirs ?? []) {
      const alwaysModules = this.scanSharedModules(alwaysSyncDir);
      for (const info of alwaysModules.values()) {
        sourceFilePaths.add(info.sourceFilePath);
      }
    }

    if (sourceFilePaths.size === 0) {
      // Clean data7_modules folder if empty
      if (fs.existsSync(data7ModulesDir)) {
        const existingFiles = fs.readdirSync(data7ModulesDir);
        existingFiles.forEach((file) => {
          try {
            fs.unlinkSync(path.join(data7ModulesDir, file));
          } catch {
            /* best-effort cleanup */
          }
        });
      }
      return synced;
    }

    // 4. Re-create/update data7_modules folder
    if (!fs.existsSync(data7ModulesDir)) {
      fs.mkdirSync(data7ModulesDir, { recursive: true });
    }

    // 5. Keep track of all files that should remain in data7_modules
    const filesToKeep = new Set<string>();

    // 6. Process each unique source file
    sourceFilePaths.forEach((filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".bas") {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const filename = path.basename(filePath);
          const destPath = path.join(data7ModulesDir, filename);
          fs.writeFileSync(destPath, content, "utf-8");

          filesToKeep.add(filename.toLowerCase());
          synced.push(path.basename(filePath, ".bas"));
        } catch (err: unknown) {
          logger.error(`Erro ao copiar dependência bas ${filePath}.`, err);
        }
      }
    });

    // 7. Clean up any files in data7_modules that are not in filesToKeep
    const existingFiles = fs.readdirSync(data7ModulesDir);
    existingFiles.forEach((file) => {
      if (!filesToKeep.has(file.toLowerCase())) {
        try {
          fs.unlinkSync(path.join(data7ModulesDir, file));
        } catch {
          /* best-effort cleanup */
        }
      }
    });

    return synced;
  }
}

function collectModuleReferences(
  node: Node | undefined,
  callback: (name: string, node: Node) => void,
): void {
  if (!node) return;

  switch (node.kind) {
    case "CompilationUnit":
      for (const m of node.members) collectModuleReferences(m, callback);
      break;
    case "NamespaceDeclaration":
      for (const m of node.members) collectModuleReferences(m, callback);
      break;
    case "ClassDeclaration":
      collectModuleReferences(node.baseType, callback);
      for (const m of node.members) collectModuleReferences(m, callback);
      break;
    case "MethodDeclaration":
      collectModuleReferences(node.returnType, callback);
      for (const p of node.parameters) collectModuleReferences(p, callback);
      for (const s of node.body) collectModuleReferences(s, callback);
      break;
    case "ParameterDeclaration":
      collectModuleReferences(node.type, callback);
      break;
    case "VariableDeclaration":
      collectModuleReferences(node.type, callback);
      collectModuleReferences(node.initializer, callback);
      break;
    case "DestructuredVariableDeclaration":
      collectModuleReferences(node.initializer, callback);
      for (const b of node.bindings) {
        collectModuleReferences(b.defaultValue, callback);
      }
      break;
    case "EnumDeclaration":
      collectModuleReferences(node.baseType, callback);
      for (const e of node.entries) {
        collectModuleReferences(e.value, callback);
      }
      break;
    case "PropertyDeclaration":
      collectModuleReferences(node.type, callback);
      collectModuleReferences(node.getter, callback);
      collectModuleReferences(node.setter, callback);
      break;
    case "FieldDeclaration":
      collectModuleReferences(node.type, callback);
      break;
    case "TypeReference":
      if (node.name.includes(".")) {
        const parts = node.name.split(".");
        if (parts[0]) callback(parts[0], node);
      }
      for (const arg of node.typeArguments) collectModuleReferences(arg, callback);
      break;
    case "MemberAccess":
      if (node.target.kind === "Identifier") {
        callback(node.target.name, node.target);
      } else {
        collectModuleReferences(node.target, callback);
      }
      break;
    case "MethodInvocation":
      if (node.callee) {
        if (node.callee.kind === "Identifier") {
          callback(node.callee.name, node.callee);
        } else {
          collectModuleReferences(node.callee, callback);
        }
      }
      for (const arg of node.arguments) collectModuleReferences(arg, callback);
      break;
    case "ObjectCreationExpression":
      collectModuleReferences(node.type, callback);
      for (const arg of node.arguments) collectModuleReferences(arg, callback);
      break;
    case "ObjectInitializerExpression":
      collectModuleReferences(node.type, callback);
      for (const arg of node.arguments) collectModuleReferences(arg, callback);
      for (const assign of node.assignments) collectModuleReferences(assign.value, callback);
      break;
    case "IfStatement":
      collectModuleReferences(node.condition, callback);
      for (const s of node.thenBranch) collectModuleReferences(s, callback);
      for (const branch of node.elseIfBranches) {
        collectModuleReferences(branch.condition, callback);
        for (const s of branch.body) collectModuleReferences(s, callback);
      }
      if (node.elseBranch) {
        for (const s of node.elseBranch) collectModuleReferences(s, callback);
      }
      break;
    case "ForStatement":
      collectModuleReferences(node.start, callback);
      collectModuleReferences(node.end, callback);
      collectModuleReferences(node.step, callback);
      for (const s of node.body) collectModuleReferences(s, callback);
      break;
    case "ForEachStatement":
      collectModuleReferences(node.elementType, callback);
      collectModuleReferences(node.enumerable, callback);
      for (const s of node.body) collectModuleReferences(s, callback);
      break;
    case "WhileStatement":
      collectModuleReferences(node.condition, callback);
      for (const s of node.body) collectModuleReferences(s, callback);
      break;
    case "TryCatchStatement":
      for (const s of node.tryBody) collectModuleReferences(s, callback);
      collectModuleReferences(node.catchType, callback);
      for (const s of node.catchBody) collectModuleReferences(s, callback);
      if (node.finallyBody) {
        for (const s of node.finallyBody) collectModuleReferences(s, callback);
      }
      break;
    case "UsingStatement":
      collectModuleReferences(node.resourceType, callback);
      for (const arg of node.resourceArgs) collectModuleReferences(arg, callback);
      for (const s of node.body) collectModuleReferences(s, callback);
      break;
    case "WithStatement":
      collectModuleReferences(node.expression, callback);
      for (const s of node.body) collectModuleReferences(s, callback);
      break;
    case "ReturnStatement":
      collectModuleReferences(node.expression, callback);
      break;
    case "ExpressionStatement":
      collectModuleReferences(node.expression, callback);
      break;
    case "Assignment":
      collectModuleReferences(node.target, callback);
      collectModuleReferences(node.value, callback);
      break;
    case "BinaryExpression":
      collectModuleReferences(node.left, callback);
      collectModuleReferences(node.right, callback);
      break;
    case "UnaryExpression":
      collectModuleReferences(node.argument, callback);
      break;
    case "TernaryExpression":
      collectModuleReferences(node.condition, callback);
      collectModuleReferences(node.trueExpr, callback);
      collectModuleReferences(node.falseExpr, callback);
      break;
    case "NullCoalescingExpression":
      collectModuleReferences(node.left, callback);
      collectModuleReferences(node.right, callback);
      break;
    case "OptionalChainingExpression":
      collectModuleReferences(node.target, callback);
      collectModuleReferences(node.member, callback);
      break;
    case "PipeExpression":
      collectModuleReferences(node.left, callback);
      collectModuleReferences(node.right, callback);
      break;
    case "TaggedTemplateExpression":
      if (node.tag) callback(node.tag, node);
      break;
    case "Block":
      for (const s of node.statements) collectModuleReferences(s, callback);
      break;
    case "OpaqueStatement": {
      break;
    }
  }
}

function collectDeclaredNames(node: Node | undefined, declared = new Set<string>()): Set<string> {
  if (!node) return declared;

  switch (node.kind) {
    case "CompilationUnit":
      for (const member of node.members) collectDeclaredNames(member, declared);
      break;
    case "NamespaceDeclaration":
    case "ClassDeclaration":
    case "MethodDeclaration":
    case "FieldDeclaration":
    case "PropertyDeclaration":
    case "ParameterDeclaration":
    case "VariableDeclaration":
      addDeclaredName(declared, node.name);
      if (node.kind === "NamespaceDeclaration") {
        for (const member of node.members) collectDeclaredNames(member, declared);
      } else if (node.kind === "ClassDeclaration") {
        for (const member of node.members) collectDeclaredNames(member, declared);
      } else if (node.kind === "MethodDeclaration") {
        for (const parameter of node.parameters) collectDeclaredNames(parameter, declared);
        for (const statement of node.body) collectDeclaredNames(statement, declared);
      }
      break;
    case "DelegateDeclaration":
    case "EnumDeclaration":
      addDeclaredName(declared, node.name);
      break;
    case "DestructuredVariableDeclaration":
      for (const binding of node.bindings) addDeclaredName(declared, binding.name);
      break;
    case "ForStatement":
      addDeclaredName(declared, node.counter.name);
      for (const statement of node.body) collectDeclaredNames(statement, declared);
      break;
    case "ForEachStatement":
      addDeclaredName(declared, node.elementVar.name);
      for (const statement of node.body) collectDeclaredNames(statement, declared);
      break;
    case "TryCatchStatement":
      if (node.catchVar) addDeclaredName(declared, node.catchVar.name);
      for (const statement of node.tryBody) collectDeclaredNames(statement, declared);
      for (const statement of node.catchBody) collectDeclaredNames(statement, declared);
      for (const statement of node.finallyBody ?? []) collectDeclaredNames(statement, declared);
      break;
    case "UsingStatement":
      addDeclaredName(declared, node.resourceVar.name);
      for (const statement of node.body) collectDeclaredNames(statement, declared);
      break;
    case "IfStatement":
      for (const statement of node.thenBranch) collectDeclaredNames(statement, declared);
      for (const branch of node.elseIfBranches) {
        for (const statement of branch.body) collectDeclaredNames(statement, declared);
      }
      for (const statement of node.elseBranch ?? []) collectDeclaredNames(statement, declared);
      break;
    case "WhileStatement":
    case "Block":
    case "WithStatement":
      for (const statement of node.kind === "Block" ? node.statements : node.body) {
        collectDeclaredNames(statement, declared);
      }
      break;
    case "SelectCaseStatement":
      for (const branch of node.cases) collectDeclaredNames(branch, declared);
      break;
    case "SelectCaseBranch":
      for (const statement of node.body) collectDeclaredNames(statement, declared);
      break;
    default:
      break;
  }

  return declared;
}

function addDeclaredName(declared: Set<string>, name: string): void {
  if (name.length > 0) declared.add(name.toLowerCase());
}

function collectDeclaredTypeNames(node: Node | undefined, names: string[]): void {
  if (!node) return;

  switch (node.kind) {
    case "CompilationUnit":
      for (const member of node.members) collectDeclaredTypeNames(member, names);
      break;
    case "NamespaceDeclaration":
      for (const member of node.members) collectDeclaredTypeNames(member, names);
      break;
    case "ClassDeclaration":
      names.push(node.name);
      for (const member of node.members) collectDeclaredTypeNames(member, names);
      break;
    case "DelegateDeclaration":
    case "EnumDeclaration":
      names.push(node.name);
      break;
    default:
      break;
  }
}

function isModuleMarker(text: string): boolean {
  return text.trim().toLowerCase() === "'@module";
}

function isModuleImportedMarker(text: string): boolean {
  return text.trim().toLowerCase() === "'@module-imported";
}

function sourceLoc(node: Node): ModuleReference["loc"] | undefined {
  if (!node.loc) return undefined;
  return {
    line: Math.max(0, node.loc.startLine - 1),
    character: Math.max(0, node.loc.startChar),
  };
}
