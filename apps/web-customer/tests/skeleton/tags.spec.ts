import { expect, test } from '@playwright/test';

// WI-TAG-001 on the real stack: the catalog's tag registry through the GraphQL BFF, with no login (it is public).
// Needs the whole local stack (docs/operations/local-dev.md); node scripts/ci/skeleton-smoke.mjs starts it.

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';

test('the allergen list reaches the BFF from the real catalog, in order, with no login', async ({ request }) => {
  const res = await request.post(`${BFF}/graphql`, {
    data: { query: '{ tags(kind: ALLERGEN) { id kind label } }' },
  });
  const body = await res.json();

  expect(body.errors).toBeUndefined();
  expect(body.data.tags.map((t: { id: string }) => t.id)).toEqual([
    'dairy',
    'egg',
    'fish',
    'shellfish',
    'tree-nut',
    'peanut',
    'gluten',
    'soy',
    'sesame',
  ]);
  expect(body.data.tags[0]).toEqual({ id: 'dairy', kind: 'ALLERGEN', label: 'Milk (dairy)' });
});

test('the seeded listings still show their allergen flags, which are all registry ids', async ({ request }) => {
  const registry = (
    await (await request.post(`${BFF}/graphql`, { data: { query: '{ tags(kind: ALLERGEN) { id } }' } })).json()
  ).data.tags.map((t: { id: string }) => t.id);
  const listings = (
    await (
      await request.post(`${BFF}/graphql`, {
        data: { query: '{ listings(first: 50) { edges { node { name allergenFlags modifiers { allergens } } } } }' },
      })
    ).json()
  ).data.listings.edges.map((e: { node: { allergenFlags: string[]; modifiers: { allergens: string[] }[] } }) => e.node);

  expect(listings.length).toBeGreaterThan(0);
  for (const l of listings) {
    for (const f of [...l.allergenFlags, ...l.modifiers.flatMap((m: { allergens: string[] }) => m.allergens)]) {
      expect(registry).toContain(f);
    }
  }
});
