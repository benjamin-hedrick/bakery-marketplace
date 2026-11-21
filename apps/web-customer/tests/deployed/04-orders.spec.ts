import type { Page } from '@playwright/test';
import { CUSTOMERS, LISTINGS, WEB, addToOrder, expect, logInAs, placeButton, test, toCheckout } from './support';

// Tests 5 to 8 of the deployed suite (register 218): orders through the web app, the BFF and ordering, which reserves stock at the catalog with its own
// service token (client credentials from the mock issuer, ADR-0018, the client secret from Key Vault): the first time services reach the issuer in a
// deployed environment (item 102). Prices are read from the page and compared, never assumed. The latte is made to order, so tests 7 and 8 use no stock.
// Tests 5 and 6 order the Wheat and Rye Loaf, stocked deep for them: a deployed environment keeps its stock between deploys, and the sourdough they
// ordered before (12 units, two a run) would have sold out after six runs (the croissant of test 9 did, 2026-11-21).

/** The checkout's estimate, then the order placed; returns the estimate shown before placing. */
async function place(page: Page) {
  const estimate = (await page.getByTestId('estimate').innerText()).trim();
  await placeButton(page).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  return estimate;
}

/** The newest pickup window offered (days away, so it cannot slip inside the lead time while the test runs). */
async function chooseLastPickupTime(page: Page) {
  const times = page.getByLabel('Pickup time');
  await times.selectOption({ index: (await times.locator('option').count()) - 1 });
  return (await times.locator('option:checked').innerText()).trim();
}

test("5. a plain order: browse, choose, log in, order; confirmed by itself, the customer's own, and the login survives a reload", async ({
  page,
  browser,
}) => {
  await addToOrder(page, LISTINGS.loaf);
  await toCheckout(page);
  await expect(page.getByTestId('order-line')).toContainText(LISTINGS.loaf);
  const estimate = await place(page);

  await expect(page.getByTestId('order-status')).toHaveText('Order confirmed'); // no options, no time: nobody had to act
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'CONFIRMED');
  await expect(page.getByTestId('order-item')).toContainText(`1 × ${LISTINGS.loaf}`);
  await expect(page.getByTestId('order-total')).toHaveText(estimate.replace(/^.*?(\$[\d.,]+).*$/, '$1')); // priced by ordering from the catalog
  await expect(page.getByTestId('order-pickup')).toHaveText('No specific pickup time');
  await expect(page.getByTestId('cart-link')).toHaveCount(0);

  // A visitor with the link and no login sees a gate and no order.
  const orderUrl = page.url();
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(orderUrl);
  await expect(visitor.getByTestId('login-required')).toBeVisible();
  await expect(visitor.getByTestId('order-total')).toHaveCount(0);
  await visitorContext.close();

  await page.reload();
  await expect(page.getByTestId('order-status')).toHaveText('Order confirmed');

  const loggedOut = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Log out' }).click();
  await loggedOut;
  await page.goto(orderUrl);
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await logInAs(page, CUSTOMERS.alice);
  await expect(page).toHaveURL(orderUrl);
  await expect(page.getByTestId('order-status')).toHaveText('Order confirmed');
});

test('6. an order with an option and a pickup time waits for the bakery, with the option and the time shown', async ({
  page,
}) => {
  await addToOrder(page, LISTINGS.loaf, { option: /Sliced/ });
  await toCheckout(page);
  const chosen = await chooseLastPickupTime(page);
  expect(chosen).toMatch(/\d/);
  const estimate = await place(page);

  await expect(page.getByTestId('order-status')).toHaveText('Order received'); // an option and a time: the bakery decides
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'PLACED');
  await expect(page.getByTestId('order-item')).toContainText(`1 × ${LISTINGS.loaf}`);
  await expect(page.getByTestId('order-item')).toContainText('Sliced');
  await expect(page.getByTestId('order-total')).toHaveText(estimate.replace(/^.*?(\$[\d.,]+).*$/, '$1'));
  await expect(page.getByTestId('order-pickup')).toContainText(chosen);
});

test("7. an order placed in the browser is the newest row of the customer's order history, and the row leads back to it", async ({
  page,
}) => {
  await addToOrder(page, LISTINGS.latte);
  await toCheckout(page);
  await place(page);
  await expect(page.getByTestId('order-status')).toHaveText('Order confirmed');
  const reference = (await page.getByTestId('order-reference').innerText()).trim();
  const orderUrl = page.url();

  await page.getByTestId('orders-link').click();
  await expect(page).toHaveURL(`${WEB}/orders`);
  const rows = page.getByTestId('history-order');
  await expect(rows.first()).toContainText(reference); // newest first
  await expect(rows.first().getByTestId('history-status')).toHaveText('Order confirmed');
  expect(await rows.count()).toBeLessThanOrEqual(10); // one page

  const more = page.getByRole('button', { name: 'Show older orders' });
  if ((await more.count()) > 0) {
    const firstPage = await rows.count();
    await more.click();
    await expect(rows).not.toHaveCount(firstPage);
    const texts = await rows.allInnerTexts();
    expect(new Set(texts).size).toBe(texts.length); // no repeats across pages
  }

  await rows.first().getByRole('link').click();
  await expect(page).toHaveURL(orderUrl);
});

test('8. the customer cancels a waiting order from its page, and the page then says it is cancelled', async ({
  page,
}) => {
  await addToOrder(page, LISTINGS.latte, { option: /Extra shot/ });
  await toCheckout(page);
  await place(page);
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'PLACED'); // an option: it waits, so it can be cancelled

  await page.getByTestId('cancel-order').click();
  await page.getByTestId('cancel-confirm').click();
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'CANCELLED');
  await expect(page.getByTestId('cancel-note')).toHaveAttribute('data-outcome', 'cancelled');

  await page.reload(); // it is the stored state, not only the page's
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'CANCELLED');
});
