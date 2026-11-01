// A stand-in for the GraphQL BFF for the browser tests of the queue display. It answers `vendorOrders` from a list the tests set through
// POST /__state, and speaks the BFF's error shape, so the display's handling of a missing login, a non-vendor login and a failing service can
// be checked without the real stack. Not used outside tests.
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 4101);

const state = { orders: [], mode: 'ok', requests: 0, authorizations: [] };

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

http
  .createServer(async (req, res) => {
    if (req.url === '/healthz') return send(res, 200, { ok: true });

    if (req.url === '/__state' && req.method === 'POST') {
      const next = JSON.parse(await readBody(req));
      if (next.orders) state.orders = next.orders;
      if (next.mode) state.mode = next.mode;
      return send(res, 200, { ok: true });
    }
    if (req.url === '/__state' && req.method === 'GET') {
      return send(res, 200, { requests: state.requests, authorizations: state.authorizations, mode: state.mode });
    }
    if (req.url === '/__reset' && req.method === 'POST') {
      Object.assign(state, { orders: [], mode: 'ok', requests: 0, authorizations: [] });
      return send(res, 200, { ok: true });
    }

    if (req.url === '/graphql' && req.method === 'POST') {
      const { query = '' } = JSON.parse((await readBody(req)) || '{}');
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
