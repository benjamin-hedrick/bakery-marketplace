import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { globalId } from '../skeleton/support';

// Helpers for the chaos specs (tests/chaos). The rules they follow (agreed with the lead 2026-11-11):
//  - a spec asserts invariants (no lost order, no duplicate, convergence), never exact counts of faults, and only about the data it created itself;
//  - a spec first checks the journal to see the fault really happened, so a pass is not a run with chaos switched off;
//  - metrics are recovery and resilience figures only (attempts needed, time to converge), never latency percentiles.

export const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
export const SCENARIO = process.env.STACK_CHAOS_SCENARIO ?? '';
const LOG_DIR = process.env.CHAOS_LOG_DIR ?? '';

/** Skips the file unless the stack runs the scenario it was written for. Call at the top of a spec file. */
export function onlyUnder(scenario: string): void {
  test.skip(SCENARIO !== scenario, `written for chaos scenario '${scenario}'; this run has '${SCENARIO || 'none'}'`);
}

// ---------- GraphQL through the BFF ----------

// GraphQL answers are read loosely on purpose: a chaos spec must cope with whatever shape a fault leaves.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export interface GqlResult {
  status: number;
  body: {
    data?: Record<string, Json> | null;
    errors?: { message?: string; extensions?: { code?: string } }[];
    extensions?: Json;
  } | null;
  /** A failure of the call itself (a reset connection, a non-JSON answer). */
  transportError?: string;
  /** The faults the BFF says it injected into this answer (response header X-Chaos-Injected, ADR-0024); empty when none or when the answer never came. */
  injected?: string[];
  /** The correlation id of the answer (X-Correlation-Id, ADR-0016), when it has one. */
  correlationId?: string;
  /** The Cache-Control header of the answer (ADR-0014: an authenticated answer is private, no-store). */
  cacheControl?: string;
}

const injectedFaults = (res: Response) => (res.headers.get('x-chaos-injected') ?? '').split(',').filter(Boolean);

