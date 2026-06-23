import { SugarEngine } from "./sugars";
import { GenericsMonomorphizer, type MonomorphizationWarning } from "./generics";
import { GenericsParserPlugin, parseBasic, serializeUnitWithMap } from "./parser";
import type { TopLevelMember } from "./ast/ast";
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
    const preserveLine = sugarEngine.createDisabledSyntaxLinePreserver();
    const tempParse = parseBasic(processedCode, { plugins, preserveLine });
    const hasStructural = tempParse.unit.members.some(
      (m) =>
        m.kind === "NamespaceDeclaration" ||
        m.kind === "ClassDeclaration" ||
        m.kind === "MethodDeclaration" ||
        m.kind === "DelegateDeclaration" ||
        m.kind === "EnumDeclaration",
    );

    let finalUnit = tempParse.unit;
    let transformerLines = lines;
    let wrapped = false;

    if (!hasStructural) {
      wrapped = true;
      const wrappedCode = `Sub __syntheticMethod()${eol}${processedCode}${eol}End Sub`;
      finalUnit = parseBasic(wrappedCode, { plugins, preserveLine }).unit;
      transformerLines = [`Sub __syntheticMethod()`, ...lines, `End Sub`];
    }

    // 3. Run generics monomorphizer directly on the AST
    const monomorphizer = new GenericsMonomorphizer({
      isTypeDescendantOf: ctx.isTypeDescendantOf?.bind(ctx),
      externalTemplates: ctx.externalGenericTemplates,
      requestedInstantiations: ctx.requestedGenericInstantiations,
    });
    const genericsResult = monomorphizer.monomorphize(finalUnit);
    // _injectImportsForMaterializedGenericInstantiations(finalUnit, ctx);

    // 4. Transform AST-to-AST for sugars
    const declaredNamespaces = collectNamespaceNames(finalUnit);
    const rewritePrintToLogger =
      ctx.rewritePrintToLogger !== false &&
      sugarEngine.getEnabledSugarIdsInPrecedenceOrder().includes("logger-print") &&
      !declaredNamespaces.has("mod_logger");
    const transformer = new ASTSugarTransformer(ctx, transformerLines, sugarEngine);
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
    for (const warning of genericsResult.warnings) {
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
