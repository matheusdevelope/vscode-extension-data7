# Real Project Linter Fixes

Context: findings collected from `Conciliacao de Cartoes V4.8`.

## Phase 1 - Concrete False Positives

Status: in progress.

- [x] Allow `Variant` and `String` bracket indexing in diagnostics and type inference.
- [x] Resolve unqualified calls by active class, current file and imported namespace before unrelated global symbols. This prevents a same-named `Sub` in another module from shadowing an imported `Function`.
- [x] Allow class members with the same name as their class, including the `Namespace Coluna / Class Coluna / Public Coluna` pattern.
- [x] Treat `Net` as a native System Library namespace for module validation.
- [x] Add FTP constants `ftBinary` and `ftASCII` to the System Library.
- [x] Suppress `unknown-member` for event handler references assigned to `On*` delegate properties.
- [x] Accept class-name casts such as `ContaReceber(value)` in type resolution and diagnostics.
- [x] Add legacy `GridConfigs` visual option flags and `TStrings.Item(Integer)` default indexer to the System Library.

## Phase 2 - Remaining Findings

Status: completed.

- [x] Keep `private-member-access` strict for every `Private` member. The real `HelpersRowCSV.cells` access is invalid source accepted by the current compiler, not a linter false positive.
- [x] Highlight the exact private member token in chained accesses such as `me._rowsCSV.gett(i).cells.count`, and cover autocomplete visibility so `Private` members appear only inside the declaring class.
- [x] Split terminal `Exit Function`/`Exit Sub`/empty `Return` cleanup from `missing-return-value` with `redundant-terminal-exit` and a removal Quick Fix.

## Phase 3 - Quick Fix Engine

Status: pending.

- [ ] Generate bulk fixes from unit fixes where the payload and edit shape are deterministic.
- [ ] Enforce action order: unit fix, bulk fix, line suppression, file suppression.
- [ ] Add command/context menu action to apply linter quick fixes to the active file.
- [ ] Reuse cached diagnostics after workspace fixes so Problems updates without a redundant full reanalysis.

## Phase 4 - New Diagnostics and Build Options

Status: pending.

- [ ] Group `dead-code` diagnostics by unreachable block instead of per line.
- [ ] Warn on direct assignment from chained global functions that the compiler cannot handle.
- [ ] Add optional warnings/fixes for final method calls without parentheses.
- [ ] Improve empty `Finally` removal.
- [x] Preserve local `@module` namespaces when repository modules are missing.
- [ ] Design optional build minify flags for unused declarations and namespace merge.
