import { expect, test } from '@playwright/test';
import type { ConsoleMessage } from '@playwright/test';

// WI-PORT-002 smoke: browser -> Next.js SSR -> GraphQL BFF -> catalog-service -> Cosmos, with the data written by the
// WI-DEV-004 seed (docs/architecture/first-slice-contract.md section 7). Needs the whole local stack; see README.

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
const SEEDED_PUBLISHED = [
  'Almond Croissant',
  'Blueberry Oat Muffin',
  'Brown Butter Cookies',
  'Cardamom Honey Latte',
  'Country Sourdough',
  'Lemon Loaf',
  'Oat Milk Latte',
];

// D-9: the BFF hands out Relay global ids, base64 of `Type:serviceId`.
const globalListingId = (serviceId: string) => Buffer.from(`Listing:${serviceId}`).toString('base64');

test('seeded listings are server-rendered from the real catalog, and the draft is not shown', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('listing')).toHaveCount(SEEDED_PUBLISHED.length);
  for (const name of SEEDED_PUBLISHED) await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText('Draft Seasonal Tart')).toHaveCount(0);
  await expect(page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByTestId('price')).toHaveText(
    '$8.00',
  );
  await context.close();
});

test('hydration is clean and first paint makes no browser-side GraphQL request', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  const graphqlCalls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/graphql')) graphqlCalls.push(r.url());
  });

  await page.goto('/');
  await expect(page.getByTestId('listing')).toHaveCount(SEEDED_PUBLISHED.length);
  await page.waitForLoadState('networkidle');

  expect(problems, problems.join('\n')).toEqual([]);
  expect(graphqlCalls).toEqual([]);
});

test('detail page shows allergen flags and modifier prices from the service', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Almond Croissant' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/listings/${encodeURIComponent(globalListingId('listing-croissant-001'))}$`),
  );
  await expect(page.getByTestId('detail-price')).toHaveText('$4.50');
  // The page shows the registry's labels, not the flag ids (tree nuts, not tree-nut).
  await expect(page.getByText('Allergens: gluten (wheat, rye, barley), milk (dairy), tree nuts')).toBeVisible();
  await expect(page.getByText('Extra almonds (+$0.75) — contains tree nuts')).toBeVisible();
});

test('a listing that is not public renders not-found, not an error page', async ({ page }) => {
  const res = await page.goto(`/listings/${encodeURIComponent(globalListingId('listing-draft-001'))}`);
  expect(res?.status()).toBe(404);
});

test('the BFF is the only API surface the browser can reach and answers with a trace id and no-store', async ({
  request,
}) => {
  const res = await request.post(`${BFF}/graphql`, {
    data: { query: '{ listings(first: 1) { edges { node { id } } } }' },
  });
  expect(res.ok()).toBe(true);
  expect(res.headers()['x-correlation-id']).toMatch(/^[0-9a-f]{32}$/);
  expect(res.headers()['cache-control']).toBe('private, no-store');
});
