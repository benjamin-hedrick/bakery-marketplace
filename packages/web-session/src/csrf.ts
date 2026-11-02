import type { IncomingHttpHeaders } from 'node:http';

// Cross-site request forgery checks (ADR-0019). The cookie is SameSite=Lax; on top of that every request that can change anything must come from
// this app's own origin and be JSON, which a cross-site form cannot send without a CORS preflight that is never allowed.

export type CsrfResult = { ok: true } | { ok: false; reason: string };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** A request that may change state: an Origin equal to the app's own, a JSON body type, and no sign that a browser called it cross-site. */
export function checkStateChangingRequest(
  method: string | undefined,
  headers: IncomingHttpHeaders,
  appOrigin: string,
): CsrfResult {
  if (SAFE_METHODS.has((method ?? 'GET').toUpperCase())) return { ok: true };
  if (one(headers['origin']) !== appOrigin) return { ok: false, reason: 'origin' };
  const site = one(headers['sec-fetch-site']);
  if (site !== undefined && site !== 'same-origin') return { ok: false, reason: 'fetch-site' };
  const type = (one(headers['content-type']) ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/json') return { ok: false, reason: 'content-type' };
  return { ok: true };
}

/**
 * A read-only request that nevertheless uses a resource (the push stream): refused when the browser says it comes from another site or origin.
 * A request with neither header (a command-line client, an old browser) is not a cross-site browser request, so it is let through.
 */
export function checkSameOriginRead(headers: IncomingHttpHeaders, appOrigin: string): CsrfResult {
  const origin = one(headers['origin']);
  if (origin !== undefined && origin !== appOrigin) return { ok: false, reason: 'origin' };
  const site = one(headers['sec-fetch-site']);
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return { ok: false, reason: 'fetch-site' };
  return { ok: true };
}
