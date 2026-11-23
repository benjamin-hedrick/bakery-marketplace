import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  APP,
  changeListingElsewhere,
  listingId,
  logInAsVendor,
  mockListings,
  resetAll,
  setListings,
  setMock,
  type MockListing,
} from './helpers';

// WI-CAT-008: the vendor's listing and stock screens. The login is real (the fake issuer); the BFF is the mock (mock-bff/listings.mjs), which keeps
// the edit version, the idempotency key, the counted edit without a count and the count that may not go below zero the way the real BFF and catalog
// do. Whether a write is allowed is the catalog's decision (tested in catalog and the BFF); these tests check what the screens show, send and say.

test.beforeEach(async () => {
  await resetAll();
});

const CROISSANT = listingId('listing-croissant');
const LOAF = listingId('listing-loaf');

const croissant = (over: Partial<MockListing> = {}): MockListing => ({
  id: CROISSANT,
  name: 'Almond Croissant',
  category: 'Pastry',
  priceCents: 425,
  status: 'PUBLISHED',
  allergenFlags: ['gluten', 'tree-nut'],
  tags: ['vegetarian'],
  modifiers: [{ id: 'mod-warm', name: 'Warmed', priceDeltaCents: 50 }],
  stock: { availableQuantity: 3, maxPerOrder: 4, lowStockThreshold: 5 },
  editVersion: 7,
  ...over,
});
const loaf = (over: Partial<MockListing> = {}): MockListing => ({
  id: LOAF,
  name: 'Country Sourdough',
  category: 'Bread',
  priceCents: 800,
  status: 'DRAFT',
  stock: { availableQuantity: null },
  ...over,
});

async function openListings(page: Page, listings: MockListing[]) {
  await setListings({ listings });
  await logInAsVendor(page);
  await page.goto('/listings');
}

const row = (page: Page, name: string) => page.getByTestId('listing-row').filter({ hasText: name });
const writes = async () => (await mockListings()).writes;

// ---- the list (requirement 2) ------------------------------------------------------------------------------------------------

test('the list shows each listing with its price, status, stock and when it changed, and filters by status', async ({
  page,
}) => {
  await openListings(page, [croissant(), loaf()]);

  await expect(row(page, 'Almond Croissant').getByTestId('listing-price')).toHaveText('$4.25');
  await expect(row(page, 'Almond Croissant').getByTestId('listing-status')).toHaveText('Published');
  await expect(row(page, 'Almond Croissant').getByTestId('listing-stock')).toHaveText('3 left · Low');
  await expect(row(page, 'Almond Croissant')).toContainText('Changed');
  await expect(row(page, 'Country Sourdough').getByTestId('listing-stock')).toHaveText('Made to order');
  await expect(row(page, 'Country Sourdough').getByTestId('listing-status')).toHaveText('Draft');

  await page.getByRole('radio', { name: 'Drafts' }).check();
  await expect(page.getByTestId('listing-row')).toHaveCount(1);
  await expect(row(page, 'Country Sourdough')).toBeVisible();
  await page.getByRole('radio', { name: 'Published' }).check();
  await expect(page.getByTestId('listing-row')).toHaveCount(1);
  await expect(row(page, 'Almond Croissant')).toBeVisible();
});

test('a slow answer to an earlier filter never replaces the list of the filter now chosen (register 239)', async ({
  page,
}) => {
  await openListings(page, [croissant(), loaf()]);
  await page.route('**/api/graphql', async (route) => {
    if ((route.request().postData() ?? '').includes('"status":"PUBLISHED"'))
      await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });

  await page.getByRole('radio', { name: 'Published' }).check();
  await page.getByRole('radio', { name: 'Drafts' }).check();
  await expect(row(page, 'Country Sourdough')).toBeVisible();

  await page.waitForTimeout(2200); // the Published answer has arrived by now
  await expect(page.getByTestId('listing-row')).toHaveCount(1);
  await expect(row(page, 'Country Sourdough')).toBeVisible();
});

test('the list is paged', async ({ page }) => {
  const many = Array.from({ length: 23 }, (_, i) =>
    loaf({ id: listingId(`listing-${String(i).padStart(3, '0')}`), name: `Loaf ${String(i).padStart(2, '0')}` }),
  );
  await openListings(page, many);

  await expect(page.getByTestId('listing-row')).toHaveCount(20);
  await page.getByTestId('listings-more').click();
  await expect(page.getByTestId('listing-row')).toHaveCount(23);
  await expect(page.getByTestId('listings-more')).toHaveCount(0);
});

