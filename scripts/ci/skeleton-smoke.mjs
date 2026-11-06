// Walking-skeleton smoke (WI-PORT-002/003, S1-07a): brings up the real local stack, seeds it, runs Playwright, tears down.
// The stack: Redis, the Cosmos emulator and the mock OIDC issuer (Compose), the catalog and ordering services, the GraphQL BFF and Next.js;
// the start-up is shared with scripts/dev/demo.mjs in scripts/lib/local-stack.mjs.
// Ordering calls the catalog with its own client-credentials secret, which scripts/dev/init-env.mjs writes to the git-ignored .env first
// (a fresh one on a clean agent, the existing one on a developer machine); the secret is never printed.
// The same command runs locally and in Azure Pipelines.
//
//   node scripts/ci/skeleton-smoke.mjs [--keep] [--containers]
//     --keep leaves Docker running afterwards; --containers runs the four application containers (compose profile apps) instead of host processes
//
// Needs Docker, the .NET SDK, Node >= 24 and `npm ci` already run in apps/web-customer and services/graphql-bff.
// Logs: artifacts/skeleton/*.log. Playwright JUnit: artifacts/skeleton/playwright-junit.xml. Exit code: the test run's.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createStack } from '../lib/local-stack.mjs';

const keep = process.argv.includes('--keep');
const containers = process.argv.includes('--containers');
// NEXT_DIST_DIR keeps this build (aimed at the real BFF) out of `.next`, which the mock-backed e2e uses.
const stack = createStack({
  label: 'skeleton',
  outDir: 'artifacts/skeleton',
  distDir: '.next-skeleton',
  logExits: true,
});

let exitCode = 1;
try {
  stack.up();
  if (containers) {
    await stack.startContainers();
  } else {
    await stack.startServices();
    await stack.startWeb();
  }
  await stack.startQueue(); // the vendor's screen, for the journey from a customer's order to the vendor's queue

  const pw = spawnSync(
    'node',
    [
      path.join('node_modules', '@playwright', 'test', 'cli.js'),
      'test',
      '-c',
      'playwright.skeleton.config.ts',
      '--reporter=list,junit',
    ],
    {
      cwd: stack.webDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...stack.webEnv,
        PLAYWRIGHT_JUNIT_OUTPUT_NAME: path.join(stack.out, 'playwright-junit.xml'),
      },
    },
  );
  exitCode = pw.status ?? 1;
  stack.log(`Playwright exit code ${exitCode}`);
} catch (e) {
  console.error(`[skeleton] ERROR: ${e.message}`);
} finally {
  stack.stopAll();
  if (!keep) stack.down();
}
process.exitCode = exitCode;
