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
  projects,
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
        // The suites log in and send requests far faster than any person does: the rate limits (WI-RATE-001) are set out of the way here. The
        // limits themselves are tested on a second server with tight settings (tests/e2e/rate-limit.spec.ts, queue display).
        RATE_LIMIT_LOGIN_PER_MINUTE: '100000',
        RATE_LIMIT_GRAPHQL_PER_MINUTE: '100000',
        RATE_LIMIT_STREAM_PER_MINUTE: '100000',
        RATE_LIMIT_ADDRESS_PER_MINUTE: '100000',
        SESSION_REDIS_URL: 'memory',
        SESSION_ALLOW_MEMORY_STORE: '1',
        SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
      },
    },
    // A second copy of the same build with tight rate limits, for tests/e2e/rate-limit.spec.ts. One proxy hop is trusted, so each test chooses its own
    // address with an X-Forwarded-For header and the tests do not use each other's allowance.
    {
      command: 'npx next start -p 3101',
      url: 'http://localhost:3101',
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        GRAPHQL_URL: 'http://localhost:4101/graphql',
        AUTH_ISSUER: 'http://localhost:5101',
        AUTH_CLIENT_ID: 'web-queue-display',
        APP_ORIGIN: 'http://localhost:3101',
        SESSION_REDIS_URL: 'memory',
        SESSION_ALLOW_MEMORY_STORE: '1',
        SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
        TRUSTED_PROXY_HOPS: '1',
        RATE_LIMIT_LOGIN_PER_MINUTE: '3',
        RATE_LIMIT_GRAPHQL_PER_MINUTE: '6',
        RATE_LIMIT_STREAM_PER_MINUTE: '2',
        RATE_LIMIT_ADDRESS_PER_MINUTE: '40',
      },
    },
  ],
});
