import { defineConfig } from '@playwright/test';
import path from 'node:path';

// The deployed dev environment's customer suite (WI-DEP-001, register 218): run against the two public addresses, the web app (WEB_URL) and the mock
// issuer (ISSUER_URL), on the seeded data (register 224). Nothing is started here and nothing reaches an internal address: no BFF, no service, no vendor
// token. One worker and files in name order (01- to 07-), the concurrency test last. Before the first test, the global setup (tests/deployed/warm-up.ts)
// wakes the apps one at a time and records how long each took (register 228): they scale to zero when idle.
//   WEB_URL=https://web.<domain> ISSUER_URL=https://mock-oidc.<domain> DEPLOYED_WHERE=lead npx playwright test -c playwright.deployed.config.ts
// The pipeline's smoke stage runs it with the addresses from the deployment record (DEPLOYED_WHERE=agent); from the lead's machine the same command works.
// Evidence goes to DEPLOYED_EVIDENCE_DIR (default artifacts/deployed): the HTML and JUnit reports, a screenshot per test, traces on failure,
// warm-up.json, and correlation-ids.jsonl (every X-Correlation-Id the web app answered with, to find the requests in the environment's log).
// A local dry run against the running local stack (http://localhost:3000 and :5100) checks the selectors and flows before a deployment; there tests 3
// and 4 fail by design (they require https endpoints and the __Host- cookie), and test 11 needs a freshly seeded local database.
const required = (name: string) => {
  const value = process.env[name];
  if (!value || !/^(https:\/\/[^/]+|http:\/\/(localhost|127\.0\.0\.1):\d+)$/.test(value))
    throw new Error(
      `${name} must be the https origin of the deployed app (no path), or a local http://localhost:<port> for a dry run`,
    );
  return value;
};
const evidence = path.resolve(process.env.DEPLOYED_EVIDENCE_DIR ?? 'artifacts/deployed');

export default defineConfig({
  testDir: './tests/deployed',
  globalSetup: './tests/deployed/warm-up.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000, // the first request after an idle period starts the apps from zero
  expect: { timeout: 30_000 },
  outputDir: path.join(evidence, 'test-results'),
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(evidence, 'report'), open: 'never' }],
    ['junit', { outputFile: path.join(evidence, 'junit.xml') }],
  ],
  use: {
    baseURL: required('WEB_URL'),
    trace: 'retain-on-failure',
    screenshot: 'on',
    navigationTimeout: 120_000,
    actionTimeout: 30_000, // a missing element fails a test in seconds, not at the test's own timeout
  },
  metadata: { issuer: required('ISSUER_URL') },
});
