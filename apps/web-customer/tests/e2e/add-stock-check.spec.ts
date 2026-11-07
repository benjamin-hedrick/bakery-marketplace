import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MOCK } from './helpers';

// WI-CUST-009: adding an item to the order reads its stock again first (always from the network), and decides from that read. Against the mock
// BFF, whose stock can be changed after the page has loaded (POST /__control {"stock": ...}); checkout's own check is covered elsewhere.

const SOURDOUGH = 'listing-sourdough-001'; // in stock, up to 4 per order in the fixture

const control = (body: object) =>
  fetch(`${MOCK}/__control`, { method: 'POST', body: JSON.stringify(body) }).then((r) => {
    if (!r.ok) throw new Error('the mock BFF did not take the control');
  });
const listingReads = async () =>
  ((await (await fetch(`${MOCK}/__reads`)).json()) as { listingReads: number }).listingReads;

test.beforeEach(() => control({ resetStock: true }));
test.afterEach(() => control({ resetStock: true }));

async function openSourdough(page: Page) {
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  await expect(page).toHaveURL(/\/listings\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Country Sourdough' })).toBeVisible();
  await expect(page.getByTestId('stock')).toHaveText('In stock');
}

test('an item that is still in stock is added, and the press read the listing once from the network', async ({
  page,
}) => {
  await openSourdough(page);
  const before = await listingReads();

  await page.getByRole('button', { name: 'Add to order' }).click();

  await expect(page.getByTestId('add-notice')).toContainText('Added to your order');
  await expect(page.getByTestId('cart-link')).toHaveText('Your order (1)');
  expect((await listingReads()) - before).toBe(1);
});

test('an item that sold out after the page loaded is not added, the customer is told, and the page follows', async ({
  page,
}) => {
  await openSourdough(page);
  await control({ stock: { [SOURDOUGH]: { status: 'SOLD_OUT', maxPerOrder: 4 } } });

  await page.getByRole('button', { name: 'Add to order' }).click();

  const notice = page.getByTestId('add-notice');
  await expect(notice).toHaveAttribute('data-refusal', 'sold_out');
  await expect(notice).toContainText('just sold out');
  await expect(page.getByTestId('cart-link')).toHaveCount(0); // nothing was added
  await expect(page.getByTestId('stock')).toHaveText('Sold out'); // the stored listing was refreshed by the read
  await expect(page.getByTestId('not-orderable')).toBeVisible();
});

test('when the stock cannot be read nothing is added and the customer is told; trying again works', async ({
  page,
}) => {
  await openSourdough(page);
  await control({ failListingReads: true });

  await page.getByRole('button', { name: 'Add to order' }).click();

  await expect(page.getByTestId('add-notice')).toHaveAttribute('data-refusal', 'check_failed');
  await expect(page.getByTestId('add-notice')).toContainText('could not check');
  await expect(page.getByTestId('cart-link')).toHaveCount(0);
  await expect(page.getByTestId('stock')).toHaveText('In stock'); // an unknown is not shown as sold out

  await control({ failListingReads: false });
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toContainText('Added to your order');
  await expect(page.getByTestId('cart-link')).toHaveText('Your order (1)');
});

test('a quantity above the limit the fresh read reports is added at that limit, and says so', async ({ page }) => {
  await openSourdough(page);
  await page.getByLabel('Quantity').selectOption('3'); // the page offered up to 4
  await control({ stock: { [SOURDOUGH]: { status: 'IN_STOCK', maxPerOrder: 2 } } });

  await page.getByRole('button', { name: 'Add to order' }).click();

  await expect(page.getByTestId('add-notice')).toContainText('limited to 2 per order');
  await expect(page.getByTestId('cart-link')).toHaveText('Your order (2)');
});
