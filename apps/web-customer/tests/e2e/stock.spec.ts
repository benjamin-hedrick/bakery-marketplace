import { expect, test } from '@playwright/test';

// S1-05 (open item 64): customers see availability as a status, in the server HTML, on the list and on the detail page.

const row = (page: import('@playwright/test').Page, name: string) =>
  page.getByTestId('listing').filter({ hasText: name });

test('the list shows in stock and low stock in the server HTML, before any JavaScript runs', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(row(page, 'Country Sourdough').getByTestId('stock')).toHaveText('In stock');
  await expect(row(page, 'Almond Croissant').getByTestId('stock')).toHaveText('Low stock');
  await expect(row(page, 'Almond Croissant').getByTestId('stock')).toHaveAttribute('data-status', 'LOW');
  await context.close();
});

test('a sold-out item says so on the list and on its detail page', async ({ browser }) => {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-fixture': 'B' } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(row(page, 'Cinnamon Roll').getByTestId('stock')).toHaveText('Sold out');
  await expect(row(page, 'Dark Rye Loaf').getByTestId('stock')).toHaveText('In stock');
  await row(page, 'Cinnamon Roll').getByRole('link').click();
  await expect(page).toHaveURL(/\/listings\//); // wait for the navigation before looking for the detail page's badge
  await expect(page.getByTestId('stock')).toHaveText('Sold out');
  await context.close();
});

test('the detail page shows the per-order limit when there is one', async ({ page }) => {
  await page.goto('/');
  await row(page, 'Country Sourdough').getByRole('link').click();
  await expect(page).toHaveURL(/\/listings\//);
  await expect(page.getByTestId('stock')).toHaveText('In stock');
  await expect(page.getByText('up to 4 per order')).toBeVisible();
});
