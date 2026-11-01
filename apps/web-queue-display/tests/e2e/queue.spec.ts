import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fakeToken, logInAsVendor, mockRequests, order, resetMock, setMock, stubIssuer } from './helpers';

// WI-QUE-002: the live queue. The issuer is stubbed in the browser and the BFF is the mock; the clock is Playwright's, so a poll is a step,
// not a wait.

const POLL_MS = 7000;

test.beforeEach(async () => {
  await resetMock();
});

const ordersInColumns = async (page: Page, column: 'new' | 'preparing' | 'ready') =>
  page.getByTestId(`column-${column}`).getByTestId('reference').allTextContents();

test('without a login the screen offers to log in and asks the service for nothing', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('login-required')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in' }).first()).toBeVisible();
  expect((await mockRequests()).requests).toBe(0);
});

test('after login the queue shows the orders in progress in three columns, oldest first, with names and options', async ({
  page,
}) => {
  await setMock({
    orders: [
      order({
        id: 'o1',
        reference: 'AAA111',
        status: 'PLACED',
        placedAt: '2026-11-02T13:10:00+00:00',
        pickupWindow: { start: '2026-11-02T14:00:00+00:00', end: '2026-11-02T14:15:00+00:00' },
        pickupInstructions: 'Ring the side bell',
        lines: [
          {
            listingId: 'l1',
            listingName: 'Country Sourdough',
            quantity: 2,
            modifiers: [{ id: 'mod-seeds', name: 'Seed crust' }],
          },
          { listingId: 'l2', listingName: null, quantity: 1, modifiers: [{ id: 'mod-x', name: null }] },
        ],
      }),
      order({ id: 'o0', reference: 'OLD000', status: 'PLACED', placedAt: '2026-11-02T13:00:00+00:00' }),
      order({ id: 'o2', reference: 'BBB222', status: 'IN_PREPARATION' }),
      order({ id: 'o3', reference: 'CCC333', status: 'CONFIRMED' }),
      order({ id: 'o4', reference: 'DDD444', status: 'READY_FOR_FULFILLMENT' }),
      order({ id: 'o5', reference: 'EEE555', status: 'COMPLETED' }),
    ],
  });

  await logInAsVendor(page);

  await expect(page.getByTestId('user-name')).toHaveText('Corner Bakery (owner)');
  await expect(page.getByTestId('queue-order')).toHaveCount(5); // the completed order is not shown
  expect(await ordersInColumns(page, 'new')).toEqual(['OLD000', 'AAA111']);
  expect((await ordersInColumns(page, 'preparing')).sort()).toEqual(['BBB222', 'CCC333']);
  expect(await ordersInColumns(page, 'ready')).toEqual(['DDD444']);

  const card = page.locator('[data-reference="AAA111"]');
  await expect(card).toContainText('2 × Country Sourdough');
  await expect(card).toContainText('Seed crust');
  await expect(card).toContainText('1 × l2'); // no name: the id is shown instead of nothing
  await expect(card).toContainText('mod-x');
  await expect(card).toContainText('Ring the side bell');
  await expect(card.getByTestId('window')).toContainText('Pickup');
});

test('orders on the screen when it opens are not marked new; an order that arrives later is, and it is announced', async ({
  page,
}) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] });
  await page.clock.install();
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-order')).toHaveCount(1);
  await expect(page.getByTestId('new-badge')).toHaveCount(0);

  await setMock({
    orders: [
      order({ id: 'o1', reference: 'AAA111', status: 'PLACED' }),
      order({ id: 'o2', reference: 'NEW222', status: 'PLACED', placedAt: '2026-11-02T13:30:00+00:00' }),
    ],
  });
  await page.clock.runFor(POLL_MS);

  await expect(page.getByTestId('queue-order')).toHaveCount(2);
  await expect(page.locator('[data-reference="NEW222"]').getByTestId('new-badge')).toBeVisible();
  await expect(page.locator('[data-reference="AAA111"]').getByTestId('new-badge')).toHaveCount(0);
  await expect(page.getByTestId('queue-announcement')).toHaveText('New: NEW222');

  await page.clock.runFor(61_000); // the mark fades by itself
  await expect(page.getByTestId('new-badge')).toHaveCount(0);
});

