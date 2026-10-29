import type { CatalogClient, CatalogListing } from './catalog-client.ts';
import { DownstreamError, forbidden, unauthenticated } from './errors.ts';
import { fromGlobalId, serviceIdFor, toGlobalId } from './global-id.ts';
import type { OrderingClient, OrderingOrder } from './ordering-client.ts';
import type { TraceContext } from './trace.ts';

export interface Context {
  catalog: CatalogClient;
  ordering: OrderingClient;
  trace: TraceContext;
  /** The caller's `Authorization: Bearer ...` header, only when it has that shape. Forwarded to ordering-service and nowhere else. */
  authorization?: string | undefined;
  /** The D-10 test hook, set only when the BFF has test hooks enabled and the caller asked for exactly `decline`. */
  testPayment?: 'decline' | undefined;
}

const MAX_PAGE = 50;
const money = (cents: number, currency = 'USD') => ({ cents, currency });

// Mapping only (ADR-0013): field renames and shape changes. No pricing, availability or visibility rules live here.

/** A value the service sent that the schema has no name for is a contract violation: an internal error, never a guess. */
function enumValue(kind: string, table: Record<string, string>, wire: string): string {
  const mapped = table[wire];
  if (mapped === undefined) throw new DownstreamError(`unknown ${kind} from a service`);
  return mapped;
}
const STOCK_STATUS = { inStock: 'IN_STOCK', low: 'LOW', soldOut: 'SOLD_OUT' };
const ORDER_STATUS = {
  Pending: 'PENDING',
  Placed: 'PLACED',
  Confirmed: 'CONFIRMED',
  InPreparation: 'IN_PREPARATION',
  ReadyForFulfillment: 'READY_FOR_FULFILLMENT',
  Completed: 'COMPLETED',
  Cancelled: 'CANCELLED',
};

const toListing = (l: CatalogListing) => ({
  __typename: 'Listing',
  id: toGlobalId('Listing', l.id),
  vendorId: l.vendorId,
  name: l.name,
  description: l.description,
  category: l.category,
  price: money(l.priceCents, l.currency),
  modifiers: l.modifiers.map((m) => ({
    id: m.id,
    name: m.name,
    priceDelta: money(m.priceDeltaCents, l.currency),
    allergens: m.allergens,
  })),
  allergenFlags: l.allergenFlags,
  // A function, so a bad stock block only fails the query that asks for it.
  stock: () => ({
    status: enumValue('stock status', STOCK_STATUS, l.stock?.status ?? ''),
    maxPerOrder: l.stock.maxPerOrder,
  }),
});

const toOrder = (o: OrderingOrder) => ({
  __typename: 'Order',
  id: toGlobalId('Order', o.id),
  status: () => enumValue('order status', ORDER_STATUS, o.status),
  vendorId: o.vendorId,
  lineItems: o.lineItems.map((l) => ({
    listingId: toGlobalId('Listing', l.listingId),
    modifierIds: l.modifiers,
    quantity: l.quantity,
    price: money(l.priceCents, o.currency),
  })),
  total: money(o.totalCents, o.currency),
  pickupWindow: o.pickupWindow ? { start: o.pickupWindow.start, end: o.pickupWindow.end } : null,
  createdAt: o.createdAt,
});

/** The caller's own order. A 401 from ordering means the token was not accepted; a 403 means its role may not read orders. */
async function readOrder(serviceId: string, ctx: Context) {
  if (!ctx.authorization) throw unauthenticated();
  try {
    const o = await ctx.ordering.getOrder(serviceId, ctx.authorization, ctx.trace);
    return o ? toOrder(o) : null;
  } catch (e) {
    if (e instanceof DownstreamError && e.status === 401) throw unauthenticated();
    if (e instanceof DownstreamError && e.status === 403) throw forbidden();
    throw e;
  }
}

// ---- placeOrder -------------------------------------------------------------------------------------------------------------

interface PlaceOrderInput {
  idempotencyKey: string;
  vendorId: string;
  lineItems: { listingId: string; modifierIds: string[]; quantity: number }[];
  pickupWindow?: { start: string; end: string } | null;
}

// Expected failures, by the error code ordering-service returns. The client sees the BFF's own fixed text, never ordering's (first-slice
// contract section 6). A code that is not here is a contract violation: an internal error, not a guess.
const REJECTIONS: Record<string, { code: string; message: string }> = {
  invalid_quantity: { code: 'INVALID_QUANTITY', message: 'A quantity is outside what can be ordered.' },
  invalid_modifier: { code: 'INVALID_MODIFIER', message: 'An option is not available for that item.' },
  validation_failed: { code: 'VALIDATION_FAILED', message: 'The order could not be placed as entered.' },
  idempotency_key_reuse: {
    code: 'VALIDATION_FAILED',
    message: 'That checkout was already used for a different order. Start again.',
  },
  listing_unavailable: { code: 'LISTING_UNAVAILABLE', message: 'An item is no longer available.' },
  insufficient_stock: { code: 'INSUFFICIENT_STOCK', message: 'There is not enough stock for part of this order.' },
  pickup_window_unavailable: {
    code: 'PICKUP_WINDOW_UNAVAILABLE',
    message: 'That pickup time is no longer available. Choose another.',
  },
  conflict: { code: 'CONFLICT', message: 'The stock changed while placing the order. Please try again.' },
  payment_declined: { code: 'PAYMENT_DECLINED', message: 'The payment was declined.' },
};
const MAX_FIELD_PROBLEMS = 20;

