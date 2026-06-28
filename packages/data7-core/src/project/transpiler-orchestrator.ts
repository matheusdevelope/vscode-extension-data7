import { SugarEngine } from "./sugars";
import { flatNameOf, GenericsMonomorphizer, type MonomorphizationWarning } from "./generics";
import { GenericsParserPlugin, parseBasic, serializeUnitWithMap } from "./parser";
import {
  ASTWalker,
  type TopLevelMember,
  type TypeReference,
  type MethodInvocation,
  type OpaqueStatement,
  type CompilationUnit,
} from "./ast/ast";
import { ASTSugarTransformer } from "./sugars/plugins/ast/transformer";
import { LoggerPrintSugarTransformer } from "./sugars/plugins/logger-print/transformer";
import { normalizeMetaProgrammingSyntax } from "./sugars/plugins/metaprogramming";
import { removeNumericSeparators } from "./sugars/plugins/numeric-separator";
import type { SugarDiagnostic, TranspileContext, TranspileResult } from "./transpiler-types";
function mapGenericsWarning(warning: MonomorphizationWarning): SugarDiagnostic {
  let typeName: string;
  let code: SugarDiagnostic["code"];

  if (warning.code === "arity-mismatch") {
    code = "generic-arity-mismatch";
    typeName = warning.templateName ?? "";
  } else if (warning.code === "invalid-input") {
    // Treat invalid-input as unknown-template or handle it cleanly.
    // In builder.ts, invalid-input is low-level AST warning, so we can map it to unknown-template or keep a generic mapping.
    code = "unknown-template";
    typeName = warning.message;
  } else {
    code = warning.code;
    if (warning.code === "flat-name-collision") {
      typeName = warning.flatName ?? "";
    } else {
      typeName = warning.templateName ?? "";
    }
  }

  return {
    code,
    line: 0,
    column: 0,
    typeName,
  };
}

function collectNamespaceNames(unit: { members: TopLevelMember[] }): Set<string> {
  const names = new Set<string>();
  for (const member of unit.members) {
    if (member.kind === "NamespaceDeclaration") {
      names.add(member.name.toLowerCase());
    }
  }
  return names;
}

