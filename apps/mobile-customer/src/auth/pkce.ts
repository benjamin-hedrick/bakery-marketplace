import * as Crypto from 'expo-crypto';

const toBase64Url = (b64: string) => b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

/** A random URL-safe string from the platform's secure random source. */
export function randomUrlSafe(bytes = 32): string {
  return toBase64Url(btoa(String.fromCharCode(...Crypto.getRandomValues(new Uint8Array(bytes)))));
}

/** The PKCE pair (RFC 7636, S256): the verifier stays in the app, the challenge goes to the issuer. */
export async function newPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomUrlSafe(48);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { verifier, challenge: toBase64Url(digest) };
}
