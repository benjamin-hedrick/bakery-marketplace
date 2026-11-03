import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

// WI-SEC-005 (register item 136): a request body whose `variables` was not an object ended the whole BFF process (graphql-js threw inside an
// async request handler and nothing caught it). These tests start the real process, because only a process can show that it died.

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

async function withBff<T>(run: (url: string, exited: () => boolean) => Promise<T>): Promise<T> {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/main.ts'], {
    env: {
      ...process.env,
      BFF_PORT: String(port),
      CATALOG_URL: 'http://127.0.0.1:9',
      ORDERING_URL: 'http://127.0.0.1:9',
    },
    stdio: 'ignore',
  });
  let gone = false;
  child.on('exit', () => (gone = true));
  const url = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${url}/healthz`)).ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    return await run(url, () => gone);
  } finally {
    child.kill();
  }
}

const post = (url: string, body: unknown) =>
  fetch(`${url}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

describe('the BFF process survives a malformed operation body', () => {
  test('variables that are not an object, or an operationName that is not a string, are a 400 and the process keeps serving', async () => {
    await withBff(async (url, exited) => {
      const bad: unknown[] = [
        { query: '{ __typename }', variables: 'x' },
        { query: '{ __typename }', variables: 7 },
        { query: '{ __typename }', variables: [1, 2] },
        { query: '{ __typename }', variables: true },
        { query: '{ __typename }', operationName: 7 },
        { query: '{ __typename }', operationName: { a: 1 } },
        { query: '{ __typename }', operationName: [] },
      ];
      for (const body of bad) {
        const res = await post(url, body);
        assert.equal(res.status, 400, JSON.stringify(body));
        const json = (await res.json()) as { errors: { extensions: { code: string } }[] };
        assert.equal(json.errors[0]!.extensions.code, 'BAD_REQUEST');
        assert.equal(exited(), false, `the process ended after ${JSON.stringify(body)}`);
      }
      assert.equal((await fetch(`${url}/healthz`)).status, 200);
    });
  });

  test('null variables and a null operationName are the same as absent, and a normal operation still works', async () => {
    await withBff(async (url) => {
      const res = await post(url, { query: '{ __typename }', variables: null, operationName: null });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { data: { __typename: 'Query' } });
    });
  });

  test('a variable that cannot be coerced is the caller’s mistake, not an INTERNAL error', async () => {
    await withBff(async (url) => {
      for (const variables of [{ id: { a: 1 } }, { id: ['x'] }]) {
        const res = await post(url, { query: 'query($id: ID!) { listing(id: $id) { id } }', variables });
        const json = (await res.json()) as { errors: { message: string; extensions?: { code?: string } }[] };
        assert.equal(res.status, 200);
        assert.notEqual(json.errors[0]!.extensions?.code, 'INTERNAL', JSON.stringify(variables));
        assert.match(json.errors[0]!.message, /^Variable "\$id" got invalid value/);
      }
    });
  });
});
