// Minimal mock of the GraphQL BFF (real graphql-js execution, canned data), for the browser tests that must not need the real stack.
// Test hooks (non-production only):
//   `x-fixture: A|B`      selects the listing data
//   `x-delay-ms`          delays the response
//   `x-place-order: ...`  scripts placeOrder: `rejected:<CODE>`, `shortfall`, `internal`, `unauthenticated`, `slow` (default: really place it)
//   The one mock customer has two saved payment methods (WI-ORD-010): `pm-ok` (accepted) and `pm-refused` (placeOrder answers PAYMENT_DECLINED, as
//   ordering does for an invalid token). Any other id answers VALIDATION_FAILED on paymentMethodId.
//   POST /__control {"paymentMethods": []} replaces the methods (the "no payment methods" screen); {"resetPaymentMethods": true} restores the two.
//   POST /__control {"revision": n} shifts every price by n cents so refetches are observable.
//   POST /__control {"resetOrders": true, "seedOrders": n} forgets the orders placed so far and adds n completed ones (the order history).
//   POST /__control {"resetPreferences": true, "preferences": {"allergies": [...], "avoid": [...]}} clears or sets the one mock customer's allergen profile.
//   `x-cart-check: fail` makes cartCheck fail with an internal error.
//   `x-save-preferences: fail` makes savePreferences fail with an internal error; `rejected` answers SavePreferencesRejected.
// Like the real BFF, placeOrder and order need a bearer token. Orders are kept in memory and an idempotency key returns the same order.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchema, graphql, GraphQLError } from 'graphql';
import { fixtures, TAGS } from './fixtures.mjs';

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
  tags: l.tags ?? [],
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
const DEFAULT_PAYMENT_METHODS = [
  { id: 'pm-ok', description: 'Test card (accepted)' },
  { id: 'pm-refused', description: 'Test card (refused)' },
];
let paymentMethods = DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }));
// Which saved method the mock treats as having an invalid token. The real rule is ordering's; this stands in for its verdict.
const REFUSED_METHOD_ID = 'pm-refused';
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
    allergens: o.allergens ?? [],
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
  if (!paymentMethods.some((m) => m.id === input.paymentMethodId)) {
    return rejected('VALIDATION_FAILED', [
      { field: 'paymentMethodId', message: 'Choose one of your saved payment methods.' },
    ]);
  }
  if (input.paymentMethodId === REFUSED_METHOD_ID) return rejected('PAYMENT_DECLINED');

  const known = new Set(ALLERGENS.map((a) => a.id));
  if ((input.allergens ?? []).some((id) => !known.has(id))) {
    return rejected('VALIDATION_FAILED', [
      { field: 'allergens[0]', message: 'That is not an allergen the bakery offers.' },
    ]);
  }
  const allergens = [...new Set(input.allergens ?? [])].sort();
  const fingerprint = JSON.stringify([
    input.vendorId,
    input.lineItems,
    input.pickupWindow ?? null,
    allergens,
    input.paymentMethodId,
  ]);
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
    allergens,
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

// The customer's orders, newest first, paged by position (the cursor is the index of the next order). Like the real BFF it needs a bearer token.
function listOrders({ first = 20, after }, ctx) {
  if (!hasBearer(ctx)) throw unauthenticated();
  const all = [...orders.values()].reverse(); // placed later = newer
  const start = after ? Number(after) : 0;
  const page = all.slice(start, start + first);
  const next = start + page.length;
  return {
    edges: page.map((o) => ({ cursor: o.id, node: toOrder(o) })),
    pageInfo: {
      hasNextPage: next < all.length,
      endCursor: next < all.length ? String(next) : (page.at(-1)?.id ?? null),
    },
  };
}

// ---- allergen profile (WI-CUST-005 / WI-CUST-006) ----------------------------------------------------------------------------

const ALLERGENS = [
  ['dairy', 'Milk (dairy)'],
  ['egg', 'Eggs'],
  ['fish', 'Fish'],
  ['shellfish', 'Shellfish'],
  ['tree-nut', 'Tree nuts'],
  ['peanut', 'Peanuts'],
  ['gluten', 'Gluten (wheat, rye, barley)'],
  ['soy', 'Soy'],
  ['sesame', 'Sesame'],
].map(([id, label]) => ({ id, kind: 'ALLERGEN', label }));
let profile = { allergies: [], avoid: [], prefer: [] }; // the one mock customer's profile
let preferenceReads = 0; // how many personalized queries came in, so a test can see the browser did not ask needlessly

const needCustomer = (ctx) => {
  if (!hasBearer(ctx)) throw unauthenticated();
};

