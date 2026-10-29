import { createHash, randomBytes } from 'node:crypto';

const ISSUER = process.env.ISSUER_URL ?? 'http://localhost:5100';

/**
 * A real access token from the local mock issuer for one of its users, by the same Authorization Code + PKCE exchange the browser does
 * (without the browser). `user-customer-1` is the customer; `vendor-shop-001` owns the seeded bakery.
 */
export async function userToken(userId: string): Promise<string> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = 'http://localhost:3000/auth/callback';
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
