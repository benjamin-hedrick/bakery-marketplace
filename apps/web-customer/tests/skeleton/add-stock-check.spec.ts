import { expect, test } from '@playwright/test';
import { adjustStock, quantity, userToken } from './support';

// WI-CUST-009 on the real stack: a customer's page was loaded while the item was available, the bakery then sells the last of it, and pressing "Add to
// order" reads the stock again (through the BFF, ordering's neighbour the catalog, and its cache, which a change of status invalidates) and refuses.
// Needs the whole local stack; node scripts/ci/skeleton-smoke.mjs starts it.

const CROISSANT = 'listing-croissant-001'; // limited stock, seeded at 4 (low)

test('an item the bakery sold out after the page loaded is not added, and the customer is told', async ({
  page,
  request,
}) => {
  const vendor = await userToken('vendor-shop-001');
  const original = await quantity(request, vendor, CROISSANT);
  if (original < 1) await adjustStock(request, vendor, CROISSANT, 2); // something to be sold during the test
  try {
    await page.goto('/');
    await page.getByTestId('listing').filter({ hasText: 'Almond Croissant' }).getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Almond Croissant' })).toBeVisible();
    await expect(page.getByTestId('stock')).not.toHaveText('Sold out');
    await expect(page.getByRole('button', { name: 'Add to order' })).toBeVisible();

    // The bakery sells the last ones. The page the customer is looking at does not know.
    const now = await quantity(request, vendor, CROISSANT);
    await adjustStock(request, vendor, CROISSANT, -now);

    await page.getByRole('button', { name: 'Add to order' }).click();

    await expect(page.getByTestId('add-notice')).toHaveAttribute('data-refusal', 'sold_out');
    await expect(page.getByTestId('cart-link')).toHaveCount(0); // nothing was added
    await expect(page.getByTestId('stock')).toHaveText('Sold out'); // the page followed the read
  } finally {
    const left = await quantity(request, vendor, CROISSANT);
    if (left !== original) await adjustStock(request, vendor, CROISSANT, original - left); // leave the stock as the other journeys expect it
  }
});
