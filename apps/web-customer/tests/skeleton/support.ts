import { createHash, randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';

const ISSUER = process.env.ISSUER_URL ?? 'http://localhost:5100';

/**
 * A real access token from the local mock issuer for one of its users, by the same Authorization Code + PKCE exchange the browser does
 * (without the browser). `user-customer-1` is the customer; `vendor-shop-001` owns the seeded bakery.
 */
export async function userToken(userId: string): Promise<string> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = 'http://localhost:3000/api/auth/callback';
  const submit = await fetch(`${ISSUER}/authorize/submit`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({
      userId,
      redirect_uri: redirectUri,
      state: 's',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }),
  });
  const code = new URL(submit.headers.get('location')!).searchParams.get('code')!;
  const res = await fetch(`${ISSUER}/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  return ((await res.json()) as { access_token: string }).access_token;
}

export const globalId = (type: string, serviceId: string) => Buffer.from(`${type}:${serviceId}`).toString('base64');

const CATALOG = process.env.CATALOG_URL ?? 'http://localhost:5200';

/**
 * The vendor's own view of a listing's quantity (+1 then -1: the response to an adjustment shows the count). Only the owner can read the
 * exact number; customers see a status. Use a token from {@link userToken} for `vendor-shop-001`.
 */
export async function quantity(request: APIRequestContext, vendorToken: string, listing: string): Promise<number> {
  const body = await adjustStock(request, vendorToken, listing, 1);
  await adjustStock(request, vendorToken, listing, -1);
  return body.stock.availableQuantity - 1;
}

/** Adds (or, when negative, removes) units on the vendor's own listing. Returns the vendor's view of the listing afterwards. */
export async function adjustStock(request: APIRequestContext, vendorToken: string, listing: string, delta: number) {
  const res = await request.post(`${CATALOG}/catalog/listings/${listing}/stock/adjust`, {
    data: { delta },
    headers: { authorization: `Bearer ${vendorToken}` },
  });
  return (await res.json()) as { stock: { availableQuantity: number } };
}
