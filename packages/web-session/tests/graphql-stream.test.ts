import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, test } from 'node:test';
import {
  createGraphqlStreamHandler,
  SESSION_ENDED_HEADER,
  type ApiRequest,
  type ApiResponse,
} from '../src/handlers.ts';
import type { StreamResponse } from '../src/graphql-proxy.ts';
import { createSessionService } from '../src/service.ts';
import { createMemoryStore } from '../src/store.ts';
import { ManualClock, errorResponse, fakeIssuer, fakeJwt, newSealer, testConfig, tokenResponse } from './helpers.ts';

// WI-QUE-003 step 5 (ADR-0021): the web app's way to a subscription. Real HTTP servers stand in for the BFF and for the app: what is tested is
// what arrives, when, and with which credential, not a mock of the relay.

const ORIGIN = 'http://localhost:3100';
const SUBSCRIPTION = JSON.stringify({ query: 'subscription { vendorOrderChanged { id } }' });
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** What the BFF stand-in saw, and the open streams it can push to or end. */
function fakeBff() {
  const seen: { headers: http.IncomingHttpHeaders; body: string; method: string }[] = [];
  const open = new Set<http.ServerResponse>();
  let closedByPeer = 0;
  const state = { mode: 'stream' as 'stream' | 'bad-request' | 'down' };
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    seen.push({ headers: req.headers, body: Buffer.concat(chunks).toString(), method: req.method ?? '' });
    if (state.mode === 'bad-request') {
      res.writeHead(400, { 'content-type': 'application/json' }).end('{"errors":[{"message":"bad"}]}');
      return;
    }
    if (state.mode === 'down') return void req.socket.destroy();
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'content-encoding': 'none',
      connection: 'keep-alive',
    });
    res.write(':\n\n');
    open.add(res);
    res.once('close', () => {
      open.delete(res);
      closedByPeer++;
    });
  });
  return {
    server,
    seen,
    open,
    state,
    get closedByPeer() {
      return closedByPeer;
    },
    push: (text: string) => [...open].forEach((r) => r.write(text)),
    end: () => [...open].forEach((r) => r.end('event: complete\ndata:\n\n')),
    url: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/graphql`,
  };
}

const waitFor = async (cond: () => boolean, ms = 3000) => {
  const until = Date.now() + ms;
  while (!cond() && Date.now() < until) await new Promise((r) => setTimeout(r, 10));
  assert.ok(cond(), 'condition did not become true in time');
};

/** Reads the app's response frame by frame. */
class Frames {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffer = '';
  readonly res: Response;
  constructor(res: Response) {
    this.res = res;
    this.reader = res.body!.getReader();
  }
  async cancel(): Promise<void> {
    await this.reader.cancel();
  }
  async next(ms = 3000): Promise<string | null> {
    const until = Date.now() + ms;
    for (;;) {
      const end = this.buffer.indexOf('\n\n');
      if (end >= 0) {
        const frame = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 2);
        return frame;
      }
      const left = until - Date.now();
      if (left <= 0) throw new Error('no frame in time');
      const chunk = await Promise.race([
        this.reader.read(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('no frame in time')), left)),
      ]);
      if (chunk.done) return null;
      this.buffer += new TextDecoder().decode(chunk.value);
    }
  }
}

let bff: ReturnType<typeof fakeBff>;
let clock: ManualClock;
let app: http.Server;
let appUrl: string;
let service: ReturnType<typeof createSessionService>;
let issuer: ReturnType<typeof fakeIssuer>;
let logged: string[];
let sessionCookie: string;
let firstAccessToken: string;

async function start(
  options: { maxOpen?: number; sessionCheckMs?: number; issuerAnswer?: Parameters<typeof fakeIssuer>[0] } = {},
) {
  bff = fakeBff();
  await new Promise<void>((r) => bff.server.listen(0, '127.0.0.1', r));
  clock = new ManualClock();
  logged = [];
  const config = testConfig();
  const store = createMemoryStore(newSealer(), clock.now);
  firstAccessToken = fakeJwt({}, clock.time + 60 * MINUTE);
  issuer = fakeIssuer(
    options.issuerAnswer ??
      ((_call, n) =>
        n === 1
          ? tokenResponse({ access: firstAccessToken, refresh: 'refresh-1' })
          : tokenResponse({
              access: fakeJwt({ jti: `renewed-${n}` }, clock.time + 60 * MINUTE),
              refresh: `refresh-${n}`,
            })),
  );
  service = createSessionService({ config, store, fetch: issuer.fetchImpl, clock });
  const handler = createGraphqlStreamHandler({
    config,
    service,
    target: () => bff.url(),
    log: (e) => logged.push(e),
    sessionCheckMs: options.sessionCheckMs ?? 40,
    ...(options.maxOpen ? { maxOpen: options.maxOpen } : {}),
  });
  app = http.createServer((req, res) => {
    // What the framework adds to a response in the real app.
    const api = res as unknown as ApiResponse & StreamResponse;
    api.status = (code) => {
      res.statusCode = code;
      return res;
    };
    api.json = (body) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
      return res;
    };
    api.send = (body) => {
      res.end(body);
      return res;
    };
    void handler(req as unknown as ApiRequest, api);
  });
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  appUrl = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/graphql-stream`;

  // Log in through the service: the cookie the browser would hold afterwards.
  const begin = await service.startLogin('/');
  const loginCookie = begin.setCookies[0]!.split(';')[0]!;
  const state = new URL(begin.location).searchParams.get('state')!;
  const done = await service.finishLogin(new URLSearchParams({ code: 'c', state }), loginCookie);
  sessionCookie = done.setCookies[0]!.split(';')[0]!;
}