test('an order moves between columns when its status changes, and leaves the screen when it completes', async ({
  page,
}) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] });
  await page.clock.install();
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-order')).toHaveCount(1);
  expect(await ordersInColumns(page, 'new')).toEqual(['AAA111']);

  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'IN_PREPARATION' })] });
  await page.clock.runFor(POLL_MS);
  await expect(page.getByTestId('column-preparing').getByTestId('reference')).toHaveText('AAA111');
  expect(await ordersInColumns(page, 'new')).toEqual([]);

  await setMock({ orders: [] });
  await page.clock.runFor(POLL_MS);
  await expect(page.getByTestId('queue-empty')).toBeVisible();
});

test('it asks again every few seconds, with the vendor token', async ({ page }) => {
  await page.clock.install();
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-status')).toContainText('Updated');
  const first = (await mockRequests()).requests;

  // One step at a time: Relay shares one in-flight request between identical queries, so three polls in the same instant would be one.
  for (let step = 1; step <= 3; step++) {
    await page.clock.runFor(POLL_MS);
    await expect.poll(async () => (await mockRequests()).requests).toBeGreaterThanOrEqual(first + step);
  }
  const { authorizations } = await mockRequests();
  expect(authorizations.every((a) => a?.startsWith('Bearer '))).toBe(true);
});

test('when a poll fails the last good queue stays on the screen with a notice, and it recovers by itself', async ({
  page,
}) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] });
  await page.clock.install();
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-order')).toHaveCount(1);

  await setMock({ mode: 'error' });
  await page.clock.runFor(POLL_MS);
  await expect(page.getByTestId('queue-stale')).toContainText('Cannot refresh');
  await expect(page.getByTestId('queue-order')).toHaveCount(1); // the kitchen keeps its queue

  await setMock({ mode: 'ok' });
  await page.clock.runFor(POLL_MS);
  await expect(page.getByTestId('queue-stale')).toHaveCount(0);
  await expect(page.getByTestId('queue-status')).toContainText('Updated');
});

test('a login the service no longer accepts ends the queue with a message to log in again', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] });
  await page.clock.install();
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-order')).toHaveCount(1);

  await setMock({ mode: 'unauthenticated' });
  await page.clock.runFor(POLL_MS);

  await expect(page.getByTestId('login-required')).toBeVisible(); // the session was ended, so the gate offers the login again
  await expect(page.getByTestId('queue-order')).toHaveCount(0);
});

test('a login that is not a vendor sees a plain message, not an empty queue', async ({ page }) => {
  await setMock({ mode: 'forbidden' });
  await logInAsVendor(page);

  await expect(page.getByTestId('queue-forbidden')).toContainText("not a vendor's");
});

test('the screen is display only: it offers no way to change an order', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] });
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-order')).toHaveCount(1);

  const buttons = await page.getByRole('button').allTextContents();
  expect(buttons).toEqual(['Log out']);
});

test('the queue has no accessibility violations that axe can find', async ({ page }) => {
  await setMock({
    orders: [
      order({ id: 'o1', reference: 'AAA111', status: 'PLACED' }),
      order({ id: 'o2', reference: 'BBB222', status: 'IN_PREPARATION' }),
      order({ id: 'o3', reference: 'CCC333', status: 'READY_FOR_FULFILLMENT' }),
    ],
  });
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-order')).toHaveCount(3);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  expect(results.violations).toEqual([]);
});

test('the token is held in memory only, so a reload logs the screen out', async ({ page, context }) => {
  const token = fakeToken();
  await stubIssuer(page, { token });
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).first().click();
  await expect(page.getByTestId('user-name')).toBeVisible();

  const stored = await page.evaluate(() =>
    JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]),
  );
  expect(stored).not.toContain(token.split('.')[2]);
  expect(JSON.stringify(await context.cookies())).not.toContain(token.split('.')[2]);

  await page.reload();
  await expect(page.getByTestId('login-required')).toBeVisible();
});
