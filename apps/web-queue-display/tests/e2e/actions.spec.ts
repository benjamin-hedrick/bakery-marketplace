import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, dropStreams, logInAsVendor, mockActions, mockRequests, order, resetAll, setMock } from './helpers';

// WI-QUE-004: the vendor's actions on an order card. The login is real (the fake issuer); the BFF is the mock, which moves an order along the way
// ordering does and rejects as ordering does. Whether an action is allowed, and for whom, is ordering's decision (tested in the BFF and ordering
// suites); these tests check what the screen offers, sends and says.

test.beforeEach(async () => {
  await resetAll();
});

const card = (page: Page, reference: string) => page.getByTestId('queue-order').filter({ hasText: reference });
const inColumn = (page: Page, column: 'new' | 'preparing' | 'ready') =>
  page.getByTestId(`column-${column}`).getByTestId('reference').allTextContents();

test('each card offers only what the vendor does next at its status, and a final status offers nothing', async ({
  page,
}) => {
  await setMock({
    orders: [
      order({ id: 'o1', reference: 'AAA111', status: 'PLACED' }),
      order({ id: 'o2', reference: 'BBB222', status: 'CONFIRMED' }),
      order({ id: 'o3', reference: 'CCC333', status: 'IN_PREPARATION' }),
      order({ id: 'o4', reference: 'DDD444', status: 'READY_FOR_FULFILLMENT' }),
    ],
  });
  await logInAsVendor(page);

  await expect(card(page, 'AAA111').getByRole('button')).toHaveText(['Accept', 'Decline']);
  await expect(card(page, 'BBB222').getByRole('button')).toHaveText(['Start preparing']);
  await expect(card(page, 'CCC333').getByRole('button')).toHaveText(['Mark ready']);
  await expect(card(page, 'DDD444').getByRole('button')).toHaveText(['Handed over']);
  // The accessible name carries the order, so a screen reader hears which order a button is for.
  await expect(page.getByRole('button', { name: 'Accept order AAA111' })).toBeVisible();
});

test('an order goes through the whole line: accept, start, ready, handed over; the card moves and each action is sent once with the login', async ({
  page,
}) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })], streamMode: 'ok' });
  await logInAsVendor(page);
  await expect.poll(() => inColumn(page, 'new')).toEqual(['AAA111']);

  await page.getByRole('button', { name: 'Accept order AAA111' }).click();
  await expect.poll(() => inColumn(page, 'preparing')).toEqual(['AAA111']);
  await page.getByRole('button', { name: 'Start preparing order AAA111' }).click();
  await expect(page.getByRole('button', { name: 'Mark ready order AAA111' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark ready order AAA111' }).click();
  await expect.poll(() => inColumn(page, 'ready')).toEqual(['AAA111']);
  await page.getByRole('button', { name: 'Handed over order AAA111' }).click();

  await expect(page.getByTestId('queue-order')).toHaveCount(0);
  const sent = await mockActions();
  expect(sent.map((a) => [a.action, a.orderId])).toEqual([
    ['CONFIRM', 'o1'],
    ['START_PREPARATION', 'o1'],
    ['MARK_READY', 'o1'],
    ['COMPLETE', 'o1'],
  ]);
  // The server attached the bearer token from the session; the page sent none.
  expect(sent.every((a) => /^Bearer .+/.test(a.authorization ?? ''))).toBe(true);
});

test('an order that is declined asks once more first, and nothing is sent until the second click', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })], streamMode: 'ok' });
  await logInAsVendor(page);

  await page.getByRole('button', { name: 'Decline order AAA111' }).click();
  await expect(page.getByRole('button', { name: 'Confirm: Decline order AAA111' })).toHaveText('Decline this order?');
  expect(await mockActions()).toEqual([]);

  await page.getByRole('button', { name: 'Confirm: Decline order AAA111' }).click();
  await expect(page.getByTestId('queue-order')).toHaveCount(0);
  expect((await mockActions()).map((a) => a.action)).toEqual(['DECLINE']);
});

test('while an action is in flight the buttons are off, so a second click sends nothing more', async ({ page }) => {
  await setMock({
    orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })],
    actionDelayMs: 800,
    streamMode: 'ok',
  });
  await logInAsVendor(page);
  const accept = page.getByRole('button', { name: 'Accept order AAA111' });

  await accept.click();
  await expect(accept).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Decline order AAA111' })).toBeDisabled();
  await accept.click({ force: true }).catch(() => undefined); // a click on a disabled button does nothing
  await expect.poll(() => inColumn(page, 'preparing')).toEqual(['AAA111']);

  expect((await mockActions()).map((a) => a.action)).toEqual(['CONFIRM']);
});

test('a refused action says the order has changed, refreshes the queue and lets the vendor go on', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })], actionMode: 'conflict' });
  await logInAsVendor(page);

  await page.getByRole('button', { name: 'Accept order AAA111' }).click();

  await expect(page.getByTestId('action-problem')).toHaveText('This order has changed. The queue is up to date.');
  await expect(page.getByRole('button', { name: 'Accept order AAA111' })).toBeEnabled();
  await expect(page.getByTestId('queue-announcement')).toContainText('This order has changed');
  expect(page.url()).toBe(`${APP}/`);
});

