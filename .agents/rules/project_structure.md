---
description: "Project-specific folder structure conventions for the Data7 VS Code extension"
globs: ["src/**/*.ts"]
alwaysApply: true
---

# Project Structure

- This is a project-specific rule file. It defines where code lives in this repository based on its current architectural state.
- All TypeScript source lives under `src/` and is compiled to `out/` via `tsc -p ./`.
- The Domain Data7, Tests/Quality, Governance/Git, and Security/Performance rules remain integral and must be respected alongside this structure.

## Top-level `src/` layout

- **Root Files:** Only `src/extension.ts` and `src/commands.ts` are allowed at the root of `src/`. Introducing a new root file requires updating this rule.
- `src/project/` — The central source of truth for syntax and project compilation:
  - `parser/` and `ast/`: The core syntax definitions and parsers.
  - `generics/` and `sugars/`: Implement pure transformations over the AST and canonical code.
  - Also contains legacy tooling (`builder.ts`, `decompiler.ts`).
- `src/analysis/` — Semantic reading, workspace indexing, type resolution, control flow analysis, and dependencies.
- `src/diagnostics/` — Diagnostic codes, severity definitions, and diagnostic assembly.
- `src/providers/` — VS Code UI features (Completion, Hover, Definition, Rename, Formatter, Code Actions). All providers MUST strictly depend on the AST/indexer from `src/analysis/` and never implement raw text parsing.
- `src/services/` — Command implementations, VS Code integration, and orchestration.
- `src/system-library/` — The native Data7 symbol catalog. Note: The external `docs/system-library` folder is derived strictly from this source.
- `src/mcp/` — An isolated external adapter (Model Context Protocol) that reuses the existing runtime via shims.
- `src/infra/` — Configuration, constants, and logging.
- `src/utils/` — Pure, domain-agnostic helpers.

## Files outside `src/`

- `docs/example/` — Canonical test fixtures. The headers and `_expected` directories must perfectly reflect the real code before any test validation occurs. This folder is the absolute source of truth for both documentation and test inputs.
- `docs/rfcs/` — Architecture Decision Records for changes that touch multiple files or introduce dependencies.
