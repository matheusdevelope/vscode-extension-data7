---
description: "Rule governance, precedence, exception policy, and task-completion verification"
globs: ["src/**/*.ts"]
alwaysApply: true
---

# Rule Governance

- This is a universal rule file. It owns rule precedence, exception policy, architectural enforcement, and the verification workflow used before concluding a task.
- The rules in `.cursor/rules/` are organized in three groups:
  - **Universal**: `coding_standards`, `typescript`, `testing`, `performance`, `git_workflow`, `governance` (this file).
  - **Stack-specific**: `project_stack`, `vscode_extension`, `security`.
  - **Project-specific**: `architecture`, `project_structure`, `data7_domain`.
- Keep TypeScript, Node.js, or VS Code API specifics out of universal files unless the point cannot be expressed generically.

## Conflict resolution

- Resolve rule conflicts in this order: `security` -> `architecture` -> `data7_domain` -> `vscode_extension` -> `project_structure` -> `typescript` -> `testing` -> `performance` -> `coding_standards`.
- When two rules can both be satisfied, choose the stricter option instead of weakening the higher-priority rule.
- `git_workflow` is procedural and applies independently; it is never overridden by other rules.

## Exceptions and legacy

- Every intentional exception (a hardcoded literal, a duplicated helper, a deviation from the canonical command/provider/diagnostic shape) must be: local, named, covered by a test, and accompanied by a comment that states the reason and a removal condition.
- Legacy compatibility for older `.bas`/`.7proj` shapes is allowed only through small adapters or migration helpers inside the relevant module (builder, decompiler, repository). Do not spread one compatibility concern across multiple layers.

## Architectural enforcement

Enforced statically via `no-restricted-imports` blocks in `eslint.config.mjs`. Each rule mirrors a folder's layer in the dependency graph (see `architecture.mdc#Dependency direction`).

- `src/infra/` is a leaf: must not import from any other `src/` folder.
- `src/utils/` is a leaf: must not import from any other `src/` folder, except `analysis/symbol-indexer` for **type-only** imports.
- `src/system-library/` is a leaf: must not import from `src/providers/`, `src/services/`, `src/diagnostics/`, `src/project/`, or `src/extension.ts`. May import **type-only** from `src/analysis/symbol-indexer` (`SymbolInfo`, `ParameterInfo`).
- `src/analysis/` may depend on `infra/` and `system-library/` only. Must not import from `providers/`, `services/`, `diagnostics/`, `project/`, or `extension.ts`.
- `src/diagnostics/` may depend on `analysis/`, `system-library/`, `infra/`, `utils/`. Must not import from `providers/`, `services/`, `project/`, or `extension.ts`.
- `src/project/` may depend on `analysis/`, `utils/`. Must not import from `providers/`, `services/`, `diagnostics/`, or `extension.ts`.
- `src/services/` may depend on `project/`, `analysis/`, `diagnostics/`, `system-library/`, `infra/`, `utils/`. Must not import from `providers/` or `extension.ts`.
- `src/providers/` must not import each other; share helpers through `analysis/`, `services/` or `utils/` instead. The only documented exception is `providers/document-link-provider.ts` → `services/repository-service.ts` (justified in the file header, allowed via per-file override in `eslint.config.mjs`).
- Only `src/extension.ts` (or a helper invoked from it) may call `vscode.commands.registerCommand` and `vscode.languages.register*Provider`. Other modules must not register commands or providers.
- Only `src/services/repository-service.ts` may write to the private modules repository folder.
- Only the shared `fast-xml-parser`-backed helpers in `src/utils/xml-helpers.ts` may parse or serialize `.7proj` XML.
- `docs/exemple/` is documentation-grade fixture data. Production sources (`src/**/*.ts` outside `src/test/`) must NOT `import` from it. Tests consume examples via `loadExample(...)` (filesystem read inside `src/test/_helpers/fixtures.ts`), never as ES modules. Enforced by the `docs-exemple-isolation` block in `eslint.config.mjs`.

## Task-completion verification

- Before concluding a long or multi-file task, run `npm run verify` — it orchestrates `compile + lint + format:check + test + audit-system-library + generate-examples-index --check` and is the canonical "is this PR-ready?" gate.
- During iterative work prefer the individual scripts (`npm run compile`, `npm run lint`, `npm run format:check`, the relevant `node --test out/test/...` invocations) for faster feedback.
- For changes that touch the builder, decompiler, linter, indexer, providers, or `src/system-library/types.ts`, run the full test suite with `npm run test`.
- For changes to shared types (`SystemContainer`, parser output shapes, diagnostic codes, configuration helpers), prefer `npm run compile` over piecemeal type checks so the whole project's type assumptions are validated together.
- If compile, lint, format check, or tests cannot be run, or if remaining failures are outside the current scope, state that explicitly in the final handoff.

## Tooling preferences

- Prefer static enforcement where available (TypeScript `strict`, `readonly`, `as const`, discriminated unions, `never`-exhaustiveness checks) over runtime guards.
- Do not introduce dependency-cruiser, Husky, lint-staged, or other tooling beyond the canonical set listed below without an explicit request from the user. If introduced later, this rule file is updated first.

### Canonical tooling set

The repository uses a small, explicit set of dev-only tools. Each one has a single owner file and a single purpose; reuse them instead of forking parallel configurations.

- **TypeScript** (`tsconfig.json`): the source of truth for type checking. Compile via `npm run compile`. Strictness flags `strict: true` and `noUncheckedIndexedAccess: true` are both enabled; do not weaken either. Detailed call-site patterns for handling the latter live in `typescript.mdc`.
- **ESLint** with flat config (`eslint.config.mjs`): owns code-quality and architectural-boundary rules.
  - Preset stack: `@eslint/js` recommended + `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked` + `eslint-config-prettier` (last, to disable formatting rules).
  - Type-aware via `parserOptions.projectService: true`.
  - Architectural fences from `# Architectural enforcement` above are enforced via `no-restricted-imports`, one block per folder layer (`infra-isolation`, `analysis-isolation`, `diagnostics-isolation`, `project-isolation`, `services-isolation`, `providers-isolation`, `system-library-isolation`, `docs-exemple-isolation`, plus the `document-link-provider-exception` and `providers-registration-exception` overrides). When a folder is added or a fence is changed in `governance.mdc`, both must be updated together.
  - Run via `npm run lint` (or `npm run lint:fix`).
- **Prettier** (`.prettierrc` + `.prettierignore`): owns formatting. Configuration is fixed (`printWidth: 100`, `endOfLine: "lf"`, `singleQuote: false`). Run via `npm run format:check` (CI) or `npm run format` (local).
- **EditorConfig** (`.editorconfig`): owns indent/charset/EOL defaults that are tool-agnostic. Must agree with `.prettierrc` (`printWidth` = `max_line_length`, `tabWidth` = `indent_size`, `endOfLine` = `end_of_line`).
- **`.gitattributes`**: pins `eol=lf` for text files so Windows clones do not produce CRLF diffs that fight Prettier/EditorConfig.

When changing any of the five files above, verify all five still agree on indentation, line width, and EOL.
