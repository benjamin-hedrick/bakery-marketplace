import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page, Request } from '@playwright/test';
import { bffAuthorizations, logIn, stubIssuer } from './helpers';

// S1-03: the checkout, against the mock BFF (which mirrors the real BFF's authentication and its typed rejections). The issuer is stubbed
// in the browser, so the login is the real PKCE flow. Times are shown in the browser's zone, fixed here so labels are exact.

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

interface PlaceOrderInput {
  idempotencyKey: string;
  vendorId: string;
  lineItems: { listingId: string; modifierIds: string[]; quantity: number }[];
  pickupWindow: { start: string; end: string } | null;
}

const isPlaceOrder = (r: Request) => r.url().includes('/api/graphql') && (r.postData() ?? '').includes('placeOrder');
const inputOf = (r: Request): PlaceOrderInput => JSON.parse(r.postData()!).variables.input;

/** Makes the mock BFF handle the next placeOrder calls in a scripted way (see mock-bff/server.mjs). */
async function script(page: Page, scenario: string | null, extra: Record<string, string> = {}) {
  await page.unroute('**/api/graphql');
  if (scenario === null && Object.keys(extra).length === 0) return;
  await page.route('**/api/graphql', (route) => {
    const isOrder = (route.request().postData() ?? '').includes('placeOrder');
    return route.continue({
      headers: {
        ...route.request().headers(),
        ...(isOrder && scenario ? { 'x-place-order': scenario } : {}),
        ...extra,
      },
    });
  });
}

async function addToOrder(page: Page, name: string, opts: { option?: string; quantity?: string } = {}) {
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: name }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  if (opts.option) await page.getByLabel(opts.option).check();
  if (opts.quantity) await page.getByLabel('Quantity').selectOption(opts.quantity);
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toBeVisible();
}

/** An order in the cart, a login through the stubbed issuer, and the checkout page open. */
async function atCheckout(page: Page, name = 'Country Sourdough', opts: { option?: string; quantity?: string } = {}) {
  await stubIssuer(page);
  await addToOrder(page, name, opts);
  await logIn(page);
  await page.getByTestId('cart-link').click();
  await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();
}

const placeButton = (page: Page) => page.getByRole('button', { name: 'Place test order' });

test('the server HTML has the heading and the test banner, and the form waits for the browser and a login', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { level: 1, name: 'Your order' })).toBeVisible();
  await expect(page.getByTestId('test-banner')).toContainText('No real payment is taken');
  await expect(page.getByRole('form', { name: 'Place your order' })).toHaveCount(0);
  await context.close();
});

test('without a login the checkout asks for one, and after logging in the order is still there', async ({ page }) => {
  await stubIssuer(page);
  await addToOrder(page, 'Country Sourdough', { option: 'Seed crust (+$1.00) — contains sesame', quantity: '2' });
  await page.getByTestId('cart-link').click();
  await expect(page.getByTestId('login-required')).toBeVisible();

  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();

  await expect(page).toHaveURL('http://localhost:3000/checkout'); // back where it started
  const line = page.getByTestId('order-line');
  await expect(line).toHaveCount(1);
  await expect(line).toContainText('Country Sourdough');
  await expect(line).toContainText('Seed crust');
  await expect(page.getByLabel('Quantity of Country Sourdough')).toHaveValue('2');
  await expect(page.getByTestId('estimate')).toContainText('$18.00');
});

test('the order can be reviewed: quantities change the estimate, items can be removed, an empty order says so', async ({
  page,
}) => {
  await atCheckout(page, 'Almond Croissant');
  await expect(page.getByTestId('estimate')).toContainText('$4.50');

  await page.getByLabel('Quantity of Almond Croissant').selectOption('3');
  await expect(page.getByTestId('estimate')).toContainText('$13.50');

  await page.getByRole('button', { name: 'Remove Almond Croissant' }).click();
  await expect(page.getByTestId('empty-order')).toBeVisible();
  await expect(page.getByTestId('cart-link')).toHaveCount(0);
});

test("pickup times are offered by day, in the customer's own time zone, with no specific time as the default", async ({
  page,
}) => {
  await atCheckout(page);
  const select = page.getByLabel('Pickup time');
  await expect(select.locator('option').first()).toHaveText('No specific time');
  await expect(select).toHaveValue('');
  await expect(select.locator('optgroup')).toHaveCount(2);
  await expect(select.locator('optgroup').first()).toHaveAttribute('label', 'Tuesday, Jan 15');
  await expect(select.locator('optgroup').first().locator('option').first()).toHaveText('9:00 AM – 9:15 AM'); // 14:00Z in New York
});

