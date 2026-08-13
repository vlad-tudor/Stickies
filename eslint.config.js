import js from "@eslint/js";
import tseslint from "typescript-eslint";
import solid from "eslint-plugin-solid/configs/typescript";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "handoff/", "relay/", "*.timestamp_*.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    ...solid,
  },
  {
    // Solid's `let el; ... ref={el}` pattern assigns refs in compiled JSX,
    // which this rule can't see.
    files: ["src/**/*.tsx"],
    rules: { "no-unassigned-vars": "off" },
  },
  {
    // Stores wire Solid setters into Yjs/awareness observers; the plugin's
    // tracked-scope heuristic assumes component context and misfires there.
    files: ["src/stores/**"],
    rules: { "solid/reactivity": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
  prettier,
);
