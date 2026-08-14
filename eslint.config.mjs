import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

/**
 * Flat config using the Next plugin directly (FlatCompat + eslint-config-next
 * hit a circular-JSON bug on ESLint 9). TypeScript type-checking is handled by
 * `tsc --noEmit`; here we catch Next-specific issues.
 */
export default [
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "out/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];
