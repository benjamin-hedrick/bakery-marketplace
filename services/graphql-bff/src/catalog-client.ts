import { callDownstream, failure, parseJson } from './downstream.ts';
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

/**
 * A listing in its owner's view (WI-CAT-007): also the status, the exact count and threshold (absent when not set; no count means made to order)
 * and the edit version an edit must name.
 */
export interface CatalogOwnListing extends Omit<CatalogListing, 'stock'> {
  status: string;
  stock: { status: string; maxPerOrder: number | null; availableQuantity?: number; lowStockThreshold?: number };
  editVersion: number;
  createdAt: string;
  updatedAt: string;
}
export interface CatalogOwnPage {
  items: CatalogOwnListing[];
  nextCursor: string | null;
}

/** A listing write as the catalog takes it (`ListingRequest`). Optional parts are left out, never sent as null, where the catalog reads absent as "keep". */
export interface CatalogListingBody {
  name: string;
  description: string | null;
  category: string;
  priceCents: number;
  modifiers: { id: string; name: string; priceDeltaCents: number; allergens: string[]; tags?: string[] }[];
  allergenFlags: string[];
  status?: string;
  tags?: string[];
  stock?: {
    mode?: string;
    availableQuantity: number | null;
    maxPerOrder: number | null;
    lowStockThreshold: number | null;
  };
}

/**
 * The answer to a listing write. `refused` is the catalog's expected refusal with its error code (`validation_failed`, `version_mismatch`, ...), its
 * per-field sentences and, for `version_mismatch`, the current edit version. A 401 or 403 is a {@link DownstreamError} with that status.
 */
export type ListingWriteResult =
  | { kind: 'ok'; listing: CatalogOwnListing }
  | { kind: 'not_found' }
  | {
      kind: 'refused';
      code: string;
      message: string;
      errors: Record<string, string[]>;
      currentEditVersion: number | null;
    };

