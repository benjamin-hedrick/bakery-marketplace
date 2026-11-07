import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { adjustStock, quantity, userToken } from './support';

// WI-PORT-004 (ADR-0014 cross-layer rule): checkout does not trust anything the browser holds. An item was added while it was in stock; the bakery sells
// the last of it before the customer checks out; the order is refused by ordering's atomic reservation, with the shortfall, and nothing is taken. Real stack.

const CROISSANT = 'listing-croissant-001'; // limited stock, seeded at 4 (low)

async function logInAsAlice(page: Page) {
  await expect(page).toHaveURL(/localhost:5100\/authorize/);
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
}

test('an item sold out after it was added is refused at checkout with the shortfall, and nothing is taken', async ({
  page,
  request,
}) => {
  const vendor = await userToken('vendor-shop-001');
  const original = await quantity(request, vendor, CROISSANT);
  if (original < 1) await adjustStock(request, vendor, CROISSANT, 2);
  try {
    await page.goto('/');
    await page.getByTestId('listing').filter({ hasText: 'Almond Croissant' }).getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Almond Croissant' })).toBeVisible();
    await page.getByRole('button', { name: 'Add to order' }).click();
    await expect(page.getByTestId('add-notice')).toContainText('Added to your order'); // in stock when it was added

    const now = await quantity(request, vendor, CROISSANT);
    await adjustStock(request, vendor, CROISSANT, -now); // the bakery sells the rest

    await page.getByTestId('cart-link').click();
    await expect(page.getByTestId('login-required')).toBeVisible();
    await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
    await logInAsAlice(page);
    await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();
    await page.getByRole('button', { name: 'Place test order' }).click();

    await expect(page.getByTestId('checkout-rejection')).toHaveAttribute('data-code', 'INSUFFICIENT_STOCK');
    await expect(page.getByTestId('shortfall')).toContainText('Almond Croissant: none left');
    expect(await quantity(request, vendor, CROISSANT)).toBe(0); // the refused order took nothing
  } finally {
    const left = await quantity(request, vendor, CROISSANT);
    if (left !== original) await adjustStock(request, vendor, CROISSANT, original - left); // leave the stock as the other journeys expect it
  }
});
