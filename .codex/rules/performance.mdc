---
description: "Performance and runtime efficiency guidance for the extension host"
globs: ["src/**/*.ts"]
alwaysApply: true
---

# Performance Standards

- This is a stack-specific rule file for the VS Code extension host runtime. The hot paths in this codebase are: workspace indexing on activation, the linter on every save/edit, completion/hover/signature providers on every keystroke, and the builder/decompiler on user-triggered operations.
- Optimize only after identifying a concrete hot path, bottleneck, or operational limit. Measure first, then change.
- Cancellation and `withProgress` semantics for provider methods and long-running operations are owned by `vscode_extension.mdc`. This file covers what to do *between* those entry points.

## Provider hot paths

- Provider methods run on the user's keystrokes. Keep them non-blocking and short.
- Do not re-parse the active document inside a provider. Pull symbols from the shared `WorkspaceSymbolIndexer` or from cached per-document parses.
- Avoid re-traversing the full system library on every invocation. Build the lookup index once and reuse it for the lifetime of the extension.

## Indexer and file watching

- Workspace indexing on activation must run in the background, reported through `withProgress` so the user can keep editing.
- Incremental updates on `onDidChangeTextDocument` and `FileSystemWatcher` events must reparse only the affected file, not the whole workspace.
- Debounce or coalesce bursts of file events (rapid saves, branch switches, bulk repository imports) before triggering a re-index.
- Cache parsed results keyed by `Uri` plus a content hash or `version`. Invalidate the entry when the file changes; do not keep stale references alive.

## Linter and diagnostics

- The linter walks every symbol reference in a file. Avoid accidental quadratic work when resolving scopes: build per-namespace lookup maps once per file, not per identifier.
- Reuse the project's consolidated helpers (e.g. `DependencyScanner.stripComments`, the shared XML helpers) instead of rebuilding equivalent logic per call site.
- When clearing diagnostics for a closed or deleted file, clear by `Uri` instead of iterating the full collection.

## Builder, decompiler, and repository operations

- Builder and decompiler operate on potentially large `.7proj` files. Prefer streaming or chunked I/O over reading entire trees into memory when a single project exceeds a reasonable size; otherwise the simpler buffered approach is acceptable.
- Bulk repository imports must report progress at file granularity, not at byte granularity.
- Do not run builder/decompiler synchronously on the extension host's event loop. Use `async`/`await` and yield between batches when processing many files.

## General guidance

- Keep CPU-heavy work, large synchronous loops, and blocking I/O off the extension host's event loop.
- Avoid accidental quadratic work in parsers, indexers, and serializers when processing lists of files or symbols.
- When a change targets a performance-sensitive path (indexer, linter, completion), document the assumption being optimized and validate the result with a measurement (timing log to the output channel, test fixture, or profiler trace).
