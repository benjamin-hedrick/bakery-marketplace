// Minimal mock of the GraphQL BFF (real graphql-js execution, canned data), for the browser tests that must not need the real stack.
// Test hooks (non-production only):
//   `x-fixture: A|B`      selects the listing data
//   `x-delay-ms`          delays the response
//   `x-place-order: ...`  scripts placeOrder: `rejected:<CODE>`, `shortfall`, `internal`, `unauthenticated`, `slow` (default: really place it)
//   `x-test-payment: decline`  the D-10 hook, as the real BFF forwards it
//   POST /__control {"revision": n} shifts every price by n cents so refetches are observable.
// Like the real BFF, placeOrder and order need a bearer token. Orders are kept in memory and an idempotency key returns the same order.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchema, graphql, GraphQLError } from 'graphql';
import { fixtures } from './fixtures.mjs';

const schema = buildSchema(
  readFileSync(fileURLToPath(new URL('../../../services/graphql-bff/schema/schema.graphql', import.meta.url)), 'utf8'),
);
let revision = 0;

const money = (cents) => ({ cents, currency: 'USD' });
// D-9: Relay global ids, as the real BFF produces them.
const globalId = (type, serviceId) => Buffer.from(`${type}:${serviceId}`).toString('base64');
const serviceId = (type, id) => {
  const text = Buffer.from(String(id), 'base64').toString('utf8');
  return text.startsWith(`${type}:`) ? text.slice(type.length + 1) : null;
};
const shape = (l) => ({
  ...l,
  id: globalId('Listing', l.id),
  price: money(l.priceCents + revision),
  modifiers: l.modifiers.map((m) => ({ ...m, priceDelta: money(m.priceDeltaCents) })),
});
const data = (fixture) => (fixtures[fixture] ?? fixtures.A).map(shape);

// ---- orders (S1-01 / S1-03) -------------------------------------------------------------------------------------------------

// A fixed, far-future set of windows, so a browser test can name a slot (shown in the browser's own time zone).
const WINDOWS = [
  ['2030-01-15T14:00:00+00:00', '2030-01-15T14:15:00+00:00'],
  ['2030-01-15T14:15:00+00:00', '2030-01-15T14:30:00+00:00'],
  ['2030-01-15T14:30:00+00:00', '2030-01-15T14:45:00+00:00'],
  ['2030-01-16T14:00:00+00:00', '2030-01-16T14:15:00+00:00'],
].map(([start, end]) => ({ start, end }));

const REJECTION_TEXT = {
  LISTING_UNAVAILABLE: 'An item is no longer available.',
  INVALID_MODIFIER: 'An option is not available for that item.',
  INVALID_QUANTITY: 'A quantity is outside what can be ordered.',
  INSUFFICIENT_STOCK: 'There is not enough stock for part of this order.',
  PICKUP_WINDOW_UNAVAILABLE: 'That pickup time is no longer available. Choose another.',
  PAYMENT_DECLINED: 'The payment was declined.',
  VALIDATION_FAILED: 'The order could not be placed as entered.',
  CONFLICT: 'The stock changed while placing the order. Please try again.',
};

const orders = new Map(); // service id -> order
const keys = new Map(); // idempotency key -> { fingerprint, orderId }
let orderSeq = 0;

const unauthenticated = () =>
  new GraphQLError('Please log in to continue.', { extensions: { code: 'UNAUTHENTICATED' } });
const hasBearer = (ctx) => /^Bearer \S+$/i.test(ctx.authorization ?? '');
const rejected = (code, fields = [], shortfalls = []) => ({
  __typename: 'PlaceOrderRejected',
  code,
  message: REJECTION_TEXT[code] ?? 'The order could not be placed.',
  fields,
  shortfalls,
});

function toOrder(o) {
  return {
    __typename: 'Order',
    id: globalId('Order', o.id),
    status: o.status,
    vendorId: o.vendorId,
    lineItems: o.lineItems,
    total: money(o.totalCents),
    pickupWindow: o.pickupWindow,
    createdAt: o.createdAt,
  };
}

