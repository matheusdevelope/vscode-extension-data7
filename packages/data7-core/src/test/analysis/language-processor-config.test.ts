import assert from "node:assert/strict";
import { describe, test, beforeEach, afterEach } from "node:test";
import { LanguageProcessor } from "../../analysis/language-processor";
import { computeParseConfigSignature } from "../../analysis/parse-config";
import {
  clearExtensionSettingsProviderForTests,
  installExtensionSettingsProvider,
  type Data7Configuration,
} from "../../infra/configuration";
import { DEFAULT_EXTENSION_SETTINGS } from "../../infra/extension-settings";

/**
 * A configuration change used to wipe every cached AST in the workspace, so
 * flipping a severity re-parsed the whole project. Only settings that change
 * parser output may cost a re-parse.
 */
describe("LanguageProcessor configuration invalidation", () => {
  const uri = "file:///proj/ConfigSample.bas";
  const source = ["Namespace Demo", "  Class Foo", "  End Class", "End Namespace"].join("\n");

  let active: Data7Configuration = DEFAULT_EXTENSION_SETTINGS;

  const setConfiguration = (next: Data7Configuration): void => {
    active = next;
  };

  beforeEach(() => {
    active = DEFAULT_EXTENSION_SETTINGS;
    installExtensionSettingsProvider(() => active);
    LanguageProcessor.getInstance().clearCache();
    // Establish the signature baseline for the freshly installed provider.
    LanguageProcessor.getInstance().handleConfigurationChanged();
  });

  afterEach(() => {
    clearExtensionSettingsProviderForTests();
    LanguageProcessor.getInstance().clearCache();
  });

  test("keeps cached ASTs when a non-parsing setting changes", () => {
    const processor = LanguageProcessor.getInstance();
    const first = processor.getOrParse(uri, source);

    setConfiguration({
      ...DEFAULT_EXTENSION_SETTINGS,
      diagnosticSeverity: { "unused-import": "error" },
    });
    processor.handleConfigurationChanged();

    const second = processor.getOrParse(uri, source);
    assert.equal(second.unit, first.unit, "a severity override must not invalidate the AST cache");
  });

  test("drops cached ASTs when a parsing setting changes", () => {
    const processor = LanguageProcessor.getInstance();
    const first = processor.getOrParse(uri, source);

    setConfiguration({
      ...DEFAULT_EXTENSION_SETTINGS,
      features: {
        ...DEFAULT_EXTENSION_SETTINGS.features,
        language: { ...DEFAULT_EXTENSION_SETTINGS.features.language, generics: false },
      },
    });
    processor.handleConfigurationChanged();

    const second = processor.getOrParse(uri, source);
    assert.notEqual(second.unit, first.unit, "disabling generics must force a re-parse");
  });

  /**
   * The cache probe used to compare two full documents, so every hover and
   * completion paid a string comparison the size of the file (§4.7).
   */
  test("a matching buffer version is a cache hit without comparing content", () => {
    const processor = LanguageProcessor.getInstance();
    const first = processor.getOrParse(uri, source, 7);

    // Same version, different text: the buffer version is authoritative, so the
    // cached parse is returned untouched.
    const second = processor.getOrParse(uri, `${source}\n' outro`, 7);
    assert.equal(second, first);

    const third = processor.getOrParse(uri, `${source}\n' outro`, 8);
    assert.notEqual(third, first, "a new version must re-parse");
  });

  test("versionless callers still hit the cache through the content hash", () => {
    const processor = LanguageProcessor.getInstance();
    const first = processor.getOrParse(uri, source);

    assert.equal(processor.getOrParse(uri, source), first, "same content must not re-parse");
    assert.notEqual(processor.getOrParse(uri, `${source}\n' novo`), first);
  });

  test("signature reacts to sugar toggles and ignores unrelated settings", () => {
    const baseline = computeParseConfigSignature();

    setConfiguration({ ...DEFAULT_EXTENSION_SETTINGS, userName: "someone-else" });
    assert.equal(computeParseConfigSignature(), baseline);

    setConfiguration({
      ...DEFAULT_EXTENSION_SETTINGS,
      sugars: { ...DEFAULT_EXTENSION_SETTINGS.sugars, enabled: false },
    });
    assert.notEqual(computeParseConfigSignature(), baseline);
  });
});