// The public registry as the catalog serves it: the allergens, then the other tags that are showing today (WI-TAG-002).
function tags({ kind }) {
  const all = [...ALLERGENS, ...Object.values(TAGS)];
  return kind ? all.filter((t) => t.kind === kind) : all;
}
function listPaymentMethods(_args, ctx) {
  needCustomer(ctx);
  return paymentMethods;
}
function preferences(_args, ctx) {
  needCustomer(ctx);
  return profile;
}
function savePreferences({ input }, ctx) {
  needCustomer(ctx);
  if (ctx.savePreferences === 'fail') {
    throw new GraphQLError('Something went wrong. Please try again.', {
      extensions: { code: 'INTERNAL', reference: '0123456789abcdef0123456789abcdef' },
    });
  }
  const known = new Set(ALLERGENS.map((a) => a.id));
  const all = [...input.allergies, ...input.avoid];
  if (ctx.savePreferences === 'rejected' || all.some((id) => !known.has(id)) || new Set(all).size !== all.length) {
    return {
      __typename: 'SavePreferencesRejected',
      message: 'Your allergen choices could not be saved as entered.',
      fields: [{ field: 'allergies', message: 'Choose each allergen only once.' }],
    };
  }
  // Diets (WI-TAG-004): optional; left out, the stored list stays. Only diet tags the registry shows may be preferred.
  const dietIds = Object.values(TAGS)
    .filter((t) => t.kind === 'DIET')
    .map((t) => t.id);
  if (input.prefer && input.prefer.some((id) => !dietIds.includes(id))) {
    return {
      __typename: 'SavePreferencesRejected',
      message: 'Your diet choices could not be saved as entered.',
      fields: [{ field: 'prefer', message: 'That is not a diet in the list.' }],
    };
  }
  profile = {
    allergies: [...input.allergies],
    avoid: [...input.avoid],
    prefer: input.prefer ? [...input.prefer] : profile.prefer,
  };
  return { __typename: 'SavePreferencesSuccess', preferences: profile };
}

// The conflicts of one listing, as the real catalog reports them: the item's own flags, and separately every option that brings in an allergen
// of the profile, even one the item already carries (allergy before avoid).
function conflictsOf(l) {
  const severityOf = (id) => (profile.allergies.includes(id) ? 'ALLERGY' : profile.avoid.includes(id) ? 'AVOID' : null);
  const out = [];
  for (const id of l.allergenFlags) {
    const severity = severityOf(id);
    if (severity) out.push({ allergenId: id, severity, source: 'ITEM', optionIds: [] });
  }
  const byAllergen = new Map();
  for (const m of l.modifiers)
    for (const id of m.allergens) if (severityOf(id)) byAllergen.set(id, [...(byAllergen.get(id) ?? []), m.id]);
  for (const [id, optionIds] of byAllergen)
    out.push({ allergenId: id, severity: severityOf(id), source: 'OPTION', optionIds });
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'ALLERGY' ? -1 : 1));
}

// How a listing stands against the diets the customer prefers (WI-TAG-004): marked only if the item and every chosen option carry the tag. With no options
// chosen (browse, detail) it is marked when the item is, and every option without the tag is named.
function dietMatchesOf(l, chosen = null) {
  return (profile.prefer ?? []).map((tagId) => {
    const itemMarked = (l.tags ?? []).some((t) => t.id === tagId);
    const notMarked = l.modifiers
      .filter((m) => chosen === null || chosen.has(m.id))
      .filter((m) => !(m.tags ?? []).some((t) => t.id === tagId))
      .map((m) => m.id);
    return {
      tagId,
      marked: itemMarked && (chosen === null || notMarked.length === 0),
      itemMarked,
      optionIdsNotMarked: notMarked,
    };
  });
}

// The cart check, as the real BFF answers it: for each line the conflicts of the item and of the options chosen on that line, and only those.
function cartCheck({ lines }, ctx) {
  needCustomer(ctx);
  if (ctx.cartCheck === 'fail') {
    throw new GraphQLError('Something went wrong. Please try again.', {
      extensions: { code: 'INTERNAL', reference: '0123456789abcdef0123456789abcdef' },
    });
  }
  preferenceReads++;
  return lines.map((line) => {
    const listing = data(ctx.fixture).find((l) => l.id === line.listingId);
    if (!listing)
      return { listingId: line.listingId, found: false, unknownOptionIds: [], conflicts: [], dietMatches: [] };
    const chosen = new Set(line.optionIds);
    const conflicts = conflictsOf(listing)
      .map((c) => (c.source === 'OPTION' ? { ...c, optionIds: c.optionIds.filter((id) => chosen.has(id)) } : c))
      .filter((c) => c.source !== 'OPTION' || c.optionIds.length > 0);
    const unknownOptionIds = line.optionIds.filter((id) => !listing.modifiers.some((m) => m.id === id));
    return {
      listingId: line.listingId,
      found: true,
      unknownOptionIds,
      conflicts,
      dietMatches: dietMatchesOf(listing, chosen),
    };
  });
}

function personalizedListings({ hideConflicts }, ctx) {
  needCustomer(ctx);
  preferenceReads++;
  const items = data(ctx.fixture)
    .map((listing) => ({ listing, conflicts: conflictsOf(listing), dietMatches: dietMatchesOf(listing) }))
    .filter((p) => !(hideConflicts && p.conflicts.some((c) => c.source === 'ITEM')));
  return {
    edges: items.map((node) => ({ cursor: node.listing.id, node })),
    pageInfo: { hasNextPage: false, endCursor: items.at(-1)?.listing.id ?? null },
  };
}
function personalizedListing({ id }, ctx) {
  needCustomer(ctx);
  preferenceReads++;
  const listing = data(ctx.fixture).find((l) => l.id === id);
  return listing ? { listing, conflicts: conflictsOf(listing), dietMatches: dietMatchesOf(listing) } : null;
}

