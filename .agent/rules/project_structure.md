---
description: "Project-specific folder structure conventions for the Data7 VS Code extension"
globs: ["src/**/*.ts"]
alwaysApply: true
---

# Project Structure

- This is a project-specific rule file. It defines where code lives in this repository.
- All TypeScript source lives under `src/` and is compiled to `out/` via `tsc -p ./` (see `package.json#scripts.compile`). The compiled `out/` directory must not be committed.
- The extension entry point declared in `package.json#main` is `./out/extension.js`; the source file is `src/extension.ts`. It is the single activation entry point and the only file that wires commands, providers, and disposables (see `vscode_extension.mdc` for the registration rules).

## Top-level `src/` layout

The repository is organized by **VS Code capability** (Pattern B, mirroring `microsoft/vscode-python`) with a domain slice for project tooling (Pattern C, mirroring `microsoft/vscode-pull-request-github`). It is **not** organized by DDD layers.

- `src/extension.ts` — activation, command registration, provider registration, disposable wiring. The only file allowed at the root of `src/`.
- `src/providers/` — one file per VS Code language feature provider. Includes all 11 `*-provider.ts`, `formatter.ts` (`DocumentFormattingEditProvider`) and `code-actions.ts` (`CodeActionProvider`).
- `src/analysis/` — pure (no `vscode` registration) static analysis modules shared by providers and the linter: `symbol-indexer.ts` (parsing + workspace indexing), `dependency-scanner.ts` (Imports detection and comment stripping), `type-resolver.ts` (scope and type resolution).
- `src/diagnostics/` — the language linter and the canonical diagnostic-code table: `diagnostics.ts` (`DiagnosticsLinter`), `diagnostic-codes.ts` (`DiagnosticCodes` + typed payloads).
- `src/project/` — project-format tooling: `builder.ts` (compile `.bas` tree into `.7proj`), `decompiler.ts` (expand `.7proj` into a `.bas` tree), `project-metadata.ts` (shared TypeScript shapes for `data7.json` and `.7proj` virtual folders).
- `src/infra/` — leaf infrastructure: `logger.ts` (single `OutputChannel`) and `configuration.ts` (typed `data7.*` settings snapshot).
- `src/services/` — long-lived collaborators that orchestrate analysis, diagnostics and project tooling: `project-service.ts`, `sync-watcher.ts`, `repository-service.ts`, `dependency-service.ts`, `diagnostic-service.ts`, `activation-service.ts`, `build-service.ts`, `docs-service.ts`, `docs-generator.ts`. Each file should expose one focused class or namespace.
- `src/system-library/` — native ERP symbol definitions (`Forms/`, `SQL/`, `Drawing/`, `IO/`, `Collections/`, `System.Classes/`, `Environment/`, `XML/`, `Globals/`, `Primitives/`, `Data7/`, `System/`). The aggregate `src/system-library/index.ts` re-exports the catalog; `src/system-library/types.ts` is the single source of truth for the `SystemContainer` union; `src/system-library/symbol-helpers.ts` owns the boilerplate helpers (`buildClassSymbols`, `buildNamespaceSymbols`, `SYSTEM_RANGE`, `SYSTEM_URI`).
- `src/utils/` — small pure helpers reused across folders (XML, GUID, path-safety, debounce, regex, symbol-kind mapping, formatter helpers, code stripping). Must not depend on any other `src/` folder.
- `src/test/` — automated tests run by `node --test`. Test layout mirrors the source layout (`test/providers/`, `test/services/`, `test/system-library/`, `test/util/`). Fixtures and the `vscode` mock are owned by `testing.mdc`.

## Placement rules

- Add new language features (e.g. rename, references, document symbols) as a new `*-provider.ts` file inside `src/providers/`, registered in `src/extension.ts`. Do not nest providers inside `services/` or `system-library/`.
- Add new parsers, indexers or resolvers under `src/analysis/<name>.ts` when the module has no `vscode` registration side-effect and is consumed by both providers and the linter.
- Add new diagnostic rules to `src/diagnostics/diagnostics.ts`; add the corresponding stable code to `src/diagnostics/diagnostic-codes.ts` before any other consumer references it.
- Add new project-format helpers (builder/decompiler/`.7proj` consumers) under `src/project/`.
- Add new long-lived services or workspace-aware state holders under `src/services/<name>-service.ts` with a single exported class.
- Add new native ERP symbols under the appropriate `src/system-library/<Container>/<Symbol>.ts` and re-export them through the container's index file (e.g. `Forms/Forms.ts`). Update `src/system-library/types.ts` if a new container is introduced.
- Add new pure helpers (no `vscode` import and no other `src/` import beyond `analysis/symbol-indexer` type imports) under `src/utils/<name>.ts`.
- Do not introduce parallel layered folders such as `domain/`, `application/`, `presentation/`, or `infrastructure/`. The folders above already cover the capability surface of a VS Code extension; new files must fit into one of them.

## Files outside `src/`

- Language grammars and configuration: `syntaxes/` and `language-configuration.json` at the repository root. Their paths are referenced from `package.json#contributes`.
- Built JavaScript output: `out/` (generated).
- Project context and design notes: `project_context.md` at the repository root is the single conceptual source of truth — update it instead of forking new documentation files (see `coding_standards.mdc` for the documentation policy).
- `docs/exemple/` — canonical Data7 Basic examples, versioned to double as human reference and as test fixtures. Layout is feature-oriented:
  - `docs/exemple/sugar/<sugar-name>/` — one file per scenario of a sugar transpiled by `src/project/transpiler.ts` (e.g. `for-each/01-stringlist-explicit-type.bas`). Pair with `_expected/<scenario>.bas` when the file documents the native expansion.
  - `docs/exemple/diagnostics/<code>/` — one file per `DiagnosticCode` (`missing-import/`, `not-enumerable/`, …). Each folder contains the trigger `.bas` plus optional `after-quickfix.bas` when a Code Action exists.
  - `docs/exemple/builder/<scenario>/` — full mini-projects (`data7.json` + `src/Principal.bas`) demonstrating build/decompile flows.
  - Every `.bas` opens with a header comment block of `' @example`, `' @demonstrates`, `' @diagnostics`, and optionally `' @transpiled-to`, `' @requires`. The exact contract lives in `docs/exemple/README.md`.
  - Examples are excluded from the published `.vsix` via `.vscodeignore` (the folder ships only with the repository, not the marketplace package).
