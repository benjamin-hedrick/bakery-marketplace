import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  APP,
  dropStreams,
  endStreams,
  logInAsVendor,
  mockRequests,
  mockStreams,
  order,
  pushChange,
  resetAll,
  setMock,
} from './helpers';

// WI-QUE-003 step 6 (ADR-0021): the screen with live updates. The mock BFF serves the subscription (the real BFF, ordering and the browser are
// not in this run; step 7 runs them together). The page's clock is Playwright's, so the screen's 7 s poll, 60 s check, 45 s silence limit and
// reconnect delays are steps, not waits. The mock sends its heartbeat in real time, so the clock is advanced in steps with a pause for it.

const POLL_MS = 7000;

test.beforeEach(async () => {
  await resetAll();
});

/** Advances the page's clock in steps of at most ten seconds, letting the mock's real-time heartbeat reach the page between steps. */
async function advance(page: Page, ms: number) {
  for (let left = ms; left > 0; left -= 10_000) {
    await page.clock.runFor(Math.min(10_000, left));
    await page.waitForTimeout(150);
  }
}

const mode = (page: Page) => page.getByTestId('queue-mode');

/** Opens the screen with the subscription served and waits until it says Live. */
async function goLive(page: Page, orders: ReturnType<typeof order>[] = [], options: { heartbeatMs?: number } = {}) {
  await setMock({ streamMode: 'ok', heartbeatMs: options.heartbeatMs ?? 50, orders });
  await page.clock.install();
  await logInAsVendor(page);
  await expect(mode(page)).toHaveText('Live');
}

const column = (page: Page, key: 'new' | 'preparing' | 'ready') =>
  page.getByTestId(`column-${key}`).getByTestId('reference').allTextContents();

test('once the stream is up the screen says Live and asks for the list only as a check every minute, not every few seconds', async ({
  page,
}) => {
  await goLive(page, [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })]);
  await expect(page.getByTestId('queue-order')).toHaveCount(1);
  const before = (await mockRequests()).requests;

  await advance(page, POLL_MS * 3);
  expect((await mockRequests()).requests).toBe(before); // nothing in 21 seconds

  await advance(page, 40_000); // 61 seconds since the stream opened
  await expect.poll(async () => (await mockRequests()).requests).toBe(before + 1);
  await expect(mode(page)).toHaveText('Live');
});

test('a changed order is pushed to the screen at once, marked new and announced, without asking for the list', async ({
  page,
}) => {
  await goLive(page, [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })]);
  await expect(page.getByTestId('queue-order')).toHaveCount(1);
  const before = (await mockRequests()).requests;

  await pushChange(
    order({ id: 'o2', reference: 'NEW222', status: 'PLACED', sequence: 1, placedAt: '2026-11-02T13:30:00+00:00' }),
  );

  await expect(page.getByTestId('queue-order')).toHaveCount(2);
  await expect(page.locator('[data-reference="NEW222"]').getByTestId('new-badge')).toBeVisible();
  await expect(page.locator('[data-reference="AAA111"]').getByTestId('new-badge')).toHaveCount(0);
  await expect(page.getByTestId('queue-announcement')).toHaveText('New: NEW222');
  expect((await mockRequests()).requests).toBe(before);
});

test('pushed changes move an order between columns and take it off the screen when it completes', async ({ page }) => {
  await goLive(page, [order({ id: 'o1', reference: 'AAA111', status: 'PLACED', sequence: 1 })]);
  expect(await column(page, 'new')).toEqual(['AAA111']);

  await pushChange(order({ id: 'o1', reference: 'AAA111', status: 'IN_PREPARATION', sequence: 3 }));
  await expect(page.getByTestId('column-preparing').getByTestId('reference')).toHaveText('AAA111');
  expect(await column(page, 'new')).toEqual([]);

  await pushChange(order({ id: 'o1', reference: 'AAA111', status: 'READY_FOR_FULFILLMENT', sequence: 4 }));
  await expect(page.getByTestId('column-ready').getByTestId('reference')).toHaveText('AAA111');

  await pushChange(order({ id: 'o1', reference: 'AAA111', status: 'COMPLETED', sequence: 5 }));
  await expect(page.getByTestId('queue-empty')).toBeVisible();
});

