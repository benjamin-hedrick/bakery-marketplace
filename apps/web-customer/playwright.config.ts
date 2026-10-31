import { defineConfig } from '@playwright/test';

// Expects `npm run mock` and a production `next start` (with ENABLE_TEST_HOOKS=1) to be running, or
// lets Playwright start both. Production mode on purpose: hydration warnings differ from `next dev`.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run mock', url: 'http://localhost:4000/healthz', reuseExistingServer: true, timeout: 30_000 },
    {
      command: 'npm run build && npx next start -p 3000',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 180_000,
      // GRAPHQL_URL is read at run time (the /api/graphql route and server rendering) and has no default: aim it at the mock.
      env: {
        ENABLE_TEST_HOOKS: '1',
        GRAPHQL_URL: 'http://localhost:4000/graphql',
        // The mock BFF and the declined-payment hook are steered by request headers, which the API route only forwards when told to.
        GRAPHQL_EXTRA_FORWARDED_HEADERS: 'x-fixture,x-delay-ms,x-place-order,x-test-payment',
      },
    },
  ],
});
