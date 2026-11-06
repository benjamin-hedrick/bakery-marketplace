import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toGlobalId } from '../src/global-id.ts';
import { createServer, type Logger } from '../src/server.ts';

// WI-CUST-007: the customer's own order list, mapped from ordering-service with the customer's token forwarded to ordering only.

const TOKEN = 'header.payload.signature';
const order = {
  id: 'order-0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d',
  customerId: 'customer-1',
  vendorId: 'vendor-shop-001',
  lineItems: [
    {
      listingId: 'listing-sourdough-001',
      modifiers: ['mod-seeds'],
      quantity: 2,
      unitPriceCents: 900,
      priceCents: 1800,
    },
  ],
  totalCents: 1800,
  currency: 'USD',
  status: 'Confirmed',
  fulfillmentType: 'Pickup',
  pickupWindow: { start: '2026-11-02T14:00:00+00:00', end: '2026-11-02T14:15:00+00:00' },
  sequenceNumber: 2,
  createdAt: '2026-11-02T13:00:00+00:00',
  updatedAt: '2026-11-02T13:01:00+00:00',
};

interface Seen {
  url: string;
  authorization: string | undefined;
}
const seen: Seen[] = [];
let mode: 'ok' | 'empty' | 'more' | 'unauthorized' | 'forbidden' | 'error' | 'badstatus' = 'ok';

const reply = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const catalog = http.createServer((_req, res) => reply(res, 404, {}));
const ordering = http.createServer((req, res) => {
  seen.push({ url: req.url ?? '', authorization: req.headers.authorization });
  const url = new URL(req.url ?? '/', 'http://x');
  if (mode === 'unauthorized') return reply(res, 401, {});
  if (mode === 'forbidden') return reply(res, 403, {});
  if (mode === 'error') return reply(res, 500, { message: 'secret detail at http://cosmos.internal' });
  if (url.pathname === '/ordering/orders') {
    if (mode === 'empty') return reply(res, 200, { items: [], nextCursor: null });
    return reply(res, 200, {
      items: [{ ...order, status: mode === 'badstatus' ? 'Mystery' : order.status }],
      nextCursor: mode === 'more' ? '1730000000000:order-x' : null,
    });
  }
  return reply(res, 404, { code: 'not_found' });
});

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
  bff.close();
  catalog.close();
  ordering.close();
});
beforeEach(() => {
  seen.length = 0;
  logs.length = 0;
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

const LIST = `query($first: Int, $after: String) {
  orders(first: $first, after: $after) {
    edges { cursor node { id status vendorId total { cents currency } createdAt pickupWindow { start end }
      lineItems { listingId modifierIds quantity price { cents currency } } } }
    pageInfo { hasNextPage endCursor } } }`;

describe('Query.orders', () => {
  test('maps the caller’s orders with global ids, and forwards the caller’s token to ordering only', async () => {
    const { body } = await gql(LIST, {}, auth);

    assert.equal(body.errors, undefined);
    const node = body.data.orders.edges[0].node;
    assert.equal(node.id, toGlobalId('Order', order.id));
    assert.equal(node.status, 'CONFIRMED');
    assert.equal(node.vendorId, 'vendor-shop-001');
    assert.deepEqual(node.total, { cents: 1800, currency: 'USD' });
    assert.equal(node.createdAt, '2026-11-02T13:00:00+00:00');
    assert.equal(node.lineItems[0].listingId, toGlobalId('Listing', 'listing-sourdough-001'));
    assert.deepEqual(body.data.orders.pageInfo, { hasNextPage: false, endCursor: order.id });
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.authorization, `Bearer ${TOKEN}`);
  });

  test('sends the page size and cursor to ordering, and a missing size means 20', async () => {
    await gql(LIST, { first: 5, after: '1730000000000:order-x' }, auth);
    await gql(LIST, {}, auth);

    assert.equal(seen[0]!.url, '/ordering/orders?limit=5&after=1730000000000%3Aorder-x');
    assert.equal(seen[1]!.url, '/ordering/orders?limit=20');
  });

  test('a page larger than the maximum is clamped, and a following page is advertised with the service cursor', async () => {
    mode = 'more';

    const { body } = await gql(LIST, { first: 5000 }, auth);

    assert.equal(seen[0]!.url, '/ordering/orders?limit=50');
    assert.deepEqual(body.data.orders.pageInfo, { hasNextPage: true, endCursor: '1730000000000:order-x' });
  });

  test('an empty history is an empty list, not an error', async () => {
    mode = 'empty';

    const { body } = await gql(LIST, {}, auth);

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.orders, { edges: [], pageInfo: { hasNextPage: false, endCursor: null } });
  });

  test('needs a token: without one nothing is asked of ordering', async () => {
    const { body } = await gql(LIST);

    assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });

  test('a token ordering refuses is UNAUTHENTICATED and one whose role is not a customer’s is FORBIDDEN', async () => {
    mode = 'unauthorized';
    const refused = await gql(LIST, {}, auth);
    mode = 'forbidden';
    const wrongRole = await gql(LIST, {}, auth);

    assert.equal(refused.body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(wrongRole.body.errors[0].extensions.code, 'FORBIDDEN');
  });

  test('a service failure is an internal error that leaks nothing of the service', async () => {
    mode = 'error';

    const { body } = await gql(LIST, {}, auth);

    assert.equal(body.errors[0].extensions.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(body), /cosmos|secret/);
  });

  test('a status the BFF has no name for is an internal error, never guessed', async () => {
    mode = 'badstatus';

    const { body } = await gql(LIST, {}, auth);

    assert.equal(body.errors[0].extensions.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(body), /Mystery/);
  });
});
