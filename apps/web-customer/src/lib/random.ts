/** A random url-safe string; 32 bytes gives 43 characters. Used for idempotency keys. */
export function randomUrlSafe(bytes = 32): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
