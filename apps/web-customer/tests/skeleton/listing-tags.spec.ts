import { expect, test } from '@playwright/test';
import { globalId } from './support';

// WI-TAG-002 on the real stack: the seeded listings carry diet, season and theme tags through the real catalog and the GraphQL BFF to the browser, and the
// seed's hidden platform tag (test-hidden, on the croissant) is never in any public response. Only tags with no date window are asserted by name, so the run
// does not depend on the day it is made (the seed's thanksgiving and autumn tags have windows, which the catalog's own tests check at both edges).
// Needs the whole local stack (docs/operations/local-dev.md); node scripts/ci/skeleton-smoke.mjs starts it.

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
const QUERY = `{ listings(first: 50) { edges { node { id name tags { id kind label } modifiers { id tags { id } } } } } }`;

async function listings(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post(`${BFF}/graphql`, { data: { query: QUERY } });
  const body = await res.json();
  expect(body.errors, JSON.stringify(body)).toBeUndefined();
  return body.data.listings.edges.map((e: { node: unknown }) => e.node) as {
    id: string;
    name: string;
    tags: { id: string; kind: string; label: string }[];
    modifiers: { id: string; tags: { id: string }[] }[];
  }[];
}

test('the seeded listings carry their tags through the catalog and the BFF, with the kind and the label', async ({
  request,
}) => {
  const all = await listings(request);
  const byId = new Map(all.map((l) => [l.id, l]));

  const sourdough = byId.get(globalId('Listing', 'listing-sourdough-001'))!;
  expect(sourdough.tags).toEqual(
    expect.arrayContaining([
      { id: 'vegan', kind: 'DIET', label: 'Vegan' },
      { id: 'local-favourite', kind: 'THEME', label: 'Local favourite' },
    ]),
  );
  const croissant = byId.get(globalId('Listing', 'listing-croissant-001'))!;
  expect(croissant.tags.map((t) => t.id)).toContain('vegetarian');
  const cookies = byId.get(globalId('Listing', 'listing-cookies-001'))!;
  expect(cookies.tags.map((t) => t.id)).toEqual(['birthday']);
});

test('the hidden platform tag is in no public response: not on the listing, not in the registry, not in the BFF', async ({
  request,
}) => {
  const text = JSON.stringify(await listings(request));
  expect(text).not.toContain('test-hidden');

  const registry = await request.post(`${BFF}/graphql`, { data: { query: '{ tags { id } }' } });
  expect(JSON.stringify(await registry.json())).not.toContain('test-hidden');
});

test('allergens are not tags: no allergen id is among a listing’s tags', async ({ request }) => {
  const allergens = new Set(['dairy', 'egg', 'fish', 'shellfish', 'tree-nut', 'peanut', 'gluten', 'soy', 'sesame']);
  for (const l of await listings(request)) {
    for (const t of [...l.tags, ...l.modifiers.flatMap((m) => m.tags)])
      expect(allergens.has(t.id), `${l.name}: ${t.id}`).toBe(false);
  }
});

test('the browser shows the chips on the server-rendered browse page', async ({ page }) => {
  await page.goto('/');

  const sourdough = page.getByTestId('listing').filter({ hasText: 'Country Sourdough' });
  await expect(sourdough.getByTestId('tag').filter({ hasText: 'Vegan' })).toHaveCount(1);
  await expect(sourdough.getByTestId('tag').filter({ hasText: 'Local favourite' })).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText('Hidden test tag');
});
