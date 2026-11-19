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
  sequence?: number;
  itemCount?: number;
  automatic?: boolean;
  placedAt?: string | null;
  updatedAt?: string;
  pickupWindow?: { start: string; end: string } | null;
  pickupInstructions?: string | null;
  /** The allergens the customer named for the order (registry ids); the mock answers an empty list when a test sets none. */
  allergens?: string[];
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
    sequence: 1,
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
export const setMock = (state: {
  orders?: ReturnType<typeof order>[];
  mode?: string;
  /** "ok" serves the subscription; the default, "unavailable", refuses it (the display then polls). */
  streamMode?: 'ok' | 'unavailable';
  /** How often the mock sends a heartbeat on an open stream; 0 is never (a silent stream). */
  heartbeatMs?: number;
  /** How the mock answers a vendor action: ok (moves the order along), conflict, notfound, forbidden, error. */
  actionMode?: 'ok' | 'conflict' | 'notfound' | 'forbidden' | 'error';
  completeMode?: 'ok' | 'lost';
  completeDelayMs?: number;
  /** The mock answers an action after this many milliseconds (an action in flight). */
  actionDelayMs?: number;
  /** Makes the list answer with these orders instead of the live ones (a read that is behind the stream); null puts it back. */
  listSnapshot?: ReturnType<typeof order>[] | null;
  /** "fail" makes the allergen registry unreadable, so the cards show ids. */
  tagsMode?: 'ok' | 'fail';
}) => post(`${MOCK}/__state`, state);

/** Pushes one changed order to every open stream, as the BFF does when ordering reports a change. */
export const pushChange = (changed: ReturnType<typeof order>) => post(`${MOCK}/__push`, { order: changed });

/** Ends every open stream the way the BFF does when the token expires (a normal completion). */
export const endStreams = () => post(`${MOCK}/__end`, {});

/** Cuts every open stream's connection. */
export const dropStreams = () => post(`${MOCK}/__drop`, {});

export async function mockStreams(): Promise<{
  streamRequests: number;
  openStreams: number;
  streamAuthorizations: (string | null)[];
}> {
  return (await fetch(`${MOCK}/__state`)).json();
}

/** Sets who logs in at the fake issuer, how long a token lives, and how the issuer misbehaves (ok | down | revoked | bad-exchange | denied | forged-state). */
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

/** The vendor actions the mock BFF received, in order. */
export async function mockActions(): Promise<{ action: string; orderId: string; authorization: string | null }[]> {
  return ((await (await fetch(`${MOCK}/__state`)).json()) as { actions: never[] }).actions;
}

/** How many times the screen asked for the allergen labels. */
export async function tagReads(): Promise<number> {
  return ((await (await fetch(`${MOCK}/__state`)).json()) as { tagReads: number }).tagReads;
}

export async function mockRequests(): Promise<{ requests: number; authorizations: (string | null)[] }> {
  return (await fetch(`${MOCK}/__state`)).json();
}

// ---- the vendor's listings (WI-CAT-008) ----------------------------------------------------------------------------------------

/** A listing as a test gives it to the mock (mock-bff/listings.mjs builds the BFF's MyListing from it). */
export interface MockListing {
  /** A Listing global id. */
  id: string;
  /** 'other' makes it another vendor's: the mock answers as if it did not exist. */
  vendor?: 'me' | 'other';
  name?: string;
  description?: string | null;
  category?: string;
  priceCents?: number;
  status?: 'DRAFT' | 'PUBLISHED';
  allergenFlags?: string[];
  tags?: string[];
  modifiers?: { id: string; name: string; priceDeltaCents?: number; allergens?: string[]; tags?: string[] }[];
  stock?: { availableQuantity?: number | null; maxPerOrder?: number | null; lowStockThreshold?: number | null };
  editVersion?: number;
  updatedAt?: string;
}

export const listingId = (serviceId: string) => Buffer.from(`Listing:${serviceId}`).toString('base64');

/** Sets the vendor's listings and how the mock answers the listing writes. */
export const setListings = (state: {
  listings?: MockListing[];
  listingMode?: 'ok' | 'invalid' | 'changed' | 'conflict' | 'notverified' | 'error' | 'slow' | 'forbidden' | 'lost';
  listingDelayMs?: number;
  verified?: boolean;
  invalidFields?: { field: string; message: string }[];
}) => post(`${MOCK}/__state`, state);

/** A change made elsewhere: another tab's edit (`edit`, which moves the edit version on) or a customer's order (`sold` units). */
export const changeListingElsewhere = (change: {
  id: string;
  edit?: Partial<{ name: string; description: string }>;
  sold?: number;
}) => post(`${MOCK}/__listing`, change);

export interface ListingWrite {
  op: 'ListingWritesCreateMutation' | 'ListingWritesUpdateMutation' | 'ListingWritesAdjustMutation';
  variables: Record<string, unknown> & {
    input?: Record<string, unknown>;
    key?: string;
    version?: number;
    delta?: number;
    id?: string;
  };
  authorization: string | null;
}

/** The listing writes the mock received, in order, and the listings it holds now. */
export async function mockListings(): Promise<{ writes: ListingWrite[]; listings: MockListing[] }> {
  const state = (await (await fetch(`${MOCK}/__state`)).json()) as {
    listingWrites: ListingWrite[];
    listings: MockListing[];
  };
  return { writes: state.listingWrites, listings: state.listings };
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
