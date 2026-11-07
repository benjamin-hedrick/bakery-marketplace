import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { logIn, MOCK, stubIssuer } from './helpers';

// The customer's order page keeps its status current by polling while the order can still change (the vendor's screen has the push mechanism, ADR-0021).
// A fake clock drives the five-second tick, so the tests do not wait; the BFF is the mock, which can be told that the bakery moved the order on
// (POST /__control {"orderStatus": ...}) or that reading the order fails. The rules themselves are unit tested in customer-core (OrderPoller).

const control = (body: object) =>
  fetch(`${MOCK}/__control`, { method: 'POST', body: JSON.stringify(body) }).then((r) => {
    if (!r.ok) throw new Error('the mock BFF did not take the control');
  });
const reads = async () =>
  (await (await fetch(`${MOCK}/__reads`)).json()) as { orderReads: number; listingReads: number };

test.beforeEach(() => control({ resetOrders: true }));
test.afterEach(() => control({ resetOrders: true }));

const status = (page: Page) => page.getByTestId('order-status');

/** Places a plain order (confirmed by itself), then reloads its page under a fake clock. */
async function openOrderPage(page: Page) {
  await stubIssuer(page);
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toContainText('Added to your order');
  await logIn(page);
  await page.getByTestId('cart-link').click();
  await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();
  await page.getByRole('button', { name: 'Place test order' }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(status(page)).toBeVisible();

  await page.clock.install();
  await page.reload();
  await expect(status(page)).toHaveAttribute('data-status', 'CONFIRMED');
}

test('the page follows the bakery without a refresh, and stops asking once the order is over', async ({ page }) => {
  await openOrderPage(page);

  for (const next of ['IN_PREPARATION', 'READY_FOR_FULFILLMENT']) {
    await control({ orderStatus: next }); // the bakery acts; nobody touches the page
    await page.clock.runFor(5000);
    await expect(status(page)).toHaveAttribute('data-status', next);
  }
  await expect(status(page)).toHaveText('Ready for pickup');

  await control({ orderStatus: 'COMPLETED' });
  await page.clock.runFor(5000);
  await expect(status(page)).toHaveAttribute('data-status', 'COMPLETED');

  const settled = (await reads()).orderReads;
  await page.clock.runFor(120_000); // two minutes more: a finished order is not asked for again
  expect((await reads()).orderReads).toBe(settled);
});

test('the names of the items are read once, not at every tick', async ({ page }) => {
  await openOrderPage(page);
  const before = (await reads()).listingReads;

  for (let i = 0; i < 4; i++) await page.clock.runFor(5000);
  await expect.poll(async () => (await reads()).orderReads).toBeGreaterThan(3); // it did poll

  expect((await reads()).listingReads).toBe(before);
});

test('a read that fails keeps the page as it was and says so; the next one that works clears it', async ({ page }) => {
  await openOrderPage(page);
  await control({ failOrderReads: true });

  await page.clock.runFor(5000);
  await expect(page.getByTestId('order-stale')).toBeVisible();
  await expect(status(page)).toHaveAttribute('data-status', 'CONFIRMED'); // the last status it had is still there

  await control({ failOrderReads: false, orderStatus: 'IN_PREPARATION' });
  await page.clock.runFor(10_000); // the retry after a failure waits twice as long
  await expect(page.getByTestId('order-stale')).toHaveCount(0);
  await expect(status(page)).toHaveAttribute('data-status', 'IN_PREPARATION');
});

test('while the tab is hidden nothing is asked, and the page catches up the moment it is shown again', async ({
  page,
}) => {
  await openOrderPage(page);
  const hide = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);

  await hide('hidden');
  await control({ orderStatus: 'IN_PREPARATION' });
  const asked = (await reads()).orderReads;
  await page.clock.runFor(60_000);
  expect((await reads()).orderReads).toBe(asked); // a hidden tab costs the service nothing
  await expect(status(page)).toHaveAttribute('data-status', 'CONFIRMED');

  await hide('visible'); // no clock advance: showing the tab reads at once
  await expect(status(page)).toHaveAttribute('data-status', 'IN_PREPARATION');
});

test('Refresh status still works, and does not blank the page while it reads', async ({ page }) => {
  await openOrderPage(page);
  await control({ orderStatus: 'IN_PREPARATION' });

  await page.getByRole('button', { name: 'Refresh status' }).click();

  await expect(status(page)).toHaveAttribute('data-status', 'IN_PREPARATION');
});
