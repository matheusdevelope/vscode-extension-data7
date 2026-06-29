import * as fs from "fs";
import * as path from "path";
import { parseBasic, GenericsParserPlugin } from "../project/parser";
import { SugarEngine } from "../project/sugars";
import type { Node } from "../project/ast/ast";

export interface SharedModuleInfo {
  moduleName: string;
  sourceFilePath: string;
  isProj: boolean;
  code?: string;
  version?: string;
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
  public static collectModuleReferences(content: string): ModuleReference[] {
    return [];
  }
  public static scanSharedModules(sharedDir: string): Map<string, SharedModuleInfo> {
    return new Map();
  }
  public static getLocalModuleNames(srcDir: string): Set<string> {
    return new Set();
  }
  public static getLocalTypeNames(srcDir: string): Set<string> {
    return new Set();
  }
  public static getLocalValueNames(srcDir: string): Set<string> {
    return new Set();
  }
  public static hasModuleImportedMarker(content: string): boolean {
    return false;
  }
  public static getModuleMarkedNamespaces(content: string): string[] {
    return [];
  }
  public static syncDependencies(a: any, b: any, c: any, d?: any, e?: any): string[] {
    return [];
  }
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

  public static isIgnoredNamespace(name: string): boolean {
    const lower = name.toLowerCase();
    if (lower.startsWith("system.") || lower.startsWith("vcl.")) {
      return true;
    }
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
      "net",
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

    let inString = false;
    for (let index = 0; index < line.length; index++) {
      const char = line[index] ?? "";
      if (char === '"') {
        if (inString && line[index + 1] === '"') {
          index++;
          continue;
        }
        inString = !inString;
        continue;
      }
      if (!inString && char === "'") {
        return line.slice(0, index);
      }
    }
    return line;
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

  public static getDeclaredValueNames(content: string): string[] {
    const { unit } = parseBasic(content, {
      plugins: [...new SugarEngine().createParserPlugins(), new GenericsParserPlugin()],
    });
    const names: string[] = [];
    collectDeclaredValueNames(unit, names);
    return names;
  }
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

function collectDeclaredValueNames(node: Node | undefined, names: string[]): void {
  if (!node) return;
  switch (node.kind) {
    case "CompilationUnit":
      for (const member of node.members) collectDeclaredValueNames(member, names);
      break;
    case "NamespaceDeclaration":
      for (const member of node.members) collectDeclaredValueNames(member, names);
      break;
    case "ClassDeclaration":
      for (const member of node.members) collectDeclaredValueNames(member, names);
      break;
    case "MethodDeclaration":
      names.push(node.name);
      for (const parameter of node.parameters) collectDeclaredValueNames(parameter, names);
      for (const statement of node.body) collectDeclaredValueNames(statement, names);
      break;
    case "FieldDeclaration":
    case "PropertyDeclaration":
    case "ParameterDeclaration":
    case "VariableDeclaration":
      names.push(node.name);
      break;
    case "DelegateDeclaration":
      names.push(node.name);
      break;
    case "DestructuredVariableDeclaration":
      for (const binding of node.bindings) names.push(binding.name);
      break;
    case "ForStatement":
      names.push(node.counter.name);
      for (const statement of node.body) collectDeclaredValueNames(statement, names);
      break;
    case "ForEachStatement":
      names.push(node.elementVar.name);
      for (const statement of node.body) collectDeclaredValueNames(statement, names);
      break;
    case "TryCatchStatement":
      if (node.catchVar) names.push(node.catchVar.name);
      for (const statement of node.tryBody) collectDeclaredValueNames(statement, names);
      for (const statement of node.catchBody) collectDeclaredValueNames(statement, names);
      for (const statement of node.finallyBody ?? []) collectDeclaredValueNames(statement, names);
      break;
    case "UsingStatement":
      names.push(node.resourceVar.name);
      for (const statement of node.body) collectDeclaredValueNames(statement, names);
      break;
    case "IfStatement":
      for (const statement of node.thenBranch) collectDeclaredValueNames(statement, names);
      for (const branch of node.elseIfBranches) {
        for (const statement of branch.body) collectDeclaredValueNames(statement, names);
      }
      for (const statement of node.elseBranch ?? []) collectDeclaredValueNames(statement, names);
      break;
    case "WhileStatement":
    case "Block":
    case "WithStatement":
      for (const statement of node.kind === "Block" ? node.statements : node.body) {
        collectDeclaredValueNames(statement, names);
      }
      break;
    case "SelectCaseStatement":
      for (const branch of node.cases) collectDeclaredValueNames(branch, names);
      break;
    case "SelectCaseBranch":
      for (const statement of node.body) collectDeclaredValueNames(statement, names);
      break;
    default:
      break;
  }
}
