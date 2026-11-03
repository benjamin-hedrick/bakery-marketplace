import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

// Browsers: Chromium only by default (what the pipeline runs). `BROWSERS=all` adds Firefox, WebKit and two phone profiles; `BROWSERS=firefox,webkit`
// picks some (docs/process/test-strategy.md). Run `npx playwright install firefox webkit` first.
const projectsByName = {
  chromium: { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  firefox: { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  webkit: { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  'mobile-chrome': { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  'mobile-safari': { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
};
const wanted =
  (process.env.BROWSERS ?? 'chromium') === 'all'
    ? Object.keys(projectsByName)
    : (process.env.BROWSERS ?? 'chromium').split(',');
const projects = wanted.map((n) => {
  const p = projectsByName[n.trim() as keyof typeof projectsByName];
  if (!p) throw new Error(`Unknown browser project: ${n}`);
  return p;
});

// Expects `npm run mock` and a production `next start` (with ENABLE_TEST_HOOKS=1) to be running, or
// lets Playwright start both. Production mode on purpose: hydration warnings differ from `next dev`.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  projects,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run mock', url: 'http://localhost:4000/healthz', reuseExistingServer: true, timeout: 30_000 },
    // The login happens on the app's server (ADR-0019), so the issuer is a real HTTP stand-in, not something the tests can stub in the page.
    {
      command: 'npm run mock-issuer',
      url: 'http://localhost:5101/healthz',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run build && npx next start -p 3000',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 180_000,
      // GRAPHQL_URL is read at run time (the /api/graphql route and server rendering) and has no default: aim it at the mock.
      env: {
        ENABLE_TEST_HOOKS: '1',
        GRAPHQL_URL: 'http://localhost:4000/graphql',
        // The login (read at run time by the API routes): the issuer stand-in, this app's origin, and sessions kept in the app's own memory, which
        // only the explicit allowance below permits. The encryption key is a throw-away generated at each start of the tests.
        AUTH_ISSUER: 'http://localhost:5101',
        AUTH_CLIENT_ID: 'web-customer',
        APP_ORIGIN: 'http://localhost:3000',
        SESSION_REDIS_URL: 'memory',
        SESSION_ALLOW_MEMORY_STORE: '1',
        SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
        // The mock BFF and the declined-payment hook are steered by request headers, which the API route only forwards when told to.
        GRAPHQL_EXTRA_FORWARDED_HEADERS: 'x-fixture,x-delay-ms,x-place-order,x-test-payment',
      },
    },
  ],
});
