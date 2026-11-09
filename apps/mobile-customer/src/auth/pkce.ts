import { randomUrlSafe as randomWith } from '@bakery/customer-core';
import * as Crypto from 'expo-crypto';

const toBase64Url = (b64: string) => b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

/** A random URL-safe string from the platform's secure random source (the encoding is customer-core's, shared with the web). */
export function randomUrlSafe(bytes = 32): string {
  return randomWith(bytes, (b) => Crypto.getRandomValues(b));
}

/** The PKCE pair (RFC 7636, S256): the verifier stays in the app, the challenge goes to the issuer. */
export async function newPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomUrlSafe(48);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { verifier, challenge: toBase64Url(digest) };
}
