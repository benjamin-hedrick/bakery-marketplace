import { expect, test } from '@playwright/test';
import type { ConsoleMessage } from '@playwright/test';

const MOCK_CONTROL = 'http://localhost:4000/__control';
const setRevision = (revision: number) =>
  fetch(MOCK_CONTROL, { method: 'POST', body: JSON.stringify({ revision }) });

test.beforeEach(async () => { await setRevision(0); });
test.afterAll(async () => { await setRevision(0); });

test('listing content is in the server HTML before any JavaScript runs', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('listing')).toHaveCount(3);
  await expect(page.getByText('Country Sourdough')).toBeVisible();
  await expect(page.getByTestId('price').first()).toHaveText('$8.00');
  await context.close();
});

test('hydration produces no console warnings or errors and no browser-side GraphQL request', async ({ page }) => {
  const problems: string[] = [];
  const onConsole = (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  const graphqlCalls: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/graphql')) graphqlCalls.push(r.url()); });

  await page.goto('/');
  await expect(page.getByTestId('listing')).toHaveCount(3);
  // Give hydration and any stray effects time to surface before asserting.
  await page.waitForLoadState('networkidle');

  expect(problems, problems.join('\n')).toEqual([]);
  expect(graphqlCalls, 'first paint must not refetch what SSR already delivered').toEqual([]);
});

test('client navigation to a detail page and back works without a full reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { (window as unknown as { __marker: string }).__marker = 'same-document'; });

  await page.getByRole('link', { name: 'Almond Croissant' }).click();
  await expect(page).toHaveURL(/\/listings\//);
  await expect(page.getByRole('heading', { name: 'Almond Croissant' })).toBeVisible();
  await expect(page.getByTestId('detail-price')).toHaveText('$4.50');
  await expect(page.getByText('Extra almond (+$0.75)')).toBeVisible();

  await page.getByRole('link', { name: '← All listings' }).click();
  await expect(page.getByTestId('listing')).toHaveCount(3);

  const marker = await page.evaluate(() => (window as unknown as { __marker?: string }).__marker);
  expect(marker, 'a full page reload would have cleared the marker').toBe('same-document');
});

test('detail page is server-rendered when opened directly, and unknown IDs return 404', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.getByRole('link', { name: 'Oat Milk Latte' }).getAttribute('href');
  const res = await request.get(href!);
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('Oat Milk Latte');

  const missing = await request.get('/listings/' + encodeURIComponent(Buffer.from('Listing:does-not-exist').toString('base64')));
  expect(missing.status()).toBe(404);
});

test('refetch pulls fresh data from the network into the Relay store', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('price').first()).toHaveText('$8.00');

  await setRevision(25); // every price becomes +25 cents on the next fetch
  await page.getByRole('button', { name: 'Refresh' }).click();

  await expect(page.getByTestId('price').first()).toHaveText('$8.25');
});

test('two browser contexts with different fixtures never see each other\'s data', async ({ browser }) => {
  const [a, b] = await Promise.all([
    browser.newContext({ extraHTTPHeaders: { 'x-fixture': 'A', 'x-delay-ms': '150' } }),
    browser.newContext({ extraHTTPHeaders: { 'x-fixture': 'B', 'x-delay-ms': '50' } }),
  ]);
  const [pa, pb] = await Promise.all([a.newPage(), b.newPage()]);
  await Promise.all([pa.goto('/'), pb.goto('/')]);

  await expect(pa.getByText('Country Sourdough')).toBeVisible();
  await expect(pb.getByText('Dark Rye Loaf')).toBeVisible();
  await expect(pa.getByText('Dark Rye Loaf')).toHaveCount(0);
  await expect(pb.getByText('Country Sourdough')).toHaveCount(0);

  // Same check after client-side navigation, where the browser (not the server) fetches through the proxy.
  await pa.getByRole('button', { name: 'Refresh' }).click();
  await pb.getByRole('button', { name: 'Refresh' }).click();
  await pa.waitForLoadState('networkidle');
  await pb.waitForLoadState('networkidle');
  await expect(pa.getByText('Dark Rye Loaf')).toHaveCount(0);
  await expect(pb.getByText('Country Sourdough')).toHaveCount(0);
  await Promise.all([a.close(), b.close()]);
});
