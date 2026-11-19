import type {
  CatalogCartLineCheck,
  CatalogClient,
  CatalogConflict,
  CatalogDietMatch,
  CatalogListing,
  CatalogListingBody,
  CatalogOwnListing,
  CatalogTag,
  CatalogPersonalizedListing,
  ListingWriteResult,
} from './catalog-client.ts';
import { ClientError, DownstreamError, forbidden, unauthenticated } from './errors.ts';
import { fromGlobalId, serviceIdFor, toGlobalId } from './global-id.ts';
import type { OrderActionName, OrderingClient, OrderingOrder, OrderingVendorOrder } from './ordering-client.ts';
import type { TraceContext } from './trace.ts';
import type {
  ListingInput,
  ListingStatus,
  MutationAdjustListingStockArgs,
  MutationCancelOrderArgs,
  MutationCreateListingArgs,
  MutationPlaceOrderArgs,
  MutationResolvers,
  MutationSavePreferencesArgs,
  MutationUpdateListingArgs,
  MutationVendorOrderActionArgs,
  QueryCartCheckArgs,
  QueryResolvers,
  StockMode,
} from './__generated__/schema-types.ts';

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

/**
 * The resolver of each root field, typed from the schema (`npm run codegen`, `codegen.yml`). graphql-js calls a root value's function as
 * (args, context, info), not (parent, args, context, info) as a resolver map does, so this takes each generated resolver type's arguments and
 * gives that shape; every field of the schema must have one, and a resolver for a field the schema does not have is an error. What a resolver
 * answers stays `unknown`: the mapping returns objects with lazy fields (a function for a part that may fail on its own), which the generated
 * result types do not describe.
 */
type RootField<R> = R extends (parent: never, args: infer A, context: never, info: never) => unknown
  ? (args: A, ctx: Context) => unknown
  : never;
type RootFields<T> = { [K in keyof T]-?: RootField<NonNullable<T[K]>> };

const MAX_PAGE = 50;
const money = (cents: number, currency = 'USD') => ({ cents, currency });

/** The page size a caller asked for, kept within what the BFF serves. */
const pageSize = (first: number | null | undefined) => Math.min(Math.max(first ?? 20, 1), MAX_PAGE);

/** A Relay connection of one page: an edge per item, and the cursor to ask for the next page with (the service's, else the last edge's). */
function connection<T, N>(
  items: readonly T[],
  nextCursor: string | null | undefined,
  cursorOf: (item: T) => string,
  nodeOf: (item: T) => N,
) {
  const edges = items.map((item) => ({ cursor: cursorOf(item), node: nodeOf(item) }));
  return {
    edges,
    pageInfo: { hasNextPage: nextCursor != null, endCursor: nextCursor ?? edges.at(-1)?.cursor ?? null },
  };
}

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

const toModifiers = (l: Pick<CatalogListing, 'modifiers' | 'currency'>) =>
  l.modifiers.map((m) => ({
    id: m.id,
    name: m.name,
    priceDelta: money(m.priceDeltaCents, l.currency),
    allergens: m.allergens,
    tags: toTags(m.tags),
  }));

