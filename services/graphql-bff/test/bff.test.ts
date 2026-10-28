import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer, type Logger } from '../src/server.ts';

// A fake catalog-service (ordered by id, like the real one) speaking the real REST shapes (first-slice contract section 4), so the real HTTP client is exercised.
const sourdough = {
  id: 'listing-sourdough-001',
  vendorId: 'vendor-shop-001',
  name: 'Country Sourdough',
  description: 'A naturally leavened country loaf.',
  category: 'bread',
  priceCents: 800,
  currency: 'USD',
  modifiers: [
    { id: 'mod-seeds', name: 'Add seeds', priceDeltaCents: 100, allergens: ['sesame'] },
    { id: 'mod-sliced', name: 'Sliced', priceDeltaCents: 0, allergens: [] },
  ],
  allergenFlags: ['gluten'],
  sponsored: false,
  status: 'Published',
  createdAt: '2026-01-01T00:00:00+00:00',
  updatedAt: '2026-01-01T00:00:00+00:00',
};
const croissant = {
  ...sourdough,
  id: 'listing-croissant-001',
  name: 'Almond Croissant',
  priceCents: 450,
  modifiers: [],
  allergenFlags: ['gluten', 'dairy', 'tree-nut'],
};

interface Seen {
  url: string;
  traceparent: string | undefined;
  correlation: string | undefined;
}
const seen: Seen[] = [];
let catalogMode: 'ok' | 'empty' | 'error' | 'badjson' | 'hang' = 'ok';

const catalog = http.createServer((req, res) => {
  seen.push({
    url: req.url ?? '',
    traceparent: req.headers.traceparent as string | undefined,
    correlation: req.headers['x-correlation-id'] as string | undefined,
  });
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const url = new URL(req.url ?? '/', 'http://x');
  if (catalogMode === 'error')
    return json(500, { code: 'boom', message: 'secret internal detail at http://cosmos.internal:8081' });
  if (catalogMode === 'badjson') {
    res.writeHead(200);
    return res.end('<html>nope');
  }
  if (catalogMode === 'hang') return; // never answers
  if (url.pathname === '/catalog/listings') {
    if (catalogMode === 'empty') return json(200, { items: [], nextCursor: null });
    const limit = Number(url.searchParams.get('limit'));
    const items = [croissant, sourdough].filter((l) => l.id > (url.searchParams.get('after') ?? ''));
    const page = items.slice(0, limit);
    return json(200, { items: page, nextCursor: items.length > limit ? page.at(-1)!.id : null });
  }
  const id = decodeURIComponent(url.pathname.split('/').pop()!);
  const found = [sourdough, croissant].find((l) => l.id === id);
  return found ? json(200, found) : json(404, { code: 'not_found', message: 'Listing not found.' });
});

const logs: Record<string, unknown>[] = [];
const log: Logger = { info: (e) => logs.push(e), error: (e) => logs.push(e) };
let bff: http.Server;
let bffUrl: string;
let catalogUrl: string;

before(async () => {
  await new Promise<void>((r) => catalog.listen(0, '127.0.0.1', r));
  catalogUrl = `http://127.0.0.1:${(catalog.address() as AddressInfo).port}`;
  bff = createServer({ port: 0, catalogUrl, timeoutMs: 300 }, { log });
  await new Promise<void>((r) => bff.listen(0, '127.0.0.1', r));
  bffUrl = `http://127.0.0.1:${(bff.address() as AddressInfo).port}/graphql`;
});
after(() => {
  bff.close();
  catalog.close();
});

// Query results are ad hoc per test, so the response body is deliberately loosely typed (the only `any` in this file).
/* eslint-disable @typescript-eslint/no-explicit-any */
type GqlBody = { data?: any; errors?: any[] };
/* eslint-enable @typescript-eslint/no-explicit-any */

async function gql(query: string, variables?: object, headers: Record<string, string> = {}) {
  const res = await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  return { res, body: (await res.json()) as GqlBody };
}