afterEach(async () => {
  for (const r of bff.open) r.destroy();
  app.closeAllConnections();
  bff.server.closeAllConnections();
  await new Promise((r) => app.close(r));
  await new Promise((r) => bff.server.close(r));
});

const open = (extra: Record<string, string> = {}, body = SUBSCRIPTION) =>
  fetch(appUrl, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      accept: 'text/event-stream',
      cookie: sessionCookie,
      ...extra,
    },
    body,
  });

describe('the subscription route', () => {
  beforeEach(() => start());

  test('relays each frame as the BFF sends it, before the stream has ended', async () => {
    const res = await open();
    assert.equal(res.status, 200);
    const frames = new Frames(res);

    assert.equal(await frames.next(), ':'); // the BFF's opening comment, already here although the BFF has not finished
    bff.push('event: next\ndata: {"data":{"n":1}}\n\n');
    assert.equal(await frames.next(), 'event: next\ndata: {"data":{"n":1}}');
    bff.push('event: next\ndata: {"data":{"n":2}}\n\n');
    assert.equal(await frames.next(), 'event: next\ndata: {"data":{"n":2}}');
    bff.end();
    assert.equal(await frames.next(), 'event: complete\ndata:');
    assert.equal(await frames.next(), null);
  });

  test('sends the session token as the bearer, forwards the body, and keeps cookies and a browser-sent Authorization out', async () => {
    const res = await open({ authorization: 'Bearer attacker.supplied.token', 'x-forwarded-for': '1.2.3.4' });
    await new Frames(res).next();

    const seen = bff.seen[0]!;
    assert.equal(seen.method, 'POST');
    assert.equal(seen.headers.authorization, `Bearer ${firstAccessToken}`);
    assert.equal(seen.headers.cookie, undefined);
    assert.equal(seen.headers['x-forwarded-for'], undefined);
    assert.equal(seen.headers.accept, 'text/event-stream');
    assert.equal(seen.body, SUBSCRIPTION);
  });

  test('marks the answer uncacheable and untransformable, drops the BFF connection and encoding headers, and keeps the content type', async () => {
    const res = await open();

    assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);
    assert.equal(res.headers.get('cache-control'), 'no-store, no-transform');
    assert.equal(res.headers.get('x-accel-buffering'), 'no');
    assert.equal(res.headers.get('content-encoding'), null); // the BFF says "none"; passing that on would confuse a browser
    await res.body?.cancel();
  });

  test('closes the call to the BFF as soon as the browser leaves', async () => {
    const frames = new Frames(await open());
    await frames.next();
    await waitFor(() => bff.open.size === 1);

    await frames.cancel();

    await waitFor(() => bff.open.size === 0);
    assert.equal(bff.closedByPeer, 1);
  });

  test('ends the stream when the session is logged out, and the BFF call with it', async () => {
    const res = await open();
    const frames = new Frames(res);
    await frames.next();

    await service.logout(sessionCookie); // from another request or another device

    assert.equal(await frames.next(2000), null);
    await waitFor(() => bff.open.size === 0);
  });

  test('ends the stream when the session passes its idle limit, which an open stream does not extend', async () => {
    const res = await open();
    const frames = new Frames(res);
    await frames.next();

    clock.advance(13 * 60 * MINUTE); // idle limit is 12 hours

    assert.equal(await frames.next(2000), null);
    await waitFor(() => bff.open.size === 0);
  });

  test('a stream that the BFF ends at the token expiry is re-opened with a renewed token', async () => {
    const first = await open();
    const frames = new Frames(first);
    await frames.next();
    assert.equal(bff.seen[0]!.headers.authorization, `Bearer ${firstAccessToken}`);
    clock.advance(59 * MINUTE + 30 * SECOND); // inside the 60-second renewal margin of the first token
    bff.end(); // what the BFF does when ordering reports the token expired
    assert.equal(await frames.next(), 'event: complete\ndata:');
    assert.equal(await frames.next(), null);

    const second = await open();
    await new Frames(second).next();

    assert.equal(issuer.calls.length, 2); // one login, one renewal
    assert.equal(issuer.calls[1]!.body.get('grant_type'), 'refresh_token');
    assert.notEqual(bff.seen[1]!.headers.authorization, `Bearer ${firstAccessToken}`);
    assert.match(bff.seen[1]!.headers.authorization ?? '', /^Bearer ey/);
  });

  test('is refused without a session (401) and never calls the BFF', async () => {
    const res = await open({ cookie: 'nothing=here' });

    assert.equal(res.status, 401);
    assert.equal(bff.seen.length, 0);
  });

  test('is refused from another origin, without a JSON body type, by GET, and for a plain request (403, 403, 405, 406)', async () => {
    assert.equal((await open({ origin: 'https://evil.example' })).status, 403);
    assert.equal((await open({ 'content-type': 'text/plain' })).status, 403);
    assert.equal(
      (await fetch(appUrl, { method: 'GET', headers: { cookie: sessionCookie, accept: 'text/event-stream' } })).status,
      405,
    );
    assert.equal((await open({ accept: 'application/json' })).status, 406);
    assert.equal(bff.seen.length, 0);
    assert.ok(logged.some((l) => l.includes('refused: origin')));
  });

  test('refuses a request body over 64 KB without calling the BFF', async () => {
    const res = await open(
      {},
      JSON.stringify({ query: 'subscription { vendorOrderChanged { id } }', variables: { pad: 'x'.repeat(70_000) } }),
    );

    assert.equal(res.status, 413);
    assert.equal(bff.seen.length, 0);
  });

  test('relays a refusal from the BFF as an ordinary answer, with its status', async () => {
    bff.state.mode = 'bad-request';

    const res = await open();

    assert.equal(res.status, 400);
    assert.equal(res.headers.get('cache-control'), 'no-store, no-transform');
    assert.deepEqual(await res.json(), { errors: [{ message: 'bad' }] });
  });

  test('answers 502 with a fixed message, naming neither the address nor the reason, when the BFF is down', async () => {
    bff.state.mode = 'down';

    const res = await open();

    assert.equal(res.status, 502);
    const text = await res.text();
    assert.equal(text, '{"error":"The GraphQL service could not be reached"}');
    assert.doesNotMatch(text, /127\.0\.0\.1|ECONNRESET/);
  });

  test('never logs the token or the session cookie', async () => {
    await open({ origin: 'https://evil.example' });
    await open({ accept: 'application/json' });
    const res = await open();
    await new Frames(res).next();

    const text = logged.join('\n');
    assert.ok(!text.includes(firstAccessToken));
    assert.ok(!text.includes(sessionCookie.split('=')[1]!));
  });
});

