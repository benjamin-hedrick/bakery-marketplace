import { defineConfig } from '@playwright/test';

// Expects `npm run mock` and a production `next start` to be running, or lets Playwright start both. Production mode on purpose:
// hydration warnings differ from `next dev`. The issuer is stubbed inside the browser by the tests (page.route).
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
      command: 'npm run build && npx next start -p 3100',
      url: 'http://localhost:3100',
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        // Read at run time by /api/graphql and /api/config (one build serves every environment, ADR-0020).
        GRAPHQL_URL: 'http://localhost:4101/graphql',
        AUTH_ISSUER: 'http://localhost:5100',
        AUTH_CLIENT_ID: 'web-queue-display',
      },
    },
  ],
});