test('a change that is not newer than what the screen holds is ignored', async ({ page }) => {
  await goLive(page, [order({ id: 'o1', reference: 'AAA111', status: 'PLACED', sequence: 1 })]);
  await pushChange(order({ id: 'o1', reference: 'AAA111', status: 'READY_FOR_FULFILLMENT', sequence: 5 }));
  await expect(page.getByTestId('column-ready').getByTestId('reference')).toHaveText('AAA111');

  await pushChange(order({ id: 'o1', reference: 'AAA111', status: 'PLACED', sequence: 3 })); // late
  await pushChange(order({ id: 'o1', reference: 'AAA111', status: 'CONFIRMED', sequence: 5 })); // repeated sequence
  await page.waitForTimeout(300); // let both reach the page

  expect(await column(page, 'ready')).toEqual(['AAA111']);
  expect(await column(page, 'new')).toEqual([]);
});

test('when the stream is cut the screen says Polling and polls every 7 seconds, then goes Live again by itself and catches up', async ({
  page,
}) => {
  await goLive(page, [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })]);
  const streams = (await mockStreams()).streamRequests;

  await setMock({ streamMode: 'unavailable' }); // the first retries are refused
  await dropStreams();
  await expect(mode(page)).toHaveText('Polling');

  await setMock({
    orders: [
      order({ id: 'o1', reference: 'AAA111', status: 'PLACED' }),
      order({ id: 'o2', reference: 'WHILE-DOWN', status: 'PLACED', placedAt: '2026-11-02T13:30:00+00:00' }),
    ],
  });
  await page.clock.runFor(POLL_MS); // polling finds what happened while the stream was down
  await expect(page.getByTestId('queue-order')).toHaveCount(2);
  await expect(mode(page)).toHaveText('Polling');

  await setMock({ streamMode: 'ok' });
  await advance(page, 40_000); // the retry delay has grown to a few seconds by now
  await expect(mode(page)).toHaveText('Live');
  expect((await mockStreams()).streamRequests).toBeGreaterThan(streams + 1);
  await pushChange(order({ id: 'o3', reference: 'AFTER', status: 'PLACED', placedAt: '2026-11-02T13:40:00+00:00' }));
  await expect(page.getByTestId('queue-order')).toHaveCount(3);
});

test('a stream that goes quiet for 45 seconds is treated as dead: the screen says Polling and tries a new one', async ({
  page,
}) => {
  await goLive(page, [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })], { heartbeatMs: 0 }); // no heartbeat at all
  const streams = (await mockStreams()).streamRequests;

  await page.clock.runFor(44_000);
  await expect(mode(page)).toHaveText('Live');
  await page.clock.runFor(2000); // 46 seconds without a byte

  await expect(mode(page)).toHaveText('Polling');
  await page.clock.runFor(2000); // the first retry
  await expect.poll(async () => (await mockStreams()).streamRequests).toBeGreaterThan(streams);
});

test('a stream the server ends in the normal way (the token expired) is opened again at once and the screen stays usable', async ({
  page,
}) => {
  await goLive(page, [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })]);
  await advance(page, 6000); // a stream that has lived a few seconds is a healthy one
  const streams = (await mockStreams()).streamRequests;

  await endStreams();

  await expect.poll(async () => (await mockStreams()).streamRequests).toBe(streams + 1);
  await expect(mode(page)).toHaveText('Live');
  await pushChange(order({ id: 'o2', reference: 'NEW222', status: 'PLACED', placedAt: '2026-11-02T13:30:00+00:00' }));
  await expect(page.getByTestId('queue-order')).toHaveCount(2);
});

