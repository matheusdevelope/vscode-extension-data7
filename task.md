# Diagnostics Refactoring Tasks

- `[ ]` 1. Audit and Update Rule Files under `packages/data7-core/src/diagnostics/rules/`
  - `[ ]` Update `MembersRule` (`members-rule.ts`) to support direct event assignments (without `AddressOf`)
  - `[ ]` Update `TypesRule` (`types-rule.ts`) to include event signature arity mismatch check inside assignment checking
- `[ ]` 2. Implement `RuleContext` in `DiagnosticsASTWalker` inside `packages/data7-core/src/diagnostics/diagnostics.ts`
  - `[ ]` Extend `RuleContext` interface
  - `[ ]` Implement state mappings and utility helpers on the walker (`activeClass`, `activeMethod`, `report(diag)`)
- `[ ]` 3. Delegate walking checks to rules in `DiagnosticsASTWalker`
  - `[ ]` Load all active rules in the walker constructor
  - `[ ]` Invoke rule lifecycle hooks (`onStart`, `onEnd`) and check hook (`checkNode`)
  - `[ ]` Remove the large, duplicate private check methods from `diagnostics.ts`
- `[ ]` 4. Verification and Formatting
  - `[ ]` Run `npm run compile -w @data7/core` to verify build
  - `[ ]` Run `npm run test -w @data7/core` to run all unit tests
  - `[ ]` Run `npm run format` to match code formatting conventions
