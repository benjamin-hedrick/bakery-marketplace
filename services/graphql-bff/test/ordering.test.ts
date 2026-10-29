import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toGlobalId } from '../src/global-id.ts';
import { createServer, type Logger } from '../src/server.ts';

// S1-01a: stock on listings, pickupWindows, and order/node(Order) with the caller's token forwarded to ordering only.
// Fake services speak the real REST shapes (first-slice contract section 4; OrderDto of ordering-service).

const TOKEN = 'header.payload.signature';
const listing = {
  id: 'listing-sourdough-001',
  vendorId: 'vendor-shop-001',
  name: 'Country Sourdough',
  description: null,
  category: 'bread',
  priceCents: 800,
  currency: 'USD',
  modifiers: [],
  allergenFlags: ['gluten'],
  stock: { status: 'low', maxPerOrder: 4 },
};
const order = {
  id: 'order-abc',
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
  status: 'InPreparation',
  fulfillmentType: 'Pickup',
  pickupWindow: { start: '2026-11-02T14:00:00+00:00', end: '2026-11-02T14:15:00+00:00' },
  sequenceNumber: 3,
  createdAt: '2026-11-02T13:00:00+00:00',
  updatedAt: '2026-11-02T13:05:00+00:00',
};

interface Seen {
  service: 'catalog' | 'ordering';
  url: string;
  authorization: string | undefined;
  traceparent: string | undefined;
}
const seen: Seen[] = [];
let listingStock: unknown = listing.stock;
let orderingMode: 'ok' | 'unauthorized' | 'forbidden' | 'missing' | 'error' | 'nowindow' | 'hang' = 'ok';
let orderStatus = 'InPreparation';

const reply = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const record = (service: Seen['service'], req: http.IncomingMessage) =>
  seen.push({
    service,
    url: req.url ?? '',
    authorization: req.headers.authorization,
    traceparent: req.headers.traceparent as string | undefined,
  });

const catalog = http.createServer((req, res) => {
  record('catalog', req);
  reply(res, 200, { ...listing, stock: listingStock });
});

