import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import type { Sealer } from './crypto.ts';
import type { PendingLogin, SessionRecord } from './types.ts';

// The session store (ADR-0019): sessions and pending logins, encrypted at rest, expiring by themselves. Two implementations behind one interface,
// both run through the same contract tests (tests/store-contract.ts): an in-memory one for tests and single-process runs, and Redis.

export interface SessionStore {
  /** Keeps a new session under `id` until its absolute expiry. Registers it under its subject. */
  create(id: string, record: SessionRecord): Promise<void>;
  /** The session, or null when it does not exist, has expired, or cannot be opened (wrong key, altered, moved to another id). */
  get(id: string): Promise<SessionRecord | null>;
  /** Replaces a session that exists; the expiry stays the record's own `absoluteExpiresAt`. */
  save(id: string, record: SessionRecord): Promise<void>;
  delete(id: string): Promise<void>;
  /** Ends every session of one person. Returns how many. */
  deleteBySubject(subject: string): Promise<number>;
  putPending(id: string, pending: PendingLogin, ttlSeconds: number): Promise<void>;
  /** Returns a pending login and removes it in one step, so it can be used once. */
  takePending(id: string): Promise<PendingLogin | null>;
  /** A short exclusive lock on a session (for renewal); null when someone else holds it. Call the returned function to release. */
  acquireLock(id: string, ttlMs: number): Promise<(() => Promise<void>) | null>;
  close(): Promise<void>;
}

const sessionAad = (id: string) => `session:${id}`;
const pendingAad = (id: string) => `pending:${id}`;

function parse<T>(text: string | null): T | null {
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ---- in memory ------------------------------------------------------------------------------------------------------------

export interface MemoryBacking {
  values: Map<string, { value: string; expiresAt: number }>;
  subjects: Map<string, Set<string>>;
  locks: Map<string, { token: string; expiresAt: number }>;
}

export const newMemoryBacking = (): MemoryBacking => ({ values: new Map(), subjects: new Map(), locks: new Map() });

/** Holds sealed records in a map. `backing` can be shared between two stores to show that another key cannot read them. */
export function createMemoryStore(
  sealer: Sealer,
  now: () => number = Date.now,
  backing: MemoryBacking = newMemoryBacking(),
): SessionStore {
  const live = (key: string) => {
    const entry = backing.values.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now()) {
      backing.values.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    async create(id, record) {
      backing.values.set(`sess:${id}`, {
        value: sealer.seal(JSON.stringify(record), sessionAad(id)),
        expiresAt: record.absoluteExpiresAt,
      });
      const ids = backing.subjects.get(record.subject) ?? new Set<string>();
      ids.add(id);
      backing.subjects.set(record.subject, ids);
    },
    async get(id) {
      const entry = live(`sess:${id}`);
      return entry ? parse<SessionRecord>(sealer.open(entry.value, sessionAad(id))) : null;
    },
    async save(id, record) {
      if (!live(`sess:${id}`)) return;
      backing.values.set(`sess:${id}`, {
        value: sealer.seal(JSON.stringify(record), sessionAad(id)),
        expiresAt: record.absoluteExpiresAt,
      });
    },
    async delete(id) {
      backing.values.delete(`sess:${id}`);
      for (const ids of backing.subjects.values()) ids.delete(id);
    },
    async deleteBySubject(subject) {
      let count = 0;
      for (const id of backing.subjects.get(subject) ?? []) {
        if (backing.values.delete(`sess:${id}`)) count++;
      }
      backing.subjects.delete(subject);
      return count;
    },
    async putPending(id, pending, ttlSeconds) {
      backing.values.set(`pend:${id}`, {
        value: sealer.seal(JSON.stringify(pending), pendingAad(id)),
        expiresAt: now() + ttlSeconds * 1000,
      });
    },
    async takePending(id) {
      const entry = live(`pend:${id}`);
      backing.values.delete(`pend:${id}`);
      return entry ? parse<PendingLogin>(sealer.open(entry.value, pendingAad(id))) : null;
    },
    async acquireLock(id, ttlMs) {
      const held = backing.locks.get(id);
      if (held && held.expiresAt > now()) return null;
      const token = randomUUID();
      backing.locks.set(id, { token, expiresAt: now() + ttlMs });
      return async () => {
        if (backing.locks.get(id)?.token === token) backing.locks.delete(id);
      };
    },
    async close() {},
  };
}

// ---- Redis ----------------------------------------------------------------------------------------------------------------

const RELEASE_LOCK = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/**
 * Redis (the cache Redis, ADR-0019). Every key starts with `prefix`, so several apps and environments can share one server. Records are sealed
 * before they are written, so the server sees only ciphertext. Needs Redis 6.2 or later (GETDEL).
 */
export function createRedisStore(
  sealer: Sealer,
  redisUrl: string,
  prefix = 'web-session',
  now: () => number = Date.now,
): SessionStore {
  const redis = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2, enableOfflineQueue: true });
  const key = (kind: string, id: string) => `${prefix}:${kind}:${id}`;
  const secondsLeft = (record: SessionRecord) => Math.max(1, Math.ceil((record.absoluteExpiresAt - now()) / 1000));

  return {
    async create(id, record) {
      const subject = key('subject', record.subject);
      await redis
        .multi()
        .set(key('sess', id), sealer.seal(JSON.stringify(record), sessionAad(id)), 'EX', secondsLeft(record))
        .sadd(subject, id)
        .expire(subject, secondsLeft(record) + 3600)
        .exec();
    },
    async get(id) {
      const sealed = await redis.get(key('sess', id));
      return sealed === null ? null : parse<SessionRecord>(sealer.open(sealed, sessionAad(id)));
    },
    async save(id, record) {
      // XX: only if it still exists, so a session that was ended meanwhile is not brought back by a late renewal.
      await redis.set(
        key('sess', id),
        sealer.seal(JSON.stringify(record), sessionAad(id)),
        'EX',
        secondsLeft(record),
        'XX',
      );
    },
    async delete(id) {
      const record = await this.get(id);
      const multi = redis.multi().del(key('sess', id));
      if (record) multi.srem(key('subject', record.subject), id);
      await multi.exec();
    },
    async deleteBySubject(subject) {
      const setKey = key('subject', subject);
      const ids = await redis.smembers(setKey);
      let count = 0;
      for (const id of ids) count += await redis.del(key('sess', id));
      await redis.del(setKey);
      return count;
    },
    async putPending(id, pending, ttlSeconds) {
      await redis.set(key('pend', id), sealer.seal(JSON.stringify(pending), pendingAad(id)), 'EX', ttlSeconds);
    },
    async takePending(id) {
      const sealed = await redis.getdel(key('pend', id));
      return sealed === null ? null : parse<PendingLogin>(sealer.open(sealed, pendingAad(id)));
    },
    async acquireLock(id, ttlMs) {
      const token = randomUUID();
      const ok = await redis.set(key('lock', id), token, 'PX', ttlMs, 'NX');
      if (ok !== 'OK') return null;
      return async () => {
        await redis.eval(RELEASE_LOCK, 1, key('lock', id), token);
      };
    },
    async close() {
      redis.disconnect();
    },
  };
}
