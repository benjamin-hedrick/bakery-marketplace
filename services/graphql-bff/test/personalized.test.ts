import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toGlobalId } from '../src/global-id.ts';
import { createServer, type Logger } from '../src/server.ts';

// WI-SRCH-001: the personalized listings and the cart check through the BFF. The rule is the catalog's; the BFF forwards the caller's token,
// decodes listing ids, keeps the order and maps the answer (ADR-0013). The profile and its conflicts are never logged or exported.

const TOKEN = 'header.payload.signature';

const listing = (id: string, name: string) => ({
  id,
  vendorId: 'vendor-shop-001',
  name,
  description: null,
  category: 'pastry',
  priceCents: 450,
  currency: 'USD',
  modifiers: [{ id: 'mod-almonds', name: 'Extra almonds', priceDeltaCents: 75, allergens: ['tree-nut'] }],
  allergenFlags: ['gluten', 'tree-nut'],
  sponsored: false,
  status: 'Published',
  stock: { status: 'inStock', maxPerOrder: 4 },
  createdAt: '2026-11-01T00:00:00+00:00',
  updatedAt: '2026-11-01T00:00:00+00:00',
});
const conflicts = [
  { allergenId: 'tree-nut', severity: 'allergy', source: 'item', optionIds: [] },
  { allergenId: 'tree-nut', severity: 'allergy', source: 'option', optionIds: ['mod-almonds'] },
  { allergenId: 'dairy', severity: 'avoid', source: 'item', optionIds: [] },
];

interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
  body: string;
}
const seen: Seen[] = [];
let mode: 'ok' | 'missing' | 'unauthorized' | 'forbidden' | 'error' | 'badseverity' | 'shortcheck' = 'ok';

const reply = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const catalog = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = Buffer.concat(chunks).toString('utf8');
  seen.push({ method: req.method ?? '', url: req.url ?? '', authorization: req.headers.authorization, body });
  const url = new URL(req.url ?? '/', 'http://x');
  if (mode === 'unauthorized') return reply(res, 401, {});
  if (mode === 'forbidden') return reply(res, 403, {});
  if (mode === 'error') return reply(res, 500, { message: 'secret detail at http://cosmos.internal' });
  const used = mode === 'badseverity' ? [{ ...conflicts[0]!, severity: 'catastrophic' }] : conflicts;
  if (url.pathname === '/catalog/listings/for-me') {
    return reply(res, 200, {
      items: [{ listing: listing('listing-b-croissant', 'Almond Croissant'), conflicts: used }],
      nextCursor: 'listing-b-croissant',
    });
  }
  if (url.pathname === '/catalog/listings/for-me/listing-b-croissant') {
    return mode === 'missing'
      ? reply(res, 404, { code: 'not_found' })
      : reply(res, 200, { listing: listing('listing-b-croissant', 'Almond Croissant'), conflicts: used });
  }
  if (url.pathname === '/catalog/preferences/check') {
    const sent = (JSON.parse(body) as { lines: { listingId: string; optionIds: string[] }[] }).lines;
    const answered = sent.map((l) =>
      l.listingId === 'listing-nope'
        ? { listingId: l.listingId, found: false, unknownOptionIds: [], conflicts: [] }
        : { listingId: l.listingId, found: true, unknownOptionIds: [], conflicts: l.optionIds.length ? used : [] },
    );
    return reply(res, 200, { lines: mode === 'shortcheck' ? answered.slice(1) : answered });
  }
  return reply(res, 404, {});
});
const ordering = http.createServer((_req, res) => reply(res, 404, {}));

const logs: Record<string, unknown>[] = [];
const spans: unknown[] = [];
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
      timeoutMs: 300,
      checkoutTimeoutMs: 300,
      testHooks: false,
    },
    { log, exporter: (s) => spans.push(s) },
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
  spans.length = 0;
  mode = 'ok';
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type GqlBody = { data?: any; errors: any[] }; // `errors` is absent on success; tests assert that explicitly
/* eslint-enable @typescript-eslint/no-explicit-any */

async function gql(query: string, variables?: object, headers: Record<string, string> = {}) {
  const res = await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  return { res, body: (await res.json()) as GqlBody };
}
const auth = { authorization: `Bearer ${TOKEN}` };
const gid = toGlobalId('Listing', 'listing-b-croissant');

const CONFLICT = 'allergenId severity source optionIds';
const LIST = `query($first: Int, $after: String, $hide: Boolean) {
  personalizedListings(first: $first, after: $after, hideConflicts: $hide) {
    edges { cursor node { listing { id name allergenFlags modifiers { id allergens } } conflicts { ${CONFLICT} } } }
    pageInfo { hasNextPage endCursor } } }`;
