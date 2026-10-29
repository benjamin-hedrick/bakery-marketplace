import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { logIn, logOut, stubIssuer } from './helpers';

// S1-04: the order and its status. Against the mock BFF, which keeps the orders it is given and, like the real one, needs a bearer token.

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

async function placeOrder(page: Page, opts: { name?: string; option?: string; window?: string } = {}) {
  await stubIssuer(page);
  await page.goto('/');
  await page
    .getByTestId('listing')
    .filter({ hasText: opts.name ?? 'Country Sourdough' })
    .getByRole('link')
    .click();
  if (opts.option) await page.getByLabel(opts.option).check();
  await page.getByLabel('Quantity').selectOption('2');
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toBeVisible();
  await logIn(page);
  await page.getByTestId('cart-link').click();
  await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();
  if (opts.window) await page.getByLabel('Pickup time').selectOption({ label: opts.window });
  await page.getByRole('button', { name: 'Place test order' }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
}

test('an order with no options and no pickup time shows as confirmed, with what was ordered and what it cost', async ({
  page,
}) => {
  await placeOrder(page);

  await expect(page.getByTestId('order-status')).toHaveText('Order confirmed');
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'CONFIRMED');
  await expect(page.getByTestId('order-item')).toHaveCount(1);
  await expect(page.getByTestId('order-item')).toContainText('2 × Country Sourdough');
  await expect(page.getByTestId('order-total')).toHaveText('$16.00'); // the server's price: 2 x $8.00
  await expect(page.getByTestId('order-pickup')).toHaveText('No specific pickup time');
  await expect(page.getByTestId('order-reference')).toHaveText(/^[A-Za-z0-9-]{4,8}$/);
  await expect(page.getByText('Test order: no payment was taken.')).toBeVisible();
});

test('an order with an option and a pickup time shows as waiting for the bakery, with the option and the time', async ({
  page,
}) => {
  await placeOrder(page, { option: 'Seed crust (+$1.00) — contains sesame', window: '9:15 AM – 9:30 AM' });

  await expect(page.getByTestId('order-status')).toHaveText('Order received');
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'PLACED');
  await expect(page.getByTestId('order-item')).toContainText('2 × Country Sourdough');
  await expect(page.getByTestId('order-item')).toContainText('Seed crust'); // the option's name, not its id
  await expect(page.getByTestId('order-total')).toHaveText('$18.00'); // 2 x ($8.00 + $1.00)
  await expect(page.getByTestId('order-pickup')).toHaveText('Pickup Tue, Jan 15, 9:15 AM – 9:30 AM');
});

test('the order page is behind the login: after logging in again the same order is shown', async ({ page }) => {
  await placeOrder(page);
  const url = page.url();

  await page.reload(); // a reload ends the login (open item 24)
  await expect(page.getByTestId('login-required')).toBeVisible();
  await expect(page.getByTestId('order-status')).toHaveCount(0);

  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByTestId('order-status')).toHaveText('Order confirmed');
});

test('an order that does not exist reads as not found, never as an error', async ({ page }) => {
  await stubIssuer(page);
  await page.goto(`/orders/${encodeURIComponent(Buffer.from('Order:order-nope').toString('base64'))}`);
  await logIn(page);
  await expect(page.getByTestId('order-missing')).toContainText('could not find that order');
});

test('refreshing asks the server again, since the status moves on without the page knowing', async ({ page }) => {
  await placeOrder(page);
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/graphql') && (r.postData() ?? '').includes('OrderStatusQuery')) requests.push(r.url());
  });

  await page.getByRole('button', { name: 'Refresh status' }).click();

  await expect(page.getByTestId('order-status')).toBeVisible();
  expect(requests).toHaveLength(1);
});

test('when the order cannot be loaded the page says so and offers to try again', async ({ page }) => {
  await placeOrder(page);
  await page.route('**/api/graphql', (route) => route.fulfill({ status: 500, body: 'boom' }));
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.getByTestId('order-failed')).toContainText('could not load your order');

  await page.unroute('**/api/graphql');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('order-status')).toBeVisible();
});

test('logging out drops everything the page learned, so the next person never sees this order', async ({ page }) => {
  await placeOrder(page);
  await expect(page.getByTestId('order-total')).toBeVisible();

  await logOut(page);

  await expect(page.getByText('Country Sourdough', { exact: true }).first()).toBeVisible(); // the public listing, not the order
  await expect(page.getByTestId('order-total')).toHaveCount(0);
  await expect(page.getByTestId('order-status')).toHaveCount(0);
});

test('the server HTML for an order page holds no order data', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const res = await page.goto(`/orders/${encodeURIComponent(Buffer.from('Order:order-1').toString('base64'))}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Your order' })).toBeVisible();
  await expect(page.getByTestId('order-status')).toHaveCount(0);
  await context.close();
});
