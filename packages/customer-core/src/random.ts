// A random URL-safe string for idempotency keys, OAuth state and the PKCE verifier. The source of randomness is the platform's: the browser and Node have
// `crypto.getRandomValues`, the Android app brings expo-crypto's. Pure otherwise, so the web apps and the app share one encoding.

type FillRandom = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array;

/** `bytes` random bytes as base64url, with no padding: 32 bytes give 43 characters, the shortest valid PKCE verifier. */
export function randomUrlSafe(bytes = 32, fill: FillRandom = (b) => crypto.getRandomValues(b)): string {
  return btoa(String.fromCharCode(...fill(new Uint8Array(new ArrayBuffer(bytes)))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
