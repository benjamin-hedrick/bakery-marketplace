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
    listingId: l.listingId,
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

export const rootValue = {
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
