import { randomBytes } from 'node:crypto';
import { defineConfig } from '@playwright/test';

// Expects `npm run mock` (the BFF), `npm run mock-issuer` (the issuer) and a production `next start` to be running, or lets Playwright start all
// three. Production mode on purpose: hydration warnings differ from `next dev`. The login happens on the app's server (ADR-0019), so the issuer is a
// real HTTP stand-in (packages/web-session/test-support/fake-issuer.mjs) and the sessions are kept in the app's own memory, which is only allowed
// by the explicit SESSION_ALLOW_MEMORY_STORE below. The encryption key is a throw-away generated at each start of the tests.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run mock', url: 'http://localhost:4101/healthz', reuseExistingServer: true, timeout: 30_000 },
    {
      command: 'npm run mock-issuer',
      url: 'http://localhost:5101/healthz',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run build && npx next start -p 3100',
      url: 'http://localhost:3100',
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        // Read at run time by the API routes (one build serves every environment, ADR-0020).
        GRAPHQL_URL: 'http://localhost:4101/graphql',
        AUTH_ISSUER: 'http://localhost:5101',
        AUTH_CLIENT_ID: 'web-queue-display',
        APP_ORIGIN: 'http://localhost:3100',
        SESSION_REDIS_URL: 'memory',
        SESSION_ALLOW_MEMORY_STORE: '1',
        SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
      },
    },
  ],
});
