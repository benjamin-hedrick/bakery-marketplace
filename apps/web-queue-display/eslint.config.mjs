import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

// Next's rules include React, react-hooks, jsx-a11y and typescript-eslint recommended. Relay queries are validated by
// relay-compiler (`npm run relay`), so no Relay ESLint plugin.
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    '.next/',
    '.next-*/',
    'node_modules/',
    'src/__generated__/',
    'test-results/',
    'playwright-report/',
    'next-env.d.ts',
  ]),
]);