export interface CatalogClient {
  /** The caller's own listings, drafts included (the caller's token is forwarded unchanged; the catalog takes the vendor from it). */
  listOwn(
    args: { status?: string | undefined; limit: number; after?: string | undefined },
    authorization: string,
    trace: TraceContext,
  ): Promise<CatalogOwnPage>;
  /** One of the caller's own listings, or null (404: missing or another vendor's). */
  getOwn(id: string, authorization: string, trace: TraceContext): Promise<CatalogOwnListing | null>;
  /** Creates a listing; `idempotencyKey` is the client's, sent unchanged as `Idempotency-Key`. A repeat answers the listing it made. */
  createListing(
    body: CatalogListingBody,
    idempotencyKey: string,
    authorization: string,
    trace: TraceContext,
  ): Promise<ListingWriteResult>;
  /** Replaces a listing, sent with `If-Match: "<expectedEditVersion>"`. */
  updateListing(
    id: string,
    body: CatalogListingBody,
    expectedEditVersion: number,
    authorization: string,
    trace: TraceContext,
  ): Promise<ListingWriteResult>;
  /** Adds `delta` to a counted listing's count. */
  adjustStock(id: string, delta: number, authorization: string, trace: TraceContext): Promise<ListingWriteResult>;

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
    init: { method?: string; authorization?: string; body?: string; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    return callDownstream(fetchImpl, 'catalog', `${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        accept: 'application/json',
        traceparent: toTraceparent(trace),
        ...(init.authorization ? { authorization: init.authorization } : {}),
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  /**
   * A write's answer. 200 and 201 are the listing; 404 is not found; a 409 or 422 with a code is the catalog's refusal, its text kept for the field
   * problems only. A 428 means the BFF sent no usable If-Match: from a caller's version below 1, refused as a field problem. Anything else is a failure.
   */
  async function writeResult(res: Response, step: string): Promise<ListingWriteResult> {
    if (res.status === 200 || res.status === 201) return { kind: 'ok', listing: await parse<CatalogOwnListing>(res) };
    if (res.status === 404) {
      await res.body?.cancel().catch(() => undefined);
      return { kind: 'not_found' };
    }
    if (res.status === 409 || res.status === 422 || res.status === 428) {
      const body = await parse<{
        code?: unknown;
        message?: unknown;
        errors?: Record<string, string[]> | null;
        currentEditVersion?: unknown;
      }>(res);
      if (typeof body.code !== 'string')
        throw new DownstreamError(`${step} returned a ${res.status} without a code`, res.status);
      return {
        kind: 'refused',
        code: body.code,
        message: typeof body.message === 'string' ? body.message : '',
        errors: body.errors ?? {},
        currentEditVersion: typeof body.currentEditVersion === 'number' ? body.currentEditVersion : null,
      };
    }
    throw await failure(res, step);
  }

  return {
    async listOwn({ status, limit, after }, authorization, trace) {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (status) qs.set('status', status);
      if (after) qs.set('after', after);
      const res = await request(`/catalog/listings/mine?${qs}`, trace, { authorization });
      if (!res.ok) throw await failure(res, 'catalog own listings');
      return parse<CatalogOwnPage>(res);
    },
    async getOwn(id, authorization, trace) {
      const res = await request(`/catalog/listings/mine/${encodeURIComponent(id)}`, trace, { authorization });
      if (res.status === 404) {
        await res.body?.cancel().catch(() => undefined);
        return null;
      }
      if (!res.ok) throw await failure(res, 'catalog own listing');
      return parse<CatalogOwnListing>(res);
    },
    async createListing(body, idempotencyKey, authorization, trace) {
      const res = await request('/catalog/listings', trace, {
        method: 'POST',
        authorization,
        body: JSON.stringify(body),
        headers: { 'idempotency-key': idempotencyKey },
      });
      return writeResult(res, 'catalog create listing');
    },
    async updateListing(id, body, expectedEditVersion, authorization, trace) {
      const res = await request(`/catalog/listings/${encodeURIComponent(id)}`, trace, {
        method: 'PUT',
        authorization,
        body: JSON.stringify(body),
        headers: { 'if-match': `"${expectedEditVersion}"` },
      });
      return writeResult(res, 'catalog update listing');
    },
    async adjustStock(id, delta, authorization, trace) {
      const res = await request(`/catalog/listings/${encodeURIComponent(id)}/stock/adjust`, trace, {
        method: 'POST',
        authorization,
        body: JSON.stringify({ delta }),
      });
      return writeResult(res, 'catalog adjust stock');
    },
    async listPersonalized({ limit, after, hideConflicts }, authorization, trace) {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (after) qs.set('after', after);
      if (hideConflicts) qs.set('hideConflicts', 'true');
      const res = await request(`/catalog/listings/for-me?${qs}`, trace, { authorization });
      if (!res.ok) throw await failure(res, 'catalog personalized list');
      return parse<CatalogPersonalizedPage>(res);
    },
    async getPersonalized(id, authorization, trace) {
      const res = await request(`/catalog/listings/for-me/${encodeURIComponent(id)}`, trace, { authorization });
      if (res.status === 404) {
        await res.body?.cancel().catch(() => undefined);
        return null;
      }
      if (!res.ok) throw await failure(res, 'catalog personalized get');
      return parse<CatalogPersonalizedListing>(res);
    },
    async checkCart(lines, authorization, trace) {
      const res = await request('/catalog/preferences/check', trace, {
        method: 'POST',
        authorization,
        body: JSON.stringify({ lines }),
      });
      if (!res.ok) throw await failure(res, 'catalog cart check');
      return (await parse<{ lines: CatalogCartLineCheck[] }>(res)).lines;
    },
    async getPreferences(authorization, trace) {
      const res = await request('/catalog/preferences', trace, { authorization });
      if (!res.ok) throw await failure(res, 'catalog preferences');
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
      if (!res.ok) throw await failure(res, 'catalog save preferences');
      return { kind: 'saved', preferences: await parse<CatalogPreferences>(res) };
    },
    async tags(kind, trace) {
      const res = await request(`/catalog/tags${kind ? `?${new URLSearchParams({ kind })}` : ''}`, trace);
      if (!res.ok) throw await failure(res, 'catalog tags');
      return (await parse<{ items: CatalogTag[] }>(res)).items;
    },
    async list({ limit, after, tags }, trace) {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (after) qs.set('after', after);
      for (const tag of tags ?? []) qs.append('tag', tag);
      const res = await request(`/catalog/listings?${qs}`, trace);
      if (!res.ok) throw await failure(res, 'catalog list');
      return parse<CatalogPage>(res);
    },
    async get(id, trace) {
      const res = await request(`/catalog/listings/${encodeURIComponent(id)}`, trace);
      if (res.status === 404) return null;
      if (!res.ok) throw await failure(res, 'catalog get');
      return parse<CatalogListing>(res);
    },
  };
}

const parse = <T>(res: Response) => parseJson<T>(res, 'catalog');
