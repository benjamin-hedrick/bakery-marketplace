import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toGlobalId } from '../src/global-id.ts';
import { createServer } from '../src/server.ts';

// WI-TAG-002: the tags of a listing and of its options, mapped as the catalog sent them (ADR-0022, ADR-0013). The BFF decides nothing about which tags show: the
// catalog sends only the ones that are public and inside their window today, and the BFF adds nothing, drops nothing and keeps no tag the catalog did not send.

const withTags = {
  id: 'listing-1',
  vendorId: 'vendor-1',
  name: 'Loaf',
  description: null,
  category: 'bread',
  priceCents: 800,
  currency: 'USD',
  allergenFlags: ['gluten'],
  stock: { status: 'inStock', maxPerOrder: null },
  tags: [
    { id: 'vegan', kind: 'diet', label: 'Vegan', sortOrder: 100 },
    { id: 'thanksgiving', kind: 'occasion', label: 'Thanksgiving', sortOrder: 200 },
  ],
  modifiers: [
    {
      id: 'mod-seeds',
      name: 'Seed crust',
      priceDeltaCents: 100,
      allergens: ['sesame'],
      tags: [{ id: 'vegan', kind: 'diet', label: 'Vegan', sortOrder: 100 }],
    },
    { id: 'mod-sliced', name: 'Sliced', priceDeltaCents: 0, allergens: [] },
  ],
};
// A listing from a catalog that does not know tags yet: no field at all.
const withoutTags = { ...withTags, id: 'listing-2', tags: undefined, modifiers: [{ ...withTags.modifiers[1]! }] };

const reply = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const catalog = http.createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  if (path === '/catalog/listings/listing-1') return reply(res, 200, withTags);
  if (path === '/catalog/listings/listing-2') return reply(res, 200, withoutTags);
  if (path === '/catalog/listings') return reply(res, 200, { items: [withTags, withoutTags], nextCursor: null });
  return reply(res, 404, {});
});
const ordering = http.createServer((_req, res) => reply(res, 404, {}));
let bff: http.Server;
let bffUrl: string;

before(async () => {
  await new Promise<void>((r) => catalog.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => ordering.listen(0, '127.0.0.1', r));
  const port = (s: http.Server) => (s.address() as AddressInfo).port;
  bff = createServer(
    {
      port: 0,
      catalogUrl: `http://127.0.0.1:${port(catalog)}`,
      orderingUrl: `http://127.0.0.1:${port(ordering)}`,
      timeoutMs: 3000,
      checkoutTimeoutMs: 3000,
      testHooks: false,
    },
    { log: { info: () => {}, error: () => {} }, exporter: () => {} },
  );
  await new Promise<void>((r) => bff.listen(0, '127.0.0.1', r));
  bffUrl = `http://127.0.0.1:${port(bff)}/graphql`;
});
after(() => {
  bff.close();
  catalog.close();
  ordering.close();
});

/* eslint-disable @typescript-eslint/no-explicit-any */
async function gql(query: string): Promise<{ data?: any; errors?: any[] }> {
  const res = await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return res.json();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const TAGS = 'tags { id kind label }';

describe('Listing.tags and Modifier.tags', () => {
  test('a listing and its options carry the tags the catalog sent, with the kind as an enum and the label', async () => {
    const body = await gql(
      `{ listing(id: "${toGlobalId('Listing', 'listing-1')}") { ${TAGS} modifiers { id ${TAGS} } } }`,
    );

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.listing.tags, [
      { id: 'vegan', kind: 'DIET', label: 'Vegan' },
      { id: 'thanksgiving', kind: 'OCCASION', label: 'Thanksgiving' },
    ]);
    assert.deepEqual(body.data.listing.modifiers[0].tags, [{ id: 'vegan', kind: 'DIET', label: 'Vegan' }]);
  });

  test('a listing or an option without tags has an empty list, never null and never an error', async () => {
    const body = await gql(
      `{ listing(id: "${toGlobalId('Listing', 'listing-2')}") { ${TAGS} modifiers { ${TAGS} } } }`,
    );

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.listing.tags, []);
    assert.deepEqual(body.data.listing.modifiers[0].tags, []);
  });

  test('the browse list carries them too', async () => {
    const body = await gql(`{ listings(first: 10) { edges { node { id ${TAGS} } } } }`);

    assert.deepEqual(
      body.data.listings.edges.map((e: { node: { tags: { id: string }[] } }) => e.node.tags.map((t) => t.id)),
      [['vegan', 'thanksgiving'], []],
    );
  });

  test('tags are not allergens: the allergen flags stay their own field', async () => {
    const body = await gql(`{ listing(id: "${toGlobalId('Listing', 'listing-1')}") { allergenFlags ${TAGS} } }`);

    assert.deepEqual(body.data.listing.allergenFlags, ['gluten']);
    assert.ok(!body.data.listing.tags.some((t: { kind: string }) => t.kind === 'ALLERGEN'));
  });
});