const LISTINGS = `query($first: Int, $after: String) { listings(first: $first, after: $after) {
  edges { cursor node { id vendorId name description category price { cents currency }
    modifiers { id name priceDelta { cents currency } allergens } allergenFlags } }
  pageInfo { hasNextPage endCursor } } }`;

describe('BFF <-> service agreement (first-slice contract section 8, test 2)', () => {
  test('listings maps the REST body field for field', async () => {
    catalogMode = 'ok';
    const { body } = await gql(LISTINGS);
    assert.equal(body.errors, undefined);
    const first = body.data.listings.edges.find((e: { node: { id: string } }) => e.node.id === sourdough.id);
    assert.deepEqual(first.node, {
      id: sourdough.id,
      vendorId: sourdough.vendorId,
      name: sourdough.name,
      description: sourdough.description,
      category: sourdough.category,
      price: { cents: 800, currency: 'USD' },
      modifiers: [
        { id: 'mod-seeds', name: 'Add seeds', priceDelta: { cents: 100, currency: 'USD' }, allergens: ['sesame'] },
        { id: 'mod-sliced', name: 'Sliced', priceDelta: { cents: 0, currency: 'USD' }, allergens: [] },
      ],
      allergenFlags: ['gluten'],
    });
    assert.equal(first.cursor, sourdough.id);
  });

  test('paging passes first/after through and reports hasNextPage from the service cursor', async () => {
    catalogMode = 'ok';
    const p1 = (await gql(LISTINGS, { first: 1 })).body.data.listings;
    assert.equal(p1.edges.length, 1);
    assert.deepEqual(p1.pageInfo, { hasNextPage: true, endCursor: croissant.id });
    const p2 = (await gql(LISTINGS, { first: 1, after: p1.pageInfo.endCursor })).body.data.listings;
    assert.equal(p2.edges[0].node.id, sourdough.id);
    assert.deepEqual(p2.pageInfo, { hasNextPage: false, endCursor: sourdough.id });
    assert.match(seen.at(-1)!.url, /after=listing-croissant-001/);
  });

  test('page size is clamped before it reaches the service', async () => {
    catalogMode = 'ok';
    await gql(LISTINGS, { first: 100000 });
    assert.match(seen.at(-1)!.url, /limit=50(&|$)/);
  });

  test('no listings is an empty connection, not an error', async () => {
    catalogMode = 'empty';
    const { body } = await gql(LISTINGS);
    assert.deepEqual(body.data.listings, { edges: [], pageInfo: { hasNextPage: false, endCursor: null } });
  });

  test('listing(id) returns the listing; a missing or non-public id is null, not an error', async () => {
    catalogMode = 'ok';
    const q = 'query($id: ID!) { listing(id: $id) { id name price { cents } } }';
    assert.deepEqual((await gql(q, { id: croissant.id })).body.data.listing, {
      id: croissant.id,
      name: 'Almond Croissant',
      price: { cents: 450 },
    });
    const missing = await gql(q, { id: 'listing-draft-001' });
    assert.equal(missing.body.errors, undefined);
    assert.equal(missing.body.data.listing, null);
  });

  test('ids are URL-encoded on the way to the service', async () => {
    catalogMode = 'ok';
    await gql('query($id: ID!) { listing(id: $id) { id } }', { id: '../admin' });
    assert.equal(seen.at(-1)!.url, '/catalog/listings/..%2Fadmin');
  });
});