function rootFor(fixture) {
  return {
    listings: ({ tags: wanted }) => {
      // WI-TAG-003: only the tags the registry shows (and never an allergen) may filter; one answer for any other id, as the real BFF gives.
      const ids = wanted ?? [];
      if (ids.length > 10 || ids.some((id) => !TAGS[id])) {
        throw new GraphQLError('One of those tags cannot be used to filter the listings.', {
          extensions: { code: 'BAD_INPUT' },
        });
      }
      const edges = data(fixture)
        .filter((l) => ids.every((id) => (l.tags ?? []).some((t) => t.id === id)))
        .map((node) => ({ cursor: node.id, node }));
      return { edges, pageInfo: { hasNextPage: false, endCursor: edges.at(-1)?.cursor ?? null } };
    },
    listing: ({ id }) => data(fixture).find((l) => l.id === id) ?? null,
    node: (args, ctx) =>
      serviceId('Order', args.id) !== null
        ? readOrder(args, ctx)
        : (data(fixture).find((l) => l.id === args.id) ?? null),
    pickupWindows: () => WINDOWS,
    tags,
    preferences,
    paymentMethods: listPaymentMethods,
    savePreferences,
    personalizedListings,
    personalizedListing,
    cartCheck,
    order: readOrder,
    orders: listOrders,
    placeOrder,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const seenAuthorizations = [];

const server = http.createServer(async (req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');

  if (req.url === '/__control' && req.method === 'POST') {
    const control = JSON.parse(raw || '{}');
    revision = Number(control.revision ?? 0);
    if (control.resetOrders) {
      orders.clear();
      keys.clear();
    }
    // seedOrders: n adds n completed orders (oldest first), so a test can see paging and the empty history.
    for (let i = 0; i < Number(control.seedOrders ?? 0); i++) {
      const id = `order-mock-seed-${++orderSeq}`;
      orders.set(id, {
        id,
        vendorId: 'vendor-shop-001',
        lineItems: [{ listingId: globalId('Listing', 'listing-1'), modifierIds: [], quantity: 1, price: money(800) }],
        totalCents: 800,
        pickupWindow: null,
        status: 'COMPLETED',
        createdAt: new Date(Date.UTC(2026, 0, 1, 12, i)).toISOString(),
      });
    }
    if (control.resetPaymentMethods) paymentMethods = DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }));
    if (Array.isArray(control.paymentMethods)) paymentMethods = control.paymentMethods.map((m) => ({ ...m }));
    if (control.resetPreferences) {
      profile = { allergies: [], avoid: [], prefer: [] };
      preferenceReads = 0;
    }
    if (control.preferences)
      profile = {
        allergies: [...(control.preferences.allergies ?? [])],
        avoid: [...(control.preferences.avoid ?? [])],
        prefer: [...(control.preferences.prefer ?? [])],
      };
    return send(200, { revision, orders: orders.size, preferenceReads });
  }
  // What the BFF was sent as Authorization, in order, so a test can see what the web app's server put on the call (ADR-0019).
  if (req.url === '/__seen' && req.method === 'GET') return send(200, { authorizations: seenAuthorizations });
  if (req.url === '/__seen' && req.method === 'DELETE') {
    seenAuthorizations.length = 0;
    return send(200, { ok: true });
  }
  if (req.url === '/__reads' && req.method === 'GET') return send(200, { preferenceReads });
  if (req.url === '/healthz') return send(200, { ok: true });
  if (req.url !== '/graphql' || req.method !== 'POST') return send(404, { error: 'not found' });

  const delay = Number(req.headers['x-delay-ms'] ?? 0);
  if (delay > 0) await sleep(Math.min(delay, 2000));
  const { query, variables } = JSON.parse(raw);
  seenAuthorizations.push(req.headers.authorization ?? null);
  const fixture = String(req.headers['x-fixture'] ?? 'A').toUpperCase();
  const result = await graphql({
    schema,
    source: query,
    variableValues: variables,
    rootValue: rootFor(fixture),
    contextValue: {
      fixture,
      authorization: req.headers.authorization,
      scenario: req.headers['x-place-order'] ? String(req.headers['x-place-order']) : undefined,
      cartCheck: req.headers['x-cart-check'] ? String(req.headers['x-cart-check']) : undefined,
      savePreferences: req.headers['x-save-preferences'] ? String(req.headers['x-save-preferences']) : undefined,
    },
    typeResolver: (value) => value.__typename,
  });
  send(200, result);
});

const port = Number(process.env.MOCK_PORT ?? 4000);
server.listen(port, () => console.log(`mock GraphQL on http://localhost:${port}/graphql`));
