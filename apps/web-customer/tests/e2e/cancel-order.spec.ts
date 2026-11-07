import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { logIn, MOCK, stubIssuer } from './helpers';

// A customer cancels their own order from its page, while it is placed or confirmed. Against the mock BFF, which follows ordering's rule (only from
// PLACED or CONFIRMED) and can be told that the bakery has moved the order on (POST /__control {"orderStatus": ...}) or that the cancel fails.

const control = (body: object) =>
  fetch(`${MOCK}/__control`, { method: 'POST', body: JSON.stringify(body) }).then((r) => {
    if (!r.ok) throw new Error('the mock BFF did not take the control');
  });

test.beforeEach(() => control({ resetOrders: true }));
test.afterEach(() => control({ resetOrders: true }));

/** Places a plain order (confirmed by itself) or one with an option (waits for the bakery) and stays on its page. */
async function placeOrder(page: Page, opts: { waits?: boolean } = {}) {
  await stubIssuer(page);
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  if (opts.waits) await page.getByLabel('Seed crust (+$1.00) — contains sesame').check();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toContainText('Added to your order');
  await logIn(page);
  await page.getByTestId('cart-link').click();
  await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();
  await page.getByRole('button', { name: 'Place test order' }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByTestId('order-status')).toBeVisible();
}

test('a confirmed order can be cancelled after a question, and the page then says so', async ({ page }) => {
  await placeOrder(page);
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'CONFIRMED');

  await page.getByTestId('cancel-order').click();
  await expect(page.getByTestId('cancel-question')).toContainText('Cancel this order?');
  await page.getByRole('button', { name: 'Keep it' }).click(); // nothing was sent
  await expect(page.getByTestId('cancel-question')).toHaveCount(0);
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'CONFIRMED');

  await page.getByTestId('cancel-order').click();
  await page.getByTestId('cancel-confirm').click();

  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'CANCELLED');
  await expect(page.getByTestId('order-status')).toHaveText('Order cancelled');
  await expect(page.getByTestId('cancel-note')).toHaveAttribute('data-outcome', 'cancelled');
  await expect(page.getByTestId('cancel-order')).toHaveCount(0); // nothing left to cancel
});

test('an order that is waiting for the bakery can be cancelled too', async ({ page }) => {
  await placeOrder(page, { waits: true });
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'PLACED');

  await page.getByTestId('cancel-order').click();
  await page.getByTestId('cancel-confirm').click();

  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'CANCELLED');
});

test('too late: the bakery started while the page was open, so the cancel is refused and the page shows where the order is', async ({
  page,
}) => {
  await placeOrder(page);
  await control({ orderStatus: 'IN_PREPARATION' }); // the page still shows a cancel button from before

  await page.getByTestId('cancel-order').click();
  await page.getByTestId('cancel-confirm').click();

  await expect(page.getByTestId('cancel-note')).toHaveAttribute('data-outcome', 'not_allowed_now');
  await expect(page.getByTestId('cancel-note')).toContainText('can no longer be cancelled');
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'IN_PREPARATION'); // read again from ordering
  await expect(page.getByTestId('cancel-order')).toHaveCount(0);
});

test('when the cancel fails nothing changes, the customer is told, and trying again works', async ({ page }) => {
  await placeOrder(page);
  await control({ failCancel: true });

  await page.getByTestId('cancel-order').click();
  await page.getByTestId('cancel-confirm').click();

  await expect(page.getByTestId('cancel-note')).toHaveAttribute('data-outcome', 'failed');
  await expect(page.getByTestId('cancel-note')).toContainText('has not changed');
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'CONFIRMED');
  await expect(page.getByTestId('cancel-order')).toBeVisible();

  await control({ failCancel: false });
  await page.getByTestId('cancel-order').click();
  await page.getByTestId('cancel-confirm').click();
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'CANCELLED');
});

test('an order the bakery is preparing or has finished offers no cancel button', async ({ page }) => {
  await placeOrder(page);

  for (const status of ['IN_PREPARATION', 'READY_FOR_FULFILLMENT', 'COMPLETED']) {
    await control({ orderStatus: status });
    await page.getByRole('button', { name: 'Refresh status' }).click();
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', status);
    await expect(page.getByTestId('cancel-order'), status).toHaveCount(0);
  }
});