test('a plain order is placed with ids and quantities only, with the token, a fresh key, and no window', async ({
  page,
}) => {
  await atCheckout(page, 'Country Sourdough', { quantity: '2' });

  const request = page.waitForRequest(isPlaceOrder);
  await placeButton(page).click();
  const sent = await request;

  const input = inputOf(sent);
  expect(input.idempotencyKey).toMatch(/^checkout-[A-Za-z0-9_-]{16,}$/);
  expect(input.vendorId).toBe('vendor-shop-001');
  expect(input.lineItems).toEqual([
    { listingId: Buffer.from('Listing:listing-sourdough-001').toString('base64'), modifierIds: [], quantity: 2 },
  ]);
  expect(input.pickupWindow).toBeNull();
  expect(sent.headers()['authorization']).toBeUndefined(); // the browser holds no token (ADR-0019) ...
  await expect.poll(async () => (await bffAuthorizations()).at(-1)).toMatch(/^Bearer eyJ/); // ... the server puts it on the call to the BFF
  expect(JSON.stringify(JSON.parse(sent.postData()!).variables)).not.toMatch(/price|total|customer|status/i); // nothing the server decides is sent

  await expect(page).toHaveURL(/\/orders\/.+/);
  expect(await page.evaluate(() => sessionStorage.getItem('bakery.cart'))).toBeNull(); // a placed order leaves the cart empty
  await expect(page.getByTestId('cart-link')).toHaveCount(0);
});

test('an order with an option and a chosen window sends both', async ({ page }) => {
  await atCheckout(page, 'Country Sourdough', { option: 'Seed crust (+$1.00) — contains sesame' });
  await page.getByLabel('Pickup time').selectOption({ label: '9:15 AM – 9:30 AM' });

  const request = page.waitForRequest(isPlaceOrder);
  await placeButton(page).click();
  const input = inputOf(await request);

  expect(input.lineItems[0]!.modifierIds).toEqual(['mod-seeds']);
  expect(input.pickupWindow).toEqual({ start: '2030-01-15T14:15:00+00:00', end: '2030-01-15T14:30:00+00:00' });
  await expect(page).toHaveURL(/\/orders\/.+/);
});

test('the test banner is on the page and next to the button', async ({ page }) => {
  await atCheckout(page);
  await expect(page.getByTestId('test-banner')).toContainText('No real payment is taken');
  await expect(page.getByText('Test checkout: no payment is taken.')).toBeVisible();
});

