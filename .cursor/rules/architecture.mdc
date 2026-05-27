---
description: "Project-specific architecture rules for the Data7 VS Code extension"
globs: ["src/**/*.ts"]
alwaysApply: true
---

# Extension Architecture

- This is a project-specific rule file. It defines runtime flow and dependency direction only. Module placement lives in `project_structure.mdc`; cross-module import boundaries are enforced in `governance.mdc`; VS Code API concerns (commands, providers, disposables, configuration, logging) live in `vscode_extension.mdc`.
- The extension is a TypeScript-based VS Code extension that provides Language Server Features (LSF) for the Data7 Basic language (`.bas`) and the Data7 project file format (`.7proj`).
- The architecture is layered around three concerns: **Data access and indexing**, **Language providers (LSF)**, and **Project tooling (Builder/Decompiler/Repository)**. Keep dependencies flowing inward toward parsers and shared services.

## Runtime flows

- **Language provider flow**: `VS Code event -> providers/<feature>-provider.ts -> analysis/type-resolver -> analysis/symbol-indexer or system-library -> result`. Providers translate VS Code request/response shapes and delegate analysis. Symbol parsing, scope resolution, and type resolution belong in `src/analysis/`, never inside provider classes.
- **Linting flow**: `Document change -> diagnostics/diagnostics.ts (DiagnosticsLinter) -> DiagnosticCollection`. `providers/code-actions.ts` consumes the resulting diagnostics by their stable `code` from `diagnostics/diagnostic-codes.ts` (see `vscode_extension.mdc`); it does not re-implement the linter's rules.
- **Project tooling flow**: `Command callback -> project/builder.ts or project/decompiler.ts -> util/xml-helpers -> file system`. Builder and Decompiler are inverse operations (see `data7_domain.mdc` for the round-trip invariant).
- **Command flow**: `User command (data7.*) -> extension.ts callback -> services/<x>-service.ts (or project/) -> result surfaced via infra/logger or window message`. Command callbacks stay thin: parse arguments, delegate, report.

## Dependency direction

Layers from leaf to top:

1. `src/utils/` and `src/system-library/` — leaves. No imports from other `src/` folders (except `system-library/{types,symbol-helpers}.ts` and `utils/{symbol-kind,format-helpers}.ts`, which import **types only** from `src/analysis/symbol-indexer`).
2. `src/infra/` — leaf infrastructure (logger, configuration). Depends only on `vscode`.
3. `src/analysis/` — pure parsers/resolvers. Depends on `infra/` and `system-library/`.
4. `src/diagnostics/` and `src/project/` — depend on `analysis/`, `system-library/`, `infra/`, `utils/`. Never depend on each other, on `providers/` or on `services/`.
5. `src/providers/` and `src/services/` — top-of-stack. Depend on everything below. Providers do not import other providers; the only sanctioned provider→service edge is `providers/document-link-provider.ts` → `services/repository-service.ts` (documented exception in the file header and in `eslint.config.mjs`).
6. `src/extension.ts` — the only file that may depend on everything; nothing should depend on `extension.ts`.

Cross-cutting concerns (telemetry, logging, configuration) belong in `src/infra/` behind a single helper rather than scattered through providers and services.
