// PKCE (RFC 7636) helpers. Web Crypto only, so they run in the browser and in Node. The verifier and challenge are not secrets of the
// user's identity, but the verifier must stay out of the URL: it is the proof that the app that started the login is the one finishing it.

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

/** A random url-safe string; 32 bytes gives 43 characters, the shortest valid verifier. */
export function randomUrlSafe(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** The S256 code challenge for a verifier. */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}
