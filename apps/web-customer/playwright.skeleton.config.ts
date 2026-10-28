import { defineConfig } from '@playwright/test';

// WI-PORT-002 walking-skeleton smoke. Unlike playwright.config.ts it does NOT start a mock: the whole local stack must
// already be running (Compose, seed, catalog-service, graphql-bff), and Next must be a production build made with
// GRAPHQL_URL pointing at the BFF. Ports can be overridden with BFF_URL / WEB_URL.
export default defineConfig({
  testDir: './tests/skeleton',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: process.env.WEB_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx next start -p 3000',
    url: process.env.WEB_URL ?? 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
    env: { GRAPHQL_URL: process.env.GRAPHQL_URL ?? 'http://localhost:4100/graphql' },
  },
});