export class SugarTranspiler {
  public static transpile(code: string, ctx: TranspileContext): TranspileResult {
    const sugarEngine = new SugarEngine(ctx.sugarOptions);
    const genericsEnabled = ctx.genericsEnabled !== false;
    const eol = code.includes("\r\n") ? "\r\n" : "\n";
    let lines = code.split(/\r?\n/);

    // 1. Pre-process lines with text pre-passes
    if (sugarEngine.isEnabled("numeric-separator")) {
      lines = lines.map(removeNumericSeparators);
    }
    lines = lines.map(normalizeMetaProgrammingSyntax);
    const processedCode = lines.join(eol);

    // 2. Parse to AST (Check if has structural definitions first)
    const plugins = [...sugarEngine.createParserPlugins(), new GenericsParserPlugin()];
    const tempParse = parseBasic(processedCode, {
      plugins,
      preserveLine: sugarEngine.createDisabledSyntaxLinePreserver(),
    });
    const hasDisabledEnumSugarBlock =
      !sugarEngine.isEnabled("enum") &&
      lines.some((line) =>
        /^\s*(?:(?:public|private|protected|shared|overrides|override|static|readonly)\s+)*enun\s+\w+\b/i.test(
          line,
        ),
      );
    const hasStructural =
      hasDisabledEnumSugarBlock ||
      tempParse.unit.members.some(
        (m) =>
          m.kind === "NamespaceDeclaration" ||
          m.kind === "ClassDeclaration" ||
          m.kind === "MethodDeclaration" ||
          m.kind === "DelegateDeclaration" ||
          m.kind === "EnumDeclaration",
      );

    let finalUnit = tempParse.unit;
    let wrapped = false;

    if (!hasStructural) {
      wrapped = true;
      const wrappedCode = `Sub __syntheticMethod()${eol}${processedCode}${eol}End Sub`;
      finalUnit = parseBasic(wrappedCode, {
        plugins,
        preserveLine: sugarEngine.createDisabledSyntaxLinePreserver(),
      }).unit;
    }

    // 3. Run generic monomorphization only when the optional language feature
    // is enabled. The parser plugin stays active so disabled generics retain
    // their original AST representation and serialize without partial loss.
    let genericsWarnings: readonly MonomorphizationWarning[] = [];
    if (genericsEnabled) {
      _injectImportsForMaterializedGenericInstantiations(finalUnit, ctx);
      const monomorphizer = new GenericsMonomorphizer({
        isTypeDescendantOf: ctx.isTypeDescendantOf?.bind(ctx),
        externalTemplates: ctx.externalGenericTemplates,
        requestedInstantiations: ctx.requestedGenericInstantiations,
      });
      genericsWarnings = monomorphizer.monomorphize(finalUnit).warnings;
    }

    // 4. Transform AST-to-AST for sugars
    const declaredNamespaces = collectNamespaceNames(finalUnit);
    const rewritePrintToLogger =
      ctx.rewritePrintToLogger !== false &&
      sugarEngine.getEnabledSugarIdsInPrecedenceOrder().includes("logger-print") &&
      !declaredNamespaces.has("mod_logger");
    const transformer = new ASTSugarTransformer(ctx, sugarEngine);
    transformer.walk(finalUnit);
    const finalSugarTransformers = sugarEngine
      .getEnabledSugarIdsInPrecedenceOrder()
      .filter((id) => id === "logger-print");
    for (const _ of finalSugarTransformers) {
      if (rewritePrintToLogger) {
        const loggerPrintTransformer = new LoggerPrintSugarTransformer();
        loggerPrintTransformer.transform(finalUnit);
        for (const usedSugar of loggerPrintTransformer.usedSugars) {
          transformer.usedSugars.add(usedSugar);
        }
      }
    }
    if (genericsEnabled) {
      _injectImportsForMaterializedGenericInstantiations(finalUnit, ctx);
    }

    // 5. Serialize AST back to code text, generating the lineMap!
    let serializeResult = serializeUnitWithMap(finalUnit, { eol, omitPublicFieldModifiers: true });

    if (wrapped) {
      // Strip Sub __syntheticMethod() and End Sub
      const outputLines = serializeResult.code.split(/\r?\n/);
      const syntheticStartIdx = outputLines.findIndex((line) =>
        /^\s*Sub\s+__syntheticMethod\b/i.test(line),
      );
      const syntheticEndIdx =
        syntheticStartIdx >= 0
          ? outputLines.findIndex(
              (line, idx) => idx > syntheticStartIdx && /^\s*End\s+Sub\s*$/i.test(line),
            )
          : -1;
      if (syntheticStartIdx >= 0 && syntheticEndIdx > syntheticStartIdx) {
        const firstLine = lines.find((l) => l.trim().length > 0) ?? "";
        const matchIndent = /^\s*/.exec(firstLine);
        const originalIndent = matchIndent ? matchIndent[0] : "";

        const prefixLines = outputLines.slice(0, syntheticStartIdx);
        const bodyLines = outputLines.slice(syntheticStartIdx + 1, syntheticEndIdx);
        const unindented = bodyLines.map((line) => {
          let cleanLine = line;
          if (line.startsWith("   ")) {
            cleanLine = line.slice(3);
          }
          return originalIndent + cleanLine;
        });
        serializeResult = {
          code: [...prefixLines, ...unindented].join(eol),
          lineMap: [
            ...serializeResult.lineMap.slice(0, syntheticStartIdx),
            ...serializeResult.lineMap
              .slice(syntheticStartIdx + 1, syntheticEndIdx)
              .map((x) => x - 1),
          ],
        };
      }
      transformer.diagnostics = transformer.diagnostics.map((diag) => ({
        ...diag,
        line: diag.line - 1,
      }));
    }

    // 6. Merge diagnostics
    const diagnostics: SugarDiagnostic[] = [];
    for (const warning of genericsWarnings) {
      diagnostics.push(mapGenericsWarning(warning));
    }
    diagnostics.push(...transformer.diagnostics);

    return {
      code: serializeResult.code,
      diagnostics,
      lineMap: serializeResult.lineMap,
      usedSugars: transformer.usedSugars,
    };
  }
}