const rejected = (
  code: string,
  message: string,
  fields: { field: string; message: string }[] = [],
  shortfalls: unknown[] = [],
) => ({
  __typename: 'PlaceOrderRejected',
  code,
  message,
  fields,
  shortfalls,
});

/** Field problems from ordering's error body, which is written to be shown but is shortened and capped here. */
function fieldProblems(errors: Record<string, string[]> | null | undefined) {
  return Object.entries(errors ?? {})
    .flatMap(([field, messages]) =>
      messages.map((message) => ({ field: field.slice(0, 100), message: message.slice(0, 200) })),
    )
    .slice(0, MAX_FIELD_PROBLEMS);
}

async function placeOrder(args: { input: PlaceOrderInput }, ctx: Context) {
  if (!ctx.authorization) throw unauthenticated();
  const { input } = args;

  // Listing global ids are decoded here (D-9). One that does not decode is the caller's mistake, found before anything is sent.
  const problems: { field: string; message: string }[] = [];
  const lineItems = input.lineItems.map((l, i) => {
    const listingId = serviceIdFor('Listing', l.listingId);
    if (listingId === null) problems.push({ field: `lineItems[${i}].listingId`, message: 'That is not a valid item.' });
    return { listingId: listingId ?? '', modifierIds: l.modifierIds, quantity: l.quantity };
  });
  if (problems.length > 0) return rejected('VALIDATION_FAILED', 'The order could not be placed as entered.', problems);

  const result = await ctx.ordering.placeOrder(
    {
      vendorId: input.vendorId,
      lineItems,
      pickupWindow: input.pickupWindow ? { start: input.pickupWindow.start, end: input.pickupWindow.end } : null,
    },
    ctx.authorization,
    input.idempotencyKey,
    ctx.trace,
    ctx.testPayment,
  );

  if (result.kind === 'order') return { __typename: 'PlaceOrderSuccess', order: toOrder(result.order) };

  if (result.status === 401) throw unauthenticated();
  if (result.status === 403) throw forbidden();
  const mapped = REJECTIONS[result.error.code];
  if (mapped === undefined) throw new DownstreamError('unknown checkout error code from ordering', result.status);
  const shortfalls = (result.error.lines ?? [])
    .filter((l) => l.reason === 'insufficient_stock' && typeof l.available === 'number')
    .map((l) => ({ listingId: toGlobalId('Listing', l.listingId), available: l.available }));
  return rejected(mapped.code, mapped.message, fieldProblems(result.error.errors), shortfalls);
}

export const rootValue = {
  placeOrder,
  async listings(args: { first?: number; after?: string | null }, ctx: Context) {
    const first = Math.min(Math.max(args.first ?? 20, 1), MAX_PAGE);
    const page = await ctx.catalog.list({ limit: first, after: args.after ?? undefined }, ctx.trace);
    const edges = page.items.map((l) => ({ cursor: l.id, node: toListing(l) }));
    return {
      edges,
      pageInfo: { hasNextPage: page.nextCursor != null, endCursor: page.nextCursor ?? edges.at(-1)?.cursor ?? null },
    };
  },
  async listing(args: { id: string }, ctx: Context) {
    const serviceId = serviceIdFor('Listing', args.id);
    if (serviceId === null) return null;
    const l = await ctx.catalog.get(serviceId, ctx.trace);
    return l ? toListing(l) : null;
  },
  async pickupWindows(args: { vendorId: string }, ctx: Context) {
    // Public data: the caller's token is deliberately not sent.
    const windows = await ctx.ordering.pickupWindows(args.vendorId, ctx.trace);
    return windows.map((w) => ({ start: w.start, end: w.end }));
  },
  async order(args: { id: string }, ctx: Context) {
    const serviceId = serviceIdFor('Order', args.id);
    if (serviceId === null) return null;
    return readOrder(serviceId, ctx);
  },
  // Listing and Order implement Node. An id of another type, or one that does not decode, is null.
  async node(args: { id: string }, ctx: Context) {
    const decoded = fromGlobalId(args.id);
    if (decoded?.type === 'Listing') {
      const l = await ctx.catalog.get(decoded.serviceId, ctx.trace);
      return l ? toListing(l) : null;
    }
    if (decoded?.type === 'Order') return readOrder(decoded.serviceId, ctx);
    return null;
  },
};
