import type { Page } from '@playwright/test';

// A logged-in vendor in the browser tests. The login runs for real: the page sends the browser to /api/auth/login, the app's server goes to the
// fake issuer (packages/web-session/test-support/fake-issuer.mjs), exchanges the code, and sets the session cookie. The mock BFF and the fake
// issuer are steered through their control endpoints (POST /__state).

export const APP = 'http://localhost:3100';
export const MOCK = 'http://localhost:4101';
export const ISSUER = 'http://localhost:5101';

export interface IssuerSeen {
  user: string;
  mode: string;
  accessSeconds: number;
  authorize: Record<string, string>[];
  tokens: { grant: string; clientId: string | null; hasSecret: boolean; hasVerifier: boolean }[];
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

const post = async (url: string, body: unknown) => {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} did not take the state`);
};

/** Sets what the mock BFF answers with (and, optionally, how it fails). */
export const setMock = (state: { orders?: ReturnType<typeof order>[]; mode?: string }) =>
  post(`${MOCK}/__state`, state);

/** Sets who logs in at the fake issuer, how long a token lives, and how the issuer misbehaves (ok | down | revoked | bad-exchange). */
export const setIssuer = (state: {
  user?: 'vendor' | 'customer';
  accessSeconds?: number;
  refreshable?: boolean;
  mode?: string;
}) => post(`${ISSUER}/__state`, state);

export async function resetAll(): Promise<void> {
  await post(`${MOCK}/__reset`, {});
  await post(`${ISSUER}/__reset`, {});
}

export async function mockRequests(): Promise<{ requests: number; authorizations: (string | null)[] }> {
  return (await fetch(`${MOCK}/__state`)).json();
}

export async function issuerSeen(): Promise<IssuerSeen> {
  return (await fetch(`${ISSUER}/__state`)).json();
}

/** Logs in through the fake issuer by the real flow and waits until the header shows who is logged in. */
export async function logInAsVendor(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).first().click();
  await page.getByTestId('user-name').waitFor();
}

/** Opens the page and clicks Log in without waiting for the result (for the cases where the login fails). */
export async function startLoginOnly(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).first().click();
}
