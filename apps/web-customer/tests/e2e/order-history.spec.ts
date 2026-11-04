import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { logIn, logOut, MOCK, stubIssuer } from './helpers';

// WI-CUST-007: the customer's order history. Against the mock BFF, which keeps the orders it is given and, like the real one, needs a bearer token.

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

const control = (body: object) =>
  fetch(`${MOCK}/__control`, { method: 'POST', body: JSON.stringify(body) }).then((r) => {
    if (!r.ok) throw new Error('the mock BFF did not take the state');
  });

async function placeOrder(page: Page) {
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  await page.getByLabel('Quantity').selectOption('2');
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toBeVisible();
  await logIn(page);
  await page.getByTestId('cart-link').click();
  await page.getByRole('button', { name: 'Place test order' }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
}

test.beforeEach(async ({ page }) => {
  await control({ resetOrders: true });
  await stubIssuer(page);
});

test('a customer with no orders is told so, with a way to browse', async ({ page }) => {
  await page.goto('/');
  await logIn(page);

  await page.getByTestId('orders-link').click();

  await expect(page.getByRole('heading', { level: 1, name: 'Your orders' })).toBeVisible();
  await expect(page.getByTestId('history-empty')).toContainText('You have not placed any orders yet.');
  await expect(page.getByTestId('history-order')).toHaveCount(0);
  await expect(page.getByTestId('history-empty').getByRole('link', { name: 'Browse the bakeries' })).toBeVisible();
});

test('a placed order is listed with its status, date, total and a link back to the order', async ({ page }) => {
  await placeOrder(page);
  const orderUrl = page.url();

  await page.getByTestId('orders-link').click();

  const row = page.getByTestId('history-order');
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('history-status')).toHaveText('Order confirmed');
  await expect(row.getByTestId('history-status')).toHaveAttribute('data-status', 'CONFIRMED');
  await expect(row.getByTestId('history-total')).toHaveText('$16.00');
  await expect(row).toContainText('2 items');
  await row.getByRole('link').click();
  await expect(page).toHaveURL(orderUrl);
  await expect(page.getByTestId('order-status')).toHaveText('Order confirmed');
});

test('orders are listed newest first, and older ones are loaded on request without repeats', async ({ page }) => {
  await control({ seedOrders: 25 });
  await page.goto('/orders');
  await logIn(page);

  const rows = page.getByTestId('history-order');
  await expect(rows).toHaveCount(10);
  await page.getByRole('button', { name: 'Show older orders' }).click();
  await expect(rows).toHaveCount(20);
  await page.getByRole('button', { name: 'Show older orders' }).click();
  await expect(rows).toHaveCount(25);
  await expect(page.getByRole('button', { name: 'Show older orders' })).toHaveCount(0);

  const texts = await rows.allInnerTexts();
  expect(new Set(texts).size).toBe(25);
  const times = texts.map((t) => new Date(/· (.*?) ·/.exec(t)![1]! + ' 2026').getTime());
  expect(times).toEqual([...times].sort((a, b) => b - a));
});

test('the page is behind the login, and logging in brings the customer back to it', async ({ page }) => {
  await page.goto('/orders');
  await expect(page.getByTestId('login-required')).toBeVisible();
  await expect(page.getByTestId('history-order')).toHaveCount(0);

  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();

  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByTestId('history-empty')).toBeVisible();
});

test('the server HTML holds no orders, and the answer is not cached', async ({ browser, page }) => {
  await control({ seedOrders: 2 });
  const context = await browser.newContext({ javaScriptEnabled: false });
  const bare = await context.newPage();
  const res = await bare.goto('/orders');
  expect(res?.status()).toBe(200);
  await expect(bare.getByRole('heading', { level: 1, name: 'Your orders' })).toBeVisible();
  await expect(bare.getByTestId('history-order')).toHaveCount(0);
  await context.close();

  await page.goto('/');
  await logIn(page);
  const graphql = page.waitForResponse(
    (r) => r.url().includes('/api/graphql') && (r.request().postData() ?? '').includes('OrderHistoryQuery'),
  );
  await page.getByTestId('orders-link').click();
  expect((await graphql).headers()['cache-control']).toContain('no-store');
});

test('when the orders cannot be loaded the page says so and offers to try again', async ({ page }) => {
  await control({ seedOrders: 2 });
  await page.goto('/');
  await logIn(page);
  await page.route('**/api/graphql', (route) => route.fulfill({ status: 500, body: 'boom' }));
  await page.getByTestId('orders-link').click();
  await expect(page.getByTestId('history-failed')).toContainText('could not load your orders');

  await page.unroute('**/api/graphql');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('history-order')).toHaveCount(2);
});

test('logging out drops the list, so the next person never sees these orders', async ({ page }) => {
  await control({ seedOrders: 2 });
  await page.goto('/orders');
  await logIn(page);
  await expect(page.getByTestId('history-order')).toHaveCount(2);

  await logOut(page);

  await expect(page.getByTestId('history-order')).toHaveCount(0);
  await page.goto('/orders');
  await expect(page.getByTestId('login-required')).toBeVisible();
});
