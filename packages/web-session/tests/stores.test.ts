import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Redis } from 'ioredis';
import {
  createMemoryStore,
  createRedisStore,
  newMemoryBacking,
  SessionStoreUnavailableError,
  type MemoryBacking,
} from '../src/store.ts';
import type { Sealer } from '../src/crypto.ts';
import { newSealer } from './helpers.ts';
import { runStoreContract, type StoreHandle } from './store-contract.ts';

// The memory store always runs. The Redis store runs only against a real Redis (REDIS_CONNECTION_STRING, for example 127.0.0.1:6379) and is
// reported as skipped otherwise, never faked: a pass means Redis was used.

function memoryHandle(sealer: Sealer, backing: MemoryBacking = newMemoryBacking()): StoreHandle {
  return {
    store: createMemoryStore(sealer, Date.now, backing),
    rawGet: async (id) => backing.values.get(`sess:${id}`)?.value ?? null,
    rawSet: async (id, sealed) => {
      const entry = backing.values.get(`sess:${id}`);
      if (entry) entry.value = sealed;
    },
    withSealer: (other) => memoryHandle(other, backing),
    close: async () => {},
  };
}

runStoreContract('memory store', memoryHandle);

const redisAddress = process.env['REDIS_CONNECTION_STRING'];
const redisUrl = redisAddress ? (redisAddress.includes('://') ? redisAddress : `redis://${redisAddress}`) : '';

function redisHandle(sealer: Sealer, prefix = `test-${randomBytes(6).toString('hex')}`): StoreHandle {
  const raw = new Redis(redisUrl);
  const store = createRedisStore(sealer, redisUrl, prefix);
  return {
    store,
    rawGet: (id) => raw.get(`${prefix}:sess:${id}`),
    rawSet: async (id, sealed) => {
      await raw.set(`${prefix}:sess:${id}`, sealed, 'KEEPTTL');
    },
    // The same prefix, so the other store reads the same keys with a different key.
    withSealer: (other) => redisHandle(other, prefix),
    close: async () => {
      await store.close();
      raw.disconnect();
    },
  };
}

runStoreContract('redis store', (sealer) => redisHandle(sealer), {
  skip: redisAddress ? undefined : 'Set REDIS_CONNECTION_STRING (for example 127.0.0.1:6379) to run against Redis.',
});

/** A local port nothing listens on: bound by the system, then released. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

// Needs no Redis: the real adapter is pointed at a port where none listens (register 192).
test('a Redis store that cannot be reached says so with SessionStoreUnavailableError, not a generic error', async () => {
  const store = createRedisStore(newSealer(), `redis://127.0.0.1:${await closedPort()}`, 'unreachable');
  const pending = { state: 's', verifier: 'v', returnTo: '/', createdAt: Date.now() };
  try {
    await Promise.all([
      assert.rejects(store.putPending('p1', pending, 60), SessionStoreUnavailableError),
      assert.rejects(store.takePending('p1'), SessionStoreUnavailableError),
      assert.rejects(store.get('s1'), SessionStoreUnavailableError),
      assert.rejects(store.acquireLock('s1', 1000), SessionStoreUnavailableError),
    ]);
  } finally {
    await store.close();
  }
});
