import { parseBasic, SugarsParserPlugin, GenericsParserPlugin } from "../project/parser";
import {
  ASTWalker,
  type CompilationUnit,
  type TypeReference,
  type MethodInvocation,
  type OpaqueStatement,
} from "../project/ast/ast";
import { VIRTUAL_TEMPLATES } from "./virtual-templates";

/**
 * Stable warning codes emitted by the generics analyzer.
 */
export type GenericsPassWarningCode =
  | "unknown-template"
  | "generic-arity-mismatch"
  | "duplicate-template"
  | "class-generic-method-unsupported"
  | "flat-name-collision"
  | "instantiation-limit-exceeded";

/**
 * One warning emitted by the generics pass.
 */
export interface GenericsPassWarning {
  readonly code: GenericsPassWarningCode;
  readonly message: string;
  /** Template name (original, non-flat). */
  readonly templateName?: string;
  /** Flat name when relevant (collision detection). */
  readonly flatName?: string;
  /** Expected type-parameter count for `generic-arity-mismatch`. */
  readonly expected?: number;
  /** Supplied type-argument count for `generic-arity-mismatch`. */
  readonly actual?: number;
  /** 0-based line index in the input source, when known. */
  readonly line?: number;
  /** 0-based column index of the offending token, when known. */
  readonly column?: number;
}

/**
 * A monomorphic instantiation observed in the source.
 */
export interface GenericUsageOccurrence {
  readonly templateName: string;
  readonly typeArgs: readonly string[];
  readonly flatName: string;
  readonly line: number;
  readonly column: number;
}

/**
 * Public shape of a registered template.
 */
export interface GenericTemplateInfo {
  readonly kind: "class" | "delegate";
  readonly name: string;
  readonly typeParams: readonly string[];
  readonly line: number;
}

/**
 * Aggregate result of one pass over a Data7 Basic source.
 */
export interface GenericsContext {
  readonly templates: ReadonlyMap<string, GenericTemplateInfo>;
  readonly usages: readonly GenericUsageOccurrence[];
  readonly warnings: readonly GenericsPassWarning[];
}

/**
 * Visits every generic declaration + usage in `code` using AST walking and returns the
 * full context.
 */
export function collectGenericsContext(code: string): GenericsContext {
  const lines = code.split(/\r?\n/);
  const plugins = [new SugarsParserPlugin(), new GenericsParserPlugin()];
  const { unit } = parseBasic(code, { plugins });

  const collector = new ASTGenericsCollector(unit, lines);
  collector.run();

  return {
    templates: collector.templates,
    usages: collector.usages,
    warnings: collector.warnings,
  };
}

/**
 * Backwards-compatible wrapper.
 */
export function analyzeGenericsPass(code: string): readonly GenericsPassWarning[] {
  return collectGenericsContext(code).warnings;
}

/**
 * Renders the canonical flat name for a generic usage.
 */
export function flatNameOf(baseName: string, typeArgs: readonly string[]): string {
  if (typeArgs.length === 0) return baseName;
  const flatArgs = typeArgs.map((t) => t.trim().replace(/\./g, "_").replace(/\s+/g, ""));
  return `${baseName}_${flatArgs.join("_")}`;
}

export interface GenericUsageHit {
  readonly start: number;
  readonly end: number;
  readonly base: string;
  readonly typeArgs: readonly string[];
  readonly known: boolean;
}

export function findInnerMostGenericUsage(
  line: string,
  templateNames: ReadonlySet<string>,
): GenericUsageHit | null {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "<") continue;
    let nameEnd = i;
    while (nameEnd > 0 && /\s/.test(line[nameEnd - 1] ?? "")) nameEnd--;
    let nameStart = nameEnd;
    while (nameStart > 0 && /[A-Za-z0-9_]/.test(line[nameStart - 1] ?? "")) nameStart--;
    const base = line.slice(nameStart, nameEnd);
    if (!base || !/^[A-Z]/.test(base)) continue;

    let j = i + 1;
    let valid = true;
    while (j < line.length && line[j] !== ">") {
      if (line[j] === "<") {
        valid = false;
        break;
      }
      j++;
    }
    if (!valid || j >= line.length) continue;

    const argsRaw = line.slice(i + 1, j);
    const typeArgs = argsRaw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (typeArgs.length === 0) continue;
    if (!typeArgs.every((t) => /^[A-Za-z_]/.test(t))) continue;

    return {
      start: nameStart,
      end: j + 1,
      base,
      typeArgs,
      known: templateNames.has(base.toLowerCase()),
    };
  }
  return null;
}

