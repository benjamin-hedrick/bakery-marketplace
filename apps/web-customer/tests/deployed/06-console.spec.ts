import { LISTINGS, expect, placeButton, addToOrder, test, toCheckout } from './support';

// Test 10 of the deployed suite (register 218): the production build in the browser, over https on the deployed addresses (mixed content, a Content
// Security Policy that names the wrong origin or a hydration mismatch would show here and not locally). The latte is made to order.

test('10. a whole journey produces no console warnings or errors, and no page error', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await addToOrder(page, LISTINGS.latte);
  await toCheckout(page);
  await placeButton(page).click();
  await expect(page.getByTestId('order-status')).toBeVisible();
  await page.getByTestId('orders-link').click();
  await expect(page.getByTestId('history-order').first()).toBeVisible();

  expect(problems, problems.join('\n')).toEqual([]);
});