test('with live updates unavailable the screen polls and says so', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] }); // streamMode stays "unavailable"
  await page.clock.install();
  await logInAsVendor(page);

  await expect(page.getByTestId('queue-order')).toHaveCount(1);
  await expect(mode(page)).toHaveText('Polling');
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'IN_PREPARATION' })] });
  await page.clock.runFor(POLL_MS);
  await expect(page.getByTestId('column-preparing').getByTestId('reference')).toHaveText('AAA111');
});

test('the stream request carries the session cookie and no token; the BFF gets the session token', async ({ page }) => {
  const headers: Record<string, string>[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/api/graphql-stream')) void r.allHeaders().then((h) => headers.push(h));
  });

  await goLive(page);

  await expect.poll(() => headers.length).toBeGreaterThan(0);
  expect(headers[0]!['authorization']).toBeUndefined();
  expect(headers[0]!['cookie']).toContain('bakery-session-web-queue-display=');
  expect(headers[0]!['origin']).toBe(APP);
  const { streamAuthorizations } = await mockStreams();
  expect(streamAuthorizations[0]).toMatch(/^Bearer ey/);
});

test('when the session ends on the server the open stream is closed, and the screen offers the login', async ({
  page,
}) => {
  await goLive(page, [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })]);

  // Logged out somewhere else (another tab, another device): this page does not know.
  const out = await page.request.post(`${APP}/api/auth/logout`, {
    headers: { origin: APP, 'content-type': 'application/json' },
    data: {},
  });
  expect(out.status()).toBe(204);

  // The app's server checks the session every ten seconds (real time) and ends the stream.
  await expect.poll(async () => (await mockStreams()).openStreams, { timeout: 20_000 }).toBe(0);
  await advance(page, 4000); // the page reconnects after its retry delay and is told it has no login
  await expect(page.getByTestId('login-required')).toBeVisible({ timeout: 10_000 });
});

test('a forged cross-origin post, a plain GET and an anonymous caller get nothing from the stream route', async ({
  page,
  request,
}) => {
  await goLive(page);
  const before = (await mockStreams()).streamRequests;
  const body = JSON.stringify({ query: 'subscription { vendorOrderChanged { id } }' });

  const forged = await page.request.post(`${APP}/api/graphql-stream`, {
    headers: { origin: 'https://evil.example', 'content-type': 'application/json', accept: 'text/event-stream' },
    data: body,
  });
  const get = await page.request.get(`${APP}/api/graphql-stream`, { headers: { accept: 'text/event-stream' } });
  const anonymous = await request.post(`${APP}/api/graphql-stream`, {
    headers: { origin: APP, 'content-type': 'application/json', accept: 'text/event-stream' },
    data: body,
  });

  expect([forged.status(), get.status(), anonymous.status()]).toEqual([403, 405, 401]);
  expect((await mockStreams()).streamRequests).toBe(before);
});

test('with ?delay=1 the screen shows how long the last pushed change took to arrive', async ({ page }) => {
  await goLive(page, [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })]);
  await page.goto('/?delay=1');
  await expect(mode(page)).toHaveText('Live');
  await expect(page.getByTestId('queue-delay')).toHaveCount(0); // nothing pushed yet

  await pushChange(order({ id: 'o2', reference: 'NEW222', status: 'PLACED', updatedAt: new Date().toISOString() }));

  await expect(page.getByTestId('queue-delay')).toContainText(
    /Last change reached this screen \d+ ms after it happened/,
  );
});

test('the live screen has no accessibility violations that axe can find', async ({ page }) => {
  await goLive(page, [
    order({ id: 'o1', reference: 'AAA111', status: 'PLACED' }),
    order({ id: 'o2', reference: 'BBB222', status: 'IN_PREPARATION' }),
  ]);
  await pushChange(order({ id: 'o3', reference: 'NEW333', status: 'PLACED', placedAt: '2026-11-02T13:30:00+00:00' }));
  await expect(page.getByTestId('new-badge')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  expect(results.violations).toEqual([]);
});
