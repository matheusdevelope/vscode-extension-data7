---
description: "Data7 domain concepts: namespaces, modules, Principal.bas, repository, System Library, scope resolution"
globs: ["src/**/*.ts"]
alwaysApply: true
---

# Data7 Domain Concepts

- This is a project-specific rule file. It encodes the conceptual model of the Data7 ERP language so that providers, the linter, the indexer, the builder, and the repository service all agree on the same vocabulary.
- The authoritative narrative lives in `project_context.md`. This rule file extracts the invariants that must be reflected in the code. Cross-module import boundaries are enforced in `governance.mdc`.

## File formats

- `.bas` (and the alias `.d7b`) are Data7 Basic source files. A `.bas` file may declare a `Namespace`, classes, structures, methods, local variables, and global attributes. Treat `.bas` parsing as line-oriented and aware of single-line/multi-line comments via `DependencyScanner.stripComments` — do not re-implement comment stripping.
- `.7proj` (and the alias `.7Proj`) is the XML project container. It aggregates project metadata, forms, and all `.bas` scripts. Read and write `.7proj` only through the shared `fast-xml-parser`-backed helpers; never edit the XML by string concatenation.
- The language identifiers contributed in `package.json` are `d7basic` and `data7project`. Reference them through the canonical constants module (see `coding_standards.mdc`) instead of hardcoding the strings.

## Namespaces and modules

- Each `.bas` file belongs to a `Namespace <name>` declaration. The indexer must associate every symbol parsed from a file with its declared namespace.
- A module is marked with the `@Module` comment tag in the file's leading comment block. Modules without `@Module-Imported` are first-class shared modules that can be imported into other projects.
- A namespace may be brought into scope inside a `.bas` file in three ways: (1) implicit (declared in `Principal.bas`), (2) explicit `Imports <Namespace>` directive at the file header, or (3) qualified access at the call site (`ModuleNamespace.Type`).
- When code automatically inserts an import (auto-import on completion or the `missing-import` Quick Fix), it must place the `Imports <Namespace>` line at the top of the file, immediately after any existing `Imports` block, and never duplicate an existing import.

## `Principal.bas`

- `Principal.bas` is the main entry file of a project. All declarations and types defined there are injected into the global context and are visible everywhere without `Imports`.
- The linter and the type resolver must include `Principal.bas` symbols in the global scope lookup before reporting a `missing-import` error.

## Private modules repository

- The extension owns a private folder for shared modules under `vscode.ExtensionContext.globalStorageUri` (fallback `~/.data7_extension/repository`). A module imported into the repository is the canonical source for that namespace inside the workspace; the indexer must surface its symbols alongside workspace `.bas` files.
- The write-ownership constraint (only `RepositoryService` may write to that folder) is enforced in `governance.mdc`.

## System Library

- `src/system-library/` contains the literal definitions of the ERP's native classes, functions, and namespaces (e.g. `Forms.Form`, `Drawing.TCanvas`, `SQL.Connection`, `Collections.StringList`). It is data, not behavior.
- Native global classes such as `THTTP`, `TJSONObject`, and `TJSONArray` live under `Globals/` and must be visible in global scope without an `Imports` directive.
- `src/system-library/types.ts` defines the strict `SystemContainer` union. Every container folder used inside `src/system-library/` must be listed in this union; new containers require updating the union before adding symbols.

## Scope and visibility (linter contract)

- Local resolution order for an identifier is: enclosing Method -> enclosing Class -> active Namespace.
- Global resolution order is: primitive types (`String`, `Integer`, etc.) -> global classes (`THTTP`, `TObject`, `TJSONObject`, `TJSONArray`, …) -> declarations from `Principal.bas`.
- If neither local nor global resolution succeeds, the type must belong to a namespace that is either explicitly imported via `Imports` or accessed with qualified notation. Otherwise the linter must emit a diagnostic with code `missing-import`.
- Auto-importation on completion and the `missing-import` Quick Fix are the only sanctioned ways for the extension to mutate a file's `Imports` block in response to scope errors.

## Builder and Decompiler invariants

- `builder.ts` packages a tree of `.bas` files into a single `.7proj` XML. It must strip excess comments, escape XML-reserved characters (`&`, `<`, `>`, `"`, `'`), and generate unique project GUIDs.
- `decompiler.ts` is the strict inverse: it reads `.7proj` and emits an equivalent `.bas` tree. Builder + Decompiler must be idempotent on round-trip for any valid project (modulo whitespace and ordering rules documented in tests).
- Builder and Decompiler share helpers (escaping, comment stripping, GUID generation). New helpers belong in a shared module consumed by both; do not fork them.

## Diagnostic codes (stable identifiers)

- Linter diagnostics use short, stable string codes declared in `src/diagnostics/diagnostic-codes.ts` as a frozen `DiagnosticCodes` object. The canonical set currently includes: `missing-import`, `unused-import`, `duplicate-import`, `unknown-member`, `module-not-found`, `module-not-declared`, `private-member-access`, `event-signature-mismatch`, `unsupported-member`, `not-enumerable`, `unknown-suppression-code`, `invalid-interpolation`, `ternary-context-unsupported`. New codes follow `kebab-case` and must be added to `DiagnosticCodes` AND documented in `project_context.md` § 4.4 AND illustrated by at least one canonical example under `docs/exemple/diagnostics/<code>/` before any use in code. Each code should ship with a typed payload (see `MissingImportPayload`, `UnknownMemberPayload`, etc.) attached to `Diagnostic.data` so code actions remain message-agnostic.
