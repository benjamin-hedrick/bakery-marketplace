import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toGlobalId } from '../src/global-id.ts';
import { createServer, type Logger } from '../src/server.ts';

// N-04 (QUE-001): the vendor's order queries, mapped from ordering-service's vendor read model with the vendor's token forwarded to ordering only.

const TOKEN = 'header.payload.signature';
const vendorOrder = {
  id: 'order-0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d',
  reference: '3B4C5D',
  status: 'Placed',
  totalCents: 2400,
  currency: 'USD',
  lineCount: 2,
  itemCount: 3,
  fulfillmentType: 'Pickup',
  pickupWindow: { start: '2026-11-02T14:00:00+00:00', end: '2026-11-02T14:15:00+00:00' },
  automatic: false,
  cancelledBy: null,
  cancelReason: null,
  placedAt: '2026-11-02T13:00:00+00:00',
  updatedAt: '2026-11-02T13:00:00+00:00',
  lines: [
    {
      listingId: 'listing-sourdough-001',
      listingName: 'Country Sourdough',
      modifiers: [{ id: 'mod-seeds', name: 'Seed crust' }],
      quantity: 2,
    },
    { listingId: 'listing-croissant-001', listingName: null, modifiers: [], quantity: 1 },
  ],
  pickupInstructions: 'Ring the side bell',
};

interface Seen {
  url: string;
  authorization: string | undefined;
}
const seen: Seen[] = [];
let mode: 'ok' | 'unauthorized' | 'forbidden' | 'error' | 'missing' | 'more' | 'badstatus' = 'ok';

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
  if (url.pathname === '/ordering/vendor/orders') {
    const status = mode === 'badstatus' ? 'Mystery' : vendorOrder.status;
    return reply(res, 200, {
      items: [{ ...vendorOrder, status }],
      nextCursor: mode === 'more' ? '1730000000000:order-x' : null,
    });
  }
  if (url.pathname === `/ordering/vendor/orders/${vendorOrder.id}`) {
    return mode === 'missing' ? reply(res, 404, { code: 'not_found' }) : reply(res, 200, vendorOrder);
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
const gid = toGlobalId('VendorOrder', vendorOrder.id);

const LIST = `query($status: VendorOrderFilter, $first: Int, $after: String) {
  vendorOrders(status: $status, first: $first, after: $after) {
    edges { cursor node { id reference status total { cents currency } lineCount itemCount automatic placedAt updatedAt
      pickupWindow { start end } pickupInstructions
      lines { listingId listingName quantity modifiers { id name } } } }
    pageInfo { hasNextPage endCursor } } }`;

describe('Query.vendorOrders', () => {
  test('maps the vendor read model, with ids as global ids, names as sent, and the vendor token forwarded to ordering', async () => {
    const { body } = await gql(LIST, {}, auth);

    assert.equal(body.errors, undefined);
    const node = body.data.vendorOrders.edges[0].node;
    assert.equal(node.id, gid);
    assert.equal(node.reference, '3B4C5D');
    assert.equal(node.status, 'PLACED');
    assert.deepEqual(node.total, { cents: 2400, currency: 'USD' });
    assert.equal(node.itemCount, 3);
    assert.deepEqual(node.pickupWindow, { start: '2026-11-02T14:00:00+00:00', end: '2026-11-02T14:15:00+00:00' });
    assert.equal(node.pickupInstructions, 'Ring the side bell');
    assert.equal(node.lines[0].listingId, toGlobalId('Listing', 'listing-sourdough-001'));
    assert.deepEqual(node.lines[0].modifiers, [{ id: 'mod-seeds', name: 'Seed crust' }]);
    assert.equal(node.lines[1].listingName, null); // the id is there even when the name is not
    assert.equal(body.data.vendorOrders.pageInfo.hasNextPage, false);
    assert.equal(seen[0]!.authorization, `Bearer ${TOKEN}`);
  });

  test('sends the status filter, page size and cursor to ordering in its words, and a missing filter means all', async () => {
    await gql(LIST, { status: 'IN_PREPARATION', first: 5, after: '1730000000000:order-x' }, auth);
    await gql(LIST, { status: 'ACTIVE' }, auth);
    await gql(LIST, {}, auth);

    assert.equal(seen[0]!.url, '/ordering/vendor/orders?limit=5&status=InPreparation&after=1730000000000%3Aorder-x');
    assert.equal(seen[1]!.url, '/ordering/vendor/orders?limit=20&status=active');
    assert.equal(seen[2]!.url, '/ordering/vendor/orders?limit=20');
  });

  test('a page larger than the maximum is clamped, and a following page is advertised with its cursor', async () => {
    mode = 'more';

    const { body } = await gql(LIST, { first: 5000 }, auth);

    assert.equal(seen[0]!.url, '/ordering/vendor/orders?limit=50');
    assert.deepEqual(body.data.vendorOrders.pageInfo, { hasNextPage: true, endCursor: '1730000000000:order-x' });
  });

  test('needs a token: without one nothing is asked of ordering', async () => {
    const { body } = await gql(LIST);

    assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });

  test('a token ordering refuses is UNAUTHENTICATED and one whose role is not a vendor is FORBIDDEN', async () => {
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

describe('Query.vendorOrder and node(VendorOrder)', () => {
  test('reads one order by its global id with the vendor token', async () => {
    const { body } = await gql(
      `query($id: ID!) { vendorOrder(id: $id) { id reference status lines { quantity } } }`,
      { id: gid },
      auth,
    );

    assert.equal(body.errors, undefined);
    assert.equal(body.data.vendorOrder.reference, '3B4C5D');
    assert.equal(seen[0]!.url, `/ordering/vendor/orders/${vendorOrder.id}`);
    assert.equal(seen[0]!.authorization, `Bearer ${TOKEN}`);
  });

  test('another vendor order, an unknown one and an id of another type are null', async () => {
    mode = 'missing';
    const missing = await gql(`query($id: ID!) { vendorOrder(id: $id) { id } }`, { id: gid }, auth);
    mode = 'ok';
    const wrongType = await gql(
      `query($id: ID!) { vendorOrder(id: $id) { id } }`,
      { id: toGlobalId('Order', vendorOrder.id) },
      auth,
    );
    const garbage = await gql(`query($id: ID!) { vendorOrder(id: $id) { id } }`, { id: 'not-an-id' }, auth);

    assert.equal(missing.body.data.vendorOrder, null);
    assert.equal(wrongType.body.data.vendorOrder, null);
    assert.equal(garbage.body.data.vendorOrder, null);
    assert.equal(seen.length, 1); // only the first needed ordering
  });

  test('needs a token', async () => {
    const { body } = await gql(`query($id: ID!) { vendorOrder(id: $id) { id } }`, { id: gid });

    assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED');
  });

  test('Relay can refetch it through node()', async () => {
    const { body } = await gql(
      `query($id: ID!) { node(id: $id) { id ... on VendorOrder { reference status } } }`,
      { id: gid },
      auth,
    );

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.node, { id: gid, reference: '3B4C5D', status: 'PLACED' });
  });
});