test.describe('what the customer sees when the order cannot be placed (first-slice contract section 6)', () => {
  test('a declined test payment keeps the order, and the retry uses a new key because the rejected attempt is spent', async ({
    page,
  }) => {
    await atCheckout(page);
    await script(page, null, { 'x-test-payment': 'decline' });

    const first = page.waitForRequest(isPlaceOrder);
    await placeButton(page).click();
    const firstKey = inputOf(await first).idempotencyKey;
    await expect(page.getByTestId('checkout-rejection')).toContainText('The payment was declined.');
    await expect(page.getByTestId('checkout-rejection')).toHaveAttribute('data-code', 'PAYMENT_DECLINED');
    await expect(page.getByTestId('order-line')).toHaveCount(1); // nothing was lost

    // Nothing was placed and the attempt's reservation was given back; ordering will not reserve again under the same key (the order id
    // comes from it), so reusing it would only ever be refused. The real stack showed this (S1-07b).
    const retry = page.waitForRequest(isPlaceOrder);
    await placeButton(page).click();
    expect(inputOf(await retry).idempotencyKey).not.toBe(firstKey);

    await script(page, null); // payment would now be approved
    await placeButton(page).click();
    await expect(page).toHaveURL(/\/orders\/.+/);
  });

  test('after an unexpected failure the retry reuses the key, because an order may exist and the retry then returns it', async ({
    page,
  }) => {
    await atCheckout(page);
    await script(page, 'internal');

    const first = page.waitForRequest(isPlaceOrder);
    await placeButton(page).click();
    const firstKey = inputOf(await first).idempotencyKey;
    await expect(page.getByTestId('checkout-error')).toBeVisible();

    const retry = page.waitForRequest(isPlaceOrder);
    await placeButton(page).click();
    expect(inputOf(await retry).idempotencyKey).toBe(firstKey);
  });

  test('changing the order gets a new key, so the server never sees one key with two different orders', async ({
    page,
  }) => {
    await atCheckout(page, 'Country Sourdough', { quantity: '2' });
    await script(page, 'internal'); // an outcome the customer cannot know, so the key is kept...

    const first = page.waitForRequest(isPlaceOrder);
    await placeButton(page).click();
    const firstKey = inputOf(await first).idempotencyKey;
    await expect(page.getByTestId('checkout-error')).toBeVisible();

    await page.getByLabel('Quantity of Country Sourdough').selectOption('3'); // ...until the order itself changes
    await expect(page.getByTestId('checkout-error')).toHaveCount(0); // the message was about the old order
    const second = page.waitForRequest(isPlaceOrder);
    await placeButton(page).click();
    expect(inputOf(await second).idempotencyKey).not.toBe(firstKey);
  });

  test('not enough stock names the item, says how many are left, and lets the customer take that many', async ({
    page,
  }) => {
    await atCheckout(page, 'Country Sourdough', { quantity: '3' });
    await script(page, 'shortfall');

    await placeButton(page).click();

    await expect(page.getByTestId('checkout-rejection')).toHaveAttribute('data-code', 'INSUFFICIENT_STOCK');
    await expect(page.getByTestId('shortfall')).toContainText('Country Sourdough: only 1 available');
    await page.getByRole('button', { name: 'Change to 1' }).click();
    await expect(page.getByLabel('Quantity of Country Sourdough')).toHaveValue('1');
    await expect(page.getByTestId('checkout-rejection')).toHaveCount(0);
  });

  test('an item that is no longer available says so and points back to the bakeries', async ({ page }) => {
    await atCheckout(page);
    await script(page, 'rejected:LISTING_UNAVAILABLE');
    await placeButton(page).click();
    await expect(page.getByTestId('checkout-rejection')).toContainText('no longer available');
    await expect(page.getByRole('link', { name: 'Back to the bakeries' })).toBeVisible();
    await expect(page.getByTestId('order-line')).toHaveCount(1);
  });

  test("a quantity the server refuses shows the server's field message", async ({ page }) => {
    await atCheckout(page);
    await script(page, 'rejected:INVALID_QUANTITY');
    await placeButton(page).click();
    await expect(page.getByTestId('checkout-rejection')).toContainText('Quantity must be between 1 and 4.');
  });

  test('a pickup time that is no longer open clears the choice and reloads what is open now', async ({ page }) => {
    await atCheckout(page);
    await page.getByLabel('Pickup time').selectOption({ label: '9:00 AM – 9:15 AM' });
    await script(page, 'rejected:PICKUP_WINDOW_UNAVAILABLE');
    const windowRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/graphql') && (r.postData() ?? '').includes('pickupWindows'))
        windowRequests.push(r.url());
    });

    await placeButton(page).click();

    await expect(page.getByTestId('checkout-rejection')).toContainText('no longer available');
    await expect(page.getByLabel('Pickup time')).toHaveValue('');
    await expect.poll(() => windowRequests.length).toBeGreaterThan(0);
  });

  test('an unexpected failure gives a calm message with a reference, and the order is kept', async ({ page }) => {
    await atCheckout(page);
    await script(page, 'internal');
    await placeButton(page).click();
    await expect(page.getByTestId('checkout-error')).toContainText('could not place your order');
    await expect(page.getByTestId('checkout-error')).toContainText('0123456789abcdef0123456789abcdef');
    await expect(page.getByTestId('order-line')).toHaveCount(1);
  });

  test('a login that has ended sends the customer back to log in, and the order is still there afterwards', async ({
    page,
  }) => {
    await atCheckout(page);
    await script(page, 'unauthenticated');

    await placeButton(page).click();

    await expect(page.getByTestId('login-required')).toBeVisible();
    await script(page, null);
    await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByTestId('order-line')).toHaveCount(1);
    await placeButton(page).click();
    await expect(page).toHaveURL(/\/orders\/.+/);
  });

  test('pressing the button twice places one order', async ({ page }) => {
    await atCheckout(page);
    await script(page, 'slow');
    const requests: Request[] = [];
    page.on('request', (r) => {
      if (isPlaceOrder(r)) requests.push(r);
    });

    await placeButton(page).click();
    await expect(page.getByRole('button', { name: 'Placing your order…' })).toBeDisabled();
    await page
      .getByRole('button', { name: 'Placing your order…' })
      .click({ force: true, noWaitAfter: true })
      .catch(() => {});

    await expect(page).toHaveURL(/\/orders\/.+/);
    expect(requests).toHaveLength(1);
  });
});

test('placing an order produces no console warnings or errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await atCheckout(page);
  await placeButton(page).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  expect(
    problems.filter((p) => !p.includes('404')),
    problems.join('\n'),
  ).toEqual([]);
});
