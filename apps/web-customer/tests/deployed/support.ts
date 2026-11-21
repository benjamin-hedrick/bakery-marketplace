import { test as base, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Shared by the deployed suite (playwright.deployed.config.ts). Customer actions only, through the web app and the mock issuer's own login page: nothing
// here reaches an internal address or asks for a vendor token. The seeded names are named seed data points (tools/BakeryMarketplace.Seed); prices and
// stock numbers are read from the page, never assumed.

export const WEB = process.env.WEB_URL ?? '';
export const ISSUER = process.env.ISSUER_URL ?? '';
export const EVIDENCE = path.resolve(process.env.DEPLOYED_EVIDENCE_DIR ?? 'artifacts/deployed');

/** Over https the session cookie carries the __Host- prefix (packages/web-session/src/config.ts); locally it never has. */
export const SESSION_COOKIE = '__Host-bakery-session-web-customer';

/** The seeded customers (MockUsers in tools/BakeryMarketplace.Auth), by the name the mock issuer's login page shows. */
export const CUSTOMERS = {
  alice: 'Alice Customer',
  nora: 'Nora (tree-nut allergy)',
  sam: 'Sam (sesame allergy)',
  dana: 'Dana (avoids dairy)',
  max: 'Max (dairy and tree-nut allergies, avoids gluten)',
} as const;

export const LISTINGS = {
  sourdough: 'Country Sourdough',
  croissant: 'Almond Croissant',
  latte: 'Oat Milk Latte',
  lemonade: 'Yuzu Lemonade', // the concurrency test's own (stock 2, one per order)
} as const;

/**
 * The chaos seed data (WI-CHAOS-006; tools/BakeryMarketplace.Seed and BakeryMarketplace.Auth): what the dev-chaos scenario aims at
 * (chaos/scenarios/dev-chaos.json). Only the chaos-aware tests (06b-chaos) use it, one data point each.
 */
export const CHAOS = {
  customers: {
    payment: 'Casey (chaos test: payment answers get lost)',
    stock: 'Remy (chaos test: the stock check says no)',
  },
  listings: {
    payment: 'Patient Pretzel (chaos test)',
    stock: 'Stubborn Strudel (chaos test)',
    outage: 'Flickering Focaccia (chaos test)',
    outageOn: 'Lights-Out Loaf (chaos test)',
    outageOff: 'Lights-On Loaf (chaos test)',
  },
  /** The trace id whose requests the scenario slows at the BFF's door: a caller sends it in its own traceparent. */
  slowTraceId: 'c4a05000000000000000000000000001',
} as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Correlated {
  test: string;
  method: string;
  path: string;
  status: number;
  correlationId: string;
  at: string;
}

/**
 * Records every response of the web app that carries X-Correlation-Id (the trace id, ADR-0016: the BFF sets it and the web app's GraphQL proxy passes it
 * on), so the run's requests can be found in the environment's log afterwards (register 221). Returns the list it fills.
 */
export function watchCorrelation(context: BrowserContext, testTitle: string, into: Correlated[] = []): Correlated[] {
  context.on('response', (response) => {
    const id = response.headers()['x-correlation-id'];
    if (!id || !response.url().startsWith(WEB)) return;
    into.push({
      test: testTitle,
      method: response.request().method(),
      path: new URL(response.url()).pathname,
      status: response.status(),
      correlationId: id,
      at: new Date().toISOString(),
    });
  });
  return into;
}

/** Writes one test's correlation ids to the run's file and attaches them to the report. */
export async function saveCorrelation(seen: Correlated[], attach: (name: string, body: string) => Promise<void>) {
  if (seen.length === 0) return;
  mkdirSync(EVIDENCE, { recursive: true });
  appendFileSync(path.join(EVIDENCE, 'correlation-ids.jsonl'), seen.map((s) => JSON.stringify(s)).join('\n') + '\n');
  await attach('correlation-ids.json', JSON.stringify(seen, null, 2));
}

/** Writes a named evidence file (JSON) next to the reports. */
export function saveEvidence(name: string, data: unknown) {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(path.join(EVIDENCE, name), `${JSON.stringify(data, null, 2)}\n`);
}

/** The suite's test: every test's own page is watched for correlation ids. */
export const test = base.extend<{ correlation: Correlated[] }>({
  correlation: [
    async ({ context }, use, testInfo) => {
      const seen = watchCorrelation(context, testInfo.title);
      await use(seen);
      await saveCorrelation(seen, (name, body) => testInfo.attach(name, { body, contentType: 'application/json' }));
    },
    { auto: true },
  ],
});
export { expect };

/** On the mock issuer's own page (another origin), logs in as a seeded customer. */
export async function logInAs(page: Page, who: string) {
  await expect(page).toHaveURL(new RegExp(`^${escape(ISSUER)}/authorize`));
  await page.getByRole('button', { name: `Login as ${who} (Customer)` }).click();
}

/** Opens a listing from the home page, the way a customer would. */
export async function openListing(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: name }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

export async function addToOrder(page: Page, name: string, opts: { option?: string | RegExp } = {}) {
  await openListing(page, name);
  if (opts.option) await page.getByRole('checkbox', { name: opts.option }).check();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toContainText('Added to your order');
}

/** From a cart with something in it to the checkout form, logging in on the way (the cart must survive the trip to the issuer). */
export async function toCheckout(page: Page, who: string = CUSTOMERS.alice) {
  await page.getByTestId('cart-link').click();
  await expect(page.getByTestId('login-required')).toBeVisible();
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await logInAs(page, who);
  await expect(page).toHaveURL(`${WEB}/checkout`);
  await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();
  await expect(page.getByLabel('Pickup time')).toBeEnabled(); // the real pickup times arrived
}

export const placeButton = (page: Page) => page.getByRole('button', { name: 'Place test order' });
