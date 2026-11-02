import { DownstreamError } from './errors.ts';
import { toTraceparent, type TraceContext } from './trace.ts';

// REST shapes of ordering-service (OrderDto, PickupWindowsDto). Money is integer cents (D-1); instants are UTC (D-7).
export interface OrderingLine {
  listingId: string;
  modifiers: string[];
  quantity: number;
  unitPriceCents: number;
  priceCents: number;
}
export interface OrderingWindow {
  start: string;
  end: string;
}
export interface OrderingOrder {
  id: string;
  customerId: string;
  vendorId: string;
  lineItems: OrderingLine[];
  totalCents: number;
  currency: string;
  status: string;
  fulfillmentType: string;
  pickupWindow: OrderingWindow | null;
  sequenceNumber: number;
  createdAt: string;
  updatedAt: string;
}

/** REST shape of the vendor order read model of ordering-service (VendorOrderDto). */
export interface OrderingVendorOrder {
  id: string;
  reference: string;
  status: string;
  totalCents: number | null;
  currency: string | null;
  lineCount: number | null;
  itemCount: number | null;
  fulfillmentType: string | null;
  pickupWindow: OrderingWindow | null;
  automatic: boolean;
  cancelledBy: string | null;
  cancelReason: string | null;
  placedAt: string | null;
  updatedAt: string;
  lines: {
    listingId: string;
    listingName: string | null;
    modifiers: { id: string; name: string | null }[];
    quantity: number;
  }[];
  pickupInstructions: string | null;
  /** The highest event sequence applied to the order (see the schema's VendorOrder.sequence). */
  lastSequence: number;
}
export interface OrderingVendorOrderPage {
  items: OrderingVendorOrder[];
  nextCursor: string | null;
}

/** The checkout request body of ordering-service, with service ids (the BFF has already decoded the global ids). */
export interface CheckoutBody {
  vendorId: string;
  lineItems: { listingId: string; modifierIds: string[]; quantity: number }[];
  pickupWindow: { start: string; end: string } | null;
}

/** The stable error body of ordering-service (ApiError). */
export interface OrderingError {
  code: string;
  message?: string;
  errors?: Record<string, string[]> | null;
  lines?: { listingId: string; reason: string; available?: number | null }[] | null;
}

export type PlaceResult =
  { kind: 'order'; order: OrderingOrder } | { kind: 'error'; status: number; error: OrderingError };

