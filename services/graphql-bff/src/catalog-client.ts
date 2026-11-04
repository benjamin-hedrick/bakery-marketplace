import { DownstreamError } from './errors.ts';
import { toTraceparent, type TraceContext } from './trace.ts';

// REST shapes of catalog-service (first-slice contract section 4). Money is integer cents, USD (D-1).
export interface CatalogModifier {
  id: string;
  name: string;
  priceDeltaCents: number;
  allergens: string[];
  /** Tags shown today (WI-TAG-002); absent from a catalog that does not know tags yet. */
  tags?: CatalogTag[];
}
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
  /** Tags shown today (WI-TAG-002); absent from a catalog that does not know tags yet. */
  tags?: CatalogTag[];
  /** The public stock block (ADR-0017): a status and the per-order maximum. Exact quantities are never in a public read. */
  stock: { status: string; maxPerOrder: number | null };
}
export interface CatalogPage {
  items: CatalogListing[];
  nextCursor: string | null;
}

/** REST shape of the public tag registry (ADR-0022): the tags a response may carry today. */
export interface CatalogTag {
  id: string;
  kind: string;
  label: string;
  sortOrder: number;
}

/** REST shape of the caller's allergen profile (WI-PREF-001). Allergen ids of the tag registry. Quasi-health data: never logged. */
export interface CatalogPreferences {
  allergies: string[];
  avoid: string[];
  /** Preferred diet tag ids (WI-TAG-004); absent from a catalog that does not know diets yet. */
  prefer?: string[];
  updatedAt: string | null;
}

export type SavePreferencesResult =
  { kind: 'saved'; preferences: CatalogPreferences } | { kind: 'rejected'; errors: Record<string, string[]> };

/** One allergen of the caller's profile found on a listing (WI-SRCH-001). */
export interface CatalogConflict {
  allergenId: string;
  severity: string;
  source: string;
  optionIds: string[];
}
/** How a listing stands against one preferred diet (WI-TAG-004): the bakery's claim. */
export interface CatalogDietMatch {
  tagId: string;
  marked: boolean;
  itemMarked: boolean;
  optionIdsNotMarked: string[];
}
export interface CatalogPersonalizedListing {
  listing: CatalogListing;
  conflicts: CatalogConflict[];
  /** Absent from a catalog that does not know diets yet. */
  dietMatches?: CatalogDietMatch[];
}
export interface CatalogPersonalizedPage {
  items: CatalogPersonalizedListing[];
  nextCursor: string | null;
}
export interface CatalogCartLineCheck {
  listingId: string;
  found: boolean;
  unknownOptionIds: string[];
  conflicts: CatalogConflict[];
  dietMatches?: CatalogDietMatch[];
}

export interface CatalogClient {
  /**
   * The public listings with the caller's conflicts, same order and paging as {@link list}. The caller's token is forwarded unchanged and the
   * catalog takes the customer from it. A 401 or 403 is a {@link DownstreamError} with that status.
   */
  listPersonalized(
    args: { limit: number; after?: string | undefined; hideConflicts?: boolean | undefined },
    authorization: string,
    trace: TraceContext,
  ): Promise<CatalogPersonalizedPage>;
  /** One public listing with the caller's conflicts, or null (404: it does not exist or is not public). */
  getPersonalized(id: string, authorization: string, trace: TraceContext): Promise<CatalogPersonalizedListing | null>;
  /** The cart's lines against the caller's profile, in the order sent; only the options chosen on a line count. */
  checkCart(
    lines: { listingId: string; optionIds: string[] }[],
    authorization: string,
    trace: TraceContext,
  ): Promise<CatalogCartLineCheck[]>;
  /**
   * The caller's own profile. The caller's token is forwarded unchanged and the catalog takes the customer from it. A 401 or 403 is a
   * {@link DownstreamError} with that status.
   */
  getPreferences(authorization: string, trace: TraceContext): Promise<CatalogPreferences>;
  /** Replaces the caller's profile. A 422 (an id the catalog does not offer, an overlap) is `rejected`; a 401 or 403 is a {@link DownstreamError}. */
  savePreferences(
    body: { allergies: string[]; avoid: string[]; prefer?: string[] },
    authorization: string,
    trace: TraceContext,
  ): Promise<SavePreferencesResult>;
  /** The public tags active today, optionally of one kind (lower case, as the catalog names it). */
  tags(kind: string | undefined, trace: TraceContext): Promise<CatalogTag[]>;
  /** With `tags`, only listings that carry all of them (WI-TAG-003). A 422 from the catalog is a {@link DownstreamError} with that status. */
  list(
    args: { limit: number; after?: string | undefined; tags?: readonly string[] | undefined },
    trace: TraceContext,
  ): Promise<CatalogPage>;
  /** Null when the listing does not exist or is not public (404). */
  get(id: string, trace: TraceContext): Promise<CatalogListing | null>;
}

