---
description: "VS Code Extension API conventions: commands, providers, disposables, configuration, UI"
globs: ["src/extension.ts", "src/providers/**/*.ts", "src/services/**/*.ts"]
alwaysApply: true
---

# VS Code Extension Conventions

- This is a stack-specific rule file for the VS Code Extension API surface used by this extension.

## Activation, commands, and contributions

- Every command callback must match a `contributes.commands` entry in `package.json` and use the same `data7.<verb>` identifier. Do not register commands that are not declared in the manifest.
- Register commands and providers exactly once, in `extension.ts` (or in a registration helper invoked from it). Pass `vscode.ExtensionContext` explicitly instead of stashing it in a module-level variable.
- Keep `activate` synchronous when possible; if it must be `async`, await only the minimum needed for activation, and defer heavy work (initial workspace indexing, repository scans) to background tasks driven by `vscode.window.withProgress` or workspace events.
- Prefer fine-grained `activationEvents` (`onLanguage:d7basic`, `onLanguage:data7project`, `workspaceContains:**/*.7proj`, `onCommand:data7.*`) over `*`. Do not add `onStartupFinished` unless a feature genuinely requires it.

## Providers and language features

- One provider class per VS Code language feature (`CompletionItemProvider`, `HoverProvider`, `SignatureHelpProvider`, `DefinitionProvider`, `CodeActionProvider`, `DocumentFormattingEditProvider`). All providers live in `src/providers/`. Keep the file named after the feature (`providers/completion-provider.ts`, `providers/hover-provider.ts`, etc.).
- Register providers with the documented language selectors (`d7basic`, `data7project`). Avoid `{ scheme: "file", language: "..." }` selectors that silently drop untitled or virtual documents unless that is the intended behavior.
- Provider methods (`provideCompletionItems`, `provideHover`, …) must honor the `vscode.CancellationToken`. Bail out (`return undefined`) when the token is cancelled instead of finishing expensive work.
- Use the VS Code-typed result shapes (`vscode.CompletionItem`, `vscode.Hover`, `vscode.SignatureHelp`, `vscode.CodeAction`, `vscode.TextEdit`) at the provider boundary. Internal helpers may use plain data structures, but conversion happens inside the provider, not in shared services.
- `providers/code-actions.ts` must reuse the diagnostic codes produced by `diagnostics/diagnostics.ts` (e.g. `missing-import`) — importing them from `diagnostics/diagnostic-codes.ts` — and offer fixes by matching those codes. Do not re-derive the diagnostic condition inside the code action.

## Diagnostics

- Create a single `vscode.DiagnosticCollection` per language (e.g. `"d7basic"`) owned by the extension. Push it into `context.subscriptions` so it is disposed on deactivation.
- Diagnostics emitted by the linter must carry a stable string `code` so code actions, tests, and external tooling can target them. Avoid free-form messages as the only identifier.
- Clear diagnostics for a `Uri` when a document is closed (`onDidCloseTextDocument`) and when a `.bas` file is deleted from the workspace.

## Configuration

- All settings consumed by the extension must be declared in `package.json#contributes.configuration` under the `data7.*` namespace. Read them through `vscode.workspace.getConfiguration("data7")`.
- Centralize configuration access in the single typed helper module `src/infra/configuration.ts` that mirrors the manifest keys (`executorPath`, `sharedModulesPath`, `userCode`, `companyCode`, `branchCode`, `databaseConnectionId`, `enableAutoSync`). When a setting is renamed, only that helper changes.
- React to live changes with `vscode.workspace.onDidChangeConfiguration` when the setting affects already-running state (watchers, executor wiring). Do not require the user to reload.

## Disposables and resource ownership

- Every value with a `dispose` method (event subscriptions, watchers, diagnostic collections, output channels, status bar items, terminals, language registrations) must be pushed into `context.subscriptions` or be owned by a service that disposes it in its own `dispose` method.
- A service that owns a `FileSystemWatcher` (`SyncWatcher`, repository watcher) must expose a `dispose` method and be registered as a subscription, not left as a module-level singleton.
- Implement `deactivate()` only when there is explicit teardown work that VS Code's subscription disposal cannot cover.

## UI, output, and logging

- The single shared `vscode.OutputChannel` (`"Data7"`) lives in `src/infra/logger.ts` and is consumed by every other module via `import { logger } from "../infra/logger"` (or `./infra/logger` from `extension.ts`). Do not use `console.log` outside of tests.
- User-facing notifications: prefer `withProgress` for multi-step operations (build, decompile, repository imports), `showInformationMessage` for completed actions, `showWarningMessage` for recoverable issues, and `showErrorMessage` only for actual failures the user must see.
- Long-running tasks must report progress and respect cancellation tokens supplied by `withProgress`.

## Workspace I/O

- Prefer `vscode.workspace.fs` and `vscode.Uri` for files inside the open workspace; this respects virtual file systems and remote workspaces.
- Reserve `node:fs` and `node:path` for paths outside the workspace (the private modules repository, executor binaries, temporary build artifacts) or for performance-critical bulk I/O during indexing.
- Always resolve workspace paths through `vscode.workspace.workspaceFolders` (or `vscode.workspace.getWorkspaceFolder(uri)`) instead of trusting the current working directory.

## Testing

- Keep providers, services, and the linter independently constructible (dependency-injected) so they can be unit-tested without an activated extension host.
- Use the `vscode` mock registered in `src/test/setup.ts` for tests that touch the API. Do not load the real `vscode` module in `node:test` runs.
