// Shared by the session and API tests: a scripted fetch, a fresh copy of the app modules per test, and a fake clock.
import { mock } from 'node:test';
import * as secure from './fakes/secure-store.ts';
import * as browser from './fakes/web-browser.ts';

export const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
export const REFRESH_KEY = 'bakery.refreshToken'; // the key session.ts uses; asserting on it means a rename is noticed

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}
/** A scripted answer: a status with a JSON body, a status whose body is not JSON (`notJson`: reading it throws, as for an HTML error page), or a thrown error (a network failure). */
export type Reply = { status: number; json?: unknown; notJson?: boolean } | Error;

/** Replaces fetch with a script: `route(call)` answers each request. Every request is recorded. */
export function fakeFetch(route: (call: Call) => Reply | Promise<Reply>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)),
      body: String(init.body ?? ''),
    };
    calls.push(call);
    const reply = await route(call);
    if (reply instanceof Error) throw reply;
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => {
        if (reply.notJson) throw new SyntaxError('Unexpected token < in JSON at position 0');
        return reply.json;
      },
    } as Response;
  }) as typeof fetch;
  return calls;
}

export const tokenCalls = (calls: Call[]) => calls.filter((c) => c.url.endsWith('/token'));
export const form = (call: Call) => Object.fromEntries(new URLSearchParams(call.body));
export const tokens = (access: string, extra: Record<string, unknown> = {}) => ({
  status: 200,
  json: { access_token: access, expires_in: 3600, ...extra },
});

let counter = 0;
/** A fresh copy of the session and API modules (their state is in module variables), with the fakes and the clock reset. */
export async function freshApp() {
  secure.reset();
  browser.reset();
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: NOW });
  const inst = ++counter;
  const session = await import(`../src/auth/session.ts?inst=${inst}`);
  const api = await import(`../src/api.ts?inst=${inst}`);
  return { session: session as typeof import('../src/auth/session.ts'), api: api as typeof import('../src/api.ts') };
}

export const advance = (ms: number) => mock.timers.setTime(Date.now() + ms);
export const seedRefreshToken = (value = 'refresh-1') => secure.store.set(REFRESH_KEY, value);
export const storedRefreshToken = () => secure.store.get(REFRESH_KEY);
