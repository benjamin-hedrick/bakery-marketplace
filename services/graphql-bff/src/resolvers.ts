import type {
  CatalogCartLineCheck,
  CatalogClient,
  CatalogConflict,
  CatalogDietMatch,
  CatalogListing,
  CatalogTag,
  CatalogPersonalizedListing,
} from './catalog-client.ts';
import { ClientError, DownstreamError, forbidden, unauthenticated } from './errors.ts';
import { fromGlobalId, serviceIdFor, toGlobalId } from './global-id.ts';
import type { OrderActionName, OrderingClient, OrderingOrder, OrderingVendorOrder } from './ordering-client.ts';
import type { TraceContext } from './trace.ts';

export interface Context {
  catalog: CatalogClient;
  ordering: OrderingClient;
  trace: TraceContext;
  /** The caller's `Authorization: Bearer ...` header, only when it has that shape. Forwarded to ordering-service and nowhere else. */
  authorization?: string | undefined;
  /**
   * Aborted when the caller's connection closes. A subscription ties its connection to ordering-service to it, because returning an async
   * generator that is waiting for the next event is queued behind that wait and would not close the stream until the next event or silence limit.
   */
  signal?: AbortSignal | undefined;
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

const toTags = (tags: CatalogTag[] | undefined) =>
  (tags ?? []).map((t) => ({ id: t.id, kind: t.kind.toUpperCase(), label: t.label }));

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
    tags: toTags(m.tags),
  })),
  allergenFlags: l.allergenFlags,
  tags: toTags(l.tags),
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
  allergens: o.allergens ?? [],
  createdAt: o.createdAt,
});

const toVendorOrder = (o: OrderingVendorOrder) => ({
  __typename: 'VendorOrder',
  id: toGlobalId('VendorOrder', o.id),
  reference: o.reference,
  status: () => enumValue('order status', ORDER_STATUS, o.status),
  total: o.totalCents === null ? null : money(o.totalCents, o.currency ?? 'USD'),
  lineCount: o.lineCount,
  itemCount: o.itemCount,
  lines: o.lines.map((l) => ({
    listingId: toGlobalId('Listing', l.listingId),
    listingName: l.listingName,
    modifiers: l.modifiers.map((m) => ({ id: m.id, name: m.name })),
    quantity: l.quantity,
  })),
  pickupWindow: o.pickupWindow ? { start: o.pickupWindow.start, end: o.pickupWindow.end } : null,
  pickupInstructions: o.pickupInstructions,
  allergens: o.allergens ?? [],
  automatic: o.automatic,
  placedAt: o.placedAt,
  updatedAt: o.updatedAt,
  sequence: o.lastSequence,
});