export async function gql(token: string | null, query: string, variables: object = {}): Promise<GqlResult> {
  try {
    const res = await fetch(`${BFF}/graphql`, {
      method: 'POST',
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    try {
      return {
        status: res.status,
        body: JSON.parse(text),
        injected: injectedFaults(res),
        correlationId: res.headers.get('x-correlation-id') ?? undefined,
        cacheControl: res.headers.get('cache-control') ?? undefined,
      };
    } catch {
      return { status: res.status, body: null, transportError: 'not JSON', injected: injectedFaults(res) };
    }
  } catch (e) {
    return { status: 0, body: null, transportError: (e as Error).message };
  }
}

const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename
  ... on PlaceOrderSuccess { order { id } }
  ... on PlaceOrderRejected { code } } }`;

export interface Placement {
  key: string;
  /** The order the client was finally told about, or null when every attempt failed. */
  orderId: string | null;
  attempts: number;
  /** What each attempt came to: "success", a rejection code, or a transport or service error. */
  outcomes: string[];
}

export function orderInput(listingServiceId: string, key: string, quantity = 1) {
  return {
    idempotencyKey: key,
    paymentMethodId: 'pm-alice-ok',
    vendorId: 'vendor-shop-001',
    lineItems: [{ listingId: globalId('Listing', listingServiceId), modifierIds: [], quantity }],
    pickupWindow: null,
  };
}

export const newKey = (prefix: string) => `${prefix}-${randomUUID()}`;

/**
 * What a careful client does: place the order, and when the answer is a failure or no answer at all, place it again with the SAME idempotency key,
 * up to `maxAttempts`. A success ends it. Whatever happened, the key is what makes the retry safe.
 */
export async function placeWithRetries(
  token: string,
  input: ReturnType<typeof orderInput>,
  maxAttempts = 8,
): Promise<Placement> {
  const outcomes: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await gql(token, PLACE, { input });
    const payload = r.body?.data?.placeOrder;
    if (payload?.__typename === 'PlaceOrderSuccess') {
      outcomes.push('success');
      return { key: input.idempotencyKey, orderId: payload.order.id, attempts: attempt, outcomes };
    }
    outcomes.push(payload?.code ?? r.transportError ?? r.body?.errors?.[0]?.extensions?.code ?? `http-${r.status}`);
    await new Promise((res) => setTimeout(res, 100 * attempt));
  }
  return { key: input.idempotencyKey, orderId: null, attempts: maxAttempts, outcomes };
}

/** The order id the ordering service derives from a customer id and an idempotency key (CheckoutService.OrderIdFor), so a test can name an order whose answer never arrived. */
export const serviceOrderId = (customerId: string, key: string) =>
  'order-' + createHash('sha256').update(`${customerId}\n${key}`, 'utf8').digest('hex').slice(0, 32);

/** All of the customer's order ids as the service knows them (global ids), read through the BFF, retrying through the injected faults. */
export async function customerOrderIds(token: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    let r: GqlResult | undefined;
    for (let i = 0; i < 10; i++) {
      r = await gql(
        token,
        `query($after: String) { orders(first: 50, after: $after) { edges { node { id } } pageInfo { hasNextPage endCursor } } }`,
        { after },
      );
      if (r.body?.data?.orders) break;
      await new Promise((res) => setTimeout(res, 200));
    }
    const orders = r?.body?.data?.orders;
    if (!orders) throw new Error(`could not read the order list through the faults: ${JSON.stringify(r)}`);
    for (const e of orders.edges) ids.push(e.node.id);
    if (!orders.pageInfo.hasNextPage) break;
    after = orders.pageInfo.endCursor;
  }
  return ids;
}

/** The vendor's order ids (VendorOrder global ids) the read model has, retrying through the injected faults. */
export async function vendorOrderIds(token: string): Promise<string[]> {
  const r = await retry(
    () => gql(token, `{ vendorOrders(first: 100) { edges { node { id } } } }`),
    (x) => !!x.body?.data?.vendorOrders,
  );
  return r.body!.data!.vendorOrders.edges.map((e: { node: { id: string } }) => e.node.id);
}

async function retry<T>(fn: () => Promise<T>, ok: (x: T) => boolean, tries = 10): Promise<T> {
  let last!: T;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (ok(last)) return last;
    await new Promise((res) => setTimeout(res, 200));
  }
  return last;
}

/** Polls until `check` is true or the time is up. Returns the seconds it took, or null when it never held (a recovery metric, not a latency one). */
export async function secondsUntil(check: () => Promise<boolean>, limitSeconds = 90): Promise<number | null> {
  const started = Date.now();
  while ((Date.now() - started) / 1000 < limitSeconds) {
    if (await check()) return (Date.now() - started) / 1000;
    await new Promise((res) => setTimeout(res, 500));
  }
  return null;
}

export const vendorGlobalId = (orderGlobalId: string) =>
  globalId('VendorOrder', Buffer.from(orderGlobalId, 'base64').toString('utf8').split(':')[1]!);

// ---------- stock, read and set up through the catalog's own faults ----------

const CATALOG = process.env.CATALOG_URL ?? 'http://localhost:5200';

/** The vendor's exact stock for its own listing: a read that changes nothing, so a lost answer cannot change the figure, retried through injected faults. */
export async function readQuantity(vendorToken: string, listing: string): Promise<number> {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${CATALOG}/catalog/listings/mine/${listing}`, {
        headers: { authorization: `Bearer ${vendorToken}` },
      });
      const body = (await res.json()) as { stock?: { availableQuantity?: number } };
      if (res.ok && typeof body.stock?.availableQuantity === 'number') return body.stock.availableQuantity;
    } catch {
      /* an injected fault: try again */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`could not read the stock of ${listing} through the faults`);
}

/** Adds headroom so stock never decides an outcome. Adding is not repeated blindly: it asks again for the figure and stops once the stock is high enough. */
export async function ensureQuantityAtLeast(vendorToken: string, listing: string, wanted: number): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const have = await readQuantity(vendorToken, listing);
    if (have >= wanted) return;
    try {
      await fetch(`${CATALOG}/catalog/listings/${listing}/stock/adjust`, {
        method: 'POST',
        headers: { authorization: `Bearer ${vendorToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ delta: wanted - have }),
      });
    } catch {
      /* an injected fault: the next read says whether it took effect */
    }
  }
  throw new Error(`could not raise the stock of ${listing} to ${wanted}`);
}

// ---------- recovery and resilience metrics ----------

/** Writes this spec's resilience figures next to the run's logs (artifacts/chaos/<scenario>/metrics-<name>.json). */
export function recordMetrics(name: string, metrics: Record<string, unknown>): void {
  if (!LOG_DIR) return;
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(
    path.join(LOG_DIR, `metrics-${name}.json`),
    JSON.stringify({ scenario: SCENARIO, ...metrics }, null, 2),
  );
}
