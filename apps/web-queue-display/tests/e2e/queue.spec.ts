import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  APP,
  issuerSeen,
  logInAsVendor,
  mockRequests,
  order,
  resetAll,
  setIssuer,
  setMock,
  startLoginOnly,
} from './helpers';

// WI-QUE-002 with the server-side session of ADR-0019. The login is real: the page goes to /api/auth/login, the app's server talks to the fake
// issuer and sets an HttpOnly cookie; the BFF is the mock. The clock is Playwright's (for the page only), so a poll is a step, not a wait.

const POLL_MS = 7000;

test.beforeEach(async () => {
  await resetAll();
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

test('the browser holds no token: a login leaves only an HttpOnly cookie, nothing readable in the page, its storage or its HTML', async ({
  page,
  context,
}) => {
  await logInAsVendor(page);

  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === 'bakery-session-web-queue-display');
  expect(session).toBeTruthy();
  expect(session!.httpOnly).toBe(true);
  expect(session!.sameSite).toBe('Lax');
  expect(session!.path).toBe('/');
  expect(session!.value).toMatch(/^[A-Za-z0-9_-]{43}$/); // an opaque random id, not a token
  expect(cookies.some((c) => c.name.includes('login'))).toBe(false); // the pending-login cookie was cleared

  const seenByScripts = await page.evaluate(() =>
    JSON.stringify([document.cookie, { ...localStorage }, { ...sessionStorage }, document.documentElement.outerHTML]),
  );
  expect(seenByScripts).not.toContain(session!.value);
  expect(seenByScripts).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // no JWT anywhere the page can see
  expect(seenByScripts).not.toMatch(/refresh/i);
});

test('the login is Authorization Code with PKCE from the server, with no client secret, and returns to the page', async ({
  page,
}) => {
  await logInAsVendor(page);

  const seen = await issuerSeen();
  const authorize = seen.authorize[0]!;
  expect(authorize['response_type']).toBe('code');
  expect(authorize['client_id']).toBe('web-queue-display');
  expect(authorize['redirect_uri']).toBe(`${APP}/api/auth/callback`);
  expect(authorize['code_challenge_method']).toBe('S256');
  expect(authorize['scope']).toBe('openid offline_access');
  expect(authorize['state']).toMatch(/^[A-Za-z0-9_-]{16,}$/);
  expect(seen.tokens[0]).toMatchObject({
    grant: 'authorization_code',
    clientId: 'web-queue-display',
    hasSecret: false,
    hasVerifier: true,
  });
  await expect(page).toHaveURL(`${APP}/`);
});

test('a reload keeps the login (the session is on the server)', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] });
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-order')).toHaveCount(1);

  await page.reload();

  await expect(page.getByTestId('user-name')).toHaveText('Corner Bakery (owner)');
  await expect(page.getByTestId('queue-order')).toHaveCount(1);
  expect((await issuerSeen()).tokens.filter((t) => t.grant === 'authorization_code')).toHaveLength(1); // no second login
});

test('logging out ends the session on the server: the old cookie opens nothing, and the page offers the login', async ({
  page,
  context,
}) => {
  await logInAsVendor(page);
  const before = (await context.cookies()).find((c) => c.name === 'bakery-session-web-queue-display')!;

  await page.getByRole('button', { name: 'Log out' }).click();

  await expect(page.getByTestId('login-required')).toBeVisible();
  const replay = await page.request.get('/api/auth/me', { headers: { cookie: `${before.name}=${before.value}` } });
  expect(await replay.json()).toEqual({ authenticated: false });
});

test('an access token about to expire is renewed on the server and the page never notices', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] });
  await setIssuer({ accessSeconds: 30 }); // inside the 60 second margin: every call renews
  await page.clock.install();
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-order')).toHaveCount(1);
  const first = (await mockRequests()).requests;

  for (let step = 1; step <= 2; step++) {
    await page.clock.runFor(POLL_MS);
    // One poll at a time: Relay shares one request between identical queries in flight, so two polls started together would be one.
    await expect.poll(async () => (await mockRequests()).requests).toBeGreaterThanOrEqual(first + step);
  }

  await expect(page.getByTestId('queue-order')).toHaveCount(1);
  await expect(page.getByTestId('user-name')).toBeVisible();
  expect((await issuerSeen()).tokens.filter((t) => t.grant === 'refresh_token').length).toBeGreaterThanOrEqual(3); // every call renewed
  // a new bearer token each time, all built on the server
  expect(new Set((await mockRequests()).authorizations).size).toBeGreaterThanOrEqual(3);
});

test('when the issuer refuses the renewal the session ends and the page offers the login', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] });
  await setIssuer({ accessSeconds: 30 });
  await page.clock.install();
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-order')).toHaveCount(1);

  await setIssuer({ mode: 'revoked' });
  await page.clock.runFor(POLL_MS);

  await expect(page.getByTestId('login-required')).toBeVisible();
  await expect(page.getByTestId('queue-order')).toHaveCount(0);
});

test('a failed login lands on a page with a fixed sentence, and nothing the issuer said', async ({ page }) => {
  await setIssuer({ mode: 'bad-exchange' });

  await startLoginOnly(page);

  await expect(page).toHaveURL(/\/auth\/error\?code=exchange_failed$/);
  await expect(page.getByTestId('login-error')).toContainText('We could not complete the login');
  await expect(page.getByTestId('login-error')).not.toContainText('invalid_grant');
});

test('a forged cross-origin post to the GraphQL route is refused and reaches nothing', async ({ page }) => {
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-status')).toContainText('Updated');
  const before = (await mockRequests()).requests;
  const body = JSON.stringify({ query: '{ vendorOrders { edges { cursor } } }' });

  const wrongOrigin = await page.request.post('/api/graphql', {
    headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
    data: body,
  });
  const noOrigin = await page.request.post('/api/graphql', {
    headers: { 'content-type': 'application/json' },
    data: body,
  });
  const formPost = await page.request.post('/api/graphql', {
    headers: { origin: APP, 'content-type': 'application/x-www-form-urlencoded' },
    data: 'a=b',
  });
  const logoutForged = await page.request.post('/api/auth/logout', {
    headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
    data: '{}',
  });

  expect([wrongOrigin.status(), noOrigin.status(), formPost.status(), logoutForged.status()]).toEqual([
    403, 403, 403, 403,
  ]);
  expect((await mockRequests()).requests).toBe(before);
  expect((await page.request.get('/api/auth/me')).ok()).toBe(true);
  await expect(page.getByTestId('user-name')).toBeVisible(); // and the real session is untouched
});

test('an Authorization header sent by the browser is never passed on: the BFF gets the session token', async ({
  page,
}) => {
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-status')).toContainText('Updated');

  await page.request.post('/api/graphql', {
    headers: { origin: APP, 'content-type': 'application/json', authorization: 'Bearer forged-by-the-browser' },
    data: JSON.stringify({ query: '{ vendorOrders { edges { cursor } } }' }),
  });

  const { authorizations } = await mockRequests();
  expect(authorizations.length).toBeGreaterThan(0);
  expect(authorizations.every((a) => a?.startsWith('Bearer eyJ') && !a.includes('forged'))).toBe(true);
});
