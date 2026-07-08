import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  type Data7Configuration,
  type DiagnosticSeverityOverride,
  EXTENSION_SETTINGS_FILENAME,
  createExtensionSettingsFile,
  installExtensionSettingsProvider,
  logger,
  migrateLegacyVscodeConfiguration,
  normalizeExtensionSettings,
  parseExtensionSettingsFile,
} from "@data7/core";

type SettingsChangeListener = () => void;

/**
 * Owns the extension configuration file under `globalStorageUri`.
 * Replaces VS Code `settings.json` for all `data7.*` options.
 */
export class ExtensionSettingsService {
  private static context: vscode.ExtensionContext | undefined;
  private static snapshot: Data7Configuration | undefined;
  private static readonly listeners = new Set<SettingsChangeListener>();

  public static initialize(context: vscode.ExtensionContext): void {
    ExtensionSettingsService.context = context;
    ExtensionSettingsService.loadFromDiskSync();
    installExtensionSettingsProvider(() => ExtensionSettingsService.getSnapshot());
    context.subscriptions.push({
      dispose: () => {
        ExtensionSettingsService.context = undefined;
        ExtensionSettingsService.snapshot = undefined;
      },
    });
  }

  public static getSnapshot(): Data7Configuration {
    return ExtensionSettingsService.snapshot ?? normalizeExtensionSettings(undefined);
  }

  public static getSettingsFilePath(): string | undefined {
    return ExtensionSettingsService.context
      ? path.join(
          ExtensionSettingsService.context.globalStorageUri.fsPath,
          EXTENSION_SETTINGS_FILENAME,
        )
      : undefined;
  }

  public static onDidChange(listener: SettingsChangeListener): vscode.Disposable {
    ExtensionSettingsService.listeners.add(listener);
    return new vscode.Disposable(() => ExtensionSettingsService.listeners.delete(listener));
  }

  public static async update(partial: Partial<Data7Configuration>): Promise<Data7Configuration> {
    const current = ExtensionSettingsService.getSnapshot();
    const next = normalizeExtensionSettings({
      ...current,
      ...partial,
      features: partial.features
        ? {
            ...current.features,
            ...partial.features,
            language: { ...current.features.language, ...partial.features.language },
            diagnostics: { ...current.features.diagnostics, ...partial.features.diagnostics },
            workspace: { ...current.features.workspace, ...partial.features.workspace },
            save: { ...current.features.save, ...partial.features.save },
            build: { ...current.features.build, ...partial.features.build },
            preview: { ...current.features.preview, ...partial.features.preview },
          }
        : current.features,
      sugars: partial.sugars ? { ...current.sugars, ...partial.sugars } : current.sugars,
      diagnosticSeverity: partial.diagnosticSeverity ?? current.diagnosticSeverity,
      exclude: partial.exclude ?? current.exclude,
    });
    await ExtensionSettingsService.persist(next);
    return next;
  }

  public static async updateField<K extends keyof Data7Configuration>(
    key: K,
    value: Data7Configuration[K],
  ): Promise<void> {
    await ExtensionSettingsService.update({ [key]: value } as Partial<Data7Configuration>);
  }

  public static async replaceAll(settings: Data7Configuration): Promise<void> {
    await ExtensionSettingsService.persist(normalizeExtensionSettings(settings));
  }

  public static async removeLegacyExcludePattern(pattern: string): Promise<void> {
    const exclude = ExtensionSettingsService.getSnapshot().exclude.filter(
      (item) => item !== pattern,
    );
    await ExtensionSettingsService.updateField("exclude", exclude);
  }

  private static loadFromDiskSync(): void {
    const filePath = ExtensionSettingsService.getSettingsFilePath();
    if (!filePath) {
      ExtensionSettingsService.snapshot = normalizeExtensionSettings(undefined);
      return;
    }

    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    } catch {
      // ignore
    }

    if (!fs.existsSync(filePath)) {
      const migrated = ExtensionSettingsService.migrateFromLegacyVscodeSettings();
      ExtensionSettingsService.snapshot = migrated;
      try {
        const payload = createExtensionSettingsFile(migrated);
        fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
      } catch (err: unknown) {
        logger.error("Falha ao criar extension-settings.json.", err);
      }
      return;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
      ExtensionSettingsService.snapshot = parseExtensionSettingsFile(raw).settings;
    } catch (err: unknown) {
      logger.error("Falha ao ler extension-settings.json; usando padrões.", err);
      ExtensionSettingsService.snapshot = normalizeExtensionSettings(undefined);
    }
  }

  private static migrateFromLegacyVscodeSettings(): Data7Configuration {
    const cfg = vscode.workspace.getConfiguration("data7");
    return migrateLegacyVscodeConfiguration({
      executorPath: cfg.get<string>("executorPath"),
      sharedModulesPath: cfg.get<string>("sharedModulesPath"),
      userName: cfg.get<string>("userName"),
      companyCode: cfg.get<number>("companyCode"),
      branchCode: cfg.get<number>("branchCode"),
      databaseConnectionId: cfg.get<string>("databaseConnectionId"),
      exclude: cfg.get<string[]>("exclude"),
      diagnosticSeverity: cfg.get<Record<string, DiagnosticSeverityOverride>>("diagnosticSeverity"),
      features: cfg.get<Data7Configuration["features"]>("features"),
      sugars: cfg.get<Data7Configuration["sugars"]>("sugars"),
      autoFormatOnSave: cfg.get<boolean>("autoFormatOnSave") ?? false,
    });
  }

  private static async persist(
    settings: Data7Configuration,
    filePath = ExtensionSettingsService.getSettingsFilePath(),
  ): Promise<void> {
    if (!filePath) return;
    ExtensionSettingsService.snapshot = settings;
    const payload = createExtensionSettingsFile(settings);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    for (const listener of ExtensionSettingsService.listeners) {
      listener();
    }
  }
}
