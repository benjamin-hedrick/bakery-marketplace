import { expect, test } from '@playwright/test';
import { logInAsVendor, mockRequests, order, resetAll, setMock } from './helpers';

// WI-RATE-001: the web routes' rate limits, on a second copy of the app (port 3101) started with tight limits: 3 logins a minute per address,
// 6 GraphQL requests a minute per login, and one trusted proxy hop, so each test picks its own address with X-Forwarded-For and the tests do
// not use each other's allowance. The login is real (the fake issuer); the BFF is the mock. The limiter's own rules are tested in
// packages/web-session; these tests show that a real browser and the real routes meet them.

const BASE = 'http://localhost:3101';
test.use({ baseURL: BASE });

test.beforeEach(async () => {
  await resetAll();
});

const login = (request: import('@playwright/test').APIRequestContext, address: string) =>
  request.get('/api/auth/login?returnTo=/', { headers: { 'x-forwarded-for': address }, maxRedirects: 0 });

test('a burst of login starts from one address is turned away to the error page with a fixed sentence; another address is not', async ({
  request,
  browser,
}) => {
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await login(request, '198.51.100.10'));

  expect(results.map((r) => r.status())).toEqual([302, 302, 302, 302, 302]);
  const locations = results.map((r) => r.headers()['location']!);
  expect(locations.slice(0, 3).every((l) => l.startsWith('http://localhost:5101/authorize'))).toBe(true);
  expect(locations.slice(3)).toEqual(['/auth/error?code=rate_limited', '/auth/error?code=rate_limited']);
  expect(Number(results[3]!.headers()['retry-after'])).toBeGreaterThan(0);
  expect(results[3]!.headers()['set-cookie']).toBeUndefined(); // no pending-login cookie for a refused start

  // Another address starts a login as usual.
  expect((await login(request, '198.51.100.11')).headers()['location']).toMatch(/^http:\/\/localhost:5101\/authorize/);

  // And the browser of the limited address lands on the page with the sentence, not on the issuer.
  const context = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.10' } });
  const page = await context.newPage();
  await page.goto('/api/auth/login?returnTo=/');
  await expect(page).toHaveURL(/\/auth\/error\?code=rate_limited/);
  await expect(page.getByText('Too many login attempts. Please wait a minute and try again.')).toBeVisible();
  await context.close();
});

test('a forged X-Forwarded-For entry on the left gives no new allowance: the address is the one the proxy added, on the right', async ({
  request,
}) => {
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    const r = await request.get('/api/auth/login?returnTo=/', {
      headers: { 'x-forwarded-for': `10.9.9.${i}, 198.51.100.20` },
      maxRedirects: 0,
    });
    statuses.push(r.headers()['location']!.startsWith('/auth/error') ? 'limited' : 'ok');
  }
  expect(statuses).toEqual(['ok', 'ok', 'ok', 'limited', 'limited']);
});

test('a logged-in screen that sends GraphQL requests faster than its limit gets 429 with Retry-After, and the BFF is not asked for the refused ones', async ({
  browser,
}) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] });
  const context = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.30' } });
  const page = await context.newPage();
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-order')).toHaveCount(1);

  const before = (await mockRequests()).requests;
  const statuses: number[] = [];
  let refused: Awaited<ReturnType<typeof page.request.post>> | undefined;
  for (let i = 0; i < 12; i++) {
    const r = await page.request.post('/api/graphql', {
      headers: { origin: BASE, 'content-type': 'application/json' },
      data: JSON.stringify({ query: '{ vendorOrders(first: 1) { edges { cursor } } }' }),
    });
    statuses.push(r.status());
    if (r.status() === 429) refused ??= r;
  }

  const allowed = statuses.filter((s) => s === 200).length;
  expect(allowed).toBeLessThanOrEqual(6);
  expect(statuses.at(-1)).toBe(429);
  expect(refused).toBeDefined();
  expect(Number(refused!.headers()['retry-after'])).toBeGreaterThan(0);
  expect(refused!.headers()['cache-control']).toBe('no-store');
  expect(await refused!.json()).toEqual({ error: 'Too many requests. Please wait a moment and try again.' });
  // Only the allowed ones reached the BFF (the screen's own poll can add one in between).
  expect((await mockRequests()).requests - before).toBeLessThanOrEqual(allowed + 1);
  await context.close();
});

test('another login from the same address is not held back by the first one being over its limit', async ({
  browser,
}) => {
  const address = { 'x-forwarded-for': '198.51.100.40' };
  const first = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: address });
  const firstPage = await first.newPage();
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED' })] });
  await logInAsVendor(firstPage);
  for (let i = 0; i < 8; i++)
    await firstPage.request.post('/api/graphql', {
      headers: { origin: BASE, 'content-type': 'application/json' },
      data: JSON.stringify({ query: '{ vendorOrders(first: 1) { edges { cursor } } }' }),
    });

  const second = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: address });
  const secondPage = await second.newPage();
  await secondPage.goto('/');
  // The second browser has no session; its first anonymous request is let through (the per-address allowance is separate from the first login's).
  const anonymous = await secondPage.request.post('/api/graphql', {
    headers: { origin: BASE, 'content-type': 'application/json' },
    data: JSON.stringify({ query: '{ vendorOrders(first: 1) { edges { cursor } } }' }),
  });
  expect(anonymous.status()).toBe(200);
  await first.close();
  await second.close();
});
