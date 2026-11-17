import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ChaosRuntime, parseScenario } from '@bakery/chaos';
import { chaosSessionStore } from '../src/chaos-store.ts';
import type { Sealer } from '../src/crypto.ts';
import { createMemoryStore, newMemoryBacking, SessionStoreUnavailableError, type MemoryBacking } from '../src/store.ts';
import { newSealer } from './helpers.ts';
import { record, runStoreContract, type StoreHandle } from './store-contract.ts';

// ADR-0024, layer `session` (WI-CHAOS-004): the session store's chaos layer. Each test shows what the layer did (the journal) and what the caller got.

const scenario = (layers: object, extra: object = {}) =>
  parseScenario(JSON.stringify({ name: 'session-test', seed: 20261116, layers, ...extra }));

const pending = (returnTo = '/') => ({
  state: 'state-secret',
  verifier: 'verifier-secret',
  returnTo,
  createdAt: Date.now(),
});

function setup(layers: object, extra: object = {}, now?: () => number) {
  const runtime = new ChaosRuntime(scenario(layers, extra), now ? { now } : {});
  const backing = newMemoryBacking();
  const inner = createMemoryStore(newSealer(), Date.now, backing);
  return { runtime, backing, inner, store: chaosSessionStore(inner, runtime) };
}

// With the layer present but every setting at zero, the decorated store is the store: it passes the contract every store passes.
function chaosHandle(sealer: Sealer, backing: MemoryBacking = newMemoryBacking()): StoreHandle {
  const runtime = new ChaosRuntime(scenario({ session: { failureRate: 0 } }));
  return {
    store: chaosSessionStore(createMemoryStore(sealer, Date.now, backing), runtime),
    rawGet: async (id) => backing.values.get(`sess:${id}`)?.value ?? null,
    rawSet: async (id, sealed) => {
      const entry = backing.values.get(`sess:${id}`);
      if (entry) entry.value = sealed;
    },
    withSealer: (other) => chaosHandle(other, backing),
    close: async () => {},
  };
}

runStoreContract('chaos layer over the memory store, no faults', (sealer) => chaosHandle(sealer));

describe('the session chaos layer', () => {
  test('without a runtime, or with a scenario that has neither the layer nor signals, the store is returned untouched', () => {
    const inner = createMemoryStore(newSealer());
    assert.equal(chaosSessionStore(inner, undefined), inner);
    assert.equal(chaosSessionStore(inner, new ChaosRuntime(scenario({ web: { rejectRate: 1 } }))), inner);
  });

  test('at failureRate 1 every operation fails as an unreachable store does, and the store behind it is not touched', async () => {
    const s = setup({ session: { failureRate: 1 } });

    await assert.rejects(s.store.putPending('p1', pending(), 60), SessionStoreUnavailableError);
    await assert.rejects(s.store.create('s1', record()), SessionStoreUnavailableError);
    await assert.rejects(s.store.get('s1'), SessionStoreUnavailableError);
    await assert.rejects(s.store.takePending('p1'), SessionStoreUnavailableError);
    await assert.rejects(s.store.acquireLock('s1', 1000), SessionStoreUnavailableError);

    assert.equal(s.runtime.journal.count('session', 'failure'), 5);
    assert.equal(s.backing.values.size, 0);
  });

  test('a rate between 0 and 1 is decided by the seed: the same calls fail on every run', async () => {
    const run = async () => {
      const s = setup({ session: { failureRate: 0.5 } });
      const outcomes: boolean[] = [];
      for (let i = 0; i < 40; i++)
        outcomes.push(
          await s.store.get(`s${i}`).then(
            () => true,
            () => false,
          ),
        );
      return outcomes;
    };
    const first = await run();
    assert.deepEqual(await run(), first);
    assert.ok(first.includes(true) && first.includes(false), 'some calls fail and some do not');
  });

  test('the outage window fails every call while it is open and none before or after', async () => {
    let clock = 1_000_000;
    const s = setup({ session: { outageFromSeconds: 10, outageWindowSeconds: 20 } }, {}, () => clock);
    await s.store.get('s1');
    clock += 15_000;
    await assert.rejects(s.store.get('s1'), SessionStoreUnavailableError);
    clock += 20_000;
    await s.store.get('s1');
    assert.equal(s.runtime.journal.count('session', 'outage'), 1);
  });

  test('latency waits before the call and is recorded', async () => {
    const s = setup({ session: { latencyMs: 30 } });
    const started = performance.now();
    await s.store.get('s1');
    assert.ok(performance.now() - started >= 25);
    assert.equal(s.runtime.journal.count('session', 'latency'), 1);
  });

  test('a signal on the page a login returns to switches the layer on and off; the switching call itself is judged after the signal', async () => {
    const s = setup(
      { session: { failureRate: 1 } },
      {
        off: ['session'],
        signals: [
          {
            when: { client: 'session', operation: 'putPending', payload: { returnTo: '/chaos/on' } },
            do: 'enable',
            layer: 'session',
          },
          {
            when: { client: 'session', operation: 'putPending', payload: { returnTo: '/chaos/off' } },
            do: 'disable',
            layer: 'session',
          },
        ],
      },
    );

    await s.store.putPending('p1', pending('/orders'), 60); // off: works
    await assert.rejects(s.store.putPending('p2', pending('/chaos/on'), 60), SessionStoreUnavailableError);
    await assert.rejects(s.store.get('s1'), SessionStoreUnavailableError);
    await s.store.putPending('p3', pending('/chaos/off'), 60); // switched off before it is judged
    await s.store.create('s1', record());

    assert.deepEqual(
      s.runtime.journal.entries.map((e) => `${e.layer}:${e.fault}`),
      ['signal:enable:session', 'session:failure', 'session:failure', 'signal:disable:session'],
    );
  });

  test('a scenario can limit the layer to one person (where: customer is the session subject)', async () => {
    const s = setup({ session: { failureRate: 1 } }, { where: { session: [{ customer: 'user-customer-2' }] } });

    await s.store.create('s1', record({ subject: 'user-customer-1' }));
    await assert.rejects(s.store.create('s2', record({ subject: 'user-customer-2' })), SessionStoreUnavailableError);
  });

  test('no session id, pending id, state or verifier reaches the journal', async () => {
    const s = setup({ session: { failureRate: 1, latencyMs: 1 } });
    const ids = ['session-id-secret', 'pending-id-secret'];
    await assert.rejects(s.store.get(ids[0]!));
    await assert.rejects(s.store.putPending(ids[1]!, pending(), 60));

    const written = JSON.stringify(s.runtime.journal.entries);
    for (const secret of [...ids, 'state-secret', 'verifier-secret']) assert.ok(!written.includes(secret), secret);
  });
});