const ordering = http.createServer((req, res) => {
  record('ordering', req);
  const url = new URL(req.url ?? '/', 'http://x');
  if (orderingMode === 'hang') return;
  if (orderingMode === 'error')
    return reply(res, 500, { code: 'boom', message: 'secret detail at http://cosmos.internal' });
  if (url.pathname === '/ordering/pickup-windows') {
    return reply(res, 200, {
      windows: [
        { start: '2026-11-02T14:00:00+00:00', end: '2026-11-02T14:15:00+00:00' },
        { start: '2026-11-02T14:15:00+00:00', end: '2026-11-02T14:30:00+00:00' },
      ],
    });
  }
  if (orderingMode === 'unauthorized') return reply(res, 401, {});
  if (orderingMode === 'forbidden') return reply(res, 403, {});
  if (orderingMode === 'missing') return reply(res, 404, { code: 'not_found', message: 'Order not found.' });
  if (url.pathname === `/ordering/orders/${order.id}`) {
    if (orderingMode === 'nowindow') return reply(res, 200, { ...order, status: orderStatus, pickupWindow: null });
    return reply(res, 200, { ...order, status: orderStatus });
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
      testHooks: false,
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
  listingStock = listing.stock;
  orderingMode = 'ok';
  orderStatus = 'InPreparation';
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
const orderGid = toGlobalId('Order', order.id);
const listingGid = toGlobalId('Listing', listing.id);

const ORDER = `query($id: ID!) { order(id: $id) { id status vendorId total { cents currency } createdAt
  pickupWindow { start end } lineItems { listingId modifierIds quantity price { cents currency } } } }`;

describe('Listing.stock (open item 64)', () => {
  test('maps the catalog stock block to the enum and the per-order maximum', async () => {
    const { body } = await gql(`{ listing(id: "${listingGid}") { stock { status maxPerOrder } } }`);
    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.listing.stock, { status: 'LOW', maxPerOrder: 4 });
  });

  test('covers every status the catalog can report, and a missing maximum is null', async () => {
    for (const [wire, expected] of [
      ['inStock', 'IN_STOCK'],
      ['low', 'LOW'],
      ['soldOut', 'SOLD_OUT'],
    ] as const) {
      listingStock = { status: wire, maxPerOrder: null };
      const { body } = await gql(`{ listing(id: "${listingGid}") { stock { status maxPerOrder } } }`);
      assert.deepEqual(body.data.listing.stock, { status: expected, maxPerOrder: null });
    }
  });

  test('a status the BFF does not know is an internal error, never passed through or guessed', async () => {
    listingStock = { status: 'mystery', maxPerOrder: null };
    const { body } = await gql(`{ listing(id: "${listingGid}") { name stock { status } } }`);
    assert.equal(body.errors?.[0]?.extensions?.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(body), /mystery/);
  });

  test('a query that does not ask for stock is unaffected by a bad stock block', async () => {
    listingStock = { status: 'mystery', maxPerOrder: null };
    const { body } = await gql(`{ listing(id: "${listingGid}") { name } }`);
    assert.equal(body.errors, undefined);
  });
});

describe('Query.pickupWindows', () => {
  test('maps the windows and sends the vendor id to ordering without any credential', async () => {
    const { body } = await gql(`{ pickupWindows(vendorId: "vendor-shop-001") { start end } }`, undefined, auth);
    assert.equal(body.errors, undefined);
    assert.equal(body.data.pickupWindows.length, 2);
    assert.deepEqual(body.data.pickupWindows[0], {
      start: '2026-11-02T14:00:00+00:00',
      end: '2026-11-02T14:15:00+00:00',
    });
    const call = seen.find((s) => s.service === 'ordering')!;
    assert.equal(call.url, '/ordering/pickup-windows?vendorId=vendor-shop-001');
    assert.equal(call.authorization, undefined); // public data: the caller's token is not sent where it is not needed
  });

  test('the vendor id is encoded, not concatenated', async () => {
    await gql(`{ pickupWindows(vendorId: "a&b=c d") { start } }`);
    assert.equal(seen.find((s) => s.service === 'ordering')!.url, '/ordering/pickup-windows?vendorId=a%26b%3Dc+d');
  });

  test('an ordering failure is an internal error with no detail', async () => {
    orderingMode = 'error';
    const { body } = await gql(`{ pickupWindows(vendorId: "v") { start } }`);
    assert.equal(body.errors?.[0]?.extensions?.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(body), /cosmos\.internal|boom/);
  });
});

describe('Query.order and node(Order)', () => {
  test('maps the REST order field for field, with a global id and the status enum', async () => {
    const { body } = await gql(ORDER, { id: orderGid }, auth);
    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.order, {
      id: orderGid,
      status: 'IN_PREPARATION',
      vendorId: 'vendor-shop-001',
      total: { cents: 1800, currency: 'USD' },
      createdAt: '2026-11-02T13:00:00+00:00',
      pickupWindow: { start: '2026-11-02T14:00:00+00:00', end: '2026-11-02T14:15:00+00:00' },
      lineItems: [
        {
          listingId: listingGid, // a Listing global id, so a line links back to its Listing node
          modifierIds: ['mod-seeds'],
          quantity: 2,
          price: { cents: 1800, currency: 'USD' },
        },
      ],
    });
  });

  test("forwards the caller's token and a traceparent to ordering, and nothing about the token to anyone else", async () => {
    const parent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    await gql(ORDER, { id: orderGid }, { ...auth, traceparent: parent });
    const call = seen.find((s) => s.service === 'ordering')!;
    assert.equal(call.url, `/ordering/orders/${order.id}`);
    assert.equal(call.authorization, `Bearer ${TOKEN}`); // unchanged: ordering validates it itself (zero trust)
    assert.match(call.traceparent ?? '', /^00-0af7651916cd43dd8448eb211c80319c-[0-9a-f]{16}-01$/);
    assert.equal(seen.filter((s) => s.service === 'catalog').length, 0);
  });

  test('the token never reaches the catalog, even on a query that mixes listings and orders', async () => {
    await gql(
      `query($id: ID!) { order(id: $id) { id } listing(id: "${listingGid}") { name } }`,
      { id: orderGid },
      auth,
    );
    assert.ok(seen.some((s) => s.service === 'catalog'));
    assert.ok(seen.filter((s) => s.service === 'catalog').every((s) => s.authorization === undefined));
  });

  test('the token is never written to the log', async () => {
    await gql(ORDER, { id: orderGid }, auth);
    orderingMode = 'error';
    await gql(ORDER, { id: orderGid }, auth);
    assert.doesNotMatch(JSON.stringify(logs), new RegExp(TOKEN));
  });

  test('without a token it is UNAUTHENTICATED and ordering is not called', async () => {
    const { body } = await gql(ORDER, { id: orderGid });
    assert.equal(body.data.order, null);
    assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });

  test('a credential that is not a bearer token is treated as none', async () => {
    for (const authorization of ['Basic dXNlcjpwYXNz', 'Bearer', 'Bearer a b', TOKEN]) {
      const { body } = await gql(ORDER, { id: orderGid }, { authorization });
      assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED', authorization);
    }
    assert.equal(seen.length, 0);
  });

  test('ordering rejecting the token (401) is UNAUTHENTICATED', async () => {
    orderingMode = 'unauthorized';
    const { body } = await gql(ORDER, { id: orderGid }, auth);
    assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED');
  });

  test('ordering refusing the role (403) is FORBIDDEN', async () => {
    orderingMode = 'forbidden';
    const { body } = await gql(ORDER, { id: orderGid }, auth);
    assert.equal(body.errors[0].extensions.code, 'FORBIDDEN');
  });

  test("an order that is not found, or is not the caller's (404), is null with no error", async () => {
    orderingMode = 'missing';
    const { body } = await gql(ORDER, { id: orderGid }, auth);
    assert.equal(body.errors, undefined);
    assert.equal(body.data.order, null);
  });

  test('an id of another type, or one that does not decode, is null without calling ordering', async () => {
    for (const id of [listingGid, 'not-base64!', toGlobalId('Order', '')]) {
      const { body } = await gql(ORDER, { id }, auth);
      assert.equal(body.data.order, null, id);
    }
    assert.equal(seen.length, 0);
  });

  test('an order without a pickup window has a null window (it is optional)', async () => {
    orderingMode = 'nowindow';
    const { body } = await gql(ORDER, { id: orderGid }, auth);
    assert.equal(body.errors, undefined);
    assert.equal(body.data.order.pickupWindow, null);
  });

  test('every status ordering can report maps to its enum value', async () => {
    const pairs = [
      ['Pending', 'PENDING'],
      ['Placed', 'PLACED'],
      ['Confirmed', 'CONFIRMED'],
      ['InPreparation', 'IN_PREPARATION'],
      ['ReadyForFulfillment', 'READY_FOR_FULFILLMENT'],
      ['Completed', 'COMPLETED'],
      ['Cancelled', 'CANCELLED'],
    ];
    for (const [wire, expected] of pairs) {
      orderStatus = wire!;
      const { body } = await gql(ORDER, { id: orderGid }, auth);
      assert.equal(body.data.order.status, expected, wire);
    }
  });

  test('a status the BFF does not know is an internal error', async () => {
    orderStatus = 'Teleported';
    const { body } = await gql(ORDER, { id: orderGid }, auth);
    assert.equal(body.errors[0].extensions.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(body), /Teleported/);
  });

  test('an ordering failure is an internal error with no detail', async () => {
    orderingMode = 'error';
    const { body } = await gql(ORDER, { id: orderGid }, auth);
    assert.equal(body.errors[0].extensions.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(body), /cosmos\.internal|boom/);
  });

  test('a hung ordering service times out into an internal error', async () => {
    orderingMode = 'hang';
    const { body } = await gql(ORDER, { id: orderGid }, auth);
    assert.equal(body.errors[0].extensions.code, 'INTERNAL');
  });

  test('node(id) resolves an Order for its owner and still resolves a Listing', async () => {
    const o = await gql(
      `query($id: ID!) { node(id: $id) { __typename id ... on Order { status } } }`,
      { id: orderGid },
      auth,
    );
    assert.deepEqual(o.body.data.node, { __typename: 'Order', id: orderGid, status: 'IN_PREPARATION' });
    const l = await gql(`query($id: ID!) { node(id: $id) { __typename id } }`, { id: listingGid });
    assert.deepEqual(l.body.data.node, { __typename: 'Listing', id: listingGid });
  });

  test('node(id) for an Order without a token is UNAUTHENTICATED', async () => {
    const { body } = await gql(`query($id: ID!) { node(id: $id) { id } }`, { id: orderGid });
    assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });
});