test('an order that cannot be found says so', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })], actionMode: 'notfound' });
  await logInAsVendor(page);

  await page.getByRole('button', { name: 'Accept order AAA111' }).click();

  await expect(page.getByTestId('action-problem')).toContainText('could not be found');
});

test('a failing service says it did not work, shows no detail, and the same action works when the service is back', async ({
  page,
}) => {
  await setMock({
    orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })],
    actionMode: 'error',
    streamMode: 'ok',
  });
  await logInAsVendor(page);

  await page.getByRole('button', { name: 'Accept order AAA111' }).click();
  await expect(page.getByTestId('action-problem')).toHaveText('That did not work. Please try again.');
  await expect(page.getByTestId('action-problem')).not.toContainText(/boom|500|INTERNAL/);

  await setMock({ actionMode: 'ok' });
  await page.getByRole('button', { name: 'Accept order AAA111' }).click();
  await expect.poll(() => inColumn(page, 'preparing')).toEqual(['AAA111']);
  await expect(page.getByTestId('action-problem')).toHaveCount(0);
});

test('when the login ends, the action says so and the screen offers the login again', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] });
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-order')).toHaveCount(1);

  await setMock({ mode: 'unauthenticated' });
  await page.getByRole('button', { name: 'Accept order AAA111' }).click();

  await expect(page.getByTestId('login-required').or(page.getByTestId('queue-login-ended'))).toBeVisible();
});

test('the buttons work from the keyboard', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })], streamMode: 'ok' });
  await logInAsVendor(page);

  await page.getByRole('button', { name: 'Accept order AAA111' }).focus();
  await page.keyboard.press('Enter');

  await expect.poll(() => inColumn(page, 'preparing')).toEqual(['AAA111']);
});

test('an action posted without the app’s own origin is refused by the web app and never reaches the BFF', async ({
  page,
}) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] });
  await logInAsVendor(page);
  const body = JSON.stringify({
    query: 'mutation($input: VendorOrderActionInput!) { vendorOrderAction(input: $input) { __typename } }',
    variables: { input: { orderId: 'o1', action: 'DECLINE' } },
  });

  const foreign = await page.request.post('/api/graphql', {
    headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
    data: body,
  });
  const noOrigin = await page.request.post('/api/graphql', {
    headers: { 'content-type': 'application/json' },
    data: body,
  });

  expect([foreign.status(), noOrigin.status()]).toEqual([403, 403]);
  expect(await mockActions()).toEqual([]);
});

test('the queue with its buttons has no accessibility violations that axe can find, with the decline question open too', async ({
  page,
}) => {
  await setMock({
    orders: [
      order({ id: 'o1', reference: 'AAA111', status: 'PLACED' }),
      order({ id: 'o2', reference: 'BBB222', status: 'CONFIRMED' }),
    ],
    actionMode: 'conflict',
  });
  await logInAsVendor(page);
  await page.getByRole('button', { name: 'Decline order AAA111' }).click();
  await page.getByRole('button', { name: 'Start preparing order BBB222' }).click(); // leaves an error message showing as well
  await expect(page.getByTestId('action-problem')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  expect(results.violations).toEqual([]);
});

test('with live updates unavailable the card still moves, at the next poll', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })], streamMode: 'unavailable' });
  await logInAsVendor(page);

  await page.getByRole('button', { name: 'Accept order AAA111' }).click();

  await expect(page.getByRole('button', { name: 'Accept order AAA111' })).toBeDisabled(); // off until the order shows its new status
  await expect.poll(() => inColumn(page, 'preparing'), { timeout: 20_000 }).toEqual(['AAA111']);
});

test('a list read that is behind the stream does not undo a change the stream already delivered (register item 133)', async ({
  page,
}) => {
  const placed = order({ id: 'o1', reference: 'AAA111', status: 'PLACED', sequence: 2 });
  await setMock({ orders: [placed], streamMode: 'ok' });
  await logInAsVendor(page);
  await page.getByRole('button', { name: 'Accept order AAA111' }).click();
  await expect.poll(() => inColumn(page, 'preparing')).toEqual(['AAA111']);

  // From now on the list is read from a read model that has not caught up: it still says Placed, sequence 2. Cutting the stream makes the
  // screen catch up by asking for the list.
  const before = (await mockRequests()).requests;
  await setMock({ listSnapshot: [placed] });
  await dropStreams();
  await expect.poll(async () => (await mockRequests()).requests, { timeout: 15_000 }).toBeGreaterThan(before);

  await expect(page.getByTestId('queue-order')).toHaveCount(1);
  expect(await inColumn(page, 'preparing')).toEqual(['AAA111']);
  expect(await inColumn(page, 'new')).toEqual([]);
});
