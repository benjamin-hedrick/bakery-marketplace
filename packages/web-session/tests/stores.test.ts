import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';
import { createMemoryStore, createRedisStore, newMemoryBacking, type MemoryBacking } from '../src/store.ts';
import type { Sealer } from '../src/crypto.ts';
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
