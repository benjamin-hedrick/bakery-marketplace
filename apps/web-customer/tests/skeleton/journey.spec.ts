import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { adjustStock, quantity, userToken } from './support';

// S1-07b: the slice-1 customer journey in a browser, against everything real: Next.js, the GraphQL BFF, ordering-service, catalog-service,
// Cosmos, Redis and the mock OIDC issuer's own login page. Browse, customize, log in, order, and see the confirmation, with both
// states an order can start in (confirmed by itself, or waiting for the bakery) and the failures a customer can hit.
// No vendor action and no timer is needed anywhere: the automatic confirmation rule (WI-ORD-008) gives both states.
// Needs the whole local stack (docs/operations/local-dev.md); node scripts/ci/skeleton-smoke.mjs starts it.

const SOURDOUGH = 'listing-sourdough-001';
const CROISSANT = 'listing-croissant-001';

const placeButton = (page: Page) => page.getByRole('button', { name: 'Place test order' });

/** Opens a listing from the home page, the way a customer would. */
async function openListing(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: name }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

async function addToOrder(page: Page, name: string, opts: { option?: string; quantity?: string } = {}) {
  await openListing(page, name);
  if (opts.option) await page.getByLabel(opts.option).check();
  if (opts.quantity) await page.getByLabel('Quantity').selectOption(opts.quantity);
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toContainText('Added to your order');
}

/** The real issuer's own login page, and the redirect back. */
async function logInAsAlice(page: Page) {
  await expect(page).toHaveURL(/localhost:5100\/authorize/);
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
}

/** From a cart with something in it to the checkout form, logging in on the way (the cart must survive the trip to the issuer). */
async function toCheckout(page: Page) {
  await page.getByTestId('cart-link').click();
  await expect(page.getByTestId('login-required')).toBeVisible();
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await logInAsAlice(page);
  await expect(page).toHaveURL('http://localhost:3000/checkout');
  await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();
}

test('a plain order: browse, choose, log in, order, and it is confirmed by itself', async ({
  page,
  request,
  browser,
}) => {
  const vendor = await userToken('vendor-shop-001');
  const before = await quantity(request, vendor, SOURDOUGH);

  await openListing(page, 'Country Sourdough');
  await expect(page.getByTestId('stock')).toHaveText('In stock');
  await expect(page.getByText('up to 4 per order')).toBeVisible();
  await page.getByLabel('Quantity').selectOption('2');
  await expect(page.getByTestId('line-estimate')).toHaveText('$16.00');
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('cart-link')).toHaveText('Your order (2)');

  await toCheckout(page); // not logged in yet: the gate, the real issuer, and back with the order still there
  await expect(page.getByTestId('order-line')).toContainText('Country Sourdough');
  await expect(page.getByTestId('estimate')).toContainText('$16.00');
  await expect(page.getByLabel('Pickup time')).toBeEnabled(); // the real pickup times arrived
  await placeButton(page).click();

  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByTestId('order-status')).toHaveText('Order confirmed'); // no options, no window: nobody had to act
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'CONFIRMED');
  await expect(page.getByTestId('order-item')).toContainText('2 × Country Sourdough');
  await expect(page.getByTestId('order-total')).toHaveText('$16.00'); // priced by ordering from the catalog
  await expect(page.getByTestId('order-pickup')).toHaveText('No specific pickup time');
  await expect(page.getByTestId('cart-link')).toHaveCount(0); // placed: the order was emptied

  expect(await quantity(request, vendor, SOURDOUGH)).toBe(before - 2); // really reserved at the catalog

  // The order is the customer's own: a visitor with the link and no login sees a gate, and no order.
  const orderUrl = page.url();
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(orderUrl);
  await expect(visitor.getByTestId('login-required')).toBeVisible();
  await expect(visitor.getByTestId('order-total')).toHaveCount(0);
  await visitor.context().close();

  await page.reload(); // a reload ends the login (open item 24): the same link asks again, then shows the same order
  await expect(page.getByTestId('login-required')).toBeVisible();
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await logInAsAlice(page);
  await expect(page.getByTestId('order-status')).toHaveText('Order confirmed');
});