describe('the subscription route, when the login cannot be renewed', () => {
  test('ends the session and says so when the issuer refuses the renewal (401, cookie cleared, session-ended header)', async () => {
    await start({
      issuerAnswer: (_call, n) =>
        n === 1
          ? tokenResponse({ access: fakeJwt({}, clock.time + 60 * MINUTE) })
          : errorResponse('invalid_grant', 400),
    });
    clock.advance(59 * MINUTE + 30 * SECOND);

    const res = await open();

    assert.equal(res.status, 401);
    assert.equal(res.headers.get(SESSION_ENDED_HEADER), '1');
    assert.match(res.headers.get('set-cookie') ?? '', /Max-Age=0|Expires=Thu, 01 Jan 1970/);
    assert.equal(bff.seen.length, 0);
  });

  test('asks the client to try again (503) when the issuer cannot be reached and the token has run out, and keeps the session', async () => {
    await start({
      issuerAnswer: (_call, n) => {
        if (n === 1) return tokenResponse({ access: fakeJwt({}, clock.time + 60 * MINUTE) });
        throw new Error('connection refused');
      },
    });
    clock.advance(61 * MINUTE); // the access token has expired, so the old one cannot be used while the issuer is away

    const res = await open();

    assert.equal(res.status, 503);
    assert.equal(res.headers.get(SESSION_ENDED_HEADER), null);
    assert.equal(bff.seen.length, 0);
  });
});

describe('the subscription route, at its limit', () => {
  test('relays at most maxOpen streams at once, tells the rest to poll, and frees the place when one closes', async () => {
    await start({ maxOpen: 1 });
    const first = new Frames(await open());
    await first.next();

    const refused = await open();

    assert.equal(refused.status, 503);
    assert.equal(refused.headers.get('retry-after'), '30');
    await first.cancel();
    await waitFor(() => bff.open.size === 0);
    await new Promise((r) => setTimeout(r, 30));
    const again = await open();
    assert.equal(again.status, 200);
    await again.body?.cancel();
  });
});
