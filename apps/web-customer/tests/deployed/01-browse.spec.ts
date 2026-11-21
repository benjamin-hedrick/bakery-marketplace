import { LISTINGS, expect, saveEvidence, test } from './support';

// Tests 1 and 2 of the deployed suite (register 218). The home page is rendered on the server: web app -> BFF -> catalog -> Cosmos, with the catalog's
// cache Redis. The seeded listings appear only after the catalog has applied the seed job's VendorVerified events from the events Redis, so seeing them
// proves that path too. The first request after the deploy starts the apps from zero; the time until the listings appear is recorded as evidence.

test('1. the server-rendered home page shows the seeded listings (web, BFF, catalog, Cosmos, the events and cache Redis)', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const started = Date.now();
  let attempts = 0;
  let firstStatus: number | undefined;
  // Wait for the cold environment: the apps scale from zero, and the catalog applies the vendor events when it first starts.
  await expect
    .poll(
      async () => {
        attempts += 1;
        const response = await page.goto('/');
        firstStatus ??= response?.status();
        return page.getByTestId('listing').count();
      },
      { timeout: 360_000, intervals: [5_000, 10_000, 15_000] },
    )
    .toBeGreaterThan(0);
  saveEvidence('cold-start.json', {
    secondsUntilListings: Math.round((Date.now() - started) / 1000),
    attempts,
    firstStatus: firstStatus ?? null,
    at: new Date(started).toISOString(),
  });

  for (const name of [LISTINGS.sourdough, LISTINGS.croissant, LISTINGS.latte, LISTINGS.lemonade])
    await expect(page.getByTestId('listing').filter({ hasText: name })).toHaveCount(1);
  await expect(page.getByTestId('listing').filter({ hasText: 'Draft Seasonal Tart' })).toHaveCount(0); // the publish gate

  // Rendered on the server: the listings are in the HTML the web app sent, before any script ran.
  const html = await (await page.request.get('/')).text();
  expect(html).toContain(LISTINGS.sourdough);
});

test('2. a listing page renders its price, options and stock from the catalog', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: LISTINGS.sourdough }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: LISTINGS.sourdough })).toBeVisible();
  await expect(page.getByTestId('stock')).toHaveText(/In stock|Low stock/);
  await expect(page.getByRole('checkbox', { name: /Sliced/ })).toBeVisible(); // an option from the catalog
  await expect(page.getByLabel('Quantity')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to order' })).toBeEnabled();
});
