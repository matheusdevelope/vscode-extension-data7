/**
 * Side-effect-only module that installs the `vscode` shim as soon as it
 * is `require`d. Importing this file with a bare `import "./runtime/install-shim";`
 * at the top of `server.ts` (BEFORE the imports that transitively pull
 * the `vscode` namespace) guarantees the require-hook is active by the
 * time `DiagnosticsLinter` is loaded.
 *
 * Why a separate file? TypeScript hoists all `import` declarations to
 * the top of the emitted CJS module in source order. So putting
 * `installVscodeShim()` after the imports does not work — the imports
 * have already executed. A side-effect import in slot #1 is the
 * canonical idiom for this pattern.
 */
import { installVscodeShim } from "./vscode-shim";

installVscodeShim();