/** The ordering status names a vendor may filter by, in the schema's words. */
const VENDOR_ORDER_FILTER: Record<string, string> = {
  ACTIVE: 'active',
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed',
  IN_PREPARATION: 'InPreparation',
  READY_FOR_FULFILLMENT: 'ReadyForFulfillment',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** A vendor's orders. A 401 from ordering means the token was not accepted; a 403 means its role is not a vendor's. */
async function vendorCall<T>(ctx: Context, call: (authorization: string) => Promise<T>): Promise<T> {
  if (!ctx.authorization) throw unauthenticated();
  try {
    return await call(ctx.authorization);
  } catch (e) {
    if (e instanceof DownstreamError && e.status === 401) throw unauthenticated();
    if (e instanceof DownstreamError && e.status === 403) throw forbidden();
    throw e;
  }
}

/**
 * A customer's own data. The token goes to ordering unchanged, which decides the role and whose data it is. A 401 from ordering means the token
 * was not accepted; a 403 means its role is not a customer's.
 */
const customerCall = vendorCall;

/** The caller's own order. */
async function readOrder(serviceId: string, ctx: Context) {
  const o = await customerCall(ctx, (authorization) => ctx.ordering.getOrder(serviceId, authorization, ctx.trace));
  return o ? toOrder(o) : null;
}

async function readVendorOrder(serviceId: string, ctx: Context) {
  const o = await vendorCall(ctx, (authorization) => ctx.ordering.getVendorOrder(serviceId, authorization, ctx.trace));
  return o ? toVendorOrder(o) : null;
}

/**
 * The root of a subscription operation (ADR-0021). The resolver opens the vendor's stream with ordering, so a refusal is an error of the
 * operation before any event; each event is then the changed order, shaped by the same mapping as the vendor queries. Returning the iterator
 * (or the client leaving) closes the connection to ordering.
 */
export const subscriptionRoot = {
  async vendorOrderChanged(_args: unknown, ctx: Context) {
    const events = await vendorCall(ctx, (authorization) =>
      ctx.ordering.openVendorOrderStream(authorization, ctx.trace, ctx.signal),
    );
    return (async function* () {
      for await (const order of events) yield { vendorOrderChanged: toVendorOrder(order) };
    })();
  },
};

// ---- placeOrder -------------------------------------------------------------------------------------------------------------

interface PlaceOrderInput {
  idempotencyKey: string;
  vendorId: string;
  lineItems: { listingId: string; modifierIds: string[]; quantity: number }[];
  pickupWindow?: { start: string; end: string } | null;
  allergens?: string[] | null;
  /** The id of one of the caller's saved payment methods (WI-ORD-010). Only the id crosses: the token stays in ordering-service. */
  paymentMethodId: string;
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
      paymentMethodId: input.paymentMethodId,
      lineItems,
      pickupWindow: input.pickupWindow ? { start: input.pickupWindow.start, end: input.pickupWindow.end } : null,
      // Passed through as the customer sent them: ordering-service checks them against the registry (WI-ORD-009). Omitted when none, so the body is as before.
      ...(input.allergens && input.allergens.length > 0 ? { allergens: input.allergens } : {}),
    },
    ctx.authorization,
    input.idempotencyKey,
    ctx.trace,
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

const VENDOR_ACTIONS: Record<string, OrderActionName> = {
  CONFIRM: 'confirm',
  DECLINE: 'decline',
  START_PREPARATION: 'start-preparation',
  MARK_READY: 'ready',
  COMPLETE: 'complete',
};

const actionRejected = (
  code: 'NOT_FOUND' | 'NOT_ALLOWED_NOW',
  message: string,
  currentStatus: string | null = null,
) => ({
  __typename: 'VendorOrderActionRejected',
  code,
  message,
  currentStatus,
});

/**
 * A vendor's action on one of their orders (WI-QUE-004). Mapping only: the enum becomes ordering's path, the caller's token goes through, and
 * ordering decides the role, the ownership and whether the order's status allows the action (ADR-0006, ADR-0013). Its text never reaches the client.
 */
async function vendorOrderAction(args: { input: { orderId: string; action: string } }, ctx: Context) {
  if (!ctx.authorization) throw unauthenticated();
  const action = VENDOR_ACTIONS[args.input.action];
  if (action === undefined) throw new DownstreamError('unknown vendor action'); // the schema's enum makes this unreachable
  const serviceId = serviceIdFor('VendorOrder', args.input.orderId);
  if (serviceId === null) return actionRejected('NOT_FOUND', 'That order could not be found.');

  const result = await vendorCall(ctx, (authorization) =>
    ctx.ordering.orderAction(serviceId, action, authorization, ctx.trace),
  );
  if (result.kind === 'done') {
    return {
      __typename: 'VendorOrderActionDone',
      orderId: args.input.orderId,
      status: enumValue('order status', ORDER_STATUS, result.order.status),
    };
  }
  if (result.kind === 'not_found') return actionRejected('NOT_FOUND', 'That order could not be found.');
  const current =
    result.currentStatus === null ? null : ORDER_STATUS[result.currentStatus as keyof typeof ORDER_STATUS];
  return actionRejected('NOT_ALLOWED_NOW', 'That cannot be done to this order now. It has changed.', current ?? null);
}

const toPreferences = (p: { allergies: string[]; avoid: string[]; prefer?: string[] }) => ({
  allergies: p.allergies,
  avoid: p.avoid,
  prefer: p.prefer ?? [],
});

const toDietMatches = (matches: CatalogDietMatch[] | undefined) =>
  (matches ?? []).map((m) => ({
    tagId: m.tagId,
    marked: m.marked,
    itemMarked: m.itemMarked,
    optionIdsNotMarked: m.optionIdsNotMarked,
  }));

/** The profile is quasi-health data: it is passed through and never logged, and a refusal's text is the BFF's own. */
async function savePreferences(
  args: { input: { allergies: string[]; avoid: string[]; prefer?: string[] | null } },
  ctx: Context,
) {
  const result = await customerCall(ctx, (authorization) =>
    ctx.catalog.savePreferences(
      {
        allergies: args.input.allergies,
        avoid: args.input.avoid,
        // Left out when not given, so the catalog keeps the stored list (a client that does not know about diets cannot clear it).
        ...(args.input.prefer ? { prefer: args.input.prefer } : {}),
      },
      authorization,
      ctx.trace,
    ),
  );
  if (result.kind === 'saved') {
    return { __typename: 'SavePreferencesSuccess', preferences: toPreferences(result.preferences) };
  }
  return {
    __typename: 'SavePreferencesRejected',
    message: 'Your allergies could not be saved as entered.',
    fields: fieldProblems(result.errors),
  };
}

const CONFLICT_SEVERITY = { allergy: 'ALLERGY', avoid: 'AVOID' };
const CONFLICT_SOURCE = { item: 'ITEM', option: 'OPTION' };

/** A conflict as the catalog decided it, in the schema's words. An unknown severity or source is a contract violation, never guessed. */
const toConflicts = (conflicts: CatalogConflict[]) =>
  conflicts.map((c) => ({
    allergenId: c.allergenId,
    severity: enumValue('conflict severity', CONFLICT_SEVERITY, c.severity),
    source: enumValue('conflict source', CONFLICT_SOURCE, c.source),
    optionIds: c.optionIds,
  }));

const toPersonalized = (p: CatalogPersonalizedListing) => ({
  listing: toListing(p.listing),
  conflicts: toConflicts(p.conflicts),
  dietMatches: toDietMatches(p.dietMatches),
});

const MAX_CART_LINES = 50;
const MAX_OPTIONS_PER_LINE = 20;

/** The cart against the profile. The rule is the catalog's; the BFF decodes the listing ids, keeps the order and maps the answer. */
async function cartCheck(args: { lines: { listingId: string; optionIds: string[] }[] }, ctx: Context) {
  if (!ctx.authorization) throw unauthenticated();
  if (args.lines.length > MAX_CART_LINES)
    throw new ClientError('BAD_INPUT', `A cart check takes at most ${MAX_CART_LINES} lines.`);
  if (args.lines.some((l) => l.optionIds.length > MAX_OPTIONS_PER_LINE))
    throw new ClientError('BAD_INPUT', `A line takes at most ${MAX_OPTIONS_PER_LINE} options.`);

  // A listing id that does not decode is the caller's mistake: that line is not found, and nothing is asked about it.
  const decoded = args.lines.map((l) => serviceIdFor('Listing', l.listingId));
  const toSend = args.lines.flatMap((l, i) =>
    decoded[i] === null ? [] : [{ listingId: decoded[i] as string, optionIds: l.optionIds }],
  );
  // Always asked, even with nothing to send: the catalog is what checks the caller's role, and that must hold for every call.
  const answers = await customerCall(ctx, (authorization) => ctx.catalog.checkCart(toSend, authorization, ctx.trace));
  if (answers.length !== toSend.length)
    throw new DownstreamError('catalog returned a different number of cart lines than were sent');

  let next = 0;
  return args.lines.map((line, i) => {
    if (decoded[i] === null)
      return { listingId: line.listingId, found: false, unknownOptionIds: [], conflicts: [], dietMatches: [] };
    const answer = answers[next++] as CatalogCartLineCheck;
    return {
      listingId: line.listingId,
      found: answer.found,
      unknownOptionIds: answer.unknownOptionIds,
      conflicts: toConflicts(answer.conflicts),
      dietMatches: toDietMatches(answer.dietMatches),
    };
  });
}

export const rootValue = {
  placeOrder,
  savePreferences,
  cartCheck,
  async personalizedListings(
    args: { first?: number; after?: string | null; hideConflicts?: boolean | null },
    ctx: Context,
  ) {
    const first = Math.min(Math.max(args.first ?? 20, 1), MAX_PAGE);
    const page = await customerCall(ctx, (authorization) =>
      ctx.catalog.listPersonalized(
        { limit: first, after: args.after ?? undefined, hideConflicts: args.hideConflicts ?? false },
        authorization,
        ctx.trace,
      ),
    );
    const edges = page.items.map((p) => ({ cursor: p.listing.id, node: toPersonalized(p) }));
    return {
      edges,
      pageInfo: { hasNextPage: page.nextCursor != null, endCursor: page.nextCursor ?? edges.at(-1)?.cursor ?? null },
    };
  },
  async personalizedListing(args: { id: string }, ctx: Context) {
    const serviceId = serviceIdFor('Listing', args.id);
    if (serviceId === null) return null;
    const found = await customerCall(ctx, (authorization) =>
      ctx.catalog.getPersonalized(serviceId, authorization, ctx.trace),
    );
    return found ? toPersonalized(found) : null;
  },
  async preferences(_args: unknown, ctx: Context) {
    return toPreferences(
      await customerCall(ctx, (authorization) => ctx.catalog.getPreferences(authorization, ctx.trace)),
    );
  },
  vendorOrderAction,
  async listings(args: { first?: number; after?: string | null; tags?: string[] | null }, ctx: Context) {
    const first = Math.min(Math.max(args.first ?? 20, 1), MAX_PAGE);
    const page = await ctx.catalog
      .list({ limit: first, after: args.after ?? undefined, tags: args.tags ?? undefined }, ctx.trace)
      .catch((e: unknown) => {
        // The catalog refused a tag to filter by (unknown, hidden, retired, out of window, an allergen, too many): one answer for all of them, from the BFF's own words.
        if (e instanceof DownstreamError && e.status === 422) {
          throw new ClientError('BAD_INPUT', 'One of those tags cannot be used to filter the listings.');
        }
        throw e;
      });
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
  async tags(args: { kind?: string | null }, ctx: Context) {
    const tags = await ctx.catalog.tags(args.kind ? args.kind.toLowerCase() : undefined, ctx.trace);
    return tags.map((t) => ({ id: t.id, kind: t.kind.toUpperCase(), label: t.label }));
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
  /** The caller's saved payment methods (WI-ORD-010): an id and a description each. Ordering-service never sends the token, so the BFF cannot pass it on. */
  async paymentMethods(_args: unknown, ctx: Context) {
    const methods = await customerCall(ctx, (authorization) =>
      ctx.ordering.listPaymentMethods(authorization, ctx.trace),
    );
    return methods.map((m) => ({ id: m.id, description: m.description }));
  },
  async orders(args: { first?: number; after?: string | null }, ctx: Context) {
    const first = Math.min(Math.max(args.first ?? 20, 1), MAX_PAGE);
    const page = await customerCall(ctx, (authorization) =>
      ctx.ordering.listOrders({ limit: first, after: args.after ?? undefined }, authorization, ctx.trace),
    );
    const edges = page.items.map((o) => ({ cursor: o.id, node: toOrder(o) }));
    return {
      edges,
      pageInfo: { hasNextPage: page.nextCursor != null, endCursor: page.nextCursor ?? edges.at(-1)?.cursor ?? null },
    };
  },
  async vendorOrders(args: { status?: string | null; first?: number; after?: string | null }, ctx: Context) {
    const first = Math.min(Math.max(args.first ?? 20, 1), MAX_PAGE);
    const status = args.status ? VENDOR_ORDER_FILTER[args.status] : undefined;
    const page = await vendorCall(ctx, (authorization) =>
      ctx.ordering.listVendorOrders({ status, limit: first, after: args.after ?? undefined }, authorization, ctx.trace),
    );
    const edges = page.items.map((o) => ({ cursor: o.id, node: toVendorOrder(o) }));
    return {
      edges,
      pageInfo: { hasNextPage: page.nextCursor != null, endCursor: page.nextCursor ?? edges.at(-1)?.cursor ?? null },
    };
  },
  async vendorOrder(args: { id: string }, ctx: Context) {
    const serviceId = serviceIdFor('VendorOrder', args.id);
    if (serviceId === null) return null;
    return readVendorOrder(serviceId, ctx);
  },
  // Listing and Order implement Node. An id of another type, or one that does not decode, is null.
  async node(args: { id: string }, ctx: Context) {
    const decoded = fromGlobalId(args.id);
    if (decoded?.type === 'Listing') {
      const l = await ctx.catalog.get(decoded.serviceId, ctx.trace);
      return l ? toListing(l) : null;
    }
    if (decoded?.type === 'Order') return readOrder(decoded.serviceId, ctx);
    if (decoded?.type === 'VendorOrder') return readVendorOrder(decoded.serviceId, ctx);
    return null;
  },
};
