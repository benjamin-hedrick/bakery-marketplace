// A stand-in for the GraphQL BFF for the browser tests of the queue display. It answers `vendorOrders` from a list the tests set through
// POST /__state, and speaks the BFF's error shape, so the display's handling of a missing login, a non-vendor login and a failing service can
// be checked without the real stack. It also serves `Subscription.vendorOrderChanged` as the real BFF does (graphql-sse, distinct connections: a
// POST asking for text/event-stream), with controls to push a change, end the stream the way an expired token does, drop the connection, or go
// silent. By default a subscription is refused (streamMode "unavailable"), which is what the real BFF does when live updates are down: the
// display then polls, and the tests that predate live updates are unchanged. Not used outside tests.
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 4101);

const initial = () => ({
  orders: [],
  mode: 'ok',
  requests: 0,
  authorizations: [],
  streamMode: 'unavailable', // ok | unavailable
  streamRequests: 0,
  streamAuthorizations: [],
  heartbeatMs: 12000, // 0 = never (a silent stream)
});
const state = initial();
const streams = new Set(); // { res, timer }

const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const error = (code, message) => ({ errors: [{ message, extensions: { code } }], data: null });
const sse = (event, data) => `event: ${event}\ndata: ${data === undefined ? '' : JSON.stringify(data)}\n\n`;

function closeStreams(how) {
  for (const s of [...streams]) {
    clearInterval(s.timer);
    streams.delete(s);
    if (how === 'drop') s.res.destroy();
    else if (how === 'complete') s.res.end(sse('complete'));
    else s.res.destroy();
  }
}

function openStream(req, res) {
  state.streamRequests += 1;
  state.streamAuthorizations.push(req.headers.authorization ?? null);
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    'content-encoding': 'none',
    connection: 'keep-alive',
  });
  // What the real BFF sends: a refusal is an error as the first event; an established subscription says so first.
  if (!req.headers.authorization || state.mode === 'unauthenticated') {
    res.end(sse('next', error('UNAUTHENTICATED', 'Log in to continue.')) + sse('complete'));
    return;
  }
  if (state.streamMode !== 'ok' || state.mode === 'forbidden') {
    const refusal =
      state.mode === 'forbidden' ? error('FORBIDDEN', 'Not allowed.') : error('INTERNAL', 'Something went wrong.');
    res.end(':\n\n' + sse('next', refusal) + sse('complete'));
    return;
  }
  res.write(': ready\n\n:\n\n');
  const stream = { res, timer: undefined };
  if (state.heartbeatMs > 0) stream.timer = setInterval(() => res.write(':\n\n'), state.heartbeatMs);
  streams.add(stream);
  res.once('close', () => {
    clearInterval(stream.timer);
    streams.delete(stream);
  });
}

http
  .createServer(async (req, res) => {
    if (req.url === '/healthz') return send(res, 200, { ok: true });

    if (req.url === '/__state' && req.method === 'POST') {
      const next = JSON.parse(await readBody(req));
      for (const key of ['orders', 'mode', 'streamMode', 'heartbeatMs'])
        if (next[key] !== undefined) state[key] = next[key];
      return send(res, 200, { ok: true });
    }
    if (req.url === '/__state' && req.method === 'GET') {
      return send(res, 200, {
        requests: state.requests,
        authorizations: state.authorizations,
        mode: state.mode,
        streamRequests: state.streamRequests,
        streamAuthorizations: state.streamAuthorizations,
        openStreams: streams.size,
      });
    }
    if (req.url === '/__reset' && req.method === 'POST') {
      closeStreams('drop');
      Object.assign(state, initial());
      return send(res, 200, { ok: true });
    }
    // Controls for the live tests.
    if (req.url === '/__push' && req.method === 'POST') {
      const { order } = JSON.parse(await readBody(req));
      for (const s of streams) s.res.write(sse('next', { data: { vendorOrderChanged: order } }));
      return send(res, 200, { ok: true, streams: streams.size });
    }
    if (req.url === '/__end' && req.method === 'POST') {
      closeStreams('complete'); // as the BFF does when ordering reports the token expired
      return send(res, 200, { ok: true });
    }
    if (req.url === '/__drop' && req.method === 'POST') {
      closeStreams('drop'); // the connection is cut
      return send(res, 200, { ok: true });
    }

    if (req.url === '/graphql' && req.method === 'POST') {
      const { query = '' } = JSON.parse((await readBody(req)) || '{}');
      if (req.headers.accept === 'text/event-stream' && query.includes('vendorOrderChanged'))
        return openStream(req, res);
      state.requests += 1;
      state.authorizations.push(req.headers.authorization ?? null);
      if (!req.headers.authorization || state.mode === 'unauthenticated') {
        return send(res, 200, error('UNAUTHENTICATED', 'Log in to continue.'));
      }
      if (state.mode === 'forbidden') return send(res, 200, error('FORBIDDEN', 'Not allowed.'));
      if (state.mode === 'error') return send(res, 500, { error: 'boom' });
      if (query.includes('vendorOrders')) {
        return send(res, 200, {
          data: {
            vendorOrders: {
              edges: state.orders.map((node) => ({ cursor: node.id, node })),
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });
      }
      return send(res, 200, error('INTERNAL', 'Unsupported query in the mock.'));
    }

    send(res, 404, { error: 'not found' });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`mock BFF for the queue display on :${PORT}`));