test('an empty list says how to add the first listing, and passes an accessibility check', async ({ page }) => {
  await openListings(page, []);

  await expect(page.getByTestId('listings-empty')).toContainText('You have no listings yet');
  await page.getByRole('link', { name: 'Add your first listing' }).click();
  await expect(page).toHaveURL(/\/listings\/new$/);
  await page.goto('/listings');
  await expect(page.getByTestId('listings-empty')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('the list passes an accessibility check, and its controls name the listing', async ({ page }) => {
  await openListings(page, [croissant(), loaf()]);
  await expect(row(page, 'Almond Croissant')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Remove 1 from Almond Croissant' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add 1 to Almond Croissant' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark Almond Croissant sold out' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unpublish Almond Croissant' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish Country Sourdough' })).toBeVisible();
  await expect(row(page, 'Country Sourdough').getByTestId('stock-controls')).toHaveCount(0); // made to order: no count
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('the header links the queue and the listings', async ({ page }) => {
  await openListings(page, []);
  await expect(page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Listings' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('link', { name: 'Order queue' }).click();
  await expect(page).toHaveURL(`${APP}/`);
  await page.getByRole('link', { name: 'Listings' }).click();
  await expect(page).toHaveURL(`${APP}/listings`);
});

// ---- stock from the list (requirement 3) -------------------------------------------------------------------------------------

test('add, remove and sold out are each one adjustment by a number of units, never a count', async ({ page }) => {
  await openListings(page, [croissant({ stock: { availableQuantity: 10, lowStockThreshold: 2 } })]);

  await row(page, 'Almond Croissant').getByLabel('Units').fill('4');
  await page.getByRole('button', { name: 'Add 4 to Almond Croissant' }).click();
  await expect(row(page, 'Almond Croissant').getByTestId('listing-stock')).toHaveText('14 left · In stock');
  await page.getByRole('button', { name: 'Remove 4 from Almond Croissant' }).click();
  await expect(row(page, 'Almond Croissant').getByTestId('listing-stock')).toHaveText('10 left · In stock');
  await page.getByRole('button', { name: 'Mark Almond Croissant sold out' }).click();
  await expect(row(page, 'Almond Croissant').getByTestId('listing-stock')).toHaveText('0 left · Sold out');

  const sent = await writes();
  expect(sent.map((w) => [w.op, w.variables.delta])).toEqual([
    ['ListingWritesAdjustMutation', 4],
    ['ListingWritesAdjustMutation', -4],
    ['ListingWritesAdjustMutation', -10],
  ]);
  expect(JSON.stringify(sent)).not.toContain('availableQuantity'); // ADR-0017: no count is ever sent from the list
});

test('a removal past zero after a sale shows the count as it is now and says it had changed', async ({ page }) => {
  await openListings(page, [croissant({ stock: { availableQuantity: 3 } })]);
  await expect(row(page, 'Almond Croissant').getByTestId('listing-stock')).toHaveText('3 left · Low');
  await changeListingElsewhere({ id: CROISSANT, sold: 2 }); // a customer bought two after the list was read

  await page.getByRole('button', { name: 'Mark Almond Croissant sold out' }).click(); // removes the 3 the screen shows

  await expect(row(page, 'Almond Croissant').getByTestId('row-message')).toContainText('The count had changed');
  await expect(row(page, 'Almond Croissant').getByTestId('listing-stock')).toHaveText('1 left · Low');
  expect((await mockListings()).listings.find((l) => l.id === CROISSANT)?.stock?.availableQuantity).toBe(1);
});

test('while an adjustment is in flight the row’s controls are off, and a failure says so and turns them on again', async ({
  page,
}) => {
  await openListings(page, [croissant()]);
  await setListings({ listingDelayMs: 800 });

  await page.getByRole('button', { name: 'Add 1 to Almond Croissant' }).click();
  await expect(page.getByRole('button', { name: 'Remove 1 from Almond Croissant' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remove 1 from Almond Croissant' })).toBeEnabled();

  await setListings({ listingDelayMs: 0, listingMode: 'error' });
  await page.getByRole('button', { name: 'Add 1 to Almond Croissant' }).click();
  await expect(row(page, 'Almond Croissant').getByTestId('row-message')).toHaveText(
    'Almond Croissant: That did not work. Please try again.',
  );
  await expect(page.getByRole('button', { name: 'Add 1 to Almond Croissant' })).toBeEnabled();
  expect(await page.content()).not.toContain('catalog.internal');
});

// ---- publishing (requirement 7) -----------------------------------------------------------------------------------------------

test('publish from the list saves only the status, with the edit version, and keeps the stock settings as they are', async ({
  page,
}) => {
  await openListings(page, [loaf({ editVersion: 3 })]);

  await page.getByRole('button', { name: 'Publish Country Sourdough' }).click();

  await expect(row(page, 'Country Sourdough').getByTestId('listing-status')).toHaveText('Published');
  const [w] = await writes();
  expect(w?.op).toBe('ListingWritesUpdateMutation');
  expect(w?.variables.version).toBe(3);
  expect(w?.variables.input?.['status']).toBe('PUBLISHED');
  expect(w?.variables.input?.['stock']).toBeNull();
  expect(w?.variables.input?.['name']).toBe('Country Sourdough');
});

test('a publish that finds the listing changed refreshes only its row, and the pages already loaded stay (register 239)', async ({
  page,
}) => {
  const many = Array.from({ length: 23 }, (_, i) =>
    loaf({ id: listingId(`listing-${String(i).padStart(3, '0')}`), name: `Loaf ${String(i).padStart(2, '0')}` }),
  );
  await openListings(page, many);
  await page.getByTestId('listings-more').click();
  await expect(page.getByTestId('listing-row')).toHaveCount(23);
  await changeListingElsewhere({ id: listingId('listing-022'), edit: { name: 'Loaf 22 (from the other tab)' } });

  await page.getByRole('button', { name: 'Publish Loaf 22' }).click();

  await expect(row(page, 'Loaf 22 (from the other tab)')).toBeVisible();
  await expect(page.getByTestId('listing-row')).toHaveCount(23);
});

test('an unverified vendor’s publish says the shop must be verified, and the listing stays a draft', async ({
  page,
}) => {
  await openListings(page, [loaf()]);
  await setListings({ verified: false });

  await page.getByRole('button', { name: 'Publish Country Sourdough' }).click();

  await expect(row(page, 'Country Sourdough').getByTestId('row-message')).toContainText(
    'Your shop must be verified before a listing can go live',
  );
  await expect(row(page, 'Country Sourdough').getByTestId('listing-status')).toHaveText('Draft');
});

// ---- the form (requirements 4 to 6) -------------------------------------------------------------------------------------------

test('a create sends everything typed, in cents, with the starting count, and opens the new listing', async ({
  page,
}) => {
  await setListings({ listings: [] });
  await logInAsVendor(page);
  await page.goto('/listings/new');

  await page.getByLabel('Name', { exact: true }).fill('Rye Loaf');
  await page.getByLabel('Category').fill('Bread');
  await page.getByLabel('Price', { exact: true }).fill('6.75');
  await page.getByRole('group', { name: 'Allergens', exact: true }).getByLabel('Gluten (wheat, rye, barley)').check();
  await page.getByRole('group', { name: 'Other tags' }).getByLabel('Vegan').check();
  await page.getByRole('button', { name: 'Add an option' }).click();
  await page.getByLabel('Option name').fill('Sliced');
  await page.getByLabel('Price difference').fill('0.50');
  await page.getByRole('group', { name: 'Allergens of option 1' }).getByLabel('Sesame').check();
  await page.getByLabel('Counted (each order takes from a count)').check();
  await page.getByLabel('Starting count').fill('12');
  await page.getByLabel('Most per order (optional)').fill('3');
  await page.getByLabel('Published (customers see it)').check();
  await page.getByRole('button', { name: 'Create listing' }).click();

  await expect(page.getByTestId('editor-created')).toHaveText('The listing was created.');
  await expect(page).toHaveURL(/\/listings\/[^/]+\?created=1$/);
  await expect(page.getByRole('heading', { name: 'Edit Rye Loaf' })).toBeVisible();
  const [w] = await writes();
  expect(w?.op).toBe('ListingWritesCreateMutation');
  expect(w?.variables.key).toMatch(/^[0-9a-f-]{36}$/);
  expect(w?.variables.input).toMatchObject({
    name: 'Rye Loaf',
    category: 'Bread',
    priceCents: 675,
    status: 'PUBLISHED',
    allergenFlags: ['gluten'],
    tags: ['vegan'],
    stock: { mode: 'COUNTED', availableQuantity: 12, maxPerOrder: 3, lowStockThreshold: null },
  });
  const option = (
    w?.variables.input?.['modifiers'] as { id: string; name: string; priceDeltaCents: number; allergens: string[] }[]
  )[0];
  expect(option).toMatchObject({ name: 'Sliced', priceDeltaCents: 50, allergens: ['sesame'] });
  expect(option?.id).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
});

test('the catalog’s refusals appear beside their fields and in a summary, the form keeps what was typed, and it passes an accessibility check', async ({
  page,
}) => {
  await setListings({ listings: [] });
  await logInAsVendor(page);
  await page.goto('/listings/new');
  const blank = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(blank.violations).toEqual([]);

  await page.getByLabel('Category').fill('Bread');
  await page.getByLabel('Price', { exact: true }).fill('200000.00'); // past the catalog's limit: sent, and the catalog says so
  await page.getByRole('button', { name: 'Create listing' }).click();

  await expect(page.getByTestId('editor-notice')).toContainText('could not be saved as entered');
  await expect(page.getByTestId('error-listing-name')).toHaveText('Name is required.');
  await expect(page.getByTestId('error-listing-price')).toHaveText('Price must be between 0 and 10000000 cents.');
  await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-describedby', 'listing-name-error');
  await expect(page.getByLabel('Price', { exact: true })).toHaveAttribute(
    'aria-describedby',
    'listing-price-hint listing-price-error',
  );
  await expect(page.getByTestId('error-summary')).toContainText('Name is required.');
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('200000.00'); // kept
  await expect(page.getByLabel('Category')).toHaveValue('Bread');
  const withErrors = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(withErrors.violations).toEqual([]);
});

test('text that is not a number is named before anything is sent', async ({ page }) => {
  await setListings({ listings: [] });
  await logInAsVendor(page);
  await page.goto('/listings/new');

  await page.getByLabel('Name', { exact: true }).fill('Loaf');
  await page.getByLabel('Price', { exact: true }).fill('cheap');
  await page.getByRole('button', { name: 'Create listing' }).click();

  await expect(page.getByTestId('error-listing-price')).toHaveText('Enter a price in dollars and cents, like 4.50.');
  expect(await writes()).toEqual([]);
});

test('an edit round-trips what it loaded, names its edit version, and sends a counted listing’s settings without a count', async ({
  page,
}) => {
  await openListings(page, [croissant({ tags: ['vegetarian', 'old-season'] })]);
  await page.getByRole('link', { name: 'Almond Croissant' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Almond Croissant' })).toBeVisible();
  await expect(page.getByTestId('kept-tags')).toContainText('old-season'); // a tag the registry no longer offers is kept, not dropped
  await expect(page.getByTestId('count-now')).toContainText('Count now: 3');

  await page.getByLabel('Show as low at this count or below (optional)').fill('2');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByTestId('editor-notice')).toHaveText('Saved.');
  const [w] = await writes();
  expect(w?.op).toBe('ListingWritesUpdateMutation');
  expect(w?.variables.version).toBe(7);
  expect(w?.variables.input).toMatchObject({
    name: 'Almond Croissant',
    priceCents: 425,
    allergenFlags: ['gluten', 'tree-nut'],
    tags: ['vegetarian', 'old-season'],
    modifiers: [{ id: 'mod-warm', name: 'Warmed', priceDeltaCents: 50, allergens: [], tags: [] }],
    stock: { mode: 'COUNTED', maxPerOrder: 4, lowStockThreshold: 2 },
  });
  expect(w?.variables.input?.['stock']).not.toHaveProperty('availableQuantity');
});

test('an adjustment on the edit page changes the count without moving the form’s edit version', async ({ page }) => {
  await openListings(page, [croissant()]);
  await page.goto(`/listings/${encodeURIComponent(CROISSANT)}`);

  await page.getByRole('button', { name: 'Add 1 to Almond Croissant' }).click();
  await expect(page.getByTestId('count-now')).toContainText('Count now: 4');
  await page.getByLabel('Name', { exact: true }).fill('Almond Croissant (large)');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByTestId('editor-notice')).toHaveText('Saved.');
  const sent = await writes();
  expect(sent.map((w) => w.op)).toEqual(['ListingWritesAdjustMutation', 'ListingWritesUpdateMutation']);
  expect(sent[1]?.variables.version).toBe(7);
});

test('a save from an old copy is refused, keeps what was typed, and offers the newer copy', async ({ page }) => {
  await openListings(page, [croissant()]);
  await page.goto(`/listings/${encodeURIComponent(CROISSANT)}`);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Almond Croissant');
  await changeListingElsewhere({ id: CROISSANT, edit: { name: 'Almond Croissant (from the other tab)' } });

  await page.getByLabel('Name', { exact: true }).fill('My new name');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByTestId('editor-notice')).toContainText('was changed since you opened it');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('My new name');
  expect((await mockListings()).listings.find((l) => l.id === CROISSANT)?.name).toBe(
    'Almond Croissant (from the other tab)',
  );

  await page.getByRole('button', { name: /Load the newer copy/ }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Almond Croissant (from the other tab)');
  await page.getByLabel('Name', { exact: true }).fill('My new name');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved.');
});

test('a create clicked twice sends one write, and a retry after a lost answer returns the same listing', async ({
  page,
}) => {
  await setListings({ listings: [], listingDelayMs: 600 });
  await logInAsVendor(page);
  await page.goto('/listings/new');
  await page.getByLabel('Name', { exact: true }).fill('Rye Loaf');
  await page.getByLabel('Category').fill('Bread');
  await page.getByLabel('Price', { exact: true }).fill('6');

  await setListings({ listingMode: 'lost' }); // the catalog stores it, the answer never comes back
  await page.getByRole('button', { name: 'Create listing' }).click();
  await expect(page.getByRole('button', { name: /Saving/ })).toBeDisabled(); // in flight: a second click does nothing
  await page
    .getByRole('button', { name: /Saving/ })
    .click({ force: true })
    .catch(() => {});
  await expect(page.getByTestId('editor-notice')).toHaveText('That did not work. Please try again.');
  expect(await writes()).toHaveLength(1);

  await setListings({ listingMode: 'ok', listingDelayMs: 0 });
  await page.getByRole('button', { name: 'Create listing' }).click(); // Try again: the same key
  await expect(page.getByTestId('editor-created')).toBeVisible();

  const { writes: sent, listings } = await mockListings();
  expect(sent).toHaveLength(2);
  expect(sent[1]?.variables.key).toBe(sent[0]?.variables.key);
  expect(listings).toHaveLength(1);
});

test('a create changed after one that did go through says it was already created and links to it', async ({ page }) => {
  await setListings({ listings: [] });
  await logInAsVendor(page);
  await page.goto('/listings/new');
  await page.getByLabel('Name', { exact: true }).fill('Rye Loaf');
  await page.getByLabel('Category').fill('Bread');
  await page.getByLabel('Price', { exact: true }).fill('6');
  await setListings({ listingMode: 'lost' });
  await page.getByRole('button', { name: 'Create listing' }).click();
  await expect(page.getByTestId('editor-notice')).toHaveText('That did not work. Please try again.');

  await setListings({ listingMode: 'ok' });
  await page.getByLabel('Price', { exact: true }).fill('6.50'); // changed after the create that went through
  await page.getByRole('button', { name: 'Create listing' }).click();

  await expect(page.getByTestId('editor-notice')).toContainText('This listing was already created.');
  const created = (await mockListings()).listings;
  expect(created).toHaveLength(1);
  await page.getByRole('link', { name: 'Open the listing that was created' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Rye Loaf' })).toBeVisible();
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('6.00');
});

test('a new form gets a new key', async ({ page }) => {
  await setListings({ listings: [] });
  await logInAsVendor(page);
  for (const name of ['First', 'Second']) {
    await page.goto('/listings/new');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Category').fill('Bread');
    await page.getByLabel('Price', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Create listing' }).click();
    await expect(page.getByTestId('editor-created')).toBeVisible();
  }
  const sent = await writes();
  expect(new Set(sent.map((w) => w.variables.key)).size).toBe(2);
});

test('while a save is in flight the form is off; a failure says so in words and the save can be tried again', async ({
  page,
}) => {
  await openListings(page, [croissant()]);
  await page.goto(`/listings/${encodeURIComponent(CROISSANT)}`);
  await setListings({ listingDelayMs: 800, listingMode: 'error' });

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
  await expect(page.getByTestId('editor-notice')).toHaveText('That did not work. Please try again.');
  await expect(page.getByLabel('Name', { exact: true })).toBeEnabled();
  expect(await page.content()).not.toContain('catalog.internal');

  await setListings({ listingDelayMs: 0, listingMode: 'ok' });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved.');
});

test('a BFF that never answers ends in the network function’s wait, with a message and the save enabled again', async ({
  page,
}) => {
  await page.clock.install();
  await openListings(page, [croissant()]);
  await page.goto(`/listings/${encodeURIComponent(CROISSANT)}`);
  await setListings({ listingMode: 'slow' });

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
  await page.clock.fastForward(36_000); // GRAPHQL_TIMEOUT_MS is 35 s

  await expect(page.getByTestId('editor-notice')).toHaveText('That did not work. Please try again.');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
});

// ---- abuse and failure (requirement 10) --------------------------------------------------------------------------------------

test('another vendor’s listing, an id that is not one, and a hostile id in the address all show not found', async ({
  page,
}) => {
  const theirs = listingId('listing-theirs');
  await openListings(page, [croissant(), loaf({ id: theirs, vendor: 'other', name: 'Their Loaf' })]);
  await expect(page.getByTestId('listing-row')).toHaveCount(1); // theirs is not in the list

  for (const address of [theirs, 'not-an-id', '%3Cscript%3Ealert(1)%3C%2Fscript%3E', '..%2F..%2Fapi%2Fauth%2Flogout']) {
    await page.goto(`/listings/${address}`);
    await expect(page.getByTestId('editor-not-found'), address).toHaveText(
      'That listing could not be found. It may not be one of yours.',
    );
  }
  await expect(page.getByTestId('user-name')).toBeVisible(); // still logged in: the hostile path did not reach the logout route
  expect(await writes()).toEqual([]);
});

test('a login that is not a vendor’s sees the forbidden message on the list and the form', async ({ page }) => {
  await openListings(page, [croissant()]);
  await setMock({ mode: 'forbidden' }); // the BFF answers FORBIDDEN for a customer's token

  await page.goto('/listings');
  await expect(page.getByTestId('listings-forbidden')).toHaveText(
    'This login is not a vendor’s, so there are no listings to show.',
  );
  await page.goto(`/listings/${encodeURIComponent(CROISSANT)}`);
  await expect(page.getByTestId('editor-forbidden')).toBeVisible();
});

test('with no login the pages offer the login and send nothing', async ({ page }) => {
  await setListings({ listings: [croissant()] });
  for (const path of ['/listings', '/listings/new', `/listings/${encodeURIComponent(CROISSANT)}`]) {
    await page.goto(path);
    await expect(page.getByTestId('login-required'), path).toBeVisible();
  }
  expect(await writes()).toEqual([]);
});

test('a listing write posted without the app’s own origin is refused by the web app and never reaches the BFF', async ({
  page,
}) => {
  await openListings(page, [croissant()]);
  const body = JSON.stringify({
    query:
      'mutation ListingWritesAdjustMutation($id: ID!, $delta: Int!) { adjustListingStock(id: $id, delta: $delta) { __typename } }',
    variables: { id: CROISSANT, delta: -3 },
  });
  const attempts: Record<string, string>[] = [
    { origin: 'http://evil.example', 'content-type': 'application/json' },
    { 'content-type': 'application/json' },
    { origin: APP, 'content-type': 'application/x-www-form-urlencoded' },
  ];
  for (const headers of attempts) {
    const res = await page.request.post('/api/graphql', { headers, data: body });
    expect(res.status(), JSON.stringify(headers)).toBe(403);
  }
  expect(await writes()).toEqual([]);
});

test('the pages read only the vendor’s own listing type, never the public one', async ({ page }) => {
  const bodies: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/api/graphql')) bodies.push(r.postData() ?? '');
  });
  await openListings(page, [croissant()]);
  await expect(row(page, 'Almond Croissant')).toBeVisible();
  await page.goto(`/listings/${encodeURIComponent(CROISSANT)}`);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Almond Croissant');

  const operations = bodies.join('\n');
  expect(operations).toContain('myListings');
  expect(operations).toContain('myListing(');
  expect(operations).not.toMatch(/[{\s]listings?\s*[({]/); // the public listing and listings fields
});