describe('client-safe errors (contract section 6)', () => {
  for (const mode of ['error', 'badjson', 'hang'] as const) {
    test(`downstream failure (${mode}) becomes INTERNAL with a fixed message and the trace id as reference`, async () => {
      catalogMode = mode;
      logs.length = 0;
      const { res, body } = await gql(LISTINGS);
      assert.equal(body.errors!.length, 1);
      const err = body.errors![0];
      assert.equal(err.message, 'Something went wrong. Please try again.');
      assert.equal(err.extensions.code, 'INTERNAL');
      assert.equal(err.extensions.reference, res.headers.get('x-correlation-id'));
      assert.equal(err.path, undefined, 'path would leak resolver structure');
      const wire = JSON.stringify(body);
      for (const secret of ['cosmos.internal', '8081', catalogUrl, 'secret internal detail', 'stack', 'nope']) {
        assert.ok(!wire.includes(secret), `response leaked "${secret}"`);
      }
      assert.ok(
        logs.some((l) => l.msg === 'resolver failed' && l.traceId === err.extensions.reference),
        'detail is kept in the server log',
      );
    });
  }

  test('an unreachable service is also INTERNAL', async () => {
    const dead = createServer({ port: 0, catalogUrl: 'http://127.0.0.1:1', timeoutMs: 300 }, { log });
    await new Promise<void>((r) => dead.listen(0, '127.0.0.1', r));
    const res = await fetch(`http://127.0.0.1:${(dead.address() as AddressInfo).port}/graphql`, {
      method: 'POST',
      body: JSON.stringify({ query: '{ listings { edges { cursor } } }' }),
    });
    const body = (await res.json()) as { errors: { extensions: { code: string } }[] };
    assert.equal(body.errors[0]!.extensions.code, 'INTERNAL');
    dead.close();
  });

  test('malformed bodies are 400 and invalid queries get a validation error, never a stack', async () => {
    const bad = await fetch(bffUrl, { method: 'POST', body: 'not json' });
    assert.equal(bad.status, 400);
    const invalid = await gql('{ nope }');
    assert.match(invalid.body.errors![0].message, /Cannot query field/);
    assert.equal(invalid.body.errors![0].extensions, undefined);
  });
});

describe('trace propagation (ADR-0016)', () => {
  const inbound = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

  test('a valid inbound traceparent is continued: same trace id downstream, new span id', async () => {
    catalogMode = 'ok';
    const { res } = await gql(LISTINGS, undefined, { traceparent: inbound });
    const down = seen.at(-1)!.traceparent!;
    assert.match(down, /^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/);
    assert.notEqual(down.split('-')[2], '00f067aa0ba902b7');
    assert.equal(res.headers.get('x-correlation-id'), '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.equal(res.headers.get('traceparent'), down, 'response and downstream carry the same BFF span');
  });

  test('without (or with a malformed) traceparent a new trace starts, and bad input is not echoed', async () => {
    catalogMode = 'ok';
    for (const bad of [undefined, 'garbage<script>', '00-00000000000000000000000000000000-00f067aa0ba902b7-01']) {
      const { res } = await gql(LISTINGS, undefined, bad ? { traceparent: bad } : {});
      assert.match(seen.at(-1)!.traceparent!, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      assert.match(res.headers.get('x-correlation-id')!, /^[0-9a-f]{32}$/);
      assert.notEqual(res.headers.get('x-correlation-id'), '00000000000000000000000000000000');
    }
  });

  test('an inbound X-Correlation-Id is neither trusted nor forwarded', async () => {
    catalogMode = 'ok';
    const { res } = await gql(LISTINGS, undefined, { 'x-correlation-id': 'attacker-chosen' });
    assert.notEqual(res.headers.get('x-correlation-id'), 'attacker-chosen');
    assert.equal(seen.at(-1)!.correlation, undefined);
  });

  test('the request log carries the trace id and no query text or variables', async () => {
    catalogMode = 'ok';
    logs.length = 0;
    const { res } = await gql(LISTINGS, { first: 1 }, { traceparent: inbound });
    const entry = logs.find((l) => l.msg === 'graphql request')!;
    assert.equal(entry.traceId, res.headers.get('x-correlation-id'));
    assert.equal(entry.continuedTrace, true);
    assert.ok(!JSON.stringify(entry).includes('edges'));
  });

  test('responses are private, no-store (ADR-0014 default)', async () => {
    const { res } = await gql(LISTINGS);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
  });
});
