import { expect, test, type Page } from '@playwright/test';
import { quantity, userToken } from '../skeleton/support';
import { customerOrderIds, onlyUnder, recordMetrics } from './support';

// Chaos scenario catalog-outage (chaos/scenarios/catalog-outage.json, register 165): ordering-service cannot reach the catalog at all (its `catalog` layer
// fails every call, the same DownstreamUnavailableException the real gateway throws for a refused connection, a timeout or a 5xx). Browsing is not
// affected (the BFF reads the catalog itself). What must hold at checkout: the customer is told plainly that the order could not be placed right now and
// that nothing was charged (the typed TEMPORARILY_UNAVAILABLE, not an unexpected error with a reference); the order stays in the cart; trying again
// sends the SAME idempotency key (the attempt is not spent); no order is made and no stock is taken. Needs the whole local stack:
// node scripts/ci/chaos-smoke.mjs catalog-outage
onlyUnder('catalog-outage');

const SOURDOUGH = 'listing-sourdough-001';

/** The idempotency key of every placeOrder the page sends through the web server's GraphQL route, in order. */
function watchCheckoutKeys(page: Page): string[] {
  const keys: string[] = [];
  page.on('request', (req) => {
    if (!req.url().endsWith('/api/graphql') || req.method() !== 'POST') return;
    const key = (req.postDataJSON() as { variables?: { input?: { idempotencyKey?: unknown } } } | null)?.variables
      ?.input?.idempotencyKey;
    if (typeof key === 'string') keys.push(key);
  });
  return keys;
}

test('with the catalog unreachable from ordering, checkout says try again, keeps the order and the key, and places nothing', async ({
  page,
  request,
}) => {
  const vendor = await userToken('vendor-shop-001');
  const alice = await userToken('user-customer-1');
  const stockBefore = await quantity(request, vendor, SOURDOUGH);
  const ordersBefore = await customerOrderIds(alice);
  const keys = watchCheckoutKeys(page);

  // Browse and add: the BFF reads the catalog itself, so this works during the outage.
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toContainText('Added to your order');

  await page.getByTestId('cart-link').click();
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/localhost:5100\/authorize/);
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
  const form = page.getByRole('form', { name: 'Place your order' });
  await expect(form).toBeVisible();
  // Whatever profile Alice has from earlier runs: an allergy conflict holds the button until it is acknowledged.
  const ack = page.getByRole('checkbox', { name: 'I have read this and still want to order' });
  const place = page.getByRole('button', { name: 'Place test order' });
  await expect(page.getByTestId('checking')).toHaveCount(0, { timeout: 20_000 });
  if (await ack.isVisible()) await ack.check();
  await expect(place).toBeEnabled();

  for (let attempt = 1; attempt <= 2; attempt++) {
    await place.click();
    const rejection = page.getByTestId('checkout-rejection');
    await expect(rejection, `attempt ${attempt}: the typed "try again" was not shown`).toHaveAttribute(
      'data-code',
      'TEMPORARILY_UNAVAILABLE',
    );
    await expect(rejection).toContainText('We could not place your order right now. Nothing has been charged');
    await expect(page.getByTestId('checkout-error')).toHaveCount(0); // not the unexpected-error notice with a reference
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(form).toContainText('Country Sourdough'); // the order is still in the cart
  }

  expect(keys, 'one placeOrder per press').toHaveLength(2);
  expect(keys[1], 'the retry must send the same idempotency key').toBe(keys[0]);
  expect(await customerOrderIds(alice), 'no order may be made').toEqual(ordersBefore);
  expect(await quantity(request, vendor, SOURDOUGH), 'no stock may be taken').toBe(stockBefore);

  recordMetrics('catalog-outage', {
    attempts: keys.length,
    sameKeyOnRetry: keys[1] === keys[0],
    ordersMade: 0,
  });
});
