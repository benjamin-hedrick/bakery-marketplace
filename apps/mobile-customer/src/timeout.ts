// `fetch` with a time limit. React Native's fetch has no timeout of its own, so a network that accepts the connection and then goes quiet would leave a
// screen on its spinner for ever. An AbortController is used rather than `AbortSignal.timeout`, which not every React Native runtime has.

/** The BFF: longer than its own checkout timeout (15 seconds by default), so a slow checkout is answered by the BFF. */
export const BFF_TIMEOUT_MS = 30_000;

/** The issuer's token endpoint. */
export const ISSUER_TIMEOUT_MS = 10_000;

/** Waits at most `ms` for the answer to start (its headers); a call that takes longer is aborted and `fetch` rejects, as for any network failure. */
export async function fetchWithin(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
