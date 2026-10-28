import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// Recommended (not type-checked) rules to start; `tsc --noEmit` already does the type work. Tighten one rule at a time.
export default defineConfig([
  globalIgnores(['node_modules/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
]);
