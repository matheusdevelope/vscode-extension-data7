---
description: "Stack-specific libraries and conventions for the Data7 VS Code extension"
globs: ["src/**/*.ts"]
alwaysApply: true
---

# Project Stack

- This is a stack-specific rule file. It captures the libraries, runtimes, and tools actually used by this extension. Treat this list as a hard whitelist: do not introduce new runtime dependencies without an explicit request from the user.
- Runtime stack: TypeScript 5+, the VS Code Extension API (`@types/vscode ^1.80.0`, `engines.vscode ^1.80.0`), and Node.js (matching `@types/node ^20`).
- **Runtime dependencies whitelist** (do not add more without an RFC):
  - `fast-xml-parser`: used exclusively for `.7proj` parsing and serialization. The contract for how it is consumed lives in `data7_domain.mdc`; safe parser options live in `security.mdc`.
  - `@modelcontextprotocol/sdk`: consumed **exclusively** by `src/mcp/` for the embedded MCP (Model Context Protocol) server that provides AI agents with structured context about Data7 Basic. Justified in [`docs/rfcs/MCP-001-mcp-server.md`](../../docs/rfcs/MCP-001-mcp-server.md).
  - `zod`: required peer dependency of `@modelcontextprotocol/sdk` used to declare Tool/Prompt input schemas in `src/mcp/`. Travels together with the MCP SDK — must not be imported outside `src/mcp/`.
- Build tool: `tsc` for the extension proper. The MCP server (`src/mcp/`) is additionally bundled with `esbuild` into a single-file binary at `out/mcp/server.bundled.js` so the published `.vsix` ships one self-contained Node script that external MCP clients (Cursor / Claude Desktop / Continue) can launch via stdio. The `compile` script runs `tsc -p ./` followed by `npm run mcp:bundle`; `watch` runs `tsc -watch -p ./` (MCP bundling is on-demand). Keep the extension itself compiling cleanly without bundler-specific syntax (no path aliases that `tsc` cannot resolve, no virtual modules) — `esbuild` only touches the MCP entry point.
- Test runner: the Node.js built-in test runner. Test rules (which modules to use, which frameworks are forbidden, how to mock `vscode`) live in `testing.mdc`.
- VS Code APIs to prefer for cross-cutting concerns: `vscode.workspace.getConfiguration("data7")` for settings, `vscode.window.createOutputChannel` for logs, `vscode.languages.createDiagnosticCollection` for diagnostics, and `vscode.ExtensionContext.globalStorageUri` for the private modules repository (with the documented fallback `~/.data7_extension/repository`). Detailed conventions for these APIs live in `vscode_extension.mdc`.
- External processes: use `node:child_process` only inside the dedicated executor wrapper (e.g. for `data7.runProject`). Never spawn processes directly from providers or services. Argument-injection and binary-resolution rules live in `security.mdc`.
- Do not introduce HTTP, WebSocket, ORM, JWT, password-hashing, validation, or web-framework libraries. This extension has no server, no auth, and no network protocol.
