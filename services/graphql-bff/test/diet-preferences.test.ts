import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toGlobalId } from '../src/global-id.ts';
import { createServer, type Logger } from '../src/server.ts';

// WI-TAG-004: the diets a customer prefers, and how a listing stands against them. The rule (an item is marked for a diet only if it and every chosen option
// carry the tag) is the catalog's; the BFF passes the preference through and maps the answer, and logs none of it (NFR 3.7).

const TOKEN = 'header.payload.signature';
const listing = {
  id: 'listing-1',
  vendorId: 'vendor-1',
  name: 'Loaf',
  description: null,
  category: 'bread',
  priceCents: 800,
  currency: 'USD',
  allergenFlags: [],
  stock: { status: 'inStock', maxPerOrder: null },
  modifiers: [],
};
const match = { tagId: 'vegan', marked: true, itemMarked: true, optionIdsNotMarked: ['honey'] };

const seen: { method: string; url: string; body: string }[] = [];
let stored: { allergies: string[]; avoid: string[]; prefer?: string[] } = {
  allergies: [],
  avoid: [],
  prefer: ['vegan'],
};
let withMatches = true;

const reply = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const catalog = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = Buffer.concat(chunks).toString('utf8');
  seen.push({ method: req.method ?? '', url: req.url ?? '', body });
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  if (path === '/catalog/preferences' && req.method === 'PUT') {
    const sent = JSON.parse(body) as typeof stored;
    stored = { ...sent, prefer: sent.prefer ?? stored.prefer };
  }
  if (path === '/catalog/preferences') return reply(res, 200, { ...stored, updatedAt: null });
  if (path === '/catalog/listings/for-me/listing-1')
    return reply(res, 200, { listing, conflicts: [], ...(withMatches ? { dietMatches: [match] } : {}) });
  if (path === '/catalog/preferences/check') {
    // One answer per line sent, as the real catalog gives (an empty cart is an empty list).
    const sent = (JSON.parse(body) as { lines: unknown[] }).lines;
    return reply(res, 200, {
      lines: sent.map(() => ({
        listingId: 'listing-1',
        found: true,
        unknownOptionIds: [],
        conflicts: [],
        ...(withMatches ? { dietMatches: [{ ...match, marked: false }] } : {}),
      })),
    });
  }
  return reply(res, 404, {});
});
const ordering = http.createServer((_req, res) => reply(res, 404, {}));

const logs: Record<string, unknown>[] = [];
const log: Logger = { info: (e) => logs.push(e), error: (e) => logs.push(e) };
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
    },
    { log, exporter: () => {} },
  );
  await new Promise<void>((r) => bff.listen(0, '127.0.0.1', r));
  bffUrl = `http://127.0.0.1:${port(bff)}/graphql`;
});
after(() => {
  bff.close();
  catalog.close();
  ordering.close();
});
beforeEach(() => {
  seen.length = 0;
  logs.length = 0;
  stored = { allergies: [], avoid: [], prefer: ['vegan'] };
  withMatches = true;
});

/* eslint-disable @typescript-eslint/no-explicit-any */
async function gql(query: string, variables?: object): Promise<{ data?: any; errors?: any[] }> {
  const res = await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const SAVE = `mutation($input: SavePreferencesInput!) { savePreferences(input: $input) { __typename
  ... on SavePreferencesSuccess { preferences { allergies avoid prefer } } } }`;
const gid = toGlobalId('Listing', 'listing-1');

describe('the preferred diets in the profile', () => {
  test('they are read with the profile, and an older catalog without them reads as none', async () => {
    assert.deepEqual((await gql('{ preferences { prefer } }')).data.preferences.prefer, ['vegan']);

    stored = { allergies: [], avoid: [] };
    assert.deepEqual((await gql('{ preferences { prefer } }')).data.preferences.prefer, []);
  });

  test('a save sends them to the catalog, and the saved list comes back', async () => {
    const body = await gql(SAVE, { input: { allergies: [], avoid: [], prefer: ['vegetarian'] } });

    assert.equal(body.data.savePreferences.__typename, 'SavePreferencesSuccess');
    assert.deepEqual(JSON.parse(seen.find((s) => s.method === 'PUT')!.body).prefer, ['vegetarian']);
    assert.deepEqual(body.data.savePreferences.preferences.prefer, ['vegetarian']);
  });

  test('a save without them sends no prefer at all, so the catalog keeps the stored list', async () => {
    const body = await gql(SAVE, { input: { allergies: ['dairy'], avoid: [] } });

    assert.equal('prefer' in JSON.parse(seen.find((s) => s.method === 'PUT')!.body), false);
    assert.deepEqual(body.data.savePreferences.preferences.prefer, ['vegan']); // what the catalog kept
  });

  test('an empty list is sent as an empty list (it clears them)', async () => {
    await gql(SAVE, { input: { allergies: [], avoid: [], prefer: [] } });

    assert.deepEqual(JSON.parse(seen.find((s) => s.method === 'PUT')!.body).prefer, []);
  });

  test('nothing of the profile is logged', async () => {
    await gql(SAVE, { input: { allergies: [], avoid: [], prefer: ['vegan'] } });
    await gql('{ preferences { prefer } }');

    assert.ok(logs.length > 0);
    assert.doesNotMatch(JSON.stringify(logs), /vegan/);
  });
});

describe('how listings stand against them', () => {
  const FIELDS = 'dietMatches { tagId marked itemMarked optionIdsNotMarked }';

  test('the personalized listing carries the catalog’s matches as sent', async () => {
    const body = await gql(`{ personalizedListing(id: "${gid}") { ${FIELDS} } }`);

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.personalizedListing.dietMatches, [match]);
  });

  test('the cart check carries a match per line, computed by the catalog for the options chosen', async () => {
    const body = await gql(`query($lines: [CartLineInput!]!) { cartCheck(lines: $lines) { listingId ${FIELDS} } }`, {
      lines: [{ listingId: gid, optionIds: ['honey'] }],
    });

    assert.deepEqual(body.data.cartCheck[0].dietMatches, [{ ...match, marked: false }]);
  });

  test('a listing id that does not decode is found: false with no matches, and nothing is sent about it', async () => {
    const body = await gql(`query($lines: [CartLineInput!]!) { cartCheck(lines: $lines) { found ${FIELDS} } }`, {
      lines: [{ listingId: 'not-a-global-id', optionIds: [] }],
    });

    assert.deepEqual(body.data.cartCheck[0], { found: false, dietMatches: [] });
  });

  test('a catalog that does not know diets yet gives empty matches, not an error', async () => {
    withMatches = false;

    const body = await gql(`{ personalizedListing(id: "${gid}") { ${FIELDS} } }`);

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.personalizedListing.dietMatches, []);
  });
});
