import type { Page, Route } from '@playwright/test';

// A logged-in vendor without the real issuer: the issuer is stubbed inside the browser (page.route), so the whole Authorization Code + PKCE
// flow runs for real in the page, and the token is a fake with the right claims. The mock BFF is steered through POST /__state.

export const ISSUER = 'http://localhost:5100';
export const APP = 'http://localhost:3100';
export const MOCK = 'http://localhost:4101';

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

export function fakeToken(claims: Record<string, unknown> = {}) {
  const payload = {
    sub: 'vendor-shop-001',
    name: 'Corner Bakery (owner)',
    email: 'owner@cornerbakery.local',
    roles: 'Vendor',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  };
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(payload)}.${Buffer.from('not-a-real-signature').toString('base64url')}`;
}

export interface Issuer {
  authorizeUrls: URL[];
  tokenBodies: URLSearchParams[];
}

/** Stubs the issuer: /authorize redirects straight back with a code; /token answers with `token`. */
export async function stubIssuer(page: Page, opts: { token?: string } = {}): Promise<Issuer> {
  const seen: Issuer = { authorizeUrls: [], tokenBodies: [] };
  await page.route(`${ISSUER}/authorize*`, async (route: Route) => {
    const url = new URL(route.request().url());
    seen.authorizeUrls.push(url);
    await route.fulfill({
      status: 302,
      headers: { location: `${APP}/auth/callback?code=code-1&state=${url.searchParams.get('state')}` },
    });
  });
  await page.route(`${ISSUER}/token`, async (route: Route) => {
    seen.tokenBodies.push(new URLSearchParams(route.request().postData() ?? ''));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': APP },
      body: JSON.stringify({ access_token: opts.token ?? fakeToken(), token_type: 'Bearer', expires_in: 3600 }),
    });
  });
  return seen;
}

export interface MockOrder {
  id: string;
  reference: string;
  status: string;
  itemCount?: number;
  automatic?: boolean;
  placedAt?: string | null;
  updatedAt?: string;
  pickupWindow?: { start: string; end: string } | null;
  pickupInstructions?: string | null;
  lines?: {
    listingId: string;
    listingName: string | null;
    quantity: number;
    modifiers: { id: string; name: string | null }[];
  }[];
}

/** An order with every field the queue asks for; override what a test cares about. */
export function order(o: MockOrder) {
  return {
    itemCount: 1,
    automatic: false,
    placedAt: '2026-11-02T13:00:00+00:00',
    updatedAt: '2026-11-02T13:00:00+00:00',
    pickupWindow: null,
    pickupInstructions: null,
    lines: [{ listingId: 'bGlzdGluZw==', listingName: 'Country Sourdough', quantity: 1, modifiers: [] }],
    ...o,
  };
}

/** Sets what the mock BFF answers with (and, optionally, how it fails). */
export async function setMock(state: { orders?: ReturnType<typeof order>[]; mode?: string }): Promise<void> {
  const res = await fetch(`${MOCK}/__state`, { method: 'POST', body: JSON.stringify(state) });
  if (!res.ok) throw new Error('the mock BFF did not take the state');
}

export async function resetMock(): Promise<void> {
  await fetch(`${MOCK}/__reset`, { method: 'POST' });
}

export async function mockRequests(): Promise<{ requests: number; authorizations: (string | null)[] }> {
  return (await fetch(`${MOCK}/__state`)).json();
}

/** Logs in through the stubbed issuer and lands on the queue. */
export async function logInAsVendor(page: Page): Promise<void> {
  await stubIssuer(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).first().click();
}