const toListing = (l: CatalogListing) => ({
  __typename: 'Listing',
  id: toGlobalId('Listing', l.id),
  vendorId: l.vendorId,
  name: l.name,
  description: l.description,
  category: l.category,
  price: money(l.priceCents, l.currency),
  modifiers: toModifiers(l),
  allergenFlags: l.allergenFlags,
  tags: toTags(l.tags),
  // A function, so a bad stock block only fails the query that asks for it.
  stock: () => ({
    status: enumValue('stock status', STOCK_STATUS, l.stock?.status ?? ''),
    maxPerOrder: l.stock?.maxPerOrder ?? null,
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

/** A call to ordering with the caller's token, for a vendor's or a customer's own data: ordering decides the role and whose data it is. A 401 means the token was not accepted; a 403 means its role is not allowed for this call. */
async function callWithToken<T>(ctx: Context, call: (authorization: string) => Promise<T>): Promise<T> {
  if (!ctx.authorization) throw unauthenticated();
  try {
    return await call(ctx.authorization);
  } catch (e) {
    if (e instanceof DownstreamError && e.status === 401) throw unauthenticated();
    if (e instanceof DownstreamError && e.status === 403) throw forbidden();
    throw e;
  }
}

/** The caller's own order. */
async function readOrder(serviceId: string, ctx: Context) {
  const o = await callWithToken(ctx, (authorization) => ctx.ordering.getOrder(serviceId, authorization, ctx.trace));
  return o ? toOrder(o) : null;
}

async function readVendorOrder(serviceId: string, ctx: Context) {
  const o = await callWithToken(ctx, (authorization) =>
    ctx.ordering.getVendorOrder(serviceId, authorization, ctx.trace),
  );
  return o ? toVendorOrder(o) : null;
}

/**
 * The root of a subscription operation (ADR-0021). The resolver opens the vendor's stream with ordering, so a refusal is an error of the
 * operation before any event; each event is then the changed order, shaped by the same mapping as the vendor queries. Returning the iterator
 * (or the client leaving) closes the connection to ordering.
 */
export const subscriptionRoot = {
  async vendorOrderChanged(_args: unknown, ctx: Context) {
    const events = await callWithToken(ctx, (authorization) =>
      ctx.ordering.openVendorOrderStream(authorization, ctx.trace, ctx.signal),
    );
    return (async function* () {
      for await (const order of events) yield { vendorOrderChanged: toVendorOrder(order) };
    })();
  },
};

// ---- placeOrder -------------------------------------------------------------------------------------------------------------
// The input's `paymentMethodId` is the id of one of the caller's saved payment methods (WI-ORD-010). Only the id crosses: the token stays in
// ordering-service.

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
  // Ordering sends it with 503 (ordering-client.ts lets a 503 through only with this code): the catalog, the payment processor or ordering's store
  // could not be reached, and nothing was placed (register 165).
  downstream_unavailable: {
    code: 'TEMPORARILY_UNAVAILABLE',
    message:
      'We could not place your order right now. Nothing has been charged, and your order is still here. Please try again in a moment.',
  },
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

async function placeOrder(args: MutationPlaceOrderArgs, ctx: Context) {
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
  CANCEL: 'cancel',
};

/** The refusal of an order action, in the schema's words. The text is the BFF's own; ordering's never reaches the client. */
const actionRejected = (
  typename: 'VendorOrderActionRejected' | 'CancelOrderRejected',
  code: 'NOT_FOUND' | 'NOT_ALLOWED_NOW',
  message: string,
  currentStatus: string | null = null,
) => ({ __typename: typename, code, message, currentStatus });

/**
 * One action on an order, for the vendor's actions and the customer's cancel alike. Mapping only (ADR-0006, ADR-0013): the caller's token goes through,
 * and ordering decides the role, whose order it is and whether the order's status allows the action. `kind` names the two payload types and the text of a
 * refusal because the order has moved on.
 */
async function runOrderAction(
  ctx: Context,
  serviceId: string,
  action: OrderActionName,
  orderId: string,
  kind: {
    done: 'VendorOrderActionDone' | 'CancelOrderDone';
    rejected: 'VendorOrderActionRejected' | 'CancelOrderRejected';
    tooLate: string;
  },
) {
  const result = await callWithToken(ctx, (authorization) =>
    ctx.ordering.orderAction(serviceId, action, authorization, ctx.trace),
  );
  if (result.kind === 'done') {
    return { __typename: kind.done, orderId, status: enumValue('order status', ORDER_STATUS, result.order.status) };
  }
  if (result.kind === 'not_found') return actionRejected(kind.rejected, 'NOT_FOUND', 'That order could not be found.');
  const current =
    result.currentStatus === null ? null : ORDER_STATUS[result.currentStatus as keyof typeof ORDER_STATUS];
  return actionRejected(kind.rejected, 'NOT_ALLOWED_NOW', kind.tooLate, current ?? null);
}

/** A vendor's action on one of their orders (WI-QUE-004). The enum becomes ordering's path; everything else is ordering's to decide. */
async function vendorOrderAction(args: MutationVendorOrderActionArgs, ctx: Context) {
  if (!ctx.authorization) throw unauthenticated();
  const action = VENDOR_ACTIONS[args.input.action];
  if (action === undefined) throw new DownstreamError('unknown vendor action'); // the schema's enum makes this unreachable
  const serviceId = serviceIdFor('VendorOrder', args.input.orderId);
  if (serviceId === null)
    return actionRejected('VendorOrderActionRejected', 'NOT_FOUND', 'That order could not be found.');
  return runOrderAction(ctx, serviceId, action, args.input.orderId, {
    done: 'VendorOrderActionDone',
    rejected: 'VendorOrderActionRejected',
    tooLate: 'That cannot be done to this order now. It has changed.',
  });
}

/** A customer cancels their own order: the same ordering endpoint, with the customer's token. */
async function cancelOrder(args: MutationCancelOrderArgs, ctx: Context) {
  const serviceId = serviceIdFor('Order', args.input.orderId);
  if (!ctx.authorization) throw unauthenticated();
  if (serviceId === null) return actionRejected('CancelOrderRejected', 'NOT_FOUND', 'That order could not be found.');
  return runOrderAction(ctx, serviceId, 'cancel', args.input.orderId, {
    done: 'CancelOrderDone',
    rejected: 'CancelOrderRejected',
    tooLate: 'This order can no longer be cancelled. It has changed.',
  });
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
async function savePreferences(args: MutationSavePreferencesArgs, ctx: Context) {
  const result = await callWithToken(ctx, (authorization) =>
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

// ---- the vendor's own listings (WI-CAT-007) ---------------------------------------------------------------------------------
// Mapping only (ADR-0013): the catalog decides prices, statuses, stock modes, versions and who owns what. The BFF renames, decodes and encodes global
// ids, passes If-Match and Idempotency-Key through, and gives each refusal its fixed text; an INVALID keeps the catalog's field names and sentences.

const LISTING_STATUS = { Draft: 'DRAFT', Published: 'PUBLISHED' };
const LISTING_STATUS_WIRE: Record<ListingStatus, string> = { DRAFT: 'Draft', PUBLISHED: 'Published' };
const STOCK_MODE_WIRE: Record<StockMode, string> = { MADE_TO_ORDER: 'madeToOrder', COUNTED: 'counted' };

/** The owner's view in its own type, so owner-only fields never share a type (or a fragment) with the public Listing. */
const toMyListing = (l: CatalogOwnListing) => ({
  __typename: 'MyListing',
  id: toGlobalId('Listing', l.id),
  name: l.name,
  description: l.description,
  category: l.category,
  price: money(l.priceCents, l.currency),
  status: () => enumValue('listing status', LISTING_STATUS, l.status),
  modifiers: toModifiers(l),
  allergenFlags: l.allergenFlags,
  tags: toTags(l.tags),
  stock: () => ({
    status: enumValue('stock status', STOCK_STATUS, l.stock?.status ?? ''),
    maxPerOrder: l.stock?.maxPerOrder ?? null,
    availableQuantity: l.stock?.availableQuantity ?? null,
    lowStockThreshold: l.stock?.lowStockThreshold ?? null,
  }),
  editVersion: l.editVersion,
  createdAt: l.createdAt,
  updatedAt: l.updatedAt,
});

/** The input in the catalog's words. A part the client left out is left out, because the catalog reads absent as "keep as it is". */
const toListingBody = (input: ListingInput): CatalogListingBody => ({
  name: input.name,
  description: input.description ?? null,
  category: input.category,
  priceCents: input.priceCents,
  modifiers: input.modifiers.map((m) => ({
    id: m.id,
    name: m.name,
    priceDeltaCents: m.priceDeltaCents,
    allergens: m.allergens,
    ...(m.tags ? { tags: m.tags } : {}),
  })),
  allergenFlags: input.allergenFlags,
  ...(input.status ? { status: LISTING_STATUS_WIRE[input.status] } : {}),
  ...(input.tags ? { tags: input.tags } : {}),
  ...(input.stock
    ? {
        stock: {
          ...(input.stock.mode ? { mode: STOCK_MODE_WIRE[input.stock.mode] } : {}),
          availableQuantity: input.stock.availableQuantity ?? null,
          maxPerOrder: input.stock.maxPerOrder ?? null,
          lowStockThreshold: input.stock.lowStockThreshold ?? null,
        },
      }
    : {}),
});

type ListingRejectionCode =
  'INVALID' | 'NOT_FOUND' | 'VENDOR_NOT_VERIFIED' | 'CHANGED' | 'MADE_TO_ORDER' | 'INSUFFICIENT_STOCK' | 'KEY_REUSED';

const LISTING_MESSAGES: Record<ListingRejectionCode, string> = {
  INVALID: 'The listing could not be saved as entered.',
  NOT_FOUND: 'That listing could not be found.',
  VENDOR_NOT_VERIFIED: 'Only a verified bakery can publish a listing. You can save it as a draft.',
  CHANGED: 'This listing was changed since you opened it. Reload it and try again.',
  MADE_TO_ORDER: 'This listing is made to order, so it has no count to adjust.',
  INSUFFICIENT_STOCK: 'The count cannot go below zero.',
  KEY_REUSED: 'This form was already used to create a different listing. Start a new listing.',
};

/** The catalog's refusal codes for listing writes, in the schema's words. A code that is not here is a contract violation: an internal error. */
const LISTING_REFUSALS: Record<string, ListingRejectionCode> = {
  validation_failed: 'INVALID',
  vendor_not_verified: 'VENDOR_NOT_VERIFIED',
  version_mismatch: 'CHANGED',
  conflict: 'CHANGED',
  made_to_order: 'MADE_TO_ORDER',
  insufficient_stock: 'INSUFFICIENT_STOCK',
  idempotency_key_reuse: 'KEY_REUSED',
};

const MAX_LISTING_FIELD_PROBLEMS = 100;

const listingRejected = (
  code: ListingRejectionCode,
  fields: { field: string; message: string }[] = [],
  currentEditVersion: number | null = null,
) => ({ __typename: 'ListingRejected', code, message: LISTING_MESSAGES[code], fields, currentEditVersion });

/**
 * One listing write with the caller's token. The catalog decides the role (401, 403), the owner (a 404 for another vendor's listing) and every rule;
 * the answer is mapped here.
 */
async function listingWrite(ctx: Context, call: (authorization: string) => Promise<ListingWriteResult>) {
  const result = await callWithToken(ctx, call);
  if (result.kind === 'ok') return { __typename: 'ListingWriteSuccess', listing: toMyListing(result.listing) };
  if (result.kind === 'not_found') return listingRejected('NOT_FOUND');
  // The BFF always sends If-Match; the catalog refuses one it cannot use (a version below 1 from the caller) as missing.
  if (result.code === 'precondition_required') {
    return listingRejected('INVALID', [
      {
        field: 'expectedEditVersion',
        message: 'That is not an edit version of this listing. Reload it and try again.',
      },
    ]);
  }
  const code = LISTING_REFUSALS[result.code];
  if (code === undefined) throw new DownstreamError('unknown listing write error code from catalog');
  // Decision 4 of WI-CAT-007: the catalog's field names and sentences, unchanged (they are written to be shown to the vendor).
  const fields =
    code === 'INVALID'
      ? Object.entries(result.errors)
          .flatMap(([field, messages]) => messages.map((message) => ({ field, message })))
          .slice(0, MAX_LISTING_FIELD_PROBLEMS)
      : [];
  return listingRejected(code, fields, code === 'CHANGED' ? result.currentEditVersion : null);
}

/** A key that cannot travel in an HTTP header (a control or non-ASCII character) is refused here; every other check of the key is the catalog's. */
const sendableHeaderValue = (value: string) => /^[\x20-\x7e]*$/.test(value);

async function createListing(args: MutationCreateListingArgs, ctx: Context) {
  if (!ctx.authorization) throw unauthenticated();
  if (!sendableHeaderValue(args.idempotencyKey)) {
    return listingRejected('INVALID', [
      { field: 'idempotencyKey', message: 'The form could not be sent. Reload the page and try again.' },
    ]);
  }
  const body = toListingBody(args.input);
  return listingWrite(ctx, (authorization) =>
    ctx.catalog.createListing(body, args.idempotencyKey, authorization, ctx.trace),
  );
}

async function updateListing(args: MutationUpdateListingArgs, ctx: Context) {
  if (!ctx.authorization) throw unauthenticated();
  const serviceId = serviceIdFor('Listing', args.id);
  if (serviceId === null) return listingRejected('NOT_FOUND');
  const body = toListingBody(args.input);
  return listingWrite(ctx, (authorization) =>
    ctx.catalog.updateListing(serviceId, body, args.expectedEditVersion, authorization, ctx.trace),
  );
}

async function adjustListingStock(args: MutationAdjustListingStockArgs, ctx: Context) {
  if (!ctx.authorization) throw unauthenticated();
  const serviceId = serviceIdFor('Listing', args.id);
  if (serviceId === null) return listingRejected('NOT_FOUND');
  return listingWrite(ctx, (authorization) => ctx.catalog.adjustStock(serviceId, args.delta, authorization, ctx.trace));
}

const MAX_CART_LINES = 50;
const MAX_OPTIONS_PER_LINE = 20;

/** The cart against the profile. The rule is the catalog's; the BFF decodes the listing ids, keeps the order and maps the answer. */
async function cartCheck(args: QueryCartCheckArgs, ctx: Context) {
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
  const answers = await callWithToken(ctx, (authorization) => ctx.catalog.checkCart(toSend, authorization, ctx.trace));
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

export const rootValue: RootFields<QueryResolvers & MutationResolvers> = {
  placeOrder,
  savePreferences,
  cartCheck,
  createListing,
  updateListing,
  adjustListingStock,
  async myListings(args, ctx) {
    const first = pageSize(args.first);
    const status = args.status ? LISTING_STATUS_WIRE[args.status] : undefined;
    const page = await callWithToken(ctx, (authorization) =>
      ctx.catalog.listOwn({ status, limit: first, after: args.after ?? undefined }, authorization, ctx.trace),
    );
    return connection(page.items, page.nextCursor, (l) => l.id, toMyListing);
  },
  async myListing(args, ctx) {
    const serviceId = serviceIdFor('Listing', args.id);
    if (serviceId === null) return null;
    const l = await callWithToken(ctx, (authorization) => ctx.catalog.getOwn(serviceId, authorization, ctx.trace));
    return l ? toMyListing(l) : null;
  },
  async personalizedListings(args, ctx) {
    const first = pageSize(args.first);
    const page = await callWithToken(ctx, (authorization) =>
      ctx.catalog.listPersonalized(
        { limit: first, after: args.after ?? undefined, hideConflicts: args.hideConflicts ?? false },
        authorization,
        ctx.trace,
      ),
    );
    return connection(page.items, page.nextCursor, (p) => p.listing.id, toPersonalized);
  },
  async personalizedListing(args, ctx) {
    const serviceId = serviceIdFor('Listing', args.id);
    if (serviceId === null) return null;
    const found = await callWithToken(ctx, (authorization) =>
      ctx.catalog.getPersonalized(serviceId, authorization, ctx.trace),
    );
    return found ? toPersonalized(found) : null;
  },
  async preferences(_args, ctx) {
    return toPreferences(
      await callWithToken(ctx, (authorization) => ctx.catalog.getPreferences(authorization, ctx.trace)),
    );
  },
  vendorOrderAction,
  cancelOrder,
  async listings(args, ctx) {
    const first = pageSize(args.first);
    const page = await ctx.catalog
      .list({ limit: first, after: args.after ?? undefined, tags: args.tags ?? undefined }, ctx.trace)
      .catch((e: unknown) => {
        // The catalog refused a tag to filter by (unknown, hidden, retired, out of window, an allergen, too many): one answer for all of them, from the BFF's own words.
        if (e instanceof DownstreamError && e.status === 422) {
          throw new ClientError('BAD_INPUT', 'One of those tags cannot be used to filter the listings.');
        }
        throw e;
      });
    return connection(page.items, page.nextCursor, (l) => l.id, toListing);
  },
  async listing(args, ctx) {
    const serviceId = serviceIdFor('Listing', args.id);
    if (serviceId === null) return null;
    const l = await ctx.catalog.get(serviceId, ctx.trace);
    return l ? toListing(l) : null;
  },
  async tags(args, ctx) {
    const tags = await ctx.catalog.tags(args.kind ? args.kind.toLowerCase() : undefined, ctx.trace);
    return toTags(tags);
  },
  async pickupWindows(args, ctx) {
    // Public data: the caller's token is deliberately not sent.
    const windows = await ctx.ordering.pickupWindows(args.vendorId, ctx.trace);
    return windows.map((w) => ({ start: w.start, end: w.end }));
  },
  async order(args, ctx) {
    const serviceId = serviceIdFor('Order', args.id);
    if (serviceId === null) return null;
    return readOrder(serviceId, ctx);
  },
  /** The caller's saved payment methods (WI-ORD-010): an id and a description each. Ordering-service never sends the token, so the BFF cannot pass it on. */
  async paymentMethods(_args, ctx) {
    const methods = await callWithToken(ctx, (authorization) =>
      ctx.ordering.listPaymentMethods(authorization, ctx.trace),
    );
    return methods.map((m) => ({ id: m.id, description: m.description }));
  },
  async orders(args, ctx) {
    const first = pageSize(args.first);
    const page = await callWithToken(ctx, (authorization) =>
      ctx.ordering.listOrders({ limit: first, after: args.after ?? undefined }, authorization, ctx.trace),
    );
    return connection(page.items, page.nextCursor, (o) => o.id, toOrder);
  },
  async vendorOrders(args, ctx) {
    const first = pageSize(args.first);
    const status = args.status ? VENDOR_ORDER_FILTER[args.status] : undefined;
    const page = await callWithToken(ctx, (authorization) =>
      ctx.ordering.listVendorOrders({ status, limit: first, after: args.after ?? undefined }, authorization, ctx.trace),
    );
    return connection(page.items, page.nextCursor, (o) => o.id, toVendorOrder);
  },
  async vendorOrder(args, ctx) {
    const serviceId = serviceIdFor('VendorOrder', args.id);
    if (serviceId === null) return null;
    return readVendorOrder(serviceId, ctx);
  },
  // Listing and Order implement Node. An id of another type, or one that does not decode, is null.
  async node(args, ctx) {
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
