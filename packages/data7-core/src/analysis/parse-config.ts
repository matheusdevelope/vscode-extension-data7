import { readConfiguration } from "../infra/configuration";
import { GenericsParserPlugin, type ParseOptions } from "../project/parser";
import { SugarEngine } from "../project/sugars";

/**
 * Builds the same parse options used by LanguageProcessor, the symbol indexer,
 * and AnalysisProgram so cold index and live IDE paths stay semantically aligned.
 */
export function createConfiguredParseOptions(): ParseOptions {
  const configuration = readConfiguration();
  const sugarConfig = configuration.sugars;
  const sugarEngine = new SugarEngine({
    enabled: configuration.features.language.sugars && sugarConfig.enabled,
    enabledSugarIds: sugarConfig.enabledIds,
    disabledSugarIds: sugarConfig.disabledIds,
  });
  return {
    plugins: [
      ...sugarEngine.createParserPlugins(),
      ...(configuration.features.language.generics ? [new GenericsParserPlugin()] : []),
    ],
    preserveLine: sugarEngine.createDisabledSyntaxLinePreserver(),
  };
}

/**
 * Signature of the settings that change parser output. Consumers compare it
 * across configuration changes to decide whether cached ASTs are still valid:
 * severity overrides or excludes must not cost a full re-parse of the workspace.
 */
export function computeParseConfigSignature(): string {
  const configuration = readConfiguration();
  const sugarConfig = configuration.sugars;
  return [
    configuration.features.language.sugars ? "1" : "0",
    configuration.features.language.generics ? "1" : "0",
    sugarConfig.enabled ? "1" : "0",
    [...sugarConfig.enabledIds].sort().join(","),
    [...sugarConfig.disabledIds].sort().join(","),
  ].join("|");
}
