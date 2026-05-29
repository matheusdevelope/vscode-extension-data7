// @ts-check
import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/**
 * Flat ESLint config for the Data7 VS Code extension.
 *
 * Architectural import boundaries mirror `.cursor/rules/governance.mdc`.
 * Stylistic concerns are delegated to Prettier (`.prettierrc`); the
 * `prettierConfig` block disables conflicting ESLint rules and must stay last
 * inside each `extends` chain.
 *
 * Important — ESLint flat config rule merging:
 *
 * When two config blocks both target the same file and both set the SAME
 * rule key (`no-restricted-imports`), the LATER block completely
 * REPLACES the earlier one's options. There is no merging of
 * `patterns[]` between blocks. Consequently every layer-isolation block
 * below carries its layer-specific bans AND the shared
 * `DOCS_EXEMPLE_BAN`. Removing the duplicate would silently let layered
 * files import from `docs/exemple/`. See the comment on
 * `DOCS_EXEMPLE_BAN` below.
 */

/**
 * Shared ban: production sources must never import from
 * `docs/exemple/...` (those files are documentation fixtures consumed
 * by tests through `loadExample(...)`, not ES modules). Embedded in
 * every layer-isolation block because flat config rule replacement
 * forbids relying on a separate "default" block.
 */
const DOCS_EXEMPLE_BAN = {
  group: ["**/docs/**", "**/exemple/**"],
  message:
    "Production sources must not import from docs/exemple/. Tests use loadExample() in src/test/_helpers/fixtures.ts (governance.mdc).",
};
export default tseslint.config(
  {
    name: "data7/ignores",
    ignores: [
      "out/**",
      "node_modules/**",
      "coverage/**",
      ".vscode-test/**",
      "**/*.d.ts",
      "scripts/**/*.js",
    ],
  },

  // Type-aware lint for all TypeScript sources (production + tests).
  {
    name: "data7/typescript-source",
    files: ["src/**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      prettierConfig,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",

      // Our services are intentionally namespace-style classes with only
      // static members (`ProjectService.openProject(...)`). This pattern is
      // documented in project_context.md and explicitly allowed here.
      "@typescript-eslint/no-extraneous-class": [
        "error",
        { allowStaticOnly: true, allowWithDecorator: true },
      ],
      // String interpolation with `number`/`boolean`/`null` is idiomatic in
      // user-facing log/diagnostic messages.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowBoolean: true,
          allowAny: false,
          allowNullish: true,
          allowRegExp: true,
        },
      ],
      // `catch (err: unknown)` is the right pattern but defaulting to
      // `unknown` everywhere is verbose. We require it explicitly only when
      // the caller actually inspects the value.
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",

      // coding_standards.mdc: production logs go through the OutputChannel,
      // never console. Tests relax this below.
      "no-console": "error",
      "no-debugger": "error",
      eqeqeq: ["error", "smart"],
      curly: ["error", "multi-line"],
    },
  },

  // Tests legitimately need looser typing for mocks and fixtures.
  {
    name: "data7/typescript-tests",
    files: ["src/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      // The next rules are intentionally relaxed for tests:
      //  - fire-and-forget assertions / promise factories are idiomatic.
      //  - mock objects often have stub fields that look "always falsy" to
      //    the type-checker but exist for runtime shape.
      //  - tests inline literal strings into `assert.equal(`${x}`, ...)` —
      //    `restrict-template-expressions` would force casts everywhere.
      //  - mock objects use `null`/empty literals; nullish-coalescing-only
      //    is noisy.
      //  - test-only utility classes are static-only by design.
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-unnecessary-type-conversion": "off",
      "@typescript-eslint/no-unnecessary-type-parameters": "off",
      "@typescript-eslint/no-useless-constructor": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/prefer-optional-chain": "off",
      "@typescript-eslint/no-deprecated": "off",
      "no-empty": "off",
      "no-constant-binary-expression": "off",
      "no-case-declarations": "off",
      "no-console": "off",
    },
  },

  // governance.mdc: `docs/exemple/` is documentation-grade fixture data.
  // Production source must never `import` from it — only tests may read it
  // via `loadExample(...)` (filesystem read, not module import).
  //
  // Must come BEFORE every layer-isolation block so the cascade lets
  // the layer-specific blocks take over for files they target while
  // still covering bare `src/<root>.ts` files (e.g. extension.ts,
  // commands.ts) that no layer block matches.
  {
    name: "data7/docs-exemple-isolation",
    files: ["src/**/*.ts"],
    ignores: ["src/test/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [DOCS_EXEMPLE_BAN] }],
    },
  },

  // governance.mdc: system-library/ is the leaf of the dependency graph.
  {
    name: "data7/system-library-isolation",
    files: ["src/system-library/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/services/**",
                "**/providers/**",
                "**/diagnostics/**",
                "**/project/**",
                "**/extension",
              ],
              message:
                "system-library/ must not import services, providers, diagnostics, project tooling or extension (governance.mdc).",
            },
            DOCS_EXEMPLE_BAN,
          ],
        },
      ],
    },
  },

  // governance.mdc: services/ may consume parsers, project tooling, diagnostics
  // (codes), infra and system-library, but never providers or extension.ts.
  {
    name: "data7/services-isolation",
    files: ["src/services/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/providers/**", "**/extension"],
              message: "services/ must not import providers or extension.ts (governance.mdc).",
            },
            DOCS_EXEMPLE_BAN,
          ],
        },
      ],
    },
  },

  // governance.mdc: providers must not import each other and must not cross
  // into services/ — share via analysis/, infra/, system-library/ or utils/.
  {
    name: "data7/providers-isolation",
    files: ["src/providers/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./*-provider", "./code-actions", "./formatter"],
              message:
                "Providers must not import each other; share via analysis, infra or shared utilities (governance.mdc).",
            },
            {
              group: ["../services/*", "**/services/**"],
              message:
                "Providers must not import from services/ — extract shared logic into analysis/ instead (governance.mdc).",
            },
            DOCS_EXEMPLE_BAN,
          ],
        },
      ],
    },
  },

  // `providers/registration.ts` is the single registration entry point invoked
  // from `extension.ts`. It legitimately imports every provider class, so the
  // peer-import rule does not apply here. It still must not import services/.
  {
    name: "data7/providers-registration-exception",
    files: ["src/providers/registration.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../services/*", "**/services/**"],
              message: "providers/registration.ts must not import from services/ (governance.mdc).",
            },
            DOCS_EXEMPLE_BAN,
          ],
        },
      ],
    },
  },

  // governance.mdc: analysis/ may depend on infra and system-library, but
  // never on providers, services, diagnostics, project tooling or extension.
  {
    name: "data7/analysis-isolation",
    files: ["src/analysis/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/providers/**",
                "**/services/**",
                "**/diagnostics/**",
                "**/project/**",
                "**/extension",
              ],
              message:
                "analysis/ must not import providers, services, diagnostics, project tooling or extension (governance.mdc).",
            },
            DOCS_EXEMPLE_BAN,
          ],
        },
      ],
    },
  },

  // governance.mdc: diagnostics/ may depend on analysis, system-library,
  // infra and util, but not on providers, services or project tooling.
  {
    name: "data7/diagnostics-isolation",
    files: ["src/diagnostics/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/providers/**", "**/services/**", "**/project/**", "**/extension"],
              message:
                "diagnostics/ must not import providers, services, project tooling or extension (governance.mdc).",
            },
            DOCS_EXEMPLE_BAN,
          ],
        },
      ],
    },
  },

  // governance.mdc: project/ tooling (builder/decompiler) may depend on
  // analysis and util, but not on providers, services, diagnostics or
  // extension.
  {
    name: "data7/project-isolation",
    files: ["src/project/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/providers/**", "**/services/**", "**/diagnostics/**", "**/extension"],
              message:
                "project/ must not import providers, services, diagnostics or extension (governance.mdc).",
            },
            DOCS_EXEMPLE_BAN,
          ],
        },
      ],
    },
  },

  // architecture.mdc: src/project/parser/ is a sub-leaf — the AST-based
  // lexer/parser/serializer for the generics monomorphizer. It may
  // depend ONLY on src/utils/ (for bas-tokenizer) and may import
  // **types only** from src/project/generics-monomorphizer/ast.ts (so
  // the parser produces / serializer consumes the monomorphizer's AST
  // shape). Any other src/ import is forbidden.
  {
    name: "data7/parser-isolation",
    files: ["src/project/parser/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/analysis/**",
                "**/diagnostics/**",
                "**/services/**",
                "**/providers/**",
                "**/system-library/**",
                "**/infra/**",
                "**/extension",
                "vscode",
              ],
              message:
                "src/project/parser/ may only depend on src/utils/ and (type-only) src/project/generics-monomorphizer/ast (architecture.mdc).",
            },
            {
              group: ["**/project/!(parser|generics-monomorphizer)/**", "**/project/*"],
              message:
                "src/project/parser/ may only import from src/utils/ and src/project/generics-monomorphizer/ast (architecture.mdc).",
            },
            DOCS_EXEMPLE_BAN,
          ],
        },
      ],
    },
  },

  // governance.mdc + MCP-001: `@modelcontextprotocol/sdk` and `zod` are
  // consumed exclusively by `src/mcp/`. Production sources outside that
  // folder must not import them, or the runtime dep whitelist in
  // project_stack.mdc loses meaning.
  {
    name: "data7/mcp-deps-isolation",
    files: ["src/**/*.ts"],
    ignores: ["src/mcp/**/*.ts", "src/test/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/**", "zod"],
              message:
                "@modelcontextprotocol/sdk and zod are reserved for src/mcp/ (project_stack.mdc + MCP-001).",
            },
            DOCS_EXEMPLE_BAN,
          ],
        },
      ],
    },
  },

  // governance.mdc: infra/ (logger, configuration) is a leaf — it must not
  // depend on any other src/ folder.
  {
    name: "data7/infra-isolation",
    files: ["src/infra/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/providers/**",
                "**/services/**",
                "**/diagnostics/**",
                "**/project/**",
                "**/analysis/**",
                "**/system-library/**",
                "**/extension",
              ],
              message:
                "infra/ is a leaf and must not import from other src/ folders (governance.mdc).",
            },
            DOCS_EXEMPLE_BAN,
          ],
        },
      ],
    },
  },

  // governance.mdc + MCP-001: src/mcp/ is the external MCP server that runs
  // OUTSIDE the extension host as a stdio child process. It must not import
  // VS Code or extension-host glue directly — the only sanctioned bridge to
  // VS Code API surface is `src/mcp/runtime/vscode-shim.ts` (runtime override
  // of Module.prototype.require for "vscode").
  {
    name: "data7/mcp-isolation",
    files: ["src/mcp/**/*.ts"],
    ignores: ["src/mcp/runtime/vscode-shim.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/providers/**",
                "**/services/**",
                "**/extension",
                "**/infra/configuration",
              ],
              message:
                "src/mcp/ runs outside the extension host; consume infra via runtime/vscode-shim only (MCP-001).",
            },
            {
              group: ["vscode"],
              message:
                "src/mcp/ must not import 'vscode' directly; use src/mcp/runtime/vscode-shim instead (MCP-001).",
            },
            DOCS_EXEMPLE_BAN,
          ],
        },
      ],
    },
  },
);
