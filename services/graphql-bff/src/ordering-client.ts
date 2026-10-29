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

export interface OrderingClient {
  /** Public. */
  pickupWindows(vendorId: string, trace: TraceContext): Promise<OrderingWindow[]>;
  /**
   * The caller's own order, or null (404: it does not exist or is not theirs). `authorization` is the caller's `Authorization` header,
   * forwarded unchanged: ordering-service validates it itself (ADR-0006, ADR-0008). A 401 or 403 is a {@link DownstreamError} with that status.
   */
  getOrder(id: string, authorization: string, trace: TraceContext): Promise<OrderingOrder | null>;
}

export function createOrderingClient(
  baseUrl: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): OrderingClient {
  async function request(path: string, trace: TraceContext, authorization?: string): Promise<Response> {
    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        headers: {
          accept: 'application/json',
          traceparent: toTraceparent(trace),
          ...(authorization ? { authorization } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // Only the error's name is kept: a message can carry the URL, and nothing here may carry the credential.
      throw new DownstreamError(`ordering request failed: ${e instanceof Error ? e.name : 'error'}`);
    }
  }

  return {
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
  };
}

async function parse<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new DownstreamError('ordering returned a body that is not JSON', res.status);
  }
}