const ONE = `query($id: ID!) { personalizedListing(id: $id) { listing { id name } conflicts { ${CONFLICT} } } }`;
const CART = `query($lines: [CartLineInput!]!) { cartCheck(lines: $lines) { listingId found unknownOptionIds conflicts { ${CONFLICT} } } }`;

describe('Query.personalizedListings', () => {
  test('maps each listing with its conflicts in the schema’s words, forwarding the caller’s token', async () => {
    const { body, res } = await gql(LIST, {}, auth);

    assert.equal(body.errors, undefined);
    const node = body.data.personalizedListings.edges[0].node;
    assert.equal(node.listing.id, gid);
    assert.equal(node.listing.name, 'Almond Croissant');
    assert.deepEqual(node.listing.allergenFlags, ['gluten', 'tree-nut']);
    assert.deepEqual(node.conflicts, [
      { allergenId: 'tree-nut', severity: 'ALLERGY', source: 'ITEM', optionIds: [] },
      { allergenId: 'tree-nut', severity: 'ALLERGY', source: 'OPTION', optionIds: ['mod-almonds'] },
      { allergenId: 'dairy', severity: 'AVOID', source: 'ITEM', optionIds: [] },
    ]);
    assert.deepEqual(body.data.personalizedListings.pageInfo, { hasNextPage: true, endCursor: 'listing-b-croissant' });
    assert.equal(seen[0]!.authorization, `Bearer ${TOKEN}`);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
  });

  test('sends the page size, cursor and hide choice to the catalog, and clamps a large page', async () => {
    await gql(LIST, { first: 5, after: 'listing-a', hide: true }, auth);
    await gql(LIST, {}, auth);
    await gql(LIST, { first: 5000 }, auth);

    assert.equal(seen[0]!.url, '/catalog/listings/for-me?limit=5&after=listing-a&hideConflicts=true');
    assert.equal(seen[1]!.url, '/catalog/listings/for-me?limit=20');
    assert.equal(seen[2]!.url, '/catalog/listings/for-me?limit=50');
  });

  test('needs a token: without one nothing is asked of the catalog', async () => {
    const { body } = await gql(LIST);

    assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });

  test('a token the catalog refuses is UNAUTHENTICATED and a vendor’s is FORBIDDEN', async () => {
    mode = 'unauthorized';
    const refused = await gql(LIST, {}, auth);
    mode = 'forbidden';
    const wrongRole = await gql(LIST, {}, auth);

    assert.equal(refused.body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(wrongRole.body.errors[0].extensions.code, 'FORBIDDEN');
  });

  test('a service failure is an internal error that leaks nothing, and an unknown severity is never guessed', async () => {
    mode = 'error';
    const failed = await gql(LIST, {}, auth);
    mode = 'badseverity';
    const guessed = await gql(LIST, {}, auth);

    assert.equal(failed.body.errors[0].extensions.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(failed.body), /cosmos|secret/);
    assert.equal(guessed.body.errors[0].extensions.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(guessed.body), /catastrophic/);
  });
});

describe('Query.personalizedListing', () => {
  test('returns one listing with its conflicts, asking the catalog by the decoded id', async () => {
    const { body } = await gql(ONE, { id: gid }, auth);

    assert.equal(body.errors, undefined);
    assert.equal(body.data.personalizedListing.listing.id, gid);
    assert.equal(body.data.personalizedListing.conflicts.length, 3);
    assert.equal(seen[0]!.url, '/catalog/listings/for-me/listing-b-croissant');
  });

  test('a listing that is not there, and an id that does not decode, are null; the second asks nothing', async () => {
    mode = 'missing';
    const missing = await gql(ONE, { id: gid }, auth);
    seen.length = 0;
    const garbage = await gql(ONE, { id: 'not-a-global-id' }, auth);

    assert.equal(missing.body.data.personalizedListing, null);
    assert.equal(garbage.body.data.personalizedListing, null);
    assert.equal(seen.length, 0);
  });

  test('needs a token', async () => {
    const { body } = await gql(ONE, { id: gid });

    assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });
});

describe('Query.cartCheck', () => {
  const other = toGlobalId('Listing', 'listing-nope');

  test('sends the decoded listing ids and chosen options in order, and maps the answer line by line', async () => {
    const { body } = await gql(
      CART,
      {
        lines: [
          { listingId: gid, optionIds: ['mod-almonds'] },
          { listingId: gid, optionIds: [] },
          { listingId: other, optionIds: [] },
        ],
      },
      auth,
    );

    assert.equal(body.errors, undefined);
    assert.equal(seen[0]!.method, 'POST');
    assert.equal(seen[0]!.url, '/catalog/preferences/check');
    assert.deepEqual(JSON.parse(seen[0]!.body), {
      lines: [
        { listingId: 'listing-b-croissant', optionIds: ['mod-almonds'] },
        { listingId: 'listing-b-croissant', optionIds: [] },
        { listingId: 'listing-nope', optionIds: [] },
      ],
    });
    const lines = body.data.cartCheck;
    assert.deepEqual(
      lines.map((l: { listingId: string; found: boolean }) => [l.listingId, l.found]),
      [
        [gid, true],
        [gid, true],
        [other, false],
      ],
    );
    assert.equal(lines[0].conflicts.length, 3);
    assert.deepEqual(lines[1].conflicts, []);
  });

  test('a listing id that does not decode is a line that was not found, and is not sent', async () => {
    const { body } = await gql(
      CART,
      {
        lines: [
          { listingId: 'garbage', optionIds: [] },
          { listingId: gid, optionIds: ['mod-almonds'] },
        ],
      },
      auth,
    );

    assert.deepEqual(JSON.parse(seen[0]!.body).lines, [
      { listingId: 'listing-b-croissant', optionIds: ['mod-almonds'] },
    ]);
    assert.deepEqual(
      body.data.cartCheck.map((l: { found: boolean }) => l.found),
      [false, true],
    );
    assert.equal(body.data.cartCheck[0].listingId, 'garbage');
  });

  test('when no line decodes the catalog is still asked, with no lines, so the role is checked as for any other call', async () => {
    const { body } = await gql(CART, { lines: [{ listingId: 'garbage', optionIds: [] }] }, auth);
    mode = 'forbidden';
    const wrongRole = await gql(CART, { lines: [{ listingId: 'garbage', optionIds: [] }] }, auth);

    assert.deepEqual(JSON.parse(seen[0]!.body), { lines: [] });
    assert.equal(body.data.cartCheck[0].found, false);
    assert.equal(wrongRole.body.errors[0].extensions.code, 'FORBIDDEN');
  });

  test('an empty cart is an empty answer, and a wrong role is refused even then', async () => {
    const { body } = await gql(CART, { lines: [] }, auth);
    mode = 'forbidden';
    const wrongRole = await gql(CART, { lines: [] }, auth);

    assert.deepEqual(body.data.cartCheck, []);
    assert.equal(wrongRole.body.errors[0].extensions.code, 'FORBIDDEN');
  });

  test('a cart larger than the limits is refused as bad input before anything is sent', async () => {
    const tooMany = await gql(
      CART,
      { lines: Array.from({ length: 51 }, () => ({ listingId: gid, optionIds: [] })) },
      auth,
    );
    const tooManyOptions = await gql(
      CART,
      { lines: [{ listingId: gid, optionIds: Array.from({ length: 21 }, (_, i) => `o${i}`) }] },
      auth,
    );

    assert.equal(tooMany.body.errors[0].extensions.code, 'BAD_INPUT');
    assert.equal(tooManyOptions.body.errors[0].extensions.code, 'BAD_INPUT');
    assert.equal(seen.length, 0);
  });

  test('an answer with a different number of lines than were sent is an internal error, not a guess', async () => {
    mode = 'shortcheck';

    const { body } = await gql(
      CART,
      {
        lines: [
          { listingId: gid, optionIds: [] },
          { listingId: gid, optionIds: [] },
        ],
      },
      auth,
    );

    assert.equal(body.errors[0].extensions.code, 'INTERNAL');
  });

  test('needs a token, and maps a refused token and a wrong role', async () => {
    const anonymous = await gql(CART, { lines: [{ listingId: gid, optionIds: [] }] });
    mode = 'unauthorized';
    const refused = await gql(CART, { lines: [{ listingId: gid, optionIds: [] }] }, auth);
    mode = 'forbidden';
    const wrongRole = await gql(CART, { lines: [{ listingId: gid, optionIds: [] }] }, auth);

    assert.equal(anonymous.body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(refused.body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(wrongRole.body.errors[0].extensions.code, 'FORBIDDEN');
  });
});

describe('the conflicts are not recorded', () => {
  test('no allergen id, severity or option reaches a log line or an exported span', async () => {
    await gql(LIST, { hide: true }, auth);
    await gql(ONE, { id: gid }, auth);
    await gql(CART, { lines: [{ listingId: gid, optionIds: ['mod-almonds'] }] }, auth);
    mode = 'error';
    await gql(CART, { lines: [{ listingId: gid, optionIds: ['mod-almonds'] }] }, auth);

    const recorded = JSON.stringify({ logs, spans });
    assert.ok(logs.length > 0 && spans.length > 0);
    for (const secret of ['tree-nut', 'dairy', 'mod-almonds', 'allergy', 'conflicts']) {
      assert.doesNotMatch(recorded, new RegExp(secret, 'i'), `${secret} was recorded`);
    }
  });
});
