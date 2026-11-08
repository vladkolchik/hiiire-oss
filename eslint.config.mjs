import nextPlugin from "@next/eslint-plugin-next";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "worker/dist/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },

  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...(reactHooksPlugin.configs?.recommended?.rules ?? {}),
      ...(nextPlugin.configs.recommended?.rules ?? {}),
      ...(nextPlugin.configs["core-web-vitals"]?.rules ?? {}),
      // This rule is new and currently flags existing, intentional URL-sync effects in the codebase.
      // Keep the standard hooks correctness rules, but don't fail CI on this stylistic/perf heuristic.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