export interface OrderingClient {
  /**
   * Places an order for the caller. The expected 4xx answers (422, 409, 402, and 401/403) come back as `kind: 'error'` for the caller to map; a
   * success (201, or 200 for a repeat of the same checkout) is `kind: 'order'`. Anything else (5xx, a body that is not JSON, a timeout) throws
   * a {@link DownstreamError}. `testPayment` is the D-10 hook, passed only when the BFF was started with test hooks enabled.
   */
  placeOrder(
    body: CheckoutBody,
    authorization: string,
    idempotencyKey: string,
    trace: TraceContext,
    testPayment?: 'decline',
  ): Promise<PlaceResult>;
  /** Public. */
  pickupWindows(vendorId: string, trace: TraceContext): Promise<OrderingWindow[]>;
  /**
   * The caller's own order, or null (404: it does not exist or is not theirs). `authorization` is the caller's `Authorization` header,
   * forwarded unchanged: ordering-service validates it itself (ADR-0006, ADR-0008). A 401 or 403 is a {@link DownstreamError} with that status.
   */
  getOrder(id: string, authorization: string, trace: TraceContext): Promise<OrderingOrder | null>;
  /**
   * The calling vendor's orders, newest change first. `status` is `active` or an ordering status name, or absent for all. The vendor's token is
   * forwarded unchanged; ordering takes the vendor id from it. A 401 or 403 is a {@link DownstreamError} with that status.
   */
  listVendorOrders(
    query: { status?: string | undefined; limit: number; after?: string | undefined },
    authorization: string,
    trace: TraceContext,
  ): Promise<OrderingVendorOrderPage>;
  /** One of the calling vendor's orders, or null (404: it does not exist, is not theirs, or is not in their view yet). */
  getVendorOrder(id: string, authorization: string, trace: TraceContext): Promise<OrderingVendorOrder | null>;
  /**
   * Opens the calling vendor's live stream (ADR-0021) and resolves once ordering has accepted it, so a refusal (401, 403, 503) is thrown here as a
   * {@link DownstreamError} with that status, before any event. The result yields each changed order, whole, and ends when ordering ends the stream
   * (the token expired, the maximum age, replaced by a newer stream, or it dropped this reader). It throws a {@link DownstreamError} if the stream is
   * cut or goes silent for longer than the idle limit. Return it (or abort the signal) to close the connection to ordering. The token is forwarded
   * unchanged and ordering takes the vendor id from it.
   */
  openVendorOrderStream(
    authorization: string,
    trace: TraceContext,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<OrderingVendorOrder, void>>;
}

export function createOrderingClient(
  baseUrl: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
  checkoutTimeoutMs: number = timeoutMs,
  streamIdleMs: number = 45000,
): OrderingClient {
  async function request(
    path: string,
    trace: TraceContext,
    authorization?: string,
    init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
  ): Promise<Response> {
    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          accept: 'application/json',
          traceparent: toTraceparent(trace),
          ...(authorization ? { authorization } : {}),
          ...init.headers,
        },
        ...(init.body !== undefined ? { body: init.body } : {}),
        signal: AbortSignal.timeout(init.timeoutMs ?? timeoutMs),
      });
    } catch (e) {
      // Only the error's name is kept: a message can carry the URL, and nothing here may carry the credential.
      throw new DownstreamError(`ordering request failed: ${e instanceof Error ? e.name : 'error'}`);
    }
  }

  return {
    async placeOrder(body, authorization, idempotencyKey, trace, testPayment) {
      const res = await request('/ordering/checkout', trace, authorization, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
          ...(testPayment ? { 'x-test-payment': testPayment } : {}),
        },
        body: JSON.stringify(body),
        timeoutMs: checkoutTimeoutMs,
      });
      if (res.status === 200 || res.status === 201) return { kind: 'order', order: await parse<OrderingOrder>(res) };
      if ([401, 402, 403, 409, 422].includes(res.status)) {
        // A 401 or 403 has no useful body; the others carry the stable error body. One that is not JSON is not trusted as a known failure.
        const error = res.status === 401 || res.status === 403 ? { code: 'auth' } : await parse<OrderingError>(res);
        if (typeof error?.code !== 'string')
          throw new DownstreamError('ordering returned an error body without a code', res.status);
        return { kind: 'error', status: res.status, error };
      }
      throw new DownstreamError(`ordering checkout returned ${res.status}`, res.status);
    },
    async pickupWindows(vendorId, trace) {
      const res = await request(`/ordering/pickup-windows?${new URLSearchParams({ vendorId })}`, trace);
      if (!res.ok) throw new DownstreamError(`ordering pickup windows returned ${res.status}`, res.status);
      return (await parse<{ windows: OrderingWindow[] }>(res)).windows;
    },
    async getOrder(id, authorization, trace) {
      const res = await request(`/ordering/orders/${encodeURIComponent(id)}`, trace, authorization);
      if (res.status === 404) return null;
      if (!res.ok) throw new DownstreamError(`ordering get order returned ${res.status}`, res.status);
      return parse<OrderingOrder>(res);
    },
    async listVendorOrders(query, authorization, trace) {
      const params = new URLSearchParams({ limit: String(query.limit) });
      if (query.status) params.set('status', query.status);
      if (query.after) params.set('after', query.after);
      const res = await request(`/ordering/vendor/orders?${params}`, trace, authorization);
      if (!res.ok) throw new DownstreamError(`ordering vendor orders returned ${res.status}`, res.status);
      return parse<OrderingVendorOrderPage>(res);
    },
    async getVendorOrder(id, authorization, trace) {
      const res = await request(`/ordering/vendor/orders/${encodeURIComponent(id)}`, trace, authorization);
      if (res.status === 404) return null;
      if (!res.ok) throw new DownstreamError(`ordering vendor order returned ${res.status}`, res.status);
      return parse<OrderingVendorOrder>(res);
    },
    async openVendorOrderStream(authorization, trace, signal) {
      const controller = new AbortController();
      const onCallerAbort = () => controller.abort();
      if (signal?.aborted) controller.abort();
      else signal?.addEventListener('abort', onCallerAbort, { once: true });
      // The timeout covers only the wait for ordering to accept the stream; once it is open it may live as long as the token does.
      const connecting = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/ordering/vendor/orders/stream`, {
          method: 'GET',
          headers: { accept: 'text/event-stream', traceparent: toTraceparent(trace), authorization },
          signal: controller.signal,
        });
      } catch (e) {
        signal?.removeEventListener('abort', onCallerAbort);
        throw new DownstreamError(`ordering stream request failed: ${e instanceof Error ? e.name : 'error'}`);
      } finally {
        clearTimeout(connecting);
      }
      if (!res.ok || !res.body) {
        signal?.removeEventListener('abort', onCallerAbort);
        await res.body?.cancel().catch(() => undefined);
        throw new DownstreamError(`ordering stream returned ${res.status}`, res.status);
      }
      return readOrderEvents(res.body, controller, streamIdleMs, () =>
        signal?.removeEventListener('abort', onCallerAbort),
      );
    },
  };
}

const MAX_FRAME_CHARS = 1024 * 1024;

/**
 * Reads ordering's event stream (Server-Sent Events): "order" events carry the changed vendor order; "expired" and "closed" end the stream;
 * comment lines (the heartbeat) only show that the connection is alive. Closing this generator aborts the request to ordering.
 */
async function* readOrderEvents(
  body: ReadableStream<Uint8Array>,
  controller: AbortController,
  idleMs: number,
  cleanup: () => void,
): AsyncGenerator<OrderingVendorOrder, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const chunk = await readWithin(reader, idleMs, controller);
      if (chunk.done) return;
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
      if (buffer.length > MAX_FRAME_CHARS) throw new DownstreamError('ordering stream frame too large');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = frameEvent(frame);
        if (event === undefined) continue; // a heartbeat or a comment
        if (event.name === 'order') yield parseOrderEvent(event.data);
        else if (event.name === 'expired' || event.name === 'closed') return;
      }
    }
  } finally {
    controller.abort();
    cleanup();
    reader.cancel().catch(() => undefined);
  }
}

async function readWithin(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleMs: number,
  controller: AbortController,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: NodeJS.Timeout | undefined;
  const silent = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DownstreamError('ordering stream went silent')), idleMs);
  });
  try {
    return await Promise.race([reader.read(), silent]);
  } catch (e) {
    if (e instanceof DownstreamError) throw e;
    // Aborted (by the reader closing it) or cut: report it without the cause, which could carry the address.
    throw new DownstreamError(controller.signal.aborted ? 'ordering stream closed' : 'ordering stream was cut');
  } finally {
    clearTimeout(timer);
  }
}

function frameEvent(frame: string): { name: string; data: string } | undefined {
  let name: string | undefined;
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  return name === undefined ? undefined : { name, data: data.join('\n') };
}

function parseOrderEvent(data: string): OrderingVendorOrder {
  let order: unknown;
  try {
    order = JSON.parse(data);
  } catch {
    throw new DownstreamError('ordering stream sent an event that is not JSON');
  }
  const o = order as Partial<OrderingVendorOrder> | null;
  if (!o || typeof o.id !== 'string' || typeof o.status !== 'string' || typeof o.lastSequence !== 'number')
    throw new DownstreamError('ordering stream sent an order without an id, status and sequence');
  return o as OrderingVendorOrder;
}

async function parse<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new DownstreamError('ordering returned a body that is not JSON', res.status);
  }
}
