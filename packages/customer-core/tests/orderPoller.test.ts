import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import { ORDER_POLL_MS, OrderPoller, isFinalOrderStatus } from '../src/orderPoller.ts';

// The customer's order page polls while the order can still change. A fake clock drives it; nothing here touches a network.

interface Order {
  status: string | null;
}

/** Lets the poller's promises settle (the clock is fake, microtasks and immediates are not). */
const settle = () => new Promise<void>((r) => setImmediate(r));

let reads: number;
let values: Order[];
let failures: number[];
let script: (() => Promise<Order>)[];
let visible: boolean;

const poller = (intervalMs?: number) =>
  new OrderPoller<Order>({
    read: () => {
      reads++;
      return script.shift()?.() ?? Promise.resolve({ status: 'CONFIRMED' });
    },
    statusOf: (o) => o.status,
    onValue: (o) => values.push(o),
    onFailure: (n) => failures.push(n),
    isVisible: () => visible,
    ...(intervalMs ? { intervalMs } : {}),
  });

const ok = (status: string | null) => () => Promise.resolve({ status });
const fail = () => Promise.reject(new Error('network'));

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  reads = 0;
  values = [];
  failures = [];
  script = [];
  visible = true;
});
afterEach(() => mock.timers.reset());

describe('OrderPoller', () => {
  test('reads at once, then every interval while the order can still change', async () => {
    const p = poller();
    p.start();
    await settle();
    assert.equal(reads, 1);

    for (let i = 2; i <= 4; i++) {
      mock.timers.tick(ORDER_POLL_MS);
      await settle();
      assert.equal(reads, i);
    }
    assert.equal(values.length, 4);
    p.stop();
  });

  test('stops for good once the order is completed or cancelled', async () => {
    for (const final of ['COMPLETED', 'CANCELLED']) {
      reads = 0;
      script = [ok('IN_PREPARATION'), ok(final)];
      const p = poller();
      p.start();
      await settle();
      mock.timers.tick(ORDER_POLL_MS);
      await settle();
      assert.equal(reads, 2, final);

      mock.timers.tick(ORDER_POLL_MS * 20);
      await settle();
      assert.equal(reads, 2, `${final}: nothing is read after it is final`);
      p.stop();
    }
  });

  test('an order that does not exist is a final answer too', async () => {
    script = [ok(null)];
    const p = poller();
    p.start();
    await settle();
    mock.timers.tick(ORDER_POLL_MS * 5);
    await settle();
    assert.equal(reads, 1);
  });

  test('a status it does not know is polled on, not treated as final', async () => {
    script = [ok('%future added value')];
    const p = poller();
    p.start();
    await settle();
    mock.timers.tick(ORDER_POLL_MS);
    await settle();
    assert.equal(reads, 2);
    p.stop();
  });

  test('a read that is slow is not doubled by the next tick', async () => {
    let finish: (o: Order) => void = () => {};
    script = [() => new Promise<Order>((r) => (finish = r))];
    const p = poller();
    p.start();
    await settle();
    mock.timers.tick(ORDER_POLL_MS * 3); // no timer is waiting while a read is under way
    await settle();
    assert.equal(reads, 1);

    finish({ status: 'CONFIRMED' });
    await settle();
    mock.timers.tick(ORDER_POLL_MS);
    await settle();
    assert.equal(reads, 2);
    p.stop();
  });

  test('a failed read is reported, keeps polling a little slower each time, and goes back to the normal pace after one that works', async () => {
    script = [fail, fail, fail, fail, fail, ok('CONFIRMED')];
    const p = poller();
    p.start();
    await settle();
    assert.deepEqual(failures, [1]);

    // The waits grow: 2x, 4x, 8x the interval, then stay at 8x (40 s, capped at 30 s).
    for (const [wait, expectedReads] of [
      [ORDER_POLL_MS * 2, 2],
      [ORDER_POLL_MS * 4, 3],
      [30_000, 4],
      [30_000, 5],
    ] as const) {
      mock.timers.tick(wait - 1);
      await settle();
      assert.equal(reads, expectedReads - 1, `not before ${wait} ms`);
      mock.timers.tick(1);
      await settle();
      assert.equal(reads, expectedReads);
    }
    assert.deepEqual(failures, [1, 2, 3, 4, 5]);

    mock.timers.tick(30_000);
    await settle();
    assert.equal(reads, 6);
    assert.equal(values.length, 1);

    mock.timers.tick(ORDER_POLL_MS); // after a good read the pace is normal again
    await settle();
    assert.equal(reads, 7);
    p.stop();
  });

  test('while the page is hidden the timer reads nothing, and the next tick after it is shown reads', async () => {
    const p = poller();
    p.start();
    await settle();
    visible = false;
    for (let i = 0; i < 4; i++) {
      mock.timers.tick(ORDER_POLL_MS);
      await settle();
    }
    assert.equal(reads, 1);

    visible = true;
    mock.timers.tick(ORDER_POLL_MS);
    await settle();
    assert.equal(reads, 2);
    p.stop();
  });

  test('refreshNow reads at once, even while hidden, and is not doubled by a read under way', async () => {
    const p = poller();
    p.start();
    await settle();
    visible = false;

    p.refreshNow();
    await settle();
    assert.equal(reads, 2);

    let finish: (o: Order) => void = () => {};
    script = [() => new Promise<Order>((r) => (finish = r))];
    p.refreshNow();
    p.refreshNow();
    p.refreshNow();
    await settle();
    assert.equal(reads, 3); // three presses, one read
    finish({ status: 'CONFIRMED' });
    await settle();
    p.stop();
  });

  test('refreshNow still reads once after the order is final, and polling does not start again', async () => {
    script = [ok('COMPLETED'), ok('COMPLETED')];
    const p = poller();
    p.start();
    await settle();
    p.refreshNow();
    await settle();
    assert.equal(reads, 2);
    mock.timers.tick(ORDER_POLL_MS * 10);
    await settle();
    assert.equal(reads, 2);
    p.stop();
  });

  test('after stop nothing is read, and the answer of a read still under way is dropped', async () => {
    let finish: (o: Order) => void = () => {};
    script = [() => new Promise<Order>((r) => (finish = r))];
    const p = poller();
    p.start();
    await settle();
    p.stop();
    finish({ status: 'CONFIRMED' });
    await settle();
    assert.deepEqual(values, []);

    mock.timers.tick(ORDER_POLL_MS * 5);
    await settle();
    assert.equal(reads, 1);
    p.refreshNow(); // stopped: no read
    await settle();
    assert.equal(reads, 1);
  });

  test('a custom interval is used', async () => {
    const p = poller(1000);
    p.start();
    await settle();
    mock.timers.tick(1000);
    await settle();
    assert.equal(reads, 2);
    p.stop();
  });
});

describe('isFinalOrderStatus', () => {
  test('only completed and cancelled are final', () => {
    assert.equal(isFinalOrderStatus('COMPLETED'), true);
    assert.equal(isFinalOrderStatus('CANCELLED'), true);
    for (const s of ['PLACED', 'CONFIRMED', 'IN_PREPARATION', 'READY_FOR_FULFILLMENT', 'PENDING', 'MYSTERY', '']) {
      assert.equal(isFinalOrderStatus(s), false, s);
    }
  });
});
