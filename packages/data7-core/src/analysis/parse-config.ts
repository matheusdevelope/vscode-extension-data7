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