export function createCatalogClient(
  baseUrl: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): CatalogClient {
  async function request(
    path: string,
    trace: TraceContext,
    init: { method?: string; authorization?: string; body?: string } = {},
  ): Promise<Response> {
    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          accept: 'application/json',
          traceparent: toTraceparent(trace),
          ...(init.authorization ? { authorization: init.authorization } : {}),
          ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(init.body !== undefined ? { body: init.body } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new DownstreamError(`catalog request failed: ${e instanceof Error ? e.name : 'error'}`);
    }
  }

  return {
    async listPersonalized({ limit, after, hideConflicts }, authorization, trace) {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (after) qs.set('after', after);
      if (hideConflicts) qs.set('hideConflicts', 'true');
      const res = await request(`/catalog/listings/for-me?${qs}`, trace, { authorization });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new DownstreamError(`catalog personalized list returned ${res.status}`, res.status);
      }
      return parse<CatalogPersonalizedPage>(res);
    },
    async getPersonalized(id, authorization, trace) {
      const res = await request(`/catalog/listings/for-me/${encodeURIComponent(id)}`, trace, { authorization });
      if (res.status === 404) {
        await res.body?.cancel().catch(() => undefined);
        return null;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new DownstreamError(`catalog personalized get returned ${res.status}`, res.status);
      }
      return parse<CatalogPersonalizedListing>(res);
    },
    async checkCart(lines, authorization, trace) {
      const res = await request('/catalog/preferences/check', trace, {
        method: 'POST',
        authorization,
        body: JSON.stringify({ lines }),
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new DownstreamError(`catalog cart check returned ${res.status}`, res.status);
      }
      return (await parse<{ lines: CatalogCartLineCheck[] }>(res)).lines;
    },
    async getPreferences(authorization, trace) {
      const res = await request('/catalog/preferences', trace, { authorization });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new DownstreamError(`catalog preferences returned ${res.status}`, res.status);
      }
      return parse<CatalogPreferences>(res);
    },
    async savePreferences(body, authorization, trace) {
      const res = await request('/catalog/preferences', trace, {
        method: 'PUT',
        authorization,
        body: JSON.stringify(body),
      });
      if (res.status === 422) {
        const error = await parse<{ code?: unknown; errors?: Record<string, string[]> | null }>(res);
        if (error.code !== 'validation_failed') throw new DownstreamError('catalog returned an unknown 422 body', 422);
        return { kind: 'rejected', errors: error.errors ?? {} };
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new DownstreamError(`catalog save preferences returned ${res.status}`, res.status);
      }
      return { kind: 'saved', preferences: await parse<CatalogPreferences>(res) };
    },
    async tags(kind, trace) {
      const res = await request(`/catalog/tags${kind ? `?${new URLSearchParams({ kind })}` : ''}`, trace);
      if (!res.ok) throw new DownstreamError(`catalog tags returned ${res.status}`, res.status);
      return (await parse<{ items: CatalogTag[] }>(res)).items;
    },
    async list({ limit, after, tags }, trace) {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (after) qs.set('after', after);
      for (const tag of tags ?? []) qs.append('tag', tag);
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
