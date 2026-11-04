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
  actionMode: 'ok', // ok | conflict | notfound | forbidden | error | slow
  actionDelayMs: 0, // answer the mutation after this long (an action "in flight")
  listSnapshot: null, // when set, the list answers with this instead of the live orders (a read that is behind the stream)
  tagsMode: 'ok', // ok | fail: the allergen registry the cards take their labels from
  tags: [
    ['dairy', 'Milk (dairy)'],
    ['egg', 'Eggs'],
    ['fish', 'Fish'],
    ['shellfish', 'Shellfish'],
    ['tree-nut', 'Tree nuts'],
    ['peanut', 'Peanuts'],
    ['gluten', 'Gluten (wheat, rye, barley)'],
    ['soy', 'Soy'],
    ['sesame', 'Sesame'],
  ].map(([id, label]) => ({ id, label })),
  tagReads: 0,
  actions: [], // each vendorOrderAction received: { action, orderId, authorization }
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

// What ordering does with an action, as far as the screen can tell: the order moves to its next status (sequence + 1) and the change is pushed
// to the open streams; a completed or declined order leaves the list (the queue lists orders in progress). Which action is allowed from which
// status is ordering's rule; the mock keeps only enough of it to move an order along.
const NEXT = {
  CONFIRM: ['PLACED', 'CONFIRMED'],
  DECLINE: ['PLACED', 'CANCELLED'],
  START_PREPARATION: ['CONFIRMED', 'IN_PREPARATION'],
  MARK_READY: ['IN_PREPARATION', 'READY_FOR_FULFILLMENT'],
  COMPLETE: ['READY_FOR_FULFILLMENT', 'COMPLETED'],
};

async function vendorOrderAction(res, req, query, variables) {
  const { orderId, action } = variables.input ?? {};
  state.actions.push({ action, orderId, authorization: req.headers.authorization ?? null });
  if (state.actionDelayMs > 0) await new Promise((r) => setTimeout(r, state.actionDelayMs));
  if (state.actionMode === 'forbidden') return send(res, 200, error('FORBIDDEN', 'Not allowed.'));
  if (state.actionMode === 'error') return send(res, 500, { error: 'boom' });
  const found = state.orders.find((o) => o.id === orderId);
  const rejected = (code) =>
    send(res, 200, { data: { vendorOrderAction: { __typename: 'VendorOrderActionRejected', code } } });
  if (state.actionMode === 'notfound' || !found) return rejected('NOT_FOUND');
  const [from, to] = NEXT[action] ?? [];
  if (state.actionMode === 'conflict' || found.status !== from) return rejected('NOT_ALLOWED_NOW');
  found.status = to;
  found.sequence = (found.sequence ?? 1) + 1;
  found.updatedAt = new Date().toISOString();
  for (const s of streams) s.res.write(sse('next', { data: { vendorOrderChanged: found } }));
  if (to === 'COMPLETED' || to === 'CANCELLED') state.orders = state.orders.filter((o) => o.id !== orderId);
  return send(res, 200, { data: { vendorOrderAction: { __typename: 'VendorOrderActionDone', orderId, status: to } } });
}

http
  .createServer(async (req, res) => {
    if (req.url === '/healthz') return send(res, 200, { ok: true });

    if (req.url === '/__state' && req.method === 'POST') {
      const next = JSON.parse(await readBody(req));
      for (const key of [
        'orders',
        'mode',
        'streamMode',
        'heartbeatMs',
        'actionMode',
        'actionDelayMs',
        'listSnapshot',
        'tagsMode',
      ])
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
        actions: state.actions,
        tagReads: state.tagReads,
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
      for (const s of streams) s.res.write(sse('next', { data: { vendorOrderChanged: { allergens: [], ...order } } }));
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
      const { query = '', variables = {} } = JSON.parse((await readBody(req)) || '{}');
      if (req.headers.accept === 'text/event-stream' && query.includes('vendorOrderChanged'))
        return openStream(req, res);
      // The registry is public, like the real one: no login needed, and not counted as a queue read.
      if (query.includes('QueueBoardAllergenLabelsQuery')) {
        state.tagReads += 1;
        return state.tagsMode === 'fail'
          ? send(res, 500, { error: 'boom' })
          : send(res, 200, { data: { tags: state.tags } });
      }
      state.requests += 1;
      state.authorizations.push(req.headers.authorization ?? null);
      if (!req.headers.authorization || state.mode === 'unauthenticated') {
        return send(res, 200, error('UNAUTHENTICATED', 'Log in to continue.'));
      }
      if (state.mode === 'forbidden') return send(res, 200, error('FORBIDDEN', 'Not allowed.'));
      if (state.mode === 'error') return send(res, 500, { error: 'boom' });
      if (query.includes('vendorOrderAction')) return vendorOrderAction(res, req, query, variables);
      if (query.includes('vendorOrders')) {
        return send(res, 200, {
          data: {
            vendorOrders: {
              edges: (state.listSnapshot ?? state.orders).map((node) => ({
                cursor: node.id,
                node: { allergens: [], ...node },
              })),
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
