import { defineConfig } from '@playwright/test';

// Chaos specs (ADR-0024): run only by scripts/ci/chaos-smoke.mjs, which starts the whole local stack with ONE chaos scenario (STACK_CHAOS_SCENARIO) and
// runs the spec file named for it (tests/chaos/<scenario>.spec.ts). Never part of the default suite (playwright.skeleton.config.ts reads tests/skeleton),
// which runs with no scenario. A spec skips itself when the scenario it was written for is not the one running.
export default defineConfig({
  testDir: './tests/chaos',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list']],
  use: { baseURL: process.env.WEB_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
});
