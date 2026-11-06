// A fake of expo-crypto backed by Node's crypto, so the PKCE challenge is a real SHA-256 and a test can check it against the verifier.
import { createHash, randomFillSync } from 'node:crypto';

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' } as const;
export const CryptoEncoding = { BASE64: 'base64' } as const;
export function getRandomValues<T extends Uint8Array>(array: T): T {
  return randomFillSync(array);
}
export async function digestStringAsync(_algorithm: string, data: string, _options: unknown) {
  return createHash('sha256').update(data).digest('base64');
}
