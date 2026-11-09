import { DownstreamError } from './errors.ts';

// What the catalog and ordering clients have in common: the call, the refusal and the reading of a body. The messages carry the service's name and
// the step, never a URL, a body or a credential; they are logged, and the client never sees them (ADR-0013).

/** The call itself. Only the error's name is kept: a message can carry the URL, and nothing here may carry the credential. */
export async function callDownstream(
  fetchImpl: typeof fetch,
  service: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (e) {
    throw new DownstreamError(`${service} request failed: ${e instanceof Error ? e.name : 'error'}`);
  }
}

/** A refusal to throw: the unread body is let go first, so a refused call does not hold its connection. `step` reads "catalog list", "ordering checkout". */
export async function failure(res: Response, step: string): Promise<DownstreamError> {
  await res.body?.cancel().catch(() => undefined);
  return new DownstreamError(`${step} returned ${res.status}`, res.status);
}

/** The body as JSON. One that is not JSON is not trusted as an answer. */
export async function parseJson<T>(res: Response, service: string): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new DownstreamError(`${service} returned a body that is not JSON`, res.status);
  }
}
