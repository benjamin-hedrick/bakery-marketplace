import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { globalId, userToken } from './support';

// WI-TAG-004 on the real stack: the diets a customer prefers, through the BFF, the catalog and Cosmos. The seed's sourdough is vegan, its seed crust is tagged vegan
// and "Sliced" deliberately is not, so the rule (the item and every chosen option carry the tag) shows both ways; the croissant is vegetarian only.
// Needs the whole local stack (docs/operations/local-dev.md); node scripts/ci/skeleton-smoke.mjs starts it.

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
const SOURDOUGH = globalId('Listing', 'listing-sourdough-001');
const CROISSANT = globalId('Listing', 'listing-croissant-001');

test.describe.configure({ mode: 'serial' });

async function gql(request: APIRequestContext, token: string, query: string, variables?: object) {
  const res = await request.post(`${BFF}/graphql`, {
    headers: { authorization: `Bearer ${token}` },
    data: { query, variables },
  });
  return res.json();
}

const SAVE = `mutation($input: SavePreferencesInput!) { savePreferences(input: $input) { __typename
  ... on SavePreferencesSuccess { preferences { prefer } } ... on SavePreferencesRejected { fields { field } } } }`;
const DIET = 'dietMatches { tagId marked itemMarked optionIdsNotMarked }';

test.afterAll(async ({ request }) => {
  const token = await userToken('user-customer-1');
  await gql(request, token, SAVE, { input: { allergies: [], avoid: [], prefer: [] } });
});

test('a preferred diet is saved, and a listing is marked or not by the rule, with the options chosen', async ({
  request,
}) => {
  const token = await userToken('user-customer-1');
  const saved = await gql(request, token, SAVE, { input: { allergies: [], avoid: [], prefer: ['vegan'] } });
  expect(saved.data.savePreferences.preferences.prefer).toEqual(['vegan']);

  const one = await gql(request, token, `query($id: ID!) { personalizedListing(id: $id) { ${DIET} } }`, {
    id: SOURDOUGH,
  });
  expect(one.data.personalizedListing.dietMatches).toEqual([
    { tagId: 'vegan', marked: true, itemMarked: true, optionIdsNotMarked: ['mod-sliced'] }, // browse: marked, and Sliced would remove the claim
  ]);

  const cart = await gql(request, token, `query($lines: [CartLineInput!]!) { cartCheck(lines: $lines) { ${DIET} } }`, {
    lines: [
      { listingId: SOURDOUGH, optionIds: ['mod-seeds'] },
      { listingId: SOURDOUGH, optionIds: ['mod-seeds', 'mod-sliced'] },
      { listingId: CROISSANT, optionIds: [] },
    ],
  });
  const [withSeeds, withSliced, croissant] = cart.data.cartCheck.map(
    (l: { dietMatches: unknown[] }) => l.dietMatches[0],
  );
  expect(withSeeds).toMatchObject({ marked: true, optionIdsNotMarked: [] });
  expect(withSliced).toMatchObject({ marked: false, itemMarked: true, optionIdsNotMarked: ['mod-sliced'] });
  expect(croissant).toMatchObject({ marked: false, itemMarked: false });
});

test('an id that is not a diet is refused by name, and a vendor token is refused the profile', async ({ request }) => {
  const token = await userToken('user-customer-1');
  const rejected = await gql(request, token, SAVE, { input: { allergies: [], avoid: [], prefer: ['dairy'] } });
  expect(rejected.data.savePreferences.__typename).toBe('SavePreferencesRejected');
  expect(rejected.data.savePreferences.fields.map((f: { field: string }) => f.field)).toContain('prefer');

  const vendor = await userToken('vendor-shop-001');
  const asVendor = await gql(request, vendor, '{ preferences { prefer } }');
  expect(asVendor.errors[0].extensions.code).toBe('FORBIDDEN');
});

test('the browser shows the bakery’s claim on the browse page for a customer who prefers a diet', async ({
  page,
  request,
}) => {
  const token = await userToken('user-customer-1');
  await gql(request, token, SAVE, { input: { allergies: [], avoid: [], prefer: ['vegan'] } });

  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).first().click();
  await expect(page).toHaveURL(/localhost:5100\/authorize/);
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();

  const sourdough = page.getByTestId('listing').filter({ hasText: 'Country Sourdough' });
  await expect(sourdough.getByTestId('diet-note')).toHaveText('Vegan, marked by the bakery.');
  await expect(page.getByTestId('listing').filter({ hasText: 'Almond Croissant' }).getByTestId('diet-note')).toHaveText(
    'Not marked vegan by the bakery.',
  );
});
