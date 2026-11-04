import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { userToken } from './support';

// WI-CUST-007 on the real stack: the customer's order list through Next.js, the GraphQL BFF, ordering-service and Cosmos. An order placed in the
// browser is the first row of the list, the list pages, and a vendor's token is refused. (The mock issuer has one customer, so another
// customer's orders cannot be tried here; that is covered by the ordering API tests, not by this run.)
// Needs the whole local stack (docs/operations/local-dev.md); node scripts/ci/skeleton-smoke.mjs starts it.

async function logInAsAlice(page: Page) {
  await expect(page).toHaveURL(/localhost:5100\/authorize/);
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
}

async function placePlainOrder(page: Page) {
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toContainText('Added to your order');
  await page.getByTestId('cart-link').click();
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await logInAsAlice(page);
  await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();
  await page.getByRole('button', { name: 'Place test order' }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByTestId('order-status')).toHaveText('Order confirmed');
  return (await page.getByTestId('order-reference').innerText()).trim();
}

test('an order placed in the browser is the newest row of the history, and the history pages', async ({ page }) => {
  const reference = await placePlainOrder(page);
  const orderUrl = page.url();

  await page.getByTestId('orders-link').click();

  await expect(page).toHaveURL(/\/orders$/);
  const rows = page.getByTestId('history-order');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText(reference); // newest first
  await expect(rows.first().getByTestId('history-status')).toHaveText('Order confirmed');
  await expect(rows.first().getByTestId('history-total')).toHaveText('$8.00');
  const firstPage = await rows.count();
  expect(firstPage).toBeLessThanOrEqual(10);

  // Earlier tests of the same run placed orders for the same customer; when there are more than a page, the rest load without repeats.
  const more = page.getByRole('button', { name: 'Show older orders' });
  if ((await more.count()) > 0) {
    await more.click();
    await expect(rows).not.toHaveCount(firstPage);
    const texts = await rows.allInnerTexts();
    expect(new Set(texts).size).toBe(texts.length);
  }

  await rows.first().getByRole('link').click();
  await expect(page).toHaveURL(orderUrl);
});

test('a vendor’s token is refused the customer’s order list, and no token gets nothing', async ({ request }) => {
  const query = { query: '{ orders(first: 5) { edges { node { id } } } }' };
  const vendor = await userToken('vendor-shop-001');

  const asVendor = await request.post('http://localhost:4100/graphql', {
    headers: { authorization: `Bearer ${vendor}` },
    data: query,
  });
  const anonymous = await request.post('http://localhost:4100/graphql', { data: query });

  expect((await asVendor.json()).errors[0].extensions.code).toBe('FORBIDDEN');
  expect((await anonymous.json()).errors[0].extensions.code).toBe('UNAUTHENTICATED');
});