export function stripStringsAndComments(line: string): string {
  let inString = false;
  let inInterpolation = false;
  const out = line.split("");
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === "'") {
      if (!inString && !inInterpolation) {
        for (let j = i; j < line.length; j++) {
          out[j] = " ";
        }
        break;
      }
    }
    if (c === '"') {
      if (inString) {
        if (line[i + 1] === '"') {
          out[i] = " ";
          out[i + 1] = " ";
          i += 2;
          continue;
        } else {
          inString = false;
        }
      } else if (!inInterpolation) {
        inString = true;
      }
      out[i] = " ";
    } else if (c === "$" && line[i + 1] === '"') {
      if (!inString && !inInterpolation) {
        inInterpolation = true;
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        continue;
      }
    } else {
      if (inString || inInterpolation) {
        out[i] = " ";
      }
    }
    i++;
  }
  return out.join("");
}

class ASTGenericsCollector extends ASTWalker {
  public readonly templates = new Map<string, GenericTemplateInfo>();
  public readonly usages: GenericUsageOccurrence[] = [];
  public readonly warnings: GenericsPassWarning[] = [];
  private readonly flatToCanonical = new Map<string, string>();

  constructor(
    private readonly unit: CompilationUnit,
    private readonly lines: readonly string[],
  ) {
    super();
  }

  public run(): void {
    // Pre-populate with virtual templates (e.g. TList)
    for (const [key, value] of Object.entries(VIRTUAL_TEMPLATES)) {
      this.templates.set(key, value);
    }

    // Collect all template declarations first
    this.collectTemplates(this.unit.members);

    // Walk the entire AST to find generic usages and validate them
    this.walk(this.unit);
  }

  private collectTemplates(members: any[]): void {
    for (const member of members) {
      if (member.kind === "NamespaceDeclaration") {
        this.collectTemplates(member.members);
        continue;
      }
      if (member.kind === "ClassDeclaration") {
        if (member.typeParameters.length > 0) {
          const key = member.name.toLowerCase();
          const line = member.loc ? member.loc.startLine - 1 : 0;
          if (this.templates.has(key)) {
            this.warnings.push({
              code: "duplicate-template",
              message: `Generics: template '${member.name}' declarado mais de uma vez; a última declaração prevalece.`,
              templateName: member.name,
              line,
            });
          }
          this.templates.set(key, {
            kind: "class",
            name: member.name,
            typeParams: member.typeParameters.map((tp: any) => tp.name),
            line,
          });
        }
        for (const cm of member.members) {
          if (cm.kind === "MethodDeclaration" && cm.typeParameters.length > 0) {
            const qualified = `${member.name}.${cm.name}`;
            const line = cm.loc ? cm.loc.startLine - 1 : 0;
            this.warnings.push({
              code: "class-generic-method-unsupported",
              message: `Generics: método genérico '${qualified}' dentro de classe não é suportado pelo monomorphizer; a declaração será removida do output do Builder.`,
              templateName: qualified,
              line,
            });
          }
        }
      }
      if (member.kind === "DelegateDeclaration" && member.typeParameters.length > 0) {
        const key = member.name.toLowerCase();
        const line = member.loc ? member.loc.startLine - 1 : 0;
        if (this.templates.has(key)) {
          this.warnings.push({
            code: "duplicate-template",
            message: `Generics: template '${member.name}' declarado mais de uma vez; a última declaração prevalece.`,
            templateName: member.name,
            line,
          });
        }
        this.templates.set(key, {
          kind: "delegate",
          name: member.name,
          typeParams: member.typeParameters.map((tp: any) => tp.name),
          line,
        });
      }
    }
  }

  private getFlatName(node: TypeReference): string {
    if (node.typeArguments.length === 0) return node.name;
    return `${node.name}_${node.typeArguments.map((arg) => this.getFlatName(arg)).join("_")}`;
  }

  private getCanonicalName(node: TypeReference): string {
    if (node.typeArguments.length === 0) return node.name;
    return `${node.name}<${node.typeArguments.map((arg) => this.getCanonicalName(arg)).join(",")}>`;
  }

  private detectCollision(flat: string, canonical: string, line: number, column: number): void {
    const existing = this.flatToCanonical.get(flat);
    if (existing === undefined) {
      this.flatToCanonical.set(flat, canonical);
      return;
    }
    if (existing === canonical) return;
    this.warnings.push({
      code: "flat-name-collision",
      message: `Generics: duas instanciações distintas colapsam ao mesmo nome '${flat}'. Renomeie um dos tipos para desambiguar.`,
      flatName: flat,
      line,
      column,
    });
  }

