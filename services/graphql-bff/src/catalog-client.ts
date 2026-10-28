import { DownstreamError } from './errors.ts';
import { toTraceparent, type TraceContext } from './trace.ts';

// REST shapes of catalog-service (first-slice contract section 4). Money is integer cents, USD (D-1).
export interface CatalogModifier { id: string; name: string; priceDeltaCents: number; allergens: string[] }
export interface CatalogListing {
  id: string;
  vendorId: string;
  name: string;
  description: string | null;
  category: string;
  priceCents: number;
  currency: string;
  modifiers: CatalogModifier[];
  allergenFlags: string[];
}
export interface CatalogPage { items: CatalogListing[]; nextCursor: string | null }

export interface CatalogClient {
  list(args: { limit: number; after?: string | undefined }, trace: TraceContext): Promise<CatalogPage>;
  /** Null when the listing does not exist or is not public (404). */
  get(id: string, trace: TraceContext): Promise<CatalogListing | null>;
}

export function createCatalogClient(baseUrl: string, timeoutMs: number, fetchImpl: typeof fetch = fetch): CatalogClient {
  async function request(path: string, trace: TraceContext): Promise<Response> {
    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        headers: { accept: 'application/json', traceparent: toTraceparent(trace) },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new DownstreamError(`catalog request failed: ${e instanceof Error ? e.name : 'error'}`);
    }
  }

  return {
    async list({ limit, after }, trace) {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (after) qs.set('after', after);
      const res = await request(`/catalog/listings?${qs}`, trace);
      if (!res.ok) throw new DownstreamError(`catalog list returned ${res.status}`, res.status);
      return parse<CatalogPage>(res);
    },
    async get(id, trace) {
      const res = await request(`/catalog/listings/${encodeURIComponent(id)}`, trace);
      if (res.status === 404) return null;
      if (!res.ok) throw new DownstreamError(`catalog get returned ${res.status}`, res.status);
      return parse<CatalogListing>(res);
    },
  };
}

async function parse<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new DownstreamError('catalog returned a body that is not JSON', res.status);
  }
}
