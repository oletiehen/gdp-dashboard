import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**", "dist/**", ".data/**", "coverage/**", "playwright-report/**", "test-results/**", "streamlit_app.py"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module" },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-constant-condition": "error"
    }
  },
  {
    files: ["public/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } }
  },
  {
    files: ["server.js", "src/**/*.js", "scripts/**/*.{js,mjs}", "test/**/*.{js,mjs}", "playwright.config.js"],
    languageOptions: { globals: { ...globals.node } }
  }
];
