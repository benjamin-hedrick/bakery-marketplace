import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import type { SessionStore } from '../src/store.ts';
import type { SessionRecord } from '../src/types.ts';
import { newSealer } from './helpers.ts';
import type { Sealer } from '../src/crypto.ts';

// One contract for every SessionStore (the repository's adapter pattern): the memory store and the Redis store both run exactly these.

export interface StoreHandle {
  store: SessionStore;
  /** The sealed text stored under a session id, as the backing store holds it. */
  rawGet(id: string): Promise<string | null>;
  rawSet(id: string, sealed: string): Promise<void>;
  /** A second store over the same backing data, but with a different sealer (another key). */
  withSealer(sealer: Sealer): StoreHandle;
  close(): Promise<void>;
}

export type StoreFactory = (sealer: Sealer) => Promise<StoreHandle> | StoreHandle;

const id = () => randomBytes(12).toString('base64url');

export function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const now = Date.now();
  return {
    subject: `vendor-${id()}`,
    name: 'Corner Bakery (owner)',
    email: 'owner@cornerbakery.local',
    roles: ['Vendor'],
    accessToken: 'access-token-very-secret',
    refreshToken: 'refresh-token-very-secret',
    accessExpiresAt: now + 3_600_000,
    createdAt: now,
    lastSeenAt: now,
    absoluteExpiresAt: now + 3_600_000,
    ...overrides,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function runStoreContract(name: string, factory: StoreFactory, options: { skip?: string } = {}): void {
  const t = (title: string, body: (handle: StoreHandle) => Promise<void>) =>
    test(`${name}: ${title}`, { skip: options.skip }, async () => {
      const handle = await factory(newSealer());
      try {
        await body(handle);
      } finally {
        await handle.close();
      }
    });

  t('a created session is read back whole', async ({ store }) => {
    const sessionId = id();
    const created = record();

    await store.create(sessionId, created);

    assert.deepEqual(await store.get(sessionId), created);
  });

  t('an unknown id is null', async ({ store }) => {
    assert.equal(await store.get(id()), null);
  });

  t('saving replaces a session that exists, and does not bring back one that does not', async ({ store }) => {
    const sessionId = id();
    const created = record();
    await store.create(sessionId, created);

    await store.save(sessionId, { ...created, accessToken: 'renewed' });
    await store.save('never-created', created);

    assert.equal((await store.get(sessionId))?.accessToken, 'renewed');
    assert.equal(await store.get('never-created'), null);
  });

  t('a session ends by itself at its absolute expiry', async ({ store }) => {
    const sessionId = id();
    await store.create(sessionId, record({ absoluteExpiresAt: Date.now() + 1500 }));
    assert.ok(await store.get(sessionId));

    await sleep(2300);

    assert.equal(await store.get(sessionId), null);
  });

  t('deleting a session removes it, and deleting one that is gone is not an error', async ({ store }) => {
    const sessionId = id();
    await store.create(sessionId, record());

    await store.delete(sessionId);
    await store.delete(sessionId);

    assert.equal(await store.get(sessionId), null);
  });

  t('ending every session of one person leaves other people alone', async ({ store }) => {
    const mine = [id(), id()];
    const theirs = id();
    const owner = `vendor-${id()}`;
    for (const sessionId of mine) await store.create(sessionId, record({ subject: owner }));
    await store.create(theirs, record());

    const ended = await store.deleteBySubject(owner);

    assert.equal(ended, 2);
    for (const sessionId of mine) assert.equal(await store.get(sessionId), null);
    assert.ok(await store.get(theirs));
    assert.equal(await store.deleteBySubject(owner), 0);
  });

  t('a session deleted on its own is not counted again when its person is ended', async ({ store }) => {
    const owner = `vendor-${id()}`;
    const [a, b] = [id(), id()];
    await store.create(a, record({ subject: owner }));
    await store.create(b, record({ subject: owner }));
    await store.delete(a);

    assert.equal(await store.deleteBySubject(owner), 1);
  });

  t('a pending login can be taken once', async ({ store }) => {
    const pendingId = id();
    const pending = { state: 's', verifier: 'v'.repeat(43), returnTo: '/', createdAt: Date.now() };
    await store.putPending(pendingId, pending, 60);

    assert.deepEqual(await store.takePending(pendingId), pending);
    assert.equal(await store.takePending(pendingId), null);
    assert.equal(await store.takePending(id()), null);
  });

  t('a pending login expires', async ({ store }) => {
    const pendingId = id();
    await store.putPending(pendingId, { state: 's', verifier: 'v', returnTo: '/', createdAt: Date.now() }, 1);

    await sleep(1300);

    assert.equal(await store.takePending(pendingId), null);
  });

  t('a lock is exclusive until released, and expires by itself', async ({ store }) => {
    const sessionId = id();
    const release = await store.acquireLock(sessionId, 5000);
    assert.ok(release);

    assert.equal(await store.acquireLock(sessionId, 5000), null);
    await release();
    const again = await store.acquireLock(sessionId, 400);
    assert.ok(again);
    assert.equal(await store.acquireLock(sessionId, 400), null);
    await sleep(600);
    const afterExpiry = await store.acquireLock(sessionId, 400);
    assert.ok(afterExpiry);
    await again(); // a late release of an expired lock must not free the new holder's lock
    assert.equal(await store.acquireLock(sessionId, 400), null);
  });

  t('what the backing store holds is ciphertext: no token or name is visible in it', async (handle) => {
    const sessionId = id();
    await handle.store.create(sessionId, record());

    const raw = await handle.rawGet(sessionId);

    assert.ok(raw);
    assert.doesNotMatch(raw, /very-secret|Corner Bakery|owner@|Vendor|refreshToken/);
  });

  t('with another key the session reads as missing, not as an error', async (handle) => {
    const sessionId = id();
    await handle.store.create(sessionId, record());

    const other = handle.withSealer(newSealer());
    try {
      assert.equal(await other.store.get(sessionId), null);
    } finally {
      await other.close();
    }
    assert.ok(await handle.store.get(sessionId)); // and the right key still reads it
  });

  t('a record copied under another id cannot be opened there', async (handle) => {
    const original = id();
    const copy = id();
    await handle.store.create(original, record());
    await handle.store.create(copy, record());
    const sealed = await handle.rawGet(original);
    await handle.rawSet(copy, sealed!);

    assert.equal(await handle.store.get(copy), null);
    assert.ok(await handle.store.get(original));
  });
}
