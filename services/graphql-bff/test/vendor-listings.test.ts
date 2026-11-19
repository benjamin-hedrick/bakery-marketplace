import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildSchema, introspectionFromSchema } from 'graphql';
import { readFileSync } from 'node:fs';
import { toGlobalId } from '../src/global-id.ts';
import { createServer, type Logger } from '../src/server.ts';

// WI-CAT-007: the vendor's own listings and their writes. The BFF forwards the token, the If-Match and the Idempotency-Key, decodes and encodes
// global ids and maps the catalog's answers; the catalog decides every rule. These tests check the mapping and the forwarding, that the owner's
// fields never reach the public type, and that nothing of the catalog's own wording or detail reaches the client except an INVALID's field sentences.

const TOKEN = 'header.payload.signature';
const LISTING_ID = 'listing-0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d';
const gid = toGlobalId('Listing', LISTING_ID);

interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
  ifMatch: string | undefined;
  idempotencyKey: string | undefined;
  body: unknown;
}
const seen: Seen[] = [];

/** What the fake catalog answers next: a status and a body, or 'slow' (never answers) or 'not-json'. */
let next: { status: number; body?: unknown } | 'slow' | 'not-json' = { status: 200 };

const ownListing = (over: Record<string, unknown> = {}) => ({
  id: LISTING_ID,
  vendorId: 'vendor-1',
  name: 'Country Sourdough',
  description: null,
  category: 'Bread',
  priceCents: 800,
  currency: 'USD',
  modifiers: [{ id: 'mod-seeds', name: 'Seed crust', priceDeltaCents: 100, allergens: ['sesame'], tags: [] }],
  allergenFlags: ['gluten'],
  sponsored: false,
  status: 'Published',
  stock: { status: 'low', maxPerOrder: 4, availableQuantity: 3, lowStockThreshold: 5 },
  createdAt: '2026-11-18T10:00:00+00:00',
  updatedAt: '2026-11-18T11:00:00+00:00',
  tags: [{ id: 'vegan', kind: 'diet', label: 'Vegan', sortOrder: 1 }],
  editVersion: 3,
  ...over,
});

