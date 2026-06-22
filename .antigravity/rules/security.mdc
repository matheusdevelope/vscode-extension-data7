---
description: "Stack-specific security rules for the Data7 VS Code extension"
globs: ["src/**/*.ts"]
alwaysApply: true
---

# Security Best Practices

- This is a stack-specific rule file. It targets the threats that actually matter for a VS Code extension that parses untrusted source files, drives a local executor, and manages a private modules repository on disk. There is no server, no auth, no network endpoint here.

## Workspace Trust

- Treat opened workspaces as untrusted by default. Declare the appropriate `capabilities.untrustedWorkspaces` policy in `package.json` when adding features that execute user-controlled paths or shell commands.
- Features that spawn the Data7 Executor (`data7.runProject`), import shared modules from arbitrary disk paths, or write to the private repository must check `vscode.workspace.isTrusted` and surface a clear message when the workspace is not trusted, instead of failing silently.

## Untrusted input: `.bas` and `.7proj`

- Treat every `.bas` source file, every `.7proj` XML, and every byte read from `data7.sharedModulesPath` as untrusted input. Do not assume well-formedness.
- Configure the shared `fast-xml-parser` helpers with safe defaults: no entity expansion, bounded depth, and explicit allow-listed element names. Centralize those options so they cannot be silently weakened in one call site.
- Validate parsed XML shapes before consuming them: missing nodes, unexpected element names, and oversized arrays must surface as a clear extension error, not as a runtime `TypeError`.
- The linter, indexer, and formatter must be resilient to malformed input. A parser error must produce a diagnostic or be logged to the output channel, never crash the extension host.

## File-system and path handling

- Always resolve paths relative to the active workspace folder (`vscode.workspace.getWorkspaceFolder(uri)`) or relative to the extension's owned storage (`context.globalStorageUri`). Never trust raw strings coming from `.bas` files, `.7proj` contents, or `data7.*` settings as absolute paths without normalization.
- When writing to the private modules repository, validate the resolved target path stays inside the repository root to prevent path traversal (`..` segments resolved outside the root must be rejected).
- Do not mix synchronous and asynchronous file APIs in the same flow. The general API choice (`vscode.workspace.fs` for workspace I/O, `node:fs/promises` elsewhere) is in `vscode_extension.mdc`.

## Child processes

- Spawning the Data7 Executor must use `node:child_process` with an explicit argument array (`spawn(executable, [args...])`), never an interpolated shell string. This prevents argument injection from `data7.executorPath`, `databaseConnectionId`, or other user-controlled settings.
- Resolve `data7.executorPath` to a normalized absolute path and confirm the binary exists before spawning. Surface a clear error to the user when it does not.
- Forward only the arguments the executor actually needs. Do not pass the user environment wholesale; pass a curated `env` object.
- Capture `stdout` and `stderr` into the extension's `OutputChannel`; never write them to a user-facing notification or log them with sensitive context attached.

## Secrets and configuration

- Do not invent secret-bearing settings inside `package.json#contributes.configuration`. Anything that resembles a credential (passwords, tokens, API keys) must go through `vscode.SecretStorage` (`context.secrets`) and never through `workspace.getConfiguration`.
- Never log the contents of `data7.executorPath`, `data7.databaseConnectionId`, or any future secret-bearing setting at info level. Log only the fact that the operation ran and an opaque identifier when needed.
- Never embed credentials, tokens, or absolute machine-specific paths in tests, examples, or fixtures committed to the repository.

## Errors and user-facing messages

- User-facing error messages must be generic ("Falha ao compilar o projeto Data7."); detailed stack traces and raw parser output belong in the output channel, behind a log level the user can opt into.

## Repository and module imports

- Importing a shared module into the private repository (`RepositoryService`) must validate the source path, verify it is a `.bas` or `.7proj` file, and refuse to copy files outside the workspace or outside the configured `data7.sharedModulesPath` without explicit user confirmation.
- Bulk import operations must report progress and remain cancellable via the `vscode.CancellationToken` provided by `withProgress`.