async function placeOrder({ input }, ctx) {
  if (!hasBearer(ctx) || ctx.scenario === 'unauthenticated') throw unauthenticated();
  if (ctx.scenario === 'internal') {
    throw new GraphQLError('Something went wrong. Please try again.', {
      extensions: { code: 'INTERNAL', reference: '0123456789abcdef0123456789abcdef' },
    });
  }
  if (ctx.scenario === 'slow') await new Promise((r) => setTimeout(r, 1500));
  if (ctx.scenario?.startsWith('rejected:')) {
    const code = ctx.scenario.slice('rejected:'.length);
    const fields =
      code === 'INVALID_QUANTITY'
        ? [{ field: 'lineItems[0].quantity', message: 'Quantity must be between 1 and 4.' }]
        : [];
    return rejected(code, fields);
  }
  if (ctx.scenario === 'shortfall') {
    return rejected('INSUFFICIENT_STOCK', [], [{ listingId: input.lineItems[0].listingId, available: 1 }]);
  }
  if (ctx.testPayment === 'decline') return rejected('PAYMENT_DECLINED');

  const fingerprint = JSON.stringify([input.vendorId, input.lineItems, input.pickupWindow ?? null]);
  const prior = keys.get(input.idempotencyKey);
  if (prior) {
    return prior.fingerprint === fingerprint
      ? { __typename: 'PlaceOrderSuccess', order: toOrder(orders.get(prior.orderId)) }
      : rejected('VALIDATION_FAILED');
  }

  const listings = data(ctx.fixture);
  const lineItems = [];
  let totalCents = 0;
  for (const line of input.lineItems) {
    const listing = listings.find((l) => l.id === line.listingId);
    if (!listing) return rejected('LISTING_UNAVAILABLE');
    const deltas = line.modifierIds.map((id) => listing.modifiers.find((m) => m.id === id)?.priceDeltaCents);
    if (deltas.includes(undefined)) return rejected('INVALID_MODIFIER');
    const price = (listing.priceCents + revision + deltas.reduce((a, b) => a + b, 0)) * line.quantity;
    totalCents += price;
    lineItems.push({
      listingId: line.listingId,
      modifierIds: line.modifierIds,
      quantity: line.quantity,
      price: money(price),
    });
  }

  const order = {
    id: `order-mock-${++orderSeq}`,
    vendorId: input.vendorId,
    lineItems,
    totalCents,
    pickupWindow: input.pickupWindow ?? null,
    // Mirrors WI-ORD-008 so a test can show both states without a vendor; the real-stack journey test checks the real rule.
    status: input.pickupWindow || input.lineItems.some((l) => l.modifierIds.length > 0) ? 'PLACED' : 'CONFIRMED',
    createdAt: new Date().toISOString(),
  };
  orders.set(order.id, order);
  keys.set(input.idempotencyKey, { fingerprint, orderId: order.id });
  return { __typename: 'PlaceOrderSuccess', order: toOrder(order) };
}

function readOrder({ id }, ctx) {
  if (!hasBearer(ctx)) throw unauthenticated();
  const found = orders.get(serviceId('Order', id) ?? '');
  return found ? toOrder(found) : null;
}

function rootFor(fixture) {
  return {
    listings: () => {
      const edges = data(fixture).map((node) => ({ cursor: node.id, node }));
      return { edges, pageInfo: { hasNextPage: false, endCursor: edges.at(-1)?.cursor ?? null } };
    },
    listing: ({ id }) => data(fixture).find((l) => l.id === id) ?? null,
    node: (args, ctx) =>
      serviceId('Order', args.id) !== null
        ? readOrder(args, ctx)
        : (data(fixture).find((l) => l.id === args.id) ?? null),
    pickupWindows: () => WINDOWS,
    order: readOrder,
    placeOrder,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer(async (req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');

  if (req.url === '/__control' && req.method === 'POST') {
    revision = Number(JSON.parse(raw || '{}').revision ?? 0);
    return send(200, { revision });
  }
  if (req.url === '/healthz') return send(200, { ok: true });
  if (req.url !== '/graphql' || req.method !== 'POST') return send(404, { error: 'not found' });

  const delay = Number(req.headers['x-delay-ms'] ?? 0);
  if (delay > 0) await sleep(Math.min(delay, 2000));
  const { query, variables } = JSON.parse(raw);
  const fixture = String(req.headers['x-fixture'] ?? 'A').toUpperCase();
  const decline = String(req.headers['x-test-payment'] ?? '').toLowerCase() === 'decline';
  const result = await graphql({
    schema,
    source: query,
    variableValues: variables,
    rootValue: rootFor(fixture),
    contextValue: {
      fixture,
      authorization: req.headers.authorization,
      scenario: req.headers['x-place-order'] ? String(req.headers['x-place-order']) : undefined,
      testPayment: decline ? 'decline' : undefined,
    },
    typeResolver: (value) => value.__typename,
  });
  send(200, result);
});

const port = Number(process.env.MOCK_PORT ?? 4000);
server.listen(port, () => console.log(`mock GraphQL on http://localhost:${port}/graphql`));
