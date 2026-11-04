import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { globalId, userToken } from './support';

// WI-SRCH-001 on the real stack: the customer's conflicts on the seeded catalog, through the GraphQL BFF, the catalog and Cosmos. The seed has
// the almond croissant (tree-nut, dairy and gluten on the item; tree-nut in an option), the walnut muffin (tree-nut only in an option), the
// sourdough (sesame only in an option) and the cookies and lemon loaf (dairy on the item).
// Needs the whole local stack (docs/operations/local-dev.md); node scripts/ci/skeleton-smoke.mjs starts it.

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
const CROISSANT = globalId('Listing', 'listing-croissant-001');
const MUFFIN = globalId('Listing', 'listing-muffin-001');
const SOURDOUGH = globalId('Listing', 'listing-sourdough-001');

async function gql(request: APIRequestContext, token: string | null, query: string, variables?: object) {
  const res = await request.post(`${BFF}/graphql`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    data: { query, variables },
  });
  return res.json();
}

const SAVE = `mutation($input: SavePreferencesInput!) { savePreferences(input: $input) { __typename } }`;
const CONFLICT = 'allergenId severity source optionIds';
const LIST = `query($hide: Boolean) { personalizedListings(first: 50, hideConflicts: $hide) {
  edges { node { listing { id name } conflicts { ${CONFLICT} } } } } }`;
const PUBLIC_LIST = `{ listings(first: 50) { edges { node { id } } } }`;
const ONE = `query($id: ID!) { personalizedListing(id: $id) { listing { name } conflicts { ${CONFLICT} } } }`;
const CART = `query($lines: [CartLineInput!]!) { cartCheck(lines: $lines) { listingId found unknownOptionIds conflicts { ${CONFLICT} } } }`;

const shape = (conflicts: { allergenId: string; severity: string; source: string; optionIds: string[] }[]) =>
  conflicts.map((c) => `${c.allergenId}:${c.severity}:${c.source}:[${c.optionIds.join(',')}]`);

type Edge = { node: { listing: { id: string; name: string }; conflicts: Parameters<typeof shape>[0] } };
const conflictsOf = (edges: Edge[], id: string) => shape(edges.find((e) => e.node.listing.id === id)!.node.conflicts);

test.describe.configure({ mode: 'serial' });

test('the seeded catalog shows the customer’s conflicts, in the public order, and hiding removes only item-level ones', async ({
  request,
}) => {
  const token = await userToken('user-customer-1');
  await gql(request, token, SAVE, { input: { allergies: ['tree-nut'], avoid: ['dairy'] } });

  const mine = (await gql(request, token, LIST)).data.personalizedListings.edges as Edge[];
  const publicIds = (await gql(request, null, PUBLIC_LIST)).data.listings.edges.map(
    (e: { node: { id: string } }) => e.node.id,
  );

  expect(mine.map((e) => e.node.listing.id)).toEqual(publicIds); // the same listings in the same order as the public page
  expect(conflictsOf(mine, CROISSANT)).toEqual([
    'tree-nut:ALLERGY:ITEM:[]',
    'tree-nut:ALLERGY:OPTION:[mod-extra-almond]',
    'dairy:AVOID:ITEM:[]',
  ]);
  expect(conflictsOf(mine, MUFFIN)).toEqual(['tree-nut:ALLERGY:OPTION:[mod-walnuts]']); // only through an add-on
  expect(conflictsOf(mine, SOURDOUGH)).toEqual([]);

  const shown = (await gql(request, token, LIST, { hide: true })).data.personalizedListings.edges as Edge[];
  const ids = shown.map((e) => e.node.listing.id);
  expect(ids).not.toContain(CROISSANT); // the item contains tree nuts and dairy
  expect(ids).toContain(MUFFIN); // kept, and still marked
  expect(conflictsOf(shown, MUFFIN)).toEqual(['tree-nut:ALLERGY:OPTION:[mod-walnuts]']);
  expect(ids).toContain(SOURDOUGH);

  await gql(request, token, SAVE, { input: { allergies: [], avoid: [] } });
});

test('one listing with its conflicts, and a cart check that counts only the options chosen', async ({ request }) => {
  const token = await userToken('user-customer-1');
  await gql(request, token, SAVE, { input: { allergies: ['tree-nut', 'sesame'], avoid: [] } });

  const detail = (await gql(request, token, ONE, { id: CROISSANT })).data.personalizedListing;
  expect(detail.listing.name).toBe('Almond Croissant');
  expect(shape(detail.conflicts)).toEqual(['tree-nut:ALLERGY:ITEM:[]', 'tree-nut:ALLERGY:OPTION:[mod-extra-almond]']);

  const cart = (
    await gql(request, token, CART, {
      lines: [
        { listingId: MUFFIN, optionIds: [] },
        { listingId: MUFFIN, optionIds: ['mod-walnuts'] },
        { listingId: SOURDOUGH, optionIds: ['mod-sliced'] },
        { listingId: SOURDOUGH, optionIds: ['mod-seeds'] },
        { listingId: globalId('Listing', 'listing-draft-001'), optionIds: [] },
        { listingId: SOURDOUGH, optionIds: ['mod-ghost'] },
      ],
    })
  ).data.cartCheck;

  expect(cart.map((l: { found: boolean }) => l.found)).toEqual([true, true, true, true, false, true]);
  expect(shape(cart[0].conflicts)).toEqual([]); // walnuts not chosen
  expect(shape(cart[1].conflicts)).toEqual(['tree-nut:ALLERGY:OPTION:[mod-walnuts]']);
  expect(shape(cart[2].conflicts)).toEqual([]);
  expect(shape(cart[3].conflicts)).toEqual(['sesame:ALLERGY:OPTION:[mod-seeds]']);
  expect(cart[5].unknownOptionIds).toEqual(['mod-ghost']);

  await gql(request, token, SAVE, { input: { allergies: [], avoid: [] } });
});

test('a vendor’s token is refused the personalized views, no token gets nothing, and the public list still works without one', async ({
  request,
}) => {
  const vendor = await userToken('vendor-shop-001');

  const asVendor = await gql(request, vendor, LIST);
  const cartAsVendor = await gql(request, vendor, CART, { lines: [] });
  const anonymous = await gql(request, null, LIST);
  const publicList = await gql(request, null, PUBLIC_LIST);

  expect(asVendor.errors[0].extensions.code).toBe('FORBIDDEN');
  expect(cartAsVendor.errors[0].extensions.code).toBe('FORBIDDEN');
  expect(anonymous.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  expect(publicList.errors).toBeUndefined();
  expect(publicList.data.listings.edges.length).toBeGreaterThan(0);
});