const reply = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const catalog = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c: Buffer) => (raw += c.toString('utf8')));
  req.on('end', () => {
    seen.push({
      method: req.method ?? '',
      url: req.url ?? '',
      authorization: req.headers.authorization,
      ifMatch: req.headers['if-match'] as string | undefined,
      idempotencyKey: req.headers['idempotency-key'] as string | undefined,
      body: raw ? JSON.parse(raw) : undefined,
    });
    if (next === 'slow') return; // never answers: the BFF's timeout must end the wait
    if (next === 'not-json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('<html>oops</html>');
    }
    reply(res, next.status, next.body ?? ownListing());
  });
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
      timeoutMs: 300,
      checkoutTimeoutMs: 300,
    },
    { log, exporter: () => {} },
  );
  await new Promise<void>((r) => bff.listen(0, '127.0.0.1', r));
  bffUrl = `http://127.0.0.1:${port(bff)}/graphql`;
});
after(() => {
  bff.closeAllConnections();
  bff.close();
  catalog.closeAllConnections();
  catalog.close();
  ordering.close();
});
beforeEach(() => {
  seen.length = 0;
  logs.length = 0;
  next = { status: 200 };
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type GqlBody = { data?: any; errors?: any[] };
/* eslint-enable @typescript-eslint/no-explicit-any */

async function gql(query: string, variables?: object, headers: Record<string, string> = auth) {
  const res = await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  return { res, body: (await res.json()) as GqlBody };
}
const auth = { authorization: `Bearer ${TOKEN}` };

const FIELDS = `id name description category price { cents currency } status allergenFlags editVersion createdAt updatedAt
  modifiers { id name priceDelta { cents } allergens } tags { id kind label }
  stock { status maxPerOrder availableQuantity lowStockThreshold }`;
const PAYLOAD = `__typename
  ... on ListingWriteSuccess { listing { ${FIELDS} } }
  ... on ListingRejected { code message fields { field message } currentEditVersion }`;

const CREATE = `mutation($input: ListingInput!, $key: String!) { createListing(input: $input, idempotencyKey: $key) { ${PAYLOAD} } }`;
const UPDATE = `mutation($id: ID!, $input: ListingInput!, $v: Int!) { updateListing(id: $id, input: $input, expectedEditVersion: $v) { ${PAYLOAD} } }`;
const ADJUST = `mutation($id: ID!, $delta: Int!) { adjustListingStock(id: $id, delta: $delta) { ${PAYLOAD} } }`;

const input = (over: Record<string, unknown> = {}) => ({
  name: 'Country Sourdough',
  category: 'Bread',
  priceCents: 800,
  modifiers: [{ id: 'mod-seeds', name: 'Seed crust', priceDeltaCents: 100, allergens: ['sesame'] }],
  allergenFlags: ['gluten'],
  ...over,
});

type Headers = Record<string, string>;
const create = (over: Record<string, unknown> = {}, key = 'key-1', headers: Headers = auth) =>
  gql(CREATE, { input: input(over), key }, headers);
const update = (over: Record<string, unknown> = {}, v = 3, id = gid, headers: Headers = auth) =>
  gql(UPDATE, { id, input: input(over), v }, headers);
const adjust = (delta: number, id = gid, headers: Headers = auth) => gql(ADJUST, { id, delta }, headers);

const expectedListing = {
  id: gid,
  name: 'Country Sourdough',
  description: null,
  category: 'Bread',
  price: { cents: 800, currency: 'USD' },
  status: 'PUBLISHED',
  allergenFlags: ['gluten'],
  editVersion: 3,
  createdAt: '2026-11-18T10:00:00+00:00',
  updatedAt: '2026-11-18T11:00:00+00:00',
  modifiers: [{ id: 'mod-seeds', name: 'Seed crust', priceDelta: { cents: 100 }, allergens: ['sesame'] }],
  tags: [{ id: 'vegan', kind: 'DIET', label: 'Vegan' }],
  stock: { status: 'LOW', maxPerOrder: 4, availableQuantity: 3, lowStockThreshold: 5 },
};

// ---- reads --------------------------------------------------------------------------------------------------------------------

describe('Query.myListings and Query.myListing', () => {
  const LIST = `query($status: MyListingFilter, $first: Int, $after: String) {
    myListings(status: $status, first: $first, after: $after) { edges { cursor node { ${FIELDS} } } pageInfo { hasNextPage endCursor } } }`;
  const ONE = `query($id: ID!) { myListing(id: $id) { ${FIELDS} } }`;

  test('lists the caller’s own listings with the owner’s fields, forwarding the token, the status and the paging', async () => {
    next = { status: 200, body: { items: [ownListing()], nextCursor: LISTING_ID } };
    const { res, body } = await gql(LIST, { status: 'DRAFT', first: 5, after: 'listing-a' });

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.myListings.edges[0].node, expectedListing);
    assert.deepEqual(body.data.myListings.pageInfo, { hasNextPage: true, endCursor: LISTING_ID });
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.url, '/catalog/listings/mine?limit=5&status=Draft&after=listing-a');
    assert.equal(seen[0]!.authorization, `Bearer ${TOKEN}`);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
  });

  test('a made-to-order listing has no count, and an unset threshold is null', async () => {
    next = { status: 200, body: ownListing({ stock: { status: 'inStock', maxPerOrder: null } }) };
    const { body } = await gql(ONE, { id: gid });
    assert.deepEqual(body.data.myListing.stock, {
      status: 'IN_STOCK',
      maxPerOrder: null,
      availableQuantity: null,
      lowStockThreshold: null,
    });
  });

  test('one listing by its global id; a missing or another vendor’s listing (404) is null', async () => {
    const { body } = await gql(ONE, { id: gid });
    assert.deepEqual(body.data.myListing, expectedListing);
    assert.equal(seen[0]!.url, `/catalog/listings/mine/${LISTING_ID}`);

    next = { status: 404, body: { code: 'not_found' } };
    assert.equal((await gql(ONE, { id: gid })).body.data.myListing, null);
  });

  test('an id that does not decode, or is another type’s, is null and the catalog is not called', async () => {
    for (const bad of ['not-base64!', toGlobalId('Order', LISTING_ID), '', 'TGlzdGluZzo=']) {
      assert.equal((await gql(ONE, { id: bad })).body.data.myListing, null, `id ${JSON.stringify(bad)}`);
    }
    assert.equal(seen.length, 0);
  });

  test('a hostile id cannot change the path sent to the catalog', async () => {
    await gql(ONE, { id: toGlobalId('Listing', '../../preferences?x=1#') });
    assert.equal(seen.length, 1);
    assert.ok(seen[0]!.url.startsWith('/catalog/listings/mine/..%2F'));
    assert.equal(new URL(seen[0]!.url, 'http://x').pathname.split('/').length, 5);
  });

  test('no token is UNAUTHENTICATED without a call; a refused token is UNAUTHENTICATED; a customer’s token is FORBIDDEN', async () => {
    assert.equal((await gql(LIST, {}, {})).body.errors![0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
    next = { status: 401, body: {} };
    assert.equal((await gql(LIST, {})).body.errors![0].extensions.code, 'UNAUTHENTICATED');
    next = { status: 403, body: {} };
    assert.equal((await gql(LIST, {})).body.errors![0].extensions.code, 'FORBIDDEN');
    assert.equal((await gql(ONE, { id: gid })).body.errors![0].extensions.code, 'FORBIDDEN');
  });

  test('a status the schema has no name for is an internal error, not a guess', async () => {
    next = { status: 200, body: ownListing({ status: 'Archived' }) };
    assert.equal((await gql(ONE, { id: gid })).body.errors![0].extensions.code, 'INTERNAL');
  });
});

// ---- the owner's fields never reach the public type -------------------------------------------------------------------------

describe('the public Listing', () => {
  const schema = buildSchema(readFileSync(new URL('../schema/schema.graphql', import.meta.url), 'utf8'));
  const fieldsOf = (name: string) => {
    const type = introspectionFromSchema(schema).__schema.types.find((t) => t.name === name) as
      { fields: { name: string }[] } | undefined;
    return (type?.fields ?? []).map((f) => f.name);
  };

  test('has none of the owner’s fields, and MyListing is not a Node (node(id) cannot return it)', () => {
    for (const owner of ['availableQuantity', 'lowStockThreshold', 'editVersion']) {
      assert.ok(!fieldsOf('Listing').includes(owner), `Listing.${owner}`);
      assert.ok(!fieldsOf('Stock').includes(owner), `Stock.${owner}`);
    }
    assert.ok(!fieldsOf('Listing').includes('status')); // a draft's existence is the vendor's own business
    assert.ok(fieldsOf('Listing').length > 5 && fieldsOf('Stock').length > 1); // the lookups found the types
    const node = introspectionFromSchema(schema).__schema.types.find((t) => t.name === 'Node') as unknown as {
      possibleTypes: { name: string }[];
    };
    assert.ok(node.possibleTypes.some((t) => t.name === 'Listing')); // the lookup found the interface
    assert.ok(!node.possibleTypes.some((t) => t.name === 'MyListing'));
  });

  test('a query for an owner’s field on the public type is refused before anything is called', async () => {
    const { body } = await gql(`{ listing(id: "${gid}") { editVersion stock { availableQuantity } } }`, {}, {});
    assert.ok(body.errors && body.errors.length > 0);
    assert.equal(seen.length, 0);
  });

  test('the public answer keeps out owner fields even if the catalog sent them', async () => {
    next = { status: 200, body: ownListing() }; // a catalog that wrongly sent the owner's view on the public route
    const { body } = await gql(`{ listing(id: "${gid}") { id name stock { status maxPerOrder } } }`, {}, {});
    const text = JSON.stringify(body);
    for (const leaked of ['availableQuantity', 'lowStockThreshold', 'editVersion', '"3"'])
      assert.ok(!text.includes(leaked), leaked);
  });
});

// ---- writes ---------------------------------------------------------------------------------------------------------------------

describe('Mutation.createListing', () => {
  test('sends the input in the catalog’s words with the client’s key and the token, and answers the created listing', async () => {
    next = { status: 201, body: ownListing({ editVersion: 1, status: 'Draft' }) };
    const { body } = await create(
      {
        description: 'Naturally leavened.',
        status: 'PUBLISHED',
        tags: ['vegan'],
        stock: { mode: 'COUNTED', availableQuantity: 12, maxPerOrder: 4, lowStockThreshold: 2 },
      },
      'key-Abc_123',
    );

    assert.equal(body.errors, undefined);
    assert.equal(body.data.createListing.__typename, 'ListingWriteSuccess');
    assert.equal(body.data.createListing.listing.editVersion, 1);
    assert.equal(body.data.createListing.listing.status, 'DRAFT');
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.method, 'POST');
    assert.equal(seen[0]!.url, '/catalog/listings');
    assert.equal(seen[0]!.idempotencyKey, 'key-Abc_123');
    assert.equal(seen[0]!.authorization, `Bearer ${TOKEN}`);
    assert.equal(seen[0]!.ifMatch, undefined);
    assert.deepEqual(seen[0]!.body, {
      name: 'Country Sourdough',
      description: 'Naturally leavened.',
      category: 'Bread',
      priceCents: 800,
      modifiers: [{ id: 'mod-seeds', name: 'Seed crust', priceDeltaCents: 100, allergens: ['sesame'] }],
      allergenFlags: ['gluten'],
      status: 'Published',
      tags: ['vegan'],
      stock: { mode: 'counted', availableQuantity: 12, maxPerOrder: 4, lowStockThreshold: 2 },
    });
  });

  test('parts the client left out are left out, so the catalog keeps (or defaults) them', async () => {
    next = { status: 201 };
    await create();
    assert.deepEqual(Object.keys(seen[0]!.body as object).sort(), [
      'allergenFlags',
      'category',
      'description',
      'modifiers',
      'name',
      'priceCents',
    ]);
  });

  test('a repeat (the catalog answers 200) is a success with the listing as it is now', async () => {
    next = { status: 200, body: ownListing({ editVersion: 4 }) };
    const { body } = await create();
    assert.equal(body.data.createListing.__typename, 'ListingWriteSuccess');
    assert.equal(body.data.createListing.listing.editVersion, 4);
  });

  test('the same key for another listing is KEY_REUSED with fixed text', async () => {
    next = { status: 422, body: { code: 'idempotency_key_reuse', message: 'internal wording' } };
    const { body } = await create();
    assert.deepEqual(body.data.createListing, {
      __typename: 'ListingRejected',
      code: 'KEY_REUSED',
      message: 'This form was already used to create a different listing. Start a new listing.',
      fields: [],
      currentEditVersion: null,
    });
  });

  test('a key that cannot travel in a header is INVALID on idempotencyKey and nothing is sent; every other key goes as sent', async () => {
    for (const bad of ['line\nbreak', 'tab\there', 'clé', '\u0000']) {
      const { body } = await create({}, bad);
      assert.equal(body.data.createListing.code, 'INVALID', JSON.stringify(bad));
      assert.equal(body.data.createListing.fields[0].field, 'idempotencyKey');
    }
    assert.equal(seen.length, 0);

    next = { status: 422, body: { code: 'validation_failed', errors: { idempotencyKey: ['From the catalog.'] } } };
    await create({}, 'two words');
    await create({}, '');
    assert.deepEqual(
      seen.map((s) => s.idempotencyKey),
      ['two words', ''],
    ); // the catalog decides; the BFF does not make up or fix a key
  });

  test('an unverified vendor publishing is VENDOR_NOT_VERIFIED', async () => {
    next = { status: 409, body: { code: 'vendor_not_verified', message: 'internal wording' } };
    const { body } = await create({ status: 'PUBLISHED' });
    assert.equal(body.data.createListing.code, 'VENDOR_NOT_VERIFIED');
    assert.ok(!JSON.stringify(body).includes('internal wording'));
  });

  test('no token is UNAUTHENTICATED without a call; a customer’s token (403) is FORBIDDEN', async () => {
    assert.equal((await create({}, 'k', {})).body.errors![0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
    next = { status: 403, body: {} };
    assert.equal((await create()).body.errors![0].extensions.code, 'FORBIDDEN');
  });
});

describe('INVALID: the catalog’s field names and sentences, unchanged', () => {
  const longSentence =
    "'x' is not a known allergen. Use one of: celery, crustacean, dairy, egg, fish, gluten, lupin, mollusc, mustard, peanut, sesame, soy, sulphite, tree-nut, and a little more so it is longer than two hundred characters.";

  test('every field and sentence is passed through as the catalog wrote it, the catalog’s top-level message is not', async () => {
    next = {
      status: 422,
      body: {
        code: 'validation_failed',
        message: 'The listing is invalid.',
        errors: {
          priceCents: ['Price must be between 0 and 10000000 cents.'],
          'stock.availableQuantity': ['Change the quantity with an adjustment.'],
          'modifiers[0].id': ['Modifier id must be lowercase letters, digits and hyphens (max 64).'],
          allergenFlags: [longSentence],
        },
      },
    };
    const { body } = await update();
    assert.deepEqual(body.data.updateListing, {
      __typename: 'ListingRejected',
      code: 'INVALID',
      message: 'The listing could not be saved as entered.',
      fields: [
        { field: 'priceCents', message: 'Price must be between 0 and 10000000 cents.' },
        { field: 'stock.availableQuantity', message: 'Change the quantity with an adjustment.' },
        { field: 'modifiers[0].id', message: 'Modifier id must be lowercase letters, digits and hyphens (max 64).' },
        { field: 'allergenFlags', message: longSentence },
      ],
      currentEditVersion: null,
    });
  });

  test('a hostile value in the request is not in the answer', async () => {
    const hostile = '<img src=x onerror=alert(1)>';
    next = {
      status: 422,
      body: { code: 'validation_failed', errors: { name: ['Name must be at most 120 characters.'] } },
    };
    const { body } = await create({ name: hostile, description: hostile, category: hostile });
    assert.equal(body.data.createListing.code, 'INVALID');
    assert.ok(!JSON.stringify(body).includes(hostile));
    assert.ok(!JSON.stringify(body).includes('onerror'));
  });

  test('the BFF checks no listing rule: out-of-range values go to the catalog as sent', async () => {
    next = { status: 422, body: { code: 'validation_failed', errors: { priceCents: ['From the catalog.'] } } };
    await create({ priceCents: -5, stock: { availableQuantity: 2_000_000_000 } });
    assert.equal((seen[0]!.body as { priceCents: number }).priceCents, -5);
    assert.deepEqual((seen[0]!.body as { stock: object }).stock, {
      availableQuantity: 2_000_000_000,
      maxPerOrder: null,
      lowStockThreshold: null,
    });
    await adjust(0);
    assert.deepEqual(seen[1]!.body, { delta: 0 });
  });
});

describe('Mutation.updateListing', () => {
  test('sends If-Match with the expected edit version to the listing’s path, and answers the listing', async () => {
    next = { status: 200, body: ownListing({ editVersion: 4 }) };
    const { body } = await update({ stock: { mode: 'MADE_TO_ORDER' } }, 3);

    assert.equal(body.data.updateListing.listing.editVersion, 4);
    assert.equal(seen[0]!.method, 'PUT');
    assert.equal(seen[0]!.url, `/catalog/listings/${LISTING_ID}`);
    assert.equal(seen[0]!.ifMatch, '"3"');
    assert.equal(seen[0]!.idempotencyKey, undefined);
    assert.deepEqual((seen[0]!.body as { stock: object }).stock, {
      mode: 'madeToOrder',
      availableQuantity: null,
      maxPerOrder: null,
      lowStockThreshold: null,
    });
  });

  test('a stale version is CHANGED with the current version; the catalog’s own conflict is CHANGED without one', async () => {
    next = { status: 409, body: { code: 'version_mismatch', message: 'internal wording', currentEditVersion: 7 } };
    const stale = (await update()).body.data.updateListing;
    assert.deepEqual(stale, {
      __typename: 'ListingRejected',
      code: 'CHANGED',
      message: 'This listing was changed since you opened it. Reload it and try again.',
      fields: [],
      currentEditVersion: 7,
    });

    next = { status: 409, body: { code: 'conflict', message: 'internal wording' } };
    const busy = (await update()).body.data.updateListing;
    assert.equal(busy.code, 'CHANGED');
    assert.equal(busy.currentEditVersion, null);
  });

  test('a version the catalog cannot use (it answers 428) is INVALID on expectedEditVersion', async () => {
    next = { status: 428, body: { code: 'precondition_required', message: 'internal wording' } };
    const { body } = await update({}, 0);
    assert.equal(seen[0]!.ifMatch, '"0"'); // sent as given: the catalog decides
    assert.equal(body.data.updateListing.code, 'INVALID');
    assert.equal(body.data.updateListing.fields[0].field, 'expectedEditVersion');
    assert.ok(!JSON.stringify(body).includes('internal wording'));
  });

  test('another vendor’s listing (the catalog answers 404) is NOT_FOUND', async () => {
    next = { status: 404, body: { code: 'not_found' } };
    assert.equal((await update()).body.data.updateListing.code, 'NOT_FOUND');
  });

  test('an id that does not decode, or is another type’s, is NOT_FOUND and the catalog is not called', async () => {
    for (const bad of ['not-base64!', toGlobalId('VendorOrder', LISTING_ID), '']) {
      assert.equal((await update({}, 3, bad)).body.data.updateListing.code, 'NOT_FOUND', JSON.stringify(bad));
    }
    assert.equal(seen.length, 0);
  });

  test('a hostile id cannot change the path', async () => {
    await update({}, 3, toGlobalId('Listing', '../x/stock/adjust?y'));
    assert.equal(seen[0]!.method, 'PUT');
    assert.ok(seen[0]!.url.startsWith('/catalog/listings/..%2F'));
    assert.equal(new URL(seen[0]!.url, 'http://x').pathname.split('/').length, 4);
  });

  test('no token is UNAUTHENTICATED without a call', async () => {
    assert.equal((await update({}, 3, gid, {})).body.errors![0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });
});

describe('Mutation.adjustListingStock', () => {
  test('posts the delta to the listing’s adjust path and answers the listing', async () => {
    const { body } = await adjust(-2);
    assert.equal(body.data.adjustListingStock.__typename, 'ListingWriteSuccess');
    assert.equal(seen[0]!.method, 'POST');
    assert.equal(seen[0]!.url, `/catalog/listings/${LISTING_ID}/stock/adjust`);
    assert.deepEqual(seen[0]!.body, { delta: -2 });
    assert.equal(seen[0]!.ifMatch, undefined);
  });

  test('each refusal is mapped with fixed text', async () => {
    const cases: [number, string, string][] = [
      [409, 'made_to_order', 'MADE_TO_ORDER'],
      [409, 'insufficient_stock', 'INSUFFICIENT_STOCK'],
      [409, 'conflict', 'CHANGED'],
      [404, 'not_found', 'NOT_FOUND'],
    ];
    for (const [status, wire, code] of cases) {
      next = { status, body: { code: wire, message: 'internal wording' } };
      const { body } = await adjust(-1);
      assert.equal(body.data.adjustListingStock.code, code, wire);
      assert.ok(!JSON.stringify(body).includes('internal wording'));
    }
  });

  test('a delta past the catalog’s limit is INVALID with the catalog’s sentence', async () => {
    next = {
      status: 422,
      body: { code: 'validation_failed', errors: { delta: ['Delta must be between -1000000 and 1000000.'] } },
    };
    const { body } = await adjust(2_000_000);
    assert.deepEqual(body.data.adjustListingStock.fields, [
      { field: 'delta', message: 'Delta must be between -1000000 and 1000000.' },
    ]);
  });

  test('an id of another type is NOT_FOUND without a call; no token is UNAUTHENTICATED', async () => {
    assert.equal((await adjust(1, toGlobalId('Order', LISTING_ID))).body.data.adjustListingStock.code, 'NOT_FOUND');
    assert.equal((await adjust(1, gid, {})).body.errors![0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });
});

// ---- failures of the catalog ---------------------------------------------------------------------------------------------------

describe('a failing catalog', () => {
  test('a 500, a body that is not JSON, an unknown code or a refusal without a code is INTERNAL, with no detail and no token in the logs', async () => {
    const failures: (typeof next)[] = [
      { status: 500, body: { message: 'secret detail at http://cosmos.internal' } },
      { status: 503, body: { code: 'store_unavailable', message: 'secret detail at http://cosmos.internal' } },
      'not-json',
      { status: 409, body: { code: 'mystery', message: 'secret detail at http://cosmos.internal' } },
      { status: 422, body: { errors: {} } },
    ];
    for (const failure of failures) {
      next = failure;
      const { body } = await update();
      assert.equal(body.errors![0].extensions.code, 'INTERNAL', JSON.stringify(failure));
    }
    const text = JSON.stringify(logs);
    assert.ok(!text.includes('cosmos.internal'));
    assert.ok(!text.includes(TOKEN));
  });

  test('a catalog that never answers ends in a bounded wait with the generic error', async () => {
    next = 'slow';
    const started = Date.now();
    const { body } = await create();
    assert.equal(body.errors![0].extensions.code, 'INTERNAL');
    assert.ok(Date.now() - started < 3000);
  });

  test('a body over the BFF’s limit is refused before anything is sent', async () => {
    const res = await fetch(bffUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({
        query: CREATE,
        variables: { input: input({ description: 'x'.repeat(70 * 1024) }), key: 'k' },
      }),
    });
    assert.equal(res.status, 413);
    assert.equal(seen.length, 0);
  });
});

describe('the rate limit', () => {
  test('listing writes are counted by the BFF’s per-source ceiling', async () => {
    const limited = createServer(
      {
        port: 0,
        catalogUrl: `http://127.0.0.1:${(catalog.address() as AddressInfo).port}`,
        orderingUrl: `http://127.0.0.1:${(ordering.address() as AddressInfo).port}`,
        timeoutMs: 300,
        checkoutTimeoutMs: 300,
        rateLimitPerMinute: 2,
      },
      { log, exporter: () => {} },
    );
    await new Promise<void>((r) => limited.listen(0, '127.0.0.1', r));
    try {
      const url = `http://127.0.0.1:${(limited.address() as AddressInfo).port}/graphql`;
      const send = (query: string, variables: object) =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...auth },
          body: JSON.stringify({ query, variables }),
        });
      const statuses = [
        (await send(CREATE, { input: input(), key: 'k1' })).status,
        (await send(ADJUST, { id: gid, delta: 1 })).status,
        (await send(UPDATE, { id: gid, input: input(), v: 3 })).status,
      ];
      assert.deepEqual(statuses, [200, 200, 429]);
      assert.equal(seen.length, 2);
    } finally {
      limited.closeAllConnections();
      limited.close();
    }
  });
});
