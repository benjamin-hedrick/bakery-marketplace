#!/usr/bin/env node
// Takes the screenshots of the slice-1 customer journey used in docs/operations/demo.md, against a RUNNING stack
// (start it with `node scripts/dev/demo.mjs`). It places one real test order (two Country Sourdough) as Alice Customer,
// so stock goes down by two until the stack is torn down. It prints how long the first checkout took.
//
//   node scripts/dev/capture-journey.mjs [output folder]     default: docs/operations/demo
//
// Needs `npm ci` and `npx playwright install chromium` in apps/web-customer. Exit code 0 when every step worked.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(root, 'apps', 'web-customer', 'package.json'));
const { chromium } = require('@playwright/test');

const out = path.resolve(process.argv[2] ?? path.join(root, 'docs', 'operations', 'demo'));
mkdirSync(out, { recursive: true });
const base = process.env.WEB_URL ?? 'http://localhost:3000';

const browser = await chromium.launch();
const page = await (
  await browser.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 })
).newPage();
const shot = async (name) => {
  await page.screenshot({ path: path.join(out, name) });
  console.log(`saved ${name}`);
};
const visible = (locator) => locator.waitFor({ state: 'visible', timeout: 30000 });

try {
  await page.goto(base);
  await visible(page.getByTestId('listing').first());
  await shot('01-browse.png');

  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  await visible(page.getByRole('heading', { level: 1, name: 'Country Sourdough' }));
  await page.getByLabel('Quantity').selectOption('2');
  await shot('02-listing.png');

  await page.getByRole('button', { name: 'Add to order' }).click();
  await visible(page.getByTestId('cart-link'));
  await page.getByTestId('cart-link').click();
  await visible(page.getByTestId('login-required'));
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/localhost:5100\/authorize/);
  await shot('03-login.png');

  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
  await visible(page.getByRole('form', { name: 'Place your order' }));
  await page.getByLabel('Pickup time').waitFor({ state: 'visible', timeout: 30000 });
  await shot('04-checkout.png');

  const t0 = Date.now();
  await page.getByRole('button', { name: 'Place test order' }).click();
  await page.waitForURL(/\/orders\/.+/);
  await visible(page.getByTestId('order-status'));
  console.log(`first checkout took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await shot('05-order.png');
  console.log(`order status: ${await page.getByTestId('order-status').innerText()}`);

  // Personalization (WI-CUST-005, CUST-006, CUST-008, CUST-007): the customer's allergen profile, marks on browse, the warning and acknowledgement at checkout, and
  // the order history. The profile is saved for Alice and stays until the stack is torn down. No second order is placed.
  await page.goto(`${base}/preferences`);
  const nut = page.locator('[data-testid="allergen-group"][data-allergen="tree-nut"]');
  await visible(nut);
  await nut.getByLabel(/Allergy/).check();
  await page.getByRole('button', { name: 'Save my choices' }).click();
  await visible(page.getByTestId('preferences-saved'));
  await shot('06-preferences.png');

  await page.goto(base);
  await visible(page.getByTestId('listing').first());
  await visible(page.getByTestId('conflict').first());
  await shot('07-browse-conflicts.png');

  await page.getByTestId('listing').filter({ hasText: 'Almond Croissant' }).getByRole('link').click();
  await visible(page.getByRole('heading', { level: 1, name: 'Almond Croissant' }));
  await page.getByRole('button', { name: 'Add to order' }).click();
  await visible(page.getByTestId('cart-link'));
  await page.getByTestId('cart-link').click();
  await visible(page.getByTestId('conflicts'));
  await visible(page.getByTestId('ack-needed'));
  await shot('08-checkout-allergies.png');

  await page.goto(`${base}/orders`);
  await visible(page.getByTestId('history-order').first());
  await shot('09-orders.png');
} catch (e) {
  console.error(`capture failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
