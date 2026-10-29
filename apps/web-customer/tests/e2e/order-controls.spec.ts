import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';

// S1-03: choosing options and a quantity on a listing page and putting the item in the order. The cart is in sessionStorage so it survives
// the login redirect. Everything shown is an estimate; the server prices the order.

async function open(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: name }).getByRole('link').click();
  await expect(page).toHaveURL(/\/listings\//);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

const addToOrder = (page: Page) => page.getByRole('button', { name: 'Add to order' });
const quantity = (page: Page) => page.getByLabel('Quantity');

test('the options are in the server HTML as checkboxes, with their prices and allergens', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  await expect(page.getByLabel('Seed crust (+$1.00) — contains sesame')).toBeVisible();
  await expect(page.getByLabel('Sliced (+$0.00)')).toBeVisible();
  await context.close();
});

test('choosing options and a quantity updates the estimate, and adding puts the item in the order', async ({
  page,
}) => {
  await open(page, 'Country Sourdough');
  await expect(page.getByTestId('line-estimate')).toHaveText('$8.00');

  await page.getByLabel('Seed crust (+$1.00) — contains sesame').check();
  await quantity(page).selectOption('2');
  await expect(page.getByTestId('line-estimate')).toHaveText('$18.00'); // (800 + 100) x 2
  await addToOrder(page).click();

  await expect(page.getByTestId('add-notice')).toContainText('Added to your order');
  await expect(page.getByTestId('cart-link')).toHaveText('Your order (2)');
});

test('the quantity choices stop at the per-order limit', async ({ page }) => {
  await open(page, 'Country Sourdough'); // up to 4 per order
  await expect(quantity(page).locator('option')).toHaveText(['1', '2', '3', '4']);
  await open(page, 'Almond Croissant'); // no per-order limit: the global maximum
  await expect(quantity(page).locator('option')).toHaveCount(20);
});

test('adding the same item again adds to the same line, and going past the limit says so', async ({ page }) => {
  await open(page, 'Country Sourdough');
  await quantity(page).selectOption('3');
  await addToOrder(page).click();
  await expect(page.getByTestId('cart-link')).toHaveText('Your order (3)');

  await quantity(page).selectOption('3');
  await addToOrder(page).click();

  await expect(page.getByTestId('add-notice')).toContainText('limited to 4 per order');
  await expect(page.getByTestId('cart-link')).toHaveText('Your order (4)');
});

test('the order is kept when the page is reloaded', async ({ page }) => {
  await open(page, 'Almond Croissant');
  await addToOrder(page).click();
  await expect(page.getByTestId('cart-link')).toHaveText('Your order (1)');

  await page.reload();

  await expect(page.getByTestId('cart-link')).toHaveText('Your order (1)');
});

test('the saved order holds ids, options and quantities and no token or personal data', async ({ page }) => {
  await open(page, 'Country Sourdough');
  await page.getByLabel('Seed crust (+$1.00) — contains sesame').check();
  await addToOrder(page).click();

  const saved = JSON.parse((await page.evaluate(() => sessionStorage.getItem('bakery.cart'))) ?? '{}');
  expect(saved.vendorId).toBe('vendor-shop-001');
  expect(saved.lines).toHaveLength(1);
  expect(saved.lines[0].modifiers.map((m: { id: string }) => m.id)).toEqual(['mod-seeds']);
  expect(Object.keys(saved)).toEqual(['vendorId', 'lines']);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('an item from another bakery cannot join the order until the customer chooses to start a new one', async ({
  page,
}) => {
  await open(page, 'Country Sourdough');
  await addToOrder(page).click();
  await expect(page.getByTestId('cart-link')).toHaveText('Your order (1)');

  await open(page, 'Oat Milk Latte'); // another vendor
  await addToOrder(page).click();
  await expect(page.getByTestId('add-notice')).toContainText('another bakery');
  await expect(page.getByTestId('cart-link')).toHaveText('Your order (1)'); // unchanged

  await page.getByRole('button', { name: 'Start a new order with this item' }).click();
  await expect(page.getByTestId('add-notice')).toContainText('Added to your order');
  await expect(page.getByTestId('cart-link')).toHaveText('Your order (1)'); // the latte, not the loaf
  const saved = JSON.parse((await page.evaluate(() => sessionStorage.getItem('bakery.cart'))) ?? '{}');
  expect(saved.vendorId).toBe('vendor-indep-001');
});

test('a sold-out item has no way to be ordered', async ({ browser }) => {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-fixture': 'B' } });
  const page = await context.newPage();
  await open(page, 'Cinnamon Roll');
  await expect(page.getByTestId('not-orderable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to order' })).toHaveCount(0);
  await context.close();
});

test('an empty order shows no order link, and choosing things without adding changes nothing', async ({ page }) => {
  await open(page, 'Country Sourdough');
  await page.getByLabel('Seed crust (+$1.00) — contains sesame').check();
  await quantity(page).selectOption('3');
  await expect(page.getByTestId('cart-link')).toHaveCount(0);
});

test('choosing and adding produces no console warnings or errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await open(page, 'Country Sourdough');
  await page.getByLabel('Sliced (+$0.00)').check();
  await addToOrder(page).click();
  await page.reload();
  await expect(page.getByTestId('cart-link')).toBeVisible();
  expect(problems, problems.join('\n')).toEqual([]);
});