  protected override visitTypeReference(node: TypeReference): void {
    if (node.typeArguments.length === 0) return;
    const key = node.name.toLowerCase();
    const line = node.loc ? node.loc.startLine - 1 : 0;
    const column = node.loc ? node.loc.startChar : 0;

    if (!this.templates.has(key)) {
      this.warnings.push({
        code: "unknown-template",
        message: `Generics: template '${node.name}' não foi declarado neste arquivo. O Builder deixará a referência inalterada e o compilador surfará erro.`,
        templateName: node.name,
        line,
        column,
      });
      return;
    }

    const template = this.templates.get(key)!;
    if (template.typeParams.length !== node.typeArguments.length) {
      this.warnings.push({
        code: "generic-arity-mismatch",
        message: `Generics: '${template.name}' espera ${template.typeParams.length} argumento(s) de tipo, mas recebeu ${node.typeArguments.length}.`,
        templateName: template.name,
        expected: template.typeParams.length,
        actual: node.typeArguments.length,
        line,
        column,
      });
      return;
    }

    const flat = this.getFlatName(node);
    const canonical = this.getCanonicalName(node);
    this.detectCollision(flat, canonical, line, column);

    for (const arg of node.typeArguments) {
      this.walk(arg);
    }

    const typeArgs = node.typeArguments.map((arg) => this.getFlatName(arg));

    this.usages.push({
      templateName: template.name,
      typeArgs,
      flatName: flat,
      line,
      column,
    });
  }

  protected override visitMethodInvocation(node: MethodInvocation): void {
    if (node.typeArguments.length === 0) return;
    const key = node.methodName.toLowerCase();
    const line = node.loc ? node.loc.startLine - 1 : 0;
    const column = node.loc ? node.loc.startChar : 0;

    if (!this.templates.has(key)) {
      this.warnings.push({
        code: "unknown-template",
        message: `Generics: template '${node.methodName}' não foi declarado neste arquivo. O Builder deixará a referência inalterada e o compilador surfará erro.`,
        templateName: node.methodName,
        line,
        column,
      });
      return;
    }

    const template = this.templates.get(key)!;
    if (template.typeParams.length !== node.typeArguments.length) {
      this.warnings.push({
        code: "generic-arity-mismatch",
        message: `Generics: '${template.name}' espera ${template.typeParams.length} argumento(s) de tipo, mas recebeu ${node.typeArguments.length}.`,
        templateName: template.name,
        expected: template.typeParams.length,
        actual: node.typeArguments.length,
        line,
        column,
      });
      return;
    }

    const synthetic: TypeReference = {
      kind: "TypeReference",
      name: node.methodName,
      typeArguments: node.typeArguments,
    };
    const flat = this.getFlatName(synthetic);
    const canonical = this.getCanonicalName(synthetic);
    this.detectCollision(flat, canonical, line, column);

    for (const arg of node.typeArguments) {
      this.walk(arg);
    }

    const typeArgs = node.typeArguments.map((arg) => this.getFlatName(arg));

    this.usages.push({
      templateName: template.name,
      typeArgs,
      flatName: flat,
      line,
      column,
    });
  }

  protected override visitOpaqueStatement(node: OpaqueStatement): void {
    let current = node.text;
    const names = new Set(Array.from(this.templates.keys()));
    const line = node.loc ? node.loc.startLine - 1 : 0;

    for (let iter = 0; iter < 100; iter++) {
      const hit = findInnerMostGenericUsage(current, names);
      if (!hit) break;

      const absCol = hit.start;

      if (!hit.known) {
        this.warnings.push({
          code: "unknown-template",
          message: `Generics: template '${hit.base}' não foi declarado neste arquivo. O Builder deixará a referência inalterada e o compilador surfará erro.`,
          templateName: hit.base,
          line,
          column: absCol,
        });
        break;
      }

      const template = this.templates.get(hit.base.toLowerCase());
      if (!template) break;

      if (template.typeParams.length !== hit.typeArgs.length) {
        this.warnings.push({
          code: "generic-arity-mismatch",
          message: `Generics: '${template.name}' espera ${template.typeParams.length} argumento(s) de tipo, mas recebeu ${hit.typeArgs.length}.`,
          templateName: template.name,
          expected: template.typeParams.length,
          actual: hit.typeArgs.length,
          line,
          column: absCol,
        });
        break;
      }

      const concreteArgs = hit.typeArgs.map((arg) => {
        return { kind: "TypeReference" as const, name: arg, typeArguments: [] };
      });

      const flat = flatNameOf(template.name, hit.typeArgs);
      const canonical = `${template.name}<${hit.typeArgs.join(",")}>`;
      this.detectCollision(flat, canonical, line, absCol);

      this.usages.push({
        templateName: template.name,
        typeArgs: hit.typeArgs,
        flatName: flat,
        line,
        column: absCol,
      });

      current = current.slice(0, hit.start) + flat + current.slice(hit.end);
    }
  }
}