test('an order with an option and a pickup time waits for the bakery, with the option and the time shown', async ({
  page,
}) => {
  await addToOrder(page, 'Country Sourdough', { option: 'Add seeds (+$1.00) — contains sesame' });
  await toCheckout(page);

  const times = page.getByLabel('Pickup time');
  await expect(times).toBeEnabled();
  await times.selectOption({ index: 1 }); // the first real window ordering offers
  await placeButton(page).click();

  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByTestId('order-status')).toHaveText('Order received'); // an option and a time: the bakery decides
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'PLACED');
  await expect(page.getByTestId('order-item')).toContainText('1 × Country Sourdough');
  await expect(page.getByTestId('order-item')).toContainText('Add seeds');
  await expect(page.getByTestId('order-total')).toHaveText('$9.00'); // $8.00 + $1.00, priced by the server
  await expect(page.getByTestId('order-pickup')).toHaveText(/^Pickup .+\d:\d\d [AP]M – \d:\d\d [AP]M$/);
});

test('a declined test payment keeps the order and takes nothing; the same order then goes through', async ({
  page,
  request,
}) => {
  const vendor = await userToken('vendor-shop-001');
  const before = await quantity(request, vendor, SOURDOUGH);
  await addToOrder(page, 'Country Sourdough');
  await toCheckout(page);

  await page.route('**/api/graphql', (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        ...((route.request().postData() ?? '').includes('placeOrder') ? { 'x-test-payment': 'decline' } : {}),
      },
    }),
  );
  await placeButton(page).click();
  await expect(page.getByTestId('checkout-rejection')).toContainText('The payment was declined.');
  await expect(page.getByTestId('checkout-rejection')).toHaveAttribute('data-code', 'PAYMENT_DECLINED');
  await expect(page.getByTestId('order-line')).toHaveCount(1); // the order is still there
  expect(await quantity(request, vendor, SOURDOUGH)).toBe(before); // reserved, then given back

  await page.unroute('**/api/graphql'); // the same order, the same idempotency key, now approved
  await placeButton(page).click();
  await expect(page.getByTestId('order-status')).toHaveText('Order confirmed');
  expect(await quantity(request, vendor, SOURDOUGH)).toBe(before - 1);
});

test('asking for more than is in stock says how many are left, and taking that many works', async ({
  page,
  request,
}) => {
  const vendor = await userToken('vendor-shop-001');
  const before = await quantity(request, vendor, CROISSANT); // the seed has 4
  await openListing(page, 'Almond Croissant');
  await expect(page.getByTestId('stock')).toHaveText('Low stock');
  await page.getByLabel('Quantity').selectOption(String(before + 1)); // one more than there are
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toContainText('Added to your order');
  await toCheckout(page);

  await placeButton(page).click();

  await expect(page.getByTestId('checkout-rejection')).toHaveAttribute('data-code', 'INSUFFICIENT_STOCK');
  await expect(page.getByTestId('shortfall')).toContainText(`Almond Croissant: only ${before} available`);
  expect(await quantity(request, vendor, CROISSANT)).toBe(before); // nothing was taken by the refused order

  await page.getByRole('button', { name: `Change to ${before}` }).click();
  await expect(page.getByLabel('Quantity of Almond Croissant')).toHaveValue(String(before));
  await placeButton(page).click();

  await expect(page.getByTestId('order-status')).toHaveText('Order confirmed');
  await expect(page.getByTestId('order-item')).toContainText(`${before} × Almond Croissant`);
  expect(await quantity(request, vendor, CROISSANT)).toBe(0);

  await page.goto('/'); // and the shelf now says so
  await expect(page.getByTestId('listing').filter({ hasText: 'Almond Croissant' }).getByTestId('stock')).toHaveText(
    'Sold out',
  );
});

test('a sold-out item cannot be ordered', async ({ page, request }) => {
  const vendor = await userToken('vendor-shop-001');
  const left = await quantity(request, vendor, CROISSANT);
  if (left > 0) await adjustStock(request, vendor, CROISSANT, -left); // the bakery has sold the last one
  await openListing(page, 'Almond Croissant');
  await expect(page.getByTestId('stock')).toHaveText('Sold out');
  await expect(page.getByTestId('not-orderable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to order' })).toHaveCount(0);
});

test('the journey produces no console warnings or errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await addToOrder(page, 'Oat Milk Latte');
  await toCheckout(page);
  await placeButton(page).click();
  await expect(page.getByTestId('order-status')).toBeVisible();

  expect(problems, problems.join('\n')).toEqual([]);
});
