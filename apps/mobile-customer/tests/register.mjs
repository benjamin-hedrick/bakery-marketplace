// Test tooling for WI-MOB-003 (no app code changes): lets Node's test runner load the app's modules as they are.
// Run with `node --import ./tests/register.mjs --test` (npm test). The hook (hooks.mjs) maps the Expo modules to the fakes in tests/fakes
// and resolves the app's extensionless relative imports to .ts files.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
