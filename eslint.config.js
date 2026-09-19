import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "dist-ssr"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/workers/**"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },
  {
    files: ["src/workers/**/*.ts"],
    languageOptions: { globals: globals.worker },
  },
  {
    files: [
      "*.{js,ts}",
      "scripts/**/*.{ts,mjs}",
      "server/**/*.ts",
      "api/**/*.ts",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["*.js", "scripts/**/*.mjs"],
    extends: [js.configs.recommended],
  },
]);