function _injectImportsForMaterializedGenericInstantiations(
  finalUnit: CompilationUnit,
  ctx: TranspileContext,
): void {
  const externalTemplateNames = new Set(
    (ctx.externalGenericTemplates ?? []).map((template) => template.name.toLowerCase()),
  );

  // 1. Collect all generic template names used in this file.
  const collector = new (class extends ASTWalker {
    public readonly templateNames = new Set<string>();

    protected override visitTypeReference(node: TypeReference): void {
      if (!node.name) return;
      if (node.typeArguments.length > 0 && externalTemplateNames.has(node.name.toLowerCase())) {
        this.templateNames.add(node.name);
        this.templateNames.add(flatNameOf(node));
        return;
      }
      if (isMaterializedExternalGenericName(node.name, externalTemplateNames)) {
        this.templateNames.add(node.name);
      }
    }

    protected override visitMethodInvocation(node: MethodInvocation): void {
      if (
        node.typeArguments.length > 0 &&
        node.methodName &&
        externalTemplateNames.has(node.methodName.toLowerCase())
      ) {
        this.templateNames.add(node.methodName);
      }
    }

    protected override visitOpaqueStatement(node: OpaqueStatement): void {
      for (const candidate of collectMaterializedGenericCandidates(
        node.text,
        externalTemplateNames,
      )) {
        this.templateNames.add(candidate);
      }
    }
  })();

  collector.walk(finalUnit);

  if (collector.templateNames.size === 0) return;

  // 2. Identify already declared namespaces and existing imports.
  const declaredNamespaces = new Set<string>();
  const existingImports = new Set<string>();

  for (const member of finalUnit.members) {
    if (member.kind === "NamespaceDeclaration") {
      declaredNamespaces.add(member.name.toLowerCase());
    } else if (member.kind === "ImportsDeclaration") {
      existingImports.add(member.target.toLowerCase());
    }
  }

  // 3. For each generic template, resolve its namespace and inject if not already present.
  const namespacesToImport = new Set<string>();
  for (const templateName of collector.templateNames) {
    const ns = ctx.resolveTypeImport?.(templateName);
    if (ns) {
      const nsLower = ns.toLowerCase();
      if (!declaredNamespaces.has(nsLower) && !existingImports.has(nsLower)) {
        namespacesToImport.add(ns);
      }
    }
  }

  // 4. Inject new ImportsDeclaration nodes.
  for (const ns of namespacesToImport) {
    let insertIdx = 0;
    for (let i = 0; i < finalUnit.members.length; i++) {
      const member = finalUnit.members[i];
      if (member?.kind === "ImportsDeclaration") {
        insertIdx = i + 1;
      }
    }
    finalUnit.members.splice(insertIdx, 0, {
      kind: "ImportsDeclaration",
      target: ns,
      loc: finalUnit.loc,
    });
    // Track as existing import to avoid duplicates if multiple templates map to same namespace
    existingImports.add(ns.toLowerCase());
  }
}

function collectMaterializedGenericCandidates(
  text: string,
  externalTemplateNames: ReadonlySet<string>,
): Set<string> {
  const candidates = new Set<string>();

  for (const match of text.matchAll(/\b([a-zA-Z_][a-zA-Z_0-9]*)\s*</g)) {
    const name = match[1];
    if (name && externalTemplateNames.has(name.toLowerCase())) {
      candidates.add(name);
    }
  }

  for (const templateName of externalTemplateNames) {
    const pattern = new RegExp(
      `\\b(${escapeRegExp(templateName)}_[a-zA-Z_][a-zA-Z_0-9]*)\\b`,
      "gi",
    );
    for (const match of text.matchAll(pattern)) {
      const name = match[1];
      if (name) {
        candidates.add(name);
      }
    }
  }

  return candidates;
}

function isMaterializedExternalGenericName(
  typeName: string,
  externalTemplateNames: ReadonlySet<string>,
): boolean {
  const lower = typeName.toLowerCase();
  for (const templateName of externalTemplateNames) {
    if (lower.startsWith(`${templateName}_`)) {
      return true;
    }
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
