// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Pragmatic flat config: lints server/ and web/ TypeScript without blocking on the
// existing codebase. Rules that would currently fail are relaxed to "warn" or off.
// Intentionally NOT type-aware (no parserOptions.project) to keep `npm run lint` fast
// and dependency-light. No `--max-warnings 0` is used anywhere, so warnings never
// fail the build; only true errors do, and the config keeps the existing code at 0
// errors.
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.venv/**",
      "web/src/i18n/locales/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    // The codebase already contains `eslint-disable` directives (no-console,
    // react-hooks/exhaustive-deps); do not fail on directives that turn out unused.
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      // Keep warn-level signal without ever failing the existing codebase.
      "@typescript-eslint/no-explicit-any": "off",
      // Underscore-prefixed identifiers are an intentional "unused" marker.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
      "no-empty": "warn",
      "no-control-regex": "off",
      "no-useless-escape": "warn",
      "prefer-const": "warn",
      // Registered so existing `// eslint-disable-next-line ...` comments resolve.
      "no-console": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // The backend is a Node CLI/server: console is the intended logging channel.
    files: ["server/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
);
