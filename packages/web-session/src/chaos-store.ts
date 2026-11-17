import { createHash } from 'node:crypto';
import type { CallInfo, ChaosRuntime } from '@bakery/chaos';
import { SessionStoreUnavailableError, type SessionStore } from './store.ts';

// Chaos scenarios for the web servers' session store (ADR-0024, layer `session`, WI-CHAOS-004): a decorator over any SessionStore that can wait
// (`latencyMs`), fail during an outage window, or fail at `failureRate`. A failure is the error a store that cannot be reached gives
// (SessionStoreUnavailableError), so the routes answer it as they answer a real outage (register 192, 194). Built only when CHAOS_ENABLED is set and
// the process is allowed to run chaos; otherwise the store is returned as it is.
//
// Session ids and pending-login ids are bearer secrets: neither reaches a key, a journal line or a signal rule. A call is described by a short hash of
// its id, the session's subject where the operation has one, and for a pending login only the page to return to (never its state or verifier).

const LAYER = 'session';

const hashOf = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);

const injected = () =>
  new SessionStoreUnavailableError(new Error('the session store is unavailable (chaos layer session)'));

export function chaosSessionStore(store: SessionStore, runtime: ChaosRuntime | undefined): SessionStore {
  if (!runtime) return store;
  const layer = runtime.layer(LAYER);
  // Wrapped when the layer is in the scenario (even switched off: a signal may turn it on) or when the scenario has signals.
  if (!layer.declared && !runtime.hasSignals) return store;

  async function judge(operation: string, secret: string, about: { customer?: string; payload?: unknown } = {}) {
    const call: CallInfo = {
      client: LAYER,
      operation,
      key: hashOf(secret),
      customer: about.customer,
      payload: about.payload,
    };
    runtime!.signal(call); // a signal changes the state for this call as well as the later ones
    if (!layer.active || !runtime!.appliesTo(LAYER, call)) return;
    await layer.before(operation, call.key, 'failure', 'failureRate', injected);
  }

  return {
    async create(id, record) {
      await judge('create', id, { customer: record.subject });
      return store.create(id, record);
    },
    async get(id) {
      await judge('get', id);
      return store.get(id);
    },
    async save(id, record) {
      await judge('save', id, { customer: record.subject });
      return store.save(id, record);
    },
    async delete(id) {
      await judge('delete', id);
      return store.delete(id);
    },
    async deleteBySubject(subject) {
      await judge('deleteBySubject', subject, { customer: subject });
      return store.deleteBySubject(subject);
    },
    async putPending(id, pending, ttlSeconds) {
      await judge('putPending', id, { payload: { returnTo: pending.returnTo } });
      return store.putPending(id, pending, ttlSeconds);
    },
    async takePending(id) {
      await judge('takePending', id);
      return store.takePending(id);
    },
    async acquireLock(id, ttlMs) {
      await judge('acquireLock', id);
      return store.acquireLock(id, ttlMs); // releasing is not disturbed: a lock that is not released expires by itself
    },
    close: () => store.close(),
  };
}
