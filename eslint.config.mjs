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
 */
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
          ],
        },
      ],
    },
  },
);
